// server/src/queue/queue.module.ts

import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScanProcessor } from './scan.processor';
import { QueueService } from './queue.service';
import { ScansModule } from '../scans/scans.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'scan-queue',
      // ✅ إعدادات Redis
      connection: {
        host: 'localhost',
        port: 6379,
        // password: 'your-password', // إذا كان هناك كلمة مرور
      },
      // ✅ إعدادات افتراضية للـ Jobs
      defaultJobOptions: {
        attempts: 3,
        removeOnComplete: false,
        removeOnFail: true,
        backoff: {
          type: 'exponential',
          delay: 3000,
        },
      },
    }),
    forwardRef(() => ScansModule),
  ],
  providers: [ScanProcessor, QueueService],
  exports: [QueueService],
})
export class QueueModule {}
