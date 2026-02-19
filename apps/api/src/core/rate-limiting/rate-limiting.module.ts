import { Module, Global } from '@nestjs/common';
import { RateLimitingGuard } from './rate-limiting.guard';

@Global()
@Module({
  providers: [RateLimitingGuard],
  exports: [RateLimitingGuard],
})
export class RateLimitingModule {}
