import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { Paginate, Paginated, PaginateQuery } from 'nestjs-paginate';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, CreateVehicleDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { Customer, CustomerType } from './entities/customer.entity';
import { CreateInterestSettingDto } from './dto/interest-setting.dto';
import { AuthOrTokenAuthGuard } from 'src/utils/guards/auth-or-token.guard';


@Controller('customers')
@UseGuards(AuthOrTokenAuthGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  create(@Body() createCustomerDto: CreateCustomerDto) {
    return this.customersService.create(createCustomerDto);
  }

  @Get('customer/:customerType')
  findAll(@Paginate() query: PaginateQuery, @Param('customerType') customer: CustomerType): Promise<Paginated<Customer>> {
    return this.customersService.findAll(query, customer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCustomerDto: UpdateCustomerDto) {
    return this.customersService.update(id, updateCustomerDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.customersService.remove(id);
  }

  @Post('interestSetting')
  async createInterest(@Body() createInterestSettingDto: CreateInterestSettingDto) {
    return await this.customersService.createInterest(createInterestSettingDto);
  }
}
