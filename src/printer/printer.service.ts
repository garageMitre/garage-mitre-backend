import { Injectable } from '@nestjs/common';
import { print } from 'pdf-to-printer';

@Injectable()
export class PrinterService {
  async printFile(filePath: string): Promise<void> {
    try {
      await print(filePath);
    } catch (error) {
      console.error('Error al imprimir el archivo:', error);
      throw new Error('Error al enviar el archivo a la impresora.');
    }
  }
}
