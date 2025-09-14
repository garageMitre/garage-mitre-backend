import { IsArray, IsDate, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Matches } from "class-validator"
import { PAYMENT_TYPE, PaymentType } from "../entities/other-payment.entity";

export class CreateOtherPaymentDto {

    @IsString()
    @IsOptional()
    description: string;

    @IsEnum(PAYMENT_TYPE)
    @IsOptional()
    type: PaymentType;

    @IsNumber()
    @IsNotEmpty()
    price: number
}
