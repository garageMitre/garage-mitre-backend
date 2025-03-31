import { Module } from '@nestjs/common';
import { NotesService } from './notes.service';
import { NotesController } from './notes.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Note } from './entities/note.entity';
import { User } from 'src/users/entities/user.entity';
import { NotificationGateway } from './notification-gateway';

@Module({
  imports: [TypeOrmModule.forFeature([Note, User])],
  controllers: [NotesController],
  providers: [NotesService, NotificationGateway],
})
export class NotesModule {}
