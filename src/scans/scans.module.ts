// server/src/scans/scans.module.ts
import { forwardRef, Module } from '@nestjs/common';
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
    PrismaModule, // ✅ index 0
    AuthModule, // ✅ index 1
    QueueModule, // ✅ index 2 - تأكد من وجود هذا الموديول
    forwardRef(() => QueueModule),
    SubscriptionModule, // ✅ index 3
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
