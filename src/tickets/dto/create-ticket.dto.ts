import { IsEnum, IsNotEmpty, IsString } from "class-validator";
import { TICKET_TYPE, TicketType } from "../entities/ticket.entity";

export class CreateTicketDto {

    @IsString()
    @IsNotEmpty()
    codeBar: string

    @IsEnum(TICKET_TYPE)
    vehicleType: TicketType;
}
