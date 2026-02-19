import { Module, Global, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { TenantMiddleware } from './tenant.middleware';
import { TenantService } from './tenant.service';
import { TenantConnectionProvider } from './tenant-connection.provider';
import { TenantProvisioningService } from './tenant-provisioning.service';

@Global()
@Module({
  providers: [TenantService, TenantConnectionProvider, TenantProvisioningService],
  exports: [TenantService, TenantConnectionProvider, TenantProvisioningService],
})
export class TenantModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
