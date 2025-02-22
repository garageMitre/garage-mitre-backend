import { UnauthorizedException } from '@nestjs/common';

export class CustomUnauthorizedException extends UnauthorizedException {
  constructor(message: string) {
    super({
      error: true,
      code: 'CredentialsSignin',
      message: message,
    });
  }
}