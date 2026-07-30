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
    const job = await this.scanQueue.add('scan', data);
    console.log('✅ Job added:', {
      id: job.id,
      data: job.data,
    });
    return job;
  }

  async getJobStatus(jobId: string) {
    const job = await this.scanQueue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    const result = job.returnvalue;

    console.log('📊 Job status:', {
      id: job.id,
      state,
      hasResult: !!result,
      resultSummary: result
        ? {
            score: result.score,
            vulnCount: result.vulnerabilities?.length || 0,
          }
        : null,
    });

    return {
      id: job.id,
      status: state,
      result: result,
    };
  }
}
