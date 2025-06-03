import { Injectable } from '@nestjs/common';
import { OpenAiService } from '../openai/openai.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly openai: OpenAiService,
    private readonly whatsapp: WhatsappService,
  ) {}

  async handleMessage(from: string, message: string) {
    // Aquí podrías consultar la base de datos si querés enriquecer el mensaje
    const aiResponse = await this.openai.ask(message);

    await this.whatsapp.sendMessage(from, aiResponse);
  }
}
