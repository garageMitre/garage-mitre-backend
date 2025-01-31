import { Injectable, Logger } from '@nestjs/common';
import { TicketsService } from '../tickets/tickets.service';
import { ScannerDto } from './dto/scanner.dto';

@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);
  private isScanning = false;

  constructor(private readonly ticketsService: TicketsService) {}

  async start(scannerDto: ScannerDto): Promise<{ success: boolean; message: string }> {
    if (this.isScanning) {
      return { success: false, message: 'El escáner ya está en ejecución.' };
    }

    this.isScanning = true;
    this.logger.log(`Procesando código de barras: ${scannerDto.barCode}`);

    try {
      const ticket = await this.ticketsService.findTicketByCode(scannerDto.barCode);

      if (!ticket) {
        this.logger.warn(`No se encontró un ticket con el código: ${scannerDto.barCode}`);
        this.isScanning = false;
        return { success: false, message: `No se encontró un ticket con el código: ${scannerDto.barCode}` };
      }

      const registration = await this.ticketsService.createRegistration(scannerDto.barCode, ticket.id);

      if (registration) {
        this.logger.log('Registro creado exitosamente.');
        this.isScanning = false;
        return { success: true, message: 'Registro creado exitosamente.' };
      } else {
        this.logger.warn('No se pudo registrar el ticket.');
        this.isScanning = false;
        return { success: false, message: 'No se pudo registrar el ticket.' };
      }
    } catch (error) {
      this.logger.error('Error al procesar el código de barras:', error);
      this.isScanning = false;
      return { success: false, message: 'Error al procesar el código de barras.' };
    }
  }
}
