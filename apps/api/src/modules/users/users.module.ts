import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity, TenantMembershipEntity } from '@weaver/db';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AttachmentsModule } from '../attachments/attachments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, TenantMembershipEntity]),
    AttachmentsModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
