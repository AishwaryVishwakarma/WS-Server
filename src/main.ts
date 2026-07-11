import {Logger} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {AppModule} from './app.module';
import {setupApp} from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap', {timestamp: true});

  try {
    await setupApp(app);
  } catch (error) {
    logger.error(`App setup failed: ${error}`);
    process.exit(1); // Exit the process if setup (e.g. Redis connection) fails
  }

  await app.listen(process.env.PORT || 8000, () => {
    logger.log(
      `Application is running on: http://localhost:${process.env.PORT || 8000}`
    );
  });
}

void bootstrap();
