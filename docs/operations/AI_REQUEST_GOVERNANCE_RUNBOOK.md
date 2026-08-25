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
