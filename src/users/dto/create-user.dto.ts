import {
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString
  } from 'class-validator';
  import { USER_ROLES, UserRole } from 'src/users/entities/user.entity';
  
  export class CreateUserDto {
    @IsString()
    @IsNotEmpty()
    email: string;

    @IsString()
    @IsNotEmpty()
    firstName: string;
  
    @IsString()
    @IsNotEmpty()
    lastName: string;  
  
    @IsString()
    @IsOptional()
    password: string;
  
    @IsString()
    @IsNotEmpty()
    username: string;
  
    @IsEnum(USER_ROLES)
    role: UserRole;
  }
  