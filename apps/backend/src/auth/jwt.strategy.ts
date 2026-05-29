import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const secret = process.env.JWT_SECRET?.trim();
    if (!secret) {
      throw new Error(
        'JWT_SECRET is required. Set it in apps/backend/.env (use a long random string).',
      );
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  validate(payload: { sub: number; username: string; type: string }) {
    return { sub: payload.sub, username: payload.username, type: payload.type };
  }
}
