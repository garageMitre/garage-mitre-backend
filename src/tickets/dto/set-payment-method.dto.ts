import { IsIn } from 'class-validator';

export class SetPaymentMethodDto {
  @IsIn(['CASH', 'TRANSFER'])
  metodo: 'CASH' | 'TRANSFER';
}
