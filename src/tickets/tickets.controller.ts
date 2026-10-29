import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
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
import { TicketPriceBracket } from './entities/ticket-price-bracket.entity';
import { CreateTicketPriceBracketDto } from './dto/create-ticket-price-bracket.dto';
import { UpdateTicketPriceBracketDto } from './dto/update-ticket-price-bracket.dto';
import { UpdateTicketScheduleDto } from './dto/update-ticket-schedule.dto';
import { AddAdvancePaymentDto } from './dto/add-advance-payment.dto';
import { SetPaymentMethodDto } from './dto/set-payment-method.dto';
import { SimulateTariffPlanDto, UpdateTariffPlanDto } from './dto/tariff-plan.dto';
import { TariffPlanService } from './tariff-plan.service';

@Controller('tickets')
@UseGuards(AuthOrTokenAuthGuard)
export class TicketsController {
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly tariffPlanService: TariffPlanService,
  ) {}

  // Declaradas antes de las rutas con ":id" — si no, Nest/Express matchea
  // "schedule-settings" como si fuera un :id de ticket.
  @Get('schedule-settings')
  getSchedule() {
    return this.ticketsService.getSchedule();
  }

  @Patch('schedule-settings')
  updateSchedule(@Body() updateTicketScheduleDto: UpdateTicketScheduleDto) {
    return this.ticketsService.updateSchedule(updateTicketScheduleDto);
  }

  // Editor de tarifas por tiempo: lee y aplica el plan completo (forma de cobro, horarios y
  // precios) de una vez, con control de revisión para no pisar cambios de otra persona.
  @Get('tariff-plan')
  getTariffPlan() {
    return this.tariffPlanService.getPlan();
  }

  @Patch('tariff-plan')
  updateTariffPlan(@Body() dto: UpdateTariffPlanDto) {
    return this.tariffPlanService.updatePlan(dto);
  }

  // Calcula un ejemplo sin registrar nada, con las tarifas vigentes o con un borrador.
  @Post('tariff-plan/simulate')
  simulateTariffPlan(@Body() dto: SimulateTariffPlanDto) {
    return this.tariffPlanService.simulate(dto);
  }

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
  findAllRegistrationForDay() {
    return this.ticketsService.findAllRegistrationForDay();
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

  // Declarada antes de ':id/status' de forma explícita solo por legibilidad — el shape del
  // path (2 segmentos fijos vs. uno con :id en el medio) ya evita cualquier ambigüedad de ruteo.
  @Patch('registrationForDays/retire-many')
  retireManyRegistrationForDay(@Body('ids') ids: string[]) {
    return this.ticketsService.retireRegistrationsForDay(ids);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ticketsService.remove(id);
  }

  @Delete('registrationForDays/:id')
  removeRegistrationForDay(@Param('id') id: string) {
    return this.ticketsService.removeRegistrationForDay(id);
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

  @Post('priceBrackets')
  createPriceBracket(@Body() createTicketPriceBracketDto: CreateTicketPriceBracketDto) {
    return this.ticketsService.createPriceBracket(createTicketPriceBracketDto);
  }

  @Get('priceBrackets')
  findAllPriceBrackets(@Query('vehicleType') vehicleType?: string): Promise<TicketPriceBracket[]> {
    return this.ticketsService.findAllPriceBrackets(vehicleType);
  }

  @Patch('priceBrackets/:id')
  updatePriceBracket(@Param('id') id: string, @Body() updateTicketPriceBracketDto: UpdateTicketPriceBracketDto) {
    return this.ticketsService.updatePriceBracket(id, updateTicketPriceBracketDto);
  }

  @Delete('priceBrackets/:id')
  removePriceBracket(@Param('id') id: string) {
    return this.ticketsService.removePriceBracket(id);
  }

  @Get('registrations')
  findAllRegistrations() {
    return this.ticketsService.findAllRegistrations();
  }

  @Get('registrations/hourly-activity')
  getHourlyActivity(@Query('date') date?: string) {
    return this.ticketsService.getHourlyActivity(date);
  }

  @Get('registrations/:id')
  findOne(@Param('id') id: string) {
    return this.ticketsService.findOneRegistration(id);
  }

  @Patch('registrations/:id/advance-payment')
  addAdvancePayment(@Param('id') id: string, @Body() dto: AddAdvancePaymentDto) {
    return this.ticketsService.addAdvancePayment(id, dto);
  }

  @Patch('registrations/:id/payment-method')
  setPaymentMethod(@Param('id') id: string, @Body() dto: SetPaymentMethodDto) {
    return this.ticketsService.setPaymentMethod(id, dto);
  }

  @Post('simulation/:barId')
  createRegistrationPrueba(@Param('barId') simulatedCodeBar: string) {
    return this.ticketsService.createRegistration(simulatedCodeBar);
  }
}
