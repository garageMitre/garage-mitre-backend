import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Matches } from "class-validator";
import { TICKET_TIME_TYPE, TicketTimeType } from "../entities/ticket-price.entity";
import { TICKET_TYPE, TicketType } from "../entities/ticket.entity";

export class CreateTicketRegistrationForDayDto {

    @IsNumber()
    @IsOptional()
    weeks: number;

    @IsNumber()
    @IsOptional()
    days: number;
    
    @IsEnum(TICKET_TIME_TYPE)
    ticketTimeType: TicketTimeType;

    @IsEnum(TICKET_TYPE)
    vehicleType: TicketType;

    @IsString()
    @IsOptional()
    firstNameCustomer: string;

    @IsString()
    @IsNotEmpty()
    lastNameCustomer: string;

    @IsString()
    @IsOptional()
    vehiclePlateCustomer: string;

    @IsBoolean()
    @IsOptional()
    paid: boolean;

    @IsBoolean()
    @IsOptional()
    retired: boolean;

}


export class UpdateTicketStatusDto {
  @IsOptional()
  @IsBoolean()
  paid?: boolean;

  @IsOptional()
  @IsBoolean()
  retired?: boolean;
}
