import { PartialType } from '@nestjs/mapped-types';
import { CreateTicketDto } from './create-ticket.dto';
import { CreateTicketRegistrationDto } from './create-ticket-registration.dto';

export class UpdateTicketRegistrationDto extends PartialType(CreateTicketRegistrationDto) {}
