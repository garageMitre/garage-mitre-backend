import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {  ReceiptOwner  } from './entities/receipt-owner.entity';
import { Owner } from 'src/owners/entities/owner.entity';
import { Renter } from 'src/renters/entities/renter.entity';
import { ReceiptRenter } from './entities/receipt-renter.entity';

@Injectable()
export class ReceiptsService {
    private readonly logger = new Logger(ReceiptsService.name);
    
    constructor(
        @InjectRepository(ReceiptOwner)
        private readonly ReceiptOwnerRepository: Repository<ReceiptOwner>,
        @InjectRepository(ReceiptRenter)
        private readonly receiptRenterRepository: Repository<ReceiptRenter>,
        @InjectRepository(Owner)
        private readonly ownerRepository: Repository<Owner>,
        @InjectRepository(Renter)
        private readonly renterRepository: Repository<Renter>,
    ) {}

    async createByOwner(ownerId: string): Promise<ReceiptOwner> {
        try {
            // Buscar owner
            const owner = await this.ownerRepository.findOne({ where: { id: ownerId } });
            if (!owner) {
                throw new NotFoundException('Owner not found');
            }

            // Crear el recibo
            const receipt = this.ReceiptOwnerRepository.create({
                owner
            });
    
            // Guardar en la base de datos
            return await this.ReceiptOwnerRepository.save(receipt);
        } catch (error) {
            if (!(error instanceof NotFoundException)) {
              this.logger.error(error.message, error.stack);
            }
            throw error;
          }
    }
    

    async updateByOwner(ownerId: string) {
        try {
            // Buscar owner
            const owner = await this.ownerRepository.findOne({ 
                where: { id: ownerId },
                relations: ['receipts']
            });
            if (!owner) {
                throw new NotFoundException('Owner not found');
            }
            console.log(owner)

            // Buscar receipt asociado al owner
            const receipt = await this.ReceiptOwnerRepository.findOne({
                where: { owner:{id:owner.id}, status:'PENDING'},
            });
    
            if (!receipt) {
                throw new NotFoundException('Receipt not found');
            }

            receipt.status = 'PAID'
            receipt.paymentDate = new Date()
            await this.ReceiptOwnerRepository.save(receipt);

            const newReceipt = this.createByOwner(owner.id);

            return newReceipt;
        }catch (error) {
            if (!(error instanceof NotFoundException)) {
              this.logger.error(error.message, error.stack);
            }
            throw error;
          }
    }

    async cancelReceiptByOwner(ownerId: string) {
        try {
            const owner = await this.ownerRepository.findOne({
                where: { id: ownerId },
                relations: ['receipts']
            });
    
            if (!owner) {
                throw new NotFoundException('Owner not found');
            }
    
            // Ordenar los recibos por fecha o ID para asegurar que el último es realmente el más reciente
            owner.receipts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
            if (owner.receipts.length === 0) {
                throw new NotFoundException('No receipts found for this owner');
            }
    
            const lastReceipt = owner.receipts[0];
    
            // Eliminar el último recibo
            await this.ReceiptOwnerRepository.remove(lastReceipt);
    
            // Si hay otro recibo antes del eliminado, actualizar su estado
            if (owner.receipts.length > 1) {
                const secondLastReceipt = owner.receipts[1];
                secondLastReceipt.status = 'PENDING';
                secondLastReceipt.paymentDate = null;
                await this.ReceiptOwnerRepository.save(secondLastReceipt);
            }
          return owner;
    
        } catch (error) {
            if (!(error instanceof NotFoundException)) {
                this.logger.error(error.message, error.stack);
            }
            throw error;
        }
    }

    async createByRenter(renterId: string): Promise<ReceiptRenter> {
        try {
            // Buscar owner
            const renter = await this.renterRepository.findOne({ where: { id: renterId } });
            if (!renter) {
                throw new NotFoundException('Renter not found');
            }

            // Crear el recibo
            const receipt = this.receiptRenterRepository.create({
                renter
            });
    
            // Guardar en la base de datos
            return await this.receiptRenterRepository.save(receipt);
        } catch (error) {
            if (!(error instanceof NotFoundException)) {
              this.logger.error(error.message, error.stack);
            }
            throw error;
          }
    }
    

    async updateByRenter(renterId: string) {
        try {
            // Buscar owner
            const renter = await this.renterRepository.findOne({
                 where: { id: renterId },
                 relations: ['receipts']
                 });
            if (!renter) {
                throw new NotFoundException('Renter not found');
            }
            // Buscar receipt asociado al owner
            const receipt = await this.receiptRenterRepository.findOne({
                where: { renter:{id:renter.id}, status:'PENDING'},
            });
    
            if (!receipt) {
                throw new NotFoundException('Receipt not found');
            }

            receipt.status = 'PAID'
            receipt.paymentDate = new Date()
            await this.receiptRenterRepository.save(receipt);

            const newReceipt = this.receiptRenterRepository.create({
                renter
            });

            await this.receiptRenterRepository.save(newReceipt);
            return newReceipt;
        }catch (error) {
            if (!(error instanceof NotFoundException)) {
              this.logger.error(error.message, error.stack);
            }
            throw error;
          }
    }

    async cancelReceiptByRenter(renterId: string) {
        try {
            const renter = await this.renterRepository.findOne({
                 where: { id: renterId },
                 relations: ['receipts'] 
                });
            if (!renter) {
                throw new NotFoundException('Renter not found');
            }
    
            // Ordenar los recibos por fecha o ID para asegurar que el último es realmente el más reciente
            renter.receipts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
            if (renter.receipts.length === 0) {
                throw new NotFoundException('No receipts found for this owner');
            }
    
            const lastReceipt = renter.receipts[0];
    
            // Eliminar el último recibo
            await this.receiptRenterRepository.remove(lastReceipt);
    
            // Si hay otro recibo antes del eliminado, actualizar su estado
            if (renter.receipts.length > 1) {
                const secondLastReceipt = renter.receipts[1];
                secondLastReceipt.status = 'PENDING';
                secondLastReceipt.paymentDate = null;
                await this.receiptRenterRepository.save(secondLastReceipt);
            }
          return renter;
    
        } catch (error) {
            if (!(error instanceof NotFoundException)) {
                this.logger.error(error.message, error.stack);
            }
            throw error;
        }
    }

}