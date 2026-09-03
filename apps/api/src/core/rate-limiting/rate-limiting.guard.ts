import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  SetMetadata,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';

export const RATE_LIMIT_KEY = 'rateLimit';

export const RateLimit = (limit: number, windowMs = 60_000) =>
  SetMetadata(RATE_LIMIT_KEY, { limit, windowMs });

const INCREMENT_WINDOW = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { count, ttl }
`;

@Injectable()
export class RateLimitingGuard implements CanActivate, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RateLimitingGuard.name);
  private readonly redis: Redis;
  private readonly touchedKeys = new Set<string>();
  private readonly DEFAULT_AUTHENTICATED_LIMIT = 1000;
  private readonly DEFAULT_UNAUTHENTICATED_LIMIT = 30;
  private readonly DEFAULT_WINDOW_MS = 60_000;
  private readonly keyPrefix: string;
  private lastStoreWarningAt = 0;

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.keyPrefix = config.get<string>('RATE_LIMIT_PREFIX', 'weaver:rate-limit');
    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6379),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    this.redis.on('error', (error) => {
      this.logger.warn(`Redis rate-limit store error: ${error.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.redis.connect();
    } catch (error) {
      this.logger.error(
        `Unable to connect to the Redis rate-limit store: ${(error as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (
      this.config.get<string>('RATE_LIMIT_RESET_ON_SHUTDOWN') === 'true' &&
      this.redis.status === 'ready' &&
      this.touchedKeys.size > 0
    ) {
      await this.redis.del(...this.touchedKeys);
    }
    if (this.redis.status === 'ready') {
      await this.redis.quit();
    } else {
      this.redis.disconnect();
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    if (this.isHealthEndpoint(request)) {
      return true;
    }
    const meta = this.reflector.getAllAndOverride<
      { limit: number; windowMs: number } | undefined
    >(RATE_LIMIT_KEY, [context.getHandler(), context.getClass()]);

    const credential = this.isAuthenticationEndpoint(request)
      ? undefined
      : this.getCredential(request);
    const verifiedUserId = request.user?.userId
      ?? await this.verifyAccessCredential(credential);
    const isAuthenticated = !!verifiedUserId;
    const limit = meta?.limit ?? (
      isAuthenticated
        ? this.DEFAULT_AUTHENTICATED_LIMIT
        : this.DEFAULT_UNAUTHENTICATED_LIMIT
    );
    const windowMs = meta?.windowMs ?? this.DEFAULT_WINDOW_MS;
    const key = `${this.keyPrefix}:${limit}:${windowMs}:${this.getIdentityKey(request, verifiedUserId)}`;

    if (this.redis.status !== 'ready') {
      this.warnStoreUnavailable('Redis is not ready');
      return true;
    }

    this.touchedKeys.add(key);
    let count: number;
    let ttl: number;
    try {
      const result = await this.redis.eval(
        INCREMENT_WINDOW,
        1,
        key,
        String(windowMs),
      ) as [number, number];
      [count, ttl] = result.map(Number) as [number, number];
    } catch (error) {
      this.warnStoreUnavailable(
        error instanceof Error ? error.message : 'Redis command failed',
      );
      return true;
    }

    if (count > limit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Rate limit exceeded',
          retryAfter: Math.max(1, Math.ceil(ttl / 1000)),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private getIdentityKey(request: any, verifiedUserId?: string): string {
    if (verifiedUserId) {
      return `user:${verifiedUserId}`;
    }
    const ip = request.ip || request.connection?.remoteAddress || 'unknown';
    return `ip:${ip}`;
  }

  private async verifyAccessCredential(credential?: string): Promise<string | undefined> {
    if (!credential) {
      return undefined;
    }

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub?: unknown;
        tokenType?: unknown;
      }>(credential);
      return payload.tokenType === 'access' && typeof payload.sub === 'string'
        ? payload.sub
        : undefined;
    } catch {
      return undefined;
    }
  }

  private getCredential(request: any): string | undefined {
    const authorization = request.headers?.authorization;
    if (typeof authorization === 'string') {
      const bearer = authorization.match(/^Bearer\s+(.+)$/i);
      if (bearer) {
        return bearer[1];
      }
    }
    return request.cookies?.weaver_token;
  }

  private isAuthenticationEndpoint(request: any): boolean {
    const path = String(request.originalUrl || request.url || '')
      .split('?')[0]
      .replace(/\/+$/, '');
    return ['/auth/login', '/auth/register', '/auth/refresh'].some((suffix) =>
      path.endsWith(suffix),
    );
  }

  private isHealthEndpoint(request: any): boolean {
    const path = String(request.originalUrl || request.url || '')
      .split('?')[0]
      .replace(/\/+$/, '');
    return path.endsWith('/health') || path === 'health';
  }

  private warnStoreUnavailable(reason: string): void {
    const now = Date.now();
    if (now - this.lastStoreWarningAt < 30_000) {
      return;
    }
    this.lastStoreWarningAt = now;
    this.logger.warn(`Rate limiting temporarily bypassed: ${reason}`);
  }
}
