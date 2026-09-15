import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Ticket } from './entities/ticket.entity';
import { TicketRegistration } from './entities/ticket-registration.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ScannerService } from '../scanner/scanner.service';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { format } from 'date-fns';
import { BoxListsService } from 'src/box-lists/box-lists.service';
import { CreateTicketRegistrationDto } from './dto/create-ticket-registration.dto';
import { BoxList } from 'src/box-lists/entities/box-list.entity';
import { TicketGateway } from './register-gateway';
import { UpdateTicketRegistrationDto } from './dto/update-ticket-registration.dto';
import { FilterOperator, paginate, Paginated, PaginateQuery } from 'nestjs-paginate';
import { CreateTicketRegistrationForDayDto, UpdateTicketStatusDto } from './dto/create-ticket-registration-for-day.dto';
import { TicketRegistrationForDay } from './entities/ticket-registration-for-day.entity';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isBetween from 'dayjs/plugin/isBetween'; 
import { TicketPrice } from './entities/ticket-price.entity';
import { CreateTicketPriceDto } from './dto/create-ticket-price.dto';
import { UpdateTicketPriceDto } from './dto/update-ticket-price.dto';
import { TicketDayType } from './entities/ticket.entity';
import { TicketPriceBracket } from './entities/ticket-price-bracket.entity';
import { TicketScheduleSettings } from './entities/ticket-schedule-settings.entity';
import { CreateTicketPriceBracketDto } from './dto/create-ticket-price-bracket.dto';
import { UpdateTicketPriceBracketDto } from './dto/update-ticket-price-bracket.dto';
import { UpdateTicketScheduleDto } from './dto/update-ticket-schedule.dto';
import { AddAdvancePaymentDto } from './dto/add-advance-payment.dto';
import { SetPaymentMethodDto } from './dto/set-payment-method.dto';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isBetween);

// Escala de una franja según su "hasta" en minutos — se infiere del número (no hace falta
// guardar la unidad aparte): múltiplo de 1440 = días, múltiplo de 60 = horas, el resto minutos.
// Coincide con el criterio que ya usa el frontend (minutesToAmountUnit) para clasificar franjas.
type PriceBracketTier = 'MIN' | 'HOUR' | 'DAY';
const PRICE_BRACKET_TIER_RANK: Record<PriceBracketTier, number> = { MIN: 0, HOUR: 1, DAY: 2 };

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    @InjectRepository(TicketPrice)
    private readonly ticketPriceRepository: Repository<TicketPrice>,
    @InjectRepository(TicketRegistration)
    private readonly ticketRegistrationRepository: Repository<TicketRegistration>,
    @InjectRepository(TicketRegistrationForDay)
    private readonly ticketRegistrationForDayRepository: Repository<TicketRegistrationForDay>,
    @InjectRepository(TicketPriceBracket)
    private readonly ticketPriceBracketRepository: Repository<TicketPriceBracket>,
    @InjectRepository(TicketScheduleSettings)
    private readonly ticketScheduleSettingsRepository: Repository<TicketScheduleSettings>,
    private readonly boxListsService: BoxListsService,
    private readonly ticketGateway: TicketGateway,
  ) {}

  private readonly defaultTicketSchedule = { dayStartHour: 8, dayEndHour: 20, graceMinutes: 5, barcodeTicketsEnabled: true };

  async getSchedule(): Promise<{ dayStartHour: number; dayEndHour: number; graceMinutes: number; barcodeTicketsEnabled: boolean }> {
    try {
      const [latest] = await this.ticketScheduleSettingsRepository.find({
        order: { updatedAt: 'DESC' },
        take: 1,
      });
      return latest ?? this.defaultTicketSchedule;
    } catch (error: any) {
      this.logger.error(error.message, error.stack);
      throw error;
    }
  }

  async updateSchedule(updateTicketScheduleDto: UpdateTicketScheduleDto) {
    try {
      await this.ticketScheduleSettingsRepository.clear();
      const schedule = this.ticketScheduleSettingsRepository.create(updateTicketScheduleDto);
      return await this.ticketScheduleSettingsRepository.save(schedule);
    } catch (error: any) {
      this.logger.error(error.message, error.stack);
      throw error;
    }
  }

  private resolveTicketDayType(
    schedule: { dayStartHour: number; dayEndHour: number },
    hour: number,
  ): TicketDayType {
    const { dayStartHour, dayEndHour } = schedule;
    const isDay =
      dayStartHour < dayEndHour
        ? hour >= dayStartHour && hour < dayEndHour
        : hour >= dayStartHour || hour < dayEndHour;
    return isDay ? 'DAY' : 'NIGHT';
  }

  private async resolveCurrentTicketDayType(): Promise<TicketDayType> {
    const schedule = await this.getSchedule();
    const currentHour = dayjs().tz('America/Argentina/Buenos_Aires').hour();
    return this.resolveTicketDayType(schedule, currentHour);
  }

  // Corta el escaneo (entrada o salida) si todavía no hay ninguna franja de precio cargada
  // para ese tipo de vehículo — sin tarifas no hay forma de cobrar la estadía después.
  private async ensureBracketsConfigured(vehicleType: string): Promise<void> {
    const count = await this.ticketPriceBracketRepository.count({ where: { vehicleType: vehicleType as any } });
    if (count === 0) {
      throw new NotFoundException({
        code: 'TICKET_PRICE_BRACKET_NOT_FOUND',
        message: `No hay tarifas configuradas para el tipo de vehículo ${vehicleType}. Pedile al admin que cargue al menos una franja de precio en Tarifas antes de escanear.`,
      });
    }
  }

  private classifyBracketTier(uptoMinutes: number): PriceBracketTier {
    if (uptoMinutes >= 1440 && uptoMinutes % 1440 === 0) return 'DAY';
    if (uptoMinutes >= 60 && uptoMinutes % 60 === 0) return 'HOUR';
    return 'MIN';
  }

  // Resuelve el precio final de una estadía según el tiempo transcurrido, en cascada por escala
  // (minutos → horas → días, según qué franjas haya configuradas). Al superar toda la escalera de
  // minutos, en vez de saltar directo al precio pleno de la franja de horas que "cubre" el total,
  // se cobra la última franja de horas ya completada más el resultado de re-aplicar la escalera de
  // minutos sobre el excedente — y así de nuevo al pasar de horas a días. Si el tiempo transcurrido
  // cae justo en el techo de una franja (dentro de la tolerancia), se cobra esa franja de forma
  // plana sin descomponer. Si solo hay franjas de una escala (ej. solo por días), el comportamiento
  // es el de siempre: no hay nada más chico en qué descomponer. Si el tiempo transcurrido supera
  // todas las franjas configuradas, se cobra la más alta (nunca se bloquea la salida) y se marca
  // usedFallback para advertir al operador y quedar en el log.
  private async resolveExitPrice(
    vehicleType: string,
    ticketDayType: TicketDayType,
    elapsedMinutes: number,
  ): Promise<{ price: number; label: string; usedFallback: boolean }> {
    const brackets = await this.ticketPriceBracketRepository.find({
      where: [
        { vehicleType: vehicleType as any, ticketDayType: ticketDayType as any },
        { vehicleType: vehicleType as any, ticketDayType: IsNull() },
      ],
    });

    if (brackets.length === 0) {
      throw new NotFoundException({
        code: 'TICKET_PRICE_BRACKET_NOT_FOUND',
        message: `No hay tarifas configuradas para el tipo de vehículo ${vehicleType}. Pedile al admin que cargue al menos una franja de precio en Tarifas antes de registrar salidas.`,
      });
    }

    const finite = brackets
      .filter((b) => b.uptoMinutes !== null)
      .sort((a, b) => a.uptoMinutes! - b.uptoMinutes!);
    const openEnded = brackets.find((b) => b.uptoMinutes === null) ?? null;

    const schedule = await this.getSchedule();
    const graceMinutes = schedule.graceMinutes ?? 5;

    if (finite.length === 0) {
      // Solo existe la franja "sin límite" — no hay escalera previa, se cobra directo (sin cambios).
      return { ...this.priceBracketAmount(openEnded!, elapsedMinutes, null, finite), usedFallback: false };
    }

    const lastBracket = finite[finite.length - 1];

    let previous: TicketPriceBracket | null = null;
    for (const bracket of finite) {
      // La tolerancia solo tiene sentido como gracia antes de saltar a la franja SIGUIENTE.
      // La última franja con techo no tiene una franja siguiente a la que "no saltar todavía"
      // (salvo que haya una franja sin límite después), así que ahí no se aplica: pasarse de su
      // "hasta", aunque sea por poco, ya cuenta como estadía sin cobertura y dispara el aviso.
      const isLastWithCeiling = bracket === lastBracket && !openEnded;
      const threshold = isLastWithCeiling ? bracket.uptoMinutes! : bracket.uptoMinutes! + graceMinutes;
      if (elapsedMinutes <= threshold) {
        const resolved = this.resolveBracketOrCascade(bracket, previous, elapsedMinutes, graceMinutes, finite);
        return { ...resolved, usedFallback: false };
      }
      previous = bracket;
    }

    this.logger.warn(
      `Estadía de ${elapsedMinutes} min (${vehicleType}/${ticketDayType}) superó todas las franjas configuradas; se cobró la última ("${lastBracket.label}"). Conviene dejar la última franja de Tarifas sin "hasta".`,
    );
    if (openEnded) {
      return { ...this.priceBracketAmount(openEnded, elapsedMinutes, previous, finite), usedFallback: false };
    }
    return { price: lastBracket.price, label: lastBracket.label, usedFallback: true };
  }

  // Dentro de la franja que "cubre" el tiempo transcurrido (`covering`), decide si cobrarla de
  // forma plana o si hay que descomponer en cascada: si el tiempo transcurrido está bien por
  // debajo de su techo (más allá de la tolerancia) pero ya superó una franja anterior de una
  // escala más chica (ej. superó "Hasta 1 hora" pero no llega a "Hasta 2 horas"), se cobra esa
  // franja anterior más el resultado de re-aplicar la escalera de la escala más chica sobre el
  // excedente, en vez de cobrar el precio pleno de `covering`.
  private resolveBracketOrCascade(
    covering: TicketPriceBracket,
    previous: TicketPriceBracket | null,
    elapsedMinutes: number,
    graceMinutes: number,
    allFinite: TicketPriceBracket[],
  ): { price: number; label: string } {
    const gapToCeiling = Math.abs(covering.uptoMinutes! - elapsedMinutes);
    if (previous === null || gapToCeiling <= graceMinutes) {
      return { price: covering.price, label: covering.label };
    }

    const previousTier = this.classifyBracketTier(previous.uptoMinutes!);
    const smaller = allFinite.filter(
      (b) => PRICE_BRACKET_TIER_RANK[this.classifyBracketTier(b.uptoMinutes!)] < PRICE_BRACKET_TIER_RANK[previousTier],
    );
    if (smaller.length === 0) {
      // No hay una escala más chica configurada en qué descomponer el excedente (ej. la franja
      // anterior ya era de minutos) — se mantiene el comportamiento de siempre.
      return { price: covering.price, label: covering.label };
    }

    const remainder = elapsedMinutes - previous.uptoMinutes!;
    const sub = this.resolveLadderSubset(smaller, remainder, graceMinutes);
    if (sub === null) {
      // El excedente no entra ni con tolerancia en la escala más chica (ej. quedan 45 min por
      // cobrar y la escalera de minutos solo llega a 30) — la cascada no alcanza a cubrirlo, así
      // que se cobra directo el techo de `covering` en vez de quedar congelado en la franja
      // anterior + el último escalón chico (que subcobraría cuanto más se acerque al próximo techo).
      return { price: covering.price, label: covering.label };
    }
    return { price: previous.price + sub.price, label: `${previous.label} + ${sub.label}` };
  }

  // Igual que el ciclo principal de resolveExitPrice pero acotado a un subconjunto de franjas de
  // una escala más chica — se usa para el excedente al escalar de minutos a horas, o de horas a
  // días. Si el excedente supera incluso esta escalera más chica (ni con tolerancia), devuelve
  // null para que el llamador sepa que la cascada no alcanza y tiene que cobrar el techo de arriba.
  private resolveLadderSubset(
    brackets: TicketPriceBracket[],
    elapsedMinutes: number,
    graceMinutes: number,
  ): { price: number; label: string } | null {
    const sorted = [...brackets].sort((a, b) => a.uptoMinutes! - b.uptoMinutes!);
    let previous: TicketPriceBracket | null = null;
    for (const bracket of sorted) {
      const threshold = bracket.uptoMinutes! + graceMinutes;
      if (elapsedMinutes <= threshold) {
        return this.resolveBracketOrCascade(bracket, previous, elapsedMinutes, graceMinutes, sorted);
      }
      previous = bracket;
    }
    return null;
  }

  // Precio por bloque de una franja recurrente. En orden:
  // 1) Coincidencia exacta: el "cada X" coincide con el "hasta" de otra franja ya cargada -> se
  //    usa el precio de ESA franja tal cual (ej. "cada 1 hora" = "hasta 1 hora").
  // 2) Si no hay coincidencia exacta, se deriva proporcionalmente de la franja más chica de una
  //    escala más GRANDE que haya cargada (ej. "cada 1 minuto" sin una franja "hasta 1 min" toma
  //    el precio de "hasta 1 hora" dividido por 60) — nunca de una escala más chica, no tendría
  //    sentido calcular un precio por hora en base a una franja de minutos.
  // 3) Si no hay ninguna franja de una escala más grande cargada, se usa el precio propio que se
  //    cargó a mano en esta franja (comportamiento de siempre) — nunca se bloquea el cobro.
  private resolveRecurringUnitPrice(recurringUnitMinutes: number, finite: TicketPriceBracket[]): number | null {
    const exact = finite.find((b) => b.uptoMinutes === recurringUnitMinutes);
    if (exact) return exact.price;

    const tier = this.classifyBracketTier(recurringUnitMinutes);
    const biggerTiers: PriceBracketTier[] = tier === 'MIN' ? ['HOUR', 'DAY'] : tier === 'HOUR' ? ['DAY'] : [];

    for (const biggerTier of biggerTiers) {
      const anchor = finite
        .filter((b) => this.classifyBracketTier(b.uptoMinutes!) === biggerTier)
        .sort((a, b) => a.uptoMinutes! - b.uptoMinutes!)[0];
      if (anchor) {
        return Math.round((anchor.price / anchor.uptoMinutes!) * recurringUnitMinutes);
      }
    }

    return null;
  }

  // Si la franja es de tarifa recurrente (sin límite + recurringUnitMinutes seteado), el precio
  // es ACUMULATIVO: se cobra el precio de la última franja con techo (si hay una antes) más un
  // monto por cada bloque de recurringUnitMinutes que pasó DESDE ese punto en adelante — no se
  // recalcula el tiempo total desde cero. Si no hay franja anterior, cuenta desde el minuto 0.
  // Sin recurringUnitMinutes, es un monto fijo único como cualquier franja.
  private priceBracketAmount(
    bracket: TicketPriceBracket,
    elapsedMinutes: number,
    previous: TicketPriceBracket | null,
    finite: TicketPriceBracket[] = [],
  ): { price: number; label: string } {
    if (bracket.uptoMinutes !== null || !bracket.recurringUnitMinutes) {
      return { price: bracket.price, label: bracket.label };
    }
    const unitPrice = this.resolveRecurringUnitPrice(bracket.recurringUnitMinutes, finite) ?? bracket.price;

    const baseMinutes = previous?.uptoMinutes ?? 0;
    const basePrice = previous?.price ?? 0;
    const overageMinutes = Math.max(0, elapsedMinutes - baseMinutes);
    const units = Math.max(1, Math.ceil(overageMinutes / bracket.recurringUnitMinutes));
    const total = basePrice + unitPrice * units;
    const label = previous
      ? `${bracket.label} ($${basePrice} + ${units} × $${unitPrice})`
      : `${bracket.label} (${units} × $${unitPrice})`;
    return { price: total, label };
  }

  // Solo puede haber una franja "sin límite" por vehículo + horario — resolveExitPrice usa la
  // PRIMERA que encuentra (`brackets.find`), así que una segunda quedaría cargada sin que se
  // use nunca para cobrar. Un horario "cualquiera" (ticketDayType null) cubre día y noche, así
  // que también choca con una franja específica de esa combinación.
  private async findOpenEndedBracketConflict(
    vehicleType: string,
    ticketDayType: string | null,
    ignoreId?: string,
  ): Promise<TicketPriceBracket | null> {
    const existing = await this.ticketPriceBracketRepository.find({
      where: { vehicleType: vehicleType as any, uptoMinutes: IsNull() },
    });
    return (
      existing.find(
        (b) => b.id !== ignoreId && (b.ticketDayType === null || ticketDayType === null || b.ticketDayType === ticketDayType),
      ) ?? null
    );
  }

  async createPriceBracket(createTicketPriceBracketDto: CreateTicketPriceBracketDto) {
    try {
      if (createTicketPriceBracketDto.uptoMinutes == null) {
        const conflict = await this.findOpenEndedBracketConflict(
          createTicketPriceBracketDto.vehicleType,
          createTicketPriceBracketDto.ticketDayType ?? null,
        );
        if (conflict) {
          throw new BadRequestException({
            code: 'OPEN_ENDED_BRACKET_ALREADY_EXISTS',
            message: `Ya existe una franja "sin límite" para ${createTicketPriceBracketDto.vehicleType} ("${conflict.label}") — solo puede haber una por vehículo y horario.`,
          });
        }
      }
      const bracket = this.ticketPriceBracketRepository.create(createTicketPriceBracketDto);
      return await this.ticketPriceBracketRepository.save(bracket);
    } catch (error: any) {
      if (!(error instanceof BadRequestException)) {
        this.logger.error(error.message, error.stack);
      }
      throw error;
    }
  }

  async findAllPriceBrackets(vehicleType?: string) {
    try {
      return await this.ticketPriceBracketRepository.find({
        where: vehicleType ? { vehicleType: vehicleType as any } : {},
        order: { vehicleType: 'ASC', uptoMinutes: 'ASC' },
      });
    } catch (error: any) {
      this.logger.error(error.message, error.stack);
      throw error;
    }
  }

  async updatePriceBracket(id: string, updateTicketPriceBracketDto: UpdateTicketPriceBracketDto) {
    try {
      const bracket = await this.ticketPriceBracketRepository.findOne({ where: { id } });
      if (!bracket) {
        throw new NotFoundException('Franja de precio no encontrada');
      }
      const updated = this.ticketPriceBracketRepository.merge(bracket, updateTicketPriceBracketDto);
      if (updated.uptoMinutes == null) {
        const conflict = await this.findOpenEndedBracketConflict(updated.vehicleType, updated.ticketDayType ?? null, id);
        if (conflict) {
          throw new BadRequestException({
            code: 'OPEN_ENDED_BRACKET_ALREADY_EXISTS',
            message: `Ya existe una franja "sin límite" para ${updated.vehicleType} ("${conflict.label}") — solo puede haber una por vehículo y horario.`,
          });
        }
      }
      return await this.ticketPriceBracketRepository.save(updated);
    } catch (error: any) {
      if (!(error instanceof NotFoundException) && !(error instanceof BadRequestException)) {
        this.logger.error(error.message, error.stack);
      }
      throw error;
    }
  }

  async removePriceBracket(id: string) {
    try {
      const bracket = await this.ticketPriceBracketRepository.findOne({ where: { id } });
      if (!bracket) {
        throw new NotFoundException('Franja de precio no encontrada');
      }
      await this.ticketPriceBracketRepository.remove(bracket);
      return { message: 'Franja de precio eliminada correctamente' };
    } catch (error: any) {
      if (!(error instanceof NotFoundException)) {
        this.logger.error(error.message, error.stack);
      }
      throw error;
    }
  }

  async createTicketPrice(createTicketPriceDto: CreateTicketPriceDto) {
    try {

      if(createTicketPriceDto.vehicleType && createTicketPriceDto.ticketDayType){
        const type = await this.ticketPriceRepository.findOne({where:{vehicleType:createTicketPriceDto.vehicleType, ticketTimeType: IsNull()}})
        if(type && type.ticketDayType === createTicketPriceDto.ticketDayType){
          throw new NotFoundException({
            code: 'TICKET_PRICE_TYPE_FOUND',
            message: `Ya existe un precio ticket con el tipo de vehiculo ${createTicketPriceDto.vehicleType}`,
          });
        }
      }else if(createTicketPriceDto.ticketTimeType){
        const ticketTime = await this.ticketPriceRepository.find({
            where: {
              ticketTimeType: createTicketPriceDto.ticketTimeType,
              vehicleType: createTicketPriceDto.vehicleType,
            },
          });
        if(ticketTime.length > 0){
          throw new NotFoundException({
            code: 'TICKET_TIME_PRICE_TYPE_FOUND',
            message: `Ya existe un precio para el tipo de ticket ${createTicketPriceDto.ticketTimeType} con el tipo ${createTicketPriceDto.vehicleType}`,
          });
        }
      }
      const ticketPrice = this.ticketPriceRepository.create(createTicketPriceDto);

      const savedTicket = await this.ticketPriceRepository.save(ticketPrice);

      return savedTicket;
    } catch (error: any) {
      this.logger.error(error.message, error.stack);
      throw error;
    }
  }

  async findAllTicketPrice(query: PaginateQuery): Promise<Paginated<TicketPrice>> {
    try {
      return await paginate(query, this.ticketPriceRepository, {
        sortableColumns: ['id'],
        nullSort: 'last',
        searchableColumns: ['vehicleType', 'ticketTimeType'],
        filterableColumns: {
          vehicleType: [FilterOperator.EQ, FilterOperator.ILIKE],
          ticketTimeType: [FilterOperator.EQ, FilterOperator.ILIKE],
        },
      });
    } catch (error: any) {
      this.logger.error(error.message, error.stack);
    }
  }

async updateTicketPrice(id: string, updateTicketPriceDto: UpdateTicketPriceDto) {
  try{
    const ticketPrice = await this.ticketPriceRepository.findOne({where:{id:id}})
    if(updateTicketPriceDto.vehicleType && updateTicketPriceDto.ticketTimeType === null){
      const type = await this.ticketPriceRepository.find({where:{vehicleType:updateTicketPriceDto.vehicleType}})
      if(type && ticketPrice.vehicleType !== updateTicketPriceDto.vehicleType){
        throw new NotFoundException({
          code: 'TICKET_PRICE_TYPE_FOUND',
          message: `Ya existe un precio ticket con el tipo de vehiculo ${updateTicketPriceDto.vehicleType}`,
        });
      }
    } else if(updateTicketPriceDto.ticketTimeType){
        const ticketTime = await this.ticketPriceRepository.find({
            where: {
              ticketTimeType: updateTicketPriceDto.ticketTimeType,
              vehicleType: updateTicketPriceDto.vehicleType,
            },
          });
        if(ticketTime && ticketPrice.ticketTimeType !== updateTicketPriceDto.ticketTimeType){
          throw new NotFoundException({
            code: 'TICKET_TIME_PRICE_TYPE_FOUND',
            message: `Ya existe un precio para el tipo de ticket ${updateTicketPriceDto.ticketTimeType} con el tipo ${updateTicketPriceDto.vehicleType}`,
          });
        }
    }

    if(!ticketPrice){
      throw new NotFoundException('Ticket Price not found')
    }

    const tickets = await this.ticketRepository.find({where:{vehicleType:updateTicketPriceDto.vehicleType, ticketDayType: updateTicketPriceDto.ticketDayType}});

    for(const ticket of tickets){
      ticket.price = updateTicketPriceDto.price;
      await this.ticketRepository.save(ticket);
    }
   
    const updateTicket = this.ticketPriceRepository.merge(ticketPrice, updateTicketPriceDto);

    const savedTicket = await this.ticketPriceRepository.save(updateTicket); 

    return savedTicket;
  } catch (error: any) {
      if (!(error instanceof NotFoundException)) {
        this.logger.error(error.message, error.stack);
      }
      throw error;
    }
}

async removeTicketPrice(id: string) {
  try{
    const ticket = await this.ticketPriceRepository.findOne({where:{id:id}})

    if(!ticket){
      throw new NotFoundException('Ticket Price not found')
    }

    await this.ticketPriceRepository.remove(ticket);

    return {message: 'Ticket Price removed successfully'}
  } catch (error: any) {
    if (!(error instanceof NotFoundException)) {
      this.logger.error(error.message, error.stack);
    }
    throw error;
  }
}


  async create(createTicketDto: CreateTicketDto) {
    try {
      const ticket = this.ticketRepository.create(createTicketDto);
      const savedTicket = await this.ticketRepository.save(ticket);

      return savedTicket;
    } catch (error: any) {
      this.logger.error(error.message, error.stack);
    }
  }

    async findAll(query: PaginateQuery): Promise<Paginated<Ticket>> {
      try {
        return await paginate(query, this.ticketRepository, {
          sortableColumns: ['id'],
          nullSort: 'last',
          searchableColumns: ['codeBar', 'vehicleType'],
          filterableColumns: {
            codeBar: [FilterOperator.ILIKE, FilterOperator.EQ],
            vehicleType: [FilterOperator.EQ, FilterOperator.ILIKE],
          },
        });
      } catch (error: any) {
        this.logger.error(error.message, error.stack);
      }
    }

  async update(id: string, updateTicketDto: UpdateTicketDto) {
    try{
      const ticket = await this.ticketRepository.findOne({where:{id:id}})

      if(!ticket){
        throw new NotFoundException('Ticket not found')
      }
      
      const updateTicket = this.ticketRepository.merge(ticket, updateTicketDto);

      const savedTicket = await this.ticketRepository.save(updateTicket);

      return savedTicket;
    } catch (error: any) {
        if (!(error instanceof NotFoundException)) {
          this.logger.error(error.message, error.stack);
        }
        throw error;
      }
  }

  async remove(id: string) {
    try{
      const ticket = await this.ticketRepository.findOne({where:{id:id}})

      if(!ticket){
        throw new NotFoundException('Ticket list not found')
      }

      await this.ticketRepository.remove(ticket);

      return {message: 'Ticket list removed successfully'}
    } catch (error: any) {
      if (!(error instanceof NotFoundException)) {
        this.logger.error(error.message, error.stack);
      }
      throw error;
    }
  }

  async findTicketByCode (codeBar: string){
    const ticket = await this.ticketRepository.findOne({ where: { codeBar:codeBar } });
    if (!ticket) {
        this.logger.warn(`No se encontró un ticket con el código de barras: ${codeBar}`);
        return null;
    }
    return ticket;
  }

  async createRegistration(ticketId?: string) {
    try {

        const ticket = await this.ticketRepository.findOne({ where: { id: ticketId } });

        if (!ticket) {
            this.logger.warn(`No se encontró un ticket con ID: ${ticketId}`);
            return null;
        }

        await this.ensureBracketsConfigured(ticket.vehicleType);

        const existingRegistration = await this.ticketRegistrationRepository.findOne({
            where: { ticket: { id: ticketId } },
            relations: ['ticket'],
        });


        if (!existingRegistration) {
            const argentinaTime = (dayjs().tz('America/Argentina/Buenos_Aires') as dayjs.Dayjs);
  
            const createTicketRegistrationDto: CreateTicketRegistrationDto = {
                description: `Registro de ticket para vehículo tipo ${ticket.vehicleType}`,
                price: 0,
                entryDay: argentinaTime.format('YYYY-MM-DD'),
                entryTime: argentinaTime.format('HH:mm:ss'),
                departureDay: null,
                departureTime: null,
                dateNow: null
            };

            const newRegistration = this.ticketRegistrationRepository.create({
                ...createTicketRegistrationDto,
                ticket,
            });

            const savedTicket = await this.ticketRegistrationRepository.save(newRegistration);
            this.ticketGateway.emitNewRegistration(savedTicket);
            return savedTicket;
        } else {
          const argentinaTime = dayjs().tz('America/Argentina/Buenos_Aires').startOf('day');
          const now = argentinaTime.format('YYYY-MM-DD')
            return await this.updateRegistration(existingRegistration, now, ticket);
        }
    } catch (error: any) {
        if (!(error instanceof NotFoundException) && !(error instanceof BadRequestException)) {
          this.logger.error(error.message, error.stack);
        }
        throw error;
    }
}

// Nombre en español de cada tipo de duración — se usa tanto en la descripción del ticket como
// en el mensaje de error cuando falta cargar la tarifa correspondiente en Tarifas.
private readonly ticketTimeTypeLabel: Record<string, string> = {
  DIA: 'día/s',
  SEMANA: 'semana/s',
  MES: 'mes/es',
  SEMANA_Y_DIA: 'semana/s y día/s',
  MES_Y_DIA: 'mes/es y día/s',
};

// Busca la tarifa por día/semana/mes cargada en Tarifas para ese tipo y vehículo — si no está
// configurada, corta el alta con un error que nombra exactamente cuál falta (día, semana o
// mes), en vez de dejar pasar un precio en $0 o uno de los dos términos de una franja combinada.
private async getTicketTimePriceOrThrow(
  ticketTimeType: 'DIA' | 'SEMANA' | 'MES',
  vehicleType: string,
) {
  const ticketPrice = await this.ticketPriceRepository.findOne({
    where: { ticketTimeType: ticketTimeType as any, vehicleType: vehicleType as any },
  });
  if (!ticketPrice) {
    throw new NotFoundException({
      code: 'TICKET_PRICE_NOT_FOUND',
      message: `No hay una tarifa por ${this.ticketTimeTypeLabel[ticketTimeType]} configurada para ${vehicleType}. Pedile al admin que la cargue en Tarifas antes de registrar este ticket.`,
    });
  }
  return ticketPrice;
}

async createRegistrationForDay(createTicketRegistrationForDayDto: CreateTicketRegistrationForDayDto) {
  try {
    const { ticketTimeType, vehicleType, days, weeks, months } = createTicketRegistrationForDayDto;
    const ticket = this.ticketRegistrationForDayRepository.create(createTicketRegistrationForDayDto);

    let time = '';
    if (ticketTimeType === 'DIA') {
      time = `${days} día/s`;
    } else if (ticketTimeType === 'SEMANA') {
      time = `${weeks} semana/s`;
    } else if (ticketTimeType === 'MES') {
      time = `${months} mes/es`;
    } else if (ticketTimeType === 'SEMANA_Y_DIA') {
      time = `${weeks} semana/s y ${days} día/s`;
    } else if (ticketTimeType === 'MES_Y_DIA') {
      time = `${months} mes/es y ${days} día/s`;
    }

    ticket.description = `Tipo: ${vehicleType}, ${this.ticketTimeTypeLabel[ticketTimeType]}, Tiempo: ${time}`;

    const argentinaTime = dayjs().tz('America/Argentina/Buenos_Aires').startOf('day');
    const now = argentinaTime.format('YYYY-MM-DD');
    ticket.dateNow = now;

    if (ticketTimeType === 'DIA' || ticketTimeType === 'SEMANA' || ticketTimeType === 'MES') {
      const ticketPrice = await this.getTicketTimePriceOrThrow(ticketTimeType, vehicleType);
      const qty = ticketTimeType === 'DIA' ? days : ticketTimeType === 'MES' ? months : weeks;
      ticket.price = ticketPrice.ticketTimePrice * qty;
    } else if (ticketTimeType === 'SEMANA_Y_DIA') {
      const semanaPrice = await this.getTicketTimePriceOrThrow('SEMANA', vehicleType);
      const diaPrice = await this.getTicketTimePriceOrThrow('DIA', vehicleType);
      ticket.price = semanaPrice.ticketTimePrice * (weeks ?? 0) + diaPrice.ticketTimePrice * (days ?? 0);
    } else if (ticketTimeType === 'MES_Y_DIA') {
      const mesPrice = await this.getTicketTimePriceOrThrow('MES', vehicleType);
      const diaPrice = await this.getTicketTimePriceOrThrow('DIA', vehicleType);
      ticket.price = mesPrice.ticketTimePrice * (months ?? 0) + diaPrice.ticketTimePrice * (days ?? 0);
    }

      let boxList = await this.boxListsService.findBoxByDate(now);
  
      if (!boxList) {
          boxList = await this.boxListsService.createBox({
              date: now,
              totalPrice: createTicketRegistrationForDayDto.paid ? ticket.price : 0
          });
      } else {
          boxList.totalPrice = createTicketRegistrationForDayDto.paid ?  ticket.price + boxList.totalPrice : boxList.totalPrice
  
          await this.boxListsService.updateBox(boxList.id, {
              totalPrice: boxList.totalPrice,
          });
      }
  
      ticket.boxList = { id: boxList.id } as BoxList;
      
    const savedTicket = await this.ticketRegistrationForDayRepository.save(ticket);
    return savedTicket;
  } catch (error: any) {
      if (!(error instanceof NotFoundException)) {
        this.logger.error(error.message, error.stack);
      }
      throw error;
  }
}

    async findAllRegistrationForDay() {
      try {
        const ticketsDays = await this.ticketRegistrationForDayRepository.find({ relations: ['boxList'] })
        return ticketsDays;
      } catch (error: any) {
        this.logger.error(error.message, error.stack);
      }
    }

 async updateTicketStatus(id: string, dto: UpdateTicketStatusDto) {
    const ticket = await this.ticketRegistrationForDayRepository.findOne({where:{id:id}});

    if (!ticket) {
      throw new NotFoundException('Ticket no encontrado');
    }

    // Solo se toca la caja cuando `paid` REALMENTE cambia — antes esto corría en cada llamada
    // (ej. al tocar "retirado" sin tocar el pago), restando el precio de la caja de hoy sobre
    // un ticket que ya estaba pagado desde hace rato.
    if (dto.paid !== undefined && dto.paid !== ticket.paid) {
      const argentinaTime = dayjs().tz('America/Argentina/Buenos_Aires').startOf('day');
      const now = argentinaTime.format('YYYY-MM-DD');

      if (!dto.paid) {
        const boxList = await this.boxListsService.findBoxByDate(now);
        if (boxList) {
          boxList.totalPrice -= ticket.price;
          await this.boxListsService.updateBox(boxList.id, { totalPrice: boxList.totalPrice });
        }
        ticket.boxList = null;
      } else {
        let boxList = await this.boxListsService.findBoxByDate(now);
        if (!boxList) {
          boxList = await this.boxListsService.createBox({ date: now, totalPrice: ticket.price });
        } else {
          boxList.totalPrice += ticket.price;
          await this.boxListsService.updateBox(boxList.id, { totalPrice: boxList.totalPrice });
        }
        ticket.boxList = { id: boxList.id } as BoxList;
      }
    }

    if (dto.paid !== undefined) {
      ticket.paid = dto.paid;
    }

    if (dto.retired !== undefined) {
      ticket.retired = dto.retired;
    }

    if (dto.paymentMetodo !== undefined) {
      ticket.paymentMetodo = dto.paymentMetodo;
    }

    return this.ticketRegistrationForDayRepository.save(ticket);
  }

  // Limpieza masiva del panel "Día/Sem/Mes": solo marca `retired` (los saca de la lista de
  // ocupación), nunca toca `paid` / la caja — eso es una acción separada e independiente.
  async retireRegistrationsForDay(ids: string[]) {
    if (!ids || ids.length === 0) {
      return { affected: 0 };
    }
    const result = await this.ticketRegistrationForDayRepository.update(
      { id: In(ids) },
      { retired: true },
    );
    return { affected: result.affected ?? 0 };
  }

    async removeRegistrationForDay(id: string) {
    try{
      const ticket = await this.ticketRegistrationForDayRepository.findOne({where:{id:id}})
      let boxList = await this.boxListsService.findBoxByDate(ticket.dateNow);
  
      if (!boxList) {
        throw new NotFoundException('Box list not found');
      }
      if(ticket.paid === true){
        boxList.totalPrice -= ticket.price;
        await this.boxListsService.updateBox(boxList.id, {
          totalPrice: boxList.totalPrice,
        });
      }



      if(!ticket){
        throw new NotFoundException('Ticket list not found')
      }

      await this.ticketRegistrationForDayRepository.remove(ticket);

      return {message: 'Ticket list removed successfully'}
    } catch (error: any) {
      if (!(error instanceof NotFoundException)) {
        this.logger.error(error.message, error.stack);
      }
      throw error;
    }
  }




async updateRegistration(existingRegistration: TicketRegistration, formattedDay: string, ticket: Ticket) {
    try {

      const entryAt = dayjs.tz(
        `${existingRegistration.entryDay} ${existingRegistration.entryTime}`,
        'YYYY-MM-DD HH:mm:ss',
        'America/Argentina/Buenos_Aires',
      );

      if (!entryAt.isValid()) {
        throw new BadRequestException('Invalid entryDay/entryTime');
      }

      const argentinaTime = dayjs().tz('America/Argentina/Buenos_Aires');
      // Minutos desde la entrada (usa entryDay + entryTime juntos, no solo la hora, para que
      // una estadía que cruza la medianoche o dura varios días se calcule bien).
      const minutesPassed = argentinaTime.diff(entryAt, 'minute');

      const ticketDayType = await this.resolveCurrentTicketDayType();
      const { price: finalPrice, label: bracketLabel, usedFallback } = await this.resolveExitPrice(
        ticket.vehicleType,
        ticketDayType,
        minutesPassed,
      );

      // Si ya se cobró un anticipo sobre esta entrada, a caja solo entra la diferencia
      // pendiente — el anticipo ya se sumó a caja cuando se cobró (addAdvancePayment).
      const amountDue = Math.max(0, finalPrice - (existingRegistration.advancePaidAmount ?? 0));

      ticket.price = finalPrice;
      ticket.ticketDayType = ticketDayType;

        const updateTicketRegistrationDto: UpdateTicketRegistrationDto = {
            description: `Tipo: ${existingRegistration.ticket.vehicleType}, Ent: ${existingRegistration.entryTime}, Sal: ${argentinaTime.format('HH:mm:ss')}, Franja: ${bracketLabel}${usedFallback ? ' (fuera de rango configurado)' : ''}`,
            price: finalPrice,
            codeBarTicket: ticket.codeBar,
            entryDay: existingRegistration.entryDay,
            entryTime: existingRegistration.entryTime,
            departureDay: argentinaTime.format('YYYY-MM-DD'),
            departureTime: argentinaTime.format('HH:mm:ss'),
            dateNow: formattedDay
        };

        const updatedRegistration = this.ticketRegistrationRepository.create({
            ...existingRegistration,
            ...updateTicketRegistrationDto,
            ticket,
        });

        const savedTicket = await this.ticketRegistrationRepository.save(updatedRegistration);

        const boxListDate = formattedDay;
        let boxList = await this.boxListsService.findBoxByDate(boxListDate);

        if (!boxList) {
            boxList = await this.boxListsService.createBox({
                date: boxListDate,
                totalPrice: amountDue
            });
        } else {
            boxList.totalPrice += amountDue;

            await this.boxListsService.updateBox(boxList.id, {
                totalPrice: boxList.totalPrice,
            });
        }

        savedTicket.boxList = { id: boxList.id } as BoxList;
        savedTicket.ticket = null;
        await this.ticketRegistrationRepository.save(savedTicket);
        this.ticketGateway.emitNewRegistration(savedTicket);

        return savedTicket;
    } catch (error: any) {
        if (!(error instanceof NotFoundException) && !(error instanceof BadRequestException)) {
          this.logger.error(error.message, error.stack);
        }
        throw error;
    }
}

// Cobra un anticipo sobre una entrada activa. Es de carga única: una vez cargado un monto no
// se puede volver a llamar (el monto no se puede modificar después), para que no queden dudas
// de cuánto se cobró realmente en efectivo/transferencia.
async addAdvancePayment(id: string, dto: AddAdvancePaymentDto) {
  try {
    const registration = await this.ticketRegistrationRepository.findOne({ where: { id } });

    if (!registration) {
      throw new NotFoundException('Registro no encontrado');
    }

    if (registration.departureTime) {
      throw new BadRequestException('Solo se puede cobrar un anticipo sobre una entrada activa, sin salida registrada.');
    }

    if (registration.advancePaidAmount != null) {
      throw new BadRequestException('El anticipo ya fue cargado y no se puede modificar.');
    }

    if (dto.advancePaidAmount > 0 && !dto.metodo) {
      throw new BadRequestException('Indicá el método de pago del anticipo (efectivo o transferencia).');
    }

    registration.advancePaidAmount = dto.advancePaidAmount;
    if (dto.metodo) {
      registration.advancePaymentMetodo = dto.metodo;
    }
    if (dto.expectedBracketLabel !== undefined) registration.expectedBracketLabel = dto.expectedBracketLabel;
    if (dto.expectedUptoMinutes !== undefined) registration.expectedUptoMinutes = dto.expectedUptoMinutes;

    if (dto.advancePaidAmount > 0) {
      const boxListDate = dayjs().tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD');
      let boxList = await this.boxListsService.findBoxByDate(boxListDate);
      if (!boxList) {
        boxList = await this.boxListsService.createBox({ date: boxListDate, totalPrice: dto.advancePaidAmount });
      } else {
        boxList.totalPrice += dto.advancePaidAmount;
        await this.boxListsService.updateBox(boxList.id, { totalPrice: boxList.totalPrice });
      }
      registration.dateNow = boxListDate;
      registration.boxList = { id: boxList.id } as BoxList;
    }

    const savedRegistration = await this.ticketRegistrationRepository.save(registration);
    this.ticketGateway.emitNewRegistration(savedRegistration);
    return savedRegistration;
  } catch (error: any) {
    if (!(error instanceof NotFoundException) && !(error instanceof BadRequestException)) {
      this.logger.error(error.message, error.stack);
    }
    throw error;
  }
}

// Registra cómo se pagó el monto final al cerrar un ticket (independiente del anticipo) — se
// muestra como un diálogo de botones grandes justo después de escanear la salida.
async setPaymentMethod(id: string, dto: SetPaymentMethodDto) {
  try {
    const registration = await this.ticketRegistrationRepository.findOne({ where: { id } });

    if (!registration) {
      throw new NotFoundException('Registro no encontrado');
    }

    if (!registration.departureTime) {
      throw new BadRequestException('Este ticket todavía no tiene una salida registrada.');
    }

    registration.paymentMetodo = dto.metodo;
    const savedRegistration = await this.ticketRegistrationRepository.save(registration);
    this.ticketGateway.emitNewRegistration(savedRegistration);
    return savedRegistration;
  } catch (error: any) {
    if (!(error instanceof NotFoundException) && !(error instanceof BadRequestException)) {
      this.logger.error(error.message, error.stack);
    }
    throw error;
  }
}


  async findAllRegistrations() {
    try{
        const registrations = await this.ticketRegistrationRepository.find({
            relations: ['ticket', 'boxList'],
            order: { createdAt: 'DESC' },
          });

        return registrations;
    } catch (error: any) {
        this.logger.error(error.message, error.stack);
    }
  }

  async findOneRegistration(id: string) {
    try{
        const registration = await this.ticketRegistrationRepository.findOne({where:{id:id}})
        if(!registration){
            throw new NotFoundException('Registration not found')
        }
        return registration;
    } catch (error: any) {
        if (!(error instanceof NotFoundException)) {
          this.logger.error(error.message, error.stack);
        }
        throw error;
      }
  }

  // Actividad por hora de un día puntual — cada entrada y cada salida suma 1 a la hora en la
  // que ocurrió, para poder graficar los picos de movimiento (mañana/tarde) del día.
  async getHourlyActivity(date?: string) {
    try {
      const targetDate = date ?? dayjs().tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD');

      // TO_CHAR fuerza que entryDay/departureDay vuelvan como texto plano ('YYYY-MM-DD') — en
      // una query raw, columnas `date` de Postgres vuelven como objeto Date de JS, no string, y
      // comparar ese objeto contra targetDate con === nunca daba true.
      const rows = await this.ticketRegistrationRepository
        .createQueryBuilder('reg')
        .select(`TO_CHAR(reg."entryDay", 'YYYY-MM-DD')`, 'entryDay')
        .addSelect('reg.entryTime', 'entryTime')
        .addSelect(`TO_CHAR(reg."departureDay", 'YYYY-MM-DD')`, 'departureDay')
        .addSelect('reg.departureTime', 'departureTime')
        .where('reg.entryDay = :date OR reg.departureDay = :date', { date: targetDate })
        .getRawMany();

      const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, entries: 0, exits: 0, count: 0 }));

      // El gráfico agrupa por hora para que la curva quede legible, pero el pico tiene que
      // mostrar el minuto real del evento (ej. 19:14), no la hora redondeada.
      let peakEntry: { hour: number; count: number; time: string } | null = null;
      let peakExit: { hour: number; count: number; time: string } | null = null;

      for (const r of rows) {
        if (r.entryDay === targetDate && r.entryTime) {
          const h = Number(String(r.entryTime).slice(0, 2));
          if (h >= 0 && h < 24) {
            hours[h].entries += 1;
            hours[h].count += 1;
            if (!peakEntry || hours[h].entries > peakEntry.count) {
              peakEntry = { hour: h, count: hours[h].entries, time: String(r.entryTime) };
            }
          }
        }
        if (r.departureDay === targetDate && r.departureTime) {
          const h = Number(String(r.departureTime).slice(0, 2));
          if (h >= 0 && h < 24) {
            hours[h].exits += 1;
            hours[h].count += 1;
            if (!peakExit || hours[h].exits > peakExit.count) {
              peakExit = { hour: h, count: hours[h].exits, time: String(r.departureTime) };
            }
          }
        }
      }

      return { date: targetDate, hours, peakEntry, peakExit };
    } catch (error: any) {
      this.logger.error(error.message, error.stack);
      throw error;
    }
  }
}
