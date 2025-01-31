import {
    Column,
    CreateDateColumn,
    DeleteDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    OneToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
  } from 'typeorm';
  import { BoxList } from 'src/box-lists/entities/box-list.entity';
  
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
    
    @Column('varchar', { length: 255 })
    vehicleLicesePlate: string;  

    @Column('varchar', { length: 255 })
    vehicleBrand: string;  
    
    @DeleteDateColumn()
    deletedAt: Date;
  
    @CreateDateColumn()
    createdAt: Date;
  
    @UpdateDateColumn()
    updatedAt: Date;
  
    @ManyToOne(() => BoxList, (boxList) => boxList.renters)
    boxList: BoxList;
  
  }
  