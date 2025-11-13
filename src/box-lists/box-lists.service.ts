import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateBoxListDto } from './dto/create-box-list.dto';
import { UpdateBoxListDto } from './dto/update-box-list.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, EntityManager, Repository } from 'typeorm';
import { BoxList } from './entities/box-list.entity';
import { CreateOtherPaymentDto } from './dto/create-other-payment.dto';
import { OtherPayment } from './entities/other-payment.entity';

import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import * as isBetween from 'dayjs/plugin/isBetween'; 
import { UpdateOtherPaymentDto } from './dto/update-other-payment.dto';

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
      private readonly dataSource: DataSource,
      
    ) {}

async createBox(createBoxListDto: CreateBoxListDto) {
  const queryRunner = this.dataSource.createQueryRunner();

  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const repo = queryRunner.manager.getRepository(BoxList);

    // Bloquea el último boxNumber para evitar condiciones de carrera
    const lastBox = await repo
      .createQueryBuilder("box")
      .setLock("pessimistic_write") // bloquea la fila para escritura
      .orderBy("box.boxNumber", "DESC") // obtener el mayor boxNumber
      .getOne();

    let newBoxNumber = 1;
    if (lastBox?.boxNumber) {
      newBoxNumber = lastBox.boxNumber + 1;
    }

    const box = repo.create({
      ...createBoxListDto,
      boxNumber: newBoxNumber,
    });

    const savedBox = await repo.save(box);
    await queryRunner.commitTransaction();

    return savedBox;
  } catch (error) {
    await queryRunner.rollbackTransaction();
    this.logger.error(error.message, error.stack);
    throw error;
  } finally {
    await queryRunner.release();
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
          'receipts.customer.vehicleRenters.vehicle.customer',
          'receipts.customer.vehicleRenters.vehicle.customer.receipts',
          'receiptPayments',
          'receiptPayments.receipt',
          'receiptPayments.receipt.customer',
          'receiptPayments.receipt.customer.vehicleRenters',
          'receiptPayments.receipt.customer.vehicles',
          'receiptPayments.receipt.customer.vehicleRenters.vehicle.customer',
          'receiptPayments.receipt.customer.vehicleRenters.vehicle.customer.receipts',
          'paymentHistoryOnAccount',
          'paymentHistoryOnAccount.receipt',
          'paymentHistoryOnAccount.receipt.customer',
          'paymentHistoryOnAccount.receipt.customer.vehicleRenters',
          'paymentHistoryOnAccount.receipt.customer.vehicles',
          'paymentHistoryOnAccount.receipt.customer.vehicleRenters.vehicle.customer',
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
              totalPrice: createOtherPaymentDto.type === 'EGRESOS' ? -otherPayment.price : otherPayment.price
          });
      } else {
        boxList.totalPrice += createOtherPaymentDto.type === 'EGRESOS' ? -otherPayment.price : otherPayment.price;
      
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

    async updateOtherPayment(id: string, updateOtherPaymentDto: UpdateOtherPaymentDto) {
    try{
      const expense = await this.otherPaymentepository.findOne({where:{id:id}})

      if(!expense){
        throw new NotFoundException('Expense not found')
      }

      const otherPayment = this.otherPaymentepository.merge(expense, updateOtherPaymentDto);

      const boxList = await this.boxListRepository.findOne({where:{id:expense.boxList.id}})

      boxList.totalPrice = boxList.totalPrice - expense.price + updateOtherPaymentDto.price;

      await this.boxListRepository.save(boxList);

      const savedOtherPayment = await this.otherPaymentepository.save(otherPayment); 

      return savedOtherPayment;
    } catch (error) {
      this.logger.error(error.message, error.stack);
    }
  }
  async findAllOtherPayment() {
    try {
      const expenses = await this.otherPaymentepository.find({
        relations: ['boxList'],
        order: {
          dateNow: 'DESC',  // 👈 Cambiado a descendente
        },
      });
  
      return expenses;
    } catch (error) {
      this.logger.error(error.message, error.stack);
    }
  }
  

    async removeOtherPayment(id: string) {
    try{
      const expense = await this.otherPaymentepository.findOne({where:{id:id},relations:['boxList']})

      expense.boxList.totalPrice += expense.price;
      await this.boxListRepository.save(expense.boxList);
      if(!expense){
        throw new NotFoundException('Expense not found')
      }

      await this.otherPaymentepository.remove(expense);

      return {message: 'Expense removed successfully'}
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        this.logger.error(error.message, error.stack);
      }
      throw error;
    }
  }


  async updateBoxByDate(date: string, totalPrice: number) {
    try {
      const boxList = await this.boxListRepository.findOne({ where: { date } });
  
      if (!boxList) {
        throw new NotFoundException(`No se encontró BoxList para la fecha ${date}`);
      }
  
      // Actualizar el totalPrice con tu método existente
      return await this.updateBox(boxList.id, { totalPrice });
    } catch (error) {
      this.logger.error(`❌ Error al actualizar BoxList para ${date}: ${error.message}`);
      throw error;
    }
  }
  
}
