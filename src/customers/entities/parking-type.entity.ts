import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    OneToOne,
    OneToMany,
  } from 'typeorm';
import { Vehicle } from './vehicle.entity';
  
  export const PARKING_TYPE = ['EXPENSES_1', 'EXPENSES_2', 'EXPENSES_ZOM_1','EXPENSES_ZOM_2','EXPENSES_ZOM_3',
      'EXPENSES_RICARDO_AZNAR', 'EXPENSES_ALDO_FONTELA', 'EXPENSES_NIDIA_FONTELA','EXPENSES_CARLOS_AZNAR'
  ] as const;
  export type Parking = (typeof PARKING_TYPE)[number];

  @Entity({ name: 'parking_types' })
  export class ParkingType {
    @PrimaryGeneratedColumn('uuid')
    id: string;
  
    @Column('int')
    amount: number;

    @Column('enum', { enum: PARKING_TYPE , default: PARKING_TYPE[0]})
    parkingType: Parking;
  
    @OneToMany(() => Vehicle, (vehicle) => vehicle.parkingType, {cascade:true})
    vehicles: Vehicle[];
  }