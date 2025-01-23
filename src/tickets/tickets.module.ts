import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from './entities/ticket.entity';
import { TicketRegistration } from './entities/ticket-registration.entity';
import { ScannerModule } from 'src/scanner/scanner.module';
import { BoxListsModule } from 'src/box-lists/box-lists.module';

@Module({
  imports: [TypeOrmModule.forFeature([Ticket, TicketRegistration]), ScannerModule, BoxListsModule],
  controllers: [TicketsController],
  providers: [TicketsService],
})
export class TicketsModule {}
