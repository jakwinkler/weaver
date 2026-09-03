import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { StorageAdapter } from './storage-adapter';

export class S3StorageAdapter implements StorageAdapter {
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(config: ConfigService) {
    const bucket = config.get<string>('S3_BUCKET');
    const region = config.get<string>('S3_REGION');
    if (!bucket || !region) {
      throw new Error('S3_BUCKET and S3_REGION are required for STORAGE_DRIVER=s3');
    }

    const accessKeyId = config.get<string>('S3_ACCESS_KEY_ID')
      ?? config.get<string>('S3_ACCESS_KEY');
    const secretAccessKey = config.get<string>('S3_SECRET_ACCESS_KEY')
      ?? config.get<string>('S3_SECRET_KEY');
    if (!!accessKeyId !== !!secretAccessKey) {
      throw new Error('Both S3 access key and secret key must be configured together');
    }

    this.bucket = bucket;
    this.client = new S3Client({
      region,
      endpoint: config.get<string>('S3_ENDPOINT') || undefined,
      forcePathStyle: config.get<string>('S3_FORCE_PATH_STYLE') === 'true',
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
  }

  async put(key: string, data: Buffer): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: data,
    }));
  }

  async get(key: string): Promise<Buffer> {
    const response = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
    if (!response.Body) {
      throw new Error('Storage object not found');
    }
    return Buffer.from(await response.Body.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
  }
}
