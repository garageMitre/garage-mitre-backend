import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BoxListsService } from 'src/box-lists/box-lists.service';
import { BoxList } from 'src/box-lists/entities/box-list.entity';
import { addMonths, startOfMonth } from 'date-fns';
import { Customer } from 'src/customers/entities/customer.entity';
import { Receipt } from './entities/receipt.entity';

@Injectable()
export class ReceiptsService {
    private readonly logger = new Logger(ReceiptsService.name);
    
    constructor(
        @InjectRepository(Receipt)
        private readonly receiptRepository: Repository<Receipt>,
        @InjectRepository(Customer)
        private readonly customerRepository: Repository<Customer>,
        private readonly boxListsService: BoxListsService,
    ) {}

    async createReceipt(cutomerId: string): Promise<Receipt> {
        try {
            const customer = await this.customerRepository.findOne({ where: { id: cutomerId } });
            if (!customer) {
                throw new NotFoundException('Customer not found');
            }

            const totalVehicleAmount = customer.vehicles.reduce((acc, vehicle) => acc + (vehicle.amount || 0), 0);

            const price = totalVehicleAmount;

            const receipt = this.receiptRepository.create({
                customer,
                price,
                startAmount: price
            });
    
            return await this.receiptRepository.save(receipt);
        } catch (error) {
            if (!(error instanceof NotFoundException)) {
              this.logger.error(error.message, error.stack);
            }
            throw error;
          }
    }
    

    async updateReceipt(customerId: string) {
        try {
            const customer = await this.customerRepository.findOne({ 
                where: { id: customerId },
                relations: ['receipts']
            });
            if (!customer) {
                throw new NotFoundException('Customer not found');
            }

            const nowDate = new Date();
            const nextMonthStartDate = startOfMonth(addMonths(nowDate, 1));
            customer.startDate = nextMonthStartDate;
            await this.customerRepository.save(customer)        

            const receipt = await this.receiptRepository.findOne({
                where: { customer:{id:customer.id}, status:'PENDING'},
            });
    
            if (!receipt) {
                throw new NotFoundException('Receipt not found');
            }

            receipt.status = 'PAID'
            receipt.paymentDate = new Date()
            const now = new Date();
            const formattedDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
             const boxListDate = formattedDay;
            let boxList = await this.boxListsService.findBoxByDate(boxListDate);
            
            if (!boxList) {
                boxList = await this.boxListsService.createBox({
                    date: boxListDate,
                    totalPrice: receipt.price
                });
            } else {
                boxList.totalPrice += receipt.price;
            
                await this.boxListsService.updateBox(boxList.id, {
                    totalPrice: boxList.totalPrice,
                });
            }
            
            receipt.boxList = { id: boxList.id } as BoxList;
            await this.receiptRepository.save(receipt);

            const newReceipt = this.createReceipt(customer.id);

            return newReceipt;
        }catch (error) {
            if (!(error instanceof NotFoundException)) {
              this.logger.error(error.message, error.stack);
            }
            throw error;
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
                throw new NotFoundException('No receipts found for this owner');
            }
    
            const pendingReceipt = receipts.find((receipt) => receipt.status === 'PENDING');
            const lastPaidReceipt = receipts.find(
                (receipt, index) => receipt.status === 'PAID' && receipts[index - 1]?.status === 'PENDING'
            );
    
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
    
            boxList.totalPrice -= pendingReceipt.price;
    
            await this.boxListsService.updateBox(boxList.id, {
                totalPrice: boxList.totalPrice,
            });
    
            await this.receiptRepository.remove(pendingReceipt);
    
            if (lastPaidReceipt) {
                lastPaidReceipt.status = 'PENDING';
                lastPaidReceipt.paymentDate = null;
                lastPaidReceipt.boxList = null;
    
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
}