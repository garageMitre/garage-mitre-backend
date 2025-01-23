import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppConfig, DatabaseConfig } from './config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImagesModule } from './images/images.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ReceiptsModule } from './receipts/receipts.module';
import { ScannerModule } from './scanner/scanner.module';
import { TicketsModule } from './tickets/tickets.module';
import { BoxListsModule } from './box-lists/box-lists.module';
import { RentersModule } from './renters/renters.module';
import { OwnersModule } from './owners/owners.module';

@Module({
  imports: [ConfigModule.forRoot({
    isGlobal: true,
    cache: true,
    load: [AppConfig, DatabaseConfig],
  }),
  TypeOrmModule.forRootAsync({
    imports: [ConfigModule],
    useFactory: (configService: ConfigService) => ({
      ...configService.get('database'),
    }),
    inject: [ConfigService],
  }),
  ImagesModule,
  ReceiptsModule,
  ScannerModule,
  TicketsModule,
  BoxListsModule,
  RentersModule,
  OwnersModule
],
  controllers: [],
  providers: [],
})
export class AppModule {}
