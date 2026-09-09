"use strict";
// server/src/scans/scans.service.ts
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var ScansService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScansService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../../prisma/prisma.service");
const client_1 = require("@prisma/client");
const genai_1 = require("@google/genai");
const axios_1 = __importDefault(require("axios"));
const tls = __importStar(require("tls"));
const url_1 = require("url");
const pdfkit_1 = __importDefault(require("pdfkit"));
const plans_config_1 = require("../plans/plans.config");
const headers_engine_1 = require("../scanner/engines/headers.engine");
const cookies_engine_1 = require("../scanner/engines/cookies.engine");
const https_engine_1 = require("../scanner/engines/https.engine");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
let ScansService = ScansService_1 = class ScansService {
    prisma;
    headersEngine;
    cookiesEngine;
    httpsEngine;
    scanQueue;
    logger = new common_1.Logger(ScansService_1.name);
    ai;
    constructor(prisma, headersEngine, cookiesEngine, httpsEngine, scanQueue) {
        this.prisma = prisma;
        this.headersEngine = headersEngine;
        this.cookiesEngine = cookiesEngine;
        this.httpsEngine = httpsEngine;
        this.scanQueue = scanQueue;
        this.ai = new genai_1.GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY || '',
        });
    }
    // ============================================================
    // ✅ 1. دالة التحقق من صحة الـ URL
    // ============================================================
    validateUrl(url) {
        try {
            let formattedUrl = url.trim();
            formattedUrl = formattedUrl.replace(/\s+/g, '');
            formattedUrl = formattedUrl.replace(/^\/\//, '');
            if (!formattedUrl.startsWith('http://') &&
                !formattedUrl.startsWith('https://')) {
                formattedUrl = `https://${formattedUrl}`;
            }
            const parsedUrl = new url_1.URL(formattedUrl);
            if (!parsedUrl.hostname || parsedUrl.hostname.length < 3) {
                return {
                    valid: false,
                    formattedUrl,
                    error: 'Invalid domain name',
                };
            }
            if (formattedUrl.includes('//') &&
                formattedUrl.indexOf('//') !== formattedUrl.indexOf('://') + 1) {
                formattedUrl = formattedUrl.replace(/([^:]\/)\/+/g, '$1');
            }
            return { valid: true, formattedUrl };
        }
        catch (error) {
            return {
                valid: false,
                formattedUrl: url,
                error: 'Invalid URL format',
            };
        }
    }
    // ============================================================
    // ✅ 2. دوال حساب الاستخدام اليومي (NEW)
    // ============================================================
    /**
     * ✅ الحصول على عدد الفحوصات اليومية للمستخدم
     */
    async getTodayScanCount(userId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const count = await this.prisma.usageLog.count({
            where: {
                userId,
                action: {
                    in: ['SCAN', 'DEEP_SCAN'],
                },
                createdAt: { gte: today },
            },
        });
        return count;
    }
    /**
     * ✅ الحصول على عدد Deep Scans اليومية للمستخدم
     */
    async getTodayDeepScanCount(userId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const count = await this.prisma.usageLog.count({
            where: {
                userId,
                action: 'DEEP_SCAN',
                createdAt: { gte: today },
            },
        });
        return count;
    }
    /**
     * ✅ إعادة تعيين الاستخدام اليومي (تُشغل تلقائياً كل يوم عند منتصف الليل)
     */
    async resetDailyUsage() {
        this.logger.log('🔄 [Cron] Resetting daily usage counts...');
        try {
            // ✅ حذف سجلات الاستخدام الأقدم من يوم واحد
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(0, 0, 0, 0);
            const deleted = await this.prisma.usageLog.deleteMany({
                where: {
                    createdAt: {
                        lt: yesterday,
                    },
                },
            });
            this.logger.log(`✅ [Cron] Reset daily usage: ${deleted.count} records deleted`);
            return { deleted: deleted.count };
        }
        catch (error) {
            this.logger.error('❌ [Cron] Failed to reset daily usage:', error);
            throw error;
        }
    }
    // ============================================================
    // ✅ 3. التحقق من صلاحية المستخدم (معدلة)
    // ============================================================
    // server/src/scans/scans.service.ts
    async checkUserCapability(userId, isDeepScan) {
        if (!userId) {
            return { allowed: true, plan: 'free', isGuest: true };
        }
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { plan: true, role: true },
        });
        if (!user) {
            throw new common_1.ForbiddenException('User not found');
        }
        if (user.role === 'admin') {
            return { allowed: true, plan: 'admin', isGuest: false };
        }
        const planId = user.plan || 'free';
        const plan = plans_config_1.PLANS[planId];
        if (!plan) {
            throw new common_1.ForbiddenException('Invalid plan');
        }
        // ✅ الحصول على عدد الفحوصات اليومية من قاعدة البيانات
        const todayScans = await this.getTodayScanCount(userId);
        const todayDeepScans = await this.getTodayDeepScanCount(userId);
        // ✅ التحقق من حدود Deep Scan (استخدم deepScanLimit)
        if (isDeepScan) {
            const maxDeepScans = plan.deepScanLimit || 5;
            if (todayDeepScans >= maxDeepScans) {
                throw new common_1.ForbiddenException(`You have reached your daily Deep Scan limit of ${maxDeepScans}. Upgrade to Pro for unlimited Deep Scans.`);
            }
        }
        // ✅ التحقق من حدود الفحوصات العادية
        if (!plan.unlimitedScans) {
            if (todayScans >= plan.scansPerDay) {
                throw new common_1.ForbiddenException(`You have reached your daily scan limit of ${plan.scansPerDay} scans. Upgrade to Pro for unlimited scans.`);
            }
        }
        // ✅ حساب المتبقي
        const remainingScans = plan.unlimitedScans
            ? Infinity
            : plan.scansPerDay - todayScans;
        const remainingDeepScans = plan.unlimitedScans
            ? Infinity
            : (plan.deepScanLimit || 5) - todayDeepScans;
        return {
            allowed: true,
            plan: planId,
            isGuest: false,
            todayScans,
            remainingScans,
            todayDeepScans,
            remainingDeepScans,
            limits: {
                scansPerDay: plan.scansPerDay,
                deepScanLimit: plan.deepScanLimit || 5,
                unlimitedScans: plan.unlimitedScans,
            },
        };
    }
    // ============================================================
    // ✅ 4. فحص SSL/TLS
    // ============================================================
    async inspectSsl(targetUrl) {
        return new Promise((resolve) => {
            try {
                const parsedUrl = new url_1.URL(targetUrl);
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
                    const daysRemaining = Math.floor((validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
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
            }
            catch (err) {
                resolve({ valid: false, reason: err.message || 'Invalid URL' });
            }
        });
    }
    // ============================================================
    // ✅ 5. الفحص الرئيسي (معدل)
    // ============================================================
    async scanUrl(url, userId, isDeepScan = false) {
        // ✅ التحقق من صحة الـ URL أولاً
        const urlValidation = this.validateUrl(url);
        if (!urlValidation.valid) {
            this.logger.warn(`❌ Invalid URL: ${url} - ${urlValidation.error}`);
            throw new common_1.BadRequestException(`Invalid URL: ${url}. Please enter a valid domain name.`);
        }
        const formattedUrl = urlValidation.formattedUrl;
        // ✅ التحقق من الصلاحية
        const capability = await this.checkUserCapability(userId, isDeepScan);
        if (!capability.allowed) {
            throw new common_1.ForbiddenException('Scan not allowed');
        }
        this.logger.log(`🔍 Formatted URL: ${formattedUrl}`);
        this.logger.log(`🔍 User Plan: ${capability.plan}`);
        this.logger.log(`🔍 Is Deep Scan: ${isDeepScan}`);
        this.logger.log(`📊 Today scans: ${capability.todayScans || 0}`);
        this.logger.log(`📊 Remaining scans: ${capability.remainingScans || 0}`);
        try {
            // ✅ تنفيذ الفحص
            const response = await axios_1.default.get(formattedUrl, {
                timeout: 15000,
                maxRedirects: 5,
                validateStatus: () => true,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
            });
            this.logger.log(`🔍 Response Status: ${response.status}`);
            const responseHeaders = response.headers;
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
            const presentHeaders = [];
            const missingHeaders = [];
            for (const header of securityHeaders) {
                const found = Object.keys(responseHeaders).some((key) => key.toLowerCase() === header.name);
                if (found) {
                    presentHeaders.push(header.name);
                }
                else {
                    missingHeaders.push(header.name);
                }
            }
            // ✅ حساب النتيجة
            const headerWeights = {
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
            let score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
            // ✅ الفحص العميق
            let sslAnalysis = null;
            let corsAnalysis = null;
            if (isDeepScan) {
                this.logger.log('🔍 Running deep scan...');
                sslAnalysis = await this.inspectSsl(formattedUrl);
                if (sslAnalysis && !sslAnalysis.valid) {
                    score = Math.max(0, score - 25);
                }
                else if (sslAnalysis && sslAnalysis.valid) {
                    score = Math.min(100, score + 5);
                }
                const allowOrigin = responseHeaders['access-control-allow-origin'];
                corsAnalysis = {
                    allowOrigin: allowOrigin || 'Not Set',
                    riskLevel: allowOrigin === '*' ? 'HIGH' : allowOrigin ? 'LOW' : 'SECURE',
                };
                if (allowOrigin === '*') {
                    score = Math.max(0, score - 20);
                }
                else if (allowOrigin) {
                    score = Math.min(100, score + 5);
                }
            }
            this.logger.log(`📊 Final Score: ${score}`);
            // ✅ إنشاء الثغرات
            const detectedVulnerabilities = [];
            for (const header of securityHeaders) {
                if (missingHeaders.includes(header.name)) {
                    const severity = header.severity === 'HIGH'
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
                    remediation: 'Configure specific allowed origins instead of using wildcard (*).',
                });
            }
            // ✅ حفظ في قاعدة البيانات
            let createdScanId = undefined;
            let comparison = null;
            if (userId) {
                try {
                    const targetDomain = new url_1.URL(formattedUrl).hostname;
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
                            status: scoreDiff > 10
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
                            status: client_1.ScanStatus.COMPLETED,
                            completedAt: new Date(),
                            vulnerabilities: {
                                create: detectedVulnerabilities,
                            },
                        },
                    });
                    createdScanId = newScan.id;
                    // ✅ تسجيل الاستخدام (هذا سيبقى في قاعدة البيانات حتى يتم حذفه يومياً)
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
                catch (dbError) {
                    this.logger.warn(`⚠️ Database error, continuing without saving: ${dbError.message}`);
                }
            }
            // ✅ النتيجة النهائية مع معلومات الاستخدام اليومي
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
                // ✅ إضافة معلومات الاستخدام اليومي
                dailyUsage: {
                    scansToday: capability.todayScans || 0,
                    remainingScans: capability.remainingScans,
                    deepScansToday: capability.todayDeepScans || 0,
                    remainingDeepScans: capability.remainingDeepScans,
                    deepScanLimit: capability.limits?.deepScanLimit || 5,
                    scansPerDay: capability.limits?.scansPerDay || 10,
                    unlimitedScans: capability.limits?.unlimitedScans || false,
                },
            };
            this.logger.log(`✅ Scan completed successfully for: ${formattedUrl}`);
            return result;
        }
        catch (error) {
            this.logger.error(`❌ Scan Error: ${error}`);
            if (error instanceof common_1.ForbiddenException) {
                throw error;
            }
            throw new common_1.BadRequestException(`Failed to reach target URL: ${formattedUrl} - ${error.message}`);
        }
    }
    // ============================================================
    // ✅ باقي الدوال (لم تتغير)
    // ============================================================
    getRemediationSuggestion(headerName) {
        const suggestions = {
            'content-security-policy': "Add Content-Security-Policy header. Example: `default-src 'self'; script-src 'self' 'unsafe-inline';`",
            'strict-transport-security': 'Add Strict-Transport-Security header. Example: `max-age=31536000; includeSubDomains; preload`',
            'x-content-type-options': 'Add X-Content-Type-Options header. Example: `nosniff`',
            'x-frame-options': 'Add X-Frame-Options header. Example: `DENY` or `SAMEORIGIN`',
            'referrer-policy': 'Add Referrer-Policy header. Example: `strict-origin-when-cross-origin`',
            'permissions-policy': 'Add Permissions-Policy header. Example: `geolocation=(), microphone=(), camera=()`',
            'x-xss-protection': 'Add X-XSS-Protection header. Example: `1; mode=block`',
        };
        return suggestions[headerName] || 'Add the missing security header.';
    }
    async generateAiFix(vulnerabilityTitle, context, userId) {
        if (!userId) {
            throw new common_1.ForbiddenException('AI remediation is only available for registered users.');
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
        }
        catch (err) {
            this.logger.error(`Gemini AI Generation Error: ${err}`);
            throw new common_1.BadRequestException('Unable to generate AI fix at this time.');
        }
    }
    async getUserHistory(userId) {
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
    async deleteScan(scanId, userId) {
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
            throw new common_1.BadRequestException('Scan not found or does not belong to user');
        }
        return this.prisma.scan.delete({ where: { id: scanId } });
    }
    async getScanById(scanId, userId) {
        let whereClause = { id: scanId };
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
            throw new common_1.NotFoundException('Scan record not found');
        }
        return scan;
    }
    async generatePdfReport(scanId, userId) {
        const scan = await this.getScanById(scanId, userId);
        return new Promise((resolve, reject) => {
            const doc = new pdfkit_1.default({ margin: 50 });
            const buffers = [];
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
            const websiteUrl = scan.website?.url || 'N/A';
            const domain = scan.website?.domain || 'N/A';
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
            const scoreColor = scan.score >= 80 ? '#22c55e' : scan.score >= 50 ? '#f59e0b' : '#ef4444';
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
            const vulnerabilities = scan.vulnerabilities || [];
            if (vulnerabilities.length === 0) {
                doc
                    .fontSize(10)
                    .font('Helvetica')
                    .fillColor('#22c55e')
                    .text('✅ No vulnerabilities detected! Your website is secure.');
            }
            else {
                vulnerabilities.forEach((vuln, index) => {
                    const severityColor = vuln.severity === 'CRITICAL' || vuln.severity === 'HIGH'
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
    async generateCsvReport(scanId, userId) {
        const scan = await this.getScanById(scanId, userId);
        const vulnerabilities = scan.vulnerabilities || [];
        const rows = [
            ['ScanLens Security Audit Report'],
            [''],
            ['Report Information'],
            [`Domain:`, scan.website?.domain || 'N/A'],
            [`URL:`, scan.website?.url || 'N/A'],
            [`Security Score:`, `${scan.score}/100`],
            [`Status:`, scan.status],
            [`Date:`, new Date(scan.createdAt).toLocaleString()],
            [''],
            ['Vulnerabilities Found:'],
            ['#', 'Title', 'Severity', 'Description', 'Remediation'],
        ];
        if (vulnerabilities.length === 0) {
            rows.push(['No vulnerabilities detected!']);
        }
        else {
            vulnerabilities.forEach((vuln, index) => {
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
            .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            .join('\n');
    }
    async getUserStats(userId) {
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
        const averageScore = totalScans > 0
            ? Math.round(allScans.reduce((acc, s) => acc + s.score, 0) / totalScans)
            : 0;
        const vulnerabilities = allScans.flatMap((s) => s.vulnerabilities);
        const criticalVulnerabilities = vulnerabilities.filter((v) => v.severity === 'CRITICAL').length;
        const highVulnerabilities = vulnerabilities.filter((v) => v.severity === 'HIGH').length;
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
                domain: s.website?.domain,
                score: s.score,
                createdAt: s.createdAt,
            })),
        };
    }
    async getRecentScans(userId, limit = 10) {
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
    async rescanWebsite(websiteId, userId, isDeepScan = false) {
        const website = await this.prisma.website.findFirst({
            where: { id: websiteId, userId },
        });
        if (!website) {
            throw new common_1.NotFoundException('Website not found');
        }
        return this.scanUrl(website.url, userId, isDeepScan);
    }
    async getUserWebsites(userId) {
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
    async deleteWebsite(websiteId, userId) {
        const website = await this.prisma.website.findFirst({
            where: { id: websiteId, userId },
        });
        if (!website) {
            throw new common_1.NotFoundException('Website not found');
        }
        return this.prisma.website.delete({
            where: { id: websiteId },
        });
    }
    async getUserActivities(userId) {
        return this.prisma.usageLog.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
    }
    // ============================================================
    // ✅ دوال التنظيف والتخزين
    // ============================================================
    getRetentionDays(plan, role) {
        if (role === 'admin') {
            return Infinity;
        }
        const retentionMap = {
            free: 7,
            pro: 30,
            extra: 90,
            premium: 365,
        };
        return retentionMap[plan] || 7;
    }
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
            const results = [];
            for (const user of users) {
                const retentionDays = this.getRetentionDays(user.plan, user.role);
                if (retentionDays === Infinity) {
                    this.logger.debug(`⏭️ Skipping user ${user.id} (${user.plan}) - Permanent retention`);
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
                    this.logger.log(`🗑️ Deleted ${deleted.count} expired scans for user ${user.id} (${user.plan} plan)`);
                }
            }
            if (totalDeleted > 0) {
                this.logger.log(`✅ Cleanup complete: ${totalDeleted} total scans deleted`);
            }
            else {
                this.logger.log('✅ No expired scans found to delete');
            }
            return { totalDeleted, results };
        }
        catch (error) {
            this.logger.error('❌ Failed to clean expired scans:', error);
            throw error;
        }
    }
    async cleanUserExpiredScans(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { plan: true, role: true },
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
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
        this.logger.log(`🗑️ Deleted ${deleted.count} expired scans for user ${userId}`);
        return { deleted: deleted.count, retentionDays };
    }
    async getUserStorageStats(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { plan: true, role: true },
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
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
    async getLatestScan(userId) {
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
    async getDailyStats(userId) {
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
};
exports.ScansService = ScansService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_MIDNIGHT),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ScansService.prototype, "resetDailyUsage", null);
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_MIDNIGHT),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ScansService.prototype, "cleanExpiredScans", null);
exports.ScansService = ScansService = ScansService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(4, (0, bullmq_1.InjectQueue)('scan-queue')),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        headers_engine_1.HeadersEngine,
        cookies_engine_1.CookiesEngine,
        https_engine_1.HttpsEngine,
        bullmq_2.Queue])
], ScansService);
