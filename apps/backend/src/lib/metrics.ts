import { Registry, collectDefaultMetrics, Counter, Histogram } from 'prom-client';

export const register = new Registry();

// Collect Node.js default metrics (event loop lag, heap, GC, etc.)
collectDefaultMetrics({ register });

// ─── HTTP metrics ────────────────────────────────────────────────────────────

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [register],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

// ─── Security metrics ────────────────────────────────────────────────────────

export const securityTokenReuseTotal = new Counter({
  name: 'security_token_reuse_total',
  help: 'Number of detected refresh-token replay/reuse events',
  labelNames: ['surface'] as const,
  registers: [register],
});

export const securityAuthDenialsTotal = new Counter({
  name: 'security_auth_denials_total',
  help: 'Authentication/authorization denials returned by security middleware',
  labelNames: ['surface', 'status_code', 'code'] as const,
  registers: [register],
});

export const securityPropertyScopeDenialsTotal = new Counter({
  name: 'security_property_scope_denials_total',
  help: 'Property-scope authorization denials',
  labelNames: ['source', 'status_code'] as const,
  registers: [register],
});

export const securityMfaFailuresTotal = new Counter({
  name: 'security_mfa_failures_total',
  help: 'MFA verification failure events (including lockouts)',
  labelNames: ['stage', 'reason'] as const,
  registers: [register],
});
