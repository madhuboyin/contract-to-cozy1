/** @type {import('next').NextConfig} */
const { withSentryConfig } = require('@sentry/nextjs');
const {
  STATIC_SECURITY_HEADERS,
  buildImageRemotePatterns,
} = require('./security-headers');

const nextConfig = {
  reactStrictMode: true,
  // Suppress the X-Powered-By: Next.js response header — avoids advertising
  // the framework version to attackers looking for known CVEs.
  poweredByHeader: false,
  output: 'standalone',
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: buildImageRemotePatterns(),
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },

  async redirects() {
    return [
      // Marketplace alias
      { source: '/marketplace', destination: '/dashboard/providers', permanent: false },

      // Property-scoped canonical redirects
      { source: '/dashboard/properties/:id/home-lab', destination: '/dashboard/home-lab?propertyId=:id', permanent: false },
      { source: '/dashboard/properties/:id/resolution-center', destination: '/dashboard/resolution-center?propertyId=:id', permanent: false },
      { source: '/dashboard/properties/:id/inventory/coverage', destination: '/dashboard/properties/:id/inventory?tab=coverage', permanent: false },

      // Vault consolidation
      { source: '/dashboard/inventory', destination: '/dashboard/vault?tab=assets', permanent: false },
      { source: '/dashboard/documents', destination: '/dashboard/vault?tab=documents', permanent: false },
      // Redirect /dashboard/warranties to vault except when action=new — the creation form must load directly
      { source: '/dashboard/warranties', missing: [{ type: 'query', key: 'action' }], destination: '/dashboard/vault?tab=coverage', permanent: false },
      // Resolution Center
      { source: '/dashboard/actions', destination: '/dashboard/resolution-center', permanent: false },
      { source: '/dashboard/maintenance', destination: '/dashboard/resolution-center?filter=preventive', permanent: false },
      { source: '/dashboard/checklist', destination: '/dashboard/resolution-center', permanent: false },
      { source: '/dashboard/fix', destination: '/dashboard/resolution-center?filter=urgent', permanent: false },
      { source: '/dashboard/emergency', destination: '/dashboard/resolution-center?filter=urgent', permanent: false },
      // replace-repair is a standalone tool; keep it accessible from resolution-center cards
      // { source: '/dashboard/replace-repair', ... } intentionally removed — direct tool links are used
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
      // providers marketplace intentionally kept routable — booking flow links here directly
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
          ...STATIC_SECURITY_HEADERS,
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
