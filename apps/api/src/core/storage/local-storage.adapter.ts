import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { StorageAdapter } from './storage-adapter';

export class LocalStorageAdapter implements StorageAdapter {
  private readonly directory: string;

  constructor(config: ConfigService) {
    this.directory = path.resolve(
      config.get<string>('STORAGE_LOCAL_PATH', '/tmp/weaver-uploads'),
    );
  }

  async put(key: string, data: Buffer): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true });
    await fs.writeFile(this.resolveKey(key), data);
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await fs.readFile(this.resolveKey(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('Storage object not found');
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolveKey(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  private resolveKey(key: string): string {
    const objectPath = path.resolve(this.directory, key);
    if (path.dirname(objectPath) !== this.directory) {
      throw new Error('Storage key escapes the storage directory');
    }
    return objectPath;
  }
}
