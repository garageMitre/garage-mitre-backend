import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from './entities/ticket.entity';
import { TicketRegistration } from './entities/ticket-registration.entity';
import { BoxListsModule } from 'src/box-lists/box-lists.module';
import { TicketGateway } from './register-gateway';
import { TicketRegistrationForDay } from './entities/ticket-registration-for-day.entity';
import { TicketPrice } from './entities/ticket-price.entity';
import { TicketPriceBracket } from './entities/ticket-price-bracket.entity';
import { TicketScheduleSettings } from './entities/ticket-schedule-settings.entity';
import { TariffPlanService } from './tariff-plan.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Ticket,
      TicketRegistration,
      TicketRegistrationForDay,
      TicketPrice,
      TicketPriceBracket,
      TicketScheduleSettings,
    ]),
    BoxListsModule,
  ],
  controllers: [TicketsController],
  providers: [TicketsService, TariffPlanService, TicketGateway],
  exports: [TicketsService]
})
export class TicketsModule {}
