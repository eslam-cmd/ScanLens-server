"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
// server/src/auth/auth.module.ts
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const passport_1 = require("@nestjs/passport");
const config_1 = require("@nestjs/config");
const auth_service_1 = require("./auth.service");
const auth_controller_1 = require("./auth.controller");
const jwt_strategy_1 = require("./strategies/jwt.strategy");
const prisma_module_1 = require("../../prisma/prisma.module");
const mail_module_1 = require("../mail/mail.module");
const jwt_auth_guard_1 = require("./guards/jwt-auth.guard");
const admin_guard_1 = require("./guards/admin.guard");
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            passport_1.PassportModule,
            mail_module_1.MailModule,
            jwt_1.JwtModule.registerAsync({
                imports: [config_1.ConfigModule],
                useFactory: async (configService) => ({
                    secret: configService.get('JWT_SECRET') || 'super-secret',
                    signOptions: { expiresIn: '7d' },
                }),
                inject: [config_1.ConfigService],
            }),
        ],
        controllers: [auth_controller_1.AuthController],
        providers: [
            auth_service_1.AuthService,
            jwt_strategy_1.JwtStrategy,
            prisma_module_1.PrismaModule,
            jwt_auth_guard_1.JwtAuthGuard, // ✅ أضف JwtAuthGuard في providers
            admin_guard_1.AdminGuard, // ✅ أضف AdminGuard في providers
        ],
        exports: [
            auth_service_1.AuthService,
            jwt_1.JwtModule,
            jwt_auth_guard_1.JwtAuthGuard, // ✅ تصدير JwtAuthGuard
            admin_guard_1.AdminGuard, // ✅ تصدير AdminGuard
        ],
    })
], AuthModule);
