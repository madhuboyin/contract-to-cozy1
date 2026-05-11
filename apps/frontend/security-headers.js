const REPORTING_ENDPOINT_NAME = 'csp-endpoint';

function normalizeUrl(url) {
  return typeof url === 'string' && /^https?:\/\//.test(url) ? url : '';
}

function buildCsp({ nonce, apiUrl, faroUrl }) {
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
    "style-src 'self'",
    `style-src-elem 'self' 'nonce-${nonce}'`,
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
    'upgrade-insecure-requests',
    `report-uri ${reportUri}`,
    `report-to ${REPORTING_ENDPOINT_NAME}`,
  ].join('; ');
}

const STATIC_SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(), geolocation=(self), payment=(), usb=(), bluetooth=(), browsing-topics=()',
  },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
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
  ];
}

module.exports = {
  REPORTING_ENDPOINT_NAME,
  STATIC_SECURITY_HEADERS,
  buildCsp,
  buildImageRemotePatterns,
  buildReportingEndpoints,
};
