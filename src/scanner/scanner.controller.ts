import { Controller, Post, Body } from '@nestjs/common';
import { ScannerService } from '../scanner/scanner.service';
import { ScannerDto } from './dto/scanner.dto';

@Controller('scanner')
export class ScannerController {
  constructor(private readonly scannerService: ScannerService) {}

  @Post('start-scanner')
  async startScanner(@Body() scannerDto: ScannerDto) {
    return await this.scannerService.start(scannerDto);
  }
}
