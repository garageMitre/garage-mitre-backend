import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateBoxListDto } from './dto/create-box-list.dto';
import { UpdateBoxListDto } from './dto/update-box-list.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, EntityManager, Repository } from 'typeorm';
import { BoxList } from './entities/box-list.entity';
import { CreateOtherPaymentDto } from './dto/create-other-payment.dto';
import { OtherPayment } from './entities/other-payment.entity';

@Injectable()
export class BoxListsService {

    private readonly logger = new Logger(BoxListsService.name);
  
    constructor(
      @InjectRepository(BoxList)
      private readonly boxListRepository: Repository<BoxList>,
      @InjectRepository(OtherPayment)
      private readonly otherPaymentepository: Repository<OtherPayment>,
    ) {}

    async createBox(createBoxListDto: CreateBoxListDto, manager?: EntityManager) {
      try {
        const repo = manager ? manager.getRepository(BoxList) : this.boxListRepository;
    
        const box = repo.create(createBoxListDto);
        const savedBox = await repo.save(box); 
    
        return savedBox;
      } catch (error) {
        this.logger.error(error.message, error.stack);
        throw error;
      }
    }
  async getAllboxes(){
    try{

      const boxes = await this.boxListRepository.find()
      return boxes

    }catch (error) {
      this.logger.error(error.message, error.stack);
    }
  }
  async updateBox(id: string, updateBoxListDto: UpdateBoxListDto, manager?: EntityManager) {
    try {
      const repo = manager ? manager.getRepository(BoxList) : this.boxListRepository;
  
      const box = await repo.findOne({ where: { id } });
  
      if (!box) {
        throw new NotFoundException('Box not found');
      }
  
      const updateBox = repo.merge(box, updateBoxListDto);
      const savedBox = await repo.save(updateBox); 
  
      return savedBox;
    } catch (error) {
      this.logger.error(error.message, error.stack);
      throw error;
    }
  }

  async findBoxByDate(date: Date, manager?: EntityManager): Promise<BoxList | null> {
    try {
      const repo = manager ? manager.getRepository(BoxList) : this.boxListRepository;
  
      const startOfDay = new Date(date.setHours(0, 0, 0, 0));
      const endOfDay = new Date(date.setHours(23, 59, 59, 999));
  
      const boxList = await repo.findOne({
        where: { date: Between(startOfDay, endOfDay) },
        relations: [
          'ticketRegistrations',
          'receipts',
          'receipts.customer',
          'otherPayments',
          'ticketRegistrationForDays'
        ],
      });
  
      if (!boxList) {
        console.warn(`No se encontró un BoxList para la fecha: ${startOfDay.toISOString()}`);
        return null;
      }
  
      return boxList;
    } catch (error) {
      this.logger.error(`Error buscando BoxList por fecha: ${error.message}`, error.stack);
      throw error;
    }
  }
  

  async findOne(boxListId: string) {
    try{
      const boxListWithRegistrations = await this.boxListRepository.findOne({
        where: { id: boxListId },
        relations: ['ticketRegistrations', 'receipts', 'ticketRegistrationForDays','otherPayments'],
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

  async removeBox(id: string) {
    try{
      const owner = await this.boxListRepository.findOne({where:{id:id}})

      if(!owner){
        throw new NotFoundException('Box list not found')
      }

      await this.boxListRepository.remove(owner);

      return {message: 'Box list removed successfully'}
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        this.logger.error(error.message, error.stack);
      }
      throw error;
    }
  }

  async createOtherPayment(createOtherPaymentDto: CreateOtherPaymentDto) {
    try{
      const otherPayment = this.otherPaymentepository.create(createOtherPaymentDto);

      const now = new Date();
      
      const formattedDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      otherPayment.dateNow = formattedDay;
      const boxListDate = formattedDay;
      let boxList = await this.findBoxByDate(boxListDate);
      
      if (!boxList) {
          boxList = await this.createBox({
              date: boxListDate,
              totalPrice: -otherPayment.price
          });
      } else {
          boxList.totalPrice -= otherPayment.price;
      
          await this.updateBox(boxList.id, {
              totalPrice: boxList.totalPrice,
          });
      }
      
      otherPayment.boxList = { id: boxList.id } as BoxList;

      const savedOtherPayment = await this.otherPaymentepository.save(otherPayment); 

      return savedOtherPayment;
    } catch (error) {
      this.logger.error(error.message, error.stack);
    }
  }

}
