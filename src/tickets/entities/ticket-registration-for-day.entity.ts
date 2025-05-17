import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BoxList } from 'src/box-lists/entities/box-list.entity';
import { TICKET_TIME_TYPE, TicketTimeType } from './ticket-price.entity';

@Entity({ name: 'ticket_registration_for_days' })
export class TicketRegistrationForDay {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column('varchar', { length: 255 })
  description: string;

  @Column('int')
  price: number;

  @Column('int', {nullable:true})
  weeks: number;

  @Column('int', {nullable:true})
  days: number;
  
  @Column('date', { nullable: true })
  dateNow: string | null;

  @Column('enum', { enum: TICKET_TIME_TYPE, nullable:true})
  ticketTimeType: TicketTimeType;

  @Column('varchar', { length: 100, nullable:true })
  firstNameCustomer: string;

  @Column('varchar', { length: 100, nullable:true  })
  lastNameCustomer: string;

  @Column('varchar', { length: 50, nullable:true  })
  vehiclePlateCustomer: string;

  @Column('boolean', { nullable: true })
  paid: boolean;

  @Column('boolean', { nullable: true })
  retired: boolean;

  @ManyToOne(() => BoxList, (boxList) => boxList.ticketRegistrationForDays, {onDelete: 'CASCADE'})
  boxList: BoxList;

  @CreateDateColumn()
  createdAt: Date;

}
