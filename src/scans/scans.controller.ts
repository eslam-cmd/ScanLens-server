// server/src/scans/scans.controller.ts
import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  Get,
  Param,
  Delete,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ScansService } from './scans.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtService } from '@nestjs/jwt';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueService } from '../queue/queue.service';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('scans')
export class ScansController {
  constructor(
    private readonly scansService: ScansService,
    private readonly jwtService: JwtService,

    @InjectQueue('scan-queue') private scanQueue: Queue,
    private readonly queueService: QueueService,
    private prisma: PrismaService,
  ) {}

  // ✅ 1. فحص سريع (مباشر بدون Queue)
  @Post('quick')
  async quickScan(
    @Body() body: { url: string; deepScan?: boolean },
    @Req() req: any,
  ) {
    let userId: string | undefined = undefined;

    const token =
      req.cookies?.access_token ||
      req.headers.authorization?.replace('Bearer ', '');

    if (token) {
      try {
        const payload = this.jwtService.verify(token);
        userId = payload.sub;
      } catch {
        // توكن غير صالح
      }
    }

    const result = await this.scansService.scanUrl(
      body.url,
      userId,
      body.deepScan || false,
    );

    console.log('📤 Quick scan result:', {
      id: result?.id,
      score: result?.score,
      vulnerabilities: result?.vulnerabilities?.length || 0,
    });

    return result;
  }

  // ✅ 2. توليد AI Fix
  @Post('ai-fix')
  @UseGuards(JwtAuthGuard)
  async getAiFix(
    @Body() body: { title: string; description: string },
    @Req() req: any,
  ) {
    const userId = req.user?.id;
    const remediation = await this.scansService.generateAiFix(
      body.title,
      body.description,
      userId,
    );
    return { remediation };
  }

  // ✅ 3. جلب تاريخ الفحوصات
  @Get('history')
  @UseGuards(JwtAuthGuard)
  async getHistory(@Req() req: any) {
    return this.scansService.getUserHistory(req.user.id);
  }

  // ✅ 4. حذف فحص
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteScan(@Param('id') id: string, @Req() req: any) {
    return this.scansService.deleteScan(id, req.user.id);
  }

  // ✅ 5. تصدير CSV لفحص واحد
  @Get(':id/export/csv')
  @UseGuards(JwtAuthGuard)
  async exportCsv(@Param('id') id: string, @Res() res: Response) {
    const scan = await this.scansService.getScanById(id);
    if (!scan) {
      throw new NotFoundException('Scan record not found');
    }

    const scanData = scan as any;
    const websiteUrl = scanData.website?.url || 'N/A';
    const headersData = scanData.headersResult || {
      presentHeaders: [],
      missingHeaders: [],
    };
    const sslData = scanData.sslResult || null;

    const csvRows = [
      ['Scan Audit Report', 'ScanLens Platform'],
      ['Domain / URL', websiteUrl],
      ['Security Score', `${scan.score}/100`],
      ['Date', new Date(scan.createdAt).toISOString()],
      [],
      ['Category', 'Key / Header', 'Status / Value'],
    ];

    if (headersData?.presentHeaders) {
      headersData.presentHeaders.forEach((h: string) =>
        csvRows.push(['Security Header', h, 'PRESENT']),
      );
    }
    if (headersData?.missingHeaders) {
      headersData.missingHeaders.forEach((h: string) =>
        csvRows.push(['Security Header', h, 'MISSING']),
      );
    }

    if (sslData) {
      csvRows.push(['SSL Certificate', 'Valid', sslData.valid ? 'YES' : 'NO']);
      csvRows.push(['SSL Certificate', 'Issuer', sslData.issuer || 'N/A']);
      csvRows.push([
        'SSL Certificate',
        'Days Remaining',
        sslData.daysRemaining ?? 'N/A',
      ]);
    }

    const csvContent = csvRows
      .map((row) =>
        row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(','),
      )
      .join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=scan-report-${scan.id.slice(0, 8)}.csv`,
    );
    return res.status(200).send(csvContent);
  }

  // ✅ 6. تصدير PDF لفحص واحد
  @Get(':id/export/pdf')
  @UseGuards(JwtAuthGuard)
  async exportPdf(@Param('id') id: string, @Res() res: Response) {
    const pdfBuffer = await this.scansService.generatePdfReport(id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=scan-report-${id.slice(0, 8)}.pdf`,
    );
    return res.status(200).send(pdfBuffer);
  }

  // ✅ 7. تصدير CSV لكل الفحوصات
  @Get('export/csv')
  @UseGuards(JwtAuthGuard)
  async exportAllHistoryCsv(@Req() req: any, @Res() res: Response) {
    const scans = await this.scansService.getUserHistory(req.user.id);
    if (!scans || scans.length === 0) {
      throw new NotFoundException('No scan history available for export');
    }

    const csvRows = [
      ['Scan ID', 'Target Domain', 'URL', 'Score', 'Status', 'Date'],
    ];

    scans.forEach((scan: any) => {
      csvRows.push([
        scan.id,
        scan.website?.domain || 'N/A',
        scan.website?.url || 'N/A',
        `${scan.score}/100`,
        scan.status,
        new Date(scan.createdAt).toISOString(),
      ]);
    });

    const csvContent = csvRows
      .map((row) =>
        row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(','),
      )
      .join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=ScanLens_History_${Date.now()}.csv`,
    );
    return res.status(200).send(csvContent);
  }

  // ✅ 8. جلب حالة مهمة في الـ Queue
  @Get('queue/status/:jobId')
  @UseGuards(JwtAuthGuard)
  async getJobStatus(@Param('jobId') jobId: string) {
    const status = await this.queueService.getJobStatus(jobId);
    if (!status) {
      throw new NotFoundException('Job not found');
    }
    return status;
  }

  // ✅ 9. إلغاء مهمة في الـ Queue
  @Delete('queue/:jobId')
  @UseGuards(JwtAuthGuard)
  async cancelJob(@Param('jobId') jobId: string) {
    const job = await this.scanQueue.getJob(jobId);
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    await job.remove();
    return { message: 'Job cancelled successfully' };
  }

  // ✅ 10. فحص مباشر (بدون Queue)
  @Post('direct-scan')
  @UseGuards(JwtAuthGuard)
  async directScan(
    @Body() body: { url: string; deepScan?: boolean },
    @Req() req: any,
  ) {
    return this.scansService.scanUrl(
      body.url,
      req.user.id,
      body.deepScan || false,
    );
  }

  // ✅ 11. الحصول على خطة المستخدم الحالية
  @Get('my-plan')
  @UseGuards(JwtAuthGuard)
  async getMyPlan(@Req() req: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { plan: true, role: true },
    });
    return {
      plan: user?.plan || 'free',
      role: user?.role || 'user',
    };
  }
}
