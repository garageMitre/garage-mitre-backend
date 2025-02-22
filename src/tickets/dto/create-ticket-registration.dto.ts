import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Matches } from "class-validator";

export class CreateTicketRegistrationDto {

    @IsString()
    @IsNotEmpty()
    description: string

    @IsNumber()
    @IsNotEmpty()
    price: number

    @IsString()
    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    entryDay: Date

    @IsString()
    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    departureDay: Date

    @IsString()
    @IsNotEmpty()
    entryTime: string

    @IsString()
    @IsNotEmpty()
    departureTime: string
}
