import { IsArray, IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CUSTOMER_TYPE, CustomerType } from '../entities/customer.entity';

export class UpdateAmountAllCustomerDto {
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsEnum(CUSTOMER_TYPE)
  customerType: CustomerType;

  @IsString()
  @IsOptional()
  ownerTypeOfRenter: string
}
