"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// server/src/main.ts
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const helmet = __importStar(require("helmet"));
const compression = __importStar(require("compression"));
const rateLimit = __importStar(require("express-rate-limit"));
async function bootstrap() {
    const logger = new common_1.Logger('Bootstrap');
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });
    const configService = app.get(config_1.ConfigService);
    // ============================================================
    // 🛡️ 1. cookie-parser
    // ============================================================
    const parser = typeof cookie_parser_1.default === 'function'
        ? cookie_parser_1.default
        : cookie_parser_1.default.default;
    app.use(parser());
    // ============================================================
    // 🛡️ 2. Helmet
    // ============================================================
    app.use(helmet.default({
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
    }));
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
    app.useGlobalPipes(new common_1.ValidationPipe({
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
            return new common_1.BadRequestException({
                statusCode: 400,
                message: 'Validation failed',
                errors: messages,
            });
        },
    }));
    // ============================================================
    // 🌐 7. CORS
    // ============================================================
    const clientUrl = configService.get('CLIENT_URL') || 'http://localhost:3000';
    const allowedOrigins = [
        clientUrl,
        'http://localhost:3000',
        'https://scan-lens-client.vercel.app',
    ];
    app.enableCors({
        origin: (origin, callback) => {
            if (!origin)
                return callback(null, true);
            if (allowedOrigins.includes(origin) ||
                process.env.NODE_ENV === 'development') {
                callback(null, true);
            }
            else {
                callback(new Error('Not allowed by CORS'), false);
            }
        },
        credentials: true,
        methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
        exposedHeaders: ['Content-Range', 'X-Content-Range'],
        allowedHeaders: [
            'Content-Type',
            'Accept',
            'Authorization',
            'X-Requested-With',
        ],
        maxAge: 86400,
    });
    // ============================================================
    // 🚀 8. تشغيل السيرفر
    // ============================================================
    const port = configService.get('PORT') || 4000;
    const host = configService.get('HOST') || 'localhost';
    await app.listen(port, host);
    logger.log(`🚀 Server running on: http://${host}:${port}`);
    logger.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    // ============================================================
    // 🛑 9. معالجة الإغلاق الآمن
    // ============================================================
    const shutdown = async (signal) => {
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
