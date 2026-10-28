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
