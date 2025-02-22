import { Controller, Get, Param, Post, Body, Patch, UseGuards } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';

@Controller('receipts')
export class ReceiptsController {
    constructor(private readonly receiptsService: ReceiptsService) {}
 
    @Patch('customers/:customerId')
    async updateByOwner(
        @Param('customerId') customerId: string
    ) {
        return await this.receiptsService.updateReceipt(customerId);
    }

    @Patch('cancelReceipt/customers/:customerId')
    async cancelReceiptByOwner(
        @Param('customerId') customerId: string
    ) {
        return await this.receiptsService.cancelReceipt(customerId);
    }
}
