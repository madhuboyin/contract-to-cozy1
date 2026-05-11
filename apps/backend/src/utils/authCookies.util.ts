import type { Request, Response, CookieOptions } from 'express';
import { jwtConfig } from '../config/jwt.config';

const DURATION_PATTERN = /^(\d+)([smhd])$/i;

function durationToMs(duration: string | number): number {
  if (typeof duration === 'number') {
    return duration * 1000;
  }

  const match = DURATION_PATTERN.exec(duration.trim());
  if (!match) {
    throw new Error(`Unsupported auth cookie duration: ${duration}`);
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();

  const unitMs: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return value * unitMs[unit];
}

const isProduction = process.env.NODE_ENV === 'production';
const cookieDomain = process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined;

export const ACCESS_COOKIE_NAME = isProduction ? '__Host-ctc.at' : 'ctc.at';
export const REFRESH_COOKIE_NAME = isProduction ? '__Host-ctc.rt' : 'ctc.rt';

function buildBaseCookieOptions(path: string, maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path,
    maxAge,
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  };
}

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string }
): void {
  res.cookie(
    ACCESS_COOKIE_NAME,
    tokens.accessToken,
    buildBaseCookieOptions('/', durationToMs(jwtConfig.accessToken.expiresIn))
  );
  res.cookie(
    REFRESH_COOKIE_NAME,
    tokens.refreshToken,
    buildBaseCookieOptions('/api/auth', durationToMs(jwtConfig.refreshToken.expiresIn))
  );
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE_NAME, buildBaseCookieOptions('/', 0));
  res.clearCookie(REFRESH_COOKIE_NAME, buildBaseCookieOptions('/api/auth', 0));
}

export function getAccessTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token.length > 0) return token;
  }

  const cookieToken = req.cookies?.[ACCESS_COOKIE_NAME];
  return typeof cookieToken === 'string' && cookieToken.length > 0 ? cookieToken : null;
}

export function getRefreshTokenFromRequest(req: Request): string | null {
  const bodyToken = req.body?.refreshToken;
  if (typeof bodyToken === 'string' && bodyToken.length > 0) {
    return bodyToken;
  }

  const cookieToken = req.cookies?.[REFRESH_COOKIE_NAME];
  return typeof cookieToken === 'string' && cookieToken.length > 0 ? cookieToken : null;
}
