import { Module } from '@nestjs/common';
import { RentersService } from './renters.service';
import { RentersController } from './renters.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Renter } from './entities/renter.entity';
import { ReceiptsModule } from 'src/receipts/receipts.module';

@Module({
  imports: [TypeOrmModule.forFeature([Renter]), ReceiptsModule],
  controllers: [RentersController],
  providers: [RentersService],
})
export class RentersModule {}
