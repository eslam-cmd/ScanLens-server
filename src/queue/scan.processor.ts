// server/src/queue/scan.processor.ts

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  Logger,
  Inject,
  forwardRef,
  BadRequestException,
} from '@nestjs/common';
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
    const { url, userId, isDeepScan } = job.data;

    this.logger.log(`🔄 Processing scan for: ${url}`);
    this.logger.log(
      `📊 Job ID: ${job.id}, Deep Scan: ${isDeepScan}, Attempt: ${job.attemptsMade + 1}`,
    );

    try {
      const result = await this.scansService.scanUrl(url, userId, isDeepScan);

      // ✅ تأكد من أن النتيجة تحتوي على البيانات المطلوبة
      const scanResult = {
        id: result?.id || null,
        score: result?.score ?? 0,
        vulnerabilities: result?.vulnerabilities || [],
        // ✅ إزالة status لأنها غير موجودة في الـ result
        headers: result?.headers || { presentHeaders: [], missingHeaders: [] },
        ssl: result?.ssl || null,
        cors: result?.cors || null,
        cookies: result?.cookies || [],
        comparison: result?.comparison || null,
        plan: result?.plan || 'free',
        isDeepScan: result?.isDeepScan || false,
        url: result?.url || url,
      };

      this.logger.log(`✅ Scan completed for: ${url}`);
      this.logger.log(`📊 Result:`, {
        id: scanResult.id,
        score: scanResult.score,
        vulnerabilities: scanResult.vulnerabilities.length,
      });

      return scanResult;
    } catch (error) {
      this.logger.error(`❌ Scan failed for: ${url}`);
      this.logger.error(`❌ Error: ${error.message}`);

      if (error instanceof BadRequestException) {
        this.logger.warn(`🚫 Invalid URL or Bad Request, not retrying: ${url}`);
        throw error;
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
