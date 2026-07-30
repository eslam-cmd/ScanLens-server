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
    }),
    forwardRef(() => ScansModule),
  ],
  providers: [ScanProcessor, QueueService],
  exports: [QueueService],
})
export class QueueModule {}
