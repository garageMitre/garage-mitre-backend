import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Customer } from './customer.entity';

@Entity({ name: 'interest_customers' })
export class InterestCustomer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('int') 
  interest: number;
  
  @ManyToOne(() => Customer, (customer) => customer.interests, { onDelete: 'CASCADE' }) 
  customer: Customer;

  @UpdateDateColumn()
  updatedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
