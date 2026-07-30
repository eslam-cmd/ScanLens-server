// server/src/queue/queue.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScanProcessor } from './scan.processor';
import { QueueService } from './queue.service';
import { ScansModule } from '../scans/scans.module';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      },
    }),
    BullModule.registerQueue({
      name: 'scan-queue',
    }),
    forwardRef(() => ScansModule),
  ],
  providers: [ScanProcessor, QueueService],
  exports: [BullModule, QueueService],
})
export class QueueModule {}