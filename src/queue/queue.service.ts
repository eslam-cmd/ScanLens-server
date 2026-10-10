// server/src/queue/queue.service.ts

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(@InjectQueue('scan-queue') private scanQueue: Queue) {}

  // ============================================================
  // ✅ إضافة مهمة فحص جديدة
  // ============================================================
  async addScanJob(data: {
    url: string;
    userId?: string;
    isDeepScan: boolean;
  }) {
    // ✅ احسب حجم الطابور الحالي
    const waitingCount = await this.scanQueue.getWaitingCount();
    const activeCount = await this.scanQueue.getActiveCount();

    // ✅ المستخدمون المسجلون لهم أولوية أعلى
    const priority = data.userId ? 1 : 10;

    const job = await this.scanQueue.add('scan', data, {
      priority,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 3000,
      },
      removeOnComplete: {
        age: 3600,
        count: 100,
      },
      removeOnFail: {
        age: 86400,
      },
    });

    this.logger.log(
      `✅ Job added: ${job.id} | URL: ${data.url} | Priority: ${priority}`,
    );

    return {
      jobId: job.id,
      queueInfo: {
        position: waitingCount + 1,
        queueSize: waitingCount + activeCount,
        estimatedWait: (waitingCount + activeCount) * 3, // 3s تقديرياً لكل مهمة
        priority: priority === 1 ? 'priority' : 'normal',
      },
    };
  }

  // ============================================================
  // ✅ حالة مهمة معينة
  // ============================================================
  async getJobStatus(jobId: string, userId: string) {
    const job = await this.scanQueue.getJob(jobId);

    if (!job || job.data.userId !== userId) {
      throw new NotFoundException('Scan job not found');
    }

    const state = await job.getState();
    let position: number | null = null;

    if (state === 'waiting') {
      const waiting = await this.scanQueue.getWaiting();
      const index = waiting.findIndex((waitingJob) => waitingJob.id === jobId);
      position = index >= 0 ? index + 1 : null;
    }

    const [waitingCount, activeCount] = await Promise.all([
      this.scanQueue.getWaitingCount(),
      this.scanQueue.getActiveCount(),
    ]);

    this.logger.log(
      `📊 Job ${jobId}: ${state} | Position: ${position} | Queue: ${waitingCount}`,
    );

    return {
      id: job.id,
      status: state,
      position,
      queueSize: waitingCount + activeCount,
      progress: job.progress || 0,
      result: job.returnvalue ?? null,
      attempts: job.attemptsMade,
      maxAttempts: job.opts?.attempts || 3,
      failedReason: job.failedReason || null,
      timestamp: job.timestamp,
      processedOn: job.processedOn || null,
      finishedOn: job.finishedOn || null,
    };
  }

  // ============================================================
  // ✅ إحصائيات الطابور
  // ============================================================
  async getQueueStats() {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.scanQueue.getWaitingCount(),
        this.scanQueue.getActiveCount(),
        this.scanQueue.getCompletedCount(),
        this.scanQueue.getFailedCount(),
        this.scanQueue.getDelayedCount(),
      ]);

      // ✅ المهام النشطة حالياً
      const activeJobs = await this.scanQueue.getActive();
      const activeJobsInfo = activeJobs.map((job) => ({
        id: job.id,
        url: job.data.url,
        isDeepScan: job.data.isDeepScan,
        progress: job.progress || 0,
        startedAt: job.processedOn,
      }));

      return {
        waiting,
        active,
        completed,
        failed,
        delayed,
        total: waiting + active,
        activeJobs: activeJobsInfo,
      };
    } catch (error) {
      this.logger.error(`❌ Error getting queue stats: ${error.message}`);
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        total: 0,
        activeJobs: [],
      };
    }
  }

  // ============================================================
  // ✅ إيقاف/استئناف الطابور (Admin)
  // ============================================================
  async pauseQueue() {
    await this.scanQueue.pause();
    this.logger.log('⏸️ Queue paused');
    return { message: 'Queue paused' };
  }

  async resumeQueue() {
    await this.scanQueue.resume();
    this.logger.log('▶️ Queue resumed');
    return { message: 'Queue resumed' };
  }

  // ============================================================
  // ✅ تنظيف المهام المكتملة/الفاشلة (Admin)
  // ============================================================
  async cleanQueue() {
    const completedCleaned = await this.scanQueue.clean(0, 1000, 'completed');
    const failedCleaned = await this.scanQueue.clean(0, 1000, 'failed');

    this.logger.log(
      `🧹 Cleaned: ${completedCleaned.length} completed, ${failedCleaned.length} failed`,
    );

    return {
      completed: completedCleaned.length,
      failed: failedCleaned.length,
      total: completedCleaned.length + failedCleaned.length,
    };
  }

  // ============================================================
  // ✅ تحديث progress مهمة
  // ============================================================
  async updateProgress(jobId: string, progress: number) {
    const job = await this.scanQueue.getJob(jobId);
    if (job) {
      await job.updateProgress(progress);
    }
  }

  // ============================================================
  // ✅ حذف مهمة
  // ============================================================
  async removeJob(jobId: string) {
    const job = await this.scanQueue.getJob(jobId);
    if (job) {
      await job.remove();
      this.logger.log(`🗑️ Job ${jobId} removed`);
      return { message: 'Job removed' };
    }
    return { message: 'Job not found' };
  }
}
