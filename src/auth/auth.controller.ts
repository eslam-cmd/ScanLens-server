// server/src/auth/auth.controller.ts

import {
  Body,
  Controller,
  Post,
  Put,
  UseGuards,
  Request,
  Res,
  Get,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  private getCookieOptions() {
    const isProduction = process.env.NODE_ENV === 'production';

    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    } as const;
  }

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return await this.authService.register(dto);
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return await this.authService.login(dto);
  }

  @Post('verify-otp')
  async verifyOtp(
    @Body() dto: { email: string; code: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyOtp(dto);

    if (result.accessToken) {
      res.cookie('access_token', result.accessToken, this.getCookieOptions());
    }

    const { accessToken, ...responseData } = result;
    return responseData;
  }

  @Post('resend-otp')
  async resendOtp(@Body('email') email: string) {
    return await this.authService.resendOtp(email);
  }

  @Post('forgot-password')
  async forgotPassword(@Body('email') email: string) {
    return await this.authService.forgotPassword(email);
  }

  @Post('verify-reset-otp')
  async verifyResetOtp(@Body() dto: { email: string; otp: string }) {
    return await this.authService.verifyResetOtp(dto.email, dto.otp);
  }

  @Post('reset-password')
  async resetPassword(
    @Body() dto: { email: string; newPassword: string; resetToken: string },
  ) {
    return await this.authService.resetPassword(
      dto.email,
      dto.newPassword,
      dto.resetToken,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Put('change-password')
  async changePassword(
    @Request() req,
    @Body() dto: { currentPassword: string; newPassword: string },
  ) {
    return await this.authService.changePassword(
      req.user.id,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Put('profile')
  async updateProfile(
    @Request() req,
    @Body() dto: { name: string; email: string },
  ) {
    return await this.authService.updateProfile(
      req.user.id,
      dto.name,
      dto.email,
    );
  }

  // ✅ **الإصلاح**: لا تستخدم JwtAuthGuard هنا
  // استخدم دالة مخصصة للتحقق من التوكن بشكل صامت
  @Get('me')
  async getProfile(@Request() req, @Res({ passthrough: true }) res: Response) {
    try {
      // ✅ التحقق من التوكن في الـ cookies
      const token = req.cookies?.access_token;

      if (!token) {
        // ✅ لا تطبع أي شيء، فقط ارجع null
        return { user: null };
      }

      // ✅ التحقق من صحة التوكن باستخدام AuthService
      const user = await this.authService.validateToken(token);

      if (!user) {
        // ✅ التوكن غير صالح - احذف الكوكي
        res.clearCookie('access_token', {
          ...this.getCookieOptions(),
          maxAge: 0,
        });
        return { user: null };
      }

      // ✅ المستخدم موجود
      return { user };
    } catch (error) {
      // ✅ في حالة الخطأ، ارجع null بدون طباعة أي شيء
      return { user: null };
    }
  }

  // ✅ نسخة POST لنفس الدالة (للتوافق مع بعض الإعدادات)
  @Post('me')
  async getProfilePost(
    @Request() req,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const token = req.cookies?.access_token;

      if (!token) {
        return { user: null };
      }

      const user = await this.authService.validateToken(token);

      if (!user) {
        res.clearCookie('access_token', {
          ...this.getCookieOptions(),
          maxAge: 0,
        });
        return { user: null };
      }

      return { user };
    } catch {
      return { user: null };
    }
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token', {
      ...this.getCookieOptions(),
      maxAge: 0,
    });
    return { message: 'Logged out successfully' };
  }

  // ✅ تجديد الـ Token
  @UseGuards(JwtAuthGuard)
  @Post('refresh')
  async refreshToken(
    @Request() req,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.user.id;
    const result = await this.authService.refreshToken(userId);

    if (result.accessToken) {
      res.cookie('access_token', result.accessToken, this.getCookieOptions());
    }

    return result;
  }
}
