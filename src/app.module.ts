// server/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { ScansModule } from './scans/scans.module';
import { MailModule } from './mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminModule } from './admin/admin.module';
import { QueueModule } from './queue/queue.module';
import { EnginesModule } from './scanner/Engines.Module';
import { SchedulerModule } from './scheduler/scheduler.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,        // ✅ AuthModule يوفر JwtAuthGuard
    SubscriptionModule,
    ScansModule,
    MailModule,
    AdminModule,
    QueueModule,       // ✅ أضف QueueModule
    EnginesModule,
    SchedulerModule     // ✅ أضف ScannerModule
  ],
  // 
})
export class AppModule {}