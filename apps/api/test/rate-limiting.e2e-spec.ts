import { Controller, Get, INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RateLimit, RateLimitingModule } from '../src/core/rate-limiting';

@Controller('rate-limit-probe')
class RateLimitProbeController {
  @Get()
  @RateLimit(2)
  get(): { ok: true } {
    return { ok: true };
  }
}

describe('Runtime rate limiting (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('limits repeated unauthenticated login attempts by client address', async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'missing-user@example.com', password: 'wrong-password' })
        .expect(401);
    }

    const limited = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Authorization', 'Bearer attacker-controlled-bucket')
      .send({ email: 'missing-user@example.com', password: 'wrong-password' })
      .expect(429);

    expect(limited.body.message).toBe('Rate limit exceeded');
    expect(limited.body.retryAfter).toBeGreaterThan(0);
    expect(limited.body.retryAfter).toBeLessThanOrEqual(60);
  });

  it('shares rate-limit counters across API instances', async () => {
    const secondModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const secondApp = secondModule.createNestApplication();
    secondApp.setGlobalPrefix('api/v1');
    await secondApp.init();

    await request(secondApp.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'missing-user@example.com', password: 'wrong-password' })
      .expect(429);

    await secondApp.close();
  });

  it('does not let rotating invalid bearer tokens create authenticated buckets', async () => {
    const probeModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), RateLimitingModule],
      controllers: [RateLimitProbeController],
    }).compile();
    const probeApp = probeModule.createNestApplication();
    await probeApp.init();

    for (const token of ['invalid-token-a', 'invalid-token-b']) {
      await request(probeApp.getHttpServer())
        .get('/rate-limit-probe')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    }
    await request(probeApp.getHttpServer())
      .get('/rate-limit-probe')
      .set('Authorization', 'Bearer invalid-token-c')
      .expect(429);

    await probeApp.close();
  });
});
