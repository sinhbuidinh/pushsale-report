import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { FileConsoleLogger } from './common/file-console.logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new FileConsoleLogger(),
  });
  app.enableCors();
  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
}
void bootstrap();
