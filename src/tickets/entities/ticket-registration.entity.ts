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
import { Ticket } from './ticket.entity';
import { BoxList } from 'src/box-lists/entities/box-list.entity';
@Entity({ name: 'ticket_registrations' })
export class TicketRegistration {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column('varchar', { length: 255 })
  description: string;

  @Column('int')
  price: number;

  @Column('varchar', {nullable: true})
  codeBarTicket: string;
  
  @Column('date', { nullable: true })
  entryDay: string | null;
  
  @Column('date', { nullable: true })
  departureDay: string | null;
  
  @Column('time', { nullable: true })
  entryTime: string | null;
  
  @Column('time', { nullable: true })
  departureTime: string | null;

  @Column('date', { nullable: true })
  dateNow: string | null;

  // Monto cobrado por adelantado sobre una entrada todavía activa (opcional). Al cerrar el
  // registro solo se acredita a caja la diferencia entre el precio final y este monto.
  @Column('int', { nullable: true })
  advancePaidAmount: number | null;

  // Cómo se cobró el anticipo — se carga una única vez junto con el monto, no se modifica después.
  @Column('varchar', { length: 20, nullable: true })
  advancePaymentMetodo: 'CASH' | 'TRANSFER' | null;

  // Franja de precio que el operador avisó que esperaba (ej. "Hasta 2 horas") al cobrar el
  // anticipo — no implica que sea la franja final, solo sirve para avisar si se pasó o no.
  @Column('varchar', { length: 255, nullable: true })
  expectedBracketLabel: string | null;

  @Column('int', { nullable: true })
  expectedUptoMinutes: number | null;

  // Cómo pagó el monto final al registrar la salida (independiente del método del anticipo).
  @Column('varchar', { length: 20, nullable: true })
  paymentMetodo: 'CASH' | 'TRANSFER' | null;

  @OneToOne(() => Ticket, (ticket) => ticket.ticketRegistration)
  @JoinColumn()
  ticket: Ticket;

  @ManyToOne(() => BoxList, (boxList) => boxList.ticketRegistrations, {onDelete: 'CASCADE'})
  boxList: BoxList;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

}
