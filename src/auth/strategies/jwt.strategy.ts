// server/src/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          // ✅ جلب التوكن من Authorization Header أولاً
          const authHeader = req.headers.authorization;
          if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
          }

          // ✅ جلب التوكن من الكوكيز
          if (req && req.cookies && req.cookies['access_token']) {
            return req.cookies['access_token'];
          }

          return null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'super-secret',
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    payload: { sub: string; email: string; role?: string },
  ) {
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          name: true,
          isVerified: true,
          role: true,
          plan: true,
          subscriptionExpiresAt: true,
        },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // ✅ لا نمنع المستخدمين غير الموثقين، نسمح لهم بالدخول
      // ولكن سيتم منعهم من الوصول إلى بعض endpoints لاحقاً

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        isVerified: user.isVerified,
        role: user.role || 'user',
        plan: user.plan || 'free',
        subscriptionExpiresAt: user.subscriptionExpiresAt,
        subscription: user.subscriptionExpiresAt
          ? { expiresAt: user.subscriptionExpiresAt }
          : null,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
