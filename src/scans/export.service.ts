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

  // ✅ 1. توليد تقرير PDF محسّن
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
      });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const targetDomain = this.extractDomain(scan.website?.url);

      // ============================================================
      // ✅ 1. Header
      // ============================================================
      doc
        .fontSize(24)
        .fillColor('#0ea5e9')
        .text('🔒 ScanLens', { align: 'center' });
      doc
        .fontSize(16)
        .fillColor('#1e293b')
        .text('Security Audit Report', { align: 'center' });
      doc.moveDown();

      // ============================================================
      // ✅ 2. Line Separator
      // ============================================================
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke('#e2e8f0');
      doc.moveDown(0.5);

      // ============================================================
      // ✅ 3. المعلومات الأساسية
      // ============================================================
      doc.fontSize(12).fillColor('#334155');

      // جدول بسيط للمعلومات
      const infoData = [
        ['Target Domain', targetDomain],
        ['Target URL', scan.website?.url || 'N/A'],
        [
          'Scan Date',
          scan.completedAt?.toLocaleString('en-US', {
            dateStyle: 'full',
            timeStyle: 'short',
          }) || new Date().toLocaleString(),
        ],
        ['Status', scan.status],
        ['Scan ID', scan.id.slice(0, 12)],
      ];

      let yPosition = doc.y;
      const leftCol = 60;
      const rightCol = 250;

      infoData.forEach(([label, value]) => {
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor('#64748b')
          .text(`${label}:`, leftCol, yPosition, { width: 150 });

        doc
          .font('Helvetica')
          .fillColor('#0f172a')
          .text(value, rightCol, yPosition, { width: 250 });

        yPosition += 25;
      });

      doc.y = yPosition + 10;
      doc.moveDown();

      // ============================================================
      // ✅ 4. Score Box
      // ============================================================
      const scoreColor =
        scan.score >= 80 ? '#10b981' : scan.score >= 50 ? '#f59e0b' : '#f43f5e';

      const scoreBoxY = doc.y;
      doc.rect(50, scoreBoxY, 500, 70).fillAndStroke('#f8fafc', '#e2e8f0');

      doc
        .fontSize(14)
        .fillColor('#1e293b')
        .text('Overall Security Score', 70, scoreBoxY + 15);

      doc
        .fontSize(32)
        .fillColor(scoreColor)
        .text(`${scan.score} / 100`, 380, scoreBoxY + 10, { align: 'right' });

      doc.y = scoreBoxY + 70;
      doc.moveDown(2);

      // ============================================================
      // ✅ 5. Vulnerabilities Section
      // ============================================================
      doc
        .fontSize(14)
        .fillColor('#0f172a')
        .text('🛡️ Vulnerabilities Detected', { underline: true });
      doc.moveDown(0.5);

      const vulnerabilities = scan.vulnerabilities || [];

      if (vulnerabilities.length === 0) {
        doc
          .fontSize(11)
          .fillColor('#10b981')
          .text('✅ No vulnerabilities detected!');
      } else {
        vulnerabilities.forEach((v, index) => {
          const severityColor =
            v.severity === 'CRITICAL' || v.severity === 'HIGH'
              ? '#f43f5e'
              : v.severity === 'MEDIUM'
                ? '#f59e0b'
                : '#3b82f6';

          doc
            .fontSize(10)
            .fillColor('#1e293b')
            .text(`${index + 1}. ${v.title}`, { continued: true });

          doc
            .fontSize(9)
            .fillColor(severityColor)
            .text(` [${v.severity}]`, { align: 'right' });

          doc
            .fontSize(9)
            .fillColor('#475569')
            .text(v.description || 'No description available', { indent: 15 });

          doc.moveDown(0.5);
        });
      }

      doc.moveDown();

      // ============================================================
      // ✅ 6. Headers Analysis
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

      doc.fontSize(14).fillColor('#0f172a').text('📋 Security Headers');
      doc.moveDown(0.5);

      // Present Headers
      doc
        .fontSize(10)
        .fillColor('#10b981')
        .text(`✅ Present (${presentHeaders.length}):`);

      if (presentHeaders.length > 0) {
        doc
          .fontSize(9)
          .fillColor('#334155')
          .text(presentHeaders.join(', '), { indent: 15 });
      } else {
        doc.fontSize(9).fillColor('#94a3b8').text('None', { indent: 15 });
      }

      doc.moveDown(0.5);

      // Missing Headers
      doc
        .fontSize(10)
        .fillColor('#f43f5e')
        .text(`❌ Missing (${missingHeaders.length}):`);

      if (missingHeaders.length > 0) {
        doc
          .fontSize(9)
          .fillColor('#334155')
          .text(missingHeaders.join(', '), { indent: 15 });
      } else {
        doc
          .fontSize(9)
          .fillColor('#94a3b8')
          .text('None - All security headers are present!', { indent: 15 });
      }

      doc.moveDown();

      // ============================================================
      // ✅ 7. Footer
      // ============================================================
      doc.moveTo(50, 750).lineTo(550, 750).stroke('#e2e8f0');

      doc
        .fontSize(8)
        .fillColor('#94a3b8')
        .text(
          'This report was generated automatically by ScanLens Security Engine.',
          50,
          765,
          { align: 'center' },
        );
      doc
        .fontSize(8)
        .fillColor('#94a3b8')
        .text(
          `© ${new Date().getFullYear()} ScanLens. All rights reserved.`,
          50,
          780,
          { align: 'center' },
        );

      doc.end();
    });
  }

  // ✅ 2. توليد CSV محسّن
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
        'Vulnerabilities Count': s.vulnerabilities.length,
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
        'Vulnerabilities Count',
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
        'Vulnerabilities Count': scan.vulnerabilities.length,
        Vulnerabilities: scan.vulnerabilities
          .map((v) => `${v.title} [${v.severity}]`)
          .join('; '),
      },
    ];

    const json2csvParser = new Parser();
    return json2csvParser.parse(data);
  }
}
