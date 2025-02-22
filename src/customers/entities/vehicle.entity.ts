import {
    Entity,
    Column,
    ManyToOne,
    PrimaryGeneratedColumn,
  } from 'typeorm';
  import { Customer } from './customer.entity';
  
  @Entity({ name: 'vehicles' })
  export class Vehicle {
    @PrimaryGeneratedColumn('uuid')
    id: string;
  
    @Column('varchar', { length: 255 })
    licensePlate: string;
  
    @Column('varchar', { length: 255 })
    vehicleBrand: string;
  
    @Column('int')
    amount: number;
  
    @ManyToOne(() => Customer, (customer) => customer.vehicles, { onDelete: 'CASCADE' })
    customer: Customer;
  }
  