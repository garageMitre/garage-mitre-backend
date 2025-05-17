import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export const VEHICLE_TYPE = ['AUTO', 'CAMIONETA'] as const;
export type VehicleType = (typeof VEHICLE_TYPE)[number];

export const TICKET_TIME_TYPE = ['DIA', 'SEMANA','SEMANA_Y_DIA'] as const;
export type TicketTimeType = (typeof TICKET_TIME_TYPE)[number];

@Entity({ name: 'tickets-price' })
export class TicketPrice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('int',{nullable:true})
  dayPrice: number;

  @Column('int', {nullable:true})
  nightPrice: number;

  @Column('int', {nullable:true})
  ticketTimePrice: number;

  @Column('enum', { enum: VEHICLE_TYPE, nullable:true})
  vehicleType: VehicleType;

  @Column('enum', { enum: TICKET_TIME_TYPE, nullable:true})
  ticketTimeType: TicketTimeType;

}
