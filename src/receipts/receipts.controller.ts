import { Controller, Get, Param, Post, Body, Patch } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';

@Controller('receipts')
export class ReceiptsController {
    constructor(private readonly receiptsService: ReceiptsService) {}
 
    @Patch('owners/:ownerId')
    async updateByOwner(
        @Param('ownerId') ownerId: string
    ) {
        return await this.receiptsService.updateByOwner(ownerId);
    }

    @Patch('cancelReceipt/owners/:ownerId')
    async cancelReceiptByOwner(
        @Param('ownerId') ownerId: string
    ) {
        return await this.receiptsService.cancelReceiptByOwner(ownerId);
    }

    @Patch('renters/:renterId')
    async updateByRenter(
        @Param('renterId') renterId: string
    ) {
        return await this.receiptsService.updateByRenter(renterId);
    }

    @Patch('cancelReceipt/renters/:renterId')
    async cancelReceiptByRenter(
        @Param('renterId') renterId: string
    ) {
        return await this.receiptsService.cancelReceiptByRenter(renterId);
    }
}
