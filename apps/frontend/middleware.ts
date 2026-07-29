// apps/frontend/middleware.ts
//
// Single middleware entry point — Next.js only loads middleware from the
// project root; apps/frontend/src/middleware.ts was a dead file and has been
// removed.  This file combines:
//   1. Per-request CSP nonce generation (primary XSS defence)
//   2. Role-based auth routing (redirect unauthenticated / wrong-role users)

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  buildCsp,
  buildReportingEndpoints,
  shouldUseReportOnly,
} from './security-headers';

const PUBLIC_FILE_PATH_REGEX =
  /\/[^/?]+\.(?:avif|bmp|css|gif|ico|jpe?g|js|json|map|mp3|mp4|ogg|otf|pdf|png|svg|ttf|txt|wav|webm|webmanifest|webp|woff2?|xml)$/i;
const ACCESS_COOKIE_CANDIDATES = ['__Secure-ctc.at', '__Host-ctc.at', 'ctc.at'] as const;
const SENSITIVE_PAGE_PREFIXES = [
  '/dashboard',
  '/providers/dashboard',
  '/providers/services',
  '/providers/bookings',
  '/providers/calendar',
  '/providers/portfolio',
  '/providers/profile',
  '/admin',
  '/vault',
] as const;
const ADMIN_CONSOLE_PREFIXES = [
  '/dashboard/admin',
  '/dashboard/admin/provider-compliance',
  '/dashboard/admin/diy/templates',
  '/dashboard/analytics-admin',
  '/dashboard/knowledge-admin',
  '/dashboard/worker-jobs',
  '/dashboard/admin/personalization',
  '/dashboard/admin/users',
  '/dashboard/admin/audit',
  '/dashboard/admin/reviews',
  '/dashboard/admin/providers',
  '/dashboard/admin/bookings',
  '/dashboard/admin/cases',
  '/dashboard/admin/work-queues',
  '/dashboard/admin/payments',
  '/dashboard/admin/privacy',
  '/dashboard/admin/content-reviews',
  '/dashboard/admin/shared-data',
  '/dashboard/admin/release-gates',
  '/dashboard/admin/access-certification',
] as const;
const NO_STORE_PAGE_PREFIXES = [
  ...SENSITIVE_PAGE_PREFIXES,
  '/login',
  '/signup',
  '/providers/login',
  '/providers/join',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/reports/share',
  '/gazette/share',
  '/home-score/share',
] as const;

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

function shouldApplyNoStore(pathname: string): boolean {
  return NO_STORE_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isTokenizedOrSharedPage(pathname: string, searchParams: URLSearchParams): boolean {
  return (
    pathname.startsWith('/reports/share/') ||
    pathname.startsWith('/gazette/share/') ||
    (pathname.startsWith('/vault/') && searchParams.has('token'))
  );
}

function applySensitivePageHeaders(
  response: NextResponse,
  pathname: string,
  searchParams: URLSearchParams
): void {
  if (shouldApplyNoStore(pathname)) {
    response.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate, private');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }

  if (isTokenizedOrSharedPage(pathname, searchParams)) {
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('X-Robots-Tag', 'noindex, noarchive, nosnippet, noimageindex');
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isEnabledAcceptanceRoute =
    (pathname === '/acceptance/property-context' &&
      process.env.PROPERTY_CONTEXT_ACCEPTANCE_FIXTURE === '1') ||
    (pathname === '/acceptance/tool-discovery' &&
      process.env.TOOL_DISCOVERY_ACCEPTANCE_FIXTURE === '1') ||
    (pathname === '/acceptance/home-digital-twin' &&
      process.env.HOME_DIGITAL_TWIN_ACCEPTANCE_FIXTURE === '1') ||
    (pathname.startsWith('/acceptance/ownership-costs/') &&
      process.env.OWNERSHIP_COST_ACCEPTANCE_FIXTURE === '1') ||
    (pathname === '/acceptance/savings-benefits' &&
      process.env.SAVINGS_BENEFITS_ACCEPTANCE_FIXTURE === '1');

  // ------------------------------------------------------------------
  // 1. Generate CSP nonce and attach headers to the forwarded request
  //    so server components can read x-nonce via headers().
  // ------------------------------------------------------------------
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  const faroUrl = process.env.NEXT_PUBLIC_FARO_URL || '';
  const csp = buildCsp({
    nonce,
    apiUrl,
    faroUrl,
    upgradeInsecureRequests: !isEnabledAcceptanceRoute,
  });
  const cspHeaderName = shouldUseReportOnly()
    ? 'Content-Security-Policy-Report-Only'
    : 'Content-Security-Policy';

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set(cspHeaderName, csp);

  // ------------------------------------------------------------------
  // 2. Auth routing — bypass for static assets and the Next.js runtime
  // ------------------------------------------------------------------

  // Let Next.js internals and top-level API routes pass through unchanged.
  // The CSP headers are still written to the response below.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    PUBLIC_FILE_PATH_REGEX.test(pathname)
  ) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set(cspHeaderName, csp);
    response.headers.set('Reporting-Endpoints', buildReportingEndpoints(apiUrl));
    applySensitivePageHeaders(response, pathname, request.nextUrl.searchParams);
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
    '/terms',
    '/privacy',
    '/cookies',
  ];

  const isPublicRoute =
    pathname === '/' ||
    publicRoutes.some((r) => pathname.startsWith(r)) ||
    isEnabledAcceptanceRoute;

  const token =
    ACCESS_COOKIE_CANDIDATES.map((name) => request.cookies.get(name)?.value).find(Boolean) ?? undefined;
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

  // Admin console pages — admins only. Homeowners and providers are both
  // redirected away; unlike the provider-portal rule above, providers do
  // not get admin-console access.
  if (
    ADMIN_CONSOLE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    ) &&
    userRole !== 'ADMIN'
  ) {
    const fallback =
      userRole === 'PROVIDER' ? '/providers/dashboard' : '/dashboard';
    return NextResponse.redirect(new URL(fallback, request.url));
  }

  // ------------------------------------------------------------------
  // 3. Build the final response with CSP + Reporting-Endpoints headers
  // ------------------------------------------------------------------
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(cspHeaderName, csp);
  response.headers.set('Reporting-Endpoints', buildReportingEndpoints(apiUrl));
  applySensitivePageHeaders(response, pathname, request.nextUrl.searchParams);
  return response;
}

export const config = {
  matcher: [
    // Apply to all routes except Next.js internals and static assets.
    // The browser only enforces CSP from the document response, so skipping
    // static chunks has no security impact and avoids unnecessary header overhead.
    {
      source: '/((?!_next/static|_next/image|favicon\\.ico|icons|manifest\\.json|sw\\.js).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
