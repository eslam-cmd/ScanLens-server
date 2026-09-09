"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
// server/src/auth/auth.service.ts
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const bcrypt = __importStar(require("bcrypt"));
const prisma_service_1 = require("../../prisma/prisma.service");
const mail_service_1 = require("../mail/mail.service");
let AuthService = class AuthService {
    prisma;
    jwtService;
    mailService;
    constructor(prisma, jwtService, mailService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
        this.mailService = mailService;
    }
    generateOtp() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }
    // ✅ التسجيل مع إضافة role
    async register(dto) {
        const existingUser = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });
        if (existingUser) {
            throw new common_1.ConflictException('البريد الإلكتروني مسجل مسبقاً');
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
        console.log('📧 [DEBUG] Register - Sending OTP to:', user.email);
        await this.mailService.sendVerificationOtp(user.email, otp);
        return {
            message: 'تم إنشاء الحساب بنجاح. تم إرسال رمز التحقق إلى بريدك الإلكتروني.',
            email: user.email,
            requiresVerification: true,
        };
    }
    // ✅ تسجيل الدخول - دائماً يطلب OTP
    async login(dto) {
        console.log('🔍 [DEBUG] Login attempt with email:', dto.email);
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });
        if (!user) {
            throw new common_1.UnauthorizedException('The email address is not registered. Please register first ❌');
        }
        const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
        if (!isPasswordValid) {
            throw new common_1.UnauthorizedException('The password or email is incorrect ❌ ');
        }
        // ✅ دائماً نرسل OTP ونطلب التحقق
        const otp = this.generateOtp();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000);
        await this.prisma.user.update({
            where: { id: user.id },
            data: {
                verificationCode: otp,
                verificationExpires: otpExpires,
                isVerified: false, // ✅ دائماً false
            },
        });
        console.log('📧 [DEBUG] Login - Sending OTP to:', user.email);
        await this.mailService.sendVerificationOtp(user.email, otp);
        return {
            requiresVerification: true,
            email: user.email,
            message: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني.',
        };
    }
    // ✅ التحقق من OTP وإرجاع التوكن مع role
    async verifyOtp(dto) {
        const inputCode = dto.otp || dto.code;
        if (!inputCode) {
            throw new common_1.BadRequestException('Verification code is required');
        }
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });
        if (!user || user.verificationCode !== inputCode) {
            throw new common_1.BadRequestException('Invalid verification code');
        }
        if (user.verificationExpires && user.verificationExpires < new Date()) {
            throw new common_1.BadRequestException('Verification code has expired. Please request a new one.');
        }
        const updatedUser = await this.prisma.user.update({
            where: { email: dto.email },
            data: {
                isVerified: true,
                verificationCode: null,
                verificationExpires: null,
            },
        });
        const token = this.generateToken(updatedUser.id, updatedUser.email, updatedUser.role);
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
    // ✅ إعادة إرسال OTP
    async resendOtp(email) {
        console.log('🔍 [DEBUG] Resend OTP for email:', email);
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user) {
            throw new common_1.BadRequestException('User with this email does not exist');
        }
        if (user.isVerified) {
            throw new common_1.BadRequestException('Account is already verified');
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
        console.log('📧 [DEBUG] Resend - Sending OTP to:', user.email);
        await this.mailService.sendVerificationOtp(user.email, otp);
        return { message: 'A new verification code has been sent to your email.' };
    }
    // ✅ 1. طلب إعادة تعيين كلمة المرور
    async forgotPassword(email) {
        console.log('🔍 [DEBUG] Forgot password for email:', email);
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user) {
            throw new common_1.NotFoundException('User with this email does not exist');
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
        console.log('📧 [DEBUG] Forgot password - Sending OTP to:', user.email);
        await this.mailService.sendResetPasswordOtp(user.email, resetToken);
        return {
            message: 'Password reset OTP sent to your email.',
            email: user.email,
        };
    }
    // ✅ 2. التحقق من OTP إعادة تعيين كلمة المرور
    async verifyResetOtp(email, otp) {
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        if (user.resetPasswordToken !== otp) {
            throw new common_1.BadRequestException('Invalid OTP');
        }
        if (user.resetPasswordExpires && user.resetPasswordExpires < new Date()) {
            throw new common_1.BadRequestException('OTP has expired. Please request a new one.');
        }
        const tempToken = this.generateToken(user.id, user.email, user.role, '5m');
        return {
            message: 'OTP verified successfully.',
            resetToken: tempToken,
        };
    }
    // ✅ 3. إعادة تعيين كلمة المرور
    async resetPassword(email, newPassword, resetToken) {
        try {
            const payload = this.jwtService.verify(resetToken);
            if (payload.email !== email) {
                throw new common_1.BadRequestException('Invalid reset token');
            }
        }
        catch {
            throw new common_1.BadRequestException('Invalid or expired reset token');
        }
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        if (newPassword.length < 6) {
            throw new common_1.BadRequestException('Password must be at least 6 characters');
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
    async changePassword(userId, currentPassword, newPassword) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isPasswordValid) {
            throw new common_1.BadRequestException('Current password is incorrect');
        }
        if (newPassword.length < 6) {
            throw new common_1.BadRequestException('Password must be at least 6 characters');
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
    async updateProfile(userId, name, email) {
        const existingUser = await this.prisma.user.findFirst({
            where: {
                email,
                NOT: { id: userId },
            },
        });
        if (existingUser) {
            throw new common_1.ConflictException('Email already in use');
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
    async getProfile(userId) {
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
            throw new common_1.NotFoundException('User not found');
        }
        return user;
    }
    // ✅ 7. تجديد الـ Token
    async refreshToken(userId) {
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
            throw new common_1.NotFoundException('User not found');
        }
        if (!user.isVerified) {
            throw new common_1.UnauthorizedException('Account not verified');
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
    generateToken(userId, email, role = 'user', expiresIn = '7d') {
        console.log('🔑 Generating token for:', { userId, email, role });
        return this.jwtService.sign({ sub: userId, email, role }, { expiresIn: expiresIn });
    }
    async validateToken(token) {
        try {
            const payload = this.jwtService.verify(token);
            if (!payload || !payload.sub) {
                return null;
            }
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
        }
        catch (error) {
            return null;
        }
    }
    async setUserUnverified(userId) {
        await this.prisma.user.update({
            where: { id: userId },
            data: {
                isVerified: false,
                verificationCode: null,
                verificationExpires: null,
            },
        });
        console.log('🔓 [DEBUG] User unverified:', userId);
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        mail_service_1.MailService])
], AuthService);
