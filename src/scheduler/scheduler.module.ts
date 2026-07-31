// server/src/scheduler/scheduler.module.ts

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [ScheduleModule.forRoot(), SubscriptionModule],
  providers: [SchedulerService],
  // ✅ إذا لم يكن لديك SchedulerController، قم بإزالته
  // controllers: [SchedulerController],
  exports: [SchedulerService],
})
export class SchedulerModule {}
