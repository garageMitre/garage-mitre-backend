import { PartialType } from "@nestjs/mapped-types";
import { CreateOtherPaymentDto } from "./create-other-payment.dto";

export class UpdateOtherPaymentDto extends PartialType(CreateOtherPaymentDto) {}
