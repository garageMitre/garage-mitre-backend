import { Injectable } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ReceiptsService {
  async generarRecibo(data: any, filePath: string): Promise<void> {
    const templatePath = path.join(process.cwd(), 'public/recibo.template.html');
    const template = fs.readFileSync(templatePath, 'utf-8');

    // Reemplazar variables en el HTML
    const html = template
      .replace('{{fecha}}', new Date().toLocaleDateString('es-AR'))
      .replace('{{nombre}}', data.nombre)
      .replace('{{domicilio}}', data.domicilio)
      .replace('{{descripcion}}', data.descripcion)
      .replace('{{montoTotal}}', data.montoTotal);

    // Generar PDF con Puppeteer
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({
      path: filePath,
      format: 'A4',
      printBackground: true,
    });
    await browser.close();
  }
}
