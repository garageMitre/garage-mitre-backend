import { Allow, IsArray, IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Customer, CUSTOMER_TYPE, CustomerType } from '../entities/customer.entity';
import { Parking, PARKING_TYPE } from '../entities/parking-type.entity';
import { PAYMENT_TYPE, PaymentType } from 'src/receipts/entities/receipt-payment.entity';

export class CreateVehicleDto {

  @IsString()
  @IsOptional()
  licensePlate: string;

  @IsString()
  @IsOptional()
  garageNumber: string;

  @IsBoolean()
  @IsOptional()
  rent: boolean;

  @IsEnum(PARKING_TYPE)
  @IsOptional()
  parking: Parking;

  @IsNumber()
  @IsOptional()
  amount: number;

  @IsNumber()
  @IsOptional()
  amountRenter: number;
}

export class CreateVehicleRenterDto {
        
  @IsString()
  @IsOptional()
  licensePlate: string;

  @IsString()
  @IsOptional()
  garageNumber: string;

  @Allow()
  @IsOptional()
  owner?: string;

  @IsNumber()
  @IsOptional()
  amount: number;

}

export class CreateCustomerDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsString()
  phone: string;

  @IsString()
  @IsOptional()
  comments: string;

  @IsNumber()
  @IsOptional()
  customerNumber: number;

  @IsNumber()
  numberOfVehicles: number;

  @IsEnum(CUSTOMER_TYPE)
  customerType: CustomerType;

  @IsBoolean()
  @IsOptional()
  hasDebt: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MonthDebtDto)
  monthsDebt?: MonthDebtDto[];

  @IsNumber()
  credit: number;

  @IsArray()
  @ValidateNested({ each: true }) // Validar cada vehículo individualmente
  @Type(() => CreateVehicleDto)
  @IsOptional() // Transformar a la clase `CreateVehicleDto`
  vehicles?: CreateVehicleDto[]; // Hacer que los vehículos sean opcionales

  @IsArray()
  @ValidateNested({ each: true }) // Validar cada vehículo individualmente
  @Type(() => CreateVehicleRenterDto)
  @IsOptional() // Transformar a la clase `CreateVehicleDto`
  vehicleRenters?: CreateVehicleRenterDto[]; // Hacer que los vehículos sean opcionales
}

class MonthDebtDto {
  @IsString()
  month: string; // Formato esperado: 'YYYY-MM'

  @IsNumber()
  @IsOptional()
  amount?: number; // Monto de la deuda para ese mes

  @IsEnum(PAYMENT_TYPE)
  @IsOptional()
  paymentType: PaymentType;
}

