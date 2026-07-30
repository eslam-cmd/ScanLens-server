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

  @Get('plans')
  async getAllPlans() {
    return await this.subscriptionService.getAllPlans();
  }

  @Get('plans/:id')
  async getPlan(@Param('id') id: string) {
    return await this.subscriptionService.getPlan(id as PlanId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-plan')
  async getMyPlan(@Request() req) {
    return await this.subscriptionService.getUserPlan(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Put('update-plan')
  async updatePlan(@Request() req, @Body('planId') planId: string) {
    return await this.subscriptionService.updateUserPlan(
      req.user.id,
      planId as PlanId,
    );
  }

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

  // ✅ شراء اشتراك جديد
  @UseGuards(JwtAuthGuard)
  @Post('purchase')
  async purchaseSubscription(
    @Request() req,
    @Body() body: { planId: string; billingCycle: 'monthly' | 'yearly' },
  ) {
    return await this.subscriptionService.purchaseSubscription(
      req.user.id,
      body.planId as PlanType,
      body.billingCycle,
    );
  }

  // ✅ تجديد الاشتراكات تلقائياً (للأدمن فقط)
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('auto-renew')
  async autoRenewSubscriptions() {
    return await this.subscriptionService.autoRenewSubscriptions();
  }

  // ✅ إلغاء الاشتراكات المنتهية (للأدمن فقط)
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('expire')
  async expireSubscriptions() {
    return await this.subscriptionService.expireSubscriptions();
  }

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
    @Request() req,
    @Body()
    body: { planId: string; email?: string; expiresAt?: Date; notes?: string },
  ) {
    return await this.subscriptionService.createLicense({
      planId: body.planId as PlanId,
      email: body.email,
      expiresAt: body.expiresAt,
      notes: body.notes,
    });
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
}
