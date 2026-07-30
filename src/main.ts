// server/src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { ValidationPipe, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as helmet from 'helmet';
import * as compression from 'compression';
import * as rateLimit from 'express-rate-limit';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);

  // ============================================================
  // 🛡️ 1. cookie-parser
  // ============================================================
  const parser =
    typeof cookieParser === 'function'
      ? cookieParser
      : (cookieParser as any).default;
  app.use(parser());

  // ============================================================
  // 🛡️ 2. Helmet
  // ============================================================
  app.use(
    helmet.default({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://fonts.googleapis.com',
          ],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'https:'],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // ============================================================
  // 📦 3. Compression
  // ============================================================
  app.use(compression.default());

  // ============================================================
  // 🚦 4. Rate Limiting
  // ============================================================
  // server/src/main.ts

  // ✅ أصلح الـ Rate Limit
  const limiter = rateLimit.default({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
      statusCode: 429,
      message: 'Too many requests, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    // ✅ استخدم keyGenerator بسيط
    keyGenerator: (req) => {
      return req.ip || req.connection?.remoteAddress || 'unknown';
    },
  });

  const authLimiter = rateLimit.default({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: {
      statusCode: 429,
      message: 'Too many authentication attempts, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    // ✅ استخدم keyGenerator بسيط
    keyGenerator: (req) => {
      return req.ip || req.connection?.remoteAddress || 'unknown';
    },
  });
  app.use('/auth/login', authLimiter);
  app.use('/auth/register', authLimiter);
  app.use('/auth/verify-otp', authLimiter);

  // ============================================================
  // ✅ 6. Validation
  // ============================================================
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (errors) => {
        const messages = errors.map((error) => ({
          property: error.property,
          constraints: error.constraints,
        }));
        return new BadRequestException({
          statusCode: 400,
          message: 'Validation failed',
          errors: messages,
        });
      },
    }),
  );

  // ============================================================
  // 🌐 7. CORS
  // ============================================================
  const clientUrl =
    configService.get<string>('CLIENT_URL') || 'http://localhost:3000';
  const allowedOrigins = [
    clientUrl,
    'http://localhost:3000',
    'http://localhost:3001',
    'https://scanlens.app',
    'https://www.scanlens.app',
  ];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (
        allowedOrigins.includes(origin) ||
        process.env.NODE_ENV === 'development'
      ) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Requested-With',
    ],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 86400,
  });

  // ============================================================
  // 🚀 8. تشغيل السيرفر
  // ============================================================
  const port = configService.get<number>('PORT') || 4000;
  const host = configService.get<string>('HOST') || 'localhost';

  await app.listen(port, host);

  logger.log(`🚀 Server running on: http://${host}:${port}`);
  logger.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);

  // ============================================================
  // 🛑 9. معالجة الإغلاق الآمن
  // ============================================================
  const shutdown = async (signal: string) => {
    logger.log(`🛑 Received ${signal}, shutting down gracefully...`);
    await app.close();
    logger.log('✅ Server closed successfully');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  });

  process.on('uncaughtException', (error) => {
    logger.error('❌ Uncaught Exception:', error);
    process.exit(1);
  });
}

bootstrap();
