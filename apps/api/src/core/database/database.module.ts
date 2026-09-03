import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  TenantEntity,
  UserEntity,
  TenantMembershipEntity,
  ApiKeyEntity,
  InstalledPluginEntity,
  RefreshSessionEntity,
} from '@weaver/db';

const publicEntities = [
  TenantEntity,
  UserEntity,
  TenantMembershipEntity,
  ApiKeyEntity,
  InstalledPluginEntity,
  RefreshSessionEntity,
];

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DATABASE_HOST', 'localhost'),
        port: config.get<number>('DATABASE_PORT', 5432),
        username: config.get('DATABASE_USER', 'weaver'),
        password: config.get('DATABASE_PASSWORD', 'weaver_dev'),
        database: config.get('DATABASE_NAME', 'weaver'),
        schema: 'public',
        entities: publicEntities,
        synchronize: config.get('NODE_ENV') === 'development',
        logging: config.get('DATABASE_LOGGING') === 'true',
      }),
    }),
    TypeOrmModule.forFeature(publicEntities),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
