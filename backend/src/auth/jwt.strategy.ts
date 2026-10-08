import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Role } from '@prisma/client';
import { settings } from '../common/settings';
import { AuthUser } from './decorators';

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  role: Role;
  therapistId: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: settings().jwtSecret,
    });
  }

  validate(payload: JwtPayload): AuthUser {
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      therapistId: payload.therapistId ?? null,
    };
  }
}
