import { IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CUSTOMER_TYPE, CustomerType } from '../entities/customer.entity';
import { Parking, PARKING_TYPE } from '../entities/parking-type.entity';

export class CreateVehicleDto {
    
  @IsString()
  @IsOptional()
  licensePlate: string;

  @IsString()
  @IsOptional()
  garageNumber: string;

  @IsString()
  @IsOptional()
  vehicleBrand: string;

  @IsEnum(PARKING_TYPE)
  @IsOptional()
  parking: Parking;

  @IsNumber()
  @IsOptional()
  amount: number;

}

export class UpdateCustomerDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsString()
  email: string;

  @IsString()
  address: string;

  @IsNumber()
  @IsOptional()
  documentNumber: number;

  @IsNumber()
  numberOfVehicles: number;

  @IsEnum(CUSTOMER_TYPE)
  customerType: CustomerType;

  @IsArray()
  @ValidateNested({ each: true }) // Validar cada vehículo individualmente
  @Type(() => CreateVehicleDto) // Transformar a la clase `CreateVehicleDto`
  vehicles?: CreateVehicleDto[]; // Hacer que los vehículos sean opcionales
}

