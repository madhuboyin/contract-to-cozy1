import { Registry, collectDefaultMetrics, Counter, Gauge, Histogram } from 'prom-client';

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

export const apiRateLimitRejectionsTotal = new Counter({
  name: 'api_rate_limit_rejections_total',
  help: 'General API requests rejected by identity scope',
  labelNames: ['identity_scope'] as const,
  registers: [register],
});

// ─── Ask / AI Home Concierge metrics ───────────────────────────────────────
// Labels are bounded registry values. Never attach raw prompts, user IDs,
// property IDs, session IDs, execution IDs, or captured values.

export const askExecutionsTotal = new Counter({
  name: 'ask_executions_total',
  help: 'Ask executions by registered operation, terminal status, and generation mode',
  labelNames: ['operation', 'status', 'generation_mode'] as const,
  registers: [register],
});

export const askExecutionDurationSeconds = new Histogram({
  name: 'ask_execution_duration_seconds',
  help: 'Ask execution duration by registered operation and generation mode',
  labelNames: ['operation', 'generation_mode'] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 15, 30],
  registers: [register],
});

export const askRemoteGenerationTotal = new Counter({
  name: 'ask_remote_generation_total',
  help: 'Remote Ask generation attempts by bounded outcome',
  labelNames: ['outcome'] as const,
  registers: [register],
});

export const askRemoteGenerationCharactersTotal = new Counter({
  name: 'ask_remote_generation_characters_total',
  help: 'Remote Ask generation character volume as a provider-neutral cost proxy',
  labelNames: ['direction'] as const,
  registers: [register],
});

export const askRoutingDecisionsTotal = new Counter({
  name: 'ask_routing_decisions_total',
  help: 'Ask routing decisions by bounded cascade stage and outcome',
  labelNames: ['stage', 'outcome'] as const,
  registers: [register],
});

export const askResultSynthesisTotal = new Counter({
  name: 'ask_result_synthesis_total',
  help: 'Optional result-only Ask synthesis attempts by bounded outcome',
  labelNames: ['outcome'] as const,
  registers: [register],
});

export const askFeedbackTotal = new Counter({
  name: 'ask_feedback_total',
  help: 'Ask execution feedback by rating',
  labelNames: ['rating'] as const,
  registers: [register],
});

export const askRetentionDeletionsTotal = new Counter({
  name: 'ask_retention_deletions_total',
  help: 'Ask sessions deleted by retention or homeowner request',
  labelNames: ['reason'] as const,
  registers: [register],
});

export const askInlineCapturesTotal = new Counter({
  name: 'ask_inline_captures_total',
  help: 'Ask inline capture lifecycle outcomes by registered operation',
  labelNames: ['operation', 'outcome'] as const,
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

// ─── Property Context metrics ───────────────────────────────────────────────
// Labels are bounded catalog identifiers only. Never attach property IDs,
// addresses, users, or fact values to these metrics.

export const propertyContextReadsTotal = new Counter({
  name: 'property_context_reads_total',
  help: 'Property Context scope reads by outcome',
  labelNames: ['scope', 'outcome'] as const,
  registers: [register],
});

export const propertyContextReadDurationSeconds = new Histogram({
  name: 'property_context_read_duration_seconds',
  help: 'Property Context read latency by requested scope',
  labelNames: ['scope'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [register],
});

export const propertyContextFactStatesTotal = new Counter({
  name: 'property_context_fact_states_total',
  help: 'Facts returned by catalog key and typed state',
  labelNames: ['scope', 'fact_key', 'state'] as const,
  registers: [register],
});

export const propertyContextCapturesTotal = new Counter({
  name: 'property_context_captures_total',
  help: 'Canonical contextual fact captures by catalog key and outcome',
  labelNames: ['scope', 'fact_key', 'outcome'] as const,
  registers: [register],
});

export const propertyContextFeatureEvaluationsTotal = new Counter({
  name: 'property_context_feature_evaluations_total',
  help: 'Feature requirement evaluations by registered operation and readiness outcome',
  labelNames: ['feature_key', 'operation_key', 'outcome'] as const,
  registers: [register],
});

export const propertyContextFeatureEvaluationDurationSeconds = new Histogram({
  name: 'property_context_feature_evaluation_duration_seconds',
  help: 'Feature requirement evaluation latency by registered operation',
  labelNames: ['feature_key', 'operation_key'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [register],
});

export const propertyContextFeatureCapturesTotal = new Counter({
  name: 'property_context_feature_captures_total',
  help: 'Feature-scoped capture attempts by registered operation, capture schema, and outcome',
  labelNames: ['feature_key', 'operation_key', 'capture_key', 'outcome'] as const,
  registers: [register],
});

export const propertyContextFeatureCaptureDurationSeconds = new Histogram({
  name: 'property_context_feature_capture_duration_seconds',
  help: 'Feature-scoped capture latency by registered operation and capture schema',
  labelNames: ['feature_key', 'operation_key', 'capture_key'] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

// ─── Ownership Cost Intelligence operations metrics ────────────────────────
// Labels are bounded contract values. Never attach property, user, snapshot,
// source-entity, or fingerprint identifiers to Prometheus labels.

export const ownershipCostCalculationsTotal = new Counter({
  name: 'ownership_cost_calculations_total',
  help: 'Canonical ownership-cost calculation reads by lens and outcome',
  labelNames: ['lens', 'outcome'] as const,
  registers: [register],
});

export const ownershipCostCalculationDurationSeconds = new Histogram({
  name: 'ownership_cost_calculation_duration_seconds',
  help: 'Canonical ownership-cost calculation latency by lens and refresh mode',
  labelNames: ['lens', 'refresh'] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const ownershipCostReplayTotal = new Counter({
  name: 'ownership_cost_replay_total',
  help: 'Read-only ownership-cost replay attempts by bounded outcome',
  labelNames: ['outcome'] as const,
  registers: [register],
});

export const ownershipCostAnomalies = new Gauge({
  name: 'ownership_cost_anomalies',
  help: 'Current ownership-cost operational anomalies by type and severity',
  labelNames: ['type', 'severity'] as const,
  registers: [register],
});

// ─── Home Event Radar homeowner-read metrics ────────────────────────────────
// Endpoint/outcome labels are bounded. Property, user, match, and provider
// identifiers must never be attached to Prometheus labels.

export const radarFeedRequestsTotal = new Counter({
  name: 'radar_feed_requests_total',
  help: 'Canonical Home Event Radar read requests by endpoint and outcome',
  labelNames: ['endpoint', 'outcome'] as const,
  registers: [register],
});

export const radarFeedDurationSeconds = new Histogram({
  name: 'radar_feed_duration_seconds',
  help: 'Canonical Home Event Radar read latency by endpoint and outcome',
  labelNames: ['endpoint', 'outcome'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});
