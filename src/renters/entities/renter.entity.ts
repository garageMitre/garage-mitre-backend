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
  import { BoxList } from 'src/box-lists/entities/box-list.entity';
import { ReceiptRenter } from 'src/receipts/entities/receipt-renter.entity';
  
  @Entity({ name: 'renters' })
  export class Renter {
    @PrimaryGeneratedColumn('uuid')
    id: string;
    
    @Column('varchar', { length: 255 })
    firstName: string;
  
    @Column('varchar', { length: 255 })
    lastName: string;  

    @Column('varchar', { length: 255, unique: true })
    @Index({ unique: true })
    email: string;

    @Column('varchar', { length: 255 })
    address: string; 
    
    @Column('int')
    documentNumber: number;

    @Column('int')
    numberOfVehicles: number;
    
    @Column('simple-array', { nullable: true })
    vehicleLicensePlates: string[];
  
    @Column('simple-array', { nullable: true })
    vehicleBrands: string[];
    
    @ManyToOne(() => BoxList, (boxList) => boxList.renters)
    boxList: BoxList;

    @OneToMany(() => ReceiptRenter, (receipts) => receipts.renter, {cascade: true})
    receipts: ReceiptRenter[];

    @DeleteDateColumn()
    deletedAt: Date;
  
    @CreateDateColumn()
    createdAt: Date;
  
    @UpdateDateColumn()
    updatedAt: Date;
  
  
  }
  