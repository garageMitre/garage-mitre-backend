import { IsArray, IsDate, IsNotEmpty, IsNumber, IsOptional, IsString, Matches } from "class-validator"

export class CreateOtherPaymentDto {

    @IsString()
    @IsOptional()
    description: string;

    @IsNumber()
    @IsNotEmpty()
    price: number
}
