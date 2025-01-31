import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Ticket } from './ticket.entity';
import { BoxList } from 'src/box-lists/entities/box-list.entity';
import { Exclude } from 'class-transformer';

export const TICKET_TYPE = ['AUTO', 'CAMIONETA', 'MOTO'] as const;
export type TicketType = (typeof TICKET_TYPE)[number];

@Entity({ name: 'ticket_registrations' })
export class TicketRegistration {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column('varchar', { length: 255, nullable: true })
  description: string;

  @Column('int', {nullable: true})
  price: number;
  
  @Column('date', { nullable: true })
  entryDay: Date | null;
  
  @Column('date', { nullable: true })
  departureDay: Date | null;
  
  @Column('time', { nullable: true })
  entryTime: string | null;
  
  @Column('time', { nullable: true })
  departureTime: string | null;

  @OneToOne(() => Ticket, (ticket) => ticket.ticketRegistration)
  @JoinColumn()
  ticket: Ticket;

  @ManyToOne(() => BoxList, (boxList) => boxList.ticketRegistrations, {onDelete: 'CASCADE'})
  boxList: BoxList;

  @CreateDateColumn()
  createdAt: Date;

}
