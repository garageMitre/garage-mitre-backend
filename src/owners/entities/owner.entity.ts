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
import { ReceiptOwner } from 'src/receipts/entities/receipt-owner.entity';
  
  @Entity({ name: 'owners' })
  export class Owner {
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
    
    @ManyToOne(() => BoxList, (boxList) => boxList.owners)
    boxList: BoxList;

    @OneToMany(() => ReceiptOwner, (receipts) => receipts.owner, {cascade: true})
    receipts: ReceiptOwner[];
  
    @DeleteDateColumn()
    deletedAt: Date;
  
    @CreateDateColumn()
    createdAt: Date;
  
    @UpdateDateColumn()
    updatedAt: Date;
  
  }
  
