// server/src/subscription/subscription.service.ts
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PLANS, PlanId } from '../plans/plans.config';
import { MailService } from '../mail/mail.service';

type PlanType = PlanId;

// ✅ تعريف الأنواع
// ✅ تصدير الأنواع
export interface RenewedUser {
  userId: string;
  email: string;
  plan: string;
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
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  async getAllPlans() {
    return Object.values(PLANS);
  }

  async getPlan(planId: PlanId) {
    const plan = PLANS[planId];
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async getUserPlan(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    const plan = PLANS[user.plan as PlanId];
    if (!plan) return PLANS.free;
    return plan;
  }

  async updateUserPlan(userId: string, planId: PlanId) {
    const plan = PLANS[planId];
    if (!plan) throw new NotFoundException('Plan not found');

    return this.prisma.user.update({
      where: { id: userId },
      data: { plan: planId },
    });
  }

  // ✅ 1. شراء اشتراك جديد (مع تسجيل الدفع)
  async purchaseSubscription(
    userId: string,
    planId: PlanType,
    billingCycle: 'monthly' | 'yearly',
  ) {
    const plan = PLANS[planId];
    if (!plan) throw new NotFoundException('Plan not found');

    const price = billingCycle === 'monthly' ? plan.price : plan.priceYearly;
    const duration = billingCycle === 'monthly' ? 30 : 365;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + duration);

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        plan: planId,
        subscriptionExpiresAt: expiresAt,
      },
    });

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        amount: price,
        currency: 'USD',
        status: 'SUCCEEDED',
        description: `${plan.name} Plan - ${billingCycle} subscription`,
        paidAt: new Date(),
        metadata: {
          planId,
          billingCycle,
          expiresAt: expiresAt.toISOString(),
        },
      },
    });

    await this.prisma.usageLog.create({
      data: {
        userId,
        action: 'SUBSCRIPTION_PURCHASE',
        details: {
          planId,
          billingCycle,
          price,
          expiresAt,
        },
      },
    });

    await this.mailService.sendPaymentConfirmation(
      updatedUser.email,
      price,
      plan.name,
      billingCycle,
    );

    return {
      success: true,
      user: updatedUser,
      payment,
      plan: plan.name,
      price,
      expiresAt,
    };
  }

  // ✅ 2. تجديد الاشتراك تلقائياً
  async autoRenewSubscriptions(): Promise<{ renewed: any[]; failed: any[] }> {
    const today = new Date();
    const expiringToday = await this.prisma.user.findMany({
      where: {
        plan: { not: 'free' },
        subscriptionExpiresAt: {
          lte: today,
          gt: new Date(today.getTime() - 24 * 60 * 60 * 1000),
        },
      },
    });

    // ✅ تحديد النوع صريحاً
    const renewedUsers: RenewedUser[] = [];
    const failedRenewals: FailedRenewal[] = [];

    for (const user of expiringToday) {
      try {
        const plan = PLANS[user.plan as PlanType];
        const price = plan.price;

        const newExpiry = new Date();
        newExpiry.setDate(newExpiry.getDate() + 30);

        await this.prisma.payment.create({
          data: {
            userId: user.id,
            amount: price,
            currency: 'USD',
            status: 'SUCCEEDED',
            description: `${plan.name} Plan - Auto Renewal`,
            paidAt: new Date(),
            metadata: {
              planId: user.plan,
              billingCycle: 'monthly',
              autoRenew: true,
              expiresAt: newExpiry.toISOString(),
            },
          },
        });

        await this.prisma.user.update({
          where: { id: user.id },
          data: { subscriptionExpiresAt: newExpiry },
        });

        renewedUsers.push({
          userId: user.id,
          email: user.email,
          plan: user.plan,
        });
      } catch (error) {
        failedRenewals.push({
          userId: user.id,
          email: user.email,
          error: error.message,
        });
      }
    }

    return {
      renewed: renewedUsers,
      failed: failedRenewals,
    };
  }

  // ✅ 3. إلغاء الاشتراك المنتهي (تحويل إلى Free)
  async expireSubscriptions() {
    const today = new Date();
    const expiredUsers = await this.prisma.user.findMany({
      where: {
        plan: { not: 'free' },
        subscriptionExpiresAt: { lt: today },
      },
    });

    // ✅ تحديد النوع صريحاً
    const expired: ExpiredUser[] = [];

    for (const user of expiredUsers) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          plan: 'free',
          subscriptionExpiresAt: null,
        },
      });

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

      expired.push({
        userId: user.id,
        email: user.email,
        plan: user.plan,
      });
    }

    return expired;
  }

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
        metadata: { plan: user.plan },
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
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const plan = PLANS[user.plan as PlanId];
    const totalScans = user.websites.reduce(
      (acc, website) => acc + website.scans.length,
      0,
    );

    return {
      plan: user.plan,
      planName: plan?.name || 'Free',
      totalWebsites: user.websites.length,
      totalScans,
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

  // ✅ إنشاء License Key
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

  // ✅ شراء مفتاح (مع دفع وهمي أو حقيقي)
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

    await this.mailService.sendLicensePurchaseConfirmation(
      data.email,
      license.key,
      plan.name,
      expiresAt,
    );

    return {
      success: true,
      license,
      plan: plan.name,
      expiresAt,
    };
  }

  // ✅ التحقق من License Key
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

  // ✅ التحقق من المفاتيح المنتهية
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

    for (const license of expiringLicenses) {
      if (license.email && license.expiresAt) {
        await this.mailService.sendLicenseExpiringWarning(
          license.email,
          license.key,
          license.plan,
          license.expiresAt,
        );
      }
    }

    return expiringLicenses;
  }

  // ✅ إلغاء المفاتيح المنتهية تلقائياً
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

        await this.mailService.sendLicenseExpiredNotification(
          license.usedBy,
          license.key,
          license.plan,
        );
      }
    }

    return expiredLicenses;
  }

  // ✅ معالجة مفتاح منتهي
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

        await this.mailService.sendLicenseExpiredNotification(
          license.usedBy,
          license.key,
          license.plan,
        );
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
