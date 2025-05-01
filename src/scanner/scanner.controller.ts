import { Controller, Post, Body } from '@nestjs/common';
import { ScannerService } from '../scanner/scanner.service';
import { ScannerDto } from './dto/scanner.dto';
import { UpdateReceiptDto } from 'src/receipts/dto/update-receipt.dto';

@Controller('scanner')
export class ScannerController {
  constructor(private readonly scannerService: ScannerService) {}

  @Post('start-scanner')
  async startScanner(@Body() scannerDto: ScannerDto) {
    return await this.scannerService.start(scannerDto);
  }

  @Post('receiptScanner')
  async receiptScanner(@Body() updateReceiptDto : UpdateReceiptDto) {
    return await this.scannerService.receiptScanner(updateReceiptDto);
  }
}
