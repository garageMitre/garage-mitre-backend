import { IsNotEmpty, IsNumber } from "class-validator";

export class CreateInterestSettingDto {

  @IsNumber()
  @IsNotEmpty()
  interestOwner: number;

  @IsNumber()
  @IsNotEmpty()
  interestRenter: number;
}
