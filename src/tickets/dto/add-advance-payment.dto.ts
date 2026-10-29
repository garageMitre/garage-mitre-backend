import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class AddAdvancePaymentDto {
  @IsInt()
  @Min(0)
  advancePaidAmount: number;

  // Obligatorio cuando advancePaidAmount es mayor a 0 (verificado en el servicio) — cómo se
  // cobró el anticipo: efectivo o transferencia.
  @IsIn(['CASH', 'TRANSFER'])
  @IsOptional()
  metodo?: 'CASH' | 'TRANSFER';

  // Duración que el operador avisó que esperaba (nombre de la franja elegida en el form) y su
  // tope en minutos, para poder avisar si la estadía real la supera. Ambos opcionales.
  @IsString()
  @IsOptional()
  expectedBracketLabel?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  expectedUptoMinutes?: number;
}
