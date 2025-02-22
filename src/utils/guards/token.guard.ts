import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TokenGuard implements CanActivate {
  private readonly secretToken: string;

  constructor(private readonly configService: ConfigService) {
    this.secretToken =
      this.configService.getOrThrow<string>('API_SECRET_TOKEN');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const authorization = request.headers['authorization'];

    const token = authorization?.split(' ')[1] || '';

    if (!token) {
      throw new UnauthorizedException();
    }

    if (this.secretToken !== token) {
      throw new UnauthorizedException();
    }

    return true;
  }
}
