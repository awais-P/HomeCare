import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

// Reads apps/api/.env when present (Node 22+). On a host, set the same variables in its dashboard.
try {
  process.loadEnvFile();
} catch {
  // no .env file: use the environment as is
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
