import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Matches } from "class-validator";

export class CreateTicketRegistrationForDayDto {

    @IsNumber()
    @IsNotEmpty()
    price: number

    @IsNumber()
    @IsNotEmpty()
    days: number
}
