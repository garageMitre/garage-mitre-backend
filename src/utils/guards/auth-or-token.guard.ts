import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from './auth.guard';
import { AuthenticatedRequest } from '../../types/request';

@Injectable()
export class AuthOrTokenAuthGuard implements CanActivate {
  private readonly secretToken: string;

  constructor(private readonly configService: ConfigService) {
    this.secretToken =
      this.configService.getOrThrow<string>('API_SECRET_TOKEN');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authGuard = new JwtAuthGuard();

    try {
      const authRes = await authGuard.canActivate(context);
      if (!authRes) {
        throw new UnauthorizedException();
      }

      const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
      if (!request.user) {
        throw new UnauthorizedException('User not authenticated');
      }

      return true;
    } catch (e) {
      const request = context.switchToHttp().getRequest();
      const authorization = request.headers['authorization'];
      const token = authorization?.split(' ')[1] || '';

      if (!token) {
        throw new UnauthorizedException('Authorization token missing');
      }

      if (this.secretToken === token) {
        return true;
      }

      throw new UnauthorizedException('Invalid token');
    }
  }
}
