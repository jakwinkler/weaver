import { Module } from '@nestjs/common';
import { UsersModule } from '../users';
import { PagesController } from './pages.controller';
import { PagesService } from './pages.service';

@Module({
  imports: [UsersModule],
  controllers: [PagesController],
  providers: [PagesService],
  exports: [PagesService],
})
export class PagesModule {}
