import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import * as isBetween from 'dayjs/plugin/isBetween'; 
import { TicketPrice } from './entities/ticket-price.entity';
import { CreateTicketPriceDto } from './dto/create-ticket-price.dto';
import { UpdateTicketPriceDto } from './dto/update-ticket-price.dto';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isBetween);
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
    private readonly boxListsService: BoxListsService,
    private readonly ticketGateway: TicketGateway,
  ) {}

  async createTicketPrice(createTicketPriceDto: CreateTicketPriceDto) {
    try {
      if(createTicketPriceDto.vehicleType){
        const type = await this.ticketPriceRepository.find({where:{vehicleType:createTicketPriceDto.vehicleType}})
        if(type.length > 0){
          throw new NotFoundException({
            code: 'TICKET_PRICE_TYPE_FOUND',
            message: `Ya existe un precio ticket con el tipo de vehiculo ${createTicketPriceDto.vehicleType}`,
          });
        }
      }else if(createTicketPriceDto.ticketTimeType){
        const ticketTime = await this.ticketPriceRepository.find({where:{ticketTimeType:createTicketPriceDto.ticketTimeType}})
        console.log(ticketTime)
        if(ticketTime.length > 0){
          throw new NotFoundException({
            code: 'TICKET_TIME_PRICE_TYPE_FOUND',
            message: `Ya existe un precio para el tipo de ticket ${createTicketPriceDto.ticketTimeType}`,
          });
        }
      }
      const ticketPrice = this.ticketPriceRepository.create(createTicketPriceDto);

      const savedTicket = await this.ticketPriceRepository.save(ticketPrice);

      return savedTicket;
    } catch (error) {
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
    } catch (error) {
      this.logger.error(error.message, error.stack);
    }
  }

async updateTicketPrice(id: string, updateTicketPriceDto: UpdateTicketPriceDto) {
  try{
    const ticketPrice = await this.ticketPriceRepository.findOne({where:{id:id}})
    if(updateTicketPriceDto.vehicleType){
      const type = await this.ticketPriceRepository.find({where:{vehicleType:updateTicketPriceDto.vehicleType}})
      if(type && ticketPrice.vehicleType !== updateTicketPriceDto.vehicleType){
        throw new NotFoundException({
          code: 'TICKET_PRICE_TYPE_FOUND',
          message: `Ya existe un precio ticket con el tipo de vehiculo ${updateTicketPriceDto.vehicleType}`,
        });
      }
    } else if(updateTicketPriceDto.ticketTimeType){
        const ticketTime = await this.ticketPriceRepository.find({where:{ticketTimeType:updateTicketPriceDto.ticketTimeType}})
        if(ticketTime && ticketPrice.ticketTimeType !== updateTicketPriceDto.ticketTimeType){
          throw new NotFoundException({
            code: 'TICKET_TIME_PRICE_TYPE_FOUND',
            message: `Ya existe un precio para el tipo de ticket ${updateTicketPriceDto.ticketTimeType}`,
          });
        }
    }

    if(!ticketPrice){
      throw new NotFoundException('Ticket Price not found')
    }

    const tickets = await this.ticketRepository.find({where:{vehicleType:updateTicketPriceDto.vehicleType}});
    console.log(tickets)

    for(const ticket of tickets){
      ticket.dayPrice = updateTicketPriceDto.dayPrice;
      ticket.nightPrice = updateTicketPriceDto.nightPrice;
      await this.ticketRepository.save(ticket);
    }
   
    const updateTicket = this.ticketPriceRepository.merge(ticketPrice, updateTicketPriceDto);

    const savedTicket = await this.ticketPriceRepository.save(updateTicket); 

    return savedTicket;
  } catch (error) {
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
  } catch (error) {
    if (!(error instanceof NotFoundException)) {
      this.logger.error(error.message, error.stack);
    }
    throw error;
  }
}


  async create(createTicketDto: CreateTicketDto) {
    try {
      const ticket = this.ticketRepository.create(createTicketDto);
      const ticketPrice = await this.ticketPriceRepository.findOne({where:{vehicleType:createTicketDto.vehicleType}})
      if(!ticketPrice){
        throw new NotFoundException({
          code: 'TICKET_PRICE_NOT_FOUND',
          message: `Precio ticket con el tipo ${createTicketDto.vehicleType} no existe, porfavor pedi al admin que lo cree.`,
        });
      }
      ticket.dayPrice = ticketPrice.dayPrice;
      ticket.nightPrice = ticketPrice.nightPrice;
      const savedTicket = await this.ticketRepository.save(ticket);

      return savedTicket;
    } catch (error) {
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
      } catch (error) {
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

      const ticketPrice = await this.ticketPriceRepository.findOne({where:{vehicleType:updateTicketDto.vehicleType}})
      if(!ticketPrice){
        throw new NotFoundException({
          code: 'TICKET_PRICE_NOT_FOUND',
          message: `Precio ticket con el tipo ${updateTicketDto.vehicleType} no existe, porfavor pedi al admin que lo cree.`,
        });
      }
      updateTicket.dayPrice = ticketPrice.dayPrice;
      updateTicket.nightPrice = ticketPrice.nightPrice;

      const savedTicket = await this.ticketRepository.save(updateTicket); 

      return savedTicket;
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
        this.logger.error(error.message, error.stack);
    }
}

async createRegistrationForDay(createTicketRegistrationForDayDto: CreateTicketRegistrationForDayDto) {
  try {
    const ticket = this.ticketRegistrationForDayRepository.create(createTicketRegistrationForDayDto);

    let time = '';

    if (createTicketRegistrationForDayDto.ticketTimeType === 'DIA') {
      time = `${createTicketRegistrationForDayDto.days} día/s`;
    } else if (createTicketRegistrationForDayDto.ticketTimeType === 'SEMANA') {
      time = `${createTicketRegistrationForDayDto.weeks} semana/s`;
    } else if (createTicketRegistrationForDayDto.ticketTimeType === 'SEMANA_Y_DIA') {
      time = `${createTicketRegistrationForDayDto.weeks} semana/s y ${createTicketRegistrationForDayDto.days} día/s`;
    }

    ticket.description = `Tipo: ${
      createTicketRegistrationForDayDto.ticketTimeType === 'DIA'
        ? 'Día/s'
        : createTicketRegistrationForDayDto.ticketTimeType === 'SEMANA'
        ? 'Semana/s'
        : 'Semana/s y Día/s'
    }, Tiempo: ${time}`;


    const argentinaTime = dayjs().tz('America/Argentina/Buenos_Aires').startOf('day');
    const now = argentinaTime.format('YYYY-MM-DD')
    ticket.dateNow = now;

    if(createTicketRegistrationForDayDto.ticketTimeType !== 'SEMANA_Y_DIA'){
      const ticketPrice = await this.ticketPriceRepository.findOne({where:{ticketTimeType:createTicketRegistrationForDayDto.ticketTimeType}})
      if(!ticketPrice){
        throw new NotFoundException({
          code: 'TICKET_PRICE_NOT_FOUND',
          message: `Precio ticket con el tipo ${createTicketRegistrationForDayDto.ticketTimeType} no existe, porfavor pedi al admin que lo cree.`,
        });
      }
      const type = createTicketRegistrationForDayDto.ticketTimeType === 'DIA' ? createTicketRegistrationForDayDto.days : createTicketRegistrationForDayDto.weeks
      ticket.price = ticketPrice.ticketTimePrice * type;
    }else{
      const ticketPrices = await this.ticketPriceRepository.find({
        where: {
          ticketTimeType: In(['DIA', 'SEMANA']),
        },
      });

      if(ticketPrices.length < 1){
        throw new NotFoundException({
          code: 'TICKET_PRICE_NOT_FOUND',
          message: `Precio ticket con el tipo DIA o SEMANA no existe, porfavor pedi al admin que lo cree.`,
        });
      }
      ticket.price = 0;
      for(const price of ticketPrices){
        if(price.ticketTimeType === 'DIA'){
          ticket.price = ticket.price + price.ticketTimePrice * createTicketRegistrationForDayDto.days || 0;
        }else{
          ticket.price = ticket.price + price.ticketTimePrice * createTicketRegistrationForDayDto.weeks || 0;
        }
      }
    }


    let boxList = await this.boxListsService.findBoxByDate(now);

    if (!boxList) {
        boxList = await this.boxListsService.createBox({
            date: now,
            totalPrice: ticket.price
        });
    } else {
        boxList.totalPrice += ticket.price;

        await this.boxListsService.updateBox(boxList.id, {
            totalPrice: boxList.totalPrice,
        });
    }

    ticket.boxList = { id: boxList.id } as BoxList;
    const savedTicket = await this.ticketRegistrationForDayRepository.save(ticket);
    return savedTicket;
  } catch (error) {
      this.logger.error(error.message, error.stack);
  }
}

    async findAllRegistrationForDay(query: PaginateQuery): Promise<Paginated<TicketRegistrationForDay>> {
      try {
        return await paginate(query, this.ticketRegistrationForDayRepository, {
          sortableColumns: ['id'],
          nullSort: 'last',
          searchableColumns: ['firstNameCustomer', 'lastNameCustomer'],
          filterableColumns: {
            firstNameCustomer: [FilterOperator.ILIKE, FilterOperator.EQ],
            lastNameCustomer: [FilterOperator.EQ, FilterOperator.ILIKE],
          },
        });
      } catch (error) {
        this.logger.error(error.message, error.stack);
      }
    }

 async updateTicketStatus(id: string, dto: UpdateTicketStatusDto) {
    const ticket = await this.ticketRegistrationForDayRepository.findOne({where:{id:id}});

    if (!ticket) {
      throw new NotFoundException('Ticket no encontrado');
    }

    if (dto.paid !== undefined) {
      ticket.paid = dto.paid;
    }

    if (dto.retired !== undefined) {
      ticket.retired = dto.retired;
    }

    return this.ticketRegistrationForDayRepository.save(ticket);
  }



async updateRegistration(existingRegistration: TicketRegistration, formattedDay: string, ticket: Ticket) {
    try {

      const argentinaTime = dayjs().tz('America/Argentina/Buenos_Aires');
      const [hours, minutes, seconds] = existingRegistration.entryTime.split(':').map(Number);

      const createdAt = argentinaTime.clone().set('hour', hours).set('minute', minutes).set('second', seconds);

      if (!createdAt.isValid()) {
        throw new BadRequestException('Invalid entryTime format');
      }
      // Minutos desde la creación
      const minutesPassed = argentinaTime.diff(createdAt, 'minute');
      
      if (minutesPassed < 5) {
        ticket.price = 0;
      } else {
        const isDaytime = argentinaTime.isBetween(
          dayjs(argentinaTime).startOf('day').hour(6),
          dayjs(argentinaTime).startOf('day').hour(19),
          null,
          '[)'
        );
      
        const basePrice = isDaytime ? ticket.dayPrice : ticket.nightPrice;
      
        // Tarifa por bloques de 1h con tolerancia de 5 min
        const blockDuration = 60; // 1 hora
        const tolerance = 5;
        const totalAllowed = blockDuration + tolerance;
      
        let multiplier = 1;
      
        if (minutesPassed > totalAllowed) {
          // Restamos la primera hora con tolerancia, y luego calculamos los bloques
          const extraMinutes = minutesPassed - totalAllowed;
          const extraBlocks = Math.floor(extraMinutes / blockDuration) + 1;
          multiplier += extraBlocks;
        }
      
        ticket.price = basePrice;
      }
      
      await this.ticketRepository.save(ticket);

        const updateTicketRegistrationDto: UpdateTicketRegistrationDto = {
            description: `Tipo: ${existingRegistration.ticket.vehicleType}, Ent: ${existingRegistration.entryTime}, Sal: ${argentinaTime.format('HH:mm:ss')}`,
            price: ticket.price ,
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
                totalPrice: ticket.price
            });
        } else {
            boxList.totalPrice += ticket.price;

            await this.boxListsService.updateBox(boxList.id, {
                totalPrice: boxList.totalPrice,
            });
        }

        savedTicket.boxList = { id: boxList.id } as BoxList;
        savedTicket.ticket = null;
        await this.ticketRegistrationRepository.save(savedTicket);
        this.ticketGateway.emitNewRegistration(savedTicket);

        return savedTicket;
    } catch (error) {
        this.logger.error(error.message, error.stack);
    }
}


  async findAllRegistrations() {
    try{
        const registrations = await this.ticketRegistrationRepository.find({
            relations: ['ticket', 'boxList'],
            order: { createdAt: 'DESC' },
          });

        return registrations;
    } catch (error) {
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
    }  catch (error) {
        if (!(error instanceof NotFoundException)) {
          this.logger.error(error.message, error.stack);
        }
        throw error;
      }
  }
}
