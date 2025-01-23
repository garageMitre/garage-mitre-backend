import { Exclude } from 'class-transformer';
import { Owner } from 'src/owners/entities/owner.entity';
import { Renter } from 'src/renters/entities/renter.entity';
import { TicketRegistration } from 'src/tickets/entities/ticket-registration.entity';
import {
  Column,
  Entity,
  JoinColumn,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'box_lists' })
export class BoxList {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column('date', { nullable: true })
  date: Date | null;

  @Column('int', { nullable: true })
  totalPrice: number;

  @OneToMany(() => TicketRegistration, (ticketRegistration) => ticketRegistration.boxList, { cascade: true })
  ticketRegistrations: TicketRegistration[];

  @OneToMany(() => Renter, (renters) => renters.boxList)
  renters: Renter[];

  @OneToMany(() => Owner, (owners) => owners.boxList)
  owners: Owner[];
}
