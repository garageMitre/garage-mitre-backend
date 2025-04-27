import {
    Entity,
    Column,
    ManyToOne,
    PrimaryGeneratedColumn,
    OneToOne,
    DeleteDateColumn,
    OneToMany,
    UpdateDateColumn,
  } from 'typeorm';
  import { Customer } from './customer.entity';
import { ParkingType } from './parking-type.entity';
import { VehicleRenter } from './vehicle-renter.entity';
  @Entity({ name: 'vehicles' })
  export class Vehicle {
    @PrimaryGeneratedColumn('uuid')
    id: string;
    
    @Column('varchar',{nullable:true})
    garageNumber: string;
  
    @Column('bool', { nullable:true, default:false })
    rent: boolean;

    @Column('bool', { nullable:true, default:false })
    rentActive: boolean;
  
    @Column('int',{nullable:true})
    amount: number;

    @Column('int',{nullable:true})
    amountRenter: number;

    @ManyToOne(() => ParkingType, (parkingType) => parkingType.vehicles, { onDelete: 'CASCADE' })
    parkingType: ParkingType;
  
    @ManyToOne(() => Customer, (customer) => customer.vehicles, { onDelete: 'CASCADE' })
    customer: Customer;

    @OneToMany(() => VehicleRenter, (vehicleRenter) => vehicleRenter.vehicle)
    vehicleRenters: VehicleRenter[];

    @DeleteDateColumn()
    deletedAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
      
  }
  