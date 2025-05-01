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
import { NotificationGateway } from 'src/notes/notification-gateway';
import { NotificationInterestGateway } from './notification-interest-gateway';
import { VehicleRenter } from './entities/vehicle-renter.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Customer, Receipt, Vehicle, InterestSettings, ParkingType, VehicleRenter]), ReceiptsModule],
  controllers: [CustomersController],
  providers: [CustomersService, NotificationInterestGateway],
})
export class CustomersModule {}
