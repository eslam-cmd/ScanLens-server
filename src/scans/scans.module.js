"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScansModule = void 0;
// server/src/scans/scans.module.ts
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq"); // ✅ أضف هذا
const scans_service_1 = require("./scans.service");
const scans_controller_1 = require("./scans.controller");
const prisma_module_1 = require("../../prisma/prisma.module");
const auth_module_1 = require("../auth/auth.module");
const queue_module_1 = require("../queue/queue.module");
const subscription_module_1 = require("../subscription/subscription.module");
const export_service_1 = require("./export.service");
const headers_engine_1 = require("../scanner/engines/headers.engine");
const cookies_engine_1 = require("../scanner/engines/cookies.engine");
const https_engine_1 = require("../scanner/engines/https.engine");
let ScansModule = class ScansModule {
};
exports.ScansModule = ScansModule;
exports.ScansModule = ScansModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            (0, common_1.forwardRef)(() => queue_module_1.QueueModule),
            subscription_module_1.SubscriptionModule,
            bullmq_1.BullModule.registerQueue({
                // ✅ أضف هذا
                name: 'scan-queue',
            }),
        ],
        controllers: [scans_controller_1.ScansController],
        providers: [
            scans_service_1.ScansService,
            export_service_1.ExportService,
            headers_engine_1.HeadersEngine,
            cookies_engine_1.CookiesEngine,
            https_engine_1.HttpsEngine,
        ],
        exports: [scans_service_1.ScansService, export_service_1.ExportService],
    })
], ScansModule);
