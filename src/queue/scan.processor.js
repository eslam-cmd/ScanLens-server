"use strict";
// server/src/queue/scan.processor.ts
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
var ScanProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScanProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const scans_service_1 = require("../scans/scans.service");
let ScanProcessor = ScanProcessor_1 = class ScanProcessor extends bullmq_1.WorkerHost {
    scansService;
    logger = new common_1.Logger(ScanProcessor_1.name);
    constructor(scansService) {
        super();
        this.scansService = scansService;
    }
    async process(job) {
        const { url, userId, isDeepScan } = job.data;
        this.logger.log(`🔄 Processing scan for: ${url}`);
        this.logger.log(`📊 Job ID: ${job.id}, Deep Scan: ${isDeepScan}, Attempt: ${job.attemptsMade + 1}`);
        try {
            const result = await this.scansService.scanUrl(url, userId, isDeepScan);
            // ✅ تأكد من أن النتيجة تحتوي على البيانات المطلوبة
            const scanResult = {
                id: result?.id || null,
                score: result?.score ?? 0,
                vulnerabilities: result?.vulnerabilities || [],
                // ✅ إزالة status لأنها غير موجودة في الـ result
                headers: result?.headers || { presentHeaders: [], missingHeaders: [] },
                ssl: result?.ssl || null,
                cors: result?.cors || null,
                cookies: result?.cookies || [],
                comparison: result?.comparison || null,
                plan: result?.plan || 'free',
                isDeepScan: result?.isDeepScan || false,
                url: result?.url || url,
            };
            this.logger.log(`✅ Scan completed for: ${url}`);
            this.logger.log(`📊 Result:`, {
                id: scanResult.id,
                score: scanResult.score,
                vulnerabilities: scanResult.vulnerabilities.length,
            });
            return scanResult;
        }
        catch (error) {
            this.logger.error(`❌ Scan failed for: ${url}`);
            this.logger.error(`❌ Error: ${error.message}`);
            if (error instanceof common_1.BadRequestException) {
                this.logger.warn(`🚫 Invalid URL or Bad Request, not retrying: ${url}`);
                throw error;
            }
            if (error.message?.includes('ENOTFOUND') ||
                error.message?.includes('getaddrinfo') ||
                error.message?.includes('ECONNREFUSED') ||
                error.message?.includes('ETIMEDOUT')) {
                this.logger.warn(`🌐 Network/DNS error, will retry: ${url}`);
                throw error;
            }
            throw error;
        }
    }
};
exports.ScanProcessor = ScanProcessor;
exports.ScanProcessor = ScanProcessor = ScanProcessor_1 = __decorate([
    (0, bullmq_1.Processor)('scan-queue'),
    __param(0, (0, common_1.Inject)((0, common_1.forwardRef)(() => scans_service_1.ScansService))),
    __metadata("design:paramtypes", [scans_service_1.ScansService])
], ScanProcessor);
