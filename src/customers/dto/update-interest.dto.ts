import { IsNotEmpty, IsNumber } from "class-validator";


export class InterestDto {

    @IsNumber()
    @IsNotEmpty()
    interestOwner: number;

    @IsNumber()
    @IsNotEmpty()
    interestRenter: number;

}