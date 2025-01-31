import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    @InjectRepository(TicketRegistration)
    private readonly ticketRegistrationRepository: Repository<TicketRegistration>,
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

  async findTicketByCode (codeBar: string){
    const ticket = await this.ticketRepository.findOne({ where: { codeBar:codeBar } });
    if (!ticket) {
        this.logger.warn(`No se encontró un ticket con el código de barras: ${codeBar}`);
        return null;
    }
    return ticket;
  }

  async createRegistration(simulatedCodeBar?: string, ticketId?: string) {
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

        const now = new Date();
        const formattedDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const getLocalTime = (date: Date): string => {
            return date.toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
            });
        };

        if (!existingRegistration) {
            const localTime = getLocalTime(now);

            const createTicketRegistrationDto: CreateTicketRegistrationDto = {
                description: `Registro de ticket para vehículo tipo ${ticket.vehicleType}`,
                price: 0,
                entryDay: formattedDay,
                entryTime: localTime,
                departureDay: null,
                departureTime: null,
            };

            const newRegistration = this.ticketRegistrationRepository.create({
                ...createTicketRegistrationDto,
                ticket,
            });

            const savedTicket = await this.ticketRegistrationRepository.save(newRegistration);
            this.ticketGateway.emitNewRegistration(savedTicket);
            return savedTicket;
        } else {
            return await this.updateRegistration(existingRegistration, now, formattedDay, ticket);
        }
    } catch (error) {
        this.logger.error(error.message, error.stack);
    }
}

async updateRegistration(existingRegistration: TicketRegistration, now: Date, formattedDay: Date, ticket: Ticket) {
    try {
        const getLocalTime = (date: Date): string => {
            return date.toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
            });
        };

        const localTime = getLocalTime(now);

        const timeToMinutes = (time: string): number => {
            const [hours, minutes] = time.split(':').map(Number);
            return hours * 60 + minutes;
        };

        const entryMinutes = timeToMinutes(existingRegistration.entryTime);
        const departureMinutes = timeToMinutes(localTime);

        const diffMinutes = departureMinutes - entryMinutes;
        const hours = Math.ceil((diffMinutes - 5) / 60);

        const price = diffMinutes < 5 ? 0 : Math.max(hours, 1) * 600;

        const updateTicketRegistrationDto: CreateTicketRegistrationDto = {
            description: `Tipo ${existingRegistration.ticket.vehicleType}, Ent: ${existingRegistration.entryTime}, Sal: ${localTime}`,
            price: price,
            entryDay: existingRegistration.entryDay,
            entryTime: existingRegistration.entryTime,
            departureDay: formattedDay,
            departureTime: localTime,
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
                totalPrice: price
            });
        } else {
            boxList.totalPrice += price;

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
