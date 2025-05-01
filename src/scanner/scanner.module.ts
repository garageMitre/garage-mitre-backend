import { Module } from '@nestjs/common';
import { ScannerService } from './scanner.service';
import { TicketsModule } from 'src/tickets/tickets.module';
import { ScannerController } from './scanner.controller';
import { ReceiptsModule } from 'src/receipts/receipts.module';

@Module({
  imports: [TicketsModule, ReceiptsModule],
  controllers: [ScannerController],
  providers: [ScannerService],
  exports: [ScannerService],
})
export class ScannerModule {}