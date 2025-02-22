import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PrinterService } from './printer.service';
import { diskStorage } from 'multer';
import { join } from 'path';

@Controller('printer')
export class PrinterController {
  constructor(private readonly printerService: PrinterService) {}

  @Post('upload-and-print')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueName = `${Date.now()}-${file.originalname}`;
          cb(null, uniqueName);
        },
      }),
    }),
  )
  async uploadAndPrint(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new Error('No se recibió ningún archivo.');
    }
  
    const filePath = join(process.cwd(), 'uploads', file.filename);
    console.log(`Archivo recibido: ${filePath}`);
  
    // Validar antes de imprimir
    if (!file.filename.endsWith('.pdf')) {
      throw new Error('Solo se pueden imprimir archivos PDF.');
    }
  
    // Envía el archivo a imprimir
    await this.printerService.printFile(filePath);
  
    return { message: 'Archivo enviado a la impresora.' };
  }
  
}
