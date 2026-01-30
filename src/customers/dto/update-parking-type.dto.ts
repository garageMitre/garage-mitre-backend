
import { Parking, PARKING_TYPE } from "../entities/parking-type.entity";

import { IsEnum, IsNotEmpty, IsNumber, IsString, Matches } from "class-validator"

export class UpdateParkingTypeDto {
  @IsEnum(PARKING_TYPE)
  parkingType: Parking

  @IsNumber()
  @IsNotEmpty()
  amount: number

  // Ej: "2026-02"
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "month debe ser YYYY-MM (ej: 2026-02)" })
  month: string
}
