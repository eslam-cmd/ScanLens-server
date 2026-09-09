"use strict";
// server/src/scans/scans.controller.ts
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScansController = void 0;
const common_1 = require("@nestjs/common");
const scans_service_1 = require("./scans.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const jwt_1 = require("@nestjs/jwt");
const prisma_service_1 = require("../../prisma/prisma.service");
const export_service_1 = require("./export.service");
let ScansController = class ScansController {
    scansService;
    jwtService;
    exportService;
    prisma;
    constructor(scansService, jwtService, exportService, prisma) {
        this.scansService = scansService;
        this.jwtService = jwtService;
        this.exportService = exportService;
        this.prisma = prisma;
    }
    // ✅ 1. فحص مباشر (بدون Queue)
    async directScan(body, req) {
        const userId = req.user?.id;
        if (!userId) {
            throw new common_1.ForbiddenException('User not authenticated');
        }
        // ✅ تنفيذ الفحص مباشرة
        const result = await this.scansService.scanUrl(body.url, userId, body.deepScan || false);
        console.log('📤 Direct scan result:', {
            id: result?.id,
            score: result?.score,
            vulnerabilities: result?.vulnerabilities?.length || 0,
        });
        return result;
    }
    // ✅ 2. فحص للضيوف (بدون JWT)
    async guestScan(body) {
        // ✅ فحص بدون userId (ضيف)
        const result = await this.scansService.scanUrl(body.url, undefined, // no userId
        body.deepScan || false);
        console.log('📤 Guest scan result:', {
            id: result?.id,
            score: result?.score,
            vulnerabilities: result?.vulnerabilities?.length || 0,
        });
        return result;
    }
    // ✅ 3. توليد AI Fix
    async getAiFix(body, req) {
        const userId = req.user?.id;
        const remediation = await this.scansService.generateAiFix(body.title, body.description, userId);
        return { remediation };
    }
    // ✅ 4. جلب تاريخ الفحوصات
    async getHistory(req) {
        return this.scansService.getUserHistory(req.user.id);
    }
    // ✅ 5. حذف فحص
    async deleteScan(id, req) {
        return this.scansService.deleteScan(id, req.user.id);
    }
    // ✅ 6. تصدير CSV لفحص واحد
    async exportCsv(id, res) {
        const csvContent = await this.exportService.generateSingleScanCsv(id);
        const scan = await this.scansService.getScanById(id);
        const domain = scan.website?.domain || 'scan';
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
    async exportPdf(id, res) {
        const pdfBuffer = await this.exportService.generatePdfReport(id);
        const scan = await this.scansService.getScanById(id);
        const domain = scan.website?.domain || 'scan';
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
    async exportAllHistoryCsv(req, res) {
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
    async getMyPlan(req) {
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
    async cleanExpiredScans(req) {
        if (req.user.role !== 'admin') {
            throw new common_1.ForbiddenException('Only admins can perform this action');
        }
        const result = await this.scansService.cleanExpiredScans();
        return result;
    }
    // ✅ 11. تنظيف فحوصات المستخدم المنتهية
    async cleanUserExpiredScans(req) {
        const result = await this.scansService.cleanUserExpiredScans(req.user.id);
        return result;
    }
    // ✅ 12. الحصول على إحصائيات التخزين
    async getStorageStats(req) {
        const stats = await this.scansService.getUserStorageStats(req.user.id);
        return stats;
    }
    // ✅ 13. الحصول على إحصائيات اليومية
    async getDailyStats(req) {
        const stats = await this.scansService.getDailyStats(req.user.id);
        return stats;
    }
    // ✅ 14. الحصول على آخر فحص
    async getLatestScan(req) {
        const scan = await this.scansService.getLatestScan(req.user.id);
        return scan;
    }
};
exports.ScansController = ScansController;
__decorate([
    (0, common_1.Post)('direct-scan'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard) // ✅ يتطلب تسجيل دخول
    ,
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ScansController.prototype, "directScan", null);
__decorate([
    (0, common_1.Post)('guest-scan'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ScansController.prototype, "guestScan", null);
__decorate([
    (0, common_1.Post)('ai-fix'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ScansController.prototype, "getAiFix", null);
__decorate([
    (0, common_1.Get)('history'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ScansController.prototype, "getHistory", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ScansController.prototype, "deleteScan", null);
__decorate([
    (0, common_1.Get)(':id/export/csv'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ScansController.prototype, "exportCsv", null);
__decorate([
    (0, common_1.Get)(':id/export/pdf'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ScansController.prototype, "exportPdf", null);
__decorate([
    (0, common_1.Get)('export/csv'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ScansController.prototype, "exportAllHistoryCsv", null);
__decorate([
    (0, common_1.Get)('my-plan'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ScansController.prototype, "getMyPlan", null);
__decorate([
    (0, common_1.Delete)('clean-expired'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ScansController.prototype, "cleanExpiredScans", null);
__decorate([
    (0, common_1.Delete)('user/clean-expired'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ScansController.prototype, "cleanUserExpiredScans", null);
__decorate([
    (0, common_1.Get)('storage-stats'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ScansController.prototype, "getStorageStats", null);
__decorate([
    (0, common_1.Get)('daily-stats'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ScansController.prototype, "getDailyStats", null);
__decorate([
    (0, common_1.Get)('latest'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ScansController.prototype, "getLatestScan", null);
exports.ScansController = ScansController = __decorate([
    (0, common_1.Controller)('scans'),
    __metadata("design:paramtypes", [scans_service_1.ScansService,
        jwt_1.JwtService,
        export_service_1.ExportService,
        prisma_service_1.PrismaService])
], ScansController);
