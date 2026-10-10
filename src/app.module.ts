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

    // ✅ إعداد Redis المركزي (Upstash أو محلي)
    BullModule.forRoot({
      connection: process.env.REDIS_URL
        ? {
            // ✅ Upstash (Remote)
            url: process.env.REDIS_URL,
            // ✅ TLS مطلوب لـ Upstash
            tls: process.env.REDIS_URL.startsWith('rediss://')
              ? {}
              : undefined,
            // ✅ إعدادات مهمة لـ BullMQ
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
          }
        : {
            // ✅ Local development
            host: 'localhost',
            port: 6379,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
          },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 3000,
        },
        removeOnComplete: {
          age: 3600, // احتفظ بالمكتملة ساعة
          count: 100,
        },
        removeOnFail: {
          age: 86400, // احتفظ بالفاشلة 24 ساعة
        },
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