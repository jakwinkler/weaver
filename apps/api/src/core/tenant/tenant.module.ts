import { Module, Global, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TenantMiddleware } from './tenant.middleware';
import { TenantService } from './tenant.service';
import { TenantConnectionProvider } from './tenant-connection.provider';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { ProjectAccessService } from './project-access.service';
import { ProjectAccessGuard } from './project-access.guard';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [
    TenantMiddleware,
    TenantService,
    TenantConnectionProvider,
    TenantProvisioningService,
    ProjectAccessService,
    ProjectAccessGuard,
  ],
  exports: [
    TenantService,
    TenantConnectionProvider,
    TenantProvisioningService,
    ProjectAccessService,
    ProjectAccessGuard,
  ],
})
export class TenantModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
