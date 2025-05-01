import { Injectable, Logger } from '@nestjs/common';
import { TicketsService } from '../tickets/tickets.service';
import { ScannerDto } from './dto/scanner.dto';
import { ReceiptsService } from 'src/receipts/receipts.service';
import { UpdateReceiptDto } from 'src/receipts/dto/update-receipt.dto';

@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);
  private isScanning = false;

  constructor(
    private readonly ticketsService: TicketsService,
    private readonly receiptsService: ReceiptsService
  ) {}

  async start(scannerDto?: ScannerDto): Promise<{ success: boolean; message: string }> {
    if (this.isScanning) {
      return { success: false, message: 'El escáner ya está en ejecución.' };
    }
  
    this.isScanning = true;
    this.logger.log(`Procesando código de barras: ${scannerDto?.barCode}`);
  
    try {
      const barCode = scannerDto?.barCode;
  
      if (!barCode) {
        this.isScanning = false;
        return { success: false, message: 'No se proporcionó un código de barras.' };
      }
  
      // Verifica si el barcode tiene exactamente 11 dígitos numéricos
      const isReceiptCode = /^\d{11,15}$/.test(barCode);
      console.log(isReceiptCode)
      if (!isReceiptCode) {
        const ticket = await this.ticketsService.findTicketByCode(barCode);
  
        if (!ticket) {
          this.logger.warn(`No se encontró un ticket con el código: ${barCode}`);
          this.isScanning = false;
          return { success: false, message: `No se encontró un ticket con el código: ${barCode}` };
        }
  
        const registration = await this.ticketsService.createRegistration(ticket.id);
  
        this.isScanning = false;
        if (registration) {
          this.logger.log('Registro de ticket creado exitosamente.');
          return { success: true, message: 'Registro de ticket creado exitosamente.' };
        } else {
          this.logger.warn('No se pudo registrar el ticket.');
          return { success: false, message: 'No se pudo registrar el ticket.' };
        }
  
      } else {
        const barcodeReceipt = await this.receiptsService.getBarcodeReceipt(barCode);
  
        if (!barcodeReceipt) {
          this.logger.warn(`No se encontró un recibo con el código: ${barCode}`);
          this.isScanning = false;
          return { success: false, message: `No se encontró un recibo con el código: ${barCode}` };
        }
  
        const registrationReceiptPaid = await this.receiptsService.updateReceipt(barcodeReceipt.customer.id, scannerDto);
  
        this.isScanning = false;
        if (registrationReceiptPaid) {
          this.logger.log('Recibo pagado registrado exitosamente.');
          return { success: true, message: 'Recibo pagado registrado exitosamente.' };
        } else {
          this.logger.warn('No se pudo registrar el pago del recibo.');
          return { success: false, message: 'No se pudo registrar el pago del recibo.' };
        }
      }
    } catch (error) {
      this.logger.error('Error al procesar el código de barras:', error);
      this.isScanning = false;
      return { success: false, message: 'Error al procesar el código de barras.' };
    }
  }
  
  async receiptScanner(updateReceiptDto : UpdateReceiptDto): Promise<{ success: boolean; message: string }> {
    if (this.isScanning) {
      return { success: false, message: 'El escáner ya está en ejecución.' };
    }

    this.isScanning = true;
    this.logger.log(`Procesando código de barras: ${updateReceiptDto.barCode}`);

    try {
      const barcodeReceipt = await this.receiptsService.getBarcodeReceipt(updateReceiptDto.barCode)

      if (!barcodeReceipt) {
        this.logger.warn(`No se encontró un ticket con el código: ${updateReceiptDto.barCode}`);
        this.isScanning = false;
        return { success: false, message: `No se encontró un ticket con el código: ${updateReceiptDto.barCode}` };
      }

      const registrationReceiptPaid = await this.receiptsService.updateReceipt(barcodeReceipt.customer.id, updateReceiptDto)

      if (registrationReceiptPaid) {
        this.logger.log('Recibo pagado registrado exitosamente.');
        this.isScanning = false;
        return { success: true, message: 'Recibo pagado registrado exitosamente.' };
      } else {
        this.logger.warn('No se pudo registrar el pago del recibo.');
        this.isScanning = false;
        return { success: false, message: 'No se pudo registrar el pago del recibo.' };
      }
    } catch (error) {
      this.logger.error('Error al procesar el código de barras:', error);
      this.isScanning = false;
      return { success: false, message: 'Error al procesar el código de barras.' };
    }
  }
}
