import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

interface JwtRequestUser {
  sub: number;
  username: string;
  type: string;
}

/**
 * Allows the request only when the JWT-attached user has `type === 'admin'`.
 * Must be combined with `JwtAuthGuard` so that `req.user` is populated.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user as JwtRequestUser | undefined;
    if (!user || user.type !== 'admin') {
      throw new ForbiddenException('Admin role is required.');
    }
    return true;
  }
}
