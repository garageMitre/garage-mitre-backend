import { Injectable, Logger } from '@nestjs/common';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Owner } from './entities/owner.entity';

@Injectable()
export class OwnersService {
    private readonly logger = new Logger(OwnersService.name);
    
    constructor(
      @InjectRepository(Owner)
      private readonly ownerRepository: Repository<Owner>,
    ) {}
  async create(createOwnerDto: CreateOwnerDto) {
    try{
      const owner = this.ownerRepository.create(createOwnerDto);
      const savedOwner = await this.ownerRepository.save(owner);
      
      return savedOwner;
    } catch (error) {
      this.logger.error(error.message, error.stack);
    }
  }

  findAll() {
    return `This action returns all owners`;
  }

  findOne(id: number) {
    return `This action returns a #${id} owner`;
  }

  update(id: number, updateOwnerDto: UpdateOwnerDto) {
    return `This action updates a #${id} owner`;
  }

  remove(id: number) {
    return `This action removes a #${id} owner`;
  }
}
