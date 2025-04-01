import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BoxList } from 'src/box-lists/entities/box-list.entity';
import { Customer } from 'src/customers/entities/customer.entity';

export const PAYMENT_STATUS_TYPE = ['PENDING', 'PAID'] as const;
export type PaymentStatusType = (typeof PAYMENT_STATUS_TYPE)[number];

export const PAYMENT_TYPE = ['TRANSFER', 'CASH'] as const;
export type PaymentType = (typeof PAYMENT_TYPE)[number];

@Entity({ name: 'receipts' })
export class Receipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('enum', { enum: PAYMENT_STATUS_TYPE, default:'PENDING'})
  status: PaymentStatusType;

  @Column('enum', { enum: PAYMENT_TYPE, nullable:true})
  paymentType: PaymentType;

  @Column('date', { nullable: true })
  paymentDate: string | null;

  @Column('date', { nullable: true })
  startDate: string | null;

  @Column('int')
  price: number;

  @Column('varchar', { nullable: true })
  receiptNumber: string;  

  @Column('int')
  startAmount: number;

  @Column('date', { nullable: true })
  lastInterestApplied: Date | null; 

  @Column('int', {nullable: true})
  interestPercentage: number;
  
  @Column('date', { nullable: true })
  dateNow: string | null;

  @ManyToOne(() => Customer, (customer) => customer.receipts, { onDelete: 'CASCADE' })
  @JoinColumn()
  customer: Customer;

  @ManyToOne(() => BoxList, (boxList) => boxList.receipts, {onDelete: 'CASCADE'})
  boxList: BoxList;
  
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updateAt: Date;
}
