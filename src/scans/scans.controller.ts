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
  ForbiddenException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ScansService } from './scans.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { ExportService } from './export.service';

@Controller('scans')
export class ScansController {
  constructor(
    private readonly scansService: ScansService,
    private readonly jwtService: JwtService,
    private readonly exportService: ExportService,
    private prisma: PrismaService,
  ) {}

  // ✅ 1. فحص مباشر (بدون Queue)
  @Post('direct-scan')
  @UseGuards(JwtAuthGuard) // ✅ يتطلب تسجيل دخول
  async directScan(
    @Body() body: { url: string; deepScan?: boolean },
    @Req() req: any,
  ) {
    const userId = req.user?.id;

    if (!userId) {
      throw new ForbiddenException('User not authenticated');
    }

    // ✅ تنفيذ الفحص مباشرة
    const result = await this.scansService.scanUrl(
      body.url,
      userId,
      body.deepScan || false,
    );

    console.log('📤 Direct scan result:', {
      id: result?.id,
      score: result?.score,
      vulnerabilities: result?.vulnerabilities?.length || 0,
    });

    return result;
  }

  // ✅ 2. فحص للضيوف (بدون JWT)
  @Post('guest-scan')
  async guestScan(@Body() body: { url: string; deepScan?: boolean }) {
    // ✅ فحص بدون userId (ضيف)
    const result = await this.scansService.scanUrl(
      body.url,
      undefined, // no userId
      body.deepScan || false,
    );

    console.log('📤 Guest scan result:', {
      id: result?.id,
      score: result?.score,
      vulnerabilities: result?.vulnerabilities?.length || 0,
    });

    return result;
  }

  // ✅ 3. توليد AI Fix
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

  // ✅ 4. جلب تاريخ الفحوصات
  @Get('history')
  @UseGuards(JwtAuthGuard)
  async getHistory(@Req() req: any) {
    return this.scansService.getUserHistory(req.user.id);
  }

  // ✅ 5. حذف فحص
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteScan(@Param('id') id: string, @Req() req: any) {
    return this.scansService.deleteScan(id, req.user.id);
  }

  // ✅ 6. تصدير CSV لفحص واحد
  @Get(':id/export/csv')
  @UseGuards(JwtAuthGuard)
  async exportCsv(@Param('id') id: string, @Res() res: Response) {
    const csvContent = await this.exportService.generateSingleScanCsv(id);

    const scan = await this.scansService.getScanById(id);
    const domain = (scan as any).website?.domain || 'scan';
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const filename = `ScanLens_Report_${domain}_${timestamp}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(200).send(csvContent);
  }

  // ✅ 7. تصدير PDF لفحص واحد
  @Get(':id/export/pdf')
  @UseGuards(JwtAuthGuard)
  async exportPdf(@Param('id') id: string, @Res() res: Response) {
    const pdfBuffer = await this.exportService.generatePdfReport(id);

    const scan = await this.scansService.getScanById(id);
    const domain = (scan as any).website?.domain || 'scan';
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const filename = `ScanLens_Report_${domain}_${timestamp}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(200).send(pdfBuffer);
  }

  // ✅ 8. تصدير CSV لكل الفحوصات
  @Get('export/csv')
  @UseGuards(JwtAuthGuard)
  async exportAllHistoryCsv(@Req() req: any, @Res() res: Response) {
    const csvContent = await this.exportService.generateCsvExport(req.user.id);

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const filename = `ScanLens_History_${timestamp}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(200).send(csvContent);
  }

  // ✅ 9. الحصول على خطة المستخدم الحالية
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

  // ✅ 10. تنظيف الفحوصات المنتهية (للمدير فقط)
  @Delete('clean-expired')
  @UseGuards(JwtAuthGuard)
  async cleanExpiredScans(@Req() req: any) {
    if (req.user.role !== 'admin') {
      throw new ForbiddenException('Only admins can perform this action');
    }
    const result = await this.scansService.cleanExpiredScans();
    return result;
  }

  // ✅ 11. تنظيف فحوصات المستخدم المنتهية
  @Delete('user/clean-expired')
  @UseGuards(JwtAuthGuard)
  async cleanUserExpiredScans(@Req() req: any) {
    const result = await this.scansService.cleanUserExpiredScans(req.user.id);
    return result;
  }

  // ✅ 12. الحصول على إحصائيات التخزين
  @Get('storage-stats')
  @UseGuards(JwtAuthGuard)
  async getStorageStats(@Req() req: any) {
    const stats = await this.scansService.getUserStorageStats(req.user.id);
    return stats;
  }

  // ✅ 13. الحصول على إحصائيات اليومية
  @Get('daily-stats')
  @UseGuards(JwtAuthGuard)
  async getDailyStats(@Req() req: any) {
    const stats = await this.scansService.getDailyStats(req.user.id);
    return stats;
  }

  // ✅ 14. الحصول على آخر فحص
  @Get('latest')
  @UseGuards(JwtAuthGuard)
  async getLatestScan(@Req() req: any) {
    const scan = await this.scansService.getLatestScan(req.user.id);
    return scan;
  }
}
