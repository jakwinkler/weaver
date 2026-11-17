export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  putStream(key: string, data: AsyncIterable<Uint8Array>, signal?: AbortSignal): Promise<void>;
  getStream(key: string, range?: ByteRange): Promise<Readable>;
  abortWrite?(key: string): Promise<void>;
}
import { createReadStream, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash, randomUUID } from 'node:crypto';

export interface ByteRange {
  start: number;
  end: number;
}

export function parseByteRange(value: string, size: number): ByteRange {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || size <= 0) throw new Error('Invalid byte range');
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size)
    throw new Error('Invalid byte range');
  return { start, end };
}

export async function hashStream(
  stream: AsyncIterable<Uint8Array>,
): Promise<{ size: number; sha256: string }> {
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.byteLength;
    hash.update(chunk);
  }
  return { size, sha256: hash.digest('hex') };
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
    await this.putStream(key, Readable.from([data]));
  }

  async putStream(
    key: string,
    data: AsyncIterable<Uint8Array>,
    signal?: AbortSignal,
  ): Promise<void> {
    const destination = this.resolveKey(key);
    await fs.mkdir(this.directory, { recursive: true });
    const temporary = this.resolveKey(`.partial-${key}-${randomUUID()}`);
    try {
      await pipeline(
        Readable.from(data),
        createWriteStream(temporary, { flags: 'wx', mode: 0o600 }),
        { signal },
      );
      signal?.throwIfAborted();
      await fs.rename(temporary, destination);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }

  async abortWrite(key: string): Promise<void> {
    this.resolveKey(key);
    const names = await fs.readdir(this.directory).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    for (const name of names)
      if (name.startsWith(`.partial-${key}-`)) await fs.rm(this.resolveKey(name), { force: true });
  }

  async getStream(key: string, range?: ByteRange): Promise<Readable> {
    const filename = this.resolveKey(key);
    await fs.access(filename);
    return createReadStream(filename, range);
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
  AbortMultipartUploadCommand,
  ListMultipartUploadsCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
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

  async putStream(
    key: string,
    data: AsyncIterable<Uint8Array>,
    signal?: AbortSignal,
  ): Promise<void> {
    const target = { Bucket: this.bucket, Key: key };
    const created = await this.client.send(new CreateMultipartUploadCommand(target), {
      abortSignal: signal,
    });
    if (!created.UploadId) throw new Error('Storage did not return an upload ID');
    const upload = { ...target, UploadId: created.UploadId };
    const parts: Array<{ ETag: string; PartNumber: number }> = [];
    const partSize = 8 * 1024 * 1024;
    let buffer = Buffer.allocUnsafe(partSize);
    let length = 0;
    const flush = async () => {
      signal?.throwIfAborted();
      const PartNumber = parts.length + 1;
      const result = await this.client.send(
        new UploadPartCommand({ ...upload, PartNumber, Body: buffer.subarray(0, length) }),
        { abortSignal: signal },
      );
      if (!result.ETag) throw new Error('Storage did not return a part checksum');
      parts.push({ ETag: result.ETag, PartNumber });
      buffer = Buffer.allocUnsafe(partSize);
      length = 0;
    };
    try {
      for await (const chunk of data) {
        let offset = 0;
        while (offset < chunk.byteLength) {
          const count = Math.min(partSize - length, chunk.byteLength - offset);
          buffer.set(chunk.subarray(offset, offset + count), length);
          length += count;
          offset += count;
          if (length === partSize) await flush();
        }
      }
      if (length || !parts.length) await flush();
      await this.client.send(
        new CompleteMultipartUploadCommand({ ...upload, MultipartUpload: { Parts: parts } }),
        { abortSignal: signal },
      );
    } catch (error) {
      await this.client.send(new AbortMultipartUploadCommand(upload)).catch(() => undefined);
      throw error;
    }
  }

  async abortWrite(key: string): Promise<void> {
    let KeyMarker: string | undefined;
    let UploadIdMarker: string | undefined;
    do {
      const page = await this.client.send(
        new ListMultipartUploadsCommand({
          Bucket: this.bucket,
          Prefix: key,
          KeyMarker,
          UploadIdMarker,
        }),
      );
      for (const upload of page.Uploads ?? []) {
        if (upload.Key === key && upload.UploadId)
          await this.client.send(
            new AbortMultipartUploadCommand({
              Bucket: this.bucket,
              Key: key,
              UploadId: upload.UploadId,
            }),
          );
      }
      if (!page.IsTruncated) break;
      KeyMarker = page.NextKeyMarker;
      UploadIdMarker = page.NextUploadIdMarker;
    } while (KeyMarker);
  }

  async getStream(key: string, range?: ByteRange): Promise<Readable> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
      }),
    );
    if (!response.Body) throw new Error('Storage object not found');
    return response.Body as Readable;
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
