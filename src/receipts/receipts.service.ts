import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Not, Repository } from 'typeorm';
import { BoxListsService } from 'src/box-lists/box-lists.service';
import { BoxList } from 'src/box-lists/entities/box-list.entity';
import { addMonths, startOfMonth } from 'date-fns';
import { Customer, CustomerType } from 'src/customers/entities/customer.entity';
import { Receipt } from './entities/receipt.entity';
import { UpdateReceiptDto } from './dto/update-receipt.dto';
import { IsNull } from 'typeorm';

import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import * as isBetween from 'dayjs/plugin/isBetween'; 

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isBetween);

@Injectable()
export class ReceiptsService {
    private readonly logger = new Logger(ReceiptsService.name);
    
    constructor(
        @InjectRepository(Receipt)
        private readonly receiptRepository: Repository<Receipt>,
        @InjectRepository(Customer)
        private readonly customerRepository: Repository<Customer>,
        private readonly boxListsService: BoxListsService,
        private readonly dataSource: DataSource,
    ) {}

    async createReceipt(customerId: string, manager: EntityManager): Promise<Receipt> {
      try {
        const customer = await manager.findOne(Customer, {
          where: { id: customerId },
          relations: ['vehicles'],
        });
    
        if (!customer) {
          throw new NotFoundException('Customer not found');
        }
    
        const totalVehicleAmount = customer.vehicles.reduce(
          (acc, vehicle) => acc + (vehicle.amount || 0),
          0,
        );
    
        const price = totalVehicleAmount;
        const argentinaTime = dayjs().tz('America/Argentina/Buenos_Aires');
    
        const receipt = manager.create(Receipt, {
          customer,
          price,
          startAmount: price,
          dateNow: argentinaTime.format('YYYY-MM-DD'),
          startDate: customer.startDate,
        });
    
        return await manager.save(receipt);
      } catch (error) {
        if (!(error instanceof NotFoundException)) {
          this.logger.error(error.message, error.stack);
        }
        throw error;
      }
    }
    

    async updateReceipt(customerId: string, updateReceiptDto: UpdateReceiptDto) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
    
      try {
        const customer = await queryRunner.manager.findOne(Customer, {
          where: { id: customerId },
          relations: ['receipts'],
        });
    
        if (!customer) throw new NotFoundException('Customer not found');
    
        const receipt = await queryRunner.manager.findOne(Receipt, {
          where: { customer: { id: customer.id }, status: 'PENDING' },
        });
    
        if (!receipt) throw new NotFoundException('Receipt not found');
    
        const argentinaTime = dayjs().tz('America/Argentina/Buenos_Aires').startOf('day');
        const hasPaid = customer.startDate ? argentinaTime.isBefore(dayjs(customer.startDate)) : false;
    
        if (hasPaid) {
          throw new NotFoundException({
            code: 'RECEIPT_PAID',
            message: 'This bill was already paid this month.',
          });
        }
    
        const nextMonthStartDate = argentinaTime.add(1, 'month').startOf('month').format('YYYY-MM-DD');
    
        customer.previusStartDate = customer.startDate;
        customer.startDate = nextMonthStartDate;
    
        await queryRunner.manager.save(Customer, customer);
    
        if (updateReceiptDto.print) {
          const orderReceiptNumbers = await queryRunner.manager.find(Receipt, {
            where: { receiptNumber: Not(IsNull()) },
            order: { updateAt: 'DESC' },
            take: 1,
          });
    
          if (orderReceiptNumbers.length > 0 && orderReceiptNumbers[0].receiptNumber) {
            const lastReceiptNumber = orderReceiptNumbers[0].receiptNumber;
            const [shortNumber, longNumber] = lastReceiptNumber.split('-').map(num => num.replace('N° ', '').trim());
    
            const incrementedShortNumber = parseInt(shortNumber).toString().padStart(4, '0');
            const incrementedLongNumber = (parseInt(longNumber) + 1).toString().padStart(8, '0');
    
            receipt.receiptNumber = `N° ${incrementedShortNumber}-${incrementedLongNumber}`;
          } else {
            receipt.receiptNumber = 'N° 0000-00000001';
          }
        }
    
        receipt.status = 'PAID';
        receipt.paymentType = updateReceiptDto.paymentType;
        receipt.paymentDate = argentinaTime.format('YYYY-MM-DD');
        receipt.dateNow = argentinaTime.format('YYYY-MM-DD');
    
        const now = new Date();
        const formattedDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
        let boxList = await this.boxListsService.findBoxByDate(formattedDay, queryRunner.manager);
    
        if (!boxList) {
          boxList = await this.boxListsService.createBox({
            date: formattedDay,
            totalPrice: receipt.paymentType === 'CASH' ? receipt.price : -receipt.price,
          }, queryRunner.manager);
        } else {
          boxList.totalPrice += receipt.paymentType === 'CASH' ? receipt.price : -receipt.price;
          await this.boxListsService.updateBox(boxList.id, {
            totalPrice: boxList.totalPrice,
          }, queryRunner.manager);
        }
    
        receipt.boxList = { id: boxList.id } as BoxList;
        await queryRunner.manager.save(Receipt, receipt);
    
        // Crear el nuevo recibo dentro de la misma transacción
        await this.createReceipt(customer.id, queryRunner.manager);
    
        await queryRunner.commitTransaction();
        return receipt;
      } catch (error) {
        await queryRunner.rollbackTransaction();
        if (!(error instanceof NotFoundException)) {
          this.logger.error(error.message, error.stack);
        }
        throw error;
      } finally {
        await queryRunner.release();
      }
    }
    
    async cancelReceipt(customerId: string) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
    
      try {
        const customerRepo = queryRunner.manager.getRepository(Customer);
        const receiptRepo = queryRunner.manager.getRepository(Receipt);
    
        const customer = await customerRepo.findOne({
          where: { id: customerId },
          relations: ['receipts'],
        });
    
        if (!customer) {
          throw new NotFoundException('Customer not found');
        }
    
        customer.startDate = dayjs(customer.startDate)
        .subtract(1, 'month')
        .format('YYYY-MM-DD');
        
        if (!customer.startDate) {
          throw new BadRequestException('startDate is required to calculate previousStartDate');
        }
        
        customer.previusStartDate = dayjs(customer.startDate)
          .subtract(1, 'month')
          .format('YYYY-MM-DD');
    
        await customerRepo.save(customer);
    
        const receipts = customer.receipts.sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        );
    
        const pendingReceipt = receipts.find((r) => r.status === 'PENDING');
        const lastPaidReceipt = receipts.find(
          (r, i) => r.status === 'PAID' && receipts[i - 1]?.status === 'PENDING'
        );
    
        if (!lastPaidReceipt) {
          throw new NotFoundException({
            code: 'RECEIPT_PAID_NOT_FOUND',
            message: 'No receipts paid found',
          });
        }
    
        if (!pendingReceipt) {
          throw new NotFoundException('No pending receipt found for this owner');
        }
    
        const now = new Date();
        const formattedDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const boxListDate = formattedDay;
    
        let boxList = await this.boxListsService.findBoxByDate(boxListDate, queryRunner.manager);
    
        if (!boxList) {
          throw new NotFoundException('Box list not found');
        }
    
        if (lastPaidReceipt.paymentType === 'TRANSFER') {
          boxList.totalPrice += lastPaidReceipt.price;
        } else {
          boxList.totalPrice -= lastPaidReceipt.price;
        }
    
        await this.boxListsService.updateBox(boxList.id, {
          totalPrice: boxList.totalPrice,
        }, queryRunner.manager);
    
        await receiptRepo.remove(pendingReceipt);
    
        lastPaidReceipt.status = 'PENDING';
        lastPaidReceipt.paymentDate = null;
        lastPaidReceipt.boxList = null;
        lastPaidReceipt.receiptNumber = null;
        lastPaidReceipt.paymentType = null;
    
        await receiptRepo.save(lastPaidReceipt);
    
        await queryRunner.commitTransaction();
        return customer;
      } catch (error) {
        await queryRunner.rollbackTransaction();
        if (!(error instanceof NotFoundException)) {
          this.logger.error(error.message, error.stack);
        }
        throw error;
      } finally {
        await queryRunner.release();
      }
    }

    async findAllPendingReceipts(customerType: CustomerType) {
      try {
        const customers = await this.customerRepository.find({
          where: { customerType: customerType },
          relations: ['receipts'],
          withDeleted: true
        });
    
        // Array para almacenar los recibos pendientes de todos los clientes
        const pendingReceipts = [];
    
        for (const customer of customers) {
          const receipts = customer.receipts.sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
          );
    
          // Filtrar solo los recibos con estado 'PENDING'
          const customerPendingReceipts = receipts.filter(
            (receipt) => receipt.status === 'PENDING'
          );
    
          // Agregar los recibos pendientes al array general
          pendingReceipts.push(...customerPendingReceipts);
        }
    
        return pendingReceipts;
      } catch (error) {
        if (!(error instanceof NotFoundException)) {
          this.logger.error(error.message, error.stack);
        }
        throw error;
      }
    }
    
    async numberGeneratorForAllCustomer(customerId: string){
        try{
            const customer = await this.customerRepository.findOne({ 
                where: { id: customerId },
                relations: ['receipts']
            });
            if (!customer) {
                throw new NotFoundException('Customer not found');
            }

            const receipt = await this.receiptRepository.findOne({
                where: { customer:{id:customer.id}, status:'PENDING'},
            });
    
            if (!receipt) {
                throw new NotFoundException('Receipt not found');
            }
            const orderReceiptNumbers = await this.receiptRepository.find({
                where: { receiptNumber: Not(IsNull()), },
                order: { updateAt: 'DESC' }, // Ordenar por la fecha de creación, de más reciente a más antiguo
                take: 1, // Limitar a un solo recibo
            });
            
            // Si existe un recibo pendiente
            if (orderReceiptNumbers.length > 0 && orderReceiptNumbers[0].receiptNumber) {
                const lastReceiptNumber = orderReceiptNumbers[0].receiptNumber;
            
                // Separar el número corto y largo
                const [shortNumber, longNumber] = lastReceiptNumber.split('-').map(num => num.replace('N° ', '').trim());
            
                // Incrementar el número corto (de 4 dígitos) y el número largo (de 8 dígitos)
                const incrementedShortNumber = (parseInt(shortNumber)).toString().padStart(4, '0');
                const incrementedLongNumber = (parseInt(longNumber) + 1).toString().padStart(8, '0');
            
                // Crear el nuevo número de recibo con el formato adecuado
                const receiptNumber = `N° ${incrementedShortNumber}-${incrementedLongNumber}`;
            
                // Asignar el número de recibo al nuevo recibo
                receipt.receiptNumber = receiptNumber;
            } else {
                // Si no hay recibos previos, comenzar desde 0000-00000000
                const receiptNumber = `N° 0000-00000001`;
                receipt.receiptNumber = receiptNumber;
            }
            await this.receiptRepository.save(receipt);
            return receipt;

        }catch (error) {
            if (!(error instanceof NotFoundException)) {
                this.logger.error(error.message, error.stack);
            }
            throw error;
        }
    }
}