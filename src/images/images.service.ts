import { Injectable, Logger } from '@nestjs/common';
import { UploadApiOptions } from 'cloudinary';
import { ImageHelperService } from 'src/libs/helpers/image-helper';
import { generateUniqueHashFromBuffer } from 'src/utils/token';

@Injectable()
export class ImagesService {
  private logger = new Logger(ImagesService.name);
  private imageHelper = new ImageHelperService(ImagesService.name);

  async uploadImage({
    file,
    options,
  }: {
    file: Express.Multer.File;
    options: UploadApiOptions;
  }) {
    try {
      const buffer = file.buffer;
      // Generate a unique hash from the buffer to use as the file name
      const fileName = generateUniqueHashFromBuffer(buffer);

      const res = await this.imageHelper.uploadImage({
        file,
        options: {
          ...options,
          public_id: fileName,
          overwrite: false,
        },
      });
      return res;
    } catch (e) {
      this.logger.error(e);
      throw e;
    }
  }
}
