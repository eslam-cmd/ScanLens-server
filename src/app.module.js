"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
// server/src/app.module.ts
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const schedule_1 = require("@nestjs/schedule");
const bullmq_1 = require("@nestjs/bullmq");
const prisma_module_1 = require("../prisma/prisma.module");
const auth_module_1 = require("./auth/auth.module");
const scans_module_1 = require("./scans/scans.module");
const queue_module_1 = require("./queue/queue.module");
const subscription_module_1 = require("./subscription/subscription.module");
const admin_module_1 = require("./admin/admin.module");
const scheduler_module_1 = require("./scheduler/scheduler.module");
const mail_module_1 = require("./mail/mail.module");
const Engines_Module_1 = require("./scanner/Engines.Module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
            }),
            schedule_1.ScheduleModule.forRoot(),
            bullmq_1.BullModule.forRoot({
                connection: {
                    url: process.env.REDIS_URL || 'redis://localhost:6379',
                },
                // ✅ خيارات إضافية للاتصال
                defaultJobOptions: {
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 1000,
                    },
                    removeOnComplete: true,
                    removeOnFail: false,
                },
            }),
            prisma_module_1.PrismaModule,
            mail_module_1.MailModule,
            Engines_Module_1.EnginesModule,
            queue_module_1.QueueModule,
            scans_module_1.ScansModule,
            auth_module_1.AuthModule,
            subscription_module_1.SubscriptionModule,
            admin_module_1.AdminModule,
            scheduler_module_1.SchedulerModule,
        ],
    })
], AppModule);
