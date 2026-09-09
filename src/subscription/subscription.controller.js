"use strict";
// server/src/subscription/subscription.controller.ts
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
exports.SubscriptionController = void 0;
const common_1 = require("@nestjs/common");
const subscription_service_1 = require("./subscription.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const admin_guard_1 = require("../auth/guards/admin.guard");
let SubscriptionController = class SubscriptionController {
    subscriptionService;
    constructor(subscriptionService) {
        this.subscriptionService = subscriptionService;
    }
    // ✅ الخطط
    async getAllPlans() {
        return await this.subscriptionService.getAllPlans();
    }
    async getPlan(id) {
        return await this.subscriptionService.getPlan(id);
    }
    // ✅ خطة المستخدم
    async getMyPlan(req) {
        return await this.subscriptionService.getUserPlan(req.user.id);
    }
    async getMySubscription(req) {
        return await this.subscriptionService.getMySubscription(req.user.id);
    }
    async updatePlan(req, planId) {
        return await this.subscriptionService.updateUserPlan(req.user.id, planId);
    }
    // ✅ تفعيل اشتراك (لأدمن فقط)
    // server/src/subscription/subscription.controller.ts
    // ✅ تأكد من أن هذا الـ Endpoint موجود
    async activateSubscription(body) {
        return await this.subscriptionService.activateSubscription(body.userId, body.planId, body.billingCycle);
    }
    // ✅ تجديد اشتراك (لأدمن فقط)
    async renewSubscription(body) {
        return await this.subscriptionService.renewSubscription(body.userId, body.planId, body.billingCycle);
    }
    // ✅ إلغاء اشتراك (لأدمن فقط)
    async cancelSubscription(userId) {
        return await this.subscriptionService.cancelSubscription(userId);
    }
    // ✅ التحقق من الصلاحيات
    async checkCapability(req, action) {
        return await this.subscriptionService.checkUserCapability(req.user.id, action);
    }
    async checkScanLimit(req) {
        return await this.subscriptionService.checkScanLimit(req.user.id);
    }
    // ✅ سجل الاستخدام
    async getUsageLogs(req, limit) {
        return await this.subscriptionService.getUserUsageLogs(req.user.id, limit ? parseInt(limit) : 50);
    }
    async getUserStats(req) {
        return await this.subscriptionService.getUserStats(req.user.id);
    }
    // ✅ إدارة الاشتراكات (للأدمن)
    async getAllSubscriptions() {
        return await this.subscriptionService.getAllSubscriptions();
    }
    // ✅ جلب جميع المدفوعات مع الإحصائيات (للأدمن)
    async getAllPayments() {
        return await this.subscriptionService.getAllPayments();
    }
    // ✅ جلب إحصائيات الاشتراكات (للأدمن)
    async getSubscriptionStats() {
        return await this.subscriptionService.getSubscriptionStats();
    }
    // ✅ License Keys
    async verifyLicense(body) {
        return await this.subscriptionService.verifyLicense(body.licenseKey, body.email);
    }
    async purchaseLicense(req, body) {
        return await this.subscriptionService.purchaseLicense({
            userId: req.user.id,
            planId: body.planId,
            email: body.email,
            billingCycle: body.billingCycle,
        });
    }
    async createLicense(body) {
        return await this.subscriptionService.createLicense({
            planId: body.planId,
            email: body.email,
            expiresAt: body.expiresAt,
            notes: body.notes,
        });
    }
    async getAllLicenses() {
        return await this.subscriptionService.getAllLicenses();
    }
    async deleteLicense(id) {
        return await this.subscriptionService.deleteLicense(id);
    }
    async checkExpiringLicenses() {
        return await this.subscriptionService.checkExpiringLicenses();
    }
    async autoExpireLicenses() {
        return await this.subscriptionService.autoExpireLicenses();
    }
    async handleExpiredLicense(key) {
        return await this.subscriptionService.handleExpiredLicense(key);
    }
    async getExpiringSubscriptions(days) {
        const daysParam = days ? parseInt(days) : 7;
        return await this.subscriptionService.getExpiringSubscriptions(daysParam);
    }
    /**
     * ✅ إرسال تذكيرات انتهاء الاشتراك يدوياً (للأدمن)
     */
    async sendExpirationReminders() {
        return await this.subscriptionService.sendExpirationReminders();
    }
};
exports.SubscriptionController = SubscriptionController;
__decorate([
    (0, common_1.Get)('plans'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SubscriptionController.prototype, "getAllPlans", null);
__decorate([
    (0, common_1.Get)('plans/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SubscriptionController.prototype, "getPlan", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('my-plan'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SubscriptionController.prototype, "getMyPlan", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('my-subscription'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SubscriptionController.prototype, "getMySubscription", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Put)('update-plan'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)('planId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SubscriptionController.prototype, "updatePlan", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, admin_guard_1.AdminGuard),
    (0, common_1.Post)('activate'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SubscriptionController.prototype, "activateSubscription", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, admin_guard_1.AdminGuard),
    (0, common_1.Post)('renew'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SubscriptionController.prototype, "renewSubscription", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, admin_guard_1.AdminGuard),
    (0, common_1.Post)('cancel'),
    __param(0, (0, common_1.Body)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SubscriptionController.prototype, "cancelSubscription", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('check-capability'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)('action')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SubscriptionController.prototype, "checkCapability", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('scan-limit'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SubscriptionController.prototype, "checkScanLimit", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('usage'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SubscriptionController.prototype, "getUsageLogs", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('stats'),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SubscriptionController.prototype, "getUserStats", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, admin_guard_1.AdminGuard),
    (0, common_1.Get)('admin/all'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SubscriptionController.prototype, "getAllSubscriptions", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, admin_guard_1.AdminGuard),
    (0, common_1.Get)('admin/payments'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SubscriptionController.prototype, "getAllPayments", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, admin_guard_1.AdminGuard),
    (0, common_1.Get)('admin/stats'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SubscriptionController.prototype, "getSubscriptionStats", null);
__decorate([
    (0, common_1.Post)('verify-license'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SubscriptionController.prototype, "verifyLicense", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('purchase-license'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SubscriptionController.prototype, "purchaseLicense", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, admin_guard_1.AdminGuard),
    (0, common_1.Post)('licenses'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SubscriptionController.prototype, "createLicense", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, admin_guard_1.AdminGuard),
    (0, common_1.Get)('licenses'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SubscriptionController.prototype, "getAllLicenses", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, admin_guard_1.AdminGuard),
    (0, common_1.Delete)('licenses/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SubscriptionController.prototype, "deleteLicense", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, admin_guard_1.AdminGuard),
    (0, common_1.Get)('check-expiring'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SubscriptionController.prototype, "checkExpiringLicenses", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, admin_guard_1.AdminGuard),
    (0, common_1.Post)('auto-expire'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SubscriptionController.prototype, "autoExpireLicenses", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, admin_guard_1.AdminGuard),
    (0, common_1.Post)('handle-expired/:key'),
    __param(0, (0, common_1.Param)('key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SubscriptionController.prototype, "handleExpiredLicense", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, admin_guard_1.AdminGuard),
    (0, common_1.Get)('expiring'),
    __param(0, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SubscriptionController.prototype, "getExpiringSubscriptions", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, admin_guard_1.AdminGuard),
    (0, common_1.Post)('send-reminders'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SubscriptionController.prototype, "sendExpirationReminders", null);
exports.SubscriptionController = SubscriptionController = __decorate([
    (0, common_1.Controller)('subscription'),
    __metadata("design:paramtypes", [subscription_service_1.SubscriptionService])
], SubscriptionController);
