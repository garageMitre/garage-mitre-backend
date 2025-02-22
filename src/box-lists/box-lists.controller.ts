import { Controller, Get, Post, Put, Body, Param, NotFoundException, UseGuards } from '@nestjs/common';
import { BoxListsService } from './box-lists.service';
import { CreateBoxListDto } from './dto/create-box-list.dto';
import { UpdateBoxListDto } from './dto/update-box-list.dto';
import { CreateOtherPaymentDto } from './dto/create-other-payment.dto';
import { AuthOrTokenAuthGuard } from 'src/utils/guards/auth-or-token.guard';

@Controller('box-lists')
@UseGuards(AuthOrTokenAuthGuard)
export class BoxListsController {
  constructor(private readonly boxListsService: BoxListsService) {}

  @Post()
  async createBox(@Body() createBoxListDto: CreateBoxListDto) {
    return await this.boxListsService.createBox(createBoxListDto);
  }

  @Get()
  async getAllboxes() {
      return await this.boxListsService.getAllboxes();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
      return await this.boxListsService.findOne(id);
  }

  @Put(':id')
  async updateBox(@Param('id') id: string, @Body() updateBoxListDto: UpdateBoxListDto) {
    return await this.boxListsService.updateBox(id, updateBoxListDto);
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

  @Post('otherPayment')
  async createOtherPayment(@Body() createOtherPaymentDto: CreateOtherPaymentDto) {
    return await this.boxListsService.createOtherPayment(createOtherPaymentDto);
  }


}
