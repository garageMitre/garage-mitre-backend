import { Module } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { ReceiptsController } from './receipts.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReceiptOwner } from './entities/receipt-owner.entity';
import { Owner } from 'src/owners/entities/owner.entity';
import { Renter } from 'src/renters/entities/renter.entity';
import { ReceiptRenter } from './entities/receipt-renter.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ReceiptOwner, ReceiptRenter, Owner, Renter])],
  controllers: [ReceiptsController],
  providers: [ReceiptsService],
  exports: [ReceiptsService]
})
export class ReceiptsModule {}
