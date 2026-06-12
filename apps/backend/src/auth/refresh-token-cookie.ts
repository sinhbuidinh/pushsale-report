import type { CookieOptions, Request, Response } from 'express';
import { durationToMs, getJwtRefreshExpiresIn } from './jwt-config';

export function getRefreshCookieName(): string {
  return process.env.JWT_REFRESH_COOKIE_NAME?.trim() || 'refresh_token';
}

export function getRefreshCookieOptions(): CookieOptions {
  const sameSiteRaw = (
    process.env.COOKIE_SAME_SITE?.trim() || 'lax'
  ).toLowerCase();
  const sameSite =
    sameSiteRaw === 'none'
      ? 'none'
      : sameSiteRaw === 'strict'
        ? 'strict'
        : 'lax';
  const secureEnv = process.env.COOKIE_SECURE?.trim().toLowerCase();
  const secure =
    secureEnv === 'true'
      ? true
      : secureEnv === 'false'
        ? false
        : process.env.NODE_ENV === 'production';

  const path = process.env.JWT_REFRESH_COOKIE_PATH?.trim() || '/';

  return {
    httpOnly: true,
    secure,
    sameSite,
    path,
    maxAge: durationToMs(getJwtRefreshExpiresIn()),
  };
}

export function setRefreshTokenCookie(res: Response, token: string): void {
  res.cookie(getRefreshCookieName(), token, getRefreshCookieOptions());
}

export function clearRefreshTokenCookie(res: Response): void {
  const { maxAge: _maxAge, ...clearOpts } = getRefreshCookieOptions();
  void _maxAge;
  res.clearCookie(getRefreshCookieName(), clearOpts);
}

export function readRefreshTokenFromRequest(req: Request): string | null {
  const value = req.cookies?.[getRefreshCookieName()] as string | undefined;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
