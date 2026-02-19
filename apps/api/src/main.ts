import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const port = process.env.API_PORT || 3000;
  const prefix = process.env.API_PREFIX || 'api/v1';

  app.setGlobalPrefix(prefix);
  app.enableCors();

  await app.listen(port);
  console.warn(`Weaver API running on http://localhost:${port}/${prefix}`);
}

bootstrap();
