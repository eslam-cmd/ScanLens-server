"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminService = void 0;
// server/src/admin/admin.service.ts
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let AdminService = class AdminService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    // ✅ 1. إحصائيات عامة
    async getStats() {
        const [totalUsers, totalScans, totalPayments, totalLicenses] = await Promise.all([
            this.prisma.user.count(),
            this.prisma.scan.count(),
            this.prisma.payment.count(),
            this.prisma.license.count(),
        ]);
        const totalRevenue = await this.prisma.payment.aggregate({
            _sum: { amount: true },
            where: { status: 'SUCCEEDED' },
        });
        const users = await this.prisma.user.groupBy({
            by: ['plan'],
            _count: { plan: true },
        });
        const planDistribution = users.map((group) => ({
            plan: group.plan,
            count: group._count.plan,
            percentage: totalUsers > 0 ? Math.round((group._count.plan / totalUsers) * 100) : 0,
        }));
        const activeLicenses = await this.prisma.license.count({
            where: { isActive: true },
        });
        return {
            totalUsers,
            totalScans,
            totalRevenue: totalRevenue._sum.amount || 0,
            totalLicenses,
            activeLicenses,
            planDistribution,
        };
    }
    // ✅ 2. جلب جميع المستخدمين
    async getAllUsers() {
        const users = await this.prisma.user.findMany({
            select: {
                id: true,
                email: true,
                name: true,
                plan: true,
                role: true,
                createdAt: true,
                websites: {
                    select: {
                        scans: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        return users.map((user) => ({
            ...user,
            scansCount: user.websites.reduce((acc, website) => acc + website.scans.length, 0),
            websites: undefined,
        }));
    }
    // ✅ 3. جلب مستخدم محدد
    async getUser(id) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            include: {
                websites: {
                    include: {
                        scans: true,
                    },
                },
                payments: true,
            },
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        return user;
    }
    // ✅ 4. تحديث خطة المستخدم
    async changeUserPlan(userId, plan) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        return this.prisma.user.update({
            where: { id: userId },
            data: { plan },
            select: {
                id: true,
                email: true,
                name: true,
                plan: true,
                role: true,
                updatedAt: true,
            },
        });
    }
    // ✅ 5. حذف مستخدم
    async deleteUser(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        return this.prisma.user.delete({
            where: { id: userId },
        });
    }
    // ✅ 6. جلب جميع المدفوعات
    async getAllPayments() {
        return this.prisma.payment.findMany({
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        name: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    // ✅ 7. جلب جميع المفاتيح
    async getAllLicenses() {
        return this.prisma.license.findMany({
            orderBy: { createdAt: 'desc' },
        });
    }
    // ✅ 8. إنشاء مفتاح جديد (مع التحقق من البريد الإلكتروني)
    async createLicense(data) {
        // ✅ إذا تم توفير بريد إلكتروني، تحقق من وجود المستخدم
        if (data.email) {
            const user = await this.prisma.user.findUnique({
                where: { email: data.email },
            });
            if (!user) {
                throw new common_1.BadRequestException(`User with email ${data.email} not found`);
            }
        }
        const key = this.generateLicenseKey();
        return this.prisma.license.create({
            data: {
                key,
                plan: data.plan,
                email: data.email,
                expiresAt: data.expiresAt,
                notes: data.notes,
                isActive: true,
            },
        });
    }
    // ✅ 9. إلغاء مفتاح
    async revokeLicense(licenseId) {
        const license = await this.prisma.license.findUnique({
            where: { id: licenseId },
        });
        if (!license) {
            throw new common_1.NotFoundException('License not found');
        }
        return this.prisma.license.update({
            where: { id: licenseId },
            data: { isActive: false },
        });
    }
    // ✅ 10. توليد مفتاح عشوائي
    generateLicenseKey() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const groups = [];
        for (let i = 0; i < 4; i++) {
            let group = '';
            for (let j = 0; j < 4; j++) {
                group += chars[Math.floor(Math.random() * chars.length)];
            }
            groups.push(group);
        }
        return groups.join('-');
    }
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AdminService);
