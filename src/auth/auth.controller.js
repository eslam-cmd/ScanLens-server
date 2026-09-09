"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
// server/src/auth/auth.controller.ts
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const auth_service_1 = require("./auth.service");
const register_dto_1 = require("./dto/register.dto");
const login_dto_1 = require("./dto/login.dto");
const jwt_auth_guard_1 = require("./guards/jwt-auth.guard");
let AuthController = class AuthController {
    authService;
    jwtService;
    constructor(authService, jwtService) {
        this.authService = authService;
        this.jwtService = jwtService;
    }
    // ✅ تأكد من وجود هذه الدالة
    getCookieOptions() {
        const isProduction = process.env.NODE_ENV === 'production';
        return {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'none' : 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/',
        };
    }
    async register(dto) {
        return await this.authService.register(dto);
    }
    async login(dto, res) {
        try {
            const result = await this.authService.login(dto);
            console.log('🔍 [DEBUG] Login result:', result);
            return {
                success: true,
                ...result,
            };
        }
        catch (error) {
            const status = error.status || common_1.HttpStatus.UNAUTHORIZED;
            const message = error.message || 'Invalid email or password';
            throw new common_1.HttpException({
                success: false,
                message: message,
                statusCode: status,
            }, status);
        }
    }
    async verifyOtp(dto, res) {
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
    async resendOtp(email) {
        return await this.authService.resendOtp(email);
    }
    async forgotPassword(email) {
        return await this.authService.forgotPassword(email);
    }
    async verifyResetOtp(dto) {
        return await this.authService.verifyResetOtp(dto.email, dto.otp);
    }
    async resetPassword(dto) {
        return await this.authService.resetPassword(dto.email, dto.newPassword, dto.resetToken);
    }
    async changePassword(req, dto) {
        if (!req.user || !req.user.id) {
            throw new common_1.UnauthorizedException('User not authenticated');
        }
        return await this.authService.changePassword(req.user.id, dto.currentPassword, dto.newPassword);
    }
    async updateProfile(req, dto) {
        if (!req.user || !req.user.id) {
            throw new common_1.UnauthorizedException('User not authenticated');
        }
        return await this.authService.updateProfile(req.user.id, dto.name, dto.email);
    }
    async getProfile(req, res) {
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
        }
        catch (error) {
            return { user: null };
        }
    }
    async getProfilePost(req, res) {
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
        }
        catch {
            return { user: null };
        }
    }
    // server/src/auth/auth.controller.ts
    async logout(req, res) {
        try {
            // ✅ الحصول على التوكن من الكوكي أو الـ Header
            const token = req.cookies?.access_token || req.headers.authorization?.split(' ')[1];
            if (token) {
                try {
                    // ✅ فك التوكن للحصول على userId
                    const payload = this.jwtService.verify(token);
                    if (payload && payload.id) {
                        // ✅ تغيير isVerified إلى false في قاعدة البيانات
                        await this.authService.setUserUnverified(payload.id);
                        console.log('🔓 [DEBUG] User unverified after logout:', payload.email);
                    }
                }
                catch (error) {
                    console.log('⚠️ [DEBUG] Token verification failed:', error.message);
                }
            }
        }
        catch (error) {
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
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('register'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [register_dto_1.RegisterDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "register", null);
__decorate([
    (0, common_1.Post)('login'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [login_dto_1.LoginDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('verify-otp'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifyOtp", null);
__decorate([
    (0, common_1.Post)('resend-otp'),
    __param(0, (0, common_1.Body)('email')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "resendOtp", null);
__decorate([
    (0, common_1.Post)('forgot-password'),
    __param(0, (0, common_1.Body)('email')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "forgotPassword", null);
__decorate([
    (0, common_1.Post)('verify-reset-otp'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifyResetOtp", null);
__decorate([
    (0, common_1.Post)('reset-password'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "resetPassword", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Put)('change-password'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "changePassword", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Put)('profile'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "updateProfile", null);
__decorate([
    (0, common_1.Get)('me'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "getProfile", null);
__decorate([
    (0, common_1.Post)('me'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "getProfilePost", null);
__decorate([
    (0, common_1.Post)('logout'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        jwt_1.JwtService])
], AuthController);
