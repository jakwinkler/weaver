import { Inject, Injectable } from '@nestjs/common';
import { STORAGE_ADAPTER, StorageAdapter } from './storage-adapter';

@Injectable()
export class StorageService implements StorageAdapter {
  constructor(
    @Inject(STORAGE_ADAPTER) private readonly adapter: StorageAdapter,
  ) {}

  put(key: string, data: Buffer): Promise<void> {
    return this.adapter.put(key, data);
  }

  get(key: string): Promise<Buffer> {
    return this.adapter.get(key);
  }

  delete(key: string): Promise<void> {
    return this.adapter.delete(key);
  }
}
