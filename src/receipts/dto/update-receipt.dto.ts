import { IsBoolean, IsEnum, IsOptional, IsString } from "class-validator";
import { PAYMENT_TYPE, PaymentType } from "../entities/receipt.entity";


export class UpdateReceiptDto {

    @IsEnum(PAYMENT_TYPE)
    @IsOptional()
    paymentType: PaymentType

    @IsBoolean()
    @IsOptional()
    print: boolean;

    @IsString()
    @IsOptional()
    barCode: string;
}
