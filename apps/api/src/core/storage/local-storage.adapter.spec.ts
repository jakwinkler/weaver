import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { LocalStorageAdapter } from './local-storage.adapter';

describe('LocalStorageAdapter', () => {
  let directory: string;
  let storage: LocalStorageAdapter;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'weaver-storage-'));
    storage = new LocalStorageAdapter(
      new ConfigService({ STORAGE_LOCAL_PATH: directory }),
    );
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('writes, reads, and deletes an opaque object key', async () => {
    await storage.put('550e8400-e29b-41d4-a716-446655440000', Buffer.from('hello'));

    await expect(storage.get('550e8400-e29b-41d4-a716-446655440000'))
      .resolves.toEqual(Buffer.from('hello'));
    await storage.delete('550e8400-e29b-41d4-a716-446655440000');
    await expect(storage.get('550e8400-e29b-41d4-a716-446655440000'))
      .rejects.toThrow('Storage object not found');
  });

  it('rejects keys that escape the configured directory', async () => {
    await expect(storage.put('../escape', Buffer.from('bad')))
      .rejects.toThrow('Storage key escapes the storage directory');
  });
});
