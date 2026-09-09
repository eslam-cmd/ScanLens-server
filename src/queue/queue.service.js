"use strict";
// server/src/queue/queue.service.ts
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueService = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
let QueueService = class QueueService {
    scanQueue;
    constructor(scanQueue) {
        this.scanQueue = scanQueue;
    }
    async addScanJob(data) {
        const job = await this.scanQueue.add('scan', data, {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 3000,
            },
            // ✅ إما استخدام boolean
            removeOnComplete: false, // ✅ لا تحذف بعد الإكمال
            removeOnFail: true, // ✅ احذف الفاشلة فقط
        });
        console.log('✅ Job added:', {
            id: job.id,
            url: job.data.url,
            isDeepScan: job.data.isDeepScan,
            maxAttempts: job.opts?.attempts || 3,
        });
        return job;
    }
    async getJobStatus(jobId) {
        try {
            const job = await this.scanQueue.getJob(jobId);
            if (!job) {
                const state = await this.scanQueue.getJobState(jobId);
                console.log(`📊 Job ${jobId} state from getJobState:`, state);
                if (state === 'completed') {
                    return {
                        id: jobId,
                        status: 'completed',
                        result: null,
                        message: 'Job completed but removed',
                    };
                }
                if (state === 'failed') {
                    return {
                        id: jobId,
                        status: 'failed',
                        result: null,
                        message: 'Job failed',
                    };
                }
                console.log(`❌ Job ${jobId} not found`);
                return null;
            }
            const state = await job.getState();
            const result = job.returnvalue;
            console.log(`📊 Job ${jobId} status:`, {
                state,
                hasResult: !!result,
                resultSummary: result
                    ? {
                        id: result.id,
                        score: result.score,
                        vulnCount: result.vulnerabilities?.length || 0,
                    }
                    : null,
            });
            return {
                id: job.id,
                status: state,
                result: result || null,
                attempts: job.attemptsMade,
                maxAttempts: job.opts?.attempts || 3,
                failedReason: job.failedReason || null,
                timestamp: job.timestamp,
            };
        }
        catch (error) {
            console.error(`❌ Error getting job status for ${jobId}:`, error.message);
            return null;
        }
    }
};
exports.QueueService = QueueService;
exports.QueueService = QueueService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, bullmq_1.InjectQueue)('scan-queue')),
    __metadata("design:paramtypes", [bullmq_2.Queue])
], QueueService);
