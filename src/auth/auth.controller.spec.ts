import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { HttpException, UnauthorizedException } from '@nestjs/common';

// ─────────────────────────────────────────────────────────────────────────────
// الـ Mock هو نسخة وهمية من الـ Service
// بدل ما نتصل بـ database حقيقية، نرجع قيم وهمية نحن نحددها
// ─────────────────────────────────────────────────────────────────────────────
const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
  verifyOtp: jest.fn(),
  resendOtp: jest.fn(),
  forgotPassword: jest.fn(),
  validateToken: jest.fn(),
  setUserUnverified: jest.fn(),
};

const mockJwtService = {
  verify: jest.fn(),
};

// ─────────────────────────────────────────────────────────────────────────────
// هذه دوال مساعدة لإنشاء req و res وهميين
// لأن الـ Controller بيستخدمهم في كل endpoint
// ─────────────────────────────────────────────────────────────────────────────

// res وهمي — بيحاكي response الـ Express
const mockResponse = () => ({
  cookie: jest.fn(), // لما نسوي res.cookie(...)
  clearCookie: jest.fn(), // لما نسوي res.clearCookie(...)
});

// req وهمي — بيحاكي request الـ Express
const mockRequest = (overrides = {}) => ({
  headers: {}, // مثل Authorization header
  cookies: {}, // مثل access_token cookie
  user: null, // بيتحط بعد المصادقة
  ...overrides, // نقدر نضيف أو نغير أي شيء
});

// ─────────────────────────────────────────────────────────────────────────────
// describe = مجموعة تستات، كل مجموعة بتمثل وحدة أو دالة معينة
// ─────────────────────────────────────────────────────────────────────────────
describe('AuthController', () => {
  let controller: AuthController;

  // beforeEach بتشتغل قبل كل تست — بتجهز بيئة نظيفة
  beforeEach(async () => {
    // هون بنبني وحدة تست معزولة — بدون ما نشغل التطبيق كامل
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService }, // نسخة وهمية
        { provide: JwtService, useValue: mockJwtService }, // نسخة وهمية
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);

    // نمسح نتائج الـ mock السابقة حتى لا تأثر على التست الجديد
    jest.clearAllMocks();
  });

  // ── register ──────────────────────────────────────────────────────────────
  describe('register', () => {
    it('يجب أن يرجع النتيجة بعد التسجيل بنجاح', async () => {
      // البيانات اللي بنرسلها
      const dto = {
        name: 'Islam',
        email: 'islam@test.com',
        password: '123456',
      };

      // نحدد شو يرجع الـ service الوهمي
      mockAuthService.register.mockResolvedValue({ success: true });

      // نستدعي الدالة
      const result = await controller.register(dto as any);

      // نتحقق إن الـ service اتستدعى بالبيانات الصح
      expect(mockAuthService.register).toHaveBeenCalledWith(dto);

      // نتحقق من النتيجة
      expect(result).toEqual({ success: true });
    });
  });

  // ── login ─────────────────────────────────────────────────────────────────
  describe('login', () => {
    it('يجب أن يرجع success عند تسجيل دخول صحيح', async () => {
      const dto = { email: 'islam@test.com', password: '123456' };
      mockAuthService.login.mockResolvedValue({ message: 'OTP sent' });

      const result = await controller.login(dto as any, mockResponse() as any);

      // نتحقق إن النتيجة تحتوي على success: true
      expect(result).toEqual({ success: true, message: 'OTP sent' });
    });

    it('يجب أن يرمي HttpException عند بيانات خاطئة', async () => {
      const dto = { email: 'wrong@test.com', password: 'wrong' };

      // نجعل الـ service يرمي خطأ
      mockAuthService.login.mockRejectedValue({
        status: 401,
        message: 'Invalid email or password',
      });

      // نتوقع إن الدالة ترمي HttpException
      await expect(
        controller.login(dto as any, mockResponse() as any),
      ).rejects.toThrow(HttpException);
    });
  });

  // ── verifyOtp ─────────────────────────────────────────────────────────────
  describe('verifyOtp', () => {
    it('يجب أن يحط الـ cookie عند OTP صحيح', async () => {
      const dto = { email: 'islam@test.com', code: '123456' };
      const res = mockResponse() as any;

      // الـ service يرجع accessToken
      mockAuthService.verifyOtp.mockResolvedValue({
        accessToken: 'jwt-token',
        user: { id: 1 },
      });

      await controller.verifyOtp(dto, res);

      // نتحقق إن res.cookie اتستدعت بالاسم الصح
      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        'jwt-token',
        expect.any(Object), // أي object (خيارات الـ cookie)
      );
    });

    it('يجب أن لا يحط cookie إذا ما رجع accessToken', async () => {
      const dto = { email: 'islam@test.com', code: '000000' };
      const res = mockResponse() as any;

      // الـ service ما يرجع accessToken
      mockAuthService.verifyOtp.mockResolvedValue({ message: 'Invalid OTP' });

      await controller.verifyOtp(dto, res);

      // نتحقق إن res.cookie ما اتستدعت
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  // ── resendOtp ─────────────────────────────────────────────────────────────
  describe('resendOtp', () => {
    it('يجب أن يرسل الـ OTP من جديد', async () => {
      mockAuthService.resendOtp.mockResolvedValue({ success: true });

      const result = await controller.resendOtp('islam@test.com');

      expect(mockAuthService.resendOtp).toHaveBeenCalledWith('islam@test.com');
      expect(result).toEqual({ success: true });
    });
  });

  // ── forgotPassword ────────────────────────────────────────────────────────
  describe('forgotPassword', () => {
    it('يجب أن يرسل إيميل استعادة الباسورد', async () => {
      mockAuthService.forgotPassword.mockResolvedValue({ success: true });

      const result = await controller.forgotPassword('islam@test.com');

      expect(mockAuthService.forgotPassword).toHaveBeenCalledWith(
        'islam@test.com',
      );
      expect(result).toEqual({ success: true });
    });
  });

  // ── getProfile ────────────────────────────────────────────────────────────
  describe('getProfile - GET /me', () => {
    it('يجب أن يرجع المستخدم إذا الـ token في الـ Header صحيح', async () => {
      const req = mockRequest({
        headers: { authorization: 'Bearer valid-token' },
      });
      mockAuthService.validateToken.mockResolvedValue({
        id: 1,
        email: 'islam@test.com',
      });

      const result = await controller.getProfile(req, mockResponse() as any);

      expect(result).toEqual({ user: { id: 1, email: 'islam@test.com' } });
    });

    it('يجب أن يرجع المستخدم إذا الـ token في الـ Cookie', async () => {
      const req = mockRequest({ cookies: { access_token: 'cookie-token' } });
      mockAuthService.validateToken.mockResolvedValue({ id: 1 });

      const result = await controller.getProfile(req, mockResponse() as any);

      expect(result).toEqual({ user: { id: 1 } });
    });

    it('يجب أن يرجع { user: null } إذا ما في token', async () => {
      const req = mockRequest(); // لا header ولا cookie

      const result = await controller.getProfile(req, mockResponse() as any);

      expect(result).toEqual({ user: null });
    });

    it('يجب أن يمسح الـ cookie إذا الـ token غير صالح', async () => {
      const req = mockRequest({ cookies: { access_token: 'bad-token' } });
      const res = mockResponse() as any;
      mockAuthService.validateToken.mockResolvedValue(null); // token غير صالح

      const result = await controller.getProfile(req, res);

      // يجب أن يمسح الـ cookie
      expect(res.clearCookie).toHaveBeenCalled();
      expect(result).toEqual({ user: null });
    });
  });

  // ── logout ────────────────────────────────────────────────────────────────
  describe('logout', () => {
    it('يجب أن يمسح الـ cookie ويرجع success', async () => {
      const req = mockRequest({ cookies: { access_token: 'valid-token' } });
      const res = mockResponse() as any;

      // الـ JWT يرجع payload صحيح
      mockJwtService.verify.mockReturnValue({ id: 1, email: 'islam@test.com' });
      mockAuthService.setUserUnverified.mockResolvedValue(undefined);

      const result = await controller.logout(req, res);

      expect(res.clearCookie).toHaveBeenCalled();
      expect(result).toEqual({
        message: 'Logged out successfully',
        success: true,
      });
    });

    it('يجب أن يكمل الـ logout حتى لو الـ token غير صالح', async () => {
      const req = mockRequest({ cookies: { access_token: 'bad-token' } });
      const res = mockResponse() as any;

      // الـ JWT يرمي خطأ
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      const result = await controller.logout(req, res);

      // يجب أن يكمل ويمسح الـ cookie بغض النظر
      expect(res.clearCookie).toHaveBeenCalled();
      expect(result).toEqual({
        message: 'Logged out successfully',
        success: true,
      });
    });
  });
});
