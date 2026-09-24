import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function importKey(value: string | undefined): Buffer {
  const key = Buffer.from(value ?? '', 'base64');
  if (key.length !== 32)
    throw new Error('IMPORT_CREDENTIAL_KEY must be a base64-encoded 32-byte key on API and worker');
  return key;
}

export function sealImportJob(
  value: unknown,
  binding: string,
  keyValue: string | undefined,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', importKey(keyValue), iv);
  cipher.setAAD(Buffer.from(binding));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

export function openImportJob<T>(sealed: string, binding: string, keyValue: string | undefined): T {
  if (typeof sealed !== 'string' || sealed.length > 1024 * 1024)
    throw new Error('Invalid encrypted import job');
  const data = Buffer.from(sealed, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', importKey(keyValue), data.subarray(0, 12));
  decipher.setAAD(Buffer.from(binding));
  decipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8'),
  ) as T;
}
