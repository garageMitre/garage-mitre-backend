import { Controller, Get, Post, Body, Patch, Param, Delete, Req, UseGuards } from '@nestjs/common';
import { NotesService } from './notes.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { Paginate, Paginated, PaginateQuery } from 'nestjs-paginate';
import { Note } from './entities/note.entity';
import { AuthOrTokenAuthGuard } from 'src/utils/guards/auth-or-token.guard';

@Controller('notes')
@UseGuards(AuthOrTokenAuthGuard)
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Post('users/:userId')
  create(@Param('userId') userId: string, @Body() createNoteDto: CreateNoteDto) {
    return this.notesService.create(createNoteDto, userId);
  }

  @Get()
  findAll(@Paginate() query: PaginateQuery): Promise<Paginated<Note>> {
    return this.notesService.findAll(query);
  }
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.notesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateNoteDto: UpdateNoteDto) {
    return this.notesService.update(id, updateNoteDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.notesService.remove(id);
  }

  @Get('today/:userId')
  async getTodayNotes(@Param('userId') userId: string) {
    return this.notesService.getTodayNotes(userId);
  }
}
