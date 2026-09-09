// server/src/admin/admin.controller.ts
import {
  Controller,
  Get,
  Post,
  Delete,
  Put,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }

  @Get('users')
  async getAllUsers() {
    return this.adminService.getAllUsers();
  }

  @Get('payments')
  async getAllPayments() {
    return this.adminService.getAllPayments();
  }

  @Get('licenses')
  async getAllLicenses() {
    return this.adminService.getAllLicenses();
  }

  // ✅ إنشاء مفتاح (مع إمكانية تحديد email)
  @Post('licenses')
  async createLicense(
    @Body()
    body: {
      plan: string;
      email?: string;
      expiresAt?: Date;
      notes?: string;
    },
  ) {
    return this.adminService.createLicense(body);
  }

  @Delete('licenses/:id')
  async revokeLicense(@Param('id') id: string) {
    return this.adminService.revokeLicense(id);
  }

  // ✅ تحديث خطة المستخدم
  @Put('users/:id/plan')
  async changeUserPlan(@Param('id') id: string, @Body('plan') plan: string) {
    return this.adminService.changeUserPlan(id, plan);
  }

  // ✅ حذف مستخدم
  @Delete('users/:id')
  async deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  // ✅ جلب مستخدم محدد
  @Get('users/:id')
  async getUser(@Param('id') id: string) {
    return this.adminService.getUser(id);
  }
}
