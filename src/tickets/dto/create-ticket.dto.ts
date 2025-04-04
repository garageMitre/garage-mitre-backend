import { IsEnum, IsNotEmpty, IsNumber, IsString } from "class-validator";
import { TICKET_TYPE, TicketType } from "../entities/ticket.entity";

export class CreateTicketDto {

    @IsString()
    @IsNotEmpty()
    codeBar: string

    @IsNumber()
    @IsNotEmpty()
    dayPrice: number

    @IsNumber()
    @IsNotEmpty()
    nightPrice: number

    @IsEnum(TICKET_TYPE)
    vehicleType: TicketType;
}
