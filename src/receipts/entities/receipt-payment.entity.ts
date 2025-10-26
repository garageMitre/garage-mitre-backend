import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Receipt } from './receipt.entity';
import { BoxList } from 'src/box-lists/entities/box-list.entity';

export const PAYMENT_TYPE = ['TRANSFER', 'CASH', 'CHECK', 'CREDIT', 'TP'] as const;
export type PaymentType = (typeof PAYMENT_TYPE)[number];

@Entity({ name: 'receipt_payments' })
export class ReceiptPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column('enum', { enum: PAYMENT_TYPE, nullable:true})
  paymentType: PaymentType;
  
  @Column('int', {nullable:true})
  price: number;

  @Column('date', { nullable: true })
  paymentDate: string | null;

  @ManyToOne(() => Receipt, (receipt) => receipt.payments, { onDelete: 'CASCADE' })
  receipt: Receipt;

  @ManyToOne(() => BoxList, (boxList) => boxList.receiptPayments, {onDelete: 'CASCADE'})
  boxList: BoxList;
}
