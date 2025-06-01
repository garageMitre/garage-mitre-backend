import {
    Column,
    CreateDateColumn,
    DeleteDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    OneToMany,
    OneToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
  } from 'typeorm';
import { Receipt } from 'src/receipts/entities/receipt.entity';
import { Vehicle } from './vehicle.entity';
import { VehicleRenter } from './vehicle-renter.entity';

export const CUSTOMER_TYPE = ['OWNER', 'RENTER', 'PRIVATE'] as const;
export type CustomerType = (typeof CUSTOMER_TYPE)[number];

  @Entity({ name: 'customers' })
  export class Customer {
    @PrimaryGeneratedColumn('uuid')
    id: string;
    
    @Column('varchar', { length: 255 })
    firstName: string;
  
    @Column('varchar', { length: 255 })
    lastName: string;  

    @Column('varchar', {nullable:true, length: 255 })
    phone: string;

    @Column('varchar', { length: 650, nullable: true })
    comments: string;

    @Column('int', {nullable:true})
    customerNumber: number;

    @Column('int')
    numberOfVehicles: number;

    @Column('date', { nullable: true })
    startDate: string | null;

    @Column('date', { nullable: true })
    previusStartDate: string | null;

    @Column('enum', { enum: CUSTOMER_TYPE})
    customerType: CustomerType;

    @Column('bool', { nullable:true, default:false })
    hasDebt: boolean;
    
    @Column({ type: 'jsonb', nullable: true })
    monthsDebt?: {
      month: string;
      amount?: number;
    }[];

    @OneToMany(() => Vehicle, (vehicle) => vehicle.customer, { cascade: true})
    vehicles: Vehicle[];

    @OneToMany(() => Receipt, (receipts) => receipts.customer, {cascade: true})
    receipts: Receipt[];

    @OneToMany(() => VehicleRenter, (vehicleRenter) => vehicleRenter.customer,{ cascade: true})
    vehicleRenters: VehicleRenter[];
  
    @DeleteDateColumn()
    deletedAt: Date;
  
    @CreateDateColumn()
    createdAt: Date;
  
    @UpdateDateColumn()
    updatedAt: Date;
  
  }
  
