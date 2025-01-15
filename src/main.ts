import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';


async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('NestApplication');
  const configService = app.get(ConfigService);

  app.enableCors({
    origin: configService.getOrThrow('app.allowedOrigins'),
    methods: 'GET,PUT,PATCH,POST,DELETE',
  });

  const port = configService.get('app.port');
  await app.listen(port, '0.0.0.0');
  logger.log(`Application is running on port ${port}`);
}
bootstrap();
