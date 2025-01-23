import { Injectable, Logger } from '@nestjs/common';
import { CreateRenterDto } from './dto/create-renter.dto';
import { UpdateRenterDto } from './dto/update-renter.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Renter } from './entities/renter.entity';

@Injectable()
export class RentersService {
    private readonly logger = new Logger(RentersService.name);
  
    constructor(
      @InjectRepository(Renter)
      private readonly renterRepository: Repository<Renter>,
    ) {}

  async create(createRenterDto: CreateRenterDto) {
    try{
      const renter = this.renterRepository.create(createRenterDto);
      const savedRenter = await this.renterRepository.save(renter);
      
      return savedRenter;
    } catch (error) {
      this.logger.error(error.message, error.stack);
    }
  }

  findAll() {
    return `This action returns all renters`;
  }

  findOne(id: number) {
    return `This action returns a #${id} renter`;
  }

  update(id: number, updateRenterDto: UpdateRenterDto) {
    return `This action updates a #${id} renter`;
  }

  remove(id: number) {
    return `This action removes a #${id} renter`;
  }
}
