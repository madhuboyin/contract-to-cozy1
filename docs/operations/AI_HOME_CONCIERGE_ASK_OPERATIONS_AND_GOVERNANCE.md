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

Material writes must also be present in `ASK_DOMAIN_COMMAND_REGISTRY`. The command contract declares the same adapter key and role floor as the operation definition, plus artifact ownership, explicit-confirmation materiality, cancellation behavior, and supported correction modes. Confirmation and cancellation fail closed for undeclared operations. Current registered commands cover maintenance create/complete/update, household invitation, guided-plan creation, quote-comparison creation, refinance-rate monitoring, and home-deadline monitoring.

## Phase 4 command and role matrix

| Command | Viewer | Contributor | Owner | Canonical artifact and correction path |
| --- | --- | --- | --- | --- |
| Maintenance create/complete/update | Blocked | Confirm | Confirm | Maintenance task; edit, archive, or reopen in Maintenance or through a follow-up Ask command |
| Household invitation | Blocked | Blocked | Confirm | Pending household invite; manage or revoke in Household |
| Guided-plan creation | Blocked | Confirm | Confirm | Guidance journey; continue or dismiss in Guidance |
| Quote-comparison creation | Blocked | Confirm | Confirm | Quote workspace; edit or close in Quote Comparison |
| Refinance-rate monitor | Blocked | Confirm | Confirm | Refinance monitor; edit, pause, resume, or stop in Refinance Radar |
| Home-deadline monitor | Blocked | Confirm | Confirm | Stable dated Maintenance task; edit, archive, or reopen in Maintenance or through Ask |

All commands show a typed review card, require explicit consent, expire after 30 minutes, write a confirmation receipt, and return an artifact-linked completion. Creation paths use stable action keys, canonical get-or-create transactions, or the unique nullable `GuidanceJourney.sourceAskExecutionId` key to converge under retries and concurrency. The repository includes the Prisma schema change but intentionally includes no migration script; schema application is user-managed.

## Phase 5 decision-intelligence matrix

| Decision adapter | Canonical owner | Ask boundary |
| --- | --- | --- |
| Sell/hold/rent | Sell/Hold/Rent service | Directional planning comparison; never financial, tax, legal, appraisal, or investment advice |
| Ownership costs | Ownership Cost read model | Missing categories are not zero; cash-outflow and operating-expense lenses remain distinct |
| Quote comparison review | Service Quote Decision workspace and comparability engine | Read-only comparison; never selects, accepts, or endorses a provider |
| Repair/replace | Repair vs Replace engine and selected Inventory item | Item-specific planning model; never a diagnosis or provider quote |
| Capital timeline and reserve | Home Capital Timeline and Reserve Fund | Forecast ranges; never guaranteed failure timing or a substitute for emergency savings |
| Property-tax appeal readiness | Property Tax Center, reviewed rules, and appeal-readiness service | Preparation readiness; never predicts success or replaces official rules/advice |
| Coverage review | Coverage Intelligence | Unknown linkage remains unknown; never asserts coverage without canonical evidence |
| Renovation and permit readiness | Renovation Case, readiness checklist, and Permit Tracker | Organizes current records; never grants legal permission to start work |
| Major-event entry | Live capability registry and readiness policy | Entry-point routing only; creates, shares, or commits nothing automatically |

All nine Phase 5 families are property-authorized, deterministic, independently kill-switchable, and registered with material-decision safety. The Ask eval pack verifies homeowner-language routing, canonical service invocation, professional boundaries, emergency precedence, and out-of-scope precedence. Database-backed outcome accuracy, production-like latency, browser evidence, and domain-owner sign-off remain launch certification gates.

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
- `ask_inline_captures_total{operation,outcome}` for prompted, submitted, resumed, resume-failed, conflict, permission-denied, dismissed, full-form-opened, and repeated-prompt outcomes

The Grafana dashboard reports operation health, p95 latency, deterministic containment, generation volume, feedback, inline-capture resume success, and repeated-prompt rate. Provider invoices or token-usage exports remain the financial system of record; character volume is intentionally a stable comparison proxy, not a claimed dollar amount.

Initial alert thresholds:

- execution failure ratio above 5% for 15 minutes: critical;
- p95 execution latency above 5 seconds for 15 minutes: warning;
- enabled remote-generation failure ratio above 20% for 15 minutes: warning.
- inline capture resume success below 99% with at least 20 attempts: warning;
- repeated capture prompt rate above 1% with at least 20 resumed captures: warning.

The product launch target remains p95 ≤ 1.5 seconds for deterministic queries. The 5-second operational alert is a service-degradation threshold, not the product-quality target.

## Release and rollback

1. Run backend type checking and `npm run test:ask`.
2. Run the targeted Ask workspace component test.
3. Run `npm run test:ask:e2e` and retain desktop/mobile refrigerator, refinance, conflict, not-sure, permission, and full-form fallback evidence.
4. Apply the Ask Prometheus rule and Grafana dashboard resources.
5. Apply the retention CronJob and verify one dry run against a non-production database.
6. Verify deterministic containment, latency, capture resume success, and repeated-prompt rate in the dashboard.
7. For an incident, disable the affected `ASK_OPERATION_<ID>_ENABLED` flag. Disable `ASK_REMOTE_GENERATION_ENABLED` for model/provider incidents. Use `ASK_ENABLED=false` only when the entire surface must be paused.

Production launch still requires recorded desktop/mobile E2E, accuracy/latency, restart, horizontal-scale, privacy, and domain-owner sign-off evidence. Repository implementation alone does not manufacture those attestations.
