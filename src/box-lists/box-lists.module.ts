import { Module } from '@nestjs/common';
import { BoxListsService } from './box-lists.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BoxList } from './entities/box-list.entity';
import { BoxListsController } from './box-lists.controller';
import { OtherPayment } from './entities/other-payment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BoxList, OtherPayment])],
  controllers: [BoxListsController],
  providers: [BoxListsService],
  exports: [BoxListsService]
})
export class BoxListsModule {}
