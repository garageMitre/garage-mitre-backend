import {
    Entity,
    Column,
    ManyToOne,
    PrimaryGeneratedColumn,
    DeleteDateColumn,
    OneToOne,
} from 'typeorm';
import { Customer } from './customer.entity';
import { Vehicle } from './vehicle.entity';

  @Entity({ name: 'vehicle_renters' })
  export class VehicleRenter {
    @PrimaryGeneratedColumn('uuid')
    id: string;
    
    @Column('varchar',{nullable:true})
    garageNumber: string;
  
    @Column('int',{nullable:true})
    amount: number;

    @Column('varchar',{nullable:true})
    owner: string;

    @ManyToOne(() => Vehicle, (vehicle) => vehicle.vehicleRenters)
    vehicle: Vehicle;
  
    @ManyToOne(() => Customer, (customer) => customer.vehicleRenters, { onDelete: 'CASCADE' })
    customer: Customer;

    @DeleteDateColumn()
    deletedAt: Date;
  }
  