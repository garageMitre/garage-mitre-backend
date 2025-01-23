import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as readline from 'readline';

@Injectable()
export class ScannerService implements OnModuleDestroy {
  private rl: readline.Interface;
  private barcode: string = '';

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  /**
   * Inicia el escáner para capturar códigos de barras.
   * @param callback Función a ejecutar con el código escaneado.
   */
  start(callback: (barcode: string) => void): void {
    console.log('Escanea un código de barras:');

    this.rl.on('line', (line) => {
      // Se recibe la línea completa al presionar Enter (simulado por el escáner)
      this.barcode = line.trim();

      console.log('Código de barras escaneado:', this.barcode);

      // Llama al callback con el código escaneado
      callback(this.barcode);

      // Preguntar por otro código
      console.log('Escanea otro código:');
    });
  }

  /**
   * Detiene el escáner.
   */
  stop(): void {
    if (this.rl) {
      this.rl.close();
    }
    console.log('Escáner detenido.');
  }

  /**
   * Limpieza al destruir el módulo.
   */
  onModuleDestroy(): void {
    this.stop();
  }
}
