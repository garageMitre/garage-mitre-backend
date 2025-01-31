import { Module } from '@nestjs/common';
import { BoxListsService } from './box-lists.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BoxList } from './entities/box-list.entity';
import { BoxListsController } from './box-lists.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BoxList])],
  controllers: [BoxListsController],
  providers: [BoxListsService],
  exports: [BoxListsService]
})
export class BoxListsModule {}
