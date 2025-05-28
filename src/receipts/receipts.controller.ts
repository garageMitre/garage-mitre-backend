import { Controller, Get, Param, Post, Body, Patch, UseGuards } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { UpdateReceiptDto } from './dto/update-receipt.dto';
import { CustomerType } from 'src/customers/entities/customer.entity';

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

    @Get(':customerType')
    async findAllPendingReceipts( @Param('customerType') customer: CustomerType) {
        return await this.receiptsService.findAllPendingReceipts(customer);
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
}
