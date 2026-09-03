export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export const STORAGE_ADAPTER = Symbol('STORAGE_ADAPTER');
