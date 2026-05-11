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
const configuredCookieDomain = process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined;

function isIpAddress(hostname: string): boolean {
  return /^[\d.:]+$/.test(hostname);
}

function inferBaseDomain(hostname: string): string | undefined {
  const normalized = hostname.trim().toLowerCase().replace(/^\.+/, '');
  if (!normalized || normalized === 'localhost' || isIpAddress(normalized)) {
    return undefined;
  }

  const parts = normalized.split('.').filter(Boolean);
  if (parts.length <= 2) return normalized;
  return parts.slice(-2).join('.');
}

function resolveCookieDomain(req?: Request): string | undefined {
  if (configuredCookieDomain) {
    return configuredCookieDomain.replace(/^\.+/, '');
  }

  const origin = req?.headers.origin;
  if (typeof origin === 'string') {
    try {
      return inferBaseDomain(new URL(origin).hostname);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function cookieNames(req?: Request): { access: string; refresh: string } {
  const domain = resolveCookieDomain(req);
  if (!isProduction) {
    return { access: 'ctc.at', refresh: 'ctc.rt' };
  }
  if (domain) {
    return { access: '__Secure-ctc.at', refresh: '__Secure-ctc.rt' };
  }
  return { access: '__Host-ctc.at', refresh: '__Host-ctc.rt' };
}

const ACCESS_COOKIE_CANDIDATES = ['__Secure-ctc.at', '__Host-ctc.at', 'ctc.at'];
const REFRESH_COOKIE_CANDIDATES = ['__Secure-ctc.rt', '__Host-ctc.rt', 'ctc.rt'];

function buildBaseCookieOptions(path: string, maxAge: number, req?: Request): CookieOptions {
  const cookieDomain = resolveCookieDomain(req);
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
  req: Request,
  res: Response,
  tokens: { accessToken: string; refreshToken: string }
): void {
  const names = cookieNames(req);
  res.cookie(
    names.access,
    tokens.accessToken,
    buildBaseCookieOptions('/', durationToMs(jwtConfig.accessToken.expiresIn), req)
  );
  res.cookie(
    names.refresh,
    tokens.refreshToken,
    buildBaseCookieOptions('/api/auth', durationToMs(jwtConfig.refreshToken.expiresIn), req)
  );
}

export function clearAuthCookies(req: Request, res: Response): void {
  for (const cookieName of ACCESS_COOKIE_CANDIDATES) {
    res.clearCookie(cookieName, buildBaseCookieOptions('/', 0, req));
  }
  for (const cookieName of REFRESH_COOKIE_CANDIDATES) {
    res.clearCookie(cookieName, buildBaseCookieOptions('/api/auth', 0, req));
  }
}

export function getAccessTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token.length > 0) return token;
  }

  for (const cookieName of ACCESS_COOKIE_CANDIDATES) {
    const cookieToken = req.cookies?.[cookieName];
    if (typeof cookieToken === 'string' && cookieToken.length > 0) {
      return cookieToken;
    }
  }
  return null;
}

export function getRefreshTokenFromRequest(req: Request): string | null {
  const bodyToken = req.body?.refreshToken;
  if (typeof bodyToken === 'string' && bodyToken.length > 0) {
    return bodyToken;
  }

  for (const cookieName of REFRESH_COOKIE_CANDIDATES) {
    const cookieToken = req.cookies?.[cookieName];
    if (typeof cookieToken === 'string' && cookieToken.length > 0) {
      return cookieToken;
    }
  }
  return null;
}
