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
    
    @Column('int')
    documentNumber: number;
    
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
  
