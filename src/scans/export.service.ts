// server/src/scans/export.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import PDFDocument from 'pdfkit';
import { Parser } from 'json2csv';

@Injectable()
export class ExportService {
  constructor(private prisma: PrismaService) {}

  private extractDomain(url?: string): string {
    if (!url) return 'N/A';
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  // ✅ 1. توليد تقرير PDF محسّن مع تصميم احترافي
  async generatePdfReport(scanId: string): Promise<Buffer> {
    const scan = await this.prisma.scan.findUnique({
      where: { id: scanId },
      include: {
        website: true,
        vulnerabilities: true,
      },
    });

    if (!scan) {
      throw new NotFoundException('Scan record not found');
    }

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4',
        layout: 'portrait',
        info: {
          Title: `Security Audit Report - ${scan.website?.domain || 'N/A'}`,
          Author: 'ScanLens Security Platform',
          Subject: 'Security Audit Report',
          Keywords: 'security, audit, scan, vulnerabilities',
          Creator: 'ScanLens',
        },
      });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const targetDomain = this.extractDomain(scan.website?.url);
      const now = new Date();

      // ============================================================
      // ✅ 1. Header مع شعار
      // ============================================================
      // شريط علوي ملون
      doc.rect(0, 0, 612, 40).fillColor('#0ea5e9').fill();

      doc
        .fontSize(20)
        .fillColor('#ffffff')
        .font('Helvetica-Bold')
        .text('🔒 ScanLens', 50, 10, { align: 'left' });

      doc
        .fontSize(10)
        .fillColor('#e0f2fe')
        .font('Helvetica')
        .text('Security Audit Report', 400, 12, { align: 'right' });

      doc
        .fontSize(8)
        .fillColor('#e0f2fe')
        .text(`Generated: ${now.toLocaleString()}`, 400, 26, {
          align: 'right',
        });

      doc.moveDown(2);

      // ============================================================
      // ✅ 2. العنوان الرئيسي
      // ============================================================
      doc
        .fontSize(26)
        .fillColor('#0f172a')
        .font('Helvetica-Bold')
        .text('Security Audit Report', { align: 'center' });

      doc
        .fontSize(14)
        .fillColor('#475569')
        .font('Helvetica')
        .text(`Domain: ${targetDomain}`, { align: 'center' });

      doc.moveDown(1);

      // ============================================================
      // ✅ 3. خط فاصل مزخرف
      // ============================================================
      doc
        .moveTo(50, doc.y)
        .lineTo(550, doc.y)
        .strokeColor('#0ea5e9')
        .lineWidth(2)
        .stroke();

      doc
        .moveTo(50, doc.y + 2)
        .lineTo(550, doc.y + 2)
        .strokeColor('#e2e8f0')
        .lineWidth(1)
        .stroke();

      doc.moveDown(1);

      // ============================================================
      // ✅ 4. بطاقة Score
      // ============================================================
      const scoreColor =
        scan.score >= 80 ? '#10b981' : scan.score >= 50 ? '#f59e0b' : '#f43f5e';
      const scoreBg =
        scan.score >= 80 ? '#d1fae5' : scan.score >= 50 ? '#fef3c7' : '#fecaca';

      // خلفية البطاقة
      doc.roundedRect(50, doc.y, 500, 80, 8).fillAndStroke(scoreBg, '#e2e8f0');

      doc
        .fontSize(14)
        .fillColor('#1e293b')
        .font('Helvetica-Bold')
        .text('Overall Security Score', 70, doc.y + 20);

      doc
        .fontSize(42)
        .fillColor(scoreColor)
        .font('Helvetica-Bold')
        .text(`${scan.score} / 100`, 400, doc.y + 10, { align: 'right' });

      // شريط التقدم
      const barY = doc.y + 60;
      const barWidth = (scan.score / 100) * 400;
      doc.rect(70, barY, 400, 8).fillColor('#e2e8f0').fill();
      doc.rect(70, barY, barWidth, 8).fillColor(scoreColor).fill();

      doc.y = doc.y + 100;
      doc.moveDown(1);

      // ============================================================
      // ✅ 5. المعلومات الأساسية (بطاقة)
      // ============================================================
      doc
        .roundedRect(50, doc.y, 500, 120, 8)
        .fillAndStroke('#f8fafc', '#e2e8f0');

      doc
        .fontSize(12)
        .fillColor('#0f172a')
        .font('Helvetica-Bold')
        .text('📋 Report Information', 70, doc.y + 15);

      const infoData = [
        { label: 'Target Domain', value: targetDomain },
        { label: 'Target URL', value: scan.website?.url || 'N/A' },
        {
          label: 'Scan Date',
          value:
            scan.completedAt?.toLocaleString('en-US', {
              dateStyle: 'full',
              timeStyle: 'short',
            }) || now.toLocaleString(),
        },
        { label: 'Status', value: scan.status },
        { label: 'Scan ID', value: scan.id.slice(0, 12) },
        {
          label: 'Report ID',
          value: `SL-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${scan.id.slice(0, 4)}`,
        },
      ];

      let yPos = doc.y + 40;
      infoData.forEach(({ label, value }) => {
        doc
          .fontSize(9)
          .fillColor('#64748b')
          .font('Helvetica-Bold')
          .text(label, 70, yPos, { width: 100 });

        doc
          .fontSize(9)
          .fillColor('#0f172a')
          .font('Helvetica')
          .text(value, 180, yPos, { width: 350 });

        yPos += 18;
      });

      doc.y = yPos + 20;
      doc.moveDown(1);

      // ============================================================
      // ✅ 6. قسم الثغرات (مع تصميم محسن)
      // ============================================================
      doc
        .fontSize(16)
        .fillColor('#0f172a')
        .font('Helvetica-Bold')
        .text('🛡️ Vulnerabilities Detected', { underline: true });

      doc.moveDown(0.5);

      const vulnerabilities = scan.vulnerabilities || [];

      if (vulnerabilities.length === 0) {
        doc
          .fontSize(12)
          .fillColor('#10b981')
          .font('Helvetica-Bold')
          .text('✅ No vulnerabilities detected! Your website is secure.', {
            align: 'center',
          });
      } else {
        // إحصائيات سريعة
        const critical = vulnerabilities.filter(
          (v) => v.severity === 'CRITICAL',
        ).length;
        const high = vulnerabilities.filter(
          (v) => v.severity === 'HIGH',
        ).length;
        const medium = vulnerabilities.filter(
          (v) => v.severity === 'MEDIUM',
        ).length;
        const low = vulnerabilities.filter((v) => v.severity === 'LOW').length;

        doc
          .fontSize(9)
          .fillColor('#475569')
          .font('Helvetica')
          .text(`Total: ${vulnerabilities.length} vulnerabilities found`, {
            continued: true,
          });

        if (critical > 0) {
          doc
            .fillColor('#f43f5e')
            .text(` | 🔴 Critical: ${critical}`, { continued: true });
        }
        if (high > 0) {
          doc
            .fillColor('#f97316')
            .text(` | 🟠 High: ${high}`, { continued: true });
        }
        if (medium > 0) {
          doc
            .fillColor('#f59e0b')
            .text(` | 🟡 Medium: ${medium}`, { continued: true });
        }
        if (low > 0) {
          doc
            .fillColor('#3b82f6')
            .text(` | 🔵 Low: ${low}`, { continued: true });
        }

        doc.moveDown(0.5);

        // عرض الثغرات
        vulnerabilities.forEach((v, index) => {
          const severityColor =
            v.severity === 'CRITICAL' || v.severity === 'HIGH'
              ? '#f43f5e'
              : v.severity === 'MEDIUM'
                ? '#f59e0b'
                : '#3b82f6';

          const bgColor =
            v.severity === 'CRITICAL' || v.severity === 'HIGH'
              ? '#fef2f2'
              : v.severity === 'MEDIUM'
                ? '#fffbeb'
                : '#eff6ff';

          // بطاقة الثغرة
          doc
            .roundedRect(
              50,
              doc.y,
              500,
              50 + (v.description?.length > 60 ? 15 : 0),
              6,
            )
            .fillAndStroke(bgColor, '#e2e8f0');

          // الرقم
          doc
            .fontSize(10)
            .fillColor('#94a3b8')
            .font('Helvetica')
            .text(`${index + 1}`, 65, doc.y + 8);

          // العنوان والخطورة
          doc
            .fontSize(11)
            .fillColor('#0f172a')
            .font('Helvetica-Bold')
            .text(v.title, 85, doc.y + 5, { width: 300 });

          doc
            .fontSize(8)
            .fillColor(severityColor)
            .font('Helvetica-Bold')
            .text(v.severity, 420, doc.y + 7, { align: 'right' });

          // الوصف
          doc
            .fontSize(9)
            .fillColor('#475569')
            .font('Helvetica')
            .text(v.description || 'No description available', 85, doc.y + 25, {
              width: 450,
            });

          // الإصلاح (إذا وجد)
          if (v.remediation) {
            doc
              .fontSize(8)
              .fillColor('#10b981')
              .font('Helvetica')
              .text(`✅ Fix: ${v.remediation}`, 85, doc.y + 45, {
                width: 450,
              });
          }

          doc.y += 55 + (v.description?.length > 60 ? 15 : 0);
          doc.moveDown(0.5);
        });
      }

      doc.moveDown();

      // ============================================================
      // ✅ 7. تفاصيل Headers
      // ============================================================
      const headerVulns = vulnerabilities.filter((v) =>
        v.title.startsWith('Missing Security Header:'),
      );
      const missingHeaders = headerVulns.map((v) =>
        v.title.replace('Missing Security Header: ', ''),
      );

      const standardHeaders = [
        'strict-transport-security',
        'content-security-policy',
        'x-frame-options',
        'x-content-type-options',
        'referrer-policy',
        'permissions-policy',
      ];

      const presentHeaders = standardHeaders.filter(
        (h) => !missingHeaders.includes(h),
      );

      doc
        .fontSize(14)
        .fillColor('#0f172a')
        .font('Helvetica-Bold')
        .text('📋 Security Headers Analysis', { underline: true });

      doc.moveDown(0.5);

      // بطاقة headers
      doc
        .roundedRect(50, doc.y, 500, 100, 8)
        .fillAndStroke('#f8fafc', '#e2e8f0');

      doc
        .fontSize(10)
        .fillColor('#10b981')
        .font('Helvetica-Bold')
        .text(
          `✅ Present (${presentHeaders.length}/${standardHeaders.length})`,
          70,
          doc.y + 15,
        );

      if (presentHeaders.length > 0) {
        doc
          .fontSize(9)
          .fillColor('#334155')
          .font('Helvetica')
          .text(presentHeaders.join(' • '), 85, doc.y + 35, { width: 430 });
      } else {
        doc
          .fontSize(9)
          .fillColor('#94a3b8')
          .font('Helvetica')
          .text('No security headers detected', 85, doc.y + 35);
      }

      doc
        .fontSize(10)
        .fillColor('#f43f5e')
        .font('Helvetica-Bold')
        .text(
          `❌ Missing (${missingHeaders.length}/${standardHeaders.length})`,
          70,
          doc.y + 55,
        );

      if (missingHeaders.length > 0) {
        doc
          .fontSize(9)
          .fillColor('#334155')
          .font('Helvetica')
          .text(missingHeaders.join(' • '), 85, doc.y + 75, { width: 430 });
      } else {
        doc
          .fontSize(9)
          .fillColor('#10b981')
          .font('Helvetica-Bold')
          .text('✅ All security headers are present!', 85, doc.y + 75);
      }

      doc.y += 120;
      doc.moveDown();

      // ============================================================
      // ✅ 8. تذييل الصفحة
      // ============================================================
      // خط فاصل
      doc
        .moveTo(50, 750)
        .lineTo(550, 750)
        .strokeColor('#e2e8f0')
        .lineWidth(1)
        .stroke();

      // الشعار الصغير
      doc
        .fontSize(10)
        .fillColor('#0ea5e9')
        .font('Helvetica-Bold')
        .text('🔒 ScanLens', 50, 760);

      doc
        .fontSize(8)
        .fillColor('#94a3b8')
        .font('Helvetica')
        .text(
          'This report was generated automatically by ScanLens Security Engine.',
          150,
          762,
          { align: 'center' },
        );

      doc
        .fontSize(7)
        .fillColor('#cbd5e1')
        .text(
          `© ${now.getFullYear()} ScanLens. All rights reserved. | Report ID: SL-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${scan.id.slice(0, 4)}`,
          50,
          778,
          { align: 'center' },
        );

      // رقم الصفحة
      const pageCount = doc.bufferedPageRange().count;
      if (pageCount > 0) {
        doc
          .fontSize(7)
          .fillColor('#94a3b8')
          .text(`Page ${pageCount}`, 550, 760, { align: 'right' });
      }

      doc.end();
    });
  }

  // ✅ 2. توليد CSV محسّن مع تنسيق احترافي
  async generateCsvExport(userId: string): Promise<string> {
    const scans = await this.prisma.scan.findMany({
      where: { website: { userId } },
      include: {
        website: true,
        vulnerabilities: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (scans.length === 0) {
      return 'No scan history available';
    }

    // ✅ تحويل البيانات إلى CSV
    const data = scans.map((s) => {
      const headerVulns = s.vulnerabilities.filter((v) =>
        v.title.startsWith('Missing Security Header:'),
      );
      const missingHeaders = headerVulns.map((v) =>
        v.title.replace('Missing Security Header: ', ''),
      );

      const standardHeaders = [
        'strict-transport-security',
        'content-security-policy',
        'x-frame-options',
        'x-content-type-options',
        'referrer-policy',
        'permissions-policy',
      ];

      const presentHeaders = standardHeaders.filter(
        (h) => !missingHeaders.includes(h),
      );

      // تصنيف الثغرات حسب الخطورة
      const critical = s.vulnerabilities.filter(
        (v) => v.severity === 'CRITICAL',
      ).length;
      const high = s.vulnerabilities.filter(
        (v) => v.severity === 'HIGH',
      ).length;
      const medium = s.vulnerabilities.filter(
        (v) => v.severity === 'MEDIUM',
      ).length;
      const low = s.vulnerabilities.filter((v) => v.severity === 'LOW').length;

      return {
        'Scan ID': s.id.slice(0, 8),
        Domain: this.extractDomain(s.website?.url),
        URL: s.website?.url || 'N/A',
        Score: s.score,
        Status: s.status,
        Date: new Date(s.createdAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
        Time: new Date(s.createdAt).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        'Present Headers': presentHeaders.join('; '),
        'Missing Headers': missingHeaders.join('; '),
        'Total Vulnerabilities': s.vulnerabilities.length,
        Critical: critical,
        High: high,
        Medium: medium,
        Low: low,
        'Vulnerabilities List': s.vulnerabilities
          .map((v) => `${v.title} [${v.severity}]`)
          .join('; '),
      };
    });

    // ✅ استخدام json2csv مع options
    const json2csvParser = new Parser({
      fields: [
        'Scan ID',
        'Domain',
        'URL',
        'Score',
        'Status',
        'Date',
        'Time',
        'Present Headers',
        'Missing Headers',
        'Total Vulnerabilities',
        'Critical',
        'High',
        'Medium',
        'Low',
        'Vulnerabilities List',
      ],
    });

    return json2csvParser.parse(data);
  }

  // ✅ 3. توليد CSV لفحص واحد
  async generateSingleScanCsv(scanId: string): Promise<string> {
    const scan = await this.prisma.scan.findUnique({
      where: { id: scanId },
      include: {
        website: true,
        vulnerabilities: true,
      },
    });

    if (!scan) {
      throw new NotFoundException('Scan record not found');
    }

    const headerVulns = scan.vulnerabilities.filter((v) =>
      v.title.startsWith('Missing Security Header:'),
    );
    const missingHeaders = headerVulns.map((v) =>
      v.title.replace('Missing Security Header: ', ''),
    );

    const standardHeaders = [
      'strict-transport-security',
      'content-security-policy',
      'x-frame-options',
      'x-content-type-options',
      'referrer-policy',
      'permissions-policy',
    ];

    const presentHeaders = standardHeaders.filter(
      (h) => !missingHeaders.includes(h),
    );

    const critical = scan.vulnerabilities.filter(
      (v) => v.severity === 'CRITICAL',
    ).length;
    const high = scan.vulnerabilities.filter(
      (v) => v.severity === 'HIGH',
    ).length;
    const medium = scan.vulnerabilities.filter(
      (v) => v.severity === 'MEDIUM',
    ).length;
    const low = scan.vulnerabilities.filter((v) => v.severity === 'LOW').length;

    const data = [
      {
        'Scan ID': scan.id.slice(0, 8),
        Domain: this.extractDomain(scan.website?.url),
        URL: scan.website?.url || 'N/A',
        Score: scan.score,
        Status: scan.status,
        Date: new Date(scan.createdAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
        Time: new Date(scan.createdAt).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        'Present Headers': presentHeaders.join('; '),
        'Missing Headers': missingHeaders.join('; '),
        'Total Vulnerabilities': scan.vulnerabilities.length,
        Critical: critical,
        High: high,
        Medium: medium,
        Low: low,
        Vulnerabilities: scan.vulnerabilities
          .map((v) => `${v.title} [${v.severity}]`)
          .join('; '),
      },
    ];

    const json2csvParser = new Parser();
    return json2csvParser.parse(data);
  }
}
