"use strict";
// server/src/queue/queue.module.ts
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const scan_processor_1 = require("./scan.processor");
const queue_service_1 = require("./queue.service");
const scans_module_1 = require("../scans/scans.module");
let QueueModule = class QueueModule {
};
exports.QueueModule = QueueModule;
exports.QueueModule = QueueModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bullmq_1.BullModule.registerQueue({
                name: 'scan-queue',
                // ✅ إعدادات Redis
                connection: {
                    host: 'localhost',
                    port: 6379,
                    // password: 'your-password', // إذا كان هناك كلمة مرور
                },
                // ✅ إعدادات افتراضية للـ Jobs
                defaultJobOptions: {
                    attempts: 3,
                    removeOnComplete: false,
                    removeOnFail: true,
                    backoff: {
                        type: 'exponential',
                        delay: 3000,
                    },
                },
            }),
            (0, common_1.forwardRef)(() => scans_module_1.ScansModule),
        ],
        providers: [scan_processor_1.ScanProcessor, queue_service_1.QueueService],
        exports: [queue_service_1.QueueService],
    })
], QueueModule);
