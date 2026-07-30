// server/src/scans/scans.module.ts
import { forwardRef, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq'; // ✅ أضف هذا
import { ScansService } from './scans.service';
import { ScansController } from './scans.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { QueueModule } from '../queue/queue.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { ExportService } from './export.service';
import { HeadersEngine } from '../scanner/engines/headers.engine';
import { CookiesEngine } from '../scanner/engines/cookies.engine';
import { HttpsEngine } from '../scanner/engines/https.engine';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    forwardRef(() => QueueModule),
    SubscriptionModule,
    BullModule.registerQueue({
      // ✅ أضف هذا
      name: 'scan-queue',
    }),
  ],
  controllers: [ScansController],
  providers: [
    ScansService,
    ExportService,
    HeadersEngine,
    CookiesEngine,
    HttpsEngine,
  ],
  exports: [ScansService, ExportService],
})
export class ScansModule {}
