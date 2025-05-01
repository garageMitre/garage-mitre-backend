import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { Paginate, Paginated, PaginateQuery } from 'nestjs-paginate';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, CreateVehicleDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { Customer, CustomerType } from './entities/customer.entity';
import { CreateInterestSettingDto } from './dto/interest-setting.dto';
import { AuthOrTokenAuthGuard } from 'src/utils/guards/auth-or-token.guard';
import { UpdateAmountAllCustomerDto } from './dto/update-amount-all-customers.dto';
import { CreateParkingTypeDto } from './dto/create-parking-type.dto';
import { ParkingType } from './entities/parking-type.entity';
import { UpdateParkingTypeDto } from './dto/update-parking-type.dto';


@Controller('customers')
@UseGuards(AuthOrTokenAuthGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  create(@Body() createCustomerDto?: CreateCustomerDto) {
    return this.customersService.updateRenters(createCustomerDto);
  }

  @Get('customer/:customerType')
  findAll(@Param('customerType') customer: CustomerType) {
    return this.customersService.findAll(customer);
  }

  @Get('vehicleRenter')
  async getCustomerVehicleRenter() {
    return await this.customersService.getCustomerVehicleRenter();
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

  @Delete('softDelete/:id')
  softDelete(@Param('id') id: string) {
    return this.customersService.softDelete(id);
  }

  @Patch('restoredCustomer/:id')
  restoredCustomer(@Param('id') id: string) {
    return this.customersService.restoredCustomer(id);
  }

  @Post('interestSetting')
  async createInterest(@Body() createInterestSettingDto: CreateInterestSettingDto) {
    return await this.customersService.createInterest(createInterestSettingDto);
  }

  @Get('interestSetting/interest')
  async findInterest() {
    return await this.customersService.findInterest();
  }

  @Patch('update/updateAmount') 
  updateAmount(@Body() updateAmountAllCustomerDto: UpdateAmountAllCustomerDto) {
    return this.customersService.updateAmount(updateAmountAllCustomerDto);
  }

  @Post('parking/parkingTypes')
  createParkingType(@Body() createParkingTypeDto: CreateParkingTypeDto) {
    return this.customersService.createParkingType(createParkingTypeDto);
  }

  @Get('parking/parkingTypes')
  findAllParkingType(@Paginate() query: PaginateQuery): Promise<Paginated<ParkingType>> {
    return this.customersService.findAllParkingType(query);
  }

  @Patch('parking/parkingTypes/:parkingTypeId')
  updateparkingType(@Param('parkingTypeId') parkingTypeId: string, @Body() updateParkingTypeDto: UpdateParkingTypeDto) {
    return this.customersService.updateparkingType(parkingTypeId, updateParkingTypeDto);
  }

  @Delete('parking/parkingTypes/:parkingTypeId')
  removeParkingType(@Param('parkingTypeId') parkingTypeId: string) {
    return this.customersService.removeParkingType(parkingTypeId);
  }
}
