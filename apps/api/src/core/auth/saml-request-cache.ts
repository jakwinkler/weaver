import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CacheProvider } from '@node-saml/passport-saml';
import { createHash } from 'crypto';
import Redis from 'ioredis';

export const SAML_REQUEST_TTL_MS = 10 * 60_000;

@Injectable()
export class SamlRequestCache implements OnModuleInit, OnModuleDestroy {
  private readonly redis: Redis;
  private readonly prefix: string;
  private readonly logger = new Logger(SamlRequestCache.name);

  constructor(config: ConfigService) {
    this.prefix = `${config.get('RATE_LIMIT_PREFIX', 'weaver')}:saml-request`;
    this.redis = new Redis({
      host: config.get('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6380),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    this.redis.on('error', () => this.logger.warn('SAML request storage is unavailable'));
  }

  async onModuleInit() {
    try {
      await this.redis.connect();
    } catch {
      this.logger.warn('SAML sign-in is unavailable until request storage recovers');
    }
  }

  async onModuleDestroy() {
    if (this.redis.status === 'ready') await this.redis.quit();
    else this.redis.disconnect();
  }

  // MultiSamlStrategy creates one provider per HTTP request. Node-SAML 5 reads
  // the same request ID twice during validation. Consume it once in Redis, then
  // reuse that result only inside this validation request, never across callbacks.
  forTenant(tenantId: string): CacheProvider {
    const claimed = new Map<string, Promise<string | null>>();
    const key = (id: string) =>
      `${this.prefix}:${tenantId}:${createHash('sha256').update(id).digest('hex')}`;
    const ready = () => {
      if (this.redis.status !== 'ready')
        throw new ServiceUnavailableException('SAML request storage is unavailable');
    };
    return {
      saveAsync: async (id, value) => {
        ready();
        const saved = await this.redis.set(key(id), value, 'PX', SAML_REQUEST_TTL_MS, 'NX');
        if (!saved) throw new Error('SAML request ID already exists');
        return { value, createdAt: Date.now() };
      },
      getAsync: (id) => {
        ready();
        if (!claimed.has(id)) claimed.set(id, this.redis.getdel(key(id)));
        return claimed.get(id)!;
      },
      removeAsync: async (id) => {
        if (!id) return null;
        ready();
        const value = claimed.has(id) ? await claimed.get(id)! : await this.redis.getdel(key(id));
        claimed.delete(id);
        return value;
      },
    };
  }
}
