import * as path from 'path';

const DEFAULT_STORAGE_PATH = '/tmp/weaver-uploads';
const DEFAULT_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export function getAttachmentStorageDirectory(
  configuredPath = process.env.STORAGE_LOCAL_PATH,
): string {
  return path.resolve(configuredPath || DEFAULT_STORAGE_PATH);
}

export function getMaxAttachmentBytes(
  configuredLimit = process.env.ATTACHMENT_MAX_BYTES,
): number {
  if (configuredLimit === undefined) {
    return DEFAULT_MAX_ATTACHMENT_BYTES;
  }

  const limit = Number(configuredLimit);
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error('ATTACHMENT_MAX_BYTES must be a positive integer');
  }

  return limit;
}

export function resolveAttachmentStoragePath(
  storageKey: string,
  storageDirectory = getAttachmentStorageDirectory(),
): string {
  const root = path.resolve(storageDirectory);
  const filePath = path.resolve(root, storageKey);

  if (path.dirname(filePath) !== root) {
    throw new Error('Attachment storage key escapes the storage directory');
  }

  return filePath;
}
