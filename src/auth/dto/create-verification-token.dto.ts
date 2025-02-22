import { IsEmail, IsNotEmpty } from 'class-validator';

export class CreateVerificationTokenDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
