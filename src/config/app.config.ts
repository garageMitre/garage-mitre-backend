import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT as string, 10) || 3030,
  allowedOrigins: process.env.ALLOWED_ORIGINS,
  nodenv: process.env.NODE_ENV,
}));
