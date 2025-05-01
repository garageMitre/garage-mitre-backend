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

@Entity({ name: 'ticket_registration_for_days' })
export class TicketRegistrationForDay {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column('varchar', { length: 255 })
  description: string;

  @Column('int')
  price: number;

  @Column('int', {nullable:true})
  days: number;

  @Column('int', {nullable:true})
  weeks: number;
  
  @Column('date', { nullable: true })
  dateNow: string | null;

  @ManyToOne(() => BoxList, (boxList) => boxList.ticketRegistrationForDays, {onDelete: 'CASCADE'})
  boxList: BoxList;

  @CreateDateColumn()
  createdAt: Date;

}
