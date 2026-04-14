/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: true,
  // Suppress the X-Powered-By: Next.js response header — avoids advertising
  // the framework version to attackers looking for known CVEs.
  poweredByHeader: false,
  output: 'standalone',
  images: {
    remotePatterns: [
      // http://localhost is only needed during local development and CI.
      // Production images must be served over HTTPS.
      ...(process.env.NODE_ENV !== 'production'
        ? [{ protocol: 'http', hostname: 'localhost' }]
        : []),
      {
        protocol: 'https',
        hostname: 'contracttocozy.com',
      },
      {
        protocol: 'https',
        hostname: '*.contracttocozy.com',
      },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },

  async headers() {
    // NOTE: Content-Security-Policy is intentionally absent here.
    // It is set dynamically per-request by src/middleware.ts using a
    // cryptographic nonce, which eliminates 'unsafe-inline' from script-src.
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

          // Isolate this browsing context from cross-origin windows/popups,
          // preventing Spectre-style cross-window attacks.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },

          // Require cross-origin resources embedded in this page to opt-in to
          // being loaded ('credentialless' is used instead of 'require-corp'
          // because S3 presigned URLs for property images are cross-origin and
          // do not carry CORP headers; 'credentialless' gives the same Spectre
          // protection without blocking those resources).
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },

          // Prevent this origin's resources from being loaded cross-origin
          // without explicit opt-in.
          { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
