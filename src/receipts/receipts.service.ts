import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import { BoxListsService } from 'src/box-lists/box-lists.service';
import { BoxList } from 'src/box-lists/entities/box-list.entity';
import { addMonths, startOfMonth } from 'date-fns';
import { Customer } from 'src/customers/entities/customer.entity';
import { Receipt } from './entities/receipt.entity';
import { UpdateReceiptDto } from './dto/update-receipt.dto';
import { IsNull } from 'typeorm';

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

    async createReceipt(cutomerId: string): Promise<Receipt> {
        try {
            const customer = await this.customerRepository.findOne({ where: { id: cutomerId } });
            if (!customer) {
                throw new NotFoundException('Customer not found');
            }

            const totalVehicleAmount = customer.vehicles.reduce((acc, vehicle) => acc + (vehicle.amount || 0), 0);

            const price = totalVehicleAmount;
            const now = new Date();
            const formattedDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            const receipt = this.receiptRepository.create({
                customer,
                price,
                startAmount: price,
                dateNow: formattedDay,
                startDate:customer.startDate
            });
    
            return await this.receiptRepository.save(receipt);
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
      
          const now = new Date();
          const formattedDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // sin hora

          const hasPaid = customer.startDate
            ? customer.startDate > receipt.dateNow
            : false;

          if (hasPaid) {
            throw new NotFoundException({
              code: 'RECEIPT_PAID',
              message: 'This bill was already paid this month.',
            });
          }
          const nextMonthStartDate = startOfMonth(addMonths(now, 1));
      
          customer.previusStartDate = customer.startDate;
          customer.startDate = nextMonthStartDate;
      
          await queryRunner.manager.save(Customer, customer);
      
      
      
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
            receipt.receiptNumber = `N° 0000-00000001`;
          }
      
          receipt.status = 'PAID';
          receipt.paymentType = updateReceiptDto.paymentType;
          receipt.paymentDate = new Date();
          receipt.dateNow = formattedDay;
      
          let boxList = await this.boxListsService.findBoxByDate(formattedDay);
      
          if (!boxList) {
            boxList = await this.boxListsService.createBox({
              date: formattedDay,
              totalPrice: receipt.paymentType === 'CASH' ? receipt.price : -receipt.price,
            });
          } else {
            boxList.totalPrice += receipt.paymentType === 'CASH' ? receipt.price : -receipt.price;
            await this.boxListsService.updateBox(boxList.id, {
              totalPrice: boxList.totalPrice,
            });
          }
      
          receipt.boxList = { id: boxList.id } as BoxList;
          await queryRunner.manager.save(Receipt, receipt);
      
          // Crear nuevo recibo
          await this.createReceipt(customer.id);
      
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
        try {
            const customer = await this.customerRepository.findOne({
                where: { id: customerId },
                relations: ['receipts'],
            });
    
            if (!customer) {
                throw new NotFoundException('Customer not found');
            }
    
            const receipts = customer.receipts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
            if (receipts.length === 0) {
                throw new NotFoundException({
                    code: 'RECEIPT_PAID_NOT_FOUND',
                    message: 'No receipts found for this owner',
                  });
            }
    
            const pendingReceipt = receipts.find((receipt) => receipt.status === 'PENDING');
            const lastPaidReceipt = receipts.find(
                (receipt, index) => receipt.status === 'PAID' && receipts[index - 1]?.status === 'PENDING'
            );
            if (!lastPaidReceipt) {
                throw new NotFoundException({
                    code: 'RECEIPT_PAID_NOT_FOUND',
                    message: 'No receipts found for this owner',
                  });
            }
            if (!pendingReceipt) {
                throw new NotFoundException('No pending receipt found for this owner');
            }
    
            const now = new Date();
            const formattedDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const boxListDate = formattedDay;
    
            let boxList = await this.boxListsService.findBoxByDate(boxListDate);
    
            if (!boxList) {
                throw new NotFoundException('Box list not found');
            }
            if(lastPaidReceipt.paymentType === 'TRANSFER'){
                boxList.totalPrice += lastPaidReceipt.price;
            }else{
                boxList.totalPrice -= lastPaidReceipt.price;
            }
    
    
            await this.boxListsService.updateBox(boxList.id, {
                totalPrice: boxList.totalPrice,
            });
    
            await this.receiptRepository.remove(pendingReceipt);
    
            if (lastPaidReceipt) {
                lastPaidReceipt.status = 'PENDING';
                lastPaidReceipt.paymentDate = null;
                lastPaidReceipt.boxList = null;
                lastPaidReceipt.receiptNumber = null
    
                await this.receiptRepository.save(lastPaidReceipt);
            }
    
            return customer;
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