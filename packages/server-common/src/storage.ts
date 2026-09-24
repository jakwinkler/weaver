export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}
export interface StorageConfig {
  get<T = string>(key: string, fallback?: T): T;
}
import * as fs from 'fs/promises';
import * as path from 'path';

export class LocalStorageAdapter implements StorageAdapter {
  private readonly directory: string;

  constructor(config: StorageConfig) {
    this.directory = path.resolve(config.get<string>('STORAGE_LOCAL_PATH', '/tmp/weaver-uploads'));
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

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export class S3StorageAdapter implements StorageAdapter {
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(config: StorageConfig) {
    const bucket = config.get<string>('S3_BUCKET');
    const region = config.get<string>('S3_REGION');
    if (!bucket || !region) {
      throw new Error('S3_BUCKET and S3_REGION are required for STORAGE_DRIVER=s3');
    }

    const accessKeyId =
      config.get<string>('S3_ACCESS_KEY_ID') ?? config.get<string>('S3_ACCESS_KEY');
    const secretAccessKey =
      config.get<string>('S3_SECRET_ACCESS_KEY') ?? config.get<string>('S3_SECRET_KEY');
    if (!!accessKeyId !== !!secretAccessKey) {
      throw new Error('Both S3 access key and secret key must be configured together');
    }

    this.bucket = bucket;
    this.client = new S3Client({
      region,
      endpoint: config.get<string>('S3_ENDPOINT') || undefined,
      forcePathStyle: config.get<string>('S3_FORCE_PATH_STYLE') === 'true',
      ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    });
  }

  async put(key: string, data: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    if (!response.Body) {
      throw new Error('Storage object not found');
    }
    return Buffer.from(await response.Body.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }
}

export function createStorageFromEnvironment(): StorageAdapter {
  const config: StorageConfig = {
    get: <T>(key: string, fallback?: T): T => (process.env[key] ?? fallback) as T,
  };
  const driver = config.get<string>('STORAGE_DRIVER', 'local');
  if (driver === 's3') return new S3StorageAdapter(config);
  if (driver !== 'local') throw new Error('Unsupported storage driver');
  return new LocalStorageAdapter(config);
}
