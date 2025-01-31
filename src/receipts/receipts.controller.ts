import { Controller, Post, Body, Res } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { Response } from 'express';

@Controller('recibos')
export class ReceiptsController {
  constructor(private readonly reciboService: ReceiptsService) {}

  @Post('generar')
  async generarRecibo(@Body() data: any, @Res() res: Response) {
    const filePath = `./recibos/recibo-${Date.now()}.pdf`;

    try {
      await this.reciboService.generarRecibo(data, filePath);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=recibo.pdf`,
      });
      res.sendFile(filePath, { root: '.' });
    } catch (error) {
      console.error('Error al generar el recibo:', error);
      res.status(500).send('Error al generar el recibo');
    }
  }
}
