import { IsArray, IsDate, IsNumber, IsOptional, IsString, Matches } from "class-validator"

export class CreateBoxListDto {

    @IsDate()
    @IsOptional()
    date: Date;

    @IsNumber()
    totalPrice: number

    @IsString()
    @IsOptional()
    Registrations?: string[]
}
