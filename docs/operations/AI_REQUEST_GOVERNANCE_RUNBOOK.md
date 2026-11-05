# AI request governance runbook

All Gemini-backed capabilities are registered in `sourceRegistry.ts` and must execute through `aiRequestGovernance.service.ts`. The boundary enforces model selection, timeouts, bounded retry, per-route rate limits, circuit breaking, usage accounting, structured-output requirements, and global/per-route kill switches.

## Controls

- `AI_REQUESTS_ENABLED=false` disables every governed request.
- `AI_ROUTE_<ROUTE_ID>_ENABLED=false` disables one route. Route ids are upper-cased and non-alphanumeric characters become underscores.
- `AI_REQUEST_TIMEOUT_MS`, `AI_REQUEST_RATE_LIMIT_PER_MINUTE`, `AI_REQUEST_MAX_ATTEMPTS`, and `AI_REQUEST_RETRY_BACKOFF_MS` set safe global defaults.
- `AI_ROUTE_<ROUTE_ID>_RATE_LIMIT_PER_MINUTE` overrides the request budget for one route.
- `GEMINI_MODEL` and `GEMINI_ADVANCED_MODEL` select the reviewed fast and advanced models centrally.
- `AI_PROMPT_USD_PER_MILLION_TOKENS` and `AI_COMPLETION_USD_PER_MILLION_TOKENS` provide the reviewed provider rates used for cost accounting. Keep them current when model pricing changes.

When disabled, rate-limited, timed out, circuit-open, or structurally invalid, the owning capability must use the fallback and homeowner-facing degradation message declared in the source registry. Extraction routes fail closed and must never promote fields from an unstructured response.

Review `ai_request_total`, `ai_request_duration_seconds`, `ai_request_tokens_total`, and `ai_request_estimated_cost_usd_total` by route/model/outcome. Restore a route only after the provider is healthy and a deterministic/evaluation smoke check passes.

## Shared state across processes (Findings Implementation Plan, Phase 5)

Per-route request counts and circuit state are shared by every backend and worker process through Redis, so one limit and one circuit apply to the whole deployment instead of one per process. This follows configuration, not a feature flag: when `REDIS_HOST` is set the state is shared; when it is not (and in every test run) state is per-process, as before.

- **Keys.** `ai:gov:v1:rate:<routeId>` (a fixed window that starts at the route's first request and expires on its own) and `ai:gov:v1:circuit:<routeId>` (a hash with a stale-key expiry of at least an hour). A route id is a registered id such as `ai:ask`. No user, property, message, prompt or credential is in a key or a metric label.
- **Clock.** Circuit decisions use Redis `TIME`, so host clock skew between pods cannot hold a circuit open or closed.
- **Half-open probe.** When the open period ends, exactly one request across all processes is granted the probe. The grant is a lease (`AI_CIRCUIT_PROBE_TTL_MS`, default the larger of 30 s and twice the request timeout), so a probe whose process died frees the slot after the lease expires. A probe result is applied only if its token is still the lease holder; a slow, reclaimed probe cannot overwrite the current one. A request admitted while the circuit was closed whose result arrives after it opened is ignored (the old per-process breaker let a late success close an open circuit).
- **Provider failure is availability only.** It never authorizes a request and never changes canonical records.

### Provider health (owner decision AI-HEALTH-1, 2026-11-05)

Each route has one shared health record (`ai:gov:v1:health:<routeId>`, kept 30 days idle) updated when a request finishes after its retries: a success marks it HEALTHY and clears the failure run; a failure extends the run across **all** processes and marks it DEGRADED, or UNHEALTHY once the run reaches `AI_CIRCUIT_FAILURE_THRESHOLD`. Successes are written at most every 15 seconds per route; a failure, and the first success after it, are always written. The admin source-health view (`GET /api/admin/source-health`) reads this record, so it shows the whole deployment's view rather than what the answering pod saw.

- **Nothing is published to properties any more.** The old path enumerated every property and wrote a change event per property on each route transition, repeated by each replica. That path is removed for AI routes. Service Price Benchmark health still uses the all-properties path; it was not part of this change.
- **What stopped.** `home-actions` and `capability-suggestions` used to be re-run for every property, and marked STALE, when an AI route changed health. Neither reads AI route health; the only reader of those currentness rows is the stale-output count in the feedback quality report. AI incidents therefore no longer add to that count, and currentness rows already marked STALE by earlier AI incidents stay until another trigger recomputes the consumer. No user-facing surface changed.
- **Registry.** AI sources are declared `healthPropagation: 'READ_TIME'` with no PropertyChange mapping; the registry validator rejects a read-time source that declares one, and still requires a mapping for every recompute source.
- **When Redis is unavailable** the admin view shows this process's own last observation, labelled "Shared AI health is unavailable; showing this process's last observation", or UNKNOWN if it has none. It never invents a status.

### When Redis is unavailable (owner decision AI-GOV-1, 2026-11-05)

If a shared-state call errors or takes longer than `AI_GOVERNANCE_STORE_TIMEOUT_MS` (default 300), the process serves requests from a short-lived, **stricter** per-process fallback and retries Redis after `AI_GOVERNANCE_STORE_RETRY_MS` (default 5000).

- The fallback rate limit is the normal limit times `AI_GOVERNANCE_FALLBACK_LIMIT_FRACTION` (default 0.5, never above 1, never below one request).
- **While the fallback is active, the limit across processes is not enforced and probe exclusivity across processes is not preserved.** Each process sees only its own traffic. This is accepted and disclosed, not hidden.
- Deterministic Ask operations do not call this layer and are unaffected.
- A probe granted by one store is recorded only to that store, so a local probe finishing after Redis recovers cannot change the shared circuit.

Watch `ai_governance_degraded_total{component="rate"|"circuit"|"health", reason="ERROR"|"TIMEOUT"|"FALLBACK_ACTIVE"}`. A sustained non-zero rate means the shared state is not being used. If it is non-zero from the first deploy, check that `REDIS_HOST` is reachable from the pod and that the scripts load (`tests/unit/aiGovernanceLuaParity.test.js` checks them with a Lua interpreter).

A command that times out may still be queued by the Redis client and run after reconnect, so a recovery can briefly over-count the first window. During an outage at most one shared call per component is attempted per retry interval, which bounds this.

### Rollback

Rollback is a reviewed code revert to the prior per-process implementation. There is no permanent dual-mode switch and no compatibility layer.

### What is and is not verified

The state machine and the outage behavior are covered by unit tests; the Redis scripts' decision logic is checked by executing the script text under a Lua interpreter against the TypeScript state machine. Redis atomicity, the concurrent single-winner probe, lease expiry on a real server and cross-pod behavior are covered only by `tests/integration/aiGovernanceRedis.test.js`, which runs when `AI_GOVERNANCE_TEST_REDIS_URL` names a disposable Redis. Until someone runs it, those properties are authored, not proven.
