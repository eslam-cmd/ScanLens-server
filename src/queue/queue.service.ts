// server/src/queue/queue.service.ts

import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class QueueService {
  constructor(@InjectQueue('scan-queue') private scanQueue: Queue) {}

  async addScanJob(data: {
    url: string;
    userId?: string;
    isDeepScan: boolean;
  }) {
    const job = await this.scanQueue.add('scan', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 3000,
      },
      // ✅ إما استخدام boolean
      removeOnComplete: false, // ✅ لا تحذف بعد الإكمال
      removeOnFail: true, // ✅ احذف الفاشلة فقط
    });

    console.log('✅ Job added:', {
      id: job.id,
      url: job.data.url,
      isDeepScan: job.data.isDeepScan,
      maxAttempts: job.opts?.attempts || 3,
    });

    return job;
  }

  async getJobStatus(jobId: string) {
    try {
      const job = await this.scanQueue.getJob(jobId);

      if (!job) {
        const state = await this.scanQueue.getJobState(jobId);
        console.log(`📊 Job ${jobId} state from getJobState:`, state);

        if (state === 'completed') {
          return {
            id: jobId,
            status: 'completed',
            result: null,
            message: 'Job completed but removed',
          };
        }

        if (state === 'failed') {
          return {
            id: jobId,
            status: 'failed',
            result: null,
            message: 'Job failed',
          };
        }

        console.log(`❌ Job ${jobId} not found`);
        return null;
      }

      const state = await job.getState();
      const result = job.returnvalue;

      console.log(`📊 Job ${jobId} status:`, {
        state,
        hasResult: !!result,
        resultSummary: result
          ? {
              id: result.id,
              score: result.score,
              vulnCount: result.vulnerabilities?.length || 0,
            }
          : null,
      });

      return {
        id: job.id,
        status: state,
        result: result || null,
        attempts: job.attemptsMade,
        maxAttempts: job.opts?.attempts || 3,
        failedReason: job.failedReason || null,
        timestamp: job.timestamp,
      };
    } catch (error) {
      console.error(`❌ Error getting job status for ${jobId}:`, error.message);
      return null;
    }
  }
}
