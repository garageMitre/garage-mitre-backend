import { Module } from '@nestjs/common';
import { OwnersService } from './owners.service';
import { OwnersController } from './owners.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Owner } from './entities/owner.entity';
import { ReceiptsModule } from 'src/receipts/receipts.module';

@Module({
  imports: [TypeOrmModule.forFeature([Owner]), ReceiptsModule],
  controllers: [OwnersController],
  providers: [OwnersService],
})
export class OwnersModule {}
