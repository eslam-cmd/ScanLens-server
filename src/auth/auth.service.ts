// server/src/auth/auth.service.ts
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mailService: MailService,
  ) {}

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // ✅ التسجيل مع إضافة role
  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const otp = this.generateOtp();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    // ✅ تحديد إذا كان المستخدم أدمن
    const isAdmin = dto.email === 'hdayaaslam34@gmail.com';

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        verificationCode: otp,
        verificationExpires: otpExpires,
        isVerified: false,
        role: isAdmin ? 'admin' : 'user',
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    await this.mailService.sendVerificationOtp(user.email, otp);

    return {
      message: 'User registered successfully. Verification OTP sent to email.',
      email: user.email,
      requiresVerification: true,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const otp = this.generateOtp();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        verificationCode: otp,
        verificationExpires: otpExpires,
      },
    });

    await this.mailService.sendVerificationOtp(user.email, otp);

    return {
      message: 'Credentials verified. OTP sent to your email.',
      email: user.email,
      requiresVerification: true,
    };
  }

  // ✅ التحقق من OTP وإرجاع التوكن مع role
  async verifyOtp(dto: { email: string; otp?: string; code?: string }) {
    const inputCode = dto.otp || dto.code;

    if (!inputCode) {
      throw new BadRequestException('Verification code is required');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || user.verificationCode !== inputCode) {
      throw new BadRequestException('Invalid verification code');
    }

    if (user.verificationExpires && user.verificationExpires < new Date()) {
      throw new BadRequestException(
        'Verification code has expired. Please request a new one.',
      );
    }

    const updatedUser = await this.prisma.user.update({
      where: { email: dto.email },
      data: {
        isVerified: true,
        verificationCode: null,
        verificationExpires: null,
      },
    });

    const token = this.generateToken(
      updatedUser.id,
      updatedUser.email,
      updatedUser.role,
    );

    return {
      message: 'Account successfully verified',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
      },
      accessToken: token,
    };
  }

  async resendOtp(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new BadRequestException('User with this email does not exist');
    }

    if (user.isVerified) {
      throw new BadRequestException('Account is already verified');
    }

    const otp = this.generateOtp();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        verificationCode: otp,
        verificationExpires: otpExpires,
      },
    });

    await this.mailService.sendVerificationOtp(user.email, otp);

    return { message: 'A new verification code has been sent to your email.' };
  }

  // ✅ 1. طلب إعادة تعيين كلمة المرور
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new NotFoundException('User with this email does not exist');
    }

    const resetToken = this.generateOtp();
    const resetExpires = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: resetToken,
        resetPasswordExpires: resetExpires,
      },
    });

    await this.mailService.sendResetPasswordOtp(user.email, resetToken);

    return {
      message: 'Password reset OTP sent to your email.',
      email: user.email,
    };
  }

  // ✅ 2. التحقق من OTP إعادة تعيين كلمة المرور
  async verifyResetOtp(email: string, otp: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.resetPasswordToken !== otp) {
      throw new BadRequestException('Invalid OTP');
    }

    if (user.resetPasswordExpires && user.resetPasswordExpires < new Date()) {
      throw new BadRequestException(
        'OTP has expired. Please request a new one.',
      );
    }

    const tempToken = this.generateToken(user.id, user.email, user.role, '5m');

    return {
      message: 'OTP verified successfully.',
      resetToken: tempToken,
    };
  }

  // ✅ 3. إعادة تعيين كلمة المرور
  async resetPassword(email: string, newPassword: string, resetToken: string) {
    try {
      const payload = this.jwtService.verify(resetToken);
      if (payload.email !== email) {
        throw new BadRequestException('Invalid reset token');
      }
    } catch {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (newPassword.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    });

    await this.mailService.sendPasswordChangedNotification(user.email);

    return {
      message: 'Password reset successfully.',
    };
  }

  // ✅ 4. تغيير كلمة المرور
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    if (newPassword.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
      },
    });

    await this.mailService.sendPasswordChangedNotification(user.email);

    return {
      message: 'Password changed successfully.',
    };
  }

  // ✅ 5. تحديث الملف الشخصي
  async updateProfile(userId: string, name: string, email: string) {
    const existingUser = await this.prisma.user.findFirst({
      where: {
        email,
        NOT: { id: userId },
      },
    });

    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { name, email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    return {
      message: 'Profile updated successfully',
      user,
    };
  }

  // ✅ 6. جلب الملف الشخصي مع role
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isVerified: true,
        plan: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  // ✅ 7. تجديد الـ Token
  async refreshToken(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        isVerified: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isVerified) {
      throw new UnauthorizedException('Account not verified');
    }

    const token = this.generateToken(user.id, user.email, user.role);

    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  private generateToken(
    userId: string,
    email: string,
    role: string = 'user',
    expiresIn: string = '7d',
  ): string {
    console.log('🔑 Generating token for:', { userId, email, role });
    return this.jwtService.sign(
      { sub: userId, email, role },
      { expiresIn: expiresIn as any },
    );
  }
  async validateToken(token: string): Promise<any | null> {
    try {
      // ✅ التحقق من صحة التوكن
      const payload = this.jwtService.verify(token);

      if (!payload || !payload.sub) {
        return null;
      }

      // ✅ جلب المستخدم من قاعدة البيانات
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          name: true,
          plan: true,
          role: true,
          isVerified: true,
          createdAt: true,
        },
      });

      return user;
    } catch (error) {
      // ✅ التوكن غير صالح
      return null;
    }
  }
}
