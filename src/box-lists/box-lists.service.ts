import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateBoxListDto } from './dto/create-box-list.dto';
import { UpdateBoxListDto } from './dto/update-box-list.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, EntityManager, Repository } from 'typeorm';
import { BoxList } from './entities/box-list.entity';
import { CreateOtherPaymentDto } from './dto/create-other-payment.dto';
import { OtherPayment } from './entities/other-payment.entity';

import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import * as isBetween from 'dayjs/plugin/isBetween'; 

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isBetween);


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
    
        // 🟢 Buscar el último box creado ordenado por id descendente
        const lastBox = await repo.findOne({
          order: { id: 'DESC' },
          where: {}, // 👈 Agregás un where vacío
        });
    
        // 🟢 Setear el boxNumber
        let newBoxNumber = 1; // Default
        if (lastBox && lastBox?.boxNumber) {
          newBoxNumber = lastBox.boxNumber + 1;
        }
    
        // 🟢 Crear y asignar el nuevo boxNumber
        const box = repo.create({
          ...createBoxListDto,
          boxNumber: newBoxNumber,
        });
    
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

  async findBoxByDate(date: string, manager?: EntityManager): Promise<BoxList | null> {
    try {
      const repo = manager ? manager.getRepository(BoxList) : this.boxListRepository;

      
      const boxList = await repo.findOne({
        where: { date: date},
        relations: [
          'ticketRegistrations',
          'receipts',
          'receipts.customer',
          'otherPayments',
          'ticketRegistrationForDays',
          'receipts.customer.vehicleRenters',
          'receipts.customer.vehicles',
          'receipts.customer.vehicleRenters.vehicle.customer'
        ],
      });
      
      if (!boxList) {
        console.warn(`No se encontró un BoxList para la fecha: ${date}`);
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
        relations: ['ticketRegistrations', 'receipts', 'ticketRegistrationForDays','otherPayments', 'receipts.customer.vehicleRenters', 'receipts.customer.vehicles'],
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

      const argentinaTime = dayjs().tz('America/Argentina/Buenos_Aires').startOf('day');
      const now = argentinaTime.format('YYYY-MM-DD')
      

      otherPayment.dateNow = now;
      const boxListDate = now;
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
