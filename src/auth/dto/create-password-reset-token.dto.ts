import { IsEmail, IsNotEmpty } from 'class-validator';

export class CreatePasswordResetTokenDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
