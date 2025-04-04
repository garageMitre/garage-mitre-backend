import {
  Column,
  Entity,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TicketRegistration } from './ticket-registration.entity';

export const TICKET_TYPE = ['AUTO', 'CAMIONETA'] as const;
export type TicketType = (typeof TICKET_TYPE)[number];

@Entity({ name: 'tickets' })
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column('varchar', { length: 255 })
  codeBar: string;

  @Column('int', {nullable:true})
  price: number;

  @Column('int',)
  dayPrice: number;

  @Column('int',)
  nightPrice: number;
  
  @Column('enum', { enum: TICKET_TYPE})
  vehicleType: TicketType;

  @OneToOne(() => TicketRegistration, (ticketRegistration) => ticketRegistration.ticket)
  ticketRegistration: TicketRegistration;
}
