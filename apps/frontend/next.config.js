/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },

  async headers() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

    // Content-Security-Policy directives.
    // NOTE: script-src includes 'unsafe-inline' because Next.js 14 App Router
    // injects inline hydration scripts that cannot be removed without a
    // per-request nonce. Nonce-based CSP via middleware.ts is the hardening
    // follow-up that eliminates this exception.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",  // Tailwind + Radix UI inline styles
      "font-src 'self'",                   // next/font self-hosts at build time — no external origins needed
      "img-src 'self' data: blob: https:", // allow HTTPS images (property photos from cloud storage)
      `connect-src 'self' ${apiUrl}`,      // API calls
      "frame-ancestors 'none'",            // belt-and-suspenders with X-Frame-Options: DENY
      "base-uri 'self'",                   // prevent base-tag injection
      "form-action 'self'",                // prevent cross-origin form submission
      "object-src 'none'",                 // no Flash/plugins
      "upgrade-insecure-requests",
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent clickjacking — this app has no legitimate iframe use case
          { key: 'X-Frame-Options', value: 'DENY' },

          // Block MIME-type sniffing attacks
          { key: 'X-Content-Type-Options', value: 'nosniff' },

          // Force HTTPS for 1 year — includeSubDomains covers all subdomains.
          // Do NOT add `preload` until the domain is ready for HSTS preload list submission.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },

          // Limit referrer information sent to third-party origins
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

          // Restrict browser feature access. geolocation=(self) is required
          // for neighbourhood intelligence and location-based features.
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), payment=(), geolocation=(self)',
          },

          // Suppress DNS prefetch to avoid leaking navigation intent
          { key: 'X-DNS-Prefetch-Control', value: 'off' },

          // Content Security Policy
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
