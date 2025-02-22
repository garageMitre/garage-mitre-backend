
import { Receipt } from 'src/receipts/entities/receipt.entity';
import { TicketRegistration } from 'src/tickets/entities/ticket-registration.entity';
import {
  Column,
  Entity,
  JoinColumn,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OtherPayment } from './other-payment.entity';
import { TicketRegistrationForDay } from 'src/tickets/entities/ticket-registration-for-day.entity';

@Entity({ name: 'box_lists' })
export class BoxList {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column('date')
  date: Date | null;

  @Column('int')
  totalPrice: number;

  @OneToMany(() => TicketRegistration, (ticketRegistration) => ticketRegistration.boxList, { cascade: true })
  ticketRegistrations: TicketRegistration[];

  @OneToMany(() => TicketRegistrationForDay, (ticketRegistrationForDays) => ticketRegistrationForDays.boxList, { cascade: true })
  ticketRegistrationForDays: TicketRegistrationForDay[];

  @OneToMany(() => Receipt, (receipts) => receipts.boxList)
  receipts: Receipt[];

  @OneToMany(() => OtherPayment, (otherPayments) => otherPayments.boxList)
  otherPayments: OtherPayment[];
}
