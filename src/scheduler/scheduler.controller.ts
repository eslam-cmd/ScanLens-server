// server/src/scheduler/scheduler.controller.ts
import {
  Controller,
  Get,
  Post,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

@Controller('scheduler')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SchedulerController {
  constructor(
    private schedulerService: SchedulerService,
    private subscriptionService: SubscriptionService,
  ) {}

  @Post('run-daily')
  @HttpCode(HttpStatus.OK)
  async runDailyTasks() {
    // ✅ استخدام الدوال الجديدة
    await this.schedulerService.handleDailyLicenseTasks();
    await this.schedulerService.handleDailySubscriptionTasks();
    return {
      success: true,
      message: 'Daily tasks executed successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('run-hourly')
  @HttpCode(HttpStatus.OK)
  async runHourlyTasks() {
    await this.schedulerService.handleHourlyTasks();
    return {
      success: true,
      message: 'Hourly tasks executed successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('run-weekly')
  @HttpCode(HttpStatus.OK)
  async runWeeklyTasks() {
    await this.schedulerService.handleWeeklyTasks();
    return {
      success: true,
      message: 'Weekly tasks executed successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('run-monthly')
  @HttpCode(HttpStatus.OK)
  async runMonthlyTasks() {
    await this.schedulerService.handleMonthlyTasks();
    return {
      success: true,
      message: 'Monthly tasks executed successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('run-five-minutes')
  @HttpCode(HttpStatus.OK)
  async runFiveMinutesTasks() {
    await this.schedulerService.handleFiveMinutesTasks();
    return {
      success: true,
      message: '5-minute tasks executed successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('check-expiring')
  async checkExpiringLicenses() {
    const expiring = await this.subscriptionService.checkExpiringLicenses();
    return {
      success: true,
      count: expiring.length,
      expiring,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('auto-expire')
  @HttpCode(HttpStatus.OK)
  async autoExpireLicenses() {
    const result = await this.subscriptionService.autoExpireLicenses();
    return {
      success: true,
      count: result.count || 0,
      message: `${result.count || 0} expired licenses deactivated`,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('status')
  async getStatus() {
    return {
      status: 'running',
      timestamp: new Date().toISOString(),
      tasks: {
        daily: 'Every day at midnight (00:00)',
        hourly: 'Every hour',
        fiveMinutes: 'Every 5 minutes',
        weekly: 'Every Sunday at midnight (00:00)',
        monthly: 'First day of every month at midnight (00:00)',
      },
    };
  }
}