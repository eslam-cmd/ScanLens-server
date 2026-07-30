// server/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ScansModule } from './scans/scans.module';
import { QueueModule } from './queue/queue.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { AdminModule } from './admin/admin.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { MailModule } from './mail/mail.module';
import { EnginesModule } from './scanner/Engines.Module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    // ✅ BullModule.forRoot مع REDIS_URL من .env
    BullModule.forRoot({
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
    PrismaModule,
    MailModule,
    EnginesModule,
    QueueModule,
    ScansModule,
    AuthModule,
    SubscriptionModule,
    AdminModule,
    SchedulerModule,
  ],
})
export class AppModule {}