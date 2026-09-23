import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { RateLimitingGuard } from './rate-limiting.guard';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [
    RateLimitingGuard,
    { provide: APP_GUARD, useExisting: RateLimitingGuard },
  ],
  exports: [RateLimitingGuard],
})
export class RateLimitingModule {}
