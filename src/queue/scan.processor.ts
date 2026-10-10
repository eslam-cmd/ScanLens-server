// server/src/queue/scan.processor.ts

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import {
  Logger,
  Inject,
  forwardRef,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ScansService } from '../scans/scans.service';

@Processor('scan-queue', {
  concurrency: 3, // ✅ 3 مهام متزامنة (عدّلها حسب مواردك)
})
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
    const { url, userId, isDeepScan } = job.data;

    this.logger.log(`🔄 Processing scan for: ${url}`);
    this.logger.log(
      `📊 Job ID: ${job.id}, Deep Scan: ${isDeepScan}, Attempt: ${job.attemptsMade + 1}`,
    );

    try {
      // ✅ تحديث progress
      await job.updateProgress(10);

      const result = await this.scansService.scanUrl(url, userId, isDeepScan);

      await job.updateProgress(90);

      await job.updateProgress(100);

      this.logger.log(`✅ Scan completed for: ${url}`);
      this.logger.log(`📊 Result:`, {
        id: result?.id,
        score: result?.score,
        vulnerabilities: result?.vulnerabilities?.length || 0,
      });

      return result;
    } catch (error) {
      this.logger.error(`❌ Scan failed for: ${url}`);
      this.logger.error(`❌ Error: ${error.message}`);

      if (
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        this.logger.warn(`🚫 Invalid URL or Bad Request, not retrying: ${url}`);
        throw new UnrecoverableError(error.message);
      }

      if (
        error.message?.includes('ENOTFOUND') ||
        error.message?.includes('getaddrinfo') ||
        error.message?.includes('ECONNREFUSED') ||
        error.message?.includes('ETIMEDOUT')
      ) {
        this.logger.warn(`🌐 Network/DNS error, will retry: ${url}`);
        throw error;
      }

      throw error;
    }
  }
}
