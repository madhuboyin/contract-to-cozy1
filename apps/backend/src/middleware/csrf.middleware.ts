// apps/backend/src/middleware/csrf.middleware.ts
//
// Double-submit CSRF protection using csrf-csrf.
//
// How it works:
//   1. On the first request the middleware sets a signed __Host-csrf cookie.
//   2. Subsequent mutating requests (POST/PUT/PATCH/DELETE) must include the
//      same value in the x-csrf-token header.
//   3. The server validates cookie === header value. A cross-origin attacker
//      cannot read the cookie value and therefore cannot forge the header.
//
// Compatibility with the current Bearer-token auth flow:
//   Requests that carry an Authorization: Bearer <token> header are skipped —
//   Bearer tokens are sent explicitly by JS and cannot be triggered by a
//   cross-origin form or img tag, so they are not CSRF-vulnerable.
//   This skip condition ensures existing API clients continue working unchanged
//   while CSRF enforcement is in place for the upcoming httpOnly-cookie auth
//   migration (see AuthContext.tsx TODO).
//
// CSRF_SECRET env var: minimum 32 random bytes. Generate with:
//   openssl rand -hex 32

import { Request, Response, NextFunction } from 'express';
import { doubleCsrf } from 'csrf-csrf';

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.CSRF_SECRET) {
  throw new Error('CSRF_SECRET environment variable must be set in production');
}

const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET ?? 'dev-csrf-secret-change-in-production',

  // Session identifier used to bind the CSRF token to the requester.
  // IP address is a safe fallback for the current Bearer-token auth flow.
  // Replace with req.user?.userId once the httpOnly cookie auth migration lands.
  getSessionIdentifier: (req) => req.ip ?? 'unknown',

  // __Host- prefix enforces Secure + Path=/ — only valid over HTTPS.
  // Fall back to a plain name in development where HTTP is used.
  cookieName: isProduction ? '__Host-psifi.x-csrf-token' : 'x-csrf-token',
  cookieOptions: {
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    httpOnly: true,
  },
  size: 64,
  getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'] as string,

  // Skip CSRF for:
  //   1. Bearer-token requests — browsers never auto-send Authorization headers
  //      cross-origin, so they are not CSRF-vulnerable.
  //   2. Auth endpoints (login, register, forgot/reset password) — these establish
  //      a session and therefore cannot present a prior CSRF token. They are
  //      protected by rate limiting and credential checks instead.
  skipCsrfProtection: (req) =>
    (typeof req.headers.authorization === 'string' &&
      req.headers.authorization.startsWith('Bearer ')) ||
    req.path.startsWith('/auth/'),
});

/**
 * Express middleware that enforces CSRF protection on mutating requests
 * (POST / PUT / PATCH / DELETE) for cookie-authenticated callers.
 * Bearer-token callers are skipped via skipCsrfProtection above.
 */
export const csrfProtection = doubleCsrfProtection;

/**
 * Route handler: GET /api/csrf-token
 * Returns a fresh CSRF token and sets the signed csrf cookie.
 * Frontend should call this once on load and cache the returned token,
 * then include it as the x-csrf-token header on all mutating requests.
 */
export const getCsrfToken = (req: Request, res: Response): void => {
  const token = generateCsrfToken(req, res);
  res.json({ csrfToken: token });
};
