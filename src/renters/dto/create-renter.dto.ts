import { IsArray, IsNotEmpty, IsNumber, IsString } from "class-validator";

export class CreateRenterDto {

        @IsString()
        @IsNotEmpty()
        firstName: string;
    
        @IsString()
        @IsNotEmpty()
        lastName: string;
    
        @IsString()
        @IsNotEmpty()
        email: string;

        @IsString()
        @IsNotEmpty()
        address: string;
    
        @IsNumber()
        @IsNotEmpty()
        documentNumber: number;

        @IsNumber()
        @IsNotEmpty()
        numberOfVehicles: number;
    
        @IsArray()
        @IsNotEmpty()
        vehicleLicensePlates: string[];
    
        @IsArray()
        @IsNotEmpty()
        vehicleBrands: string[];
}
