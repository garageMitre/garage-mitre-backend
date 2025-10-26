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

async updateReceipt(
  receiptId: string,
  customerId: string,
  updateReceiptDto?: UpdateReceiptDto
) {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // =========================================================
    // 🧍 Buscar CUSTOMER y RECEIPT
    // =========================================================
    const customer = await queryRunner.manager.findOne(Customer, {
      where: { id: customerId },
      relations: ['receipts'],
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const receipt = !updateReceiptDto.barcode
      ? await queryRunner.manager.findOne(Receipt, { where: { id: receiptId } })
      : await queryRunner.manager.findOne(Receipt, { where: { barcode: updateReceiptDto.barcode } });

    if (!receipt) throw new NotFoundException('Receipt not found');
    if (receipt.status === 'PAID') throw new BadRequestException('Receipt already paid');

    const argentinaTime = dayjs().tz('America/Argentina/Buenos_Aires').startOf('day');
    const now = argentinaTime.format('YYYY-MM-DD');

    // =========================================================
    // 🧭 Buscar último recibo pendiente del OWNER si el customer es PRIVATE
    // =========================================================
    let lastOwnerPendingReceipt: Receipt | null = null;

    if (customer.customerType === 'PRIVATE') {
      // 👇 Traigo el receipt con las relaciones necesarias para llegar al owner
      const receiptWithRelations = await queryRunner.manager.findOne(Receipt, {
        where: { id: receipt.id },
        relations: [
          'customer',
          'customer.vehicleRenters',
          'customer.vehicleRenters.vehicle',
          'customer.vehicleRenters.vehicle.customer'
        ],
      });
    
      const owner = receiptWithRelations?.customer?.vehicleRenters?.[0]?.vehicle?.customer;
      if (owner) {
        lastOwnerPendingReceipt = await queryRunner.manager.findOne(Receipt, {
          where: { customer: { id: owner.id }, status: 'PENDING' },
          order: { createdAt: 'DESC' },
        });
      }
    }


    // =========================================================
    // 🧾 PAGOS MANUALES (efectivo / crédito)
    // =========================================================
    if (updateReceiptDto.onAccount === false) {
      const totalWithoutCredit = updateReceiptDto.payments
        .filter(p => p.paymentType !== 'CREDIT')
        .reduce((sum, p) => sum + (p.price ?? 0), 0);

      const creditToUse = updateReceiptDto.payments.some(p => p.paymentType === 'CREDIT')
        ? Math.min(customer.credit ?? 0, receipt.price)
        : 0;

      const totalToPay = totalWithoutCredit + creditToUse;
      if (totalToPay > receipt.price) {
        throw new BadRequestException('La suma de los montos no puede superar el total del recibo.');
      }

      for (const payment of updateReceiptDto.payments) {
        // 💳 Pago con crédito
        if (payment.paymentType === 'CREDIT') {
          const creditToApply = Math.min(customer.credit ?? 0, receipt.price);
          if (creditToApply <= 0) throw new BadRequestException('El cliente no tiene crédito disponible.');

          const newCredit = customer.credit - creditToApply;
          const newReceiptPrice = receipt.price - creditToApply;

          let boxList = await this.boxListsService.findBoxByDate(now, queryRunner.manager);
          if (!boxList) {
            boxList = await this.boxListsService.createBox({
              date: now,
              totalPrice: 0,
            });
          }

          const creditPayment = this.receiptPaymentRepository.create({
            paymentType: 'CREDIT' as any,
            price: creditToApply,
            paymentDate: now,
            receipt,
            boxList: { id: boxList.id } as BoxList,
          });
          await this.receiptPaymentRepository.save(creditPayment);
          await queryRunner.manager.update(Customer, { id: customer.id }, { credit: newCredit });

          receipt.price = newReceiptPrice;
          if (newReceiptPrice === 0) {
            receipt.status = 'PAID';
            receipt.paymentDate = now;
          }
          continue;
        }

        // 💵 Pagos normales
        const total = payment.price ?? 0;
        let boxList = await this.boxListsService.findBoxByDate(now, queryRunner.manager);
        if (!boxList) {
          boxList = await this.boxListsService.createBox({
            date: now,
            totalPrice:
              payment.paymentType === 'CASH' || payment.paymentType === 'CHECK' ? total : 0,
          });
        } else {
          boxList.totalPrice +=
            payment.paymentType === 'CASH' || payment.paymentType === 'CHECK' ? total : 0;
          await this.boxListsService.updateBox(
            boxList.id,
            { totalPrice: boxList.totalPrice },
            queryRunner.manager
          );
        }

        const newPayment = this.receiptPaymentRepository.create({
          paymentType: payment.paymentType,
          price: total,
          paymentDate: now,
          receipt,
          boxList: { id: boxList.id } as BoxList,
        });
        await this.receiptPaymentRepository.save(newPayment);

        receipt.price -= total;
        if (receipt.price <= 0) {
          receipt.status = 'PAID';
          receipt.paymentDate = now;
        }
      }

      // ✅ Si hay recibo OWNER pendiente, también se paga
      if (lastOwnerPendingReceipt) {
        lastOwnerPendingReceipt.status = 'PAID';
        lastOwnerPendingReceipt.paymentDate = now;
        lastOwnerPendingReceipt.paymentType = 'TRANSFER';
        
        let boxList = await this.boxListsService.findBoxByDate(now, queryRunner.manager);
        await queryRunner.manager.save(lastOwnerPendingReceipt);
        boxList.totalPrice -= lastOwnerPendingReceipt.price;
      await this.boxListsService.updateBox(
        boxList.id,
        { totalPrice: boxList.totalPrice },
        queryRunner.manager
      );
      const newPayment = this.receiptPaymentRepository.create({
        paymentType: 'TP',
        price: lastOwnerPendingReceipt.price,
        paymentDate: now,
        receipt,
        boxList: { id: boxList.id } as BoxList,
      });
      await this.receiptPaymentRepository.save(newPayment);
      }
    }

    // =========================================================
    // 🧾 PAGOS A CUENTA
    // =========================================================
    else {
      const totalOnAccount = updateReceiptDto.payments
        .reduce((sum, p) => sum + (p.price ?? 0), 0);

      if (totalOnAccount <= 0) {
        throw new BadRequestException('El monto a cuenta debe ser mayor a 0.');
      }

      if (totalOnAccount > receipt.price) {
        throw new BadRequestException('El monto a cuenta no puede superar el saldo del recibo.');
      }

      if (lastOwnerPendingReceipt) {
        lastOwnerPendingReceipt.price = lastOwnerPendingReceipt.price - totalOnAccount;
        await queryRunner.manager.save(lastOwnerPendingReceipt);
      }

      for (const payment of updateReceiptDto.payments) {
        const total = payment.price ?? 0;

        let boxList = await this.boxListsService.findBoxByDate(now, queryRunner.manager);
        if (!boxList) {
          boxList = await this.boxListsService.createBox({
            date: now,
            totalPrice:
              payment.paymentType === 'CASH' || payment.paymentType === 'CHECK' ? total : 0,
          });
        } else {
          boxList.totalPrice +=
            payment.paymentType === 'CASH' || payment.paymentType === 'CHECK' ? total : 0;
          await this.boxListsService.updateBox(
            boxList.id,
            { totalPrice: boxList.totalPrice },
            queryRunner.manager
          );
        }

        const paymentOnAccount = this.receiptPaymentRepository.create({
          paymentType: payment.paymentType,
          price: total,
          paymentDate: now,
          receipt,
          boxList: { id: boxList.id } as BoxList,
        });

        await this.receiptPaymentRepository.save(paymentOnAccount);
      }

      if (totalOnAccount < receipt.price) {
        receipt.price -= totalOnAccount;
      }
    }

    // =========================================================
    // 🪙 2. Actualizar deuda mensual (si aplica)
    // =========================================================
    if (customer.monthsDebt && Array.isArray(customer.monthsDebt)) {
      const receiptMonth = receipt.startDate.slice(0, 7);
      const newMonthsDebt = customer.monthsDebt.map((debt) => {
        const debtMonth = debt.month.slice(0, 7);
        if (debtMonth === receiptMonth && receipt.status === 'PAID') {
          return { ...debt, status: 'PAID' };
        }
        return debt;
      });

      const unpaidMonths = newMonthsDebt.filter((debt) => {
        const debtMonth = debt.month.slice(0, 7);
        const hasPaidReceipt =
          debt.status === 'PAID' ||
          customer.receipts?.some((r) => r.startDate.slice(0, 7) === debtMonth && r.status === 'PAID');
        return !hasPaidReceipt;
      });

      const hasDebt = unpaidMonths.length > 0;

      await queryRunner.manager.update(Customer, { id: customer.id }, {
        monthsDebt: newMonthsDebt as any,
        hasDebt,
      });
    }

    // =========================================================
    // 💾 3. Guardar recibo final
    // =========================================================
    await queryRunner.manager.update(
      Receipt,
      { id: receipt.id },
      {
        price: receipt.price,
        status: receipt.status,
        paymentDate: receipt.paymentDate,
      }
    );

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

    console.log("🚀 [cancelReceipt] Inicio", { receiptId, customerId });

    const customer = await customerRepo.findOne({
      where: { id: customerId },
      relations: ['receipts'],
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const lastPaidReceipt = await queryRunner.manager.findOne(Receipt, {
      where: { id: receiptId },
      relations: ['payments', 'paymentHistoryOnAccount'],
    });

    if (!lastPaidReceipt) {
      throw new NotFoundException({
        code: 'RECEIPT_PAID_NOT_FOUND',
        message: 'No receipts paid found',
      });
    }

    const receiptDate = lastPaidReceipt.paymentDate;
    let boxList = await this.boxListsService.findBoxByDate(receiptDate, queryRunner.manager);

    if (!boxList) {
      throw new NotFoundException('Box list not found');
    }

    // =========================================================
    // 💳 1. Revertir pagos
    // =========================================================
    let creditToRefund = 0;

    // 💵 Pagos normales y crédito
    if (lastPaidReceipt.payments.length > 0) {
      for (const payment of lastPaidReceipt.payments) {
        console.log(`↩️ Revirtiendo pago: ${payment.paymentType} - $${payment.price}`);

        // Si es crédito, lo sumamos al monto a reintegrar
        if (payment.paymentType === 'CREDIT') {
          creditToRefund += payment.price ?? 0;
        }

        if (payment.paymentType !== 'TRANSFER') {
          boxList.totalPrice -= payment.price;
          await this.boxListsService.updateBox(
            boxList.id,
            { totalPrice: boxList.totalPrice },
            queryRunner.manager
          );
        }
      }
    }

    // 🧾 Pagos a cuenta
    if (lastPaidReceipt.paymentHistoryOnAccount.length > 0) {
      for (const historyPayment of lastPaidReceipt.paymentHistoryOnAccount) {
        console.log(`↩️ Revirtiendo pago a cuenta: ${historyPayment.paymentType} - $${historyPayment.price}`);

        if (historyPayment.paymentType === 'CREDIT') {
          creditToRefund += historyPayment.price ?? 0;
        }

        if (historyPayment.paymentType !== 'TRANSFER') {
          boxList.totalPrice -= historyPayment.price;
          await this.boxListsService.updateBox(
            boxList.id,
            { totalPrice: boxList.totalPrice },
            queryRunner.manager
          );
        }
      }
    }

    // =========================================================
    // 💰 2. Reintegrar crédito al cliente si aplica
    // =========================================================
    if (creditToRefund > 0) {
      console.log(`💳 Reintegrando $${creditToRefund} al crédito del cliente`);
      const newCredit = (customer.credit ?? 0) + creditToRefund;
      await queryRunner.manager.update(Customer, { id: customer.id }, { credit: newCredit });
    }

    // =========================================================
    // 🧾 3. Resetear el recibo
    // =========================================================
    lastPaidReceipt.status = 'PENDING';
    lastPaidReceipt.paymentDate = null;
    lastPaidReceipt.paymentType = null;
    lastPaidReceipt.price = lastPaidReceipt.startAmount;

    await receiptRepo.save(lastPaidReceipt);
    await receiptPaymentRepo.remove(lastPaidReceipt.payments);
    await paymentHistoryRepo.remove(lastPaidReceipt.paymentHistoryOnAccount);

    // =========================================================
    // 🪙 4. Actualizar deuda mensual
    // =========================================================
    if (customer.monthsDebt && Array.isArray(customer.monthsDebt)) {
      const receiptMonth = lastPaidReceipt.startDate.slice(0, 7);

      customer.monthsDebt = customer.monthsDebt.map((debt) => {
        const debtMonth = debt.month.slice(0, 7);
        if (debtMonth === receiptMonth && lastPaidReceipt.status === 'PENDING') {
          return { ...debt, status: 'PENDING' };
        }
        return debt;
      });

      customer.hasDebt = true;
      await queryRunner.manager.update(Customer, { id: customer.id }, {
        monthsDebt: customer.monthsDebt as any,
        hasDebt: true,
      });
    }

    // =========================================================
    // ✅ 5. Commit final
    // =========================================================
    await queryRunner.commitTransaction();
    console.log("✅ [cancelReceipt] Completado correctamente");

    return customer;
  } catch (error) {
    console.error("❌ [cancelReceipt] Error:", error);
    await queryRunner.rollbackTransaction();
    if (!(error instanceof NotFoundException)) {
      this.logger.error(error.message, error.stack);
    }
    throw error;
  } finally {
    console.log("🔚 [cancelReceipt] Liberando queryRunner");
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

    async deleteReceipt(receiptId: string) {
      try {
        const receipt = await this.receiptRepository.findOne({
          where: { id: receiptId },
          relations: ['customer'],
        });

        if (!receipt) {
          throw new NotFoundException(`Receipt with id ${receiptId} not found`);
        }

        if(receipt.status === 'PAID'){
          throw new BadRequestException({
            code: 'RECEIPT_ALREADY_PAID_FOR_DELETE',
            message: `El recibo ya esta pagado, por favor cancele el recibo antes de eliminarlo`,
          });
        }

        const customer = receipt.customer;

        if (customer.monthsDebt && Array.isArray(customer.monthsDebt)) {
          const receiptMonth = receipt.startDate.slice(0, 7);

          customer.monthsDebt = customer.monthsDebt.filter((debt) => {
            const debtMonth = debt.month.slice(0, 7); 
            return debtMonth !== receiptMonth;
          });

          if(customer.monthsDebt.length === 0){
            customer.hasDebt = false;
          }

          await this.customerRepository.save(customer);
        }

        await this.receiptRepository.remove(receipt); 

        return { message: 'Recibo eliminado correctamente' };
      } catch (error) {
        if (!(error instanceof NotFoundException)) {
          this.logger.error(error.message, error.stack);
        }
        throw error;
      }
    }

}