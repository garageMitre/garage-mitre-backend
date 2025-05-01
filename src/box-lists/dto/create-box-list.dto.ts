import { IsArray, IsDate, IsNumber, IsOptional, IsString, Matches } from "class-validator"

export class CreateBoxListDto {

    @IsString()
    @IsOptional()
    date: string;

    @IsNumber()
    totalPrice: number

    @IsString()
    @IsOptional()
    Registrations?: string[]
}
