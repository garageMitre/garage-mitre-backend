
import { Receipt } from 'src/receipts/entities/receipt.entity';
import { TicketRegistration } from 'src/tickets/entities/ticket-registration.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BoxList } from './box-list.entity';

@Entity({ name: 'other_payments' })
export class OtherPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column('varchar')
  description: string;

  @Column('int')
  price: number;

  @ManyToOne(() => BoxList, (boxList) => boxList.otherPayments, { cascade: true })
  boxList: BoxList;
}
