import { PartialType } from '@nestjs/mapped-types';
import { CreateTicketDto } from './create-ticket.dto';
import { CreateTicketPriceDto } from './create-ticket-price.dto';

export class UpdateTicketPriceDto extends PartialType(CreateTicketPriceDto) {}
