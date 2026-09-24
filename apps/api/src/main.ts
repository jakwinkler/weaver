import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { getAllowedCorsOrigins, validateCorsOrigin } from './core/security/cors.config';
import { assertProductionDataCredentials } from '@weaver/server-common';
import { validateSecurityConfiguration } from './core/security/runtime-config';
import { configureHttpSecurity } from './core/security/http-security';

async function bootstrap() {
  validateSecurityConfiguration();
  assertProductionDataCredentials();
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureHttpSecurity(app);

  const port = process.env.API_PORT || 3000;
  const prefix = process.env.API_PREFIX || 'api/v1';

  app.setGlobalPrefix(prefix);
  app.use(cookieParser());
  getAllowedCorsOrigins();
  app.enableCors({ origin: validateCorsOrigin, credentials: true });

  await app.listen(port);
  console.warn(`Weaver API running on http://localhost:${port}/${prefix}`);
}

bootstrap();
