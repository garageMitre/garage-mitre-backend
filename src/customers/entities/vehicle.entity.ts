import {
    Entity,
    Column,
    ManyToOne,
    PrimaryGeneratedColumn,
    OneToOne,
  } from 'typeorm';
  import { Customer } from './customer.entity';
import { ParkingType } from './parking-type.entity';
  @Entity({ name: 'vehicles' })
  export class Vehicle {
    @PrimaryGeneratedColumn('uuid')
    id: string;
  
    @Column('varchar', { length: 255, nullable:true })
    licensePlate: string;
    
    @Column('int',{nullable:true})
    garageNumber: number;
  
    @Column('varchar', { length: 255, nullable:true })
    vehicleBrand: string;
  
    @Column('int',{nullable:true})
    amount: number;

    @ManyToOne(() => ParkingType, (parkingType) => parkingType.vehicles, { onDelete: 'CASCADE' })
    parkingType: ParkingType;
  
    @ManyToOne(() => Customer, (customer) => customer.vehicles, { onDelete: 'CASCADE' })
    customer: Customer;
  }
  