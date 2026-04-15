// apps/frontend/src/middleware.ts
//
// Generates a per-request CSP nonce and sets a strict Content-Security-Policy
// header. Using 'nonce-{nonce}' + 'strict-dynamic' eliminates the need for
// 'unsafe-inline' in script-src, which is the primary XSS mitigation.
//
// Next.js 14 App Router automatically applies the x-nonce request header to
// its own inline hydration scripts. Explicit <Script nonce={nonce}> is required
// for any next/script components added in the future.

import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  // Cryptographically secure nonce — unique per request
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  const faroUrl = process.env.NEXT_PUBLIC_FARO_URL || '';

  // Violation reports go to the backend CSP report endpoint.
  // Using the backend URL (not a same-origin Next.js route) so the report
  // handler runs even when the frontend itself is broken.
  const reportUri = `${apiUrl}/api/csp-report`;

  // Build connect-src: always include the backend API; add Faro collector if configured
  const connectSrc = ['self', apiUrl, faroUrl ? faroUrl : '']
    .filter(Boolean)
    .map((u) => (u === 'self' ? "'self'" : u))
    .join(' ');

  const csp = [
    "default-src 'self'",
    // 'nonce-{nonce}' allows only scripts that carry this request's nonce.
    // 'strict-dynamic' propagates trust to scripts loaded by nonced scripts,
    // which is required for Next.js code-splitting chunks.
    // 'unsafe-inline' has been intentionally removed: CSP Level 2+ browsers
    // ignore it when a valid nonce is present, so it provided no legitimate
    // fallback. Legacy browsers that predate CSP nonces also predate
    // 'strict-dynamic', so they receive no CSP enforcement regardless.
    `script-src 'nonce-${nonce}' 'strict-dynamic'`,
    // Inline styles cannot be nonced (Tailwind utility classes and Radix UI
    // inject styles at runtime). 'unsafe-inline' is unavoidable here until
    // a CSS-in-JS solution that supports nonces is adopted.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    // Tightened from the broad 'https:' to explicit allowed origins.
    // data: is needed for base64-encoded inline images; blob: for local previews.
    "img-src 'self' data: blob: https://contracttocozy.com https://*.contracttocozy.com",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    // PWA: service worker registration requires worker-src; web app manifest
    // fetch requires manifest-src. Both are same-origin only.
    "worker-src 'self'",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
    // Require Trusted Types for all script sinks to prevent DOM-based XSS.
    // React 18 createRoot is Trusted Types-compatible. If a third-party library
    // breaks under this directive, register a narrow TrustedTypePolicy rather
    // than relaxing the directive globally.
    "require-trusted-types-for 'script'",
    // Violation reporting — report-uri for broad browser support,
    // report-to for the modern Reporting API (Chrome 70+, Edge 79+).
    `report-uri ${reportUri}`,
    "report-to csp-endpoint",
  ].join('; ');

  // Forward the nonce to server components via request header so layout.tsx
  // can pass it to any explicit <Script nonce={nonce}> tags.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set('Content-Security-Policy', csp);

  // Reporting-Endpoints — modern Reporting API (pairs with 'report-to csp-endpoint' in CSP)
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
