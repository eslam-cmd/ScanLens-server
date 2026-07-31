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
          // ✅ تأكد من قراءة الكوكيز بشكل صحيح
          console.log('🔍 Checking cookies:', req.cookies);

          if (req && req.cookies && req.cookies['access_token']) {
            console.log('✅ Token found in cookies');
            return req.cookies['access_token'];
          }

          // ✅ التحقق من Authorization Header
          if (req && req.headers && req.headers.authorization) {
            const token = req.headers.authorization.replace('Bearer ', '');
            if (token) {
              console.log('✅ Token found in Authorization header');
              return token;
            }
          }

          console.log('❌ No token found');
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
    console.log('🔍 Validating payload:', payload);

    if (!payload || !payload.sub) {
      console.log('❌ Invalid payload - no sub');
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
        },
      });

      if (!user) {
        console.log('❌ User not found:', payload.sub);
        throw new UnauthorizedException('User not found');
      }

      if (!user.isVerified) {
        console.log('❌ User not verified:', user.email);
        throw new UnauthorizedException('Account not verified');
      }

      console.log('✅ User validated:', user.email, user.role);

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        isVerified: user.isVerified,
        role: user.role || 'user',
        plan: user.plan || 'free',
      };
    } catch (error) {
      console.error('❌ JWT Validation Error:', error.message);
      throw new UnauthorizedException('Invalid token');
    }
  }
}
