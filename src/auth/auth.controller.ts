// ============================================================
// ✅ 5. تحديث الـ Auth Controller - server/src/auth/auth.controller.ts
// ============================================================

import {
  Body,
  Controller,
  Post,
  Put,
  UseGuards,
  Request,
  Res,
  Get,
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
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
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

  // server/src/auth/auth.controller.ts - إرجاع role في /me
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@Request() req) {
    return { user: req.user }; // req.user يحتوي على role
  }

  @UseGuards(JwtAuthGuard)
  @Post('me')
  async getProfilePost(@Request() req) {
    return { user: req.user };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token', {
      ...this.getCookieOptions(),
      maxAge: 0,
    });
    return { message: 'Logged out successfully' };
  }
}
