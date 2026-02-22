import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const port = process.env.API_PORT || 3000;
  const prefix = process.env.API_PREFIX || 'api/v1';

  app.setGlobalPrefix(prefix);
  app.use(cookieParser());
  app.enableCors({ origin: true, credentials: true });

  await app.listen(port);
  console.warn(`Weaver API running on http://localhost:${port}/${prefix}`);
}

bootstrap();
