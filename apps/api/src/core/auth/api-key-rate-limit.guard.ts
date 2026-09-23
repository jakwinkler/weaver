import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const REQUEST_LIMIT = 100;
const WINDOW_MS = 60_000;

@Injectable()
export class ApiKeyRateLimitGuard implements CanActivate, OnModuleDestroy {
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    this.redis = new Redis({
      host: config.get('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6380),
      password: config.get<string>('REDIS_PASSWORD'),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKeyId = request.user?.apiKeyId;

    if (!apiKeyId) {
      return true;
    }

    const redisKey = `weaver:api-key-rate:${apiKeyId}`;
    const count = Number(
      await this.redis.eval(
        `local current = redis.call('INCR', KEYS[1])
         if current == 1 then
           redis.call('PEXPIRE', KEYS[1], ARGV[1])
         end
         return current`,
        1,
        redisKey,
        WINDOW_MS,
      ),
    );

    if (count > REQUEST_LIMIT) {
      throw new HttpException('API key rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}
