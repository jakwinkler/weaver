import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { UserEntity } from '@weaver/db';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { JwtPayload } from './auth.service';
import { currentSessionVersion, tokenSessionVersion } from './session-version';

function cookieOrBearerExtractor(req: Request): string | null {
  const fromHeader = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  if (fromHeader) return fromHeader;
  return req?.cookies?.weaver_token || null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {
    super({
      jwtFromRequest: cookieOrBearerExtractor,
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request & { tenantMembershipRole?: string },
    payload: JwtPayload,
  ) {
    if (payload.tokenType !== 'access') {
      throw new UnauthorizedException('Access token required');
    }
    if (!payload?.sub || !payload.email || !payload.tenantId || !payload.role) {
      throw new UnauthorizedException('Invalid access token');
    }
    // Outside /auth and /public the tenant middleware has already read the version.
    const current = await currentSessionVersion(req, payload.sub, this.users);
    if (current !== tokenSessionVersion(payload)) {
      throw new UnauthorizedException('Session has ended');
    }
    return {
      userId: payload.sub,
      email: payload.email,
      tenantId: payload.tenantId,
      role: req.tenantMembershipRole || payload.role,
    };
  }
}
