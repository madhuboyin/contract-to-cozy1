# AI Home Concierge — Ask Operations and Governance

Status: repository implementation baseline
Last updated: August 11, 2026

## Ownership

| Concern | Accountable owner |
| --- | --- |
| Operation definitions, orchestration, persistence | Ask platform / Backend Platform |
| Homeowner workspace, accessibility, continuity | Frontend Platform |
| Domain adapter correctness and professional boundaries | Owning domain team |
| Remote generation gateway, model availability, cost | AI Platform |
| Retention, prompt minimization, access controls | Security and Privacy |
| Golden datasets, negative prompts, E2E and scale evidence | QA and Operations |
| Success metrics and launch scorecard | Data and Analytics |

## Governed registration contract

Every operation must be present in `ASK_OPERATION_DEFINITIONS`. Registration requires a version, intent family, property requirement, execution mode, safety class, property-role floor, canonical adapter key, allowed result-block types, and named evaluation suite. The CI closure gate runs `npm run test:ask` and rejects incomplete definitions or regressions in the golden and negative routing catalog.

The orchestrator enforces the declared role floor before adapter execution and rejects undeclared non-boundary result blocks. Domain services remain authoritative and must independently enforce authorization for writes.

## Runtime controls

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `ASK_ENABLED` | `true` | Global Ask kill switch |
| `ASK_REMOTE_GENERATION_ENABLED` | `true` | Turns off open-ended generation while deterministic Ask remains available |
| `ASK_OPERATION_<OPERATION_ID>_ENABLED` | `true` | Per-operation kill switch |
| `ASK_EXECUTION_TIMEOUT_MS` | `15000` | Bounded execution timeout; maximum accepted value is 120 seconds |
| `ASK_RAW_CONVERSATION_RETENTION_DAYS` | `30` | Raw session, message, execution, event, and receipt retention |
| `ASK_FEEDBACK_RETENTION_DAYS` | `365` | Ask-specific homeowner feedback retention |

When generation is disabled, `GROUNDED_GUIDANCE` returns a typed unavailable boundary and routes the homeowner toward deterministic record questions. It does not synthesize or invent a fallback answer.

## Retention and deletion

- Ask sessions, raw messages, executions, execution events, capture receipts, and confirmation receipts expire together after 30 days by default.
- Ask feedback expires after 365 days by default.
- The production `ask-retention-cleanup` CronJob applies these policies daily in bounded batches.
- `DELETE /api/ask/sessions/:sessionId` lets the authenticated homeowner remove a conversation and its Ask feedback immediately.
- Deleting an Ask session never deletes canonical domain artifacts such as maintenance tasks, invitations, monitors, property facts, or financing profiles. Their owning domain retention policy applies.
- Prometheus metrics contain bounded registry labels only and never include prompts, user IDs, property IDs, addresses, execution IDs, session IDs, or captured values.

## Measurement and cost baseline

The initial deterministic baseline is zero model calls and zero model-token cost for every operation whose definition declares `DETERMINISTIC`. `GROUNDED_GUIDANCE` is the only current `REMOTE_GENERATION` operation.

Operational metrics:

- `ask_executions_total{operation,status,generation_mode}`
- `ask_execution_duration_seconds{operation,generation_mode}`
- `ask_remote_generation_total{outcome}`
- `ask_remote_generation_characters_total{direction}` as the provider-neutral cost proxy
- `ask_feedback_total{rating}`
- `ask_retention_deletions_total{reason}`

The Grafana dashboard reports operation health, p95 latency, deterministic containment, generation volume, and feedback. Provider invoices or token-usage exports remain the financial system of record; character volume is intentionally a stable comparison proxy, not a claimed dollar amount.

Initial alert thresholds:

- execution failure ratio above 5% for 15 minutes: critical;
- p95 execution latency above 5 seconds for 15 minutes: warning;
- enabled remote-generation failure ratio above 20% for 15 minutes: warning.

The product launch target remains p95 ≤ 1.5 seconds for deterministic queries. The 5-second operational alert is a service-degradation threshold, not the product-quality target.

## Release and rollback

1. Run backend type checking and `npm run test:ask`.
2. Run the targeted Ask workspace component test.
3. Apply the Ask Prometheus rule and Grafana dashboard resources.
4. Apply the retention CronJob and verify one dry run against a non-production database.
5. Verify deterministic containment and latency in the dashboard.
6. For an incident, disable the affected `ASK_OPERATION_<ID>_ENABLED` flag. Disable `ASK_REMOTE_GENERATION_ENABLED` for model/provider incidents. Use `ASK_ENABLED=false` only when the entire surface must be paused.

Production launch still requires recorded desktop/mobile E2E, accuracy/latency, restart, horizontal-scale, privacy, and domain-owner sign-off evidence. Repository implementation alone does not manufacture those attestations.
