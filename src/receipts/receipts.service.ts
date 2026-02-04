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

    // ✅ helper: solo EF/CH impacta en caja. FIX no registra BoxList.
    const shouldAffectBox = (paymentType: string) =>
      paymentType === 'CASH' || paymentType === 'CHECK';

    // =========================================================
    // 🧭 Buscar recibos pendientes del OWNER si el customer es PRIVATE
    //     - Ordenados por startDate (más viejo primero)
    //     - Si hay 2 o más pendientes -> tomar 2 (los más viejos)
    //     - Si hay 1 -> tomar 1
    // =========================================================
    let ownerPendingReceiptsToAutoPay: Receipt[] = [];
    let ownerToLink: Customer | null = null;

    if (customer.customerType === 'PRIVATE') {
      const receiptWithRelations = await queryRunner.manager.findOne(Receipt, {
        where: { id: receipt.id },
        relations: [
          'customer',
          'customer.vehicleRenters',
          'customer.vehicleRenters.vehicle',
          'customer.vehicleRenters.vehicle.customer',
        ],
      });

      const owner = receiptWithRelations?.customer?.vehicleRenters?.[0]?.vehicle?.customer;
      ownerToLink = owner ?? null;

      if (owner) {
        const ownerPendings = await queryRunner.manager.find(Receipt, {
          where: { customer: { id: owner.id }, status: 'PENDING' },
          order: { startDate: 'ASC' }, // ✅ IMPORTANTE: NO usar createdAt
          take: 2,                     // ✅ si hay 2+ pendientes, traemos los 2 más viejos
        });

        ownerPendingReceiptsToAutoPay = ownerPendings ?? [];
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

      // ✅ Si el private paga con FIX en alguno de sus pagos, NO registramos nada en BoxList
      const privateHasFIX = updateReceiptDto.payments.some(p => p.paymentType === 'FIX');

      // ✅ Este boxList se va a usar también para linkear autopagos del OWNER (si no es FIX)
      let sharedBoxList: BoxList | null = null;

      // Si NO es FIX, me aseguro de tener un boxList del día
      if (!privateHasFIX) {
        sharedBoxList = await this.boxListsService.findBoxByDate(now, queryRunner.manager);
        if (!sharedBoxList) {
          sharedBoxList = await this.boxListsService.createBox({
            date: now,
            totalPrice: 0,
          });
        }
      }

      for (const payment of updateReceiptDto.payments) {
        // 💳 Pago con crédito
        if (payment.paymentType === 'CREDIT') {
          const creditToApply = Math.min(customer.credit ?? 0, receipt.price);
          if (creditToApply <= 0) throw new BadRequestException('El cliente no tiene crédito disponible.');

          const newCredit = customer.credit - creditToApply;
          const newReceiptPrice = receipt.price - creditToApply;

          // ⚠️ Crédito no es FIX → se mantiene tu lógica: se registra con boxList del día
          // Si el usuario además mandó FIX en otro payment, vos querés que FIX no registre,
          // pero crédito sí se puede seguir registrando como venías (esto lo dejo igual).
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

        // ✅ FIX: NO registrar en BoxList (boxList = null)
        // ✅ Normal: SIEMPRE registrar en BoxList (aunque no afecte totalPrice)
        let boxListForThisPayment: BoxList | null = null;

        if (payment.paymentType !== 'FIX') {
          // uso el boxList compartido del día (si existe), si no, lo busco/creo
          boxListForThisPayment = sharedBoxList
            ? sharedBoxList
            : await this.boxListsService.findBoxByDate(now, queryRunner.manager);

          if (!boxListForThisPayment) {
            boxListForThisPayment = await this.boxListsService.createBox({
              date: now,
              totalPrice: shouldAffectBox(payment.paymentType) ? total : 0,
            });
          } else {
            // solo EF/CH suman al totalPrice
            if (shouldAffectBox(payment.paymentType)) {
              boxListForThisPayment.totalPrice += total;
              await this.boxListsService.updateBox(
                boxListForThisPayment.id,
                { totalPrice: boxListForThisPayment.totalPrice },
                queryRunner.manager
              );
            }
          }

          // guardo por si todavía no estaba seteado
          if (!sharedBoxList) sharedBoxList = boxListForThisPayment;
        }

        const newPayment = this.receiptPaymentRepository.create({
          paymentType: payment.paymentType,
          price: total,
          paymentDate: now,
          receipt,
          boxList: boxListForThisPayment ? ({ id: boxListForThisPayment.id } as BoxList) : null, // ✅ FIX => null
        });
        await this.receiptPaymentRepository.save(newPayment);

        receipt.price -= total;
        if (receipt.price <= 0) {
          receipt.status = 'PAID';
          receipt.paymentDate = now;
        }
      }

      // ✅ Si hay recibos OWNER pendientes, pagar 1 o 2 (los más viejos)
      if (ownerPendingReceiptsToAutoPay.length > 0) {
        // 💡 Determinar si el pago original del PRIVATE fue en efectivo
        const privatePaidInCash = updateReceiptDto.payments.some((p) => p.paymentType === 'CASH');

        // 💳 Si el private pagó en efectivo → MIX, sino → TP
        const paymentTypeForOwner = privatePaidInCash ? 'MIX' : 'TP';

        // ✅ Si el private NO fue FIX, linkeamos estos pagos al boxList del día para que APAREZCAN en BoxList/PDF
        // ✅ Si el private fue FIX, boxList = null (no aparece en caja)
        const ownerBoxListToUse =
          privateHasFIX ? null : (sharedBoxList ? ({ id: sharedBoxList.id } as BoxList) : null);

        for (const ownerReceipt of ownerPendingReceiptsToAutoPay) {
          ownerReceipt.status = 'PAID';
          ownerReceipt.paymentDate = now;

          const newPayment = this.receiptPaymentRepository.create({
            paymentType: paymentTypeForOwner as any,
            price: ownerReceipt.price,
            paymentDate: now,
            receipt: ownerReceipt,
            boxList: ownerBoxListToUse, // ✅ AHORA: aparece en boxlist si no es FIX
          });

          await this.receiptPaymentRepository.save(newPayment);
          await queryRunner.manager.save(ownerReceipt);
        }
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

      // ✅ Si es PRIVATE y hay OWNER, descontar el pago a cuenta del/los recibos más viejos del OWNER
      if (customer.customerType === 'PRIVATE' && ownerToLink) {
        const ownerAllPendings = await queryRunner.manager.find(Receipt, {
          where: { customer: { id: ownerToLink.id }, status: 'PENDING' },
          order: { startDate: 'ASC' },
        });

        let remaining = totalOnAccount;

        for (const r of ownerAllPendings) {
          if (remaining <= 0) break;

          const apply = Math.min(r.price, remaining);
          r.price -= apply;
          remaining -= apply;

          if (r.price <= 0) {
            r.price = 0;
            r.status = 'PAID';
            r.paymentDate = now;
          }

          await queryRunner.manager.save(r);
        }
      }

      for (const payment of updateReceiptDto.payments) {
        const total = payment.price ?? 0;

        // ✅ FIX: NO registrar en BoxList (boxList = null)
        // ✅ Normal: SIEMPRE registrar en BoxList
        let boxList: BoxList | null = null;

        if (payment.paymentType !== 'FIX') {
          boxList = await this.boxListsService.findBoxByDate(now, queryRunner.manager);

          if (!boxList) {
            boxList = await this.boxListsService.createBox({
              date: now,
              totalPrice: shouldAffectBox(payment.paymentType) ? total : 0,
            });
          } else {
            if (shouldAffectBox(payment.paymentType)) {
              boxList.totalPrice += total;
              await this.boxListsService.updateBox(
                boxList.id,
                { totalPrice: boxList.totalPrice },
                queryRunner.manager
              );
            }
          }
        }

        const paymentOnAccount = this.receiptPaymentRepository.create({
          paymentType: payment.paymentType,
          price: total,
          paymentDate: now,
          receipt,
          boxList: boxList ? ({ id: boxList.id } as BoxList) : null, // ✅ FIX => null
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
      relations: [
        "receipts",
        "vehicleRenters",
        "vehicleRenters.vehicle",
        "vehicleRenters.vehicle.customer",
        "vehicleRenters.vehicle.customer.receipts",
        "vehicleRenters.vehicle.customer.receipts.payments",
        "vehicles",
        "vehicles.vehicleRenters",
      ],
    });

    if (!customer) throw new NotFoundException("Customer not found");

    // ✅ Regla: OWNER no puede cancelar si tiene inquilino relacionado
    if (customer.customerType === "OWNER") {
      const hasRenterRelated = (customer.vehicles ?? []).some((v) => {
        return (v.vehicleRenters ?? []).length > 0;
      });

      if (hasRenterRelated) {
        throw new BadRequestException(
          "No se puede cancelar porque tiene un inquilino relacionado",
        );
      }
    }

    const lastPaidReceipt = await queryRunner.manager.findOne(Receipt, {
      where: { id: receiptId },
      relations: ["payments", "paymentHistoryOnAccount"],
    });

    if (!lastPaidReceipt) throw new NotFoundException("Receipt not found");

    // ✅ guardamos la fecha antes de resetear (la usamos para buscar los pagos del owner)
    const receiptDate = lastPaidReceipt.paymentDate;
    if (!receiptDate) {
      throw new BadRequestException("El recibo no tiene paymentDate, no se puede cancelar.");
    }

    let boxList = await this.boxListsService.findBoxByDate(receiptDate, queryRunner.manager);
    if (!boxList) throw new NotFoundException("Box list not found");

    // =========================================================
    // 💳 1) Revertir pagos del recibo actual
    //    - CREDIT → vuelve a crédito del cliente
    //    - CASH  → resta en caja
    // =========================================================
    let creditToRefund = 0;

    for (const payment of lastPaidReceipt.payments ?? []) {
      if (payment.paymentType === "CREDIT") {
        creditToRefund += payment.price ?? 0;
      }

      // ✅ solo EF impacta en caja
      if (payment.paymentType === "CASH") {
        boxList.totalPrice -= payment.price ?? 0;
        await this.boxListsService.updateBox(
          boxList.id,
          { totalPrice: boxList.totalPrice },
          queryRunner.manager,
        );
      }
    }

    for (const historyPayment of lastPaidReceipt.paymentHistoryOnAccount ?? []) {
      if (historyPayment.paymentType === "CREDIT") {
        creditToRefund += historyPayment.price ?? 0;
      }

      // ✅ solo EF impacta en caja
      if (historyPayment.paymentType === "CASH") {
        boxList.totalPrice -= historyPayment.price ?? 0;
        await this.boxListsService.updateBox(
          boxList.id,
          { totalPrice: boxList.totalPrice },
          queryRunner.manager,
        );
      }
    }

    // =========================================================
    // 💰 2) Reintegrar crédito al cliente si aplica
    // =========================================================
    if (creditToRefund > 0) {
      const newCredit = (customer.credit ?? 0) + creditToRefund;
      await queryRunner.manager.update(Customer, { id: customer.id }, { credit: newCredit });
    }

    // =========================================================
    // 🧾 3) Resetear recibo actual (PRIVATE u OWNER)
    // =========================================================
    lastPaidReceipt.status = "PENDING";
    lastPaidReceipt.paymentDate = null;
    lastPaidReceipt.paymentType = null;
    lastPaidReceipt.price = lastPaidReceipt.startAmount;

    await receiptRepo.save(lastPaidReceipt);
    await receiptPaymentRepo.remove(lastPaidReceipt.payments ?? []);
    await paymentHistoryRepo.remove(lastPaidReceipt.paymentHistoryOnAccount ?? []);

    // =========================================================
    // 🧍‍♂️ 4) Si el CUSTOMER es PRIVATE → cancelar también los pagos AUTO del OWNER
    //    Regla nueva:
    //    - Cancelar el/los pagos del owner con paymentDate === receiptDate
    //    - Para evitar pagos manuales del owner, cancelamos solo MIX / TP (auto-pagos)
    //    - Si se pagaron 2 recibos del owner ese día, se cancelan los 2.
    // =========================================================
    if (customer.customerType === "PRIVATE") {
      const owner = customer.vehicleRenters?.[0]?.vehicle?.customer;

      if (owner) {
        const ownerPaymentsSameDate = await receiptPaymentRepo.find({
          where: {
            receipt: { customer: { id: owner.id } },
            paymentDate: receiptDate,
          },
          relations: ["receipt"],
          order: { paymentDate: "DESC" as const },
        });

        // ✅ solo los auto-pagos que creaste desde PRIVATE
        const ownerAutoPaymentsToCancel = ownerPaymentsSameDate.filter(
          (p) => p.paymentType === "MIX" || p.paymentType === "TP",
        );

        for (const p of ownerAutoPaymentsToCancel) {
          const ownerReceipt = p.receipt;

          // (MIX/TP no impacta caja según tu lógica, así que no tocamos boxList)
          await receiptPaymentRepo.remove(p);

          // si no quedan pagos, dejar el recibo del owner en PENDING
          const remaining = await receiptPaymentRepo.count({
            where: { receipt: { id: ownerReceipt.id } },
          });

          if (remaining === 0) {
            ownerReceipt.status = "PENDING";
            ownerReceipt.paymentDate = null;
            ownerReceipt.paymentType = null;
            ownerReceipt.price = ownerReceipt.startAmount;

            await receiptRepo.save(ownerReceipt);
          }
        }
      }
    }

    // =========================================================
    // ✅ Commit final
    // =========================================================
    await queryRunner.commitTransaction();
    console.log("✅ [cancelReceipt] Completado correctamente");

    return customer;
  } catch (error) {
    console.error("❌ [cancelReceipt] Error:", error);
    await queryRunner.rollbackTransaction();
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