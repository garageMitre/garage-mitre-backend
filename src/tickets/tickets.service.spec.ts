import { TicketsService } from './tickets.service';
import { TicketPriceBracket } from './entities/ticket-price-bracket.entity';
import { TicketScheduleSettings } from './entities/ticket-schedule-settings.entity';
import { defaultPricingOptions } from './pricing/pricing.types';

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

const HASTA_30_MIN = bracket({
  label: 'Hasta 30 min',
  uptoMinutes: 30,
  price: 1000,
});
const HASTA_1_HORA = bracket({
  label: 'Hasta 1 hora',
  uptoMinutes: 60,
  price: 1500,
});
const HASTA_2_HORAS = bracket({
  label: 'Hasta 2 horas',
  uptoMinutes: 120,
  price: 2800,
});
const POR_DIA = bracket({
  label: 'Por día',
  uptoMinutes: null,
  price: 5000,
  recurringUnitMinutes: 1440,
});

const ESCALERA = [HASTA_30_MIN, HASTA_1_HORA, HASTA_2_HORAS];

const buildService = (
  brackets: TicketPriceBracket[],
  scheduleRows: Partial<TicketScheduleSettings>[] = [],
): TicketsService => {
  const ticketPriceBracketRepository = {
    find: jest.fn().mockResolvedValue(brackets),
    count: jest.fn().mockResolvedValue(brackets.length),
  };
  // Sin fila de configuración, getSchedule cae en el default: graceMinutes = 5 y lista de precios.
  const ticketScheduleSettingsRepository = {
    find: jest.fn().mockResolvedValue(scheduleRows),
  };

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

// Mediodía en Argentina: horario diurno con la configuración por defecto (8 a 20).
const ENTRADA = new Date('2026-01-05T12:00:00-03:00');

const precioDeSalida = (service: TicketsService, elapsedMinutes: number) =>
  (service as any).resolveExitPrice(
    'AUTO',
    ENTRADA,
    new Date(ENTRADA.getTime() + elapsedMinutes * 60000),
  ) as Promise<{
    price: number;
    label: string;
    usedFallback: boolean;
    ticketDayType: 'DAY' | 'NIGHT';
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

  it('no deja cobrar si no hay ninguna franja configurada', async () => {
    const service = buildService([]);

    // Es preferible frenar la salida con un mensaje claro al operador antes
    // que cobrar $0 en silencio.
    await expect(precioDeSalida(service, 45)).rejects.toMatchObject({
      response: { code: 'TICKET_PRICE_BRACKET_NOT_FOUND' },
    });
  });

  it('cobra por bloques desde cero si la única franja es la recurrente', async () => {
    const service = buildService([POR_DIA]);

    // Sin escalera previa no hay sobre qué acumular, así que se cuenta desde
    // el minuto 0: 1500 min = 2 bloques de día (1440 c/u) = $10000.
    await expect(precioDeSalida(service, 1500)).resolves.toMatchObject({
      price: 10000,
    });
  });
});

describe('TicketsService · precio de la unidad recurrente', () => {
  const recurrente = (unidadMinutos: number) =>
    bracket({
      label: 'Adicional',
      uptoMinutes: null,
      price: 999,
      recurringUnitMinutes: unidadMinutos,
    });

  it('usa el precio tal cual si la unidad coincide con el techo de otra franja', async () => {
    // "cada 1 hora" con una franja "hasta 1 hora" de $1500: 3 h = $1500 + 2 × $1500.
    const service = buildService([HASTA_1_HORA, recurrente(60)]);

    await expect(precioDeSalida(service, 180)).resolves.toMatchObject({
      price: 4500,
    });
  });

  it('deriva el precio en proporción a una franja de escala mayor', async () => {
    // "cada 1 minuto" sin franja de 1 min: toma "hasta 1 hora" ($1500 / 60 = $25).
    // 70 min = $1500 + 10 × $25.
    const service = buildService([HASTA_1_HORA, recurrente(1)]);

    await expect(precioDeSalida(service, 70)).resolves.toMatchObject({
      price: 1750,
    });
  });

  it('usa el precio cargado si es FIXED, aunque haya una franja equivalente', async () => {
    const service = buildService([
      HASTA_1_HORA,
      { ...recurrente(60), recurringPriceMode: 'FIXED' } as TicketPriceBracket,
    ]);

    await expect(precioDeSalida(service, 180)).resolves.toMatchObject({
      price: 1500 + 2 * 999,
    });
  });
});

describe('TicketsService · cobro por hora o fracción', () => {
  const porFraccion = (
    rates: { vehicleType: string; dayPrice: number; nightPrice: number }[],
  ) => [
    {
      dayStartHour: 8,
      dayEndHour: 20,
      graceMinutes: 5,
      pricingDayTypeBasis: 'EXIT' as const,
      pricingOptions: {
        ...defaultPricingOptions(),
        charging: {
          enabled: true,
          mode: 'STARTED' as const,
          unitMinutes: 60,
          rates,
        },
      },
    },
  ];

  it('cobra cada período iniciado, después de la tolerancia', async () => {
    // Las franjas cargadas se ignoran: manda la forma de cobro elegida.
    const service = buildService(
      ESCALERA,
      porFraccion([{ vehicleType: 'AUTO', dayPrice: 1000, nightPrice: 1400 }]),
    );

    await expect(precioDeSalida(service, 64)).resolves.toMatchObject({
      price: 1000,
    });
    await expect(precioDeSalida(service, 66)).resolves.toMatchObject({
      price: 2000,
      ticketDayType: 'DAY',
    });
  });

  it('usa el precio de noche según la hora de salida', async () => {
    const service = buildService(
      [],
      porFraccion([{ vehicleType: 'AUTO', dayPrice: 1000, nightPrice: 1400 }]),
    );

    // Entra 12:00, sale 21:00: toda la estadía al precio de noche (9 períodos).
    await expect(precioDeSalida(service, 540)).resolves.toMatchObject({
      price: 9 * 1400,
      ticketDayType: 'NIGHT',
    });
  });

  it('frena el ingreso si el vehículo no tiene precio por período', async () => {
    const service = buildService(
      ESCALERA,
      porFraccion([
        { vehicleType: 'CAMIONETA', dayPrice: 1000, nightPrice: 1000 },
      ]),
    );

    await expect(
      (service as any).ensureBracketsConfigured('AUTO'),
    ).rejects.toMatchObject({
      response: { code: 'TICKET_PRICE_BRACKET_NOT_FOUND' },
    });
    await expect(
      (service as any).ensureBracketsConfigured('CAMIONETA'),
    ).resolves.toBeUndefined();
  });
});
