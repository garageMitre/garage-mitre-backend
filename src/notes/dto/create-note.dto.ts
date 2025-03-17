import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateNoteDto {

    @IsNotEmpty()
    @IsString()
    description: string;

    @IsNotEmpty()
    @IsString()
    @IsOptional()
    date: string | null;

    @IsNotEmpty()
    @IsString()
    @IsOptional()
    hours: string | null;
}
