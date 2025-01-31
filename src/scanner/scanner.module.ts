import { Module } from '@nestjs/common';
import { ScannerService } from './scanner.service';
import { TicketsModule } from 'src/tickets/tickets.module';
import { ScannerController } from './scanner.controller';

@Module({
  imports: [TicketsModule],
  controllers: [ScannerController],
  providers: [ScannerService],
  exports: [ScannerService],
})
export class ScannerModule {}