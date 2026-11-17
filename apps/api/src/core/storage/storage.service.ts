import type { ByteRange } from '@weaver/server-common';
import { Inject, Injectable } from '@nestjs/common';
import { STORAGE_ADAPTER, StorageAdapter } from './storage-adapter';

@Injectable()
export class StorageService implements StorageAdapter {
  constructor(@Inject(STORAGE_ADAPTER) private readonly adapter: StorageAdapter) {}

  put(key: string, data: Buffer): Promise<void> {
    return this.adapter.put(key, data);
  }

  get(key: string): Promise<Buffer> {
    return this.adapter.get(key);
  }

  putStream(key: string, data: AsyncIterable<Uint8Array>, signal?: AbortSignal) {
    return this.adapter.putStream(key, data, signal);
  }

  getStream(key: string, range?: ByteRange) {
    return this.adapter.getStream(key, range);
  }

  delete(key: string): Promise<void> {
    return this.adapter.delete(key);
  }
}
