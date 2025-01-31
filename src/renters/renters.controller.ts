import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { RentersService } from './renters.service';
import { CreateRenterDto } from './dto/create-renter.dto';
import { UpdateRenterDto } from './dto/update-renter.dto';
import { Paginate, Paginated, PaginateQuery } from 'nestjs-paginate';
import { Renter } from './entities/renter.entity';

@Controller('renters')
export class RentersController {
  constructor(private readonly rentersService: RentersService) {}

  @Post()
  create(@Body() createRenterDto: CreateRenterDto) {
    return this.rentersService.create(createRenterDto);
  }

  @Get()
  findAll(@Paginate() query: PaginateQuery): Promise<Paginated<Renter>> {
    return this.rentersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rentersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateRenterDto: UpdateRenterDto) {
    return this.rentersService.update(id, updateRenterDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rentersService.remove(id);
  }
}
