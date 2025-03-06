import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppConfig, DatabaseConfig } from './config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ReceiptsModule } from './receipts/receipts.module';
import { ScannerModule } from './scanner/scanner.module';
import { TicketsModule } from './tickets/tickets.module';
import { BoxListsModule } from './box-lists/box-lists.module';
import { CustomersModule } from './customers/customers.module';
import { PrinterModule } from './printer/printer.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ScheduleModule } from '@nestjs/schedule';

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
  ScheduleModule.forRoot(),
  ReceiptsModule,
  ScannerModule,
  TicketsModule,
  BoxListsModule,
  CustomersModule,
  PrinterModule,
  UsersModule,
  AuthModule
],
  controllers: [],
  providers: [],
})
export class AppModule {}
