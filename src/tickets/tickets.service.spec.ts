import { TicketsService } from './tickets.service';
import { TicketPriceBracket } from './entities/ticket-price-bracket.entity';

// Tests de la escalera de precios de salida: es la lógica que define cuánta plata se
// cobra, y la única parte del servicio que no depende de la base más allá de leer las
// franjas configuradas. Los repositorios van mockeados, así que corre sin Postgres.

type BracketSeed = {
  label: string;
  uptoMinutes: number | null;
  price: number;
  recurringUnitMinutes?: number | null;
};

const bracket = (seed: BracketSeed): TicketPriceBracket =>
  ({
    vehicleType: 'AUTO',
    ticketDayType: null,
    recurringUnitMinutes: null,
    ...seed,
  }) as TicketPriceBracket;

const HASTA_30_MIN = bracket({ label: 'Hasta 30 min', uptoMinutes: 30, price: 1000 });
const HASTA_1_HORA = bracket({ label: 'Hasta 1 hora', uptoMinutes: 60, price: 1500 });
const HASTA_2_HORAS = bracket({ label: 'Hasta 2 horas', uptoMinutes: 120, price: 2800 });
const POR_DIA = bracket({ label: 'Por día', uptoMinutes: null, price: 5000, recurringUnitMinutes: 1440 });

const ESCALERA = [HASTA_30_MIN, HASTA_1_HORA, HASTA_2_HORAS];

const buildService = (brackets: TicketPriceBracket[]): TicketsService => {
  const ticketPriceBracketRepository = { find: jest.fn().mockResolvedValue(brackets) };
  // Sin fila de configuración, getSchedule cae en el default: graceMinutes = 5.
  const ticketScheduleSettingsRepository = { find: jest.fn().mockResolvedValue([]) };

  return new TicketsService(
    null as any,
    null as any,
    null as any,
    null as any,
    ticketPriceBracketRepository as any,
    ticketScheduleSettingsRepository as any,
    null as any,
    null as any,
  );
};

const precioDeSalida = (service: TicketsService, elapsedMinutes: number) =>
  (service as any).resolveExitPrice('AUTO', 'DAY', elapsedMinutes) as Promise<{
    price: number;
    label: string;
    usedFallback: boolean;
  }>;

describe('TicketsService · precio de salida', () => {
  it('cobra la franja que cubre la estadía', async () => {
    const service = buildService(ESCALERA);

    await expect(precioDeSalida(service, 20)).resolves.toMatchObject({
      price: 1000,
      label: 'Hasta 30 min',
      usedFallback: false,
    });
  });

  it('aplica la tolerancia antes de saltar a la franja siguiente', async () => {
    const service = buildService(ESCALERA);

    // 33 min pasa el techo de 30, pero entra dentro de los 5 min de tolerancia.
    await expect(precioDeSalida(service, 33)).resolves.toMatchObject({
      price: 1000,
      label: 'Hasta 30 min',
    });
  });

  it('descompone en cascada en vez de cobrar el techo de la franja que cubre', async () => {
    const service = buildService(ESCALERA);

    // 90 min = 1 hora cumplida ($1500) + 30 min de excedente ($1000).
    // No son los $2800 planos de "Hasta 2 horas".
    await expect(precioDeSalida(service, 90)).resolves.toMatchObject({
      price: 2500,
      label: 'Hasta 1 hora + Hasta 30 min',
      usedFallback: false,
    });
  });

  it('cobra la última franja y marca usedFallback si se pasa de toda la escalera', async () => {
    const service = buildService(ESCALERA);

    // 5 horas sin una franja "sin límite" configurada: no se bloquea la salida,
    // se cobra la franja más alta y se avisa al operador.
    await expect(precioDeSalida(service, 300)).resolves.toMatchObject({
      price: 2800,
      usedFallback: true,
    });
  });

  it('acumula sobre la última franja con techo cuando hay tarifa recurrente', async () => {
    const service = buildService([...ESCALERA, POR_DIA]);

    // 5 horas: $2800 de "Hasta 2 horas" + 1 bloque de día a $5000.
    await expect(precioDeSalida(service, 300)).resolves.toMatchObject({
      price: 7800,
      usedFallback: false,
    });
  });
});
