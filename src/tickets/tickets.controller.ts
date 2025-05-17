import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { Paginate, Paginated, PaginateQuery } from 'nestjs-paginate';
import { Ticket } from './entities/ticket.entity';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { CreateTicketRegistrationForDayDto, UpdateTicketStatusDto } from './dto/create-ticket-registration-for-day.dto';
import { AuthOrTokenAuthGuard } from 'src/utils/guards/auth-or-token.guard';
import { TicketPrice } from './entities/ticket-price.entity';
import { CreateTicketPriceDto } from './dto/create-ticket-price.dto';
import { UpdateTicketPriceDto } from './dto/update-ticket-price.dto';
import { TicketRegistrationForDay } from './entities/ticket-registration-for-day.entity';

@Controller('tickets')
@UseGuards(AuthOrTokenAuthGuard)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  create(@Body() createTicketDto: CreateTicketDto) {
    return this.ticketsService.create(createTicketDto);
  }

  @Post('registrationForDays')
  createRegistrationForDay(@Body() createTicketRegistrationForDayDto: CreateTicketRegistrationForDayDto) {
    return this.ticketsService.createRegistrationForDay(createTicketRegistrationForDayDto);
  }

  @Get()
  findAll(@Paginate() query: PaginateQuery): Promise<Paginated<Ticket>> {
    return this.ticketsService.findAll(query);
  }
  @Get('registrationForDays')
  findAllRegistrationForDay(@Paginate() query: PaginateQuery): Promise<Paginated<TicketRegistrationForDay>> {
    return this.ticketsService.findAllRegistrationForDay(query);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTicketDto: UpdateTicketDto) {
    return this.ticketsService.update(id, updateTicketDto);
  }
  @Patch('registrationForDays/:id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    return this.ticketsService.updateTicketStatus(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ticketsService.remove(id);
  }

  @Post('ticketsPrice')
  createTicketPrice(@Body() createTicketPriceDto: CreateTicketPriceDto) {
    return this.ticketsService.createTicketPrice(createTicketPriceDto);
  }
  
  @Get('ticketsPrice')
  findAllTicketPrice(@Paginate() query: PaginateQuery): Promise<Paginated<TicketPrice>> {
    return this.ticketsService.findAllTicketPrice(query);
  }

  @Patch('ticketsPrice/:id')
  updateTicketPrice(@Param('id') id: string, @Body() updateTicketPriceDto: UpdateTicketPriceDto) {
    return this.ticketsService.updateTicketPrice(id, updateTicketPriceDto);
  }

  @Delete('ticketsPrice/:id')
  removeTicketPrice(@Param('id') id: string) {
    return this.ticketsService.removeTicketPrice(id);
  }

  @Get('registrations')
  findAllRegistrations() {
    return this.ticketsService.findAllRegistrations();
  }

  @Get('registrations/:id')
  findOne(@Param('id') id: string) {
    return this.ticketsService.findOneRegistration(id);
  }

  @Post('simulation/:barId')
  createRegistrationPrueba(@Param('barId') simulatedCodeBar: string) {
    return this.ticketsService.createRegistration(simulatedCodeBar);
  }
}
