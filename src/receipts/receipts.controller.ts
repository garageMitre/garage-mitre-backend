import { Controller, Get, Param, Post, Body, Patch, UseGuards, Delete } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { UpdateReceiptDto } from './dto/update-receipt.dto';
import { CustomerType } from 'src/customers/entities/customer.entity';

@Controller('receipts')
export class ReceiptsController {
    constructor(private readonly receiptsService: ReceiptsService) {}
 
    @Patch(':receiptId/customers/:customerId')
    async updateByOwner(
        @Param('customerId') customerId: string,
        @Param('receiptId') receiptId: string,
        @Body() updateReceiptDto : UpdateReceiptDto,
    ) {
        return await this.receiptsService.updateReceipt(receiptId, customerId, updateReceiptDto);
    }

    @Patch('cancelReceipt/:receiptId/customers/:customerId')
    async cancelReceiptByOwner(
        @Param('customerId') customerId: string,
        @Param('receiptId') receiptId: string
    ) {
        return await this.receiptsService.cancelReceipt(receiptId, customerId);
    }

    @Get(':customerType')
    async findAllPendingReceipts( @Param('customerType') customer: CustomerType) {
        return await this.receiptsService.findAllPendingReceipts(customer);
    }

    @Get()
    async findReceipts() {
        return await this.receiptsService.findReceipts();
    }


  @Post('generate-manual/:customerType')
  async generateReceiptsManual(@Param('customerType') customer: CustomerType, @Body() body: { dateNow: string }) {
    const { dateNow } = body;

    if (!dateNow) {
      throw new Error('Debe enviar una fecha válida en el cuerpo de la solicitud.');
    }

    await this.receiptsService.createReceiptMan(dateNow, customer);

    return {
      message: `Recibos generados (si faltaban) para el mes de ${dateNow}`,
    };
  }

  @Delete(':receiptId')
    async deleteReceipt(
        @Param('receiptId') receiptId: string
    ) {
        return await this.receiptsService.deleteReceipt(receiptId);
    }
}
