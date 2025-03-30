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
import { User } from 'src/users/entities/user.entity';

@Entity({ name: 'notes' })
export class Note {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column('varchar', { length: 650 })
  description: string;

  @Column('date', { nullable: true })
  date: string | null;
  
  @Column('time', { nullable: true })
  hours: string | null;
  
  @ManyToOne(() => User, (user) => user.notes, {onDelete: 'CASCADE'})
  user: User;

  @CreateDateColumn()
  createdAt: Date;

}
