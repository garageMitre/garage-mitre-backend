import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Owner } from './entities/owner.entity';
import { FilterOperator, paginate, Paginated, PaginateQuery } from 'nestjs-paginate';
import { ReceiptsService } from 'src/receipts/receipts.service';

@Injectable()
export class OwnersService {
    private readonly logger = new Logger(OwnersService.name);
    
    constructor(
      @InjectRepository(Owner)
      private readonly ownerRepository: Repository<Owner>,
      private readonly receiptsService: ReceiptsService
    ) {}
  async create(createOwnerDto: CreateOwnerDto) {
    try{
      const owner = this.ownerRepository.create(createOwnerDto);
      const savedOwner = await this.ownerRepository.save(owner);

      await this.receiptsService.createByOwner(owner.id)
      
      return savedOwner;
    } catch (error) {
      this.logger.error(error.message, error.stack);
      throw error;
    }
  }


  async findAll(query: PaginateQuery): Promise<Paginated<Owner>> {
    try {
      return await paginate(query, this.ownerRepository, {
        sortableColumns: ['id', 'firstName', 'email'],
        nullSort: 'last',
        defaultSortBy: [['createdAt', 'DESC']],
        searchableColumns: ['firstName', 'email'],
        filterableColumns: {
          firstName: [FilterOperator.ILIKE, FilterOperator.EQ],
          email: [FilterOperator.EQ, FilterOperator.ILIKE],
        },
      });
    } catch (error) {
      this.logger.error(error.message, error.stack);
    }
  }

  async findOne(id: string) {
    try{
      const owner = await this.ownerRepository.findOne({
        where:{id:id},
        relations:['receipts']
      })

      if(!owner){
        throw new NotFoundException('Owner not found')
      }

      return owner;
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        this.logger.error(error.message, error.stack);
      }
      throw error;
    }
  }

  async update(id: string, updateOwnerDto: UpdateOwnerDto) {
    try{
      const owner = await this.ownerRepository.findOne({where:{id:id}})

      if(!owner){
        throw new NotFoundException('Owner not found')
      }

      const updateOwner = this.ownerRepository.merge(owner, updateOwnerDto);
      const savedOwner = await this.ownerRepository.save(updateOwner);

      return savedOwner;
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        this.logger.error(error.message, error.stack);
      }
      throw error;
    }
  }

  async remove(id: string) {
    try{
      const owner = await this.ownerRepository.findOne({where:{id:id}})

      if(!owner){
        throw new NotFoundException('Owner not found')
      }

      await this.ownerRepository.remove(owner);

      return {message: 'Owner removed successfully'}
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        this.logger.error(error.message, error.stack);
      }
      throw error;
    }
  }
}
