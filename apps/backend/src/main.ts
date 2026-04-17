import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { FileConsoleLogger } from './common/file-console.logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new FileConsoleLogger(),
  });
  app.enableCors();
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
