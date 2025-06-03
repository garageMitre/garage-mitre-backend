// src/whatsapp/whatsapp.service.ts
import { Injectable } from '@nestjs/common';
import { Twilio } from 'twilio';

@Injectable()
export class WhatsappService {
  private client: Twilio;

  constructor() {
    this.client = new Twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN,
    );
  }

  async sendMessage(to: string, message: string) {
    await this.client.messages.create({
      body: message,
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to,
    });
  }
}
