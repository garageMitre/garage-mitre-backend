import { PartialType } from '@nestjs/mapped-types';
import { CreateBoxListDto } from './create-box-list.dto';

export class UpdateBoxListDto extends PartialType(CreateBoxListDto) {}
