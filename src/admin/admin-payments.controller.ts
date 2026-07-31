// server/src/admin/admin-payments.controller.ts

import {
  Controller,
  Get,
  Post,
  UseGuards,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { PLANS } from '../plans/plans.config';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminPaymentsController {
  constructor(private prisma: PrismaService) {}

  /**
   * ✅ جلب جميع المستخدمين المشتركين (غير المجانيين) مع أسعارهم
   */
  @Get('payments')
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
      const planConfig = PLANS[user.plan as keyof typeof PLANS];
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

    const revenueByPlan: { [key: string]: { amount: number; count: number } } =
      {};
    payments.forEach((p) => {
      const planId = p.metadata?.planId || 'free';
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

    const now = new Date();
    const activeUsers = users.filter(
      (u) => u.subscriptionExpiresAt && u.subscriptionExpiresAt > now,
    ).length;

    const planDistribution = Object.entries(
      users.reduce(
        (acc, u) => {
          const plan = u.plan || 'free';
          acc[plan] = (acc[plan] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    ).map(([plan, count]) => ({
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

    console.log(
      `📊 Returning ${payments.length} payments with total revenue $${totalRevenue}`,
    );
    return result;
  }

  /**
   * ✅ إنشاء دفعات للمستخدمين المشتركين (للأدمن فقط)
   */
  @Post('payments/create')
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
    const results: {
      userId: string;
      email: string;
      plan: string;
      price: number;
    }[] = [];

    for (const user of users) {
      // ✅ التحقق من وجود دفعة
      const existing = await this.prisma.payment.count({
        where: {
          userId: user.id,
          status: 'SUCCEEDED',
        },
      });

      if (existing === 0) {
        const planConfig = PLANS[user.plan as keyof typeof PLANS];
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
  @Get('payments/export/csv')
  async exportPaymentsCsv(@Res() res: Response) {
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
      const planConfig = PLANS[user.plan as keyof typeof PLANS];
      const price = planConfig?.price || 0;
      const now = new Date();
      const isActive =
        user.subscriptionExpiresAt && user.subscriptionExpiresAt > now;

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
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','),
      ),
    ].join('\n');

    const filename = `subscribed_users_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(HttpStatus.OK).send(csvContent);
  }
}
