import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateRenterDto } from './dto/create-renter.dto';
import { UpdateRenterDto } from './dto/update-renter.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Renter } from './entities/renter.entity';
import { FilterOperator, paginate, Paginated, PaginateQuery } from 'nestjs-paginate';
import { ReceiptsService } from 'src/receipts/receipts.service';

@Injectable()
export class RentersService {
    private readonly logger = new Logger(RentersService.name);
  
    constructor(
      @InjectRepository(Renter)
      private readonly renterRepository: Repository<Renter>,
      private readonly receiptsService: ReceiptsService
      
    ) {}

  async create(createRenterDto: CreateRenterDto) {
    try{
      const renter = this.renterRepository.create(createRenterDto);
      const savedRenter = await this.renterRepository.save(renter);

      await this.receiptsService.createByRenter(renter.id)
      
      return savedRenter;
    } catch (error) {
      this.logger.error(error.message, error.stack);
    }
  }

  async findAll(query: PaginateQuery): Promise<Paginated<Renter>> {
    try {
      return await paginate(query, this.renterRepository, {
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
      const renter = await this.renterRepository.findOne({
        where:{id:id},
        relations: ['receipts']
      })

      if(!renter){
        throw new NotFoundException('Renter not found')
      }

      return renter;
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        this.logger.error(error.message, error.stack);
      }
      throw error;
    }
  }

  async update(id: string, updateRenterDto: UpdateRenterDto) {
    try{
      const renter = await this.renterRepository.findOne({where:{id:id}})

      if(!renter){
        throw new NotFoundException('Renter not found')
      }

      const updateRenter = this.renterRepository.merge(renter, updateRenterDto);
      const savedRenter = await this.renterRepository.save(updateRenter);

      return savedRenter;
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        this.logger.error(error.message, error.stack);
      }
      throw error;
    }
  }

  async remove(id: string) {
    try{
      const renter = await this.renterRepository.findOne({where:{id:id}})

      if(!renter){
        throw new NotFoundException('Renter not found')
      }

      await this.renterRepository.remove(renter);

      return { message: 'Renter removed successfully' };
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        this.logger.error(error.message, error.stack);
      }
      throw error;
    }
  }
}
