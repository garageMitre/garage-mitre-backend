import { Controller, Post, Body, Req } from '@nestjs/common';
import { ChatService } from '../chat/chat.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly chatService: ChatService) {}

  @Post('webhook')
  async handleIncomingMessage(@Body() body: any): Promise<void> {
    const message = body.Body;
    const from = body.From;

    await this.chatService.handleMessage(from, message);
  }
}
