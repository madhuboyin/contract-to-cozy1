const REPORTING_ENDPOINT_NAME = 'csp-endpoint';
const TRUSTED_TYPES_POLICIES = ['dompurify', 'default', 'nextjs', 'nextjs#bundler'];

function normalizeUrl(url) {
  return typeof url === 'string' && /^https?:\/\//.test(url) ? url : '';
}

function buildCsp({
  nonce,
  apiUrl,
  faroUrl,
  upgradeInsecureRequests = true,
}) {
  const normalizedApiUrl = normalizeUrl(apiUrl);
  const normalizedFaroUrl = normalizeUrl(faroUrl);
  const connectSrc = ["'self'"];

  if (normalizedApiUrl) connectSrc.push(normalizedApiUrl);
  if (normalizedFaroUrl) connectSrc.push(normalizedFaroUrl);

  const reportUri = normalizedApiUrl
    ? `${normalizedApiUrl}/api/csp-report`
    : '/api/csp-report';

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "script-src-attr 'none'",
    "style-src 'self'",
    `style-src-elem 'self' 'nonce-${nonce}'`,
    // Temporary compatibility: the app still uses React inline style attributes
    // extensively for charts, progress bars, and responsive geometry.
    "style-src-attr 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' blob: data: https://contracttocozy.com https://*.contracttocozy.com",
    `connect-src ${connectSrc.join(' ')}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "media-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    // Trusted Types enforcement disabled: Turbopack's loadChunkCached sets
    // script.src without TrustedScriptURL, causing hard-nav fallback + crash.
    // Re-enable once Next.js ships a Turbopack-compatible TrustedScriptURL policy.
    // "require-trusted-types-for 'script'",
    // `trusted-types ${TRUSTED_TYPES_POLICIES.join(' ')}`,
    ...(upgradeInsecureRequests ? ['upgrade-insecure-requests'] : []),
    `report-uri ${reportUri}`,
    `report-to ${REPORTING_ENDPOINT_NAME}`,
  ].join('; ');
}

function shouldUseReportOnly() {
  return process.env.NEXT_PUBLIC_CSP_REPORT_ONLY === 'true';
}

const STATIC_SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'accelerometer=(), autoplay=(), bluetooth=(), browsing-topics=(), camera=(), display-capture=(), geolocation=(self), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), publickey-credentials-get=(self), screen-wake-lock=(), usb=(), web-share=()',
  },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
  { key: 'Origin-Agent-Cluster', value: '?1' },
];

function buildReportingEndpoints(apiUrl) {
  const normalizedApiUrl = normalizeUrl(apiUrl);
  const reportUri = normalizedApiUrl
    ? `${normalizedApiUrl}/api/csp-report`
    : '/api/csp-report';

  return `${REPORTING_ENDPOINT_NAME}="${reportUri}"`;
}

function buildImageRemotePatterns() {
  return [
    ...(process.env.NODE_ENV !== 'production'
      ? [{ protocol: 'http', hostname: 'localhost' }]
      : []),
    { protocol: 'https', hostname: 'contracttocozy.com' },
    { protocol: 'https', hostname: '*.contracttocozy.com' },
    // Placeholder images used in the provider portfolio demo — remove once
    // real provider-uploaded images are served from the CDN.
    { protocol: 'https', hostname: 'via.placeholder.com' },
  ];
}

module.exports = {
  REPORTING_ENDPOINT_NAME,
  STATIC_SECURITY_HEADERS,
  buildCsp,
  buildImageRemotePatterns,
  buildReportingEndpoints,
  shouldUseReportOnly,
};
