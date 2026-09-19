// server/src/scans/export.service.ts

import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import PDFDocument from 'pdfkit';
import { Parser } from 'json2csv';

// ============================================================
// ✅ 1. Theme مركزي — الألوان، الأبعاد، الخطوط
// ============================================================

const THEME = {
  colors: {
    primary: '#0ea5e9',
    primaryDark: '#0284c7',
    primaryLight: '#e0f2fe',

    success: '#10b981',
    successBg: '#d1fae5',
    warning: '#f59e0b',
    warningBg: '#fef3c7',
    danger: '#f43f5e',
    dangerBg: '#fecaca',
    info: '#3b82f6',
    infoBg: '#eff6ff',
    neutral: '#64748b',
    neutralBg: '#f8fafc',

    textPrimary: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#94a3b8',

    white: '#ffffff',
    border: '#e2e8f0',
    pageBg: '#f8fafc',
  },

  fonts: {
    family: 'Helvetica',
    bold: 'Helvetica-Bold',
    italic: 'Helvetica-Oblique',
    sizes: {
      h1: 26,
      h2: 18,
      h3: 14,
      body: 10,
      small: 9,
      tiny: 8,
      micro: 7,
    },
  },

  layout: {
    pageWidth: 595.28,
    pageHeight: 841.89,
    margin: 50,
    contentWidth: 495.28,
    headerHeight: 45,
    footerHeight: 30,
    cardRadius: 8,
    spacing: {
      xs: 4,
      sm: 8,
      md: 15,
      lg: 25,
      xl: 40,
    },
  },

  standardHeaders: [
    'strict-transport-security',
    'content-security-policy',
    'x-frame-options',
    'x-content-type-options',
    'referrer-policy',
    'permissions-policy',
  ],
} as const;

// ============================================================
// ✅ 2. Types
// ============================================================

interface SeverityStyle {
  color: string;
  bg: string;
  label: string;
  icon: string;
}

interface ScanWithRelations {
  id: string;
  score: number;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
  website: { url: string; domain: string | null } | null;
  vulnerabilities: Array<{
    id: string;
    title: string;
    severity: string;
    description: string;
    remediation: string | null;
  }>;
}

// ============================================================
// ✅ 2.1. محتوى تفسيري — Severity + Headers Knowledge Base
//
// هذا القسم هو ما يحوّل التقرير من "قائمة نتائج" إلى تقرير
// مفهوم لأي شخص غير تقني: كل عنصر فيه شرح "ليش هذا مهم؟"
// ============================================================

const SEVERITY_INFO: Record<string, { whatItMeans: string; urgency: string }> =
  {
    CRITICAL: {
      whatItMeans:
        'A flaw that could let an attacker fully compromise the site or its data with little effort (e.g. take over accounts, read/alter the database, run arbitrary code).',
      urgency: 'Fix immediately — treat as a production incident.',
    },
    HIGH: {
      whatItMeans:
        'A serious weakness that meaningfully increases the chance of a breach, data leak, or service disruption, though it may need specific conditions to exploit.',
      urgency: 'Fix within days, before the next release if possible.',
    },
    MEDIUM: {
      whatItMeans:
        'A weakness that on its own is unlikely to cause major damage, but can be combined with other issues to escalate an attack.',
      urgency: 'Schedule a fix in the current or next sprint.',
    },
    LOW: {
      whatItMeans:
        'A minor issue or deviation from best practice with limited real-world impact by itself.',
      urgency: 'Fix opportunistically or during regular maintenance.',
    },
    INFO: {
      whatItMeans:
        'Not a vulnerability — an observation worth knowing about your configuration or setup.',
      urgency: 'No action required; informational only.',
    },
  };

const HEADER_INFO: Record<string, { purpose: string; riskIfMissing: string }> =
  {
    'strict-transport-security': {
      purpose:
        'Tells browsers to always use HTTPS for this domain, even if a user types "http://" or clicks an old link.',
      riskIfMissing:
        'Visitors can be silently downgraded to plain HTTP and their traffic intercepted (a "man-in-the-middle" attack).',
    },
    'content-security-policy': {
      purpose:
        'Restricts which sources of scripts, styles, and other resources the browser is allowed to load for this page.',
      riskIfMissing:
        'Makes the site far more vulnerable to Cross-Site Scripting (XSS) — malicious scripts injected by an attacker can run freely.',
    },
    'x-frame-options': {
      purpose:
        'Controls whether the page can be embedded inside a frame on another site.',
      riskIfMissing:
        'Opens the door to "clickjacking," where an attacker overlays invisible buttons to trick users into unintended actions.',
    },
    'x-content-type-options': {
      purpose:
        'Stops the browser from guessing ("sniffing") a file\'s type and prevents it from executing a file as something it is not.',
      riskIfMissing:
        'Attackers can trick the browser into treating an uploaded file (e.g. an image) as executable script.',
    },
    'referrer-policy': {
      purpose:
        "Controls how much of the current page's URL is shared with other sites when a user clicks a link away from it.",
      riskIfMissing:
        'Sensitive information embedded in URLs (tokens, internal paths, search terms) can leak to third-party sites.',
    },
    'permissions-policy': {
      purpose:
        'Lets the site explicitly allow or block browser features (camera, microphone, geolocation, etc.) for itself and any embedded content.',
      riskIfMissing:
        "Embedded third-party content could request access to sensitive device features without the site owner's intent.",
    },
  };

// ============================================================
// ✅ 3. Service
// ============================================================

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(private prisma: PrismaService) {}

  // ============================================================
  // ✅ 3.1. Helpers — مساعدة
  // ============================================================

  private extractDomain(url?: string | null): string {
    if (!url) return 'N/A';
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  private formatDate(date: Date | string | null): string {
    if (!date) return 'N/A';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
    });
  }

  private generateReportId(scanId: string): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `SL-${y}-${m}-${d}-${scanId.slice(0, 6).toUpperCase()}`;
  }

  private getSeverityStyle(severity: string): SeverityStyle {
    const map: Record<string, SeverityStyle> = {
      CRITICAL: {
        color: THEME.colors.danger,
        bg: '#fef2f2',
        label: 'CRITICAL',
        icon: '🔴',
      },
      HIGH: { color: '#f97316', bg: '#fff7ed', label: 'HIGH', icon: '🟠' },
      MEDIUM: {
        color: THEME.colors.warning,
        bg: THEME.colors.warningBg,
        label: 'MEDIUM',
        icon: '🟡',
      },
      LOW: {
        color: THEME.colors.info,
        bg: THEME.colors.infoBg,
        label: 'LOW',
        icon: '🔵',
      },
      INFO: {
        color: THEME.colors.neutral,
        bg: '#f1f5f9',
        label: 'INFO',
        icon: '⚪',
      },
    };
    return map[severity] || map.INFO;
  }

  private getSeverityInfo(severity: string) {
    return SEVERITY_INFO[severity] || SEVERITY_INFO.INFO;
  }

  private getHeaderInfo(headerKey: string) {
    return (
      HEADER_INFO[headerKey] || {
        purpose: 'Security-related HTTP response header.',
        riskIfMissing:
          "May reduce the browser's ability to protect users of this site.",
      }
    );
  }

  private getScoreStyle(score: number) {
    if (score >= 80)
      return {
        color: THEME.colors.success,
        bg: THEME.colors.successBg,
        label: 'Excellent',
      };
    if (score >= 60)
      return {
        color: THEME.colors.warning,
        bg: THEME.colors.warningBg,
        label: 'Fair',
      };
    if (score >= 40) return { color: '#f97316', bg: '#fff7ed', label: 'Poor' };
    return {
      color: THEME.colors.danger,
      bg: THEME.colors.dangerBg,
      label: 'Critical',
    };
  }

  /**
   * جملة توضح للقارئ غير التقني ماذا تعني الدرجة الحالية عملياً
   */
  private getScoreExplanation(score: number): string {
    if (score >= 80) {
      return 'Your site follows most current security best practices. Keep monitoring and re-scan after major changes.';
    }
    if (score >= 60) {
      return 'Your site is reasonably protected but has gaps that a motivated attacker could exploit. Addressing the issues below is recommended soon.';
    }
    if (score >= 40) {
      return 'Your site has several notable weaknesses. Real-world attackers actively scan for exactly these kinds of issues — prioritize fixes.';
    }
    return 'Your site is exposed to significant risk. One or more issues below could lead to a serious breach — treat this as urgent.';
  }

  private analyzeHeaders(vulnerabilities: Array<{ title: string }>) {
    const missingHeaders = vulnerabilities
      .filter((v) => v.title.startsWith('Missing Security Header:'))
      .map((v) => v.title.replace('Missing Security Header: ', '').trim());

    const presentHeaders = THEME.standardHeaders.filter(
      (h) => !missingHeaders.includes(h),
    );

    return { presentHeaders, missingHeaders };
  }

  private countBySeverity(vulnerabilities: Array<{ severity: string }>) {
    return {
      critical: vulnerabilities.filter((v) => v.severity === 'CRITICAL').length,
      high: vulnerabilities.filter((v) => v.severity === 'HIGH').length,
      medium: vulnerabilities.filter((v) => v.severity === 'MEDIUM').length,
      low: vulnerabilities.filter((v) => v.severity === 'LOW').length,
      total: vulnerabilities.length,
    };
  }

  // ============================================================
  // ✅ 3.2. PDF Drawing Helpers — رسم عناصر PDF
  // ============================================================

  private drawHeader(doc: PDFKit.PDFDocument, reportId: string) {
    const { pageWidth, margin } = THEME.layout;
    const { colors, fonts } = THEME;

    doc
      .rect(0, 0, pageWidth, THEME.layout.headerHeight)
      .fillColor(colors.primary)
      .fill();

    doc
      .fontSize(16)
      .fillColor(colors.white)
      .font(fonts.bold)
      .text('🔒 ScanLens', margin, 12);

    doc
      .fontSize(fonts.sizes.tiny)
      .fillColor(colors.primaryLight)
      .font(fonts.family)
      .text('Security Audit Report', margin, 30);

    doc
      .fontSize(fonts.sizes.tiny)
      .fillColor(colors.primaryLight)
      .font(fonts.family)
      .text(reportId, margin, 20, {
        width: THEME.layout.contentWidth,
        align: 'right',
      });

    doc.y = THEME.layout.headerHeight + 15;
  }

  private drawFooter(
    doc: PDFKit.PDFDocument,
    reportId: string,
    pageNumber: number,
  ) {
    const { pageWidth, pageHeight, margin, contentWidth } = THEME.layout;
    const { colors, fonts } = THEME;
    const footerY = pageHeight - 40;

    doc
      .moveTo(margin, footerY - 5)
      .lineTo(pageWidth - margin, footerY - 5)
      .strokeColor(colors.border)
      .lineWidth(1)
      .stroke();

    doc
      .fontSize(fonts.sizes.micro)
      .fillColor(colors.textMuted)
      .font(fonts.family)
      .text(
        `© ${new Date().getFullYear()} ScanLens | ${reportId}`,
        margin,
        footerY,
        {
          width: contentWidth / 2,
          align: 'left',
        },
      );

    doc
      .fontSize(fonts.sizes.micro)
      .fillColor(colors.textMuted)
      .text(`Page ${pageNumber}`, margin, footerY, {
        width: contentWidth,
        align: 'right',
      });
  }

  private addNewPage(doc: PDFKit.PDFDocument, reportId: string): number {
    doc.addPage({ size: 'A4', layout: 'portrait' });
    const pageNum = doc.bufferedPageRange().count;
    this.drawHeader(doc, reportId);
    return pageNum;
  }

  private ensureSpace(
    doc: PDFKit.PDFDocument,
    reportId: string,
    neededHeight: number,
  ) {
    const footerY = THEME.layout.pageHeight - 50;
    if (doc.y + neededHeight > footerY) {
      this.addNewPage(doc, reportId);
    }
  }

  private drawSectionTitle(
    doc: PDFKit.PDFDocument,
    title: string,
    icon: string = '',
  ) {
    const { colors, fonts } = THEME;
    doc
      .moveDown(0.5)
      .fontSize(fonts.sizes.h3)
      .fillColor(colors.textPrimary)
      .font(fonts.bold)
      .text(`${icon} ${title}`.trim());

    const lineY = doc.y + 3;
    doc
      .moveTo(THEME.layout.margin, lineY)
      .lineTo(THEME.layout.margin + 50, lineY)
      .strokeColor(colors.primary)
      .lineWidth(2)
      .stroke();

    doc.moveDown(0.8);
  }

  /**
   * فقرة نصية عادية (تستخدم للشروحات الطويلة في أقسام الـ About/Glossary)
   */
  private drawParagraph(
    doc: PDFKit.PDFDocument,
    text: string,
    opts: { italic?: boolean } = {},
  ) {
    const { colors, fonts } = THEME;
    doc
      .fontSize(fonts.sizes.small)
      .fillColor(colors.textSecondary)
      .font(opts.italic ? fonts.italic : fonts.family)
      .text(text, { width: THEME.layout.contentWidth, lineGap: 3 });
    doc.moveDown(0.5);
  }

  private drawScoreCard(doc: PDFKit.PDFDocument, score: number) {
    const { margin, contentWidth, cardRadius } = THEME.layout;
    const { colors, fonts } = THEME;
    const style = this.getScoreStyle(score);

    const cardY = doc.y;
    const cardHeight = 100;

    doc
      .roundedRect(margin, cardY, contentWidth, cardHeight, cardRadius)
      .fillAndStroke(style.bg, colors.border);

    doc
      .fontSize(fonts.sizes.h3)
      .fillColor(colors.textPrimary)
      .font(fonts.bold)
      .text('Overall Security Score', margin + 20, cardY + 20);

    doc
      .fontSize(38)
      .fillColor(style.color)
      .font(fonts.bold)
      .text(`${score}`, margin, cardY + 15, {
        width: contentWidth - 20,
        align: 'right',
      });

    doc
      .fontSize(fonts.sizes.small)
      .fillColor(colors.textSecondary)
      .font(fonts.family)
      .text('/ 100', margin, cardY + 55, {
        width: contentWidth - 20,
        align: 'right',
      });

    doc
      .fontSize(fonts.sizes.small)
      .fillColor(style.color)
      .font(fonts.bold)
      .text(style.label, margin + 20, cardY + 45);

    const barY = cardY + 78;
    const barWidth = contentWidth - 40;
    const barFill = (score / 100) * barWidth;

    doc
      .roundedRect(margin + 20, barY, barWidth, 8, 4)
      .fillColor(colors.border)
      .fill();
    doc
      .roundedRect(margin + 20, barY, barFill, 8, 4)
      .fillColor(style.color)
      .fill();

    doc.y = cardY + cardHeight + THEME.layout.spacing.md;

    // ✅ شرح مباشر تحت البطاقة — ماذا تعني هذه الدرجة عملياً؟
    doc
      .fontSize(fonts.sizes.small)
      .fillColor(colors.textSecondary)
      .font(fonts.italic)
      .text(this.getScoreExplanation(score), margin, doc.y, {
        width: contentWidth,
        lineGap: 2,
      });

    doc.moveDown(0.8);
  }

  private drawInfoCard(
    doc: PDFKit.PDFDocument,
    title: string,
    rows: Array<{ label: string; value: string }>,
  ) {
    const { margin, contentWidth, cardRadius } = THEME.layout;
    const { colors, fonts } = THEME;

    const rowHeight = 22;
    const headerHeight = 35;
    const cardHeight = headerHeight + rows.length * rowHeight + 15;
    const cardY = doc.y;

    doc
      .roundedRect(margin, cardY, contentWidth, cardHeight, cardRadius)
      .fillAndStroke(colors.neutralBg, colors.border);

    doc
      .fontSize(fonts.sizes.h3)
      .fillColor(colors.textPrimary)
      .font(fonts.bold)
      .text(title, margin + 20, cardY + 12);

    let yPos = cardY + headerHeight + 5;
    rows.forEach(({ label, value }) => {
      doc
        .fontSize(fonts.sizes.small)
        .fillColor(colors.textMuted)
        .font(fonts.bold)
        .text(label, margin + 20, yPos, { width: 130 });

      doc
        .fontSize(fonts.sizes.small)
        .fillColor(colors.textPrimary)
        .font(fonts.family)
        .text(value, margin + 160, yPos, {
          width: contentWidth - 180,
          ellipsis: true,
        });

      yPos += rowHeight;
    });

    doc.y = cardY + cardHeight + THEME.layout.spacing.md;
  }

  /**
   * رسم بطاقة ثغرة واحدة — نسخة محسّنة:
   * - ارتفاع البطاقة يُحسب بدقة عبر doc.heightOfString بدل تقدير تقريبي
   * - إضافة سطر "Why this matters" مبني على severity المعرّفة بالـ knowledge base
   */
  private drawVulnerabilityCard(
    doc: PDFKit.PDFDocument,
    index: number,
    vuln: {
      title: string;
      severity: string;
      description: string;
      remediation: string | null;
    },
    reportId: string,
  ) {
    const { margin, contentWidth, cardRadius } = THEME.layout;
    const { colors, fonts } = THEME;
    const style = this.getSeverityStyle(vuln.severity);
    const info = this.getSeverityInfo(vuln.severity);

    const padding = 15;
    const titleAreaHeight = 22;
    const textWidth = contentWidth - padding * 2;

    const description = vuln.description || 'No description available';
    const impactText = `Why this matters: ${info.whatItMeans}`;
    const remediationText = vuln.remediation ? `Fix: ${vuln.remediation}` : '';
    const urgencyText = `Recommended action: ${info.urgency}`;

    // ✅ حساب دقيق للارتفاع بناءً على المحتوى الفعلي
    doc.fontSize(fonts.sizes.small).font(fonts.family);
    const descHeight = doc.heightOfString(description, {
      width: textWidth,
      lineGap: 3,
    });
    const impactHeight = doc.heightOfString(impactText, {
      width: textWidth,
      lineGap: 3,
    });
    const urgencyHeight = doc.heightOfString(urgencyText, {
      width: textWidth,
      lineGap: 3,
    });
    const remediationHeight = remediationText
      ? doc.heightOfString(remediationText, { width: textWidth, lineGap: 3 })
      : 0;

    const blockGap = 8;
    const cardHeight =
      padding * 2 +
      titleAreaHeight +
      descHeight +
      blockGap +
      impactHeight +
      blockGap +
      urgencyHeight +
      (remediationText ? blockGap + remediationHeight : 0) +
      10;

    // ✅ التحقق من المساحة — مع إعادة رسم الـ header عند صفحة جديدة
    const footerY = THEME.layout.pageHeight - 50;
    if (doc.y + cardHeight > footerY) {
      this.addNewPage(doc, reportId);
    }

    const cardY = doc.y;

    doc
      .roundedRect(margin, cardY, contentWidth, cardHeight, cardRadius)
      .fillAndStroke(style.bg, colors.border);
    doc
      .roundedRect(margin, cardY, 4, cardHeight, 2)
      .fillColor(style.color)
      .fill();

    doc
      .fontSize(fonts.sizes.tiny)
      .fillColor(colors.textMuted)
      .font(fonts.bold)
      .text(`#${index}`, margin + padding, cardY + padding);

    doc
      .fontSize(fonts.sizes.body + 1)
      .fillColor(colors.textPrimary)
      .font(fonts.bold)
      .text(vuln.title, margin + padding + 35, cardY + padding, {
        width: contentWidth - padding * 3 - 80,
      });

    const badgeWidth = 75;
    const badgeX = margin + contentWidth - padding - badgeWidth;

    doc
      .roundedRect(badgeX, cardY + padding, badgeWidth, 18, 9)
      .fillColor(style.color)
      .fill();
    doc
      .fontSize(fonts.sizes.tiny)
      .fillColor(colors.white)
      .font(fonts.bold)
      .text(`${style.icon} ${style.label}`, badgeX, cardY + padding + 4, {
        width: badgeWidth,
        align: 'center',
      });

    // ✅ الوصف
    let cursorY = cardY + padding + titleAreaHeight + 5;
    doc
      .fontSize(fonts.sizes.small)
      .fillColor(colors.textSecondary)
      .font(fonts.family)
      .text(description, margin + padding, cursorY, {
        width: textWidth,
        lineGap: 3,
      });

    // ✅ لماذا يهم هذا (شرح الخطورة بلغة مبسطة)
    cursorY = doc.y + blockGap - 4;
    doc
      .fontSize(fonts.sizes.small)
      .fillColor(style.color)
      .font(fonts.bold)
      .text('⚠ Why this matters: ', margin + padding, cursorY, {
        continued: true,
      });
    doc
      .fillColor(colors.textSecondary)
      .font(fonts.family)
      .text(info.whatItMeans, { width: textWidth, lineGap: 3 });

    // ✅ الإجراء الموصى به (استعجالية الإصلاح)
    cursorY = doc.y + blockGap - 4;
    doc
      .fontSize(fonts.sizes.small)
      .fillColor(colors.textPrimary)
      .font(fonts.bold)
      .text('⏱ Recommended action: ', margin + padding, cursorY, {
        continued: true,
      });
    doc
      .fillColor(colors.textSecondary)
      .font(fonts.family)
      .text(info.urgency, { width: textWidth, lineGap: 3 });

    // ✅ الحل التقني (إن وُجد)
    if (vuln.remediation) {
      cursorY = doc.y + blockGap - 4;
      doc
        .fontSize(fonts.sizes.small)
        .fillColor(colors.success)
        .font(fonts.bold)
        .text('✅ Fix: ', margin + padding, cursorY, { continued: true });
      doc
        .fillColor(colors.textSecondary)
        .font(fonts.family)
        .text(vuln.remediation, { width: textWidth, lineGap: 3 });
    }

    doc.y = cardY + cardHeight + THEME.layout.spacing.sm;
  }

  /**
   * رسم بطاقة تحليل الـ Headers — نسخة محسّنة بشرح لكل هيدر
   */
  private drawHeadersCard(
    doc: PDFKit.PDFDocument,
    present: string[],
    missing: string[],
    reportId: string,
  ) {
    const { margin, contentWidth, cardRadius } = THEME.layout;
    const { colors, fonts } = THEME;
    const total = THEME.standardHeaders.length;

    const padding = 20;
    const textWidth = contentWidth - padding * 2;

    // ✅ Present — مختصر (سطر واحد)
    this.ensureSpace(doc, reportId, 40);
    const presentY = doc.y;
    doc
      .roundedRect(margin, presentY, contentWidth, 34, 6)
      .fillAndStroke(colors.successBg, colors.border);
    doc
      .fontSize(fonts.sizes.body)
      .fillColor(colors.success)
      .font(fonts.bold)
      .text(
        `✅ Present (${present.length}/${total})`,
        margin + padding,
        presentY + 8,
      );
    doc
      .fontSize(fonts.sizes.small)
      .fillColor(colors.textSecondary)
      .font(fonts.family)
      .text(
        present.length > 0 ? present.join(' • ') : 'None detected',
        margin + padding,
        presentY + 21,
        {
          width: textWidth,
          ellipsis: true,
        },
      );
    doc.y = presentY + 34 + THEME.layout.spacing.sm;

    // ✅ Missing — تفصيلي، كل هيدر بشرحه ولماذا يهم
    if (missing.length === 0) {
      this.ensureSpace(doc, reportId, 40);
      const okY = doc.y;
      doc
        .roundedRect(margin, okY, contentWidth, 34, 6)
        .fillAndStroke(colors.successBg, colors.success);
      doc
        .fontSize(fonts.sizes.small)
        .fillColor(colors.success)
        .font(fonts.bold)
        .text(
          '✅ All standard security headers are present!',
          margin,
          okY + 12,
          {
            width: contentWidth,
            align: 'center',
          },
        );
      doc.y = okY + 34 + THEME.layout.spacing.sm;
      return;
    }

    this.ensureSpace(doc, reportId, 30);
    doc
      .fontSize(fonts.sizes.body)
      .fillColor(colors.danger)
      .font(fonts.bold)
      .text(`❌ Missing (${missing.length}/${total})`, margin, doc.y);
    doc.moveDown(0.3);

    missing.forEach((headerKey) => {
      const info = this.getHeaderInfo(headerKey);
      const purposeText = `Purpose: ${info.purpose}`;
      const riskText = `Risk if missing: ${info.riskIfMissing}`;

      doc.fontSize(fonts.sizes.small).font(fonts.family);
      const purposeHeight = doc.heightOfString(purposeText, {
        width: textWidth - 15,
        lineGap: 2,
      });
      const riskHeight = doc.heightOfString(riskText, {
        width: textWidth - 15,
        lineGap: 2,
      });
      const cardHeight = 20 + purposeHeight + riskHeight + 16;

      this.ensureSpace(doc, reportId, cardHeight + 8);
      const rowY = doc.y;

      doc
        .roundedRect(margin, rowY, contentWidth, cardHeight, 6)
        .fillAndStroke(colors.dangerBg, colors.border);
      doc
        .roundedRect(margin, rowY, 3, cardHeight, 1.5)
        .fillColor(colors.danger)
        .fill();

      doc
        .fontSize(fonts.sizes.small)
        .fillColor(colors.textPrimary)
        .font(fonts.bold)
        .text(headerKey, margin + padding, rowY + 8);

      doc
        .fontSize(fonts.sizes.tiny)
        .fillColor(colors.textSecondary)
        .font(fonts.family)
        .text(purposeText, margin + padding, rowY + 21, {
          width: textWidth - 15,
          lineGap: 2,
        });

      doc
        .fontSize(fonts.sizes.tiny)
        .fillColor(colors.danger)
        .font(fonts.family)
        .text(riskText, margin + padding, doc.y + 3, {
          width: textWidth - 15,
          lineGap: 2,
        });

      doc.y = rowY + cardHeight + THEME.layout.spacing.xs;
    });

    doc.moveDown(0.4);
  }

  private drawSeveritySummary(
    doc: PDFKit.PDFDocument,
    counts: { critical: number; high: number; medium: number; low: number },
  ) {
    const { margin, contentWidth } = THEME.layout;
    const { colors, fonts } = THEME;

    const gap = 10;
    const cardWidth = (contentWidth - gap * 3) / 4;
    const cardHeight = 60;
    const cardY = doc.y;

    const items = [
      {
        label: 'Critical',
        value: counts.critical,
        style: this.getSeverityStyle('CRITICAL'),
      },
      {
        label: 'High',
        value: counts.high,
        style: this.getSeverityStyle('HIGH'),
      },
      {
        label: 'Medium',
        value: counts.medium,
        style: this.getSeverityStyle('MEDIUM'),
      },
      { label: 'Low', value: counts.low, style: this.getSeverityStyle('LOW') },
    ];

    items.forEach((item, i) => {
      const x = margin + i * (cardWidth + gap);
      doc
        .roundedRect(x, cardY, cardWidth, cardHeight, 6)
        .fillAndStroke(item.style.bg, colors.border);

      doc
        .fontSize(22)
        .fillColor(item.style.color)
        .font(fonts.bold)
        .text(`${item.value}`, x, cardY + 10, {
          width: cardWidth,
          align: 'center',
        });

      doc
        .fontSize(fonts.sizes.micro)
        .fillColor(colors.textSecondary)
        .font(fonts.family)
        .text(item.label.toUpperCase(), x, cardY + 40, {
          width: cardWidth,
          align: 'center',
        });
    });

    doc.y = cardY + cardHeight + THEME.layout.spacing.md;

    // ✅ سطر توضيحي صغير أسفل الملخص
    doc
      .fontSize(fonts.sizes.tiny)
      .fillColor(colors.textMuted)
      .font(fonts.italic)
      .text(
        'Severity reflects potential business impact and ease of exploitation — see the Glossary at the end of this report for full definitions.',
        margin,
        doc.y,
        { width: contentWidth },
      );
    doc.moveDown(0.6);
  }

  /**
   * ✅ قسم جديد: "About This Report" — يشرح للقارئ منهجية الفحص وكيف تُحسب الدرجة،
   * قبل الدخول في التفاصيل. هذا هو الفرق الأساسي بين تقرير "مفهوم" وتقرير "أرقام فقط".
   */
  private drawAboutSection(doc: PDFKit.PDFDocument, reportId: string) {
    const { colors, fonts } = THEME;

    this.ensureSpace(doc, reportId, 140);
    this.drawSectionTitle(doc, 'About This Report', 'ℹ️');

    this.drawParagraph(
      doc,
      'ScanLens performs an automated external security scan of your website: it inspects the HTTP response headers your server sends, checks for common misconfigurations, and evaluates the findings for severity and business impact. This report explains not just what was found, but why it matters and what to do about it.',
    );

    doc
      .fontSize(fonts.sizes.small)
      .fillColor(colors.textPrimary)
      .font(fonts.bold)
      .text('How the score is calculated:');
    doc.moveDown(0.2);
    doc
      .fontSize(fonts.sizes.small)
      .fillColor(colors.textSecondary)
      .font(fonts.family)
      .text(
        'Starting from 100, points are deducted for each finding based on its severity — Critical and High issues have the largest impact, Medium and Low issues a smaller one. Missing recommended security headers are scored the same way. The result is a single 0–100 number that lets you track improvement over time.',
        { width: THEME.layout.contentWidth, lineGap: 3 },
      );
    doc.moveDown(0.8);
  }

  /**
   * ✅ قسم جديد: "Glossary" — تعريف كل severity level وكل header بشكل مرجعي في نهاية التقرير
   */
  private drawGlossaryPage(doc: PDFKit.PDFDocument, reportId: string) {
    const { colors, fonts } = THEME;

    this.addNewPage(doc, reportId);
    this.drawSectionTitle(doc, 'Glossary & Reference', '📖');

    doc
      .fontSize(fonts.sizes.h3)
      .fillColor(colors.textPrimary)
      .font(fonts.bold)
      .text('Severity Levels');
    doc.moveDown(0.4);

    (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).forEach((sev) => {
      this.ensureSpace(doc, reportId, 55);
      const style = this.getSeverityStyle(sev);
      const info = this.getSeverityInfo(sev);

      doc
        .fontSize(fonts.sizes.small)
        .fillColor(style.color)
        .font(fonts.bold)
        .text(`${style.icon} ${style.label}`, THEME.layout.margin, doc.y, {
          continued: false,
        });
      doc
        .fontSize(fonts.sizes.small)
        .fillColor(colors.textSecondary)
        .font(fonts.family)
        .text(info.whatItMeans, {
          width: THEME.layout.contentWidth,
          lineGap: 2,
        });
      doc
        .fontSize(fonts.sizes.tiny)
        .fillColor(colors.textMuted)
        .font(fonts.italic)
        .text(info.urgency, { width: THEME.layout.contentWidth, lineGap: 2 });
      doc.moveDown(0.6);
    });

    this.ensureSpace(doc, reportId, 60);
    doc.moveDown(0.4);
    doc
      .fontSize(fonts.sizes.h3)
      .fillColor(colors.textPrimary)
      .font(fonts.bold)
      .text('Security Headers');
    doc.moveDown(0.4);

    THEME.standardHeaders.forEach((headerKey) => {
      const info = this.getHeaderInfo(headerKey);
      this.ensureSpace(doc, reportId, 55);
      doc
        .fontSize(fonts.sizes.small)
        .fillColor(colors.textPrimary)
        .font(fonts.bold)
        .text(headerKey);
      doc
        .fontSize(fonts.sizes.tiny)
        .fillColor(colors.textSecondary)
        .font(fonts.family)
        .text(`Purpose: ${info.purpose}`, {
          width: THEME.layout.contentWidth,
          lineGap: 2,
        });
      doc
        .fontSize(fonts.sizes.tiny)
        .fillColor(colors.textMuted)
        .font(fonts.family)
        .text(`Risk if missing: ${info.riskIfMissing}`, {
          width: THEME.layout.contentWidth,
          lineGap: 2,
        });
      doc.moveDown(0.6);
    });
  }

  private drawCoverPage(
    doc: PDFKit.PDFDocument,
    scan: ScanWithRelations,
    reportId: string,
  ) {
    const { pageWidth, contentWidth, margin } = THEME.layout;
    const { colors, fonts } = THEME;
    const domain = this.extractDomain(scan.website?.url);

    doc.rect(0, 0, pageWidth, 180).fillColor(colors.primary).fill();
    doc.rect(0, 180, pageWidth, 4).fillColor(colors.primaryDark).fill();

    doc
      .fontSize(36)
      .fillColor(colors.white)
      .font(fonts.bold)
      .text('🔒 ScanLens', 0, 60, { width: pageWidth, align: 'center' });

    doc
      .fontSize(14)
      .fillColor(colors.primaryLight)
      .font(fonts.family)
      .text('Security Audit Report', 0, 110, {
        width: pageWidth,
        align: 'center',
      });

    doc.y = 240;

    doc
      .fontSize(fonts.sizes.h1)
      .fillColor(colors.textPrimary)
      .font(fonts.bold)
      .text('Security Assessment Report', 0, doc.y, {
        width: pageWidth,
        align: 'center',
      });

    doc.moveDown(0.5);

    doc
      .fontSize(16)
      .fillColor(colors.primary)
      .font(fonts.bold)
      .text(domain, 0, doc.y, { width: pageWidth, align: 'center' });

    doc.moveDown(2);

    const scoreStyle = this.getScoreStyle(scan.score);
    const cardWidth = 280;
    const cardHeight = 160;
    const cardX = (pageWidth - cardWidth) / 2;
    const cardY = doc.y;

    doc
      .roundedRect(cardX, cardY, cardWidth, cardHeight, 16)
      .fillAndStroke(scoreStyle.bg, scoreStyle.color);

    doc
      .fontSize(12)
      .fillColor(colors.textSecondary)
      .font(fonts.family)
      .text('Security Score', cardX, cardY + 25, {
        width: cardWidth,
        align: 'center',
      });

    doc
      .fontSize(64)
      .fillColor(scoreStyle.color)
      .font(fonts.bold)
      .text(`${scan.score}`, cardX, cardY + 45, {
        width: cardWidth,
        align: 'center',
      });

    doc
      .fontSize(14)
      .fillColor(scoreStyle.color)
      .font(fonts.bold)
      .text(scoreStyle.label, cardX, cardY + 125, {
        width: cardWidth,
        align: 'center',
      });

    doc.y = cardY + cardHeight + 40;

    const infoY = doc.y;
    const infoItems = [
      { label: 'Report ID', value: reportId },
      { label: 'Generated', value: new Date().toLocaleDateString('en-US') },
      {
        label: 'Vulnerabilities',
        value: `${scan.vulnerabilities.length} found`,
      },
    ];

    infoItems.forEach((item, i) => {
      const x = margin + i * (contentWidth / 3);
      doc
        .fontSize(fonts.sizes.micro)
        .fillColor(colors.textMuted)
        .font(fonts.family)
        .text(item.label.toUpperCase(), x, infoY, {
          width: contentWidth / 3,
          align: 'center',
        });

      doc
        .fontSize(fonts.sizes.small)
        .fillColor(colors.textPrimary)
        .font(fonts.bold)
        .text(item.value, x, infoY + 14, {
          width: contentWidth / 3,
          align: 'center',
        });
    });

    this.drawFooter(doc, reportId, 1);
  }

  // ============================================================
  // ✅ 3.3. توليد PDF
  // ============================================================

  async generatePdfReport(scanId: string): Promise<Buffer> {
    const scan = await this.prisma.scan.findUnique({
      where: { id: scanId },
      include: { website: true, vulnerabilities: true },
    });

    if (!scan) {
      throw new NotFoundException(`Scan with id "${scanId}" not found`);
    }

    this.logger.log(`📄 Generating PDF report for scan ${scanId}`);
    const reportId = this.generateReportId(scan.id);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          layout: 'portrait',
          margin: THEME.layout.margin,
          bufferPages: true,
          info: {
            Title: `Security Report - ${this.extractDomain(scan.website?.url)}`,
            Author: 'ScanLens Security Platform',
            Subject: 'Security Audit Report',
            Keywords: 'security, audit, vulnerabilities, scan',
            Creator: 'ScanLens',
            CreationDate: new Date(),
          },
        });

        const buffers: Buffer[] = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => {
          this.logger.log(`✅ PDF generated for scan ${scanId}`);
          resolve(Buffer.concat(buffers));
        });
        doc.on('error', (err) => {
          this.logger.error(`❌ PDF generation failed: ${err.message}`);
          reject(err);
        });

        // ✅ 1. Cover page
        this.drawCoverPage(doc, scan as ScanWithRelations, reportId);

        // ✅ 2. Content page
        this.addNewPage(doc, reportId);

        doc
          .fontSize(THEME.fonts.sizes.h2)
          .fillColor(THEME.colors.textPrimary)
          .font(THEME.fonts.bold)
          .text('Executive Summary');
        doc.moveDown(0.5);

        this.drawScoreCard(doc, scan.score);

        this.drawInfoCard(doc, '📋 Report Information', [
          { label: 'Domain', value: this.extractDomain(scan.website?.url) },
          { label: 'Full URL', value: scan.website?.url || 'N/A' },
          {
            label: 'Scan Date',
            value: this.formatDate(scan.completedAt || scan.createdAt),
          },
          { label: 'Status', value: scan.status },
          { label: 'Scan ID', value: scan.id },
          { label: 'Report ID', value: reportId },
        ]);

        // ✅ 3. About This Report — منهجية الفحص (جديد)
        this.drawAboutSection(doc, reportId);

        // ✅ 4. Vulnerabilities
        const vulnerabilities = scan.vulnerabilities || [];
        const counts = this.countBySeverity(vulnerabilities);

        this.ensureSpace(doc, reportId, 150);
        this.drawSectionTitle(doc, 'Vulnerabilities Detected', '🛡️');

        if (vulnerabilities.length === 0) {
          this.ensureSpace(doc, reportId, 80);
          const successY = doc.y;
          doc
            .roundedRect(
              THEME.layout.margin,
              successY,
              THEME.layout.contentWidth,
              70,
              8,
            )
            .fillAndStroke(THEME.colors.successBg, THEME.colors.success);

          doc
            .fontSize(THEME.fonts.sizes.h3)
            .fillColor(THEME.colors.success)
            .font(THEME.fonts.bold)
            .text('✅ No vulnerabilities detected!', 0, successY + 20, {
              width: THEME.layout.pageWidth,
              align: 'center',
            });

          doc
            .fontSize(THEME.fonts.sizes.small)
            .fillColor(THEME.colors.textSecondary)
            .font(THEME.fonts.family)
            .text(
              'Your website passed all security checks.',
              0,
              successY + 45,
              { width: THEME.layout.pageWidth, align: 'center' },
            );

          doc.y = successY + 70 + THEME.layout.spacing.md;
        } else {
          this.ensureSpace(doc, reportId, 80);
          this.drawSeveritySummary(doc, counts);

          vulnerabilities.forEach((vuln, index) => {
            this.drawVulnerabilityCard(doc, index + 1, vuln, reportId);
          });
        }

        // ✅ 5. Security Headers Analysis
        const { presentHeaders, missingHeaders } =
          this.analyzeHeaders(vulnerabilities);

        this.ensureSpace(doc, reportId, 180);
        this.drawSectionTitle(doc, 'Security Headers Analysis', '📋');
        this.drawHeadersCard(doc, presentHeaders, missingHeaders, reportId);

        // ✅ 6. Recommendations
        if (vulnerabilities.length > 0) {
          this.ensureSpace(doc, reportId, 120);
          this.drawSectionTitle(doc, 'Recommendations', '💡');

          const recommendations = [
            `Fix ${counts.critical + counts.high} critical/high severity issues first — they carry the greatest risk.`,
            `Add the ${missingHeaders.length} missing security header(s) listed above; most are a small server-config change.`,
            'Apply the remediation steps listed under each finding, then re-scan to confirm the fix worked.',
            'Schedule recurring scans (e.g. monthly or after each deploy) so new issues are caught early.',
          ];

          recommendations.forEach((rec, i) => {
            doc
              .fontSize(THEME.fonts.sizes.small)
              .fillColor(THEME.colors.textPrimary)
              .font(THEME.fonts.family)
              .text(`${i + 1}. ${rec}`, { indent: 15, lineGap: 4 });
          });
        }

        // ✅ 7. Glossary — صفحة مرجعية في النهاية (جديد)
        this.drawGlossaryPage(doc, reportId);

        // ✅ 8. Footers على كل الصفحات
        const pageRange = doc.bufferedPageRange();
        for (let i = 0; i < pageRange.count; i++) {
          doc.switchToPage(i);
          if (i > 0) {
            this.drawFooter(doc, reportId, i + 1);
          }
        }

        doc.end();
      } catch (err) {
        this.logger.error(`❌ PDF generation error: ${(err as Error).message}`);
        reject(err);
      }
    });
  }

  // ============================================================
  // ✅ 3.4. توليد CSV شامل — مع أعمدة تفسيرية إضافية
  // ============================================================

  async generateCsvExport(userId: string): Promise<string> {
    const scans = await this.prisma.scan.findMany({
      where: { website: { userId } },
      include: { website: true, vulnerabilities: true },
      orderBy: { createdAt: 'desc' },
    });

    if (scans.length === 0) {
      return 'No scan history available';
    }

    this.logger.log(
      `📊 Generating CSV export for user ${userId} (${scans.length} scans)`,
    );

    const data = scans.map((s) => {
      const { presentHeaders, missingHeaders } = this.analyzeHeaders(
        s.vulnerabilities,
      );
      const counts = this.countBySeverity(s.vulnerabilities);
      const scoreStyle = this.getScoreStyle(s.score);

      return {
        'Scan ID': s.id.slice(0, 8),
        Domain: this.extractDomain(s.website?.url),
        URL: s.website?.url || 'N/A',
        Score: s.score,
        'Score Rating': scoreStyle.label,
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
        'Total Vulnerabilities': counts.total,
        Critical: counts.critical,
        High: counts.high,
        Medium: counts.medium,
        Low: counts.low,
        'Vulnerabilities List': s.vulnerabilities
          .map((v) => `${v.title} [${v.severity}]`)
          .join('; '),
        'Vulnerabilities Detail': s.vulnerabilities
          .map(
            (v) =>
              `${v.title} [${v.severity}] — ${v.description}${v.remediation ? ` (Fix: ${v.remediation})` : ''}`,
          )
          .join(' || '),
      };
    });

    const parser = new Parser({
      fields: [
        'Scan ID',
        'Domain',
        'URL',
        'Score',
        'Score Rating',
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
        'Vulnerabilities Detail',
      ],
    });

    const csv = parser.parse(data);
    return '\uFEFF' + csv + '\n\n' + this.buildCsvLegend();
  }

  // ============================================================
  // ✅ 3.5. توليد CSV لفحص واحد — مع أعمدة تفسيرية إضافية
  // ============================================================

  async generateSingleScanCsv(scanId: string): Promise<string> {
    const scan = await this.prisma.scan.findUnique({
      where: { id: scanId },
      include: { website: true, vulnerabilities: true },
    });

    if (!scan) {
      throw new NotFoundException(`Scan with id "${scanId}" not found`);
    }

    const { presentHeaders, missingHeaders } = this.analyzeHeaders(
      scan.vulnerabilities,
    );
    const counts = this.countBySeverity(scan.vulnerabilities);
    const scoreStyle = this.getScoreStyle(scan.score);

    // ✅ صف واحد بملخص الفحص
    const summaryData = [
      {
        'Scan ID': scan.id.slice(0, 8),
        Domain: this.extractDomain(scan.website?.url),
        URL: scan.website?.url || 'N/A',
        Score: scan.score,
        'Score Rating': scoreStyle.label,
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
        'Total Vulnerabilities': counts.total,
        Critical: counts.critical,
        High: counts.high,
        Medium: counts.medium,
        Low: counts.low,
      },
    ];

    const summaryParser = new Parser();
    const summaryCsv = summaryParser.parse(summaryData);

    // ✅ جدول تفصيلي: صف واحد لكل ثغرة، بشرح كامل لكل واحدة
    let detailCsv = '';
    if (scan.vulnerabilities.length > 0) {
      const detailData = scan.vulnerabilities.map((v) => {
        const info = this.getSeverityInfo(v.severity);
        return {
          Title: v.title,
          Severity: v.severity,
          Description: v.description || 'N/A',
          'Why It Matters': info.whatItMeans,
          'Recommended Urgency': info.urgency,
          Remediation: v.remediation || 'N/A',
        };
      });
      const detailParser = new Parser({
        fields: [
          'Title',
          'Severity',
          'Description',
          'Why It Matters',
          'Recommended Urgency',
          'Remediation',
        ],
      });
      detailCsv =
        '\n\nVulnerability Details\n' + detailParser.parse(detailData);
    }

    return '\uFEFF' + summaryCsv + detailCsv + '\n\n' + this.buildCsvLegend();
  }

  /**
   * ✅ يبني كتلة نصية (تُلحق آخر ملف الـ CSV) تشرح مستويات الخطورة —
   * هذا يجعل الملف مفهوماً لأي شخص يفتحه في Excel/Sheets بدون رجوع للتقرير
   */
  private buildCsvLegend(): string {
    const lines = ['Severity Legend'];
    (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const).forEach((sev) => {
      const info = SEVERITY_INFO[sev];
      lines.push(
        `${sev},"${info.whatItMeans.replace(/"/g, "'")} ${info.urgency.replace(/"/g, "'")}"`,
      );
    });
    return lines.join('\n');
  }
}
