import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";
import { TICKET_TIME_TYPE, TicketTimeType, VEHICLE_TYPE, VehicleType } from "../entities/ticket-price.entity";

export class CreateTicketPriceDto {

    @IsNumber()
    @IsOptional()
    dayPrice: number

    @IsNumber()
    @IsOptional()
    nightPrice: number

    @IsNumber()
    @IsOptional()
    ticketTimePrice: number;

    @IsEnum(VEHICLE_TYPE)
    @IsOptional()
    vehicleType: VehicleType;

    @IsEnum(TICKET_TIME_TYPE)
    @IsOptional()
    ticketTimeType: TicketTimeType;
}
