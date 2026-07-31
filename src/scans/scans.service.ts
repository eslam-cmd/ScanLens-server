// server/src/scans/scans.service.ts

import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ScanStatus } from '@prisma/client';
import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import * as tls from 'tls';
import { URL } from 'url';
import PDFDocument from 'pdfkit';
import { PLANS, PlanId } from '../plans/plans.config';
import { HeadersEngine } from '../scanner/engines/headers.engine';
import { CookiesEngine } from '../scanner/engines/cookies.engine';
import { HttpsEngine } from '../scanner/engines/https.engine';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class ScansService {
  private readonly logger = new Logger(ScansService.name);
  private ai: GoogleGenAI;

  constructor(
    private prisma: PrismaService,
    private headersEngine: HeadersEngine,
    private cookiesEngine: CookiesEngine,
    private httpsEngine: HttpsEngine,
    @InjectQueue('scan-queue') private scanQueue: Queue,
  ) {
    this.ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || '',
    });
  }

  // ✅ 1. التحقق من صحة الـ URL
  private validateUrl(url: string): {
    valid: boolean;
    formattedUrl: string;
    error?: string;
  } {
    try {
      let formattedUrl = url.trim();

      // ✅ إزالة المسافات الزائدة
      formattedUrl = formattedUrl.replace(/\s+/g, '');

      // ✅ إزالة الـ // المكررة في البداية
      formattedUrl = formattedUrl.replace(/^\/\//, '');

      // ✅ إضافة البروتوكول إذا كان مفقوداً
      if (
        !formattedUrl.startsWith('http://') &&
        !formattedUrl.startsWith('https://')
      ) {
        formattedUrl = `https://${formattedUrl}`;
      }

      // ✅ التحقق من صحة الـ URL
      const parsedUrl = new URL(formattedUrl);

      // ✅ التحقق من وجود hostname صالح
      if (!parsedUrl.hostname || parsedUrl.hostname.length < 3) {
        return {
          valid: false,
          formattedUrl,
          error: 'Invalid domain name',
        };
      }

      // ✅ التحقق من عدم وجود // مكررة
      if (
        formattedUrl.includes('//') &&
        formattedUrl.indexOf('//') !== formattedUrl.indexOf('://') + 1
      ) {
        // إصلاح الـ // المكررة
        formattedUrl = formattedUrl.replace(/([^:]\/)\/+/g, '$1');
      }

      return { valid: true, formattedUrl };
    } catch (error) {
      return {
        valid: false,
        formattedUrl: url,
        error: 'Invalid URL format',
      };
    }
  }

  // ✅ 2. التحقق من صلاحية المستخدم
  private async checkUserCapability(
    userId: string | undefined,
    isDeepScan: boolean,
  ) {
    if (!userId) {
      return { allowed: true, plan: 'free', isGuest: true };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, role: true },
    });

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    if (user.role === 'admin') {
      return { allowed: true, plan: 'admin', isGuest: false };
    }

    const planId = (user.plan as PlanId) || 'free';
    const plan = PLANS[planId];

    if (!plan) {
      throw new ForbiddenException('Invalid plan');
    }

    // ✅ Deep Scan متاح للجميع (Free, Pro, Extra)
    if (isDeepScan) {
      // ✅ التحقق من عدد Deep Scans اليومية للـ Free
      if (planId === 'free') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const deepScansToday = await this.prisma.usageLog.count({
          where: {
            userId,
            action: 'DEEP_SCAN',
            createdAt: { gte: today },
          },
        });

        const maxDeepScans = 5;
        if (deepScansToday >= maxDeepScans) {
          throw new ForbiddenException(
            `You have reached your daily Deep Scan limit of ${maxDeepScans}. Upgrade to Pro for unlimited Deep Scans.`,
          );
        }
      }
    }

    // ✅ حدود الفحوصات اليومية
    if (!plan.unlimitedScans) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayScans = await this.prisma.usageLog.count({
        where: {
          userId,
          action: {
            in: ['SCAN', 'DEEP_SCAN'],
          },
          createdAt: { gte: today },
        },
      });

      if (todayScans >= plan.scansPerDay) {
        throw new ForbiddenException(
          `You have reached your daily scan limit of ${plan.scansPerDay} scans. Upgrade to Pro for unlimited scans.`,
        );
      }
    }

    return { allowed: true, plan: planId, isGuest: false };
  }

  // ✅ 3. فحص SSL/TLS
  private async inspectSsl(targetUrl: string): Promise<any> {
    return new Promise((resolve) => {
      try {
        const parsedUrl = new URL(targetUrl);
        const host = parsedUrl.hostname;
        const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : 443;

        if (parsedUrl.protocol !== 'https:') {
          return resolve({
            valid: false,
            reason: 'Target is not using HTTPS protocol',
          });
        }

        const socket = tls.connect(port, host, { servername: host }, () => {
          const cert = socket.getPeerCertificate();
          const validTo = new Date(cert.valid_to);
          const daysRemaining = Math.floor(
            (validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
          );

          const result = {
            valid: socket.authorized,
            issuer: cert.issuer?.O || cert.issuer?.CN || 'Unknown Issuer',
            subject: cert.subject?.CN || host,
            validFrom: cert.valid_from,
            validTo: cert.valid_to,
            daysRemaining,
            protocol: socket.getProtocol(),
          };

          socket.end();
          socket.destroy();
          resolve(result);
        });

        socket.on('error', (err) => {
          socket.destroy();
          resolve({ valid: false, reason: err.message });
        });

        socket.setTimeout(5000, () => {
          socket.destroy();
          resolve({ valid: false, reason: 'TLS connection timeout' });
        });
      } catch (err: any) {
        resolve({ valid: false, reason: err.message || 'Invalid URL' });
      }
    });
  }

  // ✅ 4. الفحص الرئيسي
  async scanUrl(url: string, userId?: string, isDeepScan: boolean = false) {
    // ✅ التحقق من صحة الـ URL أولاً
    const urlValidation = this.validateUrl(url);

    if (!urlValidation.valid) {
      this.logger.warn(`❌ Invalid URL: ${url} - ${urlValidation.error}`);
      throw new BadRequestException(
        `Invalid URL: ${url}. Please enter a valid domain name.`,
      );
    }

    const formattedUrl = urlValidation.formattedUrl;

    // ✅ التحقق من الصلاحية
    const capability = await this.checkUserCapability(userId, isDeepScan);
    if (!capability.allowed) {
      throw new ForbiddenException('Scan not allowed');
    }

    this.logger.log(`🔍 Formatted URL: ${formattedUrl}`);
    this.logger.log(`🔍 User Plan: ${capability.plan}`);
    this.logger.log(`🔍 Is Deep Scan: ${isDeepScan}`);

    try {
      // ✅ تنفيذ الفحص
      const response = await axios.get(formattedUrl, {
        timeout: 15000,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      this.logger.log(`🔍 Response Status: ${response.status}`);

      const responseHeaders = response.headers as Record<string, string>;

      // ✅ تحليل الهيدرز الأمنية
      const securityHeaders = [
        { name: 'content-security-policy', severity: 'HIGH', label: 'CSP' },
        { name: 'strict-transport-security', severity: 'HIGH', label: 'HSTS' },
        { name: 'x-content-type-options', severity: 'MEDIUM', label: 'XCTO' },
        { name: 'x-frame-options', severity: 'MEDIUM', label: 'XFO' },
        { name: 'referrer-policy', severity: 'LOW', label: 'Referrer' },
        { name: 'permissions-policy', severity: 'LOW', label: 'Permissions' },
        { name: 'x-xss-protection', severity: 'LOW', label: 'XSS' },
      ];

      const presentHeaders: string[] = [];
      const missingHeaders: string[] = [];

      for (const header of securityHeaders) {
        const found = Object.keys(responseHeaders).some(
          (key) => key.toLowerCase() === header.name,
        );
        if (found) {
          presentHeaders.push(header.name);
        } else {
          missingHeaders.push(header.name);
        }
      }

      // ✅ حساب النتيجة
      const headerWeights: Record<string, number> = {
        'content-security-policy': 25,
        'strict-transport-security': 20,
        'x-content-type-options': 15,
        'x-frame-options': 15,
        'referrer-policy': 10,
        'permissions-policy': 10,
        'x-xss-protection': 5,
      };

      let totalWeight = 0;
      let earnedWeight = 0;

      for (const header of securityHeaders) {
        const weight = headerWeights[header.name] || 10;
        totalWeight += weight;
        const found = presentHeaders.includes(header.name);
        if (found) {
          earnedWeight += weight;
        }
      }

      let score =
        totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;

      // ✅ الفحص العميق
      let sslAnalysis: any = null;
      let corsAnalysis: any = null;

      if (isDeepScan) {
        this.logger.log('🔍 Running deep scan...');

        sslAnalysis = await this.inspectSsl(formattedUrl);

        if (sslAnalysis && !sslAnalysis.valid) {
          score = Math.max(0, score - 25);
        } else if (sslAnalysis && sslAnalysis.valid) {
          score = Math.min(100, score + 5);
        }

        const allowOrigin = responseHeaders['access-control-allow-origin'];
        corsAnalysis = {
          allowOrigin: allowOrigin || 'Not Set',
          riskLevel:
            allowOrigin === '*' ? 'HIGH' : allowOrigin ? 'LOW' : 'SECURE',
        };

        if (allowOrigin === '*') {
          score = Math.max(0, score - 20);
        } else if (allowOrigin) {
          score = Math.min(100, score + 5);
        }
      }

      this.logger.log(`📊 Final Score: ${score}`);

      // ✅ إنشاء الثغرات
      const detectedVulnerabilities: any[] = [];

      for (const header of securityHeaders) {
        if (missingHeaders.includes(header.name)) {
          const severity =
            header.severity === 'HIGH'
              ? 'HIGH'
              : header.severity === 'MEDIUM'
                ? 'MEDIUM'
                : 'LOW';

          detectedVulnerabilities.push({
            title: `Missing Security Header: ${header.label}`,
            severity,
            description: `The HTTP header '${header.name}' is not configured on ${formattedUrl}.`,
            remediation: this.getRemediationSuggestion(header.name),
          });
        }
      }

      if (corsAnalysis?.riskLevel === 'HIGH') {
        detectedVulnerabilities.push({
          title: 'CORS Misconfiguration',
          severity: 'HIGH',
          description: 'Wildcard (*) Access-Control-Allow-Origin detected.',
          remediation:
            'Configure specific allowed origins instead of using wildcard (*).',
        });
      }

      // ✅ حفظ في قاعدة البيانات
      let createdScanId: string | undefined = undefined;
      let comparison: any = null;

      if (userId) {
        try {
          const targetDomain = new URL(formattedUrl).hostname;

          let website = await this.prisma.website.findFirst({
            where: { userId, url: formattedUrl },
          });

          if (!website) {
            website = await this.prisma.website.create({
              data: {
                url: formattedUrl,
                domain: targetDomain,
                userId,
              },
            });
          }

          // ✅ المقارنة مع الفحص السابق
          const previousScan = await this.prisma.scan.findFirst({
            where: { websiteId: website.id },
            orderBy: { createdAt: 'desc' },
            include: { vulnerabilities: true },
          });

          if (previousScan) {
            const scoreDiff = score - previousScan.score;
            comparison = {
              previousScanDate: previousScan.createdAt,
              previousScore: previousScan.score,
              scoreDiff,
              status:
                scoreDiff > 10
                  ? 'IMPROVED'
                  : scoreDiff < -10
                    ? 'REGRESSED'
                    : 'UNCHANGED',
            };
          }

          // ✅ إنشاء الفحص
          const newScan = await this.prisma.scan.create({
            data: {
              websiteId: website.id,
              score,
              status: ScanStatus.COMPLETED,
              completedAt: new Date(),
              vulnerabilities: {
                create: detectedVulnerabilities,
              },
            },
          });
          createdScanId = newScan.id;

          // ✅ تسجيل الاستخدام
          await this.prisma.usageLog.create({
            data: {
              userId,
              action: isDeepScan ? 'DEEP_SCAN' : 'SCAN',
              metadata: {
                url: formattedUrl,
                score,
                deepScan: isDeepScan,
                plan: capability.plan,
              },
            },
          });
        } catch (dbError: any) {
          this.logger.warn(
            `⚠️ Database error, continuing without saving: ${dbError.message}`,
          );
        }
      }

      // ✅ النتيجة النهائية
      const result = {
        id: createdScanId,
        url: formattedUrl,
        score,
        isDeepScan,
        statusCode: response.status,
        headers: {
          presentHeaders,
          missingHeaders,
          rawHeaders: responseHeaders,
        },
        cookies: responseHeaders['set-cookie'] || [],
        ssl: sslAnalysis,
        cors: corsAnalysis,
        vulnerabilities: detectedVulnerabilities,
        comparison,
        plan: capability.plan,
        isGuest: capability.isGuest,
        deepScanLimit:
          capability.plan === 'free'
            ? {
                max: 5,
                used: 0,
                remaining: 5,
              }
            : undefined,
      };

      this.logger.log(`✅ Scan completed successfully for: ${formattedUrl}`);
      return result;
    } catch (error) {
      this.logger.error(`❌ Scan Error: ${error}`);
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to reach target URL: ${formattedUrl} - ${error.message}`,
      );
    }
  }

  // ✅ دالة مساعدة لتوليد اقتراحات الإصلاح
  private getRemediationSuggestion(headerName: string): string {
    const suggestions: Record<string, string> = {
      'content-security-policy':
        "Add Content-Security-Policy header. Example: `default-src 'self'; script-src 'self' 'unsafe-inline';`",
      'strict-transport-security':
        'Add Strict-Transport-Security header. Example: `max-age=31536000; includeSubDomains; preload`',
      'x-content-type-options':
        'Add X-Content-Type-Options header. Example: `nosniff`',
      'x-frame-options':
        'Add X-Frame-Options header. Example: `DENY` or `SAMEORIGIN`',
      'referrer-policy':
        'Add Referrer-Policy header. Example: `strict-origin-when-cross-origin`',
      'permissions-policy':
        'Add Permissions-Policy header. Example: `geolocation=(), microphone=(), camera=()`',
      'x-xss-protection':
        'Add X-XSS-Protection header. Example: `1; mode=block`',
    };
    return suggestions[headerName] || 'Add the missing security header.';
  }

  // ✅ 5. توليد AI Fix
  async generateAiFix(
    vulnerabilityTitle: string,
    context: string,
    userId?: string,
  ): Promise<string> {
    if (!userId) {
      throw new ForbiddenException(
        'AI remediation is only available for registered users.',
      );
    }

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `You are an expert Cybersecurity Engineer. Provide a concise, actionable remediation guide and code snippet to fix the following security vulnerability:
        
Vulnerability: ${vulnerabilityTitle}
Context: ${context}

Format your output in Markdown with:
1. Short Explanation of the Risk
2. Recommended Fix
3. Clean Code Snippet (e.g. Express/NestJS/Next.js or Nginx headers)`,
      });

      return response.text || 'No automated remediation available.';
    } catch (err: any) {
      this.logger.error(`Gemini AI Generation Error: ${err}`);
      throw new BadRequestException('Unable to generate AI fix at this time.');
    }
  }

  // ✅ 6. جلب تاريخ الفحوصات
  async getUserHistory(userId: string) {
    const websites = await this.prisma.website.findMany({
      where: { userId },
      select: { id: true },
    });

    const websiteIds = websites.map((w) => w.id);

    if (websiteIds.length === 0) {
      return [];
    }

    return this.prisma.scan.findMany({
      where: {
        websiteId: {
          in: websiteIds,
        },
      },
      include: {
        website: true,
        vulnerabilities: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ✅ 7. حذف فحص
  async deleteScan(scanId: string, userId: string) {
    const websites = await this.prisma.website.findMany({
      where: { userId },
      select: { id: true },
    });

    const websiteIds = websites.map((w) => w.id);

    const scan = await this.prisma.scan.findFirst({
      where: {
        id: scanId,
        websiteId: {
          in: websiteIds,
        },
      },
    });

    if (!scan) {
      throw new BadRequestException(
        'Scan not found or does not belong to user',
      );
    }

    return this.prisma.scan.delete({ where: { id: scanId } });
  }

  // ✅ 8. جلب فحص معين
  async getScanById(scanId: string, userId?: string) {
    let whereClause: any = { id: scanId };

    if (userId) {
      const websites = await this.prisma.website.findMany({
        where: { userId },
        select: { id: true },
      });

      const websiteIds = websites.map((w) => w.id);

      whereClause = {
        id: scanId,
        websiteId: {
          in: websiteIds,
        },
      };
    }

    const scan = await this.prisma.scan.findFirst({
      where: whereClause,
      include: {
        website: true,
        vulnerabilities: true,
      },
    });

    if (!scan) {
      throw new NotFoundException('Scan record not found');
    }

    return scan;
  }

  // ✅ 9. توليد تقرير PDF
  async generatePdfReport(scanId: string, userId?: string): Promise<Buffer> {
    const scan = await this.getScanById(scanId, userId);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      // عنوان التقرير
      doc
        .fontSize(24)
        .font('Helvetica-Bold')
        .fillColor('#0ea5e9')
        .text('ScanLens', { align: 'center' });
      doc
        .fontSize(18)
        .font('Helvetica-Bold')
        .fillColor('#09090b')
        .text('Security Audit Report', { align: 'center' });
      doc.moveDown(0.5);

      // خط فاصل
      doc
        .moveTo(50, doc.y)
        .lineTo(550, doc.y)
        .strokeColor('#e4e4e7')
        .lineWidth(1)
        .stroke();
      doc.moveDown(0.5);

      // معلومات التقرير
      const websiteUrl = (scan as any).website?.url || 'N/A';
      const domain = (scan as any).website?.domain || 'N/A';

      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .fillColor('#09090b')
        .text('Report Information', { underline: true });
      doc.moveDown(0.3);

      const infoData = [
        ['Domain:', domain],
        ['URL:', websiteUrl],
        ['Security Score:', `${scan.score}/100`],
        ['Status:', scan.status],
        ['Date:', new Date(scan.createdAt).toLocaleString()],
        ['Scan ID:', scan.id],
      ];

      infoData.forEach(([label, value]) => {
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .fillColor('#52525b')
          .text(label, { continued: true })
          .font('Helvetica')
          .fillColor('#09090b')
          .text(` ${value}`, { align: 'right' });
      });

      doc.moveDown(0.5);

      // خط فاصل
      doc
        .moveTo(50, doc.y)
        .lineTo(550, doc.y)
        .strokeColor('#e4e4e7')
        .lineWidth(1)
        .stroke();
      doc.moveDown(0.5);

      // قسم النتيجة
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .fillColor('#09090b')
        .text('Security Score', { underline: true });
      doc.moveDown(0.3);

      // شريط النتيجة
      const scoreWidth = (scan.score / 100) * 400;
      const scoreColor =
        scan.score >= 80 ? '#22c55e' : scan.score >= 50 ? '#f59e0b' : '#ef4444';

      doc.rect(50, doc.y, 400, 20).fillColor('#f4f4f5').fill();
      doc.rect(50, doc.y, scoreWidth, 20).fillColor(scoreColor).fill();

      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#09090b')
        .text(`${scan.score}%`, 460, doc.y - 3);

      doc.moveDown(1.5);
      doc
        .moveTo(50, doc.y)
        .lineTo(550, doc.y)
        .strokeColor('#e4e4e7')
        .lineWidth(1)
        .stroke();
      doc.moveDown(0.5);

      // قسم الثغرات
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .fillColor('#09090b')
        .text('Vulnerabilities Found', { underline: true });
      doc.moveDown(0.3);

      const vulnerabilities = (scan as any).vulnerabilities || [];

      if (vulnerabilities.length === 0) {
        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor('#22c55e')
          .text('✅ No vulnerabilities detected! Your website is secure.');
      } else {
        vulnerabilities.forEach((vuln: any, index: number) => {
          const severityColor =
            vuln.severity === 'CRITICAL' || vuln.severity === 'HIGH'
              ? '#ef4444'
              : vuln.severity === 'MEDIUM'
                ? '#f59e0b'
                : '#3b82f6';

          doc
            .fontSize(11)
            .font('Helvetica-Bold')
            .fillColor('#09090b')
            .text(`${index + 1}. ${vuln.title}`);

          doc
            .fontSize(9)
            .font('Helvetica')
            .fillColor('#52525b')
            .text(`   Severity: `)
            .font('Helvetica-Bold')
            .fillColor(severityColor)
            .text(`${vuln.severity}`, { continued: true })
            .font('Helvetica')
            .fillColor('#52525b')
            .text(`   ${vuln.description || ''}`);

          if (vuln.remediation) {
            doc
              .fontSize(9)
              .font('Helvetica')
              .fillColor('#22c55e')
              .text(`   ✅ Fix: ${vuln.remediation}`);
          }

          doc.moveDown(0.2);
        });
      }

      doc.moveDown(0.5);
      doc
        .moveTo(50, doc.y)
        .lineTo(550, doc.y)
        .strokeColor('#e4e4e7')
        .lineWidth(1)
        .stroke();
      doc.moveDown(0.5);

      // التذييل
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#a1a1aa')
        .text(`Report generated by ScanLens • ${new Date().toLocaleString()}`, {
          align: 'center',
        });
      doc
        .fontSize(8)
        .fillColor('#a1a1aa')
        .text('© ScanLens - Security Audit Platform', { align: 'center' });

      doc.end();
    });
  }

  // ✅ 10. تصدير CSV
  async generateCsvReport(scanId: string, userId?: string): Promise<string> {
    const scan = await this.getScanById(scanId, userId);
    const vulnerabilities = (scan as any).vulnerabilities || [];

    const rows = [
      ['ScanLens Security Audit Report'],
      [''],
      ['Report Information'],
      [`Domain:`, (scan as any).website?.domain || 'N/A'],
      [`URL:`, (scan as any).website?.url || 'N/A'],
      [`Security Score:`, `${scan.score}/100`],
      [`Status:`, scan.status],
      [`Date:`, new Date(scan.createdAt).toLocaleString()],
      [''],
      ['Vulnerabilities Found:'],
      ['#', 'Title', 'Severity', 'Description', 'Remediation'],
    ];

    if (vulnerabilities.length === 0) {
      rows.push(['No vulnerabilities detected!']);
    } else {
      vulnerabilities.forEach((vuln: any, index: number) => {
        rows.push([
          String(index + 1),
          vuln.title || '',
          vuln.severity || '',
          vuln.description || '',
          vuln.remediation || '',
        ]);
      });
    }

    return rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','),
      )
      .join('\n');
  }

  // ✅ 11. جلب إحصائيات المستخدم
  async getUserStats(userId: string) {
    const websites = await this.prisma.website.findMany({
      where: { userId },
      include: {
        scans: {
          include: {
            vulnerabilities: true,
          },
        },
      },
    });

    const allScans = websites.flatMap((w) => w.scans);
    const totalScans = allScans.length;
    const averageScore =
      totalScans > 0
        ? Math.round(allScans.reduce((acc, s) => acc + s.score, 0) / totalScans)
        : 0;

    const vulnerabilities = allScans.flatMap((s) => s.vulnerabilities);
    const criticalVulnerabilities = vulnerabilities.filter(
      (v) => v.severity === 'CRITICAL',
    ).length;
    const highVulnerabilities = vulnerabilities.filter(
      (v) => v.severity === 'HIGH',
    ).length;

    return {
      totalWebsites: websites.length,
      totalScans,
      averageScore,
      vulnerabilities: {
        total: vulnerabilities.length,
        critical: criticalVulnerabilities,
        high: highVulnerabilities,
      },
      recentScans: allScans.slice(0, 10).map((s) => ({
        id: s.id,
        domain: (s as any).website?.domain,
        score: s.score,
        createdAt: s.createdAt,
      })),
    };
  }

  // ✅ 12. جلب الفحوصات الأخيرة
  async getRecentScans(userId: string, limit: number = 10) {
    const websites = await this.prisma.website.findMany({
      where: { userId },
      select: { id: true },
    });

    const websiteIds = websites.map((w) => w.id);

    if (websiteIds.length === 0) {
      return [];
    }

    return this.prisma.scan.findMany({
      where: {
        websiteId: {
          in: websiteIds,
        },
      },
      include: {
        website: {
          select: {
            domain: true,
            url: true,
          },
        },
        vulnerabilities: {
          select: {
            severity: true,
            title: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ✅ 13. إعادة فحص موقع
  async rescanWebsite(
    websiteId: string,
    userId: string,
    isDeepScan: boolean = false,
  ) {
    const website = await this.prisma.website.findFirst({
      where: { id: websiteId, userId },
    });

    if (!website) {
      throw new NotFoundException('Website not found');
    }

    return this.scanUrl(website.url, userId, isDeepScan);
  }

  // ✅ 14. جلب جميع المواقع
  async getUserWebsites(userId: string) {
    return this.prisma.website.findMany({
      where: { userId },
      include: {
        scans: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            vulnerabilities: true,
          },
        },
      },
    });
  }

  // ✅ 15. حذف موقع
  async deleteWebsite(websiteId: string, userId: string) {
    const website = await this.prisma.website.findFirst({
      where: { id: websiteId, userId },
    });

    if (!website) {
      throw new NotFoundException('Website not found');
    }

    return this.prisma.website.delete({
      where: { id: websiteId },
    });
  }

  // ✅ 16. جلب نشاطات المستخدم
  async getUserActivities(userId: string) {
    return this.prisma.usageLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  // ============================================================
  // ✅ دوال التنظيف والتخزين
  // ============================================================

  private getRetentionDays(
    plan: string,
    role: string,
  ): number | typeof Infinity {
    if (role === 'admin') {
      return Infinity;
    }

    const retentionMap: Record<string, number> = {
      free: 7,
      pro: 30,
      extra: 90,
      premium: 365,
    };

    return retentionMap[plan] || 7;
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanExpiredScans() {
    this.logger.log('🧹 Starting expired scans cleanup...');

    try {
      const users = await this.prisma.user.findMany({
        select: {
          id: true,
          plan: true,
          role: true,
        },
      });

      let totalDeleted = 0;
      const results: { userId: string; plan: string; deleted: number }[] = [];

      for (const user of users) {
        const retentionDays = this.getRetentionDays(user.plan, user.role);

        if (retentionDays === Infinity) {
          this.logger.debug(
            `⏭️ Skipping user ${user.id} (${user.plan}) - Permanent retention`,
          );
          continue;
        }

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        const websites = await this.prisma.website.findMany({
          where: { userId: user.id },
          select: { id: true },
        });

        const websiteIds = websites.map((w) => w.id);

        if (websiteIds.length === 0) {
          continue;
        }

        const deleted = await this.prisma.scan.deleteMany({
          where: {
            websiteId: {
              in: websiteIds,
            },
            createdAt: {
              lt: cutoffDate,
            },
          },
        });

        if (deleted.count > 0) {
          totalDeleted += deleted.count;
          results.push({
            userId: user.id,
            plan: user.plan,
            deleted: deleted.count,
          });
          this.logger.log(
            `🗑️ Deleted ${deleted.count} expired scans for user ${user.id} (${user.plan} plan)`,
          );
        }
      }

      if (totalDeleted > 0) {
        this.logger.log(
          `✅ Cleanup complete: ${totalDeleted} total scans deleted`,
        );
      } else {
        this.logger.log('✅ No expired scans found to delete');
      }

      return { totalDeleted, results };
    } catch (error) {
      this.logger.error('❌ Failed to clean expired scans:', error);
      throw error;
    }
  }

  async cleanUserExpiredScans(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const retentionDays = this.getRetentionDays(user.plan, user.role);

    if (retentionDays === Infinity) {
      return { message: 'Permanent retention - no scans deleted', deleted: 0 };
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const websites = await this.prisma.website.findMany({
      where: { userId },
      select: { id: true },
    });

    const websiteIds = websites.map((w) => w.id);

    if (websiteIds.length === 0) {
      return { deleted: 0, retentionDays, message: 'No websites found' };
    }

    const deleted = await this.prisma.scan.deleteMany({
      where: {
        websiteId: {
          in: websiteIds,
        },
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    this.logger.log(
      `🗑️ Deleted ${deleted.count} expired scans for user ${userId}`,
    );
    return { deleted: deleted.count, retentionDays };
  }

  async getUserStorageStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const retentionDays = this.getRetentionDays(user.plan, user.role);

    const websites = await this.prisma.website.findMany({
      where: { userId },
      select: { id: true },
    });

    const websiteIds = websites.map((w) => w.id);

    if (websiteIds.length === 0) {
      return {
        totalScans: 0,
        expiredScans: 0,
        retentionDays,
        isPermanent: retentionDays === Infinity,
      };
    }

    const totalScans = await this.prisma.scan.count({
      where: {
        websiteId: {
          in: websiteIds,
        },
      },
    });

    if (retentionDays !== Infinity) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const expiredScans = await this.prisma.scan.count({
        where: {
          websiteId: {
            in: websiteIds,
          },
          createdAt: {
            lt: cutoffDate,
          },
        },
      });

      return {
        totalScans,
        expiredScans,
        retentionDays,
        isPermanent: false,
      };
    }

    return {
      totalScans,
      expiredScans: 0,
      retentionDays: Infinity,
      isPermanent: true,
    };
  }

  async getLatestScan(userId: string) {
    const websites = await this.prisma.website.findMany({
      where: { userId },
      select: { id: true },
    });

    const websiteIds = websites.map((w) => w.id);

    if (websiteIds.length === 0) {
      return null;
    }

    return this.prisma.scan.findFirst({
      where: {
        websiteId: {
          in: websiteIds,
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        website: true,
        vulnerabilities: true,
      },
    });
  }

  async getDailyStats(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const websites = await this.prisma.website.findMany({
      where: { userId },
      select: { id: true },
    });

    const websiteIds = websites.map((w) => w.id);

    const scansToday = await this.prisma.usageLog.count({
      where: {
        userId,
        action: {
          in: ['SCAN', 'DEEP_SCAN'],
        },
        createdAt: { gte: today },
      },
    });

    const deepScansToday = await this.prisma.usageLog.count({
      where: {
        userId,
        action: 'DEEP_SCAN',
        createdAt: { gte: today },
      },
    });

    return {
      scansToday,
      deepScansToday,
      totalScans: await this.prisma.scan.count({
        where: {
          websiteId: {
            in: websiteIds,
          },
        },
      }),
    };
  }
}
