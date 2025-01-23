import { v2 as cloudinary, UploadApiOptions } from 'cloudinary';
import * as streamifier from 'streamifier';
import { CloudinaryResponse } from './image-helper.types';
import { Logger } from '@nestjs/common';
import { clodunaryConfigOptions } from './image-helper.config';

export class ImageHelperService {
  private logger: Logger;
  constructor(private readonly context: string) {
    this.logger = new Logger(context);
    cloudinary.config(clodunaryConfigOptions);
  }

  async uploadImage({
    file,
    options,
  }: {
    file: Express.Multer.File;
    options: UploadApiOptions;
  }): Promise<CloudinaryResponse> {
    this.logger.log('Uploading Image...');
    return new Promise<CloudinaryResponse>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          ...options,
        },
        (error, result) => {
          if (error)
            return reject(`Error al cargar la imagen en Cloudinary: ${error} `);
          resolve(result);
        },
      );
      streamifier.createReadStream(file.buffer).pipe(uploadStream);
      this.logger.log('Upload Image process finished');
    });
  }

  optimizeImage(publicId: string): string {
    return cloudinary.url(publicId, {
      fetch_format: 'auto',
      quality: 'auto',
    });
  }

  transformImage(publicId: string, options: any): string {
    return cloudinary.url(publicId, options);
  }
}
