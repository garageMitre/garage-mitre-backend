import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './entities/customer.entity';
import { ReceiptsModule } from 'src/receipts/receipts.module';
import { Receipt } from 'src/receipts/entities/receipt.entity';
import { Vehicle } from './entities/vehicle.entity';
import { InterestSettings } from './entities/interest-setting.entity';
import { ParkingType } from './entities/parking-type.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Customer, Receipt, Vehicle, InterestSettings, ParkingType]), ReceiptsModule],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
