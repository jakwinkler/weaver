import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LocalStorageAdapter } from './local-storage.adapter';
import { S3StorageAdapter } from './s3-storage.adapter';
import { STORAGE_ADAPTER, StorageAdapter } from './storage-adapter';
import { StorageService } from './storage.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: STORAGE_ADAPTER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): StorageAdapter => {
        const driver = config.get<string>('STORAGE_DRIVER', 'local');
        if (driver === 'local') return new LocalStorageAdapter(config);
        if (driver === 's3') return new S3StorageAdapter(config);
        throw new Error(`Unsupported STORAGE_DRIVER "${driver}"`);
      },
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
