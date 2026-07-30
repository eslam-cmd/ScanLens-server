// server/src/queue/scan.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { ScansService } from '../scans/scans.service';

@Processor('scan-queue')
export class ScanProcessor extends WorkerHost {
  private readonly logger = new Logger(ScanProcessor.name);

  constructor(
    @Inject(forwardRef(() => ScansService))
    private scansService: ScansService,
  ) {
    super();
  }

  async process(
    job: Job<{
      url: string;
      userId?: string;
      isDeepScan: boolean;
    }>,
  ): Promise<any> {
    this.logger.log(`Processing scan for: ${job.data.url}`);

    try {
      const result = await this.scansService.scanUrl(
        job.data.url,
        job.data.userId,
        job.data.isDeepScan,
      );

      // ✅ تأكد من أن النتيجة تحتوي على بيانات
      this.logger.log(`Scan completed for: ${job.data.url}`);
      this.logger.log(`📊 Result summary:`, {
        id: result?.id || 'no-id',
        score: result?.score ?? 0,
        vulnerabilities: result?.vulnerabilities?.length || 0,
        hasHeaders: !!result?.headers,
        hasSSL: !!result?.ssl,
      });

      // ✅ إرجاع النتيجة كاملة
      return result;
    } catch (error) {
      this.logger.error(`Scan failed for: ${job.data.url}`, error);
      throw error;
    }
  }
}
