import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { StorageAdapter } from '@weaver/server-common';

export function attachmentLimit(): number {
  return positiveSetting('JIRA_IMPORT_ATTACHMENT_MAX_BYTES', 512 * 1024 * 1024);
}

function positiveSetting(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error(`${name} must be a positive integer`);
  return value;
}

export class AttachmentTransferError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly receivedBytes = 0,
  ) {
    super(message);
  }
}

/** Each attempt owns its unpublished storage write. The storage adapter aborts on generator failure. */
export async function transferAttachment(
  fetchResponse: (signal: AbortSignal) => Promise<Response>,
  storage: StorageAdapter,
  key: string,
  expectedSize?: number,
  checkCancelled: () => Promise<void> = async () => undefined,
): Promise<{ size: number; sha256: string }> {
  const limit = attachmentLimit();
  if (expectedSize !== undefined && (!Number.isSafeInteger(expectedSize) || expectedSize < 0))
    throw new AttachmentTransferError('invalid_size', 'Invalid Jira attachment size');
  if (expectedSize !== undefined && expectedSize > limit)
    throw new AttachmentTransferError(
      'size_limit',
      `Attachment is ${expectedSize} bytes; import limit is ${limit} bytes`,
    );
  for (let attempt = 0; ; attempt++) {
    await checkCancelled();
    const abort = new AbortController();
    const total = setTimeout(
      () =>
        abort.abort(new AttachmentTransferError('timeout', 'Attachment transfer timed out', true)),
      positiveSetting('JIRA_IMPORT_ATTACHMENT_TIMEOUT_MS', 900000),
    );
    const headers = setTimeout(
      () =>
        abort.abort(new AttachmentTransferError('timeout', 'Attachment response timed out', true)),
      positiveSetting('JIRA_IMPORT_ATTACHMENT_HEADER_TIMEOUT_MS', 30000),
    );
    let checking = false;
    let cancelled: unknown;
    const poll = setInterval(() => {
      if (checking) return;
      checking = true;
      void checkCancelled()
        .catch((error) => {
          cancelled = error;
          abort.abort(error);
        })
        .finally(() => {
          checking = false;
        });
    }, 1000);
    let response: Response | undefined;
    let retryAfter = 1000 * 2 ** attempt;
    try {
      response = await fetchResponse(abort.signal);
      clearTimeout(headers);
      if (!response.ok) {
        const value = response.headers.get('retry-after');
        const seconds = value === null ? NaN : Number(value);
        if (Number.isFinite(seconds) && seconds >= 0) retryAfter = Math.min(seconds * 1000, 30000);
        throw new AttachmentTransferError(
          'http_error',
          `Jira attachment download failed (${response.status})`,
          response.status === 429 || response.status >= 500,
        );
      }
      const current = response;
      const hash = createHash('sha256');
      let size = 0;
      async function* chunks() {
        const reader = current.body?.getReader();
        const cancelReader = () => {
          void reader?.cancel(abort.signal.reason).catch(() => undefined);
        };
        abort.signal.addEventListener('abort', cancelReader, { once: true });
        try {
          if (reader)
            while (true) {
              abort.signal.throwIfAborted();
              const idle = setTimeout(
                () =>
                  abort.abort(
                    new AttachmentTransferError(
                      'timeout',
                      'Attachment transfer stopped making progress',
                      true,
                    ),
                  ),
                positiveSetting('JIRA_IMPORT_ATTACHMENT_IDLE_TIMEOUT_MS', 60000),
              );
              let part;
              try {
                part = await reader.read();
              } finally {
                clearTimeout(idle);
              }
              abort.signal.throwIfAborted();
              if (part.done) break;
              size += part.value.byteLength;
              if (size > limit)
                throw new AttachmentTransferError(
                  'size_limit',
                  `Attachment exceeded import limit of ${limit} bytes`,
                  false,
                  size,
                );
              hash.update(part.value);
              yield part.value;
            }
          if (expectedSize !== undefined && size !== expectedSize)
            throw new AttachmentTransferError(
              'integrity',
              'Jira attachment size does not match source metadata',
              false,
              size,
            );
          await checkCancelled();
          abort.signal.throwIfAborted();
        } finally {
          abort.signal.removeEventListener('abort', cancelReader);
          await reader?.cancel().catch(() => undefined);
          reader?.releaseLock();
        }
      }
      await storage.putStream(key, chunks(), abort.signal);
      return { size, sha256: hash.digest('hex') };
    } catch (error) {
      if (cancelled) throw cancelled;
      const reason = abort.signal.aborted ? abort.signal.reason : error;
      const retryable =
        reason instanceof AttachmentTransferError ? reason.retryable : reason instanceof TypeError;
      if (!retryable || attempt >= 2) throw reason;
    } finally {
      clearTimeout(total);
      clearTimeout(headers);
      clearInterval(poll);
      await response?.body?.cancel().catch(() => undefined);
    }
    for (let remaining = retryAfter; remaining > 0; remaining -= 1000) {
      await checkCancelled();
      await delay(Math.min(remaining, 1000));
    }
  }
}
