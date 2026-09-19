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
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private jwtService: JwtService,
  ) {}

  // ✅ تأكد من وجود هذه الدالة
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

  // server/src/auth/auth.controller.ts

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const result = await this.authService.login(dto);

      console.log('🔍 [DEBUG] Login result:', result);

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      const status = error.status || HttpStatus.UNAUTHORIZED;
      const message = error.message || 'Invalid email or password';

      throw new HttpException(
        {
          success: false,
          message: message,
          statusCode: status,
        },
        status,
      );
    }
  }

  @Post('verify-otp')
  async verifyOtp(
    @Body() dto: { email: string; code: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyOtp(dto);
    if (result.accessToken) {
      res.cookie('access_token', result.accessToken, this.getCookieOptions());
      return {
        ...result,
        accessToken: result.accessToken,
      };
    }
    return result;
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
    if (!req.user || !req.user.id) {
      throw new UnauthorizedException('User not authenticated');
    }
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
    if (!req.user || !req.user.id) {
      throw new UnauthorizedException('User not authenticated');
    }
    return await this.authService.updateProfile(
      req.user.id,
      dto.name,
      dto.email,
    );
  }

  @Get('me')
  async getProfile(@Request() req, @Res({ passthrough: true }) res: Response) {
    try {
      const authHeader = req.headers.authorization;
      let token = null;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
      if (!token) {
        token = req.cookies?.access_token;
      }
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
    } catch (error) {
      return { user: null };
    }
  }

  @Post('me')
  async getProfilePost(
    @Request() req,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const authHeader = req.headers.authorization;
      let token = null;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
      if (!token) {
        token = req.cookies?.access_token;
      }
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

  // server/src/auth/auth.controller.ts

  @Post('logout')
  async logout(@Request() req, @Res({ passthrough: true }) res: Response) {
    try {
      // ✅ الحصول على التوكن من الكوكي أو الـ Header
      const token =
        req.cookies?.access_token || req.headers.authorization?.split(' ')[1];

      if (token) {
        try {
          // ✅ فك التوكن للحصول على userId
          const payload = this.jwtService.verify(token);
          if (payload && payload.id) {
            // ✅ تغيير isVerified إلى false في قاعدة البيانات
            await this.authService.setUserUnverified(payload.id);
            console.log(
              '🔓 [DEBUG] User unverified after logout:',
              payload.email,
            );
          }
        } catch (error) {
          console.log('⚠️ [DEBUG] Token verification failed:', error.message);
        }
      }
    } catch (error) {
      console.log('⚠️ [DEBUG] Logout error:', error.message);
    }

    // ✅ حذف الكوكيز
    res.clearCookie('access_token', {
      ...this.getCookieOptions(),
      maxAge: 0,
    });

    return {
      message: 'Logged out successfully',
      success: true,
    };
  }
}
