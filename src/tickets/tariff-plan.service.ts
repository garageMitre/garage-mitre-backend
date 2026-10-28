import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import dayjs from 'dayjs';
import {
  SimulateTariffPlanDto,
  TariffPlanDto,
  UpdateTariffPlanDto,
} from './dto/tariff-plan.dto';
import { TicketPriceBracket } from './entities/ticket-price-bracket.entity';
import { TicketScheduleSettings } from './entities/ticket-schedule-settings.entity';
import { TICKET_TYPE } from './entities/ticket.entity';
import {
  PricingBracket,
  PricingSchedule,
  PricingSnapshot,
} from './pricing/pricing.types';
import { validateBracket } from './pricing/pricing';
import {
  assertPricingCoverage,
  calculateStayPrice,
  validatePricingOptions,
} from './pricing/stay-pricing';
import { TicketsService, toPricingBracket } from './tickets.service';

export interface TariffPlan {
  revision: string;
  schedule: PricingSchedule;
  brackets: PricingBracket[];
}

// El garage tiene un catálogo fijo de vehículos (no se configuran como en otros sistemas), así
// que todos están siempre habilitados y el plan completo tiene que cubrir a los dos.
const VEHICLE_NAMES: Record<(typeof TICKET_TYPE)[number], string> = {
  AUTO: 'Auto',
  CAMIONETA: 'Camioneta',
};

// Mismo número de bloqueo para leer y aplicar: un simulador o una lectura nunca ven un plan a medio guardar.
const TARIFF_LOCK = 718903;

// Ordenar las claves evita conflictos falsos por el orden que utiliza JSONB.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}

const bracketScope = (row: {
  vehicleType: string;
  ticketDayType?: string | null;
  uptoMinutes?: number | null;
}) =>
  `${row.vehicleType}:${row.ticketDayType ?? 'ALL'}:${row.uptoMinutes ?? 'OPEN'}`;

@Injectable()
export class TariffPlanService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tickets: TicketsService,
  ) {}

  // Las reglas de permanencia no se ofrecen: se guardan siempre apagadas, igual que en el editor.
  private scheduleFields(schedule: PricingSchedule): PricingSchedule {
    const options = schedule.pricingOptions!;
    return {
      dayStartHour: schedule.dayStartHour,
      dayEndHour: schedule.dayEndHour,
      graceMinutes: schedule.graceMinutes,
      pricingDayTypeBasis: schedule.pricingDayTypeBasis,
      pricingOptions: {
        charging: {
          ...options.charging,
          rates: options.charging.rates.map((row) => ({ ...row })),
        },
        stay: {
          ...options.stay,
          enabled: false,
          caps: options.stay.caps.map((row) => ({ ...row })),
        },
        crossing: { ...options.crossing },
      },
    };
  }

  private async read(manager: EntityManager) {
    const schedule = this.scheduleFields(
      await this.tickets.getSchedule(manager),
    );
    const rows = await manager
      .getRepository(TicketPriceBracket)
      .find({ order: { id: 'ASC' } });
    const brackets = rows.map((row) => toPricingBracket(row));
    const revision = createHash('sha256')
      .update(JSON.stringify(canonical({ schedule, brackets })))
      .digest('hex');
    return { plan: { revision, schedule, brackets } as TariffPlan, rows };
  }

  getPlan(): Promise<TariffPlan> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock_shared($1)', [
        TARIFF_LOCK,
      ]);
      return (await this.read(manager)).plan;
    });
  }

  private prepare(
    dto: TariffPlanDto,
    current: PricingBracket[],
    complete: boolean,
  ): Omit<TariffPlan, 'revision'> {
    const schedule = this.scheduleFields(dto.schedule);
    if (schedule.dayStartHour === schedule.dayEndHour)
      throw new BadRequestException(
        'El inicio y el fin del horario diurno deben ser diferentes.',
      );
    validatePricingOptions(schedule.pricingOptions!);
    const ids = new Set<string>();
    const brackets = dto.brackets.map((row, index) => {
      if (row.id && ids.has(row.id))
        throw new BadRequestException(
          'Hay franjas con el mismo identificador.',
        );
      if (row.id) ids.add(row.id);
      const previous = row.id
        ? current.find((saved) => saved.id === row.id)
        : current.find((saved) => bracketScope(saved) === bracketScope(row));
      if (complete && row.id && !previous)
        throw new BadRequestException(
          'Una de las franjas ya no existe. Volvé a cargar las tarifas.',
        );
      if (!row.label.trim())
        throw new BadRequestException('Ingresá el nombre de cada duración.');
      return toPricingBracket({
        ...row,
        id: previous?.id ?? row.id ?? `draft-${index}`,
        label: row.label.trim(),
        ticketDayType: row.ticketDayType ?? null,
        uptoMinutes: row.uptoMinutes ?? null,
        recurringUnitMinutes: row.recurringUnitMinutes ?? null,
        recurringPriceMode:
          row.recurringPriceMode ?? previous?.recurringPriceMode ?? 'FIXED',
      });
    });
    // Comprobar por alcance, sin depender del id: un borrador puede contener filas nuevas.
    if (new Set(brackets.map(bracketScope)).size !== brackets.length)
      throw new BadRequestException({
        code: 'DUPLICATE_PRICE_BRACKET',
        message: 'Hay duraciones repetidas para el mismo vehículo y horario.',
      });
    if (new Set(brackets.map((row) => row.id)).size !== brackets.length)
      throw new BadRequestException('Hay franjas con el mismo identificador.');
    for (const row of brackets) validateBracket(row, brackets);
    if (complete) {
      const snapshot: PricingSnapshot = {
        version: 1,
        capturedAt: new Date().toISOString(),
        schedule,
        brackets,
      };
      for (const vehicle of TICKET_TYPE) {
        for (const dayType of ['DAY', 'NIGHT'] as const) {
          try {
            assertPricingCoverage(snapshot, vehicle, dayType);
          } catch {
            throw new BadRequestException({
              code: 'TARIFF_PLAN_INCOMPLETE',
              message: `Completá el precio de ${VEHICLE_NAMES[vehicle]} para el horario ${dayType === 'DAY' ? 'diurno' : 'nocturno'} antes de aplicar las tarifas.`,
            });
          }
        }
      }
    }
    return { schedule, brackets };
  }

  // Aplica el plan entero en una transacción: o quedan todos los precios nuevos o ninguno. El
  // garage no congela la tarifa al ingresar, así que los tickets que ya están adentro se cobran
  // con estos precios al salir.
  updatePlan(dto: UpdateTariffPlanDto): Promise<TariffPlan> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [TARIFF_LOCK]);
      const { plan: current, rows } = await this.read(manager);
      if (dto.expectedRevision !== current.revision)
        throw new ConflictException({
          code: 'TARIFF_PLAN_CHANGED',
          message:
            'Las tarifas cambiaron desde que abriste el borrador. Volvé a cargar la configuración antes de aplicar.',
        });
      const plan = this.prepare(dto, current.brackets, true);
      const bracketRepo = manager.getRepository(TicketPriceBracket);
      const retained = new Set(plan.brackets.map((row) => row.id));
      const removed = rows.filter((row) => !retained.has(row.id));
      if (removed.length) await bracketRepo.remove(removed);
      for (const bracket of plan.brackets) {
        const previous = rows.find((row) => row.id === bracket.id);
        const { id: _id, ...fields } = bracket;
        // Conservar los ids permite seguir usando enlaces y editores existentes.
        await bracketRepo.save(
          bracketRepo.create({
            ...previous,
            ...fields,
          } as Partial<TicketPriceBracket>),
        );
      }
      const scheduleRepo = manager.getRepository(TicketScheduleSettings);
      const [stored] = await scheduleRepo.find({
        order: { updatedAt: 'DESC' },
        take: 1,
      });
      // Sólo se escriben campos tarifarios; el resto de la configuración conserva su estado.
      await scheduleRepo.save(
        scheduleRepo.create({ ...stored, ...plan.schedule }),
      );
      return (await this.read(manager)).plan;
    });
  }

  simulate(dto: SimulateTariffPlanDto) {
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock_shared($1)', [
        TARIFF_LOCK,
      ]);
      const { plan: current } = await this.read(manager);
      // Se puede probar un vehículo terminado aunque falten precios del otro.
      const plan = dto.plan
        ? this.prepare(dto.plan, current.brackets, false)
        : current;
      const snapshot: PricingSnapshot = {
        version: 1,
        capturedAt: new Date().toISOString(),
        schedule: plan.schedule,
        brackets: plan.brackets,
      };
      const entry = dayjs(dto.entryAt);
      return calculateStayPrice(
        snapshot,
        dto.vehicleType,
        entry.toDate(),
        entry.add(dto.elapsedMinutes, 'minute').toDate(),
      );
    });
  }
}
