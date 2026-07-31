// server/src/scheduler/scheduler.controller.ts

import { Controller, Get, UseGuards } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

@Controller('scheduler')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SchedulerController {
  constructor(private schedulerService: SchedulerService) {}

  @Get('run-daily-license')
  async runDailyLicense() {
    await this.schedulerService.handleDailyLicenseTasks();
    return { message: 'Daily license tasks completed' };
  }

  @Get('run-daily-subscription')
  async runDailySubscription() {
    await this.schedulerService.handleDailySubscriptionTasks();
    return { message: 'Daily subscription tasks completed' };
  }

  @Get('run-hourly')
  async runHourly() {
    await this.schedulerService.handleHourlyTasks();
    return { message: 'Hourly tasks completed' };
  }

  @Get('run-weekly')
  async runWeekly() {
    await this.schedulerService.handleWeeklyTasks();
    return { message: 'Weekly tasks completed' };
  }

  @Get('run-monthly')
  async runMonthly() {
    await this.schedulerService.handleMonthlyTasks();
    return { message: 'Monthly tasks completed' };
  }
}
