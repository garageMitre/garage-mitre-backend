import { IsBoolean, IsEnum, IsOptional } from "class-validator";
import { PAYMENT_TYPE, PaymentType } from "../entities/receipt.entity";


export class UpdateReceiptDto {

    @IsEnum(PAYMENT_TYPE)
    paymentType: PaymentType

    @IsBoolean()
    @IsOptional()
    print: boolean;
}
