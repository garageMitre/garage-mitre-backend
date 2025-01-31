import { Controller, Get, Post, Put, Body, Param, NotFoundException } from '@nestjs/common';
import { BoxListsService } from './box-lists.service';
import { CreateBoxListDto } from './dto/create-box-list.dto';
import { UpdateBoxListDto } from './dto/update-box-list.dto';

@Controller('box-lists')
export class BoxListsController {
  constructor(private readonly boxListsService: BoxListsService) {}

  @Post()
  async createBox(@Body() createBoxListDto: CreateBoxListDto) {
    const createdBoxList = await this.boxListsService.createBox(createBoxListDto);
    return { message: 'BoxList created successfully', data: createdBoxList };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
      return await this.boxListsService.findOne(id);
  }

  @Put(':id')
  async updateBox(@Param('id') id: string, @Body() updateBoxListDto: UpdateBoxListDto) {
    const updatedBoxList = await this.boxListsService.updateBox(id, updateBoxListDto);
    return { message: 'BoxList updated successfully', data: updatedBoxList };
  }

  @Get('date/:date')
  async findBoxByDate(@Param('date') date: string) {
    const formattedDate = new Date(date);
    if (isNaN(formattedDate.getTime())) {
      throw new NotFoundException('Invalid date format');
    }

    const boxList = await this.boxListsService.findBoxByDate(formattedDate);
    if (!boxList) {
      throw new NotFoundException('BoxList not found for the given date');
    }

    return { message: 'BoxList found', data: boxList };
  }


}
