import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, MoreThan, Not, Repository } from 'typeorm';
import { BoxListsService } from 'src/box-lists/box-lists.service';
import { BoxList } from 'src/box-lists/entities/box-list.entity';
import { addMonths, startOfMonth } from 'date-fns';
import { Customer, CustomerType } from 'src/customers/entities/customer.entity';
import { Receipt } from './entities/receipt.entity';
import { UpdateReceiptDto } from './dto/update-receipt.dto';

import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import * as isBetween from 'dayjs/plugin/isBetween'; 
import { Cron } from '@nestjs/schedule';
import { ReceiptPayment } from './entities/receipt-payment.entity';
import { PaymentHistoryOnAccount } from './entities/payment-history-on-account.entity';

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
        @InjectRepository(ReceiptPayment)
        private readonly receiptPaymentRepository: Repository<ReceiptPayment>,
        @InjectRepository(PaymentHistoryOnAccount)
        private readonly paymentHistoryOnAccountRepository: Repository<PaymentHistoryOnAccount>,
        private readonly boxListsService: BoxListsService,
        private readonly dataSource: DataSource,
    ) {}

async createReceipt(customerId: string, manager: EntityManager, price?: number, dateNow?: string, dateNowForDebt?: string): Promise<Receipt> {
  try {

    const customer = await manager.findOne(Customer, {
      where: { id: customerId },
      relations: ['vehicles', 'vehicleRenters', 'receipts'],
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    const argentinaTime = dayjs().tz('America/Argentina/Buenos_Aires');
    const nextMonthStartDate = argentinaTime
    .startOf('month')
    .add(1, 'day') 
    .tz('America/Argentina/Buenos_Aires')
    .format('YYYY-MM-DD');
    const actualStartDate = dateNow ?? dateNowForDebt ?? nextMonthStartDate;


    const length = Math.random() < 0.5 ? 11 : 15;
    const barcode = Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');

    const lastReceiptForTypeKey = await manager.findOne(Receipt, {
        where: {
          customer: { id: customer.id },
          status: 'PENDING',
        },
        order: {
          dateNow: 'ASC',
        },
  });
    // TIPO DE RECIBO
    let receiptTypeKey = 'OWNER';
    const manualRenters = lastReceiptForTypeKey ? lastReceiptForTypeKey.receiptTypeKey : ['JOSE_RICARDO_AZNAR', 'CARLOS_ALBERTO_AZNAR', 'NIDIA_ROSA_MARIA_FONTELA', 'ALDO_RAUL_FONTELA'];

    if (customer.customerType === 'RENTER') {
      const matchedOwner = customer.vehicleRenters.find(renter =>
        manualRenters.includes(renter.owner)
      );

      receiptTypeKey = matchedOwner ? matchedOwner.owner : 'GARAGE_MITRE';
    }

    // ÚLTIMO NÚMERO PARA ESTE receiptTypeKey
      const lastReceipt = await manager
        .createQueryBuilder(Receipt, 'receipt')
        .setLock('pessimistic_write') // <-- esto evita que otras instancias lean al mismo tiempo
        .where('receipt.receiptTypeKey = :type', { type: receiptTypeKey })
        .andWhere('receipt.receiptNumber IS NOT NULL')
        .orderBy('receipt.receiptNumber', 'DESC')
        .getOne();

        
    const receipt = manager.create(Receipt, {
      customer,
      price : price,
      startAmount: price,
      dateNow: actualStartDate,
      startDate: actualStartDate,
      barcode,
      receiptTypeKey,
    });


    // GENERAR receiptNumber
    if (lastReceipt && lastReceipt.receiptNumber) {
      const [shortNumber, longNumber] = lastReceipt.receiptNumber.replace('N° ', '').split('-');
      const nextShort = parseInt(shortNumber).toString().padStart(4, '0');
      const nextLong = (parseInt(longNumber) + 1).toString().padStart(8, '0');
      receipt.receiptNumber = `N° ${nextShort}-${nextLong}`;
    } else {
      receipt.receiptNumber = 'N° 0000-00000001';
    }

    return await manager.save(receipt);
  } catch (error) {
    if (!(error instanceof NotFoundException)) {
      this.logger.error(error.message, error.stack);
    }
    throw error;
  }
}


    async updateReceipt(receiptId: string, customerId: string, updateReceiptDto?: UpdateReceiptDto) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      
      try {
        const customer = await queryRunner.manager.findOne(Customer, {
          where: { id: customerId },
          relations: ['receipts'],
        });
    
        if (!customer) throw new NotFoundException('Customer not found');


        const receipt = !updateReceiptDto.barcode
          ? await queryRunner.manager.findOne(Receipt, {
              where: { id: receiptId }, // si necesitás esa relación
            })
          : await queryRunner.manager.findOne(Receipt, {
              where: { barcode: updateReceiptDto.barcode},
            })




        if (!receipt) throw new NotFoundException('Receipt not found');

        if (receipt.status === 'PAID') throw new BadRequestException('Receipt already paid');

    
        const argentinaTime = dayjs().tz('America/Argentina/Buenos_Aires').startOf('day');
    
        await queryRunner.manager.save(Customer, customer);
    
        if (updateReceiptDto.print) {

        }
    
        
        if(updateReceiptDto.onAccount === false){
          if(updateReceiptDto.payments.length > 1){
            let totalVerify = 0;
            for (const payment of updateReceiptDto.payments) {
              totalVerify += payment.price ?? 0;
            }
    
            if (totalVerify !== receipt.price) {
              throw new BadRequestException('La suma de los montos no es igual al total del recibo.');
            }
          }
  
          for (const payment of updateReceiptDto.payments) {
            const now = argentinaTime.format('YYYY-MM-DD');
  
            let boxList = await this.boxListsService.findBoxByDate(now, queryRunner.manager);
  
            const total = payment.price ? payment.price : receipt.price
            if (!boxList) {
              boxList = await this.boxListsService.createBox({
                date: now,
                totalPrice: (payment.paymentType === 'CASH' || payment.paymentType === 'CHECK')  ? total : 0,
              });
            } else {
              boxList.totalPrice += (payment.paymentType === 'CASH' || payment.paymentType === 'CHECK') ? total : 0;
              await this.boxListsService.updateBox(boxList.id, {
                totalPrice: boxList.totalPrice,
              }, queryRunner.manager);
            }
  
            const newPayment = this.receiptPaymentRepository.create({
              paymentType: payment.paymentType,
              price: total,
              paymentDate: argentinaTime.format('YYYY-MM-DD'),
              receipt,
              boxList: { id: boxList.id } as BoxList, // <- asignar boxList antes del save
            });
  
            await this.receiptPaymentRepository.save(newPayment);
          }
          receipt.status = 'PAID';
          receipt.paymentDate = argentinaTime.format('YYYY-MM-DD');
        }else{

          if(updateReceiptDto.payments.length > 0){
            let totalVerify = 0;
            for (const payment of updateReceiptDto.payments) {
              totalVerify += payment.price ?? 0;
            }
    
            if (totalVerify > receipt.price) {
              throw new BadRequestException('El pago a cuenta es mayor que el total del recibo.');
            }

            if (totalVerify === receipt.price) {
              throw new BadRequestException('El pago a cuenta es igual que el total del recibo, si desea pagar su totalidad desactive la funcion pago a cuenta.');
            }

            if(totalVerify === receipt.price){
              receipt.status = 'PAID';
              receipt.paymentDate = argentinaTime.format('YYYY-MM-DD');
            }else{
              receipt.price = receipt.price - totalVerify;
            }
          }
  
          for (const payment of updateReceiptDto.payments) {
            const now = argentinaTime.format('YYYY-MM-DD');
  
            let boxList = await this.boxListsService.findBoxByDate(now, queryRunner.manager);
  
            const total = payment.price;
            if (!boxList) {
              boxList = await this.boxListsService.createBox({
                date: now,
                totalPrice: (payment.paymentType === 'CASH' || payment.paymentType === 'CHECK')  ? total : 0,
              });
            } else {
              boxList.totalPrice += (payment.paymentType === 'CASH' || payment.paymentType === 'CHECK') ? total : 0;
              await this.boxListsService.updateBox(boxList.id, {
                totalPrice: boxList.totalPrice,
              }, queryRunner.manager);
            }
  
            const newPayment = this.paymentHistoryOnAccountRepository.create({
              paymentType: payment.paymentType,
              price: total,
              paymentDate: argentinaTime.format('YYYY-MM-DD'),
              receipt,
              boxList: { id: boxList.id } as BoxList, // <- asignar boxList antes del save
            });
  
            await this.paymentHistoryOnAccountRepository.save(newPayment);
          }
        }

        
        
    
        await queryRunner.manager.save(Receipt, receipt);
  
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
    
    async cancelReceipt(receiptId: string, customerId: string) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
    
      try {
        const customerRepo = queryRunner.manager.getRepository(Customer);
        const receiptRepo = queryRunner.manager.getRepository(Receipt);
        const receiptPaymentRepo = queryRunner.manager.getRepository(ReceiptPayment);
        const paymentHistoryRepo = queryRunner.manager.getRepository(PaymentHistoryOnAccount);


    
        const customer = await customerRepo.findOne({
          where: { id: customerId },
          relations: ['receipts'],
        });
    
        if (!customer) {
          throw new NotFoundException('Customer not found');
        }
        

        const lastPaidReceipt = await queryRunner.manager.findOne(Receipt, {
          where:{id:receiptId},
          relations: ['payments', 'paymentHistoryOnAccount']
        });


        if (!lastPaidReceipt) {
          throw new NotFoundException({
            code: 'RECEIPT_PAID_NOT_FOUND',
            message: 'No receipts paid found',
          });
        }

        const receiptDate = lastPaidReceipt.paymentDate
    
        let boxList = await this.boxListsService.findBoxByDate(receiptDate, queryRunner.manager);
    
        if (!boxList) {
          throw new NotFoundException('Box list not found');
        }
        if(lastPaidReceipt.payments.length > 0){
          for(const payments of lastPaidReceipt.payments){
  
            if (payments.paymentType === 'TRANSFER') {
              boxList.totalPrice += 0;
            } else {
              boxList.totalPrice -= payments.price;
            }
        
            await this.boxListsService.updateBox(boxList.id, {
              totalPrice: boxList.totalPrice,
            }, queryRunner.manager);
        
          }
          if(lastPaidReceipt.paymentHistoryOnAccount.length > 0)
          
          for(const historyPayments of lastPaidReceipt.paymentHistoryOnAccount){
  
            if (historyPayments.paymentType === 'TRANSFER') {
              boxList.totalPrice += 0;
            } else {
              boxList.totalPrice -= historyPayments.price;
            }
        
            await this.boxListsService.updateBox(boxList.id, {
              totalPrice: boxList.totalPrice,
            }, queryRunner.manager);
        
          }
        }
    
        lastPaidReceipt.status = 'PENDING';
        lastPaidReceipt.paymentDate = null;
        lastPaidReceipt.paymentType = null;
        lastPaidReceipt.price = lastPaidReceipt.startAmount;

    
        await receiptRepo.save(lastPaidReceipt);
        await receiptPaymentRepo.remove(lastPaidReceipt.payments);
         await paymentHistoryRepo.remove(lastPaidReceipt.paymentHistoryOnAccount);
    
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

async createReceiptMan(dateNowFront: string, customerType: CustomerType): Promise<Receipt[]> {
  const target = dayjs(dateNowFront);
  const targetMonthString = target.format('YYYY-MM');

  const qr = this.dataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();

  const createdReceipts: Receipt[] = [];

  try {
    this.logger.log(`Generando recibos para ${target.format('MM/YYYY')}`);

    const customers = await qr.manager.find(Customer, {
      where: { customerType: customerType },
      relations: ['receipts', 'vehicles', 'vehicleRenters'],
    });

    for (const customer of customers) {
      const exists = customer.receipts.some(r => {
        if (!r.dateNow) return false;
        return dayjs(r.dateNow).format('YYYY-MM') === targetMonthString;
      });

      if (exists) {
        this.logger.debug(`Cliente ${customer.id} ya tiene recibo en ${targetMonthString}, se salta.`);
        continue;
      }

      const totalVehicleAmount =
        customer.customerType === 'OWNER'
          ? customer.vehicles.reduce((acc, v) => acc + (v.amount || 0), 0)
          : customer.vehicleRenters.reduce((acc, vr) => acc + (vr.amount || 0), 0);

      let shouldCreateReceipt = true;
      if (customer.customerType !== 'OWNER') {
        shouldCreateReceipt = customer.vehicleRenters?.every(vr => vr.owner !== '');
      }

      if (shouldCreateReceipt) {
        const newReceipt = await this.createReceipt(customer.id, qr.manager, totalVehicleAmount, dateNowFront);
        createdReceipts.push(newReceipt);
      }
    }

    await qr.commitTransaction();
    this.logger.log('Recibos del mes finalizados correctamente');

    return createdReceipts;
  } catch (err) {
    await qr.rollbackTransaction();
    this.logger.error('Error en generación manual de recibos', err.stack);
    throw err;
  } finally {
    await qr.release();
  }
}


// @Cron('* * * * *', { timeZone: 'America/Argentina/Buenos_Aires' })
// async createReceiptAutm() {
//   const queryRunner = this.dataSource.createQueryRunner();
//   await queryRunner.connect();
//   await queryRunner.startTransaction();  // ← inicia la transacción aquí
//   try {
//     this.logger.log('Ejecutando cron updateInterests...');
//     const customers = await this.customerRepository.find({
//       relations: ['receipts','vehicles','vehicleRenters','vehicleRenters.vehicle'],
//     });

//     for (const customer of customers) {
//       // calcular monto...
//       const totalVehicleAmount =
//         customer.customerType === 'OWNER'
//           ? customer.vehicles.reduce((acc, v) => acc + (v.amount || 0), 0)
//           : customer.vehicleRenters.reduce((acc, vr) => acc + (vr.amount || 0), 0);

//       let shouldCreateReceipt = true;
//       if (customer.customerType !== 'OWNER') {
//         shouldCreateReceipt = customer.vehicleRenters?.every(vr => vr.owner !== '');
//       }

//       if (shouldCreateReceipt) {
//         await this.createReceipt(customer.id, queryRunner.manager, totalVehicleAmount);
//       }
//     }

//     // ⬇️ Un único commit al final, fuera del for
//     await queryRunner.commitTransaction();
//     this.logger.log('updateInterests: transacción confirmada');
//   } catch (error) {
//     // rollback en caso de cualquier fallo
//     await queryRunner.rollbackTransaction();
//     this.logger.error('Error al actualizar intereses', error.stack);
//   } finally {
//     await queryRunner.release();
//   }
// }



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

    async getBarcodeReceipt(barcode: string, manager: EntityManager):Promise<Receipt>{

      try{
        const receipt = await manager.findOne(Receipt, {
          where: { barcode },
          relations: ['customer', 'paymentHistoryOnAccount'],
        });

        if (!receipt) {
          this.logger.warn(`No se encontró el recibo con el código de barras: ${barcode}`);
          return null;
        }

        if (receipt.status === 'PAID') {
          throw new BadRequestException('El recibo ya fue pagado');
        }

        return receipt;
      }catch (error) {
        if (!(error instanceof NotFoundException)) {
          this.logger.error(error.message, error.stack);
        }
        throw error;
      }
    }

    async findReceipts(){
      try{
        const receipts = await this.receiptRepository.find({relations: ['payments', 'customer','customer.vehicleRenters', 'customer.vehicleRenters.vehicle', 'customer.vehicleRenters.vehicle.customer']})

        return receipts;
      }catch (error) {
        if (!(error instanceof NotFoundException)) {
          this.logger.error(error.message, error.stack);
        }
        throw error;
      }
    }

}