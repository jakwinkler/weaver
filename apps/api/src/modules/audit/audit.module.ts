import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  InstalledPluginEntity,
  TenantEntity,
  TenantMembershipEntity,
  UserEntity,
} from '@weaver/db';
import { AuditController } from './audit.controller';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      TenantEntity,
      TenantMembershipEntity,
      InstalledPluginEntity,
    ]),
  ],
  controllers: [AuditController],
  providers: [
    AuditService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  exports: [AuditService],
})
export class AuditModule {}
