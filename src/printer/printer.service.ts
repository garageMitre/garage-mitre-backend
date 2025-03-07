import { Injectable } from '@nestjs/common';
import { exec } from 'child_process';
import { print } from 'pdf-to-printer';
import * as os from 'os';

@Injectable()
export class PrinterService {
  async printFile(filePath: string): Promise<void> {
    try {
      const platform = os.platform();

      if (platform === 'win32') {
        // Para Windows, usa pdf-to-printer
        await print(filePath);
      } else if (platform === 'linux' || platform === 'darwin') {
        // Para Linux y macOS, usa lpr
        const command = `lpr ${filePath}`;
        exec(command, (error, stdout, stderr) => {
          if (error) {
            console.error('Error al imprimir:', stderr);
            throw new Error('Error al enviar el archivo a la impresora.');
          }
          console.log('Impresión enviada:', stdout);
        });
      } else {
        throw new Error('Sistema operativo no soportado.');
      }
    } catch (error) {
      console.error('Error al imprimir el archivo:', error);
      throw new Error('Error al enviar el archivo a la impresora.');
    }
  }
}
