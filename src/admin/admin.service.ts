// server/src/admin/admin.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // ✅ 1. إحصائيات عامة
  async getStats() {
    const [totalUsers, totalScans, totalPayments, totalLicenses] =
      await Promise.all([
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
      percentage:
        totalUsers > 0 ? Math.round((group._count.plan / totalUsers) * 100) : 0,
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
      scansCount: user.websites.reduce(
        (acc, website) => acc + website.scans.length,
        0,
      ),
      websites: undefined,
    }));
  }

  // ✅ 3. جلب مستخدم محدد
  async getUser(id: string) {
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
      throw new NotFoundException('User not found');
    }

    return user;
  }

  // ✅ 4. تحديث خطة المستخدم
  async changeUserPlan(userId: string, plan: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
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
  async deleteUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
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
  async createLicense(data: {
    plan: string;
    email?: string;
    expiresAt?: Date;
    notes?: string;
  }) {
    // ✅ إذا تم توفير بريد إلكتروني، تحقق من وجود المستخدم
    if (data.email) {
      const user = await this.prisma.user.findUnique({
        where: { email: data.email },
      });

      if (!user) {
        throw new BadRequestException(
          `User with email ${data.email} not found`,
        );
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
  async revokeLicense(licenseId: string) {
    const license = await this.prisma.license.findUnique({
      where: { id: licenseId },
    });

    if (!license) {
      throw new NotFoundException('License not found');
    }

    return this.prisma.license.update({
      where: { id: licenseId },
      data: { isActive: false },
    });
  }

  // ✅ 10. توليد مفتاح عشوائي
  private generateLicenseKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const groups: string[] = [];
    for (let i = 0; i < 4; i++) {
      let group = '';
      for (let j = 0; j < 4; j++) {
        group += chars[Math.floor(Math.random() * chars.length)];
      }
      groups.push(group);
    }
    return groups.join('-');
  }
}
