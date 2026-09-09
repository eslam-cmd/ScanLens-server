// server/src/subscription/subscription.service.ts

import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { PLANS, PlanId } from '../plans/plans.config';
import { MailService } from '../mail/mail.service';

type PlanType = PlanId;

export interface RenewedUser {
  userId: string;
  email: string;
  plan: string;
  amount: number;
}

export interface FailedRenewal {
  userId: string;
  email: string;
  error: string;
}

export interface ExpiredUser {
  userId: string;
  email: string;
  plan: string;
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  // ✅ الخطط
  async getAllPlans() {
    return Object.values(PLANS);
  }

  async getPlan(planId: PlanId) {
    const plan = PLANS[planId];
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  // ✅ خطة المستخدم
  async getUserPlan(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    const plan = PLANS[user.plan as PlanId];
    if (!plan) return PLANS.free;
    return plan;
  }

  async getMySubscription(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        subscriptionExpiresAt: true,
        createdAt: true,
      },
    });

    if (!user) throw new NotFoundException('User not found');

    const plan = PLANS[user.plan as PlanId];
    const now = new Date();
    const isActive = user.subscriptionExpiresAt
      ? user.subscriptionExpiresAt > now
      : false;

    return {
      ...user,
      planDetails: plan,
      isActive,
      daysRemaining: isActive
        ? Math.ceil(
            (user.subscriptionExpiresAt!.getTime() - now.getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : 0,
    };
  }

  async updateUserPlan(userId: string, planId: PlanId) {
    const plan = PLANS[planId];
    if (!plan) throw new NotFoundException('Plan not found');

    return this.prisma.user.update({
      where: { id: userId },
      data: { plan: planId },
    });
  }

  // ✅ تفعيل اشتراك (بواسطة الأدمن مع دعم شهري/سنوي)
  async activateSubscription(
    userId: string,
    planId: PlanType,
    billingCycle: 'monthly' | 'yearly',
  ) {
    const plan = PLANS[planId];
    if (!plan) throw new NotFoundException('Plan not found');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new NotFoundException('User not found');

    const now = new Date();
    if (user.subscriptionExpiresAt && user.subscriptionExpiresAt > now) {
      throw new BadRequestException('User already has an active subscription');
    }

    const price = billingCycle === 'monthly' ? plan.price : plan.priceYearly;
    const duration = billingCycle === 'monthly' ? 30 : 365;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + duration);

    // ✅ 1. تحديث خطة المستخدم
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        plan: planId,
        subscriptionExpiresAt: expiresAt,
      },
    });

    // ✅ 2. إنشاء سجل دفع
    const payment = await this.prisma.payment.create({
      data: {
        userId,
        amount: price,
        currency: 'USD',
        status: 'SUCCEEDED',
        description: `${plan.name} Plan - ${billingCycle} subscription (Activated by Admin)`,
        paidAt: new Date(),
        metadata: {
          planId,
          billingCycle,
          expiresAt: expiresAt.toISOString(),
          paymentType: 'subscription_activation',
          isAdminActivated: true,
          isRenewal: false,
        },
      },
    });

    // ✅ 3. تسجيل في سجل الاستخدام
    await this.prisma.usageLog.create({
      data: {
        userId,
        action: 'SUBSCRIPTION_ACTIVATED',
        details: {
          planId,
          billingCycle,
          price,
          expiresAt,
          paymentId: payment.id,
          activatedBy: 'admin',
        },
      },
    });

    this.logger.log(
      `✅ Subscription activated for user ${userId} (${plan.name}) by Admin (${billingCycle})`,
    );

    return {
      success: true,
      user: updatedUser,
      payment,
      plan: plan.name,
      price,
      expiresAt,
      billingCycle,
    };
  }

  // ✅ تجديد اشتراك
  async renewSubscription(
    userId: string,
    planId: PlanType,
    billingCycle: 'monthly' | 'yearly',
  ) {
    const plan = PLANS[planId];
    if (!plan) throw new NotFoundException('Plan not found');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new NotFoundException('User not found');

    const price = billingCycle === 'monthly' ? plan.price : plan.priceYearly;
    const duration = billingCycle === 'monthly' ? 30 : 365;

    const now = new Date();
    let newExpiry: Date;

    if (user.subscriptionExpiresAt && user.subscriptionExpiresAt > now) {
      newExpiry = new Date(user.subscriptionExpiresAt);
      newExpiry.setDate(newExpiry.getDate() + duration);
    } else {
      newExpiry = new Date();
      newExpiry.setDate(newExpiry.getDate() + duration);
    }

    // ✅ 1. تحديث خطة المستخدم
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        plan: planId,
        subscriptionExpiresAt: newExpiry,
      },
    });

    // ✅ 2. إنشاء سجل دفع (تجديد)
    const payment = await this.prisma.payment.create({
      data: {
        userId,
        amount: price,
        currency: 'USD',
        status: 'SUCCEEDED',
        description: `${plan.name} Plan - ${billingCycle} renewal`,
        paidAt: new Date(),
        metadata: {
          planId,
          billingCycle,
          expiresAt: newExpiry.toISOString(),
          paymentType: 'subscription_renewal',
          isRenewal: true,
          previousExpiry: user.subscriptionExpiresAt?.toISOString() || null,
        },
      },
    });

    // ✅ 3. تسجيل في سجل الاستخدام
    await this.prisma.usageLog.create({
      data: {
        userId,
        action: 'SUBSCRIPTION_RENEWED',
        details: {
          planId,
          billingCycle,
          price,
          newExpiry,
          paymentId: payment.id,
        },
      },
    });

    this.logger.log(
      `✅ Subscription renewed for user ${userId} (${plan.name}) (${billingCycle})`,
    );

    return {
      success: true,
      user: updatedUser,
      payment,
      plan: plan.name,
      price,
      expiresAt: newExpiry,
      isRenewal: true,
    };
  }

  // ✅ إلغاء اشتراك
  async cancelSubscription(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new NotFoundException('User not found');

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        plan: 'free',
        subscriptionExpiresAt: null,
      },
    });

    await this.prisma.usageLog.create({
      data: {
        userId,
        action: 'SUBSCRIPTION_CANCELLED',
        details: {
          previousPlan: user.plan,
          cancelledAt: new Date(),
        },
      },
    });

    this.logger.log(`❌ Subscription cancelled for user ${userId}`);

    return {
      success: true,
      message: 'Subscription cancelled successfully',
      user: updatedUser,
    };
  }

  // ✅ معالجة الاشتراكات المنتهية (مهمة مجدولة)
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async processExpiredSubscriptions() {
    this.logger.log('⏰ Processing expired subscriptions...');

    const now = new Date();

    const expiredUsers = await this.prisma.user.findMany({
      where: {
        plan: { not: 'free' },
        subscriptionExpiresAt: { lt: now },
      },
    });

    const expired: ExpiredUser[] = [];

    for (const user of expiredUsers) {
      // ✅ تحويل إلى خطة مجانية
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          plan: 'free',
          subscriptionExpiresAt: null,
        },
      });

      // ✅ تسجيل الحدث
      await this.prisma.usageLog.create({
        data: {
          userId: user.id,
          action: 'SUBSCRIPTION_EXPIRED',
          details: {
            previousPlan: user.plan,
            expiredAt: user.subscriptionExpiresAt,
          },
        },
      });

      // ✅ إرسال إشعار انتهاء الاشتراك
      const plan = PLANS[user.plan as PlanType];
      const planName = plan?.name || user.plan;

      await this.mailService.sendSubscriptionExpiredNotification(
        user.email,
        user.name || 'User',
        planName,
        user.subscriptionExpiresAt!,
      );

      expired.push({
        userId: user.id,
        email: user.email,
        plan: user.plan,
      });

      this.logger.log(`⏰ User ${user.id} subscription expired, moved to free`);
    }

    return expired;
  }

  // ✅ إرسال تذكير بانتهاء الاشتراك
  async sendExpirationReminders() {
    this.logger.log('📧 Sending subscription expiration reminders...');

    const now = new Date();
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const expiringUsers = await this.prisma.user.findMany({
      where: {
        plan: { not: 'free' },
        subscriptionExpiresAt: {
          gt: now,
          lte: sevenDaysFromNow,
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        subscriptionExpiresAt: true,
      },
    });

    const reminders: {
      userId: string;
      email: string;
      daysRemaining: number;
    }[] = [];

    for (const user of expiringUsers) {
      if (!user.subscriptionExpiresAt) continue;

      const daysRemaining = Math.ceil(
        (user.subscriptionExpiresAt.getTime() - now.getTime()) /
          (1000 * 60 * 60 * 24),
      );

      if (daysRemaining === 7 || daysRemaining === 3 || daysRemaining === 1) {
        const plan = PLANS[user.plan as PlanType];
        const planName = plan?.name || user.plan;

        await this.mailService.sendSubscriptionExpiringWarning(
          user.email,
          user.name || 'User',
          planName,
          user.subscriptionExpiresAt,
          daysRemaining,
        );

        reminders.push({
          userId: user.id,
          email: user.email,
          daysRemaining,
        });

        this.logger.log(
          `📧 Sent expiration reminder to ${user.email} (${daysRemaining} days remaining)`,
        );
      }
    }

    return {
      sent: reminders.length,
      reminders,
    };
  }

  // ✅ جلب جميع الاشتراكات (للأدمن)
  async getAllSubscriptions() {
    const users = await this.prisma.user.findMany({
      where: {
        plan: { not: 'free' },
      },
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        subscriptionExpiresAt: true,
        createdAt: true,
        payments: {
          where: {
            status: 'SUCCEEDED',
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 5,
        },
      },
      orderBy: {
        subscriptionExpiresAt: 'desc',
      },
    });

    const now = new Date();

    return users.map((user) => ({
      ...user,
      isActive: user.subscriptionExpiresAt
        ? user.subscriptionExpiresAt > now
        : false,
      daysRemaining: user.subscriptionExpiresAt
        ? Math.ceil(
            (user.subscriptionExpiresAt.getTime() - now.getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : 0,
      planDetails: PLANS[user.plan as PlanType] || null,
    }));
  }

  // ✅ جلب المدفوعات مع إحصائيات (للأدمن)
  async getAllPayments() {
    const payments = await this.prisma.payment.findMany({
      where: {
        status: 'SUCCEEDED',
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            plan: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);

    const revenueByPlan: { [key: string]: { amount: number; count: number } } =
      {};
    payments.forEach((p) => {
      const metadata = p.metadata as any;
      const planId = metadata?.planId || 'free';
      if (!revenueByPlan[planId]) {
        revenueByPlan[planId] = { amount: 0, count: 0 };
      }
      revenueByPlan[planId].amount += p.amount;
      revenueByPlan[planId].count += 1;
    });

    const monthlyData: { [key: string]: { amount: number; count: number } } =
      {};
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

    return {
      payments,
      stats: {
        totalRevenue,
        totalPayments: payments.length,
        revenueByPlan: Object.entries(revenueByPlan).map(([plan, data]) => ({
          plan,
          amount: data.amount,
          count: data.count,
        })),
        monthlyRevenue,
        averagePayment:
          payments.length > 0 ? totalRevenue / payments.length : 0,
      },
    };
  }

  // ✅ جلب إحصائيات الاشتراكات
  async getSubscriptionStats() {
    const totalUsers = await this.prisma.user.count();
    const freeUsers = await this.prisma.user.count({
      where: { plan: 'free' },
    });
    const paidUsers = totalUsers - freeUsers;

    const usersByPlan = await this.prisma.user.groupBy({
      by: ['plan'],
      _count: {
        id: true,
      },
    });

    const now = new Date();
    const activeSubscriptions = await this.prisma.user.count({
      where: {
        plan: { not: 'free' },
        subscriptionExpiresAt: { gt: now },
      },
    });

    return {
      totalUsers,
      freeUsers,
      paidUsers,
      activeSubscriptions,
      usersByPlan: usersByPlan.map((item) => ({
        plan: item.plan,
        count: item._count.id,
      })),
    };
  }

  // ✅ جلب الاشتراكات المنتهية قريباً (للأدمن)
  async getExpiringSubscriptions(days: number = 7) {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const expiringUsers = await this.prisma.user.findMany({
      where: {
        plan: { not: 'free' },
        subscriptionExpiresAt: {
          gt: now,
          lte: futureDate,
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
        subscriptionExpiresAt: 'asc',
      },
    });

    return expiringUsers.map((user) => ({
      ...user,
      daysRemaining: Math.ceil(
        (user.subscriptionExpiresAt!.getTime() - now.getTime()) /
          (1000 * 60 * 60 * 24),
      ),
      planDetails: PLANS[user.plan as PlanType] || null,
    }));
  }

  // ✅ التحقق من الصلاحيات
  async checkUserCapability(userId: string, action: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    const plan = PLANS[user.plan as PlanId];
    if (!plan) throw new NotFoundException('Plan not found');

    const actionMap: Record<string, { enabled: boolean; limit?: number }> = {
      scan: {
        enabled: plan.unlimitedScans || plan.scansPerDay > 0,
        limit: plan.unlimitedScans ? Infinity : plan.scansPerDay,
      },
      export: { enabled: plan.exportReportsEnabled },
      ai_fix: { enabled: plan.aiFixesEnabled },
      deep_scan: { enabled: plan.deepScanEnabled },
      api_call: { enabled: plan.apiAccessEnabled },
    };

    const capability = actionMap[action];
    if (!capability) {
      throw new BadRequestException(`Unknown action: ${action}`);
    }

    if (!capability.enabled) {
      throw new ForbiddenException(
        `Action "${action}" is not available in your plan`,
      );
    }

    await this.prisma.usageLog.create({
      data: {
        userId,
        action,
        details: { plan: user.plan },
      },
    });

    return {
      allowed: true,
      plan: user.plan,
      limit: capability.limit,
    };
  }

  async checkScanLimit(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    const plan = PLANS[user.plan as PlanId];
    if (!plan) return { allowed: true, used: 0, limit: 5, remaining: 5 };

    if (plan.unlimitedScans) {
      return { allowed: true, used: 0, limit: Infinity, remaining: Infinity };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayScans = await this.prisma.usageLog.count({
      where: {
        userId,
        action: 'scan',
        createdAt: { gte: today },
      },
    });

    const remaining = Math.max(0, plan.scansPerDay - todayScans);

    return {
      allowed: remaining > 0,
      used: todayScans,
      limit: plan.scansPerDay,
      remaining,
    };
  }

  // ✅ سجل الاستخدام
  async getUserUsageLogs(userId: string, limit = 50) {
    return this.prisma.usageLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getUserStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        websites: {
          include: {
            scans: true,
          },
        },
        payments: {
          where: {
            status: 'SUCCEEDED',
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const plan = PLANS[user.plan as PlanId];
    const totalScans = user.websites.reduce(
      (acc, website) => acc + website.scans.length,
      0,
    );

    const totalPaid = user.payments.reduce((sum, p) => sum + p.amount, 0);

    return {
      plan: user.plan,
      planName: plan?.name || 'Free',
      totalWebsites: user.websites.length,
      totalScans,
      totalPaid,
      paymentsCount: user.payments.length,
      websites: user.websites.map((w) => ({
        id: w.id,
        url: w.url,
        domain: w.domain,
        scansCount: w.scans.length,
        lastScan:
          w.scans.length > 0 ? w.scans[w.scans.length - 1].createdAt : null,
      })),
    };
  }

  // ✅ License Keys
  async createLicense(data: {
    planId: PlanId;
    email?: string;
    expiresAt?: Date;
    notes?: string;
  }) {
    const key = this.generateLicenseKey();

    return this.prisma.license.create({
      data: {
        key,
        plan: data.planId,
        email: data.email,
        expiresAt: data.expiresAt,
        notes: data.notes,
        isActive: true,
      },
    });
  }

  async getAllLicenses() {
    return this.prisma.license.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteLicense(id: string) {
    const license = await this.prisma.license.findUnique({
      where: { id },
    });

    if (!license) {
      throw new NotFoundException('License not found');
    }

    return this.prisma.license.delete({
      where: { id },
    });
  }

  async purchaseLicense(data: {
    userId: string;
    planId: PlanId;
    email: string;
    billingCycle: 'monthly' | 'yearly';
  }) {
    const plan = PLANS[data.planId];
    if (!plan) throw new NotFoundException('Plan not found');

    const duration = data.billingCycle === 'monthly' ? 30 : 365;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + duration);

    const license = await this.createLicense({
      planId: data.planId,
      email: data.email,
      expiresAt,
      notes: `Purchased via ${data.billingCycle} billing cycle`,
    });

    await this.prisma.user.update({
      where: { id: data.userId },
      data: { plan: data.planId },
    });

    const price =
      data.billingCycle === 'monthly' ? plan.price : plan.priceYearly;
    await this.prisma.payment.create({
      data: {
        userId: data.userId,
        amount: price,
        currency: 'USD',
        status: 'SUCCEEDED',
        description: `License purchase - ${plan.name} Plan (${data.billingCycle})`,
        paidAt: new Date(),
        metadata: {
          licenseId: license.id,
          planId: data.planId,
          billingCycle: data.billingCycle,
          licenseKey: license.key,
        },
      },
    });

    await this.prisma.usageLog.create({
      data: {
        userId: data.userId,
        action: 'LICENSE_PURCHASE',
        details: {
          planId: data.planId,
          billingCycle: data.billingCycle,
          licenseId: license.id,
        },
      },
    });

    return {
      success: true,
      license,
      plan: plan.name,
      expiresAt,
    };
  }

  async verifyLicense(licenseKey: string, email: string) {
    const license = await this.prisma.license.findUnique({
      where: { key: licenseKey },
    });

    if (!license) {
      throw new BadRequestException('Invalid license key');
    }

    if (!license.isActive) {
      throw new BadRequestException('License key is not active');
    }

    if (license.expiresAt && license.expiresAt < new Date()) {
      throw new BadRequestException('License key has expired');
    }

    await this.prisma.user.update({
      where: { email },
      data: { plan: license.plan },
    });

    await this.prisma.license.update({
      where: { id: license.id },
      data: {
        usedBy: email,
        usedAt: new Date(),
        usesCount: { increment: 1 },
      },
    });

    return {
      valid: true,
      plan: license.plan,
      message: `Successfully upgraded to ${license.plan} plan!`,
    };
  }

  async checkExpiringLicenses() {
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const expiringLicenses = await this.prisma.license.findMany({
      where: {
        isActive: true,
        expiresAt: {
          lte: sevenDaysFromNow,
          gte: new Date(),
        },
      },
    });

    return expiringLicenses;
  }

  async autoExpireLicenses() {
    const expiredLicenses = await this.prisma.license.updateMany({
      where: {
        isActive: true,
        expiresAt: {
          lt: new Date(),
        },
      },
      data: {
        isActive: false,
      },
    });

    const expiredLicensesList = await this.prisma.license.findMany({
      where: {
        isActive: false,
        expiresAt: {
          lt: new Date(),
        },
        usedBy: {
          not: null,
        },
      },
    });

    for (const license of expiredLicensesList) {
      if (license.usedBy) {
        await this.prisma.user.update({
          where: { email: license.usedBy },
          data: { plan: 'free' },
        });
      }
    }

    return expiredLicenses;
  }

  async handleExpiredLicense(licenseKey: string) {
    const license = await this.prisma.license.findUnique({
      where: { key: licenseKey },
    });

    if (!license) throw new NotFoundException('License not found');

    if (license.expiresAt && license.expiresAt < new Date()) {
      await this.prisma.license.update({
        where: { id: license.id },
        data: { isActive: false },
      });

      if (license.usedBy) {
        await this.prisma.user.update({
          where: { email: license.usedBy },
          data: { plan: 'free' },
        });
      }

      return { success: true, message: 'License expired and deactivated' };
    }

    return { success: false, message: 'License is still active' };
  }

  // ✅ توليد مفتاح عشوائي
  private generateLicenseKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const groups: string[] = [];

    for (let i = 0; i < 4; i++) {
      let group = '';
      for (let j = 0; j < 4; j++) {
        group += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      groups.push(group);
    }

    return groups.join('-');
  }
}
