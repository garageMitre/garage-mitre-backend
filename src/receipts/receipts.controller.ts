import { Controller, Get, Param, Post, Body, Patch, UseGuards } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { UpdateReceiptDto } from './dto/update-receipt.dto';

@Controller('receipts')
export class ReceiptsController {
    constructor(private readonly receiptsService: ReceiptsService) {}
 
    @Patch('customers/:customerId')
    async updateByOwner(
        @Param('customerId') customerId: string,
        @Body() updateReceiptDto : UpdateReceiptDto
    ) {
        return await this.receiptsService.updateReceipt(customerId, updateReceiptDto);
    }

    @Patch('cancelReceipt/customers/:customerId')
    async cancelReceiptByOwner(
        @Param('customerId') customerId: string
    ) {
        return await this.receiptsService.cancelReceipt(customerId);
    }

    @Patch('numberGenerator/:customerId')
    async numberGeneratorForAllCustomer( @Param('customerId') customerId: string) {
        return await this.receiptsService.numberGeneratorForAllCustomer(customerId);
    }
}
