import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateBoxListDto } from './dto/create-box-list.dto';
import { UpdateBoxListDto } from './dto/update-box-list.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BoxList } from './entities/box-list.entity';

@Injectable()
export class BoxListsService {

    private readonly logger = new Logger(BoxListsService.name);
  
    constructor(
      @InjectRepository(BoxList)
      private readonly boxListRepository: Repository<BoxList>,
    ) {}

  async createBox(createBoxListDto: CreateBoxListDto) {
    try{
      const box = this.boxListRepository.create(createBoxListDto);

      const savedBox = await this.boxListRepository.save(box); 

      return savedBox;
    } catch (error) {
      this.logger.error(error.message, error.stack);
    }
  }

  async updateBox(id: string, updateBoxListDto: UpdateBoxListDto) {
    try{
      const box = await this.boxListRepository.findOne({where:{id:id}})

      if(!box){
        throw new NotFoundException('Box not found')
      }
      
      const updateBox = this.boxListRepository.merge(box, updateBoxListDto);

      const savedBox = await this.boxListRepository.save(updateBox); 

      return savedBox;
    } catch (error) {
      this.logger.error(error.message, error.stack);
    }
  }

  async findBoxByDate(date: Date): Promise<BoxList | null> {
    try {
      // Formatea la fecha para comparar solo día, mes y año (ignora la hora)
      const formattedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
      const boxList = await this.boxListRepository.findOne({
        where: { date: formattedDate },
        relations: ['ticketRegistrations'], // Incluye las relaciones necesarias
      });
  
      return boxList || null;
    } catch (error) {
      this.logger.error(`Error buscando BoxList por fecha: ${error.message}`, error.stack);
      throw error;
    }
  }

  async findOne(boxListId: string) {
    try{
      const boxListWithRegistrations = await this.boxListRepository.findOne({
        where: { id: boxListId },
        relations: ['ticketRegistrations'],
      });
      if(!boxListWithRegistrations){
        throw new NotFoundException('Box list not found')
      }
      return boxListWithRegistrations;
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        this.logger.error(error.message, error.stack);
      }
      throw error;
    }
  }

}
