import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { CreateTicketRegistrationForDayDto } from './dto/create-ticket-registration-for-day.dto';
import { TicketRegistrationForDay } from './entities/ticket-registration-for-day.entity';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import * as isBetween from 'dayjs/plugin/isBetween'; 

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isBetween);
@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    @InjectRepository(TicketRegistration)
    private readonly ticketRegistrationRepository: Repository<TicketRegistration>,
    @InjectRepository(TicketRegistrationForDay)
    private readonly ticketRegistrationForDayRepository: Repository<TicketRegistrationForDay>,
    private readonly boxListsService: BoxListsService,
    private readonly ticketGateway: TicketGateway,
  ) {}

  async create(createTicketDto: CreateTicketDto) {
    try {
      const ticket = this.ticketRepository.create(createTicketDto);
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
    const time = createTicketRegistrationForDayDto.days ? `${createTicketRegistrationForDayDto.days} dia/s` : `${createTicketRegistrationForDayDto.weeks} semana/s`;
    ticket.description = `Tipo: ${createTicketRegistrationForDayDto.days ? 'Día/s' : 'Semana/s'}, Tiempo: ${time}`;
    const argentinaTime = dayjs().tz('America/Argentina/Buenos_Aires').startOf('day');
    const now = argentinaTime.format('YYYY-MM-DD')

    ticket.dateNow = now;

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
