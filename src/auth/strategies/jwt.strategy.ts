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
          if (req && req.cookies && req.cookies['access_token']) {
            return req.cookies['access_token'];
          }
          return null;
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'super-secret',
    });
  }

  async validate(payload: { sub: string; email: string; role?: string }) {
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    // ✅ جلب المستخدم مع role و plan
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        isVerified: true,
        role: true, // ✅ role من قاعدة البيانات
        plan: true, // ✅ plan من قاعدة البيانات
      },
    });

    if (!user || !user.isVerified) {
      throw new UnauthorizedException('User not found or account not verified');
    }

    // ✅ إرجاع المستخدم مع role و plan
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isVerified: user.isVerified,
      role: user.role || 'user',
      plan: user.plan || 'free',
    };
  }
}
