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
import { Owner } from 'src/owners/entities/owner.entity';
import { Renter } from 'src/renters/entities/renter.entity';

export const PAYMENT_STATUS_TYPE = ['PENDING', 'PAID'] as const;
export type PaymentStatusType = (typeof PAYMENT_STATUS_TYPE)[number];
@Entity({ name: 'receipts_renters' })
export class ReceiptRenter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('enum', { enum: PAYMENT_STATUS_TYPE, default:'PENDING'})
  status: PaymentStatusType;

  @Column('date', { nullable: true })
  paymentDate: Date | null;

  @ManyToOne(() => Renter, (renter) => renter.receipts, { onDelete: 'CASCADE' })
  @JoinColumn()
  renter: Renter;
  
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updateAt: Date;
}
