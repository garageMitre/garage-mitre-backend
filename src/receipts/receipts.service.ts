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


    async updateReceipt(customerId: string, updateReceiptDto?: UpdateReceiptDto) {
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
          where: {
            customer: { id: customer.id },
            status: 'PENDING',
          },
          order: {
            dateNow: 'ASC',
          },
        });



        if (!receipt) throw new NotFoundException('Receipt not found');

        
    
        const argentinaTime = dayjs().tz('America/Argentina/Buenos_Aires').startOf('day');
        const dataNow = argentinaTime
        .startOf('month')
        .add(1, 'day') 
        .tz('America/Argentina/Buenos_Aires')
        .format('YYYY-MM-DD');
        const hasPaid = customer.startDate
        ? dayjs(dataNow).isBefore(dayjs(customer.startDate))
        : false;

    
        if (hasPaid) {
          throw new NotFoundException({
            code: 'RECEIPT_PAID',
            message: 'This bill was already paid this month.',
          });
        }
      const closestPendingReceipt = await queryRunner.manager.findOne(Receipt, {
        where: {
          customer: { id: customer.id },
          status: 'PENDING',
          startDate: MoreThan(receipt.startDate), 
        },
        order: { startDate: 'ASC' },
      });


          let baseDate: dayjs.Dayjs;
          if (closestPendingReceipt) {
            baseDate = dayjs(closestPendingReceipt.startDate).tz('America/Argentina/Buenos_Aires');
          } else {
            baseDate = dayjs().add(1, 'month').tz('America/Argentina/Buenos_Aires');
          }

          const nextMonthStartDate = baseDate.startOf('month').add(1, 'day').format('YYYY-MM-DD');
          const prevMonthStartDate = baseDate
          .subtract(1, 'month')
          .add(1, 'day') 
          .format('YYYY-MM-DD');


          customer.previusStartDate = prevMonthStartDate;
          customer.startDate = nextMonthStartDate;

    
        await queryRunner.manager.save(Customer, customer);
    
        if (updateReceiptDto.print) {

        }
    
        receipt.status = 'PAID';
        receipt.paymentType = updateReceiptDto.paymentType;
        receipt.paymentDate = argentinaTime.format('YYYY-MM-DD');
    
        const now = argentinaTime.format('YYYY-MM-DD')

        let boxList = await this.boxListsService.findBoxByDate(now, queryRunner.manager);
    
        if (!boxList) {
          boxList = await this.boxListsService.createBox({
            date: now,
            totalPrice:(receipt.paymentType === 'CASH' || receipt.paymentType === 'CHECK') ? receipt.price : 0,
          });
        } else {
          boxList.totalPrice += (receipt.paymentType === 'CASH' || receipt.paymentType === 'CHECK') ? receipt.price : 0;
          await this.boxListsService.updateBox(boxList.id, {
            totalPrice: boxList.totalPrice,
          }, queryRunner.manager);
        }
    
        receipt.boxList = { id: boxList.id } as BoxList;
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
    

    
        
    
        const receipts = customer.receipts.sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        );
    
        const pendingReceipt = receipts.find((r) => r.status === 'PENDING');
        const lastPaidReceipt = await queryRunner.manager.findOne(Receipt, {
          where: {
            customer: { id: customer.id },
            status: 'PAID',
          },
          order: {
            dateNow: 'DESC',
          },
        });
        customer.startDate = dayjs(lastPaidReceipt.startDate)
        .format('YYYY-MM-DD');
        
        if (!customer.startDate) {
          throw new BadRequestException('startDate is required to calculate previousStartDate');
        }
        
        customer.previusStartDate = dayjs(lastPaidReceipt.startDate)
          .subtract(1, 'month')
          .format('YYYY-MM-DD');

        await customerRepo.save(customer);

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
    
        if (lastPaidReceipt.paymentType === 'TRANSFER') {
          boxList.totalPrice += 0;
        } else {
          boxList.totalPrice -= lastPaidReceipt.price;
        }
    
        await this.boxListsService.updateBox(boxList.id, {
          totalPrice: boxList.totalPrice,
        }, queryRunner.manager);
    
        lastPaidReceipt.status = 'PENDING';
        lastPaidReceipt.paymentDate = null;
        lastPaidReceipt.boxList = null;
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

    async getBarcodeReceipt(barcode: string){
      try{
        const barcodeReceipt = await this.receiptRepository.findOne({where:{barcode:barcode}, relations:['customer']})
        if(!barcodeReceipt){
          this.logger.warn(`No se encontró el recibocon el código de barras: ${barcode}`);
          return null;
        }
        return barcodeReceipt;
      }catch (error) {
        if (!(error instanceof NotFoundException)) {
          this.logger.error(error.message, error.stack);
        }
        throw error;
      }
    }

    async createReceiptForDebt(customerId: string, monthDebt: string, price: number){
        const qr = this.dataSource.createQueryRunner();
        await qr.connect();
        await qr.startTransaction();
      try{

        console.log(customerId)
        console.log(monthDebt)
        console.log(price)
       await this.createReceipt(customerId, qr.manager, price, monthDebt);

      }catch (error) {
        if (!(error instanceof NotFoundException)) {
          this.logger.error(error.message, error.stack);
        }
        throw error;
      }finally {
      await qr.release();
    }
    }

}