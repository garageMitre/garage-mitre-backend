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

    @Column('varchar', { length: 255 })
    email: string;

    @Column('varchar', { length: 255 })
    address: string; 
    
    @Column('int', {nullable:true})
    documentNumber: number;

    @Column('int')
    numberOfVehicles: number;

    @Column('date', { nullable: true })
    startDate: string | null;

    @Column('date', { nullable: true })
    previusStartDate: string | null;

    @Column('enum', { enum: CUSTOMER_TYPE})
    customerType: CustomerType;

    @OneToMany(() => Vehicle, (vehicle) => vehicle.customer, { cascade: true, eager: true })
    vehicles: Vehicle[];

    @OneToMany(() => Receipt, (receipts) => receipts.customer, {cascade: true})
    receipts: Receipt[];
  
    @DeleteDateColumn()
    deletedAt: Date;
  
    @CreateDateColumn()
    createdAt: Date;
  
    @UpdateDateColumn()
    updatedAt: Date;
  
  }
  
