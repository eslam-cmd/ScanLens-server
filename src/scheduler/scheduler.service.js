"use strict";
// server/src/scheduler/scheduler.service.ts
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var SchedulerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchedulerService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const subscription_service_1 = require("../subscription/subscription.service");
let SchedulerService = SchedulerService_1 = class SchedulerService {
    subscriptionService;
    logger = new common_1.Logger(SchedulerService_1.name);
    constructor(subscriptionService) {
        this.subscriptionService = subscriptionService;
    }
    // ✅ كل يوم الساعة 00:00 - المهام اليومية (التراخيص)
    async handleDailyLicenseTasks() {
        this.logger.log('🔄 Starting daily license maintenance...');
        try {
            const expiredResult = await this.subscriptionService.autoExpireLicenses();
            const expiredCount = expiredResult?.count || 0;
            this.logger.log(`✅ ${expiredCount} expired licenses deactivated`);
            const expiringLicenses = await this.subscriptionService.checkExpiringLicenses();
            const expiringCount = expiringLicenses?.length || 0;
            this.logger.log(`📧 ${expiringCount} expiring license notifications sent`);
            await this.cleanupOldLogs();
            this.logger.log('✅ Daily license maintenance completed');
        }
        catch (error) {
            this.logger.error('❌ Error running daily license maintenance:', error);
        }
    }
    // ✅ كل يوم الساعة 00:30 - المهام اليومية (الاشتراكات المنتهية)
    async handleDailySubscriptionTasks() {
        this.logger.log('🔄 Starting daily subscription tasks...');
        try {
            const expired = await this.subscriptionService.processExpiredSubscriptions();
            this.logger.log(`⚠️ ${expired.length} subscriptions expired and downgraded to Free`);
            this.logger.log('✅ Daily subscription tasks completed');
        }
        catch (error) {
            this.logger.error('❌ Error running daily subscription tasks:', error);
        }
    }
    // ✅ كل يوم الساعة 09:00 - إرسال تذكيرات انتهاء الاشتراك
    async handleExpirationReminders() {
        this.logger.log('📧 Sending expiration reminders...');
        try {
            const result = await this.subscriptionService.sendExpirationReminders();
            this.logger.log(`✅ ${result.sent} expiration reminders sent`);
        }
        catch (error) {
            this.logger.error(`❌ Failed to send expiration reminders: ${error.message}`);
        }
    }
    // ✅ كل ساعة
    async handleHourlyTasks() {
        this.logger.debug('🔄 Running hourly tasks...');
        try {
            const expiredResult = await this.subscriptionService.autoExpireLicenses();
            if (expiredResult?.count > 0) {
                this.logger.log(`✅ ${expiredResult.count} expired licenses deactivated (hourly check)`);
            }
        }
        catch (error) {
            this.logger.error('❌ Error running hourly tasks:', error);
        }
    }
    // ✅ كل 5 دقائق
    async handleFiveMinutesTasks() {
        this.logger.debug('🔄 Running 5-minute tasks...');
    }
    // ✅ كل يوم أحد
    async handleWeeklyTasks() {
        this.logger.log('🔄 Starting weekly tasks...');
        try {
            await this.cleanupVeryOldLogs(90);
            this.logger.log('✅ Weekly tasks completed');
        }
        catch (error) {
            this.logger.error('❌ Error running weekly tasks:', error);
        }
    }
    // ✅ أول يوم من كل شهر
    async handleMonthlyTasks() {
        this.logger.log('🔄 Starting monthly tasks...');
        try {
            await this.cleanupVeryOldLogs(180);
            this.logger.log('✅ Monthly tasks completed');
        }
        catch (error) {
            this.logger.error('❌ Error running monthly tasks:', error);
        }
    }
    async cleanupOldLogs(days = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            this.logger.log(`🧹 Cleaned up logs older than ${days} days`);
        }
        catch (error) {
            this.logger.error('❌ Error cleaning up old logs:', error);
        }
    }
    async cleanupVeryOldLogs(days = 180) {
        await this.cleanupOldLogs(days);
    }
};
exports.SchedulerService = SchedulerService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_MIDNIGHT),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SchedulerService.prototype, "handleDailyLicenseTasks", null);
__decorate([
    (0, schedule_1.Cron)('30 0 * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SchedulerService.prototype, "handleDailySubscriptionTasks", null);
__decorate([
    (0, schedule_1.Cron)('0 9 * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SchedulerService.prototype, "handleExpirationReminders", null);
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_HOUR),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SchedulerService.prototype, "handleHourlyTasks", null);
__decorate([
    (0, schedule_1.Cron)('*/5 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SchedulerService.prototype, "handleFiveMinutesTasks", null);
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_WEEK),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SchedulerService.prototype, "handleWeeklyTasks", null);
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SchedulerService.prototype, "handleMonthlyTasks", null);
exports.SchedulerService = SchedulerService = SchedulerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [subscription_service_1.SubscriptionService])
], SchedulerService);
