// server/src/subscription/subscription.controller.ts

import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
  Delete,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { PLANS } from '../plans/plans.config';

type PlanId = keyof typeof PLANS;
type PlanType = PlanId;

@Controller('subscription')
export class SubscriptionController {
  constructor(private subscriptionService: SubscriptionService) {}

  // ✅ الخطط
  @Get('plans')
  async getAllPlans() {
    return await this.subscriptionService.getAllPlans();
  }

  @Get('plans/:id')
  async getPlan(@Param('id') id: string) {
    return await this.subscriptionService.getPlan(id as PlanId);
  }

  // ✅ خطة المستخدم
  @UseGuards(JwtAuthGuard)
  @Get('my-plan')
  async getMyPlan(@Request() req) {
    return await this.subscriptionService.getUserPlan(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-subscription')
  async getMySubscription(@Request() req) {
    return await this.subscriptionService.getMySubscription(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Put('update-plan')
  async updatePlan(@Request() req, @Body('planId') planId: string) {
    return await this.subscriptionService.updateUserPlan(
      req.user.id,
      planId as PlanId,
    );
  }

  // ✅ تفعيل اشتراك (لأدمن فقط)
  // server/src/subscription/subscription.controller.ts

  // ✅ تأكد من أن هذا الـ Endpoint موجود
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('activate')
  async activateSubscription(
    @Body()
    body: {
      userId: string;
      planId: string;
      billingCycle: 'monthly' | 'yearly';
    },
  ) {
    return await this.subscriptionService.activateSubscription(
      body.userId,
      body.planId as PlanType,
      body.billingCycle,
    );
  }

  // ✅ تجديد اشتراك (لأدمن فقط)
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('renew')
  async renewSubscription(
    @Body()
    body: {
      userId: string;
      planId: string;
      billingCycle: 'monthly' | 'yearly';
    },
  ) {
    return await this.subscriptionService.renewSubscription(
      body.userId,
      body.planId as PlanType,
      body.billingCycle,
    );
  }

  // ✅ إلغاء اشتراك (لأدمن فقط)
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('cancel')
  async cancelSubscription(@Body('userId') userId: string) {
    return await this.subscriptionService.cancelSubscription(userId);
  }

  // ✅ التحقق من الصلاحيات
  @UseGuards(JwtAuthGuard)
  @Post('check-capability')
  async checkCapability(@Request() req, @Body('action') action: string) {
    return await this.subscriptionService.checkUserCapability(
      req.user.id,
      action,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('scan-limit')
  async checkScanLimit(@Request() req) {
    return await this.subscriptionService.checkScanLimit(req.user.id);
  }

  // ✅ سجل الاستخدام
  @UseGuards(JwtAuthGuard)
  @Get('usage')
  async getUsageLogs(@Request() req, @Query('limit') limit?: string) {
    return await this.subscriptionService.getUserUsageLogs(
      req.user.id,
      limit ? parseInt(limit) : 50,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('stats')
  async getUserStats(@Request() req) {
    return await this.subscriptionService.getUserStats(req.user.id);
  }

  // ✅ إدارة الاشتراكات (للأدمن)
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/all')
  async getAllSubscriptions() {
    return await this.subscriptionService.getAllSubscriptions();
  }

  // ✅ جلب جميع المدفوعات مع الإحصائيات (للأدمن)
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/payments')
  async getAllPayments() {
    return await this.subscriptionService.getAllPayments();
  }

  // ✅ جلب إحصائيات الاشتراكات (للأدمن)
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('admin/stats')
  async getSubscriptionStats() {
    return await this.subscriptionService.getSubscriptionStats();
  }

  // ✅ License Keys
  @Post('verify-license')
  async verifyLicense(@Body() body: { licenseKey: string; email: string }) {
    return await this.subscriptionService.verifyLicense(
      body.licenseKey,
      body.email,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('purchase-license')
  async purchaseLicense(
    @Request() req,
    @Body()
    body: {
      planId: string;
      email: string;
      billingCycle: 'monthly' | 'yearly';
    },
  ) {
    return await this.subscriptionService.purchaseLicense({
      userId: req.user.id,
      planId: body.planId as PlanId,
      email: body.email,
      billingCycle: body.billingCycle,
    });
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('licenses')
  async createLicense(
    @Body()
    body: {
      planId: string;
      email?: string;
      expiresAt?: Date;
      notes?: string;
    },
  ) {
    return await this.subscriptionService.createLicense({
      planId: body.planId as PlanId,
      email: body.email,
      expiresAt: body.expiresAt,
      notes: body.notes,
    });
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('licenses')
  async getAllLicenses() {
    return await this.subscriptionService.getAllLicenses();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete('licenses/:id')
  async deleteLicense(@Param('id') id: string) {
    return await this.subscriptionService.deleteLicense(id);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('check-expiring')
  async checkExpiringLicenses() {
    return await this.subscriptionService.checkExpiringLicenses();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('auto-expire')
  async autoExpireLicenses() {
    return await this.subscriptionService.autoExpireLicenses();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('handle-expired/:key')
  async handleExpiredLicense(@Param('key') key: string) {
    return await this.subscriptionService.handleExpiredLicense(key);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('expiring')
  async getExpiringSubscriptions(@Query('days') days?: string) {
    const daysParam = days ? parseInt(days) : 7;
    return await this.subscriptionService.getExpiringSubscriptions(daysParam);
  }

  /**
   * ✅ إرسال تذكيرات انتهاء الاشتراك يدوياً (للأدمن)
   */
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('send-reminders')
  async sendExpirationReminders() {
    return await this.subscriptionService.sendExpirationReminders();
  }
}
