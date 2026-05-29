import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { FileConsoleLogger } from './common/file-console.logger';

/**
 * CORS_ORIGIN env:
 *   - empty / unset → allow all origins (dev convenience)
 *   - "*"           → allow all origins
 *   - comma-separated list ("https://a.com,https://b.com") → whitelist
 */
function parseCorsOrigin(): boolean | string[] {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw || raw === '*') {
    return true;
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new FileConsoleLogger(),
  });
  app.enableCors({
    origin: parseCorsOrigin(),
    credentials: true,
  });
  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
}
void bootstrap();
