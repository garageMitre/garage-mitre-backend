import { IsNotEmpty, IsNumber, IsString } from "class-validator";

export class CreateOwnerDto {

        @IsString()
        @IsNotEmpty()
        firstName: string;
    
        @IsString()
        @IsNotEmpty()
        lastName: string;
    
        @IsString()
        @IsNotEmpty()
        email: string;
    
        @IsNumber()
        @IsNotEmpty()
        documentNumber: number;
    
        @IsString()
        @IsNotEmpty()
        vehicleLicesePlate: string
    
        @IsString()
        @IsNotEmpty()
        vehicleBrand: string;
}

