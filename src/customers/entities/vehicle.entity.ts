import {
    Entity,
    Column,
    ManyToOne,
    PrimaryGeneratedColumn,
  } from 'typeorm';
  import { Customer } from './customer.entity';
  
  export const PARKING_TYPE = ['ONE_TYPE', 'EXPENSES_1', 'EXPENSES_2', 'EXPENSES_3'] as const;
  export type ParkingType = (typeof PARKING_TYPE)[number];

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

    @Column('enum', { enum: PARKING_TYPE , default: PARKING_TYPE[0]})
    parkingType: ParkingType;
  
    @ManyToOne(() => Customer, (customer) => customer.vehicles, { onDelete: 'CASCADE' })
    customer: Customer;
  }
  