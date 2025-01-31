import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from './entities/ticket.entity';
import { TicketRegistration } from './entities/ticket-registration.entity';
import { BoxListsModule } from 'src/box-lists/box-lists.module';
import { TicketGateway } from './register-gateway';

@Module({
  imports: [TypeOrmModule.forFeature([Ticket, TicketRegistration]), BoxListsModule],
  controllers: [TicketsController],
  providers: [TicketsService, TicketGateway],
  exports: [TicketsService]
})
export class TicketsModule {}
