import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

export function configureHttpSecurity(app: INestApplication): void {
  const express = app.getHttpAdapter().getInstance();
  const trustedProxies = process.env.TRUST_PROXY?.trim();
  express.set('trust proxy', trustedProxies ? trustedProxies.split(',').map((value) => value.trim()) : false);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          baseUri: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
}
