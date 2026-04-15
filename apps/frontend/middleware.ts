// apps/frontend/middleware.ts
//
// Single middleware entry point — Next.js only loads middleware from the
// project root; apps/frontend/src/middleware.ts was a dead file and has been
// removed.  This file combines:
//   1. Per-request CSP nonce generation (primary XSS defence)
//   2. Role-based auth routing (redirect unauthenticated / wrong-role users)

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// CSP helpers
// ---------------------------------------------------------------------------

function buildCsp(nonce: string, apiUrl: string, faroUrl: string): string {
  const connectSrc = ['self', apiUrl, faroUrl ? faroUrl : '']
    .filter(Boolean)
    .map((u) => (u === 'self' ? "'self'" : u))
    .join(' ');

  const reportUri = `${apiUrl}/api/csp-report`;

  return [
    "default-src 'self'",
    // 'nonce-{nonce}' allows only scripts that carry this request's nonce.
    // 'strict-dynamic' propagates trust to scripts loaded by nonced scripts,
    // which is required for Next.js code-splitting chunks.
    `script-src 'nonce-${nonce}' 'strict-dynamic'`,
    // Inline styles cannot be nonced (Tailwind + Radix UI inject styles at
    // runtime). 'unsafe-inline' is unavoidable until a nonce-compatible
    // CSS-in-JS solution is adopted.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    // data: for base64-encoded inline images; blob: for local previews.
    "img-src 'self' data: blob: https://contracttocozy.com https://*.contracttocozy.com",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    // PWA: service worker registration + web app manifest fetch.
    "worker-src 'self'",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
    // NOTE: require-trusted-types-for 'script' is intentionally omitted.
    // Next.js's webpack/Turbopack runtime chunks use innerHTML and TrustedScriptURL
    // assignments that are not Trusted Types-compatible and cannot be patched.
    // Enabling this directive breaks the application at runtime. Revisit when
    // Next.js ships full Trusted Types support.
    // Violation reporting — report-uri for broad browser support,
    // report-to for the modern Reporting API (Chrome 70+, Edge 79+).
    `report-uri ${reportUri}`,
    'report-to csp-endpoint',
  ].join('; ');
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/**
 * Decode JWT payload and extract user role.
 *
 * IMPORTANT: This is an UNVERIFIED decode — it reads the payload without
 * checking the signature.  It is used ONLY for client-side routing hints
 * (e.g. redirecting providers to /providers/dashboard).  It is NOT a security
 * boundary.  All actual authorisation is enforced by the backend API which
 * verifies the JWT signature on every request.
 *
 * We also reject obviously expired tokens so stale cookies don't cause
 * redirect loops.
 */
function getUserRoleFromToken(token: string | undefined): string | null {
  if (!token) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');

    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    const decoded = JSON.parse(jsonPayload);

    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      return null;
    }

    const role = decoded.role;
    if (role === 'HOMEOWNER' || role === 'PROVIDER' || role === 'ADMIN') {
      return role;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ------------------------------------------------------------------
  // 1. Generate CSP nonce and attach headers to the forwarded request
  //    so server components can read x-nonce via headers().
  // ------------------------------------------------------------------
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  const faroUrl = process.env.NEXT_PUBLIC_FARO_URL || '';
  const csp = buildCsp(nonce, apiUrl, faroUrl);
  const reportUri = `${apiUrl}/api/csp-report`;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  // ------------------------------------------------------------------
  // 2. Auth routing — bypass for static assets and the Next.js runtime
  // ------------------------------------------------------------------

  // Let Next.js internals and top-level API routes pass through unchanged.
  // The CSP headers are still written to the response below.
  if (pathname.startsWith('/_next') || pathname.startsWith('/api')) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set('Content-Security-Policy', csp);
    response.headers.set('Reporting-Endpoints', `csp-endpoint="${reportUri}"`);
    return response;
  }

  const publicRoutes = [
    '/login',
    '/signup',
    '/providers/join',
    '/providers/login',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
  ];

  const isPublicRoute = pathname === '/' || publicRoutes.some((r) => pathname.startsWith(r));

  const token = request.cookies.get('accessToken')?.value;
  const userRole = getUserRoleFromToken(token);

  // Unauthenticated user on a protected route — redirect to login.
  if (!isPublicRoute && !token) {
    const loginUrl = pathname.startsWith('/providers')
      ? new URL('/providers/login', request.url)
      : new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Provider portal — providers and admins only.
  if (
    pathname.startsWith('/providers/dashboard') ||
    pathname.startsWith('/providers/services') ||
    pathname.startsWith('/providers/bookings') ||
    pathname.startsWith('/providers/calendar') ||
    pathname.startsWith('/providers/portfolio') ||
    pathname.startsWith('/providers/profile')
  ) {
    if (userRole !== 'PROVIDER' && userRole !== 'ADMIN') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // Homeowner dashboard — redirect providers to their portal.
  if (pathname.startsWith('/dashboard') && userRole === 'PROVIDER') {
    return NextResponse.redirect(new URL('/providers/dashboard', request.url));
  }

  // Admin portal — admins only.
  if (pathname.startsWith('/admin') && userRole !== 'ADMIN') {
    const fallback =
      userRole === 'PROVIDER' ? '/providers/dashboard' : '/dashboard';
    return NextResponse.redirect(new URL(fallback, request.url));
  }

  // ------------------------------------------------------------------
  // 3. Build the final response with CSP + Reporting-Endpoints headers
  // ------------------------------------------------------------------
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Reporting-Endpoints', `csp-endpoint="${reportUri}"`);
  return response;
}

export const config = {
  matcher: [
    // Apply to all routes except Next.js internals and static assets.
    // The browser only enforces CSP from the document response, so skipping
    // static chunks has no security impact and avoids unnecessary header overhead.
    {
      source: '/((?!_next/static|_next/image|favicon\\.ico|icons|manifest\\.json).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
