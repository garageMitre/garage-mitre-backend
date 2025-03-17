import { IsEnum } from "class-validator";
import { PAYMENT_TYPE, PaymentType } from "../entities/receipt.entity";


export class UpdateReceiptDto {

    @IsEnum(PAYMENT_TYPE)
    paymentType: PaymentType
}
