import { Module } from '@nestjs/common';
import { RentersService } from './renters.service';
import { RentersController } from './renters.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Renter } from './entities/renter.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Renter])],
  controllers: [RentersController],
  providers: [RentersService],
})
export class RentersModule {}
