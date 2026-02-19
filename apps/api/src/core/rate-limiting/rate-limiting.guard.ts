import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const RATE_LIMIT_KEY = 'rateLimit';

export const RateLimit = (limit: number, windowMs = 60_000) =>
  SetMetadata(RATE_LIMIT_KEY, { limit, windowMs });

interface RateLimitEntry {
  timestamps: number[];
}

@Injectable()
export class RateLimitingGuard implements CanActivate {
  private readonly store = new Map<string, RateLimitEntry>();
  private readonly DEFAULT_AUTHENTICATED_LIMIT = 1000;
  private readonly DEFAULT_UNAUTHENTICATED_LIMIT = 30;
  private readonly DEFAULT_WINDOW_MS = 60_000;

  constructor(private readonly reflector: Reflector) {
    // Clean up stale entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60_000);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const meta = this.reflector.getAllAndOverride<{ limit: number; windowMs: number } | undefined>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    const isAuthenticated = !!request.user;
    const limit = meta?.limit ?? (isAuthenticated ? this.DEFAULT_AUTHENTICATED_LIMIT : this.DEFAULT_UNAUTHENTICATED_LIMIT);
    const windowMs = meta?.windowMs ?? this.DEFAULT_WINDOW_MS;

    const key = this.getKey(request, isAuthenticated);
    const now = Date.now();

    let entry = this.store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.store.set(key, entry);
    }

    // Sliding window: remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);

    if (entry.timestamps.length >= limit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Rate limit exceeded',
          retryAfter: Math.ceil(windowMs / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    entry.timestamps.push(now);
    return true;
  }

  private getKey(request: any, isAuthenticated: boolean): string {
    if (isAuthenticated && request.user?.userId) {
      return `user:${request.user.userId}`;
    }
    const ip = request.ip || request.connection?.remoteAddress || 'unknown';
    return `ip:${ip}`;
  }

  private cleanup() {
    const now = Date.now();
    const maxWindow = 5 * 60_000;

    for (const [key, entry] of this.store.entries()) {
      entry.timestamps = entry.timestamps.filter((ts) => now - ts < maxWindow);
      if (entry.timestamps.length === 0) {
        this.store.delete(key);
      }
    }
  }
}
