// server/src/queue/queue.module.ts

import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScanProcessor } from './scan.processor';
import { QueueService } from './queue.service';
import { ScansModule } from '../scans/scans.module';

@Module({
  imports: [
    // ✅ فقط سجّل الطابور — الاتصال موجود في app.module.ts
    BullModule.registerQueue({
      name: 'scan-queue',
      // ✅ لا تحتاج connection هنا — موروث من forRoot()
    }),
    forwardRef(() => ScansModule),
  ],
  providers: [ScanProcessor, QueueService],
  exports: [QueueService],
})
export class QueueModule {}