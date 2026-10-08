import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { PricingBasis, PricingOptions } from '../pricing/pricing.types';

@Entity({ name: 'ticket_schedule_settings' })
export class TicketScheduleSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('int')
  dayStartHour: number;

  @Column('int')
  dayEndHour: number;

  // Tolerancia (en minutos) antes de saltar a cobrar la franja de precio siguiente.
  @Column('int', { default: 5 })
  graceMinutes: number;

  // Si está apagado, la pantalla de operación no muestra nada del flujo por código de barras
  // (escáner, grilla de tickets, ni esos tickets en "Activos ahora") — queda solo el flujo
  // por patente. No borra ni bloquea nada del lado del servidor, es puramente de interfaz.
  @Column('boolean', { default: true })
  barcodeTicketsEnabled: boolean;

  // Qué horario (día/noche) define el precio de toda la estadía cuando no se separan los tramos.
  // EXIT es lo que se hacía siempre: se miraba la hora de la salida.
  @Column('varchar', { length: 10, default: 'EXIT' })
  pricingDayTypeBasis: PricingBasis;

  // Forma de cobro (lista de precios o por hora/fracción) y cruce de horarios. null = lista de
  // precios con las franjas, que es como cobraba el garage antes de que existiera esta opción.
  @Column('jsonb', { nullable: true })
  pricingOptions: PricingOptions | null;

  @UpdateDateColumn()
  updatedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
