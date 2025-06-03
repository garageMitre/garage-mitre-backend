// src/openai/openai.service.ts
import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class OpenAiService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async ask(question: string): Promise<string> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo', // o 'gpt-3.5-turbo'
      messages: [
        {
          role: 'system',
          content: 'Eres un asistente que responde preguntas sobre datos empresariales.',
        },
        {
          role: 'user',
          content: question,
        },
      ],
    });

    return response.choices[0].message.content || 'No tengo respuesta.';
  }
}
