"use strict";
// server/src/admin/admin-payments.controller.ts
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
exports.AdminPaymentsController = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const admin_guard_1 = require("../auth/guards/admin.guard");
const plans_config_1 = require("../plans/plans.config");
let AdminPaymentsController = class AdminPaymentsController {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    /**
     * ✅ جلب جميع المستخدمين المشتركين (غير المجانيين) مع أسعارهم
     */
    async getAllPayments() {
        const users = await this.prisma.user.findMany({
            where: {
                plan: {
                    not: 'free',
                },
            },
            select: {
                id: true,
                email: true,
                name: true,
                plan: true,
                subscriptionExpiresAt: true,
                createdAt: true,
                updatedAt: true,
                payments: {
                    where: {
                        status: 'SUCCEEDED',
                    },
                    orderBy: {
                        createdAt: 'desc',
                    },
                    take: 1,
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
        console.log(`📊 Found ${users.length} subscribed users`);
        const payments = users.map((user) => {
            const planConfig = plans_config_1.PLANS[user.plan];
            const price = planConfig?.price || 29.99;
            const priceYearly = planConfig?.priceYearly || price * 12;
            const existingPayment = user.payments[0];
            return {
                id: existingPayment?.id || `simulated-${user.id}`,
                userId: user.id,
                amount: price,
                currency: 'USD',
                status: 'SUCCEEDED',
                description: `${user.plan} Plan - Subscription`,
                createdAt: existingPayment?.createdAt || user.createdAt,
                paidAt: existingPayment?.paidAt || user.createdAt,
                refundedAt: null,
                metadata: {
                    planId: user.plan,
                    price: price,
                    priceYearly: priceYearly,
                    expiresAt: user.subscriptionExpiresAt,
                    isSimulated: !existingPayment,
                },
                user: {
                    email: user.email,
                    name: user.name || 'Unknown',
                    plan: user.plan,
                },
            };
        });
        const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
        const totalPayments = payments.length;
        const revenueByPlan = {};
        payments.forEach((p) => {
            const planId = p.metadata?.planId || 'free';
            if (!revenueByPlan[planId]) {
                revenueByPlan[planId] = { amount: 0, count: 0 };
            }
            revenueByPlan[planId].amount += p.amount;
            revenueByPlan[planId].count += 1;
        });
        const monthlyData = {};
        payments.forEach((p) => {
            const date = new Date(p.createdAt);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { amount: 0, count: 0 };
            }
            monthlyData[monthKey].amount += p.amount;
            monthlyData[monthKey].count += 1;
        });
        const monthlyRevenue = Object.entries(monthlyData)
            .map(([month, data]) => ({
            month,
            amount: data.amount,
            count: data.count,
        }))
            .sort((a, b) => a.month.localeCompare(b.month));
        const now = new Date();
        const activeUsers = users.filter((u) => u.subscriptionExpiresAt && u.subscriptionExpiresAt > now).length;
        const planDistribution = Object.entries(users.reduce((acc, u) => {
            const plan = u.plan || 'free';
            acc[plan] = (acc[plan] || 0) + 1;
            return acc;
        }, {})).map(([plan, count]) => ({
            plan,
            count,
            percentage: users.length > 0 ? (count / users.length) * 100 : 0,
        }));
        const result = {
            data: payments,
            stats: {
                totalRevenue,
                totalPayments,
                paidUsers: users.length,
                activeUsers,
                revenueByPlan: Object.entries(revenueByPlan).map(([plan, data]) => ({
                    plan,
                    amount: data.amount,
                    count: data.count,
                })),
                monthlyRevenue,
                planDistribution,
                averageAmount: totalPayments > 0 ? totalRevenue / totalPayments : 0,
            },
        };
        console.log(`📊 Returning ${payments.length} payments with total revenue $${totalRevenue}`);
        return result;
    }
    /**
     * ✅ إنشاء دفعات للمستخدمين المشتركين (للأدمن فقط)
     */
    async createPaymentsForSubscribedUsers() {
        // ✅ جلب جميع المستخدمين المشتركين
        const users = await this.prisma.user.findMany({
            where: {
                plan: { not: 'free' },
            },
            select: {
                id: true,
                email: true,
                plan: true,
                subscriptionExpiresAt: true,
                createdAt: true,
            },
        });
        let createdCount = 0;
        const results = [];
        for (const user of users) {
            // ✅ التحقق من وجود دفعة
            const existing = await this.prisma.payment.count({
                where: {
                    userId: user.id,
                    status: 'SUCCEEDED',
                },
            });
            if (existing === 0) {
                const planConfig = plans_config_1.PLANS[user.plan];
                const price = planConfig?.price || 29.99;
                await this.prisma.payment.create({
                    data: {
                        userId: user.id,
                        amount: price,
                        currency: 'USD',
                        status: 'SUCCEEDED',
                        description: `${user.plan} Plan - monthly subscription`,
                        paidAt: new Date(),
                        metadata: {
                            planId: user.plan,
                            billingCycle: 'monthly',
                            expiresAt: user.subscriptionExpiresAt,
                            isSimulated: true,
                        },
                    },
                });
                createdCount++;
                results.push({
                    userId: user.id,
                    email: user.email,
                    plan: user.plan,
                    price,
                });
            }
        }
        return {
            success: true,
            created: createdCount,
            results,
        };
    }
    /**
     * ✅ تصدير المدفوعات كـ CSV
     */
    async exportPaymentsCsv(res) {
        const users = await this.prisma.user.findMany({
            where: {
                plan: {
                    not: 'free',
                },
            },
            select: {
                id: true,
                email: true,
                name: true,
                plan: true,
                subscriptionExpiresAt: true,
                createdAt: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
        if (users.length === 0) {
            throw new Error('No subscribed users found');
        }
        const headers = [
            'User ID',
            'Email',
            'Name',
            'Plan',
            'Price',
            'Status',
            'Expires At',
            'Joined At',
        ];
        const rows = users.map((user) => {
            const planConfig = plans_config_1.PLANS[user.plan];
            const price = planConfig?.price || 0;
            const now = new Date();
            const isActive = user.subscriptionExpiresAt && user.subscriptionExpiresAt > now;
            return [
                user.id,
                user.email,
                user.name || 'N/A',
                user.plan,
                `$${price}`,
                isActive ? 'Active' : 'Expired',
                user.subscriptionExpiresAt
                    ? new Date(user.subscriptionExpiresAt).toLocaleDateString()
                    : 'N/A',
                new Date(user.createdAt).toLocaleDateString(),
            ];
        });
        const csvContent = [
            headers.join(','),
            ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
        ].join('\n');
        const filename = `subscribed_users_${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.status(common_1.HttpStatus.OK).send(csvContent);
    }
};
exports.AdminPaymentsController = AdminPaymentsController;
__decorate([
    (0, common_1.Get)('payments'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminPaymentsController.prototype, "getAllPayments", null);
__decorate([
    (0, common_1.Post)('payments/create'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminPaymentsController.prototype, "createPaymentsForSubscribedUsers", null);
__decorate([
    (0, common_1.Get)('payments/export/csv'),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminPaymentsController.prototype, "exportPaymentsCsv", null);
exports.AdminPaymentsController = AdminPaymentsController = __decorate([
    (0, common_1.Controller)('admin'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, admin_guard_1.AdminGuard),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AdminPaymentsController);
