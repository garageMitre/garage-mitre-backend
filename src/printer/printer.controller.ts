import { Controller, Post, Get, Body, UploadedFile, UseInterceptors, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { join } from 'path';
import { Response } from 'express';
import axios from 'axios';

@Controller('printer')
export class PrinterController {
  private activePrinters: { machineId: string; url: string }[] = [];

  @Post('register')
  async registerPrinter(@Body() body) {
    const { machineId, url } = body;

    if (!machineId || !url) {
      return { error: '❌ Falta información para registrar la impresora.' };
    }

    const existingPrinterIndex = this.activePrinters.findIndex(p => p.machineId === machineId);

    if (existingPrinterIndex === -1) {
      this.activePrinters.push({ machineId, url });
      console.log(`✅ Impresora registrada: ${machineId} - ${url}`);
    } else {
      this.activePrinters[existingPrinterIndex].url = url;
      console.log(`🔄 URL de impresora actualizada: ${machineId} -> ${url}`);
    }
    return { message: '✅ Impresora registrada correctamente.', activePrinters: this.activePrinters };
  }

  @Post('update-ngrok-url')
  async updateNgrokUrl(@Body() body) {
    const { machineId, url } = body;

    if (!machineId || !url) {
      return { error: '❌ Falta información para actualizar la URL de ngrok.' };
    }

    const printerIndex = this.activePrinters.findIndex(p => p.machineId === machineId);

    if (printerIndex !== -1) {
      this.activePrinters[printerIndex].url = url;
      console.log(`🔄 URL de ngrok actualizada para ${machineId}: ${url}`);
    } else {
      this.activePrinters.push({ machineId, url });
      console.log(`✅ Impresora registrada con nueva URL de ngrok: ${machineId} - ${url}`);
    }

    return { message: '✅ URL de ngrok actualizada correctamente.', activePrinters: this.activePrinters };
  }

  @Get('active-printers')
  async getActivePrinters() {
    return this.activePrinters.length > 0
      ? { printers: this.activePrinters }
      : { error: '❌ No hay impresoras activas registradas.' };
  }

  @Post('upload-and-print')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueName = `recibo-${Date.now()}.pdf`;
          cb(null, uniqueName);
        },
      }),
    }),
  )
  async uploadAndPrint(@UploadedFile() file: Express.Multer.File, @Res() res: Response) {
    if (!file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo.' });
    }

    const filePath = join(process.cwd(), 'uploads', file.filename);
    console.log(`📥 PDF recibido: ${filePath}`);

    // 🟢 Buscar una impresora activa
    if (this.activePrinters.length === 0) {
      console.warn('❌ No hay impresoras activas disponibles.');
      return res.status(400).json({ error: 'No hay impresoras activas disponibles.' });
    }

    const assignedPrinter = this.activePrinters[0];
    console.log(`📡 Enviando PDF a la impresora de ${assignedPrinter.machineId}...`);

    try {
      const back_url = process.env.BACK_API_URL;

      // 📌 Enviar PDF a la impresora local usando la URL de ngrok
      await axios.post(`${assignedPrinter.url}/printer/print`, {
        pdfUrl: `${back_url}/uploads/${file.filename}`,
      });

      console.log(`✅ Recibo enviado a la impresora de ${assignedPrinter.machineId}`);
      return res.json({ message: 'PDF enviado a la impresora.' });
    } catch (error) {
      console.error('❌ Error enviando el PDF a la impresora:', error.message);
      return res.status(500).json({ error: 'Error al enviar el PDF a la impresora.' });
    }
  }
}
