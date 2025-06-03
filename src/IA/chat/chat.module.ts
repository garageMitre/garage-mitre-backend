import { forwardRef, Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { OpenAiModule } from '../openai/openai.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [forwardRef(() => OpenAiModule), forwardRef(() => WhatsappModule)],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
