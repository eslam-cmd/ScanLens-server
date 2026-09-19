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

  // ============================================================
  // ✅ 1. دالة التحقق من صحة الـ URL
  // ============================================================
  private validateUrl(url: string): {
    valid: boolean;
    formattedUrl: string;
    error?: string;
  } {
    try {
      let formattedUrl = url.trim();
      formattedUrl = formattedUrl.replace(/\s+/g, '');
      formattedUrl = formattedUrl.replace(/^\/\//, '');

      if (
        !formattedUrl.startsWith('http://') &&
        !formattedUrl.startsWith('https://')
      ) {
        formattedUrl = `https://${formattedUrl}`;
      }

      const parsedUrl = new URL(formattedUrl);

      if (!parsedUrl.hostname || parsedUrl.hostname.length < 3) {
        return {
          valid: false,
          formattedUrl,
          error: 'Invalid domain name',
        };
      }

      if (
        formattedUrl.includes('//') &&
        formattedUrl.indexOf('//') !== formattedUrl.indexOf('://') + 1
      ) {
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

  // ============================================================
  // ✅ 2. نافذة الاستخدام (24 ساعة متجددة)
  // ============================================================

  async getUsageWindow(userId: string): Promise<{
    windowStart: Date;
    windowEnd: Date;
    scansToday: number;
    deepScansToday: number;
  }> {
    const now = new Date();
    const WINDOW_MS = 24 * 60 * 60 * 1000;

    const lastLog = await this.prisma.usageLog.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    if (!lastLog) {
      const windowEnd = new Date(now.getTime() + WINDOW_MS);
      return {
        windowStart: now,
        windowEnd,
        scansToday: 0,
        deepScansToday: 0,
      };
    }

    const lastLogTime = lastLog.createdAt.getTime();
    const nowMs = now.getTime();
    const elapsed = nowMs - lastLogTime;
    const windowsPassed = Math.floor(elapsed / WINDOW_MS);

    const windowStartMs = lastLogTime + windowsPassed * WINDOW_MS;
    const windowEndMs = windowStartMs + WINDOW_MS;

    if (nowMs >= windowEndMs) {
      const newWindowEnd = new Date(nowMs + WINDOW_MS);
      return {
        windowStart: now,
        windowEnd: newWindowEnd,
        scansToday: 0,
        deepScansToday: 0,
      };
    }

    const windowStart = new Date(windowStartMs);
    const windowEnd = new Date(windowEndMs);

    const scansToday = await this.prisma.usageLog.count({
      where: {
        userId,
        action: { in: ['SCAN', 'DEEP_SCAN'] },
        createdAt: { gte: windowStart, lt: windowEnd },
      },
    });

    const deepScansToday = await this.prisma.usageLog.count({
      where: {
        userId,
        action: 'DEEP_SCAN',
        createdAt: { gte: windowStart, lt: windowEnd },
      },
    });

    return { windowStart, windowEnd, scansToday, deepScansToday };
  }

  async getTodayScanCount(userId: string): Promise<number> {
    const window = await this.getUsageWindow(userId);
    return window.scansToday;
  }

  async getTodayDeepScanCount(userId: string): Promise<number> {
    const window = await this.getUsageWindow(userId);
    return window.deepScansToday;
  }

  /**
   * ✅ Cron: تنظيف سجلات الاستخدام الأقدم من 7 أيام
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async resetDailyUsage() {
    this.logger.log('🔄 [Cron] Cleaning up old usage logs...');

    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);

      const deleted = await this.prisma.usageLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });

      this.logger.log(
        `✅ [Cron] Cleanup complete: ${deleted.count} old records deleted`,
      );
      return { deleted: deleted.count };
    } catch (error) {
      this.logger.error('❌ [Cron] Failed to clean old usage logs:', error);
      throw error;
    }
  }

  // ============================================================
  // ✅ 3. حد التخزين الأقصى (maxStoredScans)
  // ============================================================

  /**
   * ✅ التحقق من عدد الفحوصات المخزنة حالياً
   */
  async checkStorageLimit(userId: string): Promise<{
    storedCount: number;
    maxStored: number | typeof Infinity;
    isAtLimit: boolean;
    plan: string;
    role: string;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, role: true },
    });

    if (!user) {
      throw new ForbiddenException('User not found');
    }

    // ✅ الأدمن بلا حدود
    if (user.role === 'admin') {
      return {
        storedCount: 0,
        maxStored: Infinity,
        isAtLimit: false,
        plan: 'admin',
        role: 'admin',
      };
    }

    const planId = (user.plan as PlanId) || 'free';
    const plan = PLANS[planId];

    if (!plan) {
      throw new ForbiddenException('Invalid plan');
    }

    const websites = await this.prisma.website.findMany({
      where: { userId },
      select: { id: true },
    });

    const websiteIds = websites.map((w) => w.id);

    const storedCount =
      websiteIds.length === 0
        ? 0
        : await this.prisma.scan.count({
            where: { websiteId: { in: websiteIds } },
          });

    const maxStored =
      (plan as any).maxStoredScans ?? Infinity;
    const isAtLimit = storedCount >= maxStored;

    return {
      storedCount,
      maxStored,
      isAtLimit,
      plan: planId,
      role: user.role,
    };
  }

  /**
   * ✅ حذف أقدم فحص للمستخدم (FIFO) لإفساح المجال
   */
  async deleteOldestScan(userId: string): Promise<boolean> {
    const websites = await this.prisma.website.findMany({
      where: { userId },
      select: { id: true },
    });

    const websiteIds = websites.map((w) => w.id);

    if (websiteIds.length === 0) return false;

    const oldestScan = await this.prisma.scan.findFirst({
      where: { websiteId: { in: websiteIds } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (!oldestScan) return false;

    await this.prisma.scan.delete({
      where: { id: oldestScan.id },
    });

    this.logger.log(
      `🗑️ Deleted oldest scan ${oldestScan.id} for user ${userId} (storage limit)`,
    );

    return true;
  }

  /**
   * ✅ تطبيق الحذف حسب مدة الحفظ للخطة
   */
  async enforceRetentionForUser(userId: string): Promise<{
    deleted: number;
    retentionDays: number | typeof Infinity;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, role: true },
    });

    if (!user) return { deleted: 0, retentionDays: Infinity };
    if (user.role === 'admin') return { deleted: 0, retentionDays: Infinity };

    const planId = (user.plan as PlanId) || 'free';
    const plan = PLANS[planId];
    const retentionDays = plan?.historyRetentionDays ?? 7;

    if (retentionDays === Infinity) {
      return { deleted: 0, retentionDays: Infinity };
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const websites = await this.prisma.website.findMany({
      where: { userId },
      select: { id: true },
    });

    const websiteIds = websites.map((w) => w.id);

    if (websiteIds.length === 0) {
      return { deleted: 0, retentionDays };
    }

    const deleted = await this.prisma.scan.deleteMany({
      where: {
        websiteId: { in: websiteIds },
        createdAt: { lt: cutoffDate },
      },
    });

    if (deleted.count > 0) {
      this.logger.log(
        `🗑️ Retention cleanup: deleted ${deleted.count} scans for user ${userId} (retention: ${retentionDays}d)`,
      );
    }

    return { deleted: deleted.count, retentionDays };
  }

  // ============================================================
  // ✅ 4. التحقق من صلاحية الفحص اليومي
  // ============================================================
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
      return {
        allowed: true,
        plan: 'admin',
        isGuest: false,
        windowEnd: null,
      };
    }

    const planId = (user.plan as PlanId) || 'free';
    const plan = PLANS[planId];

    if (!plan) {
      throw new ForbiddenException('Invalid plan');
    }

    const window = await this.getUsageWindow(userId);

    // ✅ Deep Scan limit
    if (isDeepScan) {
      const maxDeepScans =
        plan.deepScanLimit === Infinity ? Infinity : plan.deepScanLimit || 5;
      if (maxDeepScans !== Infinity && window.deepScansToday >= maxDeepScans) {
        throw new ForbiddenException(
          `You have reached your daily Deep Scan limit of ${maxDeepScans}. Upgrade to Pro for unlimited Deep Scans.`,
        );
      }
    }

    // ✅ Scans per day limit
    if (!plan.unlimitedScans) {
      if (window.scansToday >= plan.scansPerDay) {
        throw new ForbiddenException(
          `You have reached your daily scan limit of ${plan.scansPerDay} scans. Upgrade to Pro for unlimited scans.`,
        );
      }
    }

    const remainingScans = plan.unlimitedScans
      ? Infinity
      : plan.scansPerDay - window.scansToday;

    const remainingDeepScans = plan.unlimitedScans
      ? Infinity
      : (plan.deepScanLimit === Infinity ? 999 : plan.deepScanLimit) -
        window.deepScansToday;

    return {
      allowed: true,
      plan: planId,
      isGuest: false,
      todayScans: window.scansToday,
      remainingScans,
      todayDeepScans: window.deepScansToday,
      remainingDeepScans,
      windowEnd: window.windowEnd,
      windowStart: window.windowStart,
      limits: {
        scansPerDay: plan.scansPerDay,
        deepScanLimit: plan.deepScanLimit,
        unlimitedScans: plan.unlimitedScans,
      },
    };
  }

  // ============================================================
  // ✅ 5. فحص SSL/TLS
  // ============================================================
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

  // ============================================================
  // ✅ 6. الفحص الرئيسي
  // ============================================================
  async scanUrl(url: string, userId?: string, isDeepScan: boolean = false) {
    const urlValidation = this.validateUrl(url);

    if (!urlValidation.valid) {
      this.logger.warn(`❌ Invalid URL: ${url} - ${urlValidation.error}`);
      throw new BadRequestException(
        `Invalid URL: ${url}. Please enter a valid domain name.`,
      );
    }

    const formattedUrl = urlValidation.formattedUrl;

    const capability = await this.checkUserCapability(userId, isDeepScan);
    if (!capability.allowed) {
      throw new ForbiddenException('Scan not allowed');
    }

    this.logger.log(`🔍 Formatted URL: ${formattedUrl}`);
    this.logger.log(`🔍 User Plan: ${capability.plan}`);
    this.logger.log(`🔍 Is Deep Scan: ${isDeepScan}`);
    this.logger.log(`📊 Today scans: ${capability.todayScans || 0}`);
    this.logger.log(`📊 Remaining scans: ${capability.remainingScans || 0}`);

    try {
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
        if (found) presentHeaders.push(header.name);
        else missingHeaders.push(header.name);
      }

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
        if (presentHeaders.includes(header.name)) earnedWeight += weight;
      }

      let score =
        totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;

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

      // ✅ حفظ في قاعدة البيانات مع فرض حد التخزين
      let createdScanId: string | undefined = undefined;
      let comparison: any = null;
      let storageSkipped = false;
      let storageInfo: any = null;

      if (userId) {
        try {
          // ✅ التحقق من حد التخزين
          const storageCheck = await this.checkStorageLimit(userId);
          storageInfo = storageCheck;

          if (storageCheck.isAtLimit) {
            this.logger.warn(
              `⚠️ User ${userId} at storage limit (${storageCheck.storedCount}/${storageCheck.maxStored}). Deleting oldest...`,
            );

            const deleted = await this.deleteOldestScan(userId);

            if (!deleted) {
              storageSkipped = true;
              this.logger.warn(
                `⚠️ Could not delete oldest scan for user ${userId}. Skipping storage.`,
              );
            }
          }

          // ✅ إذا فشل الحذف، لا تخزّن الفحص الجديد
          if (storageSkipped) {
            this.logger.log(
              `⏭️ Skipping storage for user ${userId} (storage limit enforced)`,
            );
          } else {
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
          }
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
        // ✅ معلومات الاستخدام والنافذة
        dailyUsage: {
          scansToday: capability.todayScans || 0,
          remainingScans: capability.remainingScans,
          deepScansToday: capability.todayDeepScans || 0,
          remainingDeepScans: capability.remainingDeepScans,
          deepScanLimit:
            capability.limits?.deepScanLimit === Infinity
              ? null
              : capability.limits?.deepScanLimit,
          scansPerDay: capability.limits?.scansPerDay,
          unlimitedScans: capability.limits?.unlimitedScans || false,
          windowEnd: capability.windowEnd
            ? capability.windowEnd.toISOString()
            : null,
        },
        // ✅ معلومات التخزين
        storageInfo: storageInfo
          ? {
              storedCount: storageInfo.storedCount,
              maxStored:
                storageInfo.maxStored === Infinity
                  ? null
                  : storageInfo.maxStored,
              isAtLimit: storageInfo.isAtLimit,
              storageSkipped,
            }
          : null,
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

  // ============================================================
  // ✅ باقي الدوال
  // ============================================================

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

  async getUserHistory(userId: string) {
    const websites = await this.prisma.website.findMany({
      where: { userId },
      select: { id: true },
    });

    const websiteIds = websites.map((w) => w.id);

    if (websiteIds.length === 0) return [];

    return this.prisma.scan.findMany({
      where: { websiteId: { in: websiteIds } },
      include: {
        website: true,
        vulnerabilities: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteScan(scanId: string, userId: string) {
    const websites = await this.prisma.website.findMany({
      where: { userId },
      select: { id: true },
    });

    const websiteIds = websites.map((w) => w.id);

    const scan = await this.prisma.scan.findFirst({
      where: {
        id: scanId,
        websiteId: { in: websiteIds },
      },
    });

    if (!scan) {
      throw new BadRequestException(
        'Scan not found or does not belong to user',
      );
    }

    return this.prisma.scan.delete({ where: { id: scanId } });
  }

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
        websiteId: { in: websiteIds },
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

  async generatePdfReport(scanId: string, userId?: string): Promise<Buffer> {
    const scan = await this.getScanById(scanId, userId);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

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

      doc
        .moveTo(50, doc.y)
        .lineTo(550, doc.y)
        .strokeColor('#e4e4e7')
        .lineWidth(1)
        .stroke();
      doc.moveDown(0.5);

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

      doc
        .moveTo(50, doc.y)
        .lineTo(550, doc.y)
        .strokeColor('#e4e4e7')
        .lineWidth(1)
        .stroke();
      doc.moveDown(0.5);

      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .fillColor('#09090b')
        .text('Security Score', { underline: true });
      doc.moveDown(0.3);

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

  async getRecentScans(userId: string, limit: number = 10) {
    const websites = await this.prisma.website.findMany({
      where: { userId },
      select: { id: true },
    });

    const websiteIds = websites.map((w) => w.id);

    if (websiteIds.length === 0) return [];

    return this.prisma.scan.findMany({
      where: { websiteId: { in: websiteIds } },
      include: {
        website: {
          select: { domain: true, url: true },
        },
        vulnerabilities: {
          select: { severity: true, title: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

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

  async getUserWebsites(userId: string) {
    return this.prisma.website.findMany({
      where: { userId },
      include: {
        scans: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { vulnerabilities: true },
        },
      },
    });
  }

  async deleteWebsite(websiteId: string, userId: string) {
    const website = await this.prisma.website.findFirst({
      where: { id: websiteId, userId },
    });

    if (!website) {
      throw new NotFoundException('Website not found');
    }

    return this.prisma.website.delete({ where: { id: websiteId } });
  }

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
    if (role === 'admin') return Infinity;

    const planId = (plan as PlanId) || 'free';
    const planConfig = PLANS[planId];

    return planConfig?.historyRetentionDays ?? 7;
  }

  /**
   * ✅ Cron: حذف الفحوصات التي تجاوزت مدة الحفظ (يومياً عند منتصف الليل)
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanExpiredScans() {
    this.logger.log('🧹 [Cron] Starting expired scans cleanup...');

    try {
      const users = await this.prisma.user.findMany({
        select: { id: true, plan: true, role: true },
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

        if (websiteIds.length === 0) continue;

        const deleted = await this.prisma.scan.deleteMany({
          where: {
            websiteId: { in: websiteIds },
            createdAt: { lt: cutoffDate },
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
            `🗑️ Deleted ${deleted.count} expired scans for user ${user.id} (${user.plan} plan, retention: ${retentionDays}d)`,
          );
        }
      }

      if (totalDeleted > 0) {
        this.logger.log(
          `✅ [Cron] Cleanup complete: ${totalDeleted} total scans deleted`,
        );
      } else {
        this.logger.log('✅ [Cron] No expired scans found to delete');
      }

      return { totalDeleted, results };
    } catch (error) {
      this.logger.error('❌ [Cron] Failed to clean expired scans:', error);
      throw error;
    }
  }

  async cleanUserExpiredScans(userId: string) {
    const result = await this.enforceRetentionForUser(userId);
    return {
      deleted: result.deleted,
      retentionDays: result.retentionDays,
    };
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
    const planId = (user.plan as PlanId) || 'free';
    const planConfig = PLANS[planId];
    const maxStoredScans =
      (planConfig as any)?.maxStoredScans ?? Infinity;

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
        maxStoredScans,
        atStorageLimit: false,
      };
    }

    const totalScans = await this.prisma.scan.count({
      where: { websiteId: { in: websiteIds } },
    });

    let expiredScans = 0;

    if (retentionDays !== Infinity) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      expiredScans = await this.prisma.scan.count({
        where: {
          websiteId: { in: websiteIds },
          createdAt: { lt: cutoffDate },
        },
      });
    }

    const atStorageLimit =
      maxStoredScans !== Infinity && totalScans >= maxStoredScans;

    return {
      totalScans,
      expiredScans,
      retentionDays,
      isPermanent: retentionDays === Infinity,
      maxStoredScans,
      atStorageLimit,
    };
  }

  async getLatestScan(userId: string) {
    const websites = await this.prisma.website.findMany({
      where: { userId },
      select: { id: true },
    });

    const websiteIds = websites.map((w) => w.id);

    if (websiteIds.length === 0) return null;

    return this.prisma.scan.findFirst({
      where: { websiteId: { in: websiteIds } },
      orderBy: { createdAt: 'desc' },
      include: {
        website: true,
        vulnerabilities: true,
      },
    });
  }

  async getDailyStats(userId: string) {
    const window = await this.getUsageWindow(userId);

    const websites = await this.prisma.website.findMany({
      where: { userId },
      select: { id: true },
    });

    const websiteIds = websites.map((w) => w.id);

    return {
      scansToday: window.scansToday,
      deepScansToday: window.deepScansToday,
      totalScans: await this.prisma.scan.count({
        where: { websiteId: { in: websiteIds } },
      }),
      windowStart: window.windowStart,
      windowEnd: window.windowEnd,
    };
  }
}