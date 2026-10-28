import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, IsNull, Repository } from 'typeorm';
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
import { defaultPricingOptions, PricingBracket, PricingOptions, PricingSchedule, PricingSnapshot } from './pricing/pricing.types';
import { resolveDayType } from './pricing/pricing';
import { calculateStayPrice } from './pricing/stay-pricing';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isBetween);

export type TicketSchedule = PricingSchedule & { barcodeTicketsEnabled: boolean; pricingOptions: PricingOptions };

// Las franjas guardadas antes de que existiera recurringPriceMode se calculan como siempre (DERIVED).
export const toPricingBracket = (row: Omit<Partial<TicketPriceBracket>, 'vehicleType'> & Pick<PricingBracket, 'id' | 'vehicleType' | 'label' | 'price'>): PricingBracket => ({
  id: row.id,
  vehicleType: row.vehicleType,
  ticketDayType: row.ticketDayType ?? null,
  label: row.label,
  uptoMinutes: row.uptoMinutes ?? null,
  price: row.price,
  recurringUnitMinutes: row.recurringUnitMinutes ?? null,
  recurringPriceMode: row.recurringPriceMode ?? 'DERIVED',
});

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

  // Devuelve siempre la configuración completa: una fila guardada antes de que existieran la
  // forma de cobro y el cruce de horarios se lee como lista de precios con la hora de salida,
  // que es exactamente como cobraba el garage hasta entonces.
  async getSchedule(manager?: EntityManager): Promise<TicketSchedule> {
    try {
      const repository = manager ? manager.getRepository(TicketScheduleSettings) : this.ticketScheduleSettingsRepository;
      const [latest] = await repository.find({
        order: { updatedAt: 'DESC' },
        take: 1,
      });
      const stored = latest ?? this.defaultTicketSchedule;
      const options = (stored as Partial<TicketScheduleSettings>).pricingOptions;
      const defaults = defaultPricingOptions();
      return {
        dayStartHour: stored.dayStartHour,
        dayEndHour: stored.dayEndHour,
        graceMinutes: stored.graceMinutes ?? 5,
        barcodeTicketsEnabled: stored.barcodeTicketsEnabled ?? true,
        pricingDayTypeBasis: (stored as Partial<TicketScheduleSettings>).pricingDayTypeBasis ?? 'EXIT',
        pricingOptions: {
          charging: options?.charging ?? defaults.charging,
          stay: options?.stay ?? defaults.stay,
          crossing: options?.crossing ?? defaults.crossing,
        },
      };
    } catch (error: any) {
      this.logger.error(error.message, error.stack);
      throw error;
    }
  }

  // Edita una sola fila y conserva lo que el formulario no manda: la forma de cobro y el cruce
  // de horarios se guardan desde el editor de tarifas y no se pueden perder por guardar el horario.
  async updateSchedule(updateTicketScheduleDto: UpdateTicketScheduleDto) {
    try {
      const [stored] = await this.ticketScheduleSettingsRepository.find({ order: { updatedAt: 'DESC' }, take: 1 });
      const schedule = stored
        ? this.ticketScheduleSettingsRepository.merge(stored, updateTicketScheduleDto)
        : this.ticketScheduleSettingsRepository.create(updateTicketScheduleDto);
      return await this.ticketScheduleSettingsRepository.save(schedule);
    } catch (error: any) {
      this.logger.error(error.message, error.stack);
      throw error;
    }
  }

  // Corta el escaneo de entrada si todavía no hay precios para ese tipo de vehículo con la forma
  // de cobro elegida — sin tarifas no hay forma de cobrar la estadía después.
  private async ensureBracketsConfigured(vehicleType: string): Promise<void> {
    const { pricingOptions } = await this.getSchedule();
    const configured = pricingOptions.charging.enabled
      ? pricingOptions.charging.rates.some((rate) => rate.vehicleType === vehicleType)
      : (await this.ticketPriceBracketRepository.count({ where: { vehicleType: vehicleType as any } })) > 0;
    if (!configured) {
      throw new NotFoundException({
        code: 'TICKET_PRICE_BRACKET_NOT_FOUND',
        message: `No hay tarifas configuradas para el tipo de vehículo ${vehicleType}. Pedile al admin que cargue los precios en Tickets → Por tiempo antes de escanear.`,
      });
    }
  }

  // Precio final de una estadía con la configuración vigente: el mismo cálculo que usa el
  // simulador del admin (src/tickets/pricing/stay-pricing.ts). Con lista de precios descompone
  // en cascada por escala (minutos → horas → días) y, si la estadía supera todas las duraciones
  // sin una regla posterior, cobra la última y marca usedFallback (nunca se bloquea la salida);
  // por hora o fracción cobra cada período iniciado, respetando la tolerancia.
  private async resolveExitPrice(
    vehicleType: string,
    entryAt: Date,
    exitAt: Date,
  ): Promise<{ price: number; label: string; usedFallback: boolean; ticketDayType: TicketDayType }> {
    const schedule = await this.getSchedule();
    const brackets = await this.ticketPriceBracketRepository.find({ where: { vehicleType: vehicleType as any } });
    const snapshot: PricingSnapshot = {
      version: 1,
      capturedAt: new Date().toISOString(),
      schedule,
      brackets: brackets.map((row) => toPricingBracket(row)),
    };
    const result = calculateStayPrice(snapshot, vehicleType, entryAt, exitAt);
    if (result.usedFallback) {
      this.logger.warn(
        `Estadía de ${result.elapsedMinutes} min (${vehicleType}) superó todas las duraciones configuradas; se cobró la última. Conviene definir qué cobrar después de la última duración en Tarifas.`,
      );
    }
    const mixed = result.ticketDayType === 'MIXED';
    // Con los tramos separados la estadía no es de día ni de noche: el ticket guarda el horario
    // de la salida, como antes.
    const ticketDayType: TicketDayType = result.ticketDayType === 'MIXED'
      ? resolveDayType(schedule, dayjs(exitAt).tz('America/Argentina/Buenos_Aires').hour())
      : result.ticketDayType;
    const lines = result.breakdown.filter((line) => line.amount !== 0);
    const label = lines.length
      ? lines
          .map((line) => {
            const units = line.units !== undefined ? ` (${Number(line.units.toFixed(2))} × $${line.unitPrice})` : '';
            const day = mixed && line.dayType ? ` · ${line.dayType === 'DAY' ? 'día' : 'noche'}` : '';
            return `${line.label}${units}${day}`;
          })
          .join(' + ')
      : result.label;
    return { price: result.price, label, usedFallback: result.usedFallback, ticketDayType };
  }

  // Solo puede haber una franja "sin límite" por vehículo + horario en el alta/edición suelta de
  // franjas (POST/PATCH priceBrackets). El editor de tarifas (TariffPlanService) valida el plan
  // entero y sí permite una regla general junto con una de día o de noche, que la reemplaza en
  // ese horario.
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
      // Se usa entryDay + entryTime juntos, no solo la hora, para que una estadía que cruza la
      // medianoche o dura varios días se calcule bien. Una entrada con hora "futura" (reloj
      // corrido) se cobra como estadía de 0 minutos en vez de bloquear la salida.
      const exitAt = argentinaTime.isBefore(entryAt) ? entryAt : argentinaTime;
      const { price: finalPrice, label: bracketLabel, usedFallback, ticketDayType } = await this.resolveExitPrice(
        ticket.vehicleType,
        entryAt.toDate(),
        exitAt.toDate(),
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
