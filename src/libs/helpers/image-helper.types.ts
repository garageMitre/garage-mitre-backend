import { UploadApiErrorResponse, UploadApiResponse } from 'cloudinary';

export type UploadImageResponse = {
  url: string;
  publicId: string;
};

export type CloudinaryResponse = UploadApiResponse | UploadApiErrorResponse;
