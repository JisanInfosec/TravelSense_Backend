import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { isOriginAllowed } from './common/utils/cors.js';

interface CreateAppOptions {
  enableShutdownHooks?: boolean;
}

export async function createApp(options: CreateAppOptions = {}) {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (request.method === 'GET' && request.path === '/') {
      response.json({
        name: 'TravelSense API',
        status: 'ok',
        health: '/api/health',
      });
      return;
    }
    next();
  });
  app.setGlobalPrefix('api');
  const configuredOrigins =
    process.env.CORS_ORIGINS ?? 'http://localhost:3000';
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      callback(
        null,
        !origin || isOriginAllowed(origin, configuredOrigins),
      );
    },
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  if (options.enableShutdownHooks) app.enableShutdownHooks();

  return app;
}
