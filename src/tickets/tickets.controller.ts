import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { Paginate, Paginated, PaginateQuery } from 'nestjs-paginate';
import { Ticket } from './entities/ticket.entity';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { CreateTicketRegistrationForDayDto } from './dto/create-ticket-registration-for-day.dto';
import { AuthOrTokenAuthGuard } from 'src/utils/guards/auth-or-token.guard';

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

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTicketDto: UpdateTicketDto) {
    return this.ticketsService.update(id, updateTicketDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ticketsService.remove(id);
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
