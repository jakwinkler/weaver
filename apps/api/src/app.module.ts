import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './core/database';
import { TenantModule } from './core/tenant';
import { AuthModule } from './core/auth';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    DatabaseModule,
    TenantModule,
    AuthModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
