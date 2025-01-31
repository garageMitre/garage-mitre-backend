import { IsNotEmpty, IsString } from "class-validator";

export class ScannerDto {

    @IsString()
    barCode: string;

}
