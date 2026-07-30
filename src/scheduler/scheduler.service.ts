// server/src/scheduler/scheduler.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionService } from '../subscription/subscription.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private subscriptionService: SubscriptionService) {}

  // ✅ كل يوم الساعة 00:00 - المهام اليومية (التراخيص)
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyLicenseTasks() {
    this.logger.log('🔄 Starting daily license maintenance...');

    try {
      const expiredResult = await this.subscriptionService.autoExpireLicenses();
      const expiredCount = expiredResult?.count || 0;
      this.logger.log(`✅ ${expiredCount} expired licenses deactivated`);

      const expiringLicenses =
        await this.subscriptionService.checkExpiringLicenses();
      const expiringCount = expiringLicenses?.length || 0;
      this.logger.log(
        `📧 ${expiringCount} expiring license notifications sent`,
      );

      await this.cleanupOldLogs();
      this.logger.log('✅ Daily license maintenance completed');
    } catch (error) {
      this.logger.error('❌ Error running daily license maintenance:', error);
    }
  }

  // ✅ كل يوم الساعة 00:00 - المهام اليومية (الاشتراكات)
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailySubscriptionTasks() {
    this.logger.log('🔄 Starting daily subscription tasks...');

    try {
      const renewed = await this.subscriptionService.autoRenewSubscriptions();
      this.logger.log(`✅ ${renewed.renewed.length} subscriptions renewed`);
      if (renewed.failed.length > 0) {
        this.logger.log(`❌ ${renewed.failed.length} renewals failed`);
      }

      const expired = await this.subscriptionService.expireSubscriptions();
      this.logger.log(
        `⚠️ ${expired.length} subscriptions expired and downgraded to Free`,
      );

      this.logger.log('✅ Daily subscription tasks completed');
    } catch (error) {
      this.logger.error('❌ Error running daily subscription tasks:', error);
    }
  }

  // ✅ كل ساعة
  @Cron(CronExpression.EVERY_HOUR)
  async handleHourlyTasks() {
    this.logger.log('🔄 Running hourly tasks...');

    try {
      const expiredResult = await this.subscriptionService.autoExpireLicenses();
      if (expiredResult?.count > 0) {
        this.logger.log(
          `✅ ${expiredResult.count} expired licenses deactivated (hourly check)`,
        );
      }
      this.logger.log('✅ Hourly tasks completed');
    } catch (error) {
      this.logger.error('❌ Error running hourly tasks:', error);
    }
  }

  // ✅ كل 5 دقائق
  @Cron('*/5 * * * *')
  async handleFiveMinutesTasks() {
    this.logger.debug('🔄 Running 5-minute tasks...');
  }

  // ✅ كل يوم أحد
  @Cron(CronExpression.EVERY_WEEK)
  async handleWeeklyTasks() {
    this.logger.log('🔄 Starting weekly tasks...');
    try {
      await this.cleanupVeryOldLogs(90);
      this.logger.log('✅ Weekly tasks completed');
    } catch (error) {
      this.logger.error('❌ Error running weekly tasks:', error);
    }
  }

  // ✅ أول يوم من كل شهر
  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async handleMonthlyTasks() {
    this.logger.log('🔄 Starting monthly tasks...');
    try {
      await this.cleanupVeryOldLogs(180);
      this.logger.log('✅ Monthly tasks completed');
    } catch (error) {
      this.logger.error('❌ Error running monthly tasks:', error);
    }
  }

  private async cleanupOldLogs(days: number = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      this.logger.log(`🧹 Cleaned up logs older than ${days} days`);
    } catch (error) {
      this.logger.error('❌ Error cleaning up old logs:', error);
    }
  }

  private async cleanupVeryOldLogs(days: number = 180) {
    await this.cleanupOldLogs(days);
  }
}
