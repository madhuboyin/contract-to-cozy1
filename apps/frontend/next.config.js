/** @type {import('next').NextConfig} */
const { withSentryConfig } = require('@sentry/nextjs');

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

  async redirects() {
    return [
      // Vault consolidation
      { source: '/dashboard/inventory', destination: '/dashboard/vault?tab=assets', permanent: false },
      { source: '/dashboard/documents', destination: '/dashboard/vault?tab=documents', permanent: false },
      { source: '/dashboard/warranties', destination: '/dashboard/vault?tab=coverage', permanent: false },
      // Resolution Center
      { source: '/dashboard/actions', destination: '/dashboard/resolution-center', permanent: false },
      { source: '/dashboard/maintenance', destination: '/dashboard/resolution-center?filter=preventive', permanent: false },
      { source: '/dashboard/seasonal', destination: '/dashboard/resolution-center?filter=preventive', permanent: false },
      { source: '/dashboard/checklist', destination: '/dashboard/resolution-center', permanent: false },
      { source: '/dashboard/fix', destination: '/dashboard/resolution-center?filter=urgent', permanent: false },
      { source: '/dashboard/emergency', destination: '/dashboard/resolution-center?filter=urgent', permanent: false },
      { source: '/dashboard/replace-repair', destination: '/dashboard/resolution-center?filter=repair', permanent: false },
      // Save consolidation
      { source: '/dashboard/home-savings', destination: '/dashboard/save', permanent: false },
      { source: '/dashboard/appreciation', destination: '/dashboard/save?tab=appreciation', permanent: false },
      { source: '/dashboard/expenses', destination: '/dashboard/save?tab=expenses', permanent: false },
      { source: '/dashboard/budget', destination: '/dashboard/save?tab=budget', permanent: false },
      { source: '/dashboard/tax-appeal', destination: '/dashboard/save?tab=tax', permanent: false },
      // Protect consolidation
      { source: '/dashboard/insurance', destination: '/dashboard/protect?tab=coverage', permanent: false },
      { source: '/dashboard/coverage-intelligence', destination: '/dashboard/protect?tab=coverage', permanent: false },
      { source: '/dashboard/risk-radar', destination: '/dashboard/protect?tab=risks', permanent: false },
      { source: '/dashboard/climate', destination: '/dashboard/protect?tab=risks', permanent: false },
      // Fix / providers
      { source: '/dashboard/providers', destination: '/dashboard/fix', permanent: false },
    ];
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
            value: 'camera=(self), microphone=(), payment=(), geolocation=(self)',
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

module.exports = withSentryConfig(nextConfig, {
  // Sentry organization and project — set via env vars in CI to avoid
  // committing org details.  Both are optional: if unset, source maps are
  // not uploaded but error capture still works.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Suppress the Sentry CLI output during builds.
  silent: !process.env.CI,

  // Upload source maps in production builds so Sentry shows original TS lines.
  // Requires SENTRY_AUTH_TOKEN to be set in the build environment.
  widenClientFileUpload: true,

  // Tree-shake Sentry debug code from the client bundle.
  disableLogger: true,

  // Do NOT make source maps publicly accessible on the CDN.
  hideSourceMaps: true,

  // Tunnel Sentry requests through the Next.js server to avoid ad-blockers.
  // This sends /monitoring/* requests to Sentry instead of sentry.io directly.
  tunnelRoute: '/monitoring',

  // Automatically instrument React component names in error stack traces.
  reactComponentAnnotation: {
    enabled: true,
  },
});
