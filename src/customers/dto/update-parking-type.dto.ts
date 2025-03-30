import { IsEnum, IsNotEmpty, IsNumber } from "class-validator";
import { Parking, PARKING_TYPE } from "../entities/parking-type.entity";

export class UpdateParkingTypeDto {

  @IsEnum(PARKING_TYPE)
  parkingType: Parking;

  @IsNumber()
  @IsNotEmpty()
  amount: number;
}