# ContractToCozy Worker Module Audit and Implementation Plan

Status: Dedicated audit complete; implementation plan proposed

Date: July 19, 2026

Implementation status update: July 20, 2026

The original findings below preserve the audit baseline. Since that audit, the unified Home integration has advanced:

- seasonal checklists now promote one grouped, property-scoped canonical Home Action for the active or nearest season rather than depending on notification discovery;
- the seasonal Home Action exposes applicable and critical task counts, completion progress, timing, evidence, and a direct checklist destination;
- canonical severe-weather actions now surface distinctly on Home with urgent priority, NWS attribution/instructions, event expiry, and safety-appropriate lifecycle restrictions;
- incident-derived weather guidance is suppressed when it duplicates the canonical severe-weather event; and
- worker notification delivery remains an awareness channel, while unresolved homeowner work persists in the canonical Home and Prioritized Action Plan.

Accordingly, W1 item 5 (seasonal reconciliation with Unified Home and Plan & Projects) and the weather-to-Home presentation portion of W3 are complete. Other W1/W3 findings remain governed by their own implementation and validation evidence; this update does not mark the entire worker plan complete.

Scope: `apps/workers`, the backend-owned worker registry and manual-trigger service, worker deployment/build configuration, worker-generated notifications and routes, and worker-specific tests.

## 1. Executive verdict

The worker module is **partially aligned** with the updated ContractToCozy product framework. The strongest alignment is in risk/safety processing, provider compliance, permit context enforcement, canonical notification delivery, Phase 6 warranty monitoring, and several property-context-aware jobs. The module builds successfully and its current native unit suite passes.

It is not yet appropriate to certify the whole worker estate as product-framework complete. The audit found four release-significant gaps:

1. the maintenance-reminder job reports reminders as sent but performs no delivery;
2. seasonal notifications send email directly and bypass the canonical notification preference, cadence, quiet-hours, outcome, and suppression policy;
3. worker-generated deep links are outside the executable route audit; and
4. scheduled work has no centralized, flag-driven execution policy suitable for a single shared beta environment.

The reliability and test architecture also needs hardening. Forty-three jobs are present in the registry, six long-running pollers/runners operate outside that registry, the worker has 62 direct imports from backend source, and its Dockerfile is a 442-line copy-and-rewrite assembly process. The native worker test suite contains 30 tests across five files, but most validate helper logic rather than job execution, scheduler consistency, idempotency, retries, or canonical product contracts.

### Beta completion rule

There are no real users and no development or staging environments. Therefore:

- this plan does not require a database migration, database reset, test database, or destructive database acceptance suite;
- implementation is validated with builds, static contract tests, dependency-injected unit tests, fakes, dry runs, and tightly scoped manual smoke tests;
- human approvals must remain advisory while `ENFORCE_HUMAN_POLICY_APPROVALS=false`;
- technical authorization, safety, evidence, property context, data isolation, and idempotency controls are never bypassed; and
- real-user outcome evidence is a pre-launch operational requirement, not a current code-completion gate.

## 2. Product-framework standard for background work

Every job that creates or changes homeowner-visible state must declare and enforce:

| Contract | Required worker behavior |
|---|---|
| Customer job | Map to `STAY_AHEAD`, `DECIDE`, `MAJOR_MOMENT`, or `PLATFORM_OPERATIONS`. |
| Property scope | Use explicit property identity; never infer across households. |
| Trigger and evidence | Persist or reference the signal, source, effective time, confidence, and provenance that justified the work. |
| Canonical action | Promote actionable results through the existing Home Action/source-adapter model, not a parallel reminder or checklist identity. |
| Trust boundary | Apply consequence tier, confidence, professional boundary, jurisdiction, and conservative failure behavior before material effects. |
| Notification policy | Create homeowner notifications through `NotificationService.create`; delivery workers alone may update delivery records or call channel transports. |
| Cadence | Immediate delivery is reserved for safety, active damage, material deadlines, and workflow changes. Routine items use the weekly Home Brief. |
| Lifecycle | Use stable action/idempotency keys and do not recreate completed, dismissed, snoozed, or superseded work. |
| Learning | Link shown, delivered, opened, acted, resolved, verified, and usefulness outcomes where applicable. |
| Operations | Expose enabled state, last outcome, duration, counts, skip reason, and failure reason without sensitive values. |

Read-only operational jobs may map to `PLATFORM_OPERATIONS`, but they must still declare scope, failure semantics, resource limits, and observability.

## 3. Audit method and evidence

The audit inspected:

- all 45 `*.job.ts` files under `apps/workers/src/jobs`;
- all six files under `apps/workers/src/runners`;
- the 43-entry `JOB_REGISTRY`;
- cron handler registration, BullMQ workers, manual triggers, leases, retry behavior, and metrics in `apps/workers/src/worker.ts`;
- notification creation and channel delivery paths;
- worker-generated dashboard URLs;
- backend service reuse and Docker packaging;
- Kubernetes and Docker Compose configuration; and
- worker-native and cross-application worker tests.

Validation executed during the audit:

```text
apps/workers npm run build: PASS
apps/workers npm test:      PASS (30/30)
frontend route audit:       PASS (214 routes), but worker sources are not scanned
```

The passing build and tests establish compile health for the checked-out source. They do not establish runtime behavior against Redis, SMTP, object storage, external providers, or the database.

## 4. Architecture inventory

### 4.1 Registered jobs

| Domain | Registered jobs | Current assessment |
|---|---|---|
| Property intelligence | `property-intelligence` | Partially aligned. Property-scoped, but combines risk, financial, hidden-asset, and score projections in one queue and retains score-centric behavior that must remain subordinate to canonical actions. |
| Recalls | `recall-ingest`, `recall-match` | Substantially aligned. Source ingestion and matching are separated; follow-ups use canonical notifications and stable records. Add registry and idempotency contract coverage. |
| Notifications | `email-notification`, `push-notification`, `sms-notification`, `daily-email-digest`, `weekly-home-brief-digest`, `weekly-retention-report` | Mixed. Email and weekly brief are aligned. Push/SMS are unimplemented placeholders and should be inactive in the pilot. Retention reporting is operational, not a homeowner outcome. |
| Maintenance | `maintenance-reminders`, `new-home-warranty-deadlines`, `seasonal-checklist-generation`, `seasonal-checklist-expiration`, `seasonal-notifications`, `inventory-draft-cleanup` | Mixed. Warranty monitoring is aligned. Maintenance reminders are defective. Seasonal email bypasses canonical delivery policy. Seasonal state still has legacy checklist boundaries. Cleanup is operational. |
| Risk and safety | `coverage-lapse-incidents`, `freeze-risk-incidents`, `severe-weather-alerts`, `weekly-score-snapshots`, `hidden-asset-refresh`, `provider-credential-expire`, `provider-credential-lapse`, `provider-missing-credential-sweep`, `tax-assessment-ingest`, `expire-guidance-signals` | Generally aligned at the service boundary. Verify canonical Home Action promotion, safe degradation, source freshness, and failure propagation for every job. Weekly scores and hidden-asset refresh must not become competing homeowner surfaces. |
| Neighborhood | `neighborhood-radar-refresh`, `neighborhood-change-notifications` | Partially aligned. Property context and canonical notification creation exist. Worker deep links are not route-audited and usefulness/noise outcomes need explicit coverage. |
| Financial market | `mortgage-rate-ingest`, `reserve-fund-recalculation`, `reserve-fund-reconciliation`, `reserve-fund-balance-reminder` | Substantially aligned where shared context checks are used. External-source freshness, educational-estimate boundaries, duplicate suppression, and failure semantics need executable tests. |
| Home intelligence | `home-briefing-delivery`, `shared-data-backfill`, `shared-data-consistency-audit`, `shared-signal-refresh`, `shared-signal-health-audit` | Mixed. Signal refresh/health and consistency diagnostics support the framework. Automatic daily backfill is inappropriate for the current greenfield/no-migration operating model and should be disabled by default. Home Briefing must remain evidence- and cadence-governed. |
| Home care | `home-habit-generation` | Partially aligned. It uses shared property-context applicability; generated habits still need canonical action/lifecycle and noise controls. |
| Permit and project compliance | `permit-inspection-reminders`, `permit-fetch`, `detect-unpermitted-work`, `generate-permit-disclosure` | Substantially aligned. Shared property-context checks exist. Add job-level trust, provenance, idempotency, route, and export-failure tests. |
| DIY | `generate-diy-ai-guide` | Partially aligned. It is user-triggered, but AI safety boundaries, evidence limitations, retry/idempotency, and packaging parity need explicit worker tests. |

### 4.2 Jobs, runners, and helpers outside the registry

| Component | Role | Audit finding |
|---|---|---|
| `homeReportExport.poller` | Claims pending Home Report exports | Operationally valid, but invisible as a first-class registry job and managed by an endless restart loop. |
| `materialSpecExport.poller` | Claims pending material-spec exports | Same registry and observability gap. |
| `reportExport.cleanup` | Expires/deletes exported reports | Destructive lifecycle work needs explicit enablement, dry-run support, and retention tests. |
| `highPriorityEmailEnqueue.poller` | Enqueues pending high-priority email deliveries | Strong rollback handling exists; it needs overlap protection and stuck-delivery metrics. |
| `domainEvents.poller` | Processes pending/failed domain events | Uses state claiming, but is not represented in the job registry or admin view. |
| `claimFollowUpDue.poller` | Emits idempotent claim follow-up events | Product-aligned, but unregistered and not covered by worker-native tests. |
| `sendFeedbackNotification` | Sends internal pilot feedback email | Direct transport is acceptable for an internal operational recipient, but recipient policy, retry behavior, and redaction should be explicit. |
| Dummy radar, risk, and neighborhood ingests | Generate synthetic fixtures | Correctly fail closed in production. A single-environment beta needs a safer, property-allowlisted smoke mechanism rather than global production enablement. |

`ingestRecalls.job.ts` is an internal implementation used by the registered recall-ingest wrapper and is not a separate schedulable job.

## 5. Findings

### 5.1 Critical and high-priority findings

#### WKR-001 — Maintenance reminders report false success

`sendMaintenanceReminders` reads legacy `ChecklistItem` rows, creates email text, and logs that each reminder was sent. It never creates a notification, queues a delivery, or calls the email transport. The outer function catches fatal errors and does not rethrow, so the scheduler can record success after failure.

Impact:

- homeowners can miss maintenance deadlines;
- operations sees a false successful run;
- the job bypasses the canonical Home Action and notification lifecycle; and
- the implementation conflicts with the calm, trustworthy product promise.

Required correction: replace the implementation with canonical property-maintenance/Home Action selection and `NotificationService.create`, or retire the job if the canonical action feed and weekly brief already cover the same deadlines.

#### WKR-002 — Seasonal email bypasses canonical notification governance

`seasonalNotification.job.ts` reads a legacy climate notification flag and calls the SMTP transport directly. It does not use category/property/member preferences, quiet hours, immediate-versus-weekly cadence, notification outcomes, mute controls, or centralized duplicate suppression. It links to global seasonal routes rather than deriving a canonical property action destination.

Required correction: make seasonal generation produce canonical tasks/actions and make seasonal notification creation go through `NotificationService.create`. Only the delivery worker may call `sendEmail` for homeowner messages.

#### WKR-003 — Worker notification URLs are not route-audited

The executable product-framework route audit walks `apps/backend/src` for notification `actionUrl` values but does not walk `apps/workers/src`. Worker links for neighborhood changes, permit inspections, seasonal checklists, reserve funds, recalls, claims, and future jobs can therefore break without failing the route contract.

Required correction: scan backend and worker TypeScript sources, support template/dynamic route normalization, and fail on unclassified worker destinations.

#### WKR-004 — No centralized worker execution policy

Every registry cron job with a schedule starts automatically. Only the three dummy ingests and neighborhood refresh have dedicated enablement behavior. There is no master automation switch, no grouped outbound/external/mutating policy, no per-job override, and no dry-run declaration.

This is unsafe in the only available environment because a code deployment immediately activates every scheduled mutation and outbound effect.

Required correction: introduce a typed worker execution policy and config flags described in Section 7. The scheduler and manual-trigger service must use the same decision function.

#### WKR-005 — Governance flag is not propagated to workers

`ENFORCE_HUMAN_POLICY_APPROVALS` is configured for the backend but is not injected into the Kubernetes worker deployment or Docker Compose worker service. Shared backend services imported by the worker therefore do not receive the same explicit governance mode.

Required correction: inject the existing flag into workers and validate it at startup. Missing or malformed values should preserve beta-advisory behavior today and must be visible in the admin job console. Before real-user launch, backend and workers must read the same `true` value.

### 5.2 Reliability findings

#### WKR-006 — Registry consistency is advisory rather than enforced

The worker logs a warning when a cron registry entry has no handler or a handler has no registry entry. Startup continues. There is no executable test covering all registry, cron-handler, BullMQ queue, and admin-trigger mappings.

Required correction: export registries for testability, fail startup on production-impacting drift, and add a zero-drift contract test.

#### WKR-007 — Scheduled and manual execution use different concurrency controls

Scheduled cron runs acquire a database lease. Manually triggered cron jobs execute through `cron-trigger-queue` without acquiring the same lease, so a manual and scheduled run can overlap. The default cron lease expires after ten minutes and is not renewed, allowing a second replica to start a long-running job after expiry.

Required correction: route both entry paths through one execution coordinator with a renewable lease, stable run key, overlap policy, and consistent metrics.

#### WKR-008 — Failure semantics can produce false green runs

Several handlers catch errors, log them, and return normally. Other handlers report partial error counts without a standard result contract. The scheduler treats any resolved promise as success.

Required correction: adopt `SUCCEEDED`, `PARTIAL`, `FAILED`, and `SKIPPED` job outcomes. A fatal or threshold-exceeding partial result must reject; expected inapplicability must return an explicit skip reason.

#### WKR-009 — Queue handlers can silently accept unknown job names

The email, push, and SMS queue processors act only on recognized names but do not consistently throw for unknown job names. A producer/consumer name mismatch can therefore appear completed without executing work.

Required correction: use exhaustive dispatch and fail unknown names.

#### WKR-010 — Unsupported channels are active worker infrastructure

Push and SMS workers start and appear in the registry even though neither delivery provider is implemented. If a delivery reaches these queues, the row is marked skipped and the job intentionally fails, creating operational noise for a channel the pilot does not support.

Required correction: mark these jobs `INACTIVE_NOT_IMPLEMENTED`, do not start their consumers unless an exact enablement flag and provider startup validation pass, and hide manual controls until supported.

#### WKR-011 — Backfill runs automatically despite greenfield policy

`shared-data-backfill` mutates shared data daily. The product program explicitly assumes no real-user migration/backfill requirement. Running a backfill continuously is unnecessary and increases single-environment risk.

Required correction: default it off, retain an explicit dry-run/manual diagnostic path if useful, and do not make it a beta phase gate.

### 5.3 Architecture and testing findings

#### WKR-012 — Worker/backend coupling makes builds fragile

Worker source directly imports backend source in 62 places. The worker Dockerfile copies a large dependency graph and rewrites import paths with many `sed` commands. A backend transitive import change can break the worker image even when the local worker TypeScript build passes.

Required correction: move worker-safe contracts and services into an explicitly buildable shared workspace package, or compile backend and worker from one workspace graph without source rewriting. Remove Docker-time import surgery incrementally.

#### WKR-013 — Native tests do not cover job orchestration

The current 30 native tests cover weather-card rendering, property-context adapters, tax normalization, and weather scoring. They do not directly test:

- registry/handler parity;
- scheduler enablement decisions;
- lease renewal and overlap;
- manual trigger policy;
- maintenance reminders;
- seasonal notification governance;
- digest idempotency and quiet hours;
- worker route contracts;
- unknown queue jobs;
- retry/dead-letter behavior;
- all registered job result contracts; or
- Docker packaging parity.

Required correction: build a no-database worker contract suite using fakes and dependency injection, followed by narrowly scoped smoke tests in the single beta environment.

#### WKR-014 — Operational reporting can overstate health

Cron history is stored only in Redis with five records per job, some record writes are fire-and-forget, and in-memory failure-alert cooldowns differ by replica and reset on restart. Job summaries are inconsistent and may omit examined, changed, skipped, failed, and notified counts.

Required correction: standardize structured outcomes and metrics first. Durable historical storage can be deferred; no schema change is required for the beta fix.

#### WKR-015 — Sensitive operational output needs a common redaction rule

Some logs include user email addresses, property identifiers, and raw failure text. Failure-alert email can contain up to 2,000 characters of stack trace. Worker logs and alerts should never contain tokens, document contents, policy numbers, claim numbers, or unredacted provider credentials.

Required correction: add a shared worker log/alert redactor and safe correlation identifiers.

## 6. Single-environment operating model

The absence of dev/stage environments changes the validation method, not the correctness standard.

### 6.1 Prohibited practices

- Do not introduce worker-driven Prisma migrations or schema resets.
- Do not run destructive acceptance suites against the only database.
- Do not create global synthetic events indistinguishable from real records.
- Do not use broad cleanup scripts that delete by date, email domain, or property type.
- Do not bypass property authorization, safety context, evidence, or idempotency for testing.

### 6.2 Allowed validation layers

1. Static contract tests over source and registries.
2. Unit tests with injected clocks, transports, repositories, queues, and external-provider fakes.
3. TypeScript build and Docker image build.
4. Dry-run execution that performs reads and returns planned effects without writes or sends.
5. Property-allowlisted beta smoke tests using explicitly created disposable test records.
6. Manual verification through the existing Admin Worker Jobs UI and structured logs.

### 6.3 Disposable smoke-test rules

- Require an explicit property ID allowlist.
- Stamp every created record with an acceptance correlation ID in existing metadata fields where available.
- Never run a full-table sweep during a smoke test.
- Clean up only the exact IDs created by that run.
- If a job lacks safe correlation/cleanup support, validate it in dry-run mode only.
- Outbound email must target a configured internal allowlist while in beta smoke mode.

These rules require no additional database or migration.

## 7. Flag and governance model

### 7.1 Required configuration

| Flag | Beta default | Purpose |
|---|---:|---|
| `ENFORCE_HUMAN_POLICY_APPROVALS` | `false` | Existing cross-application human-attestation gate. Inject the same value into backend and workers. |
| `WORKER_AUTOMATION_ENABLED` | `true` | Master switch for scheduled and polling automation. Queue consumers needed for user-requested work can remain separately enabled. |
| `WORKER_OUTBOUND_NOTIFICATIONS_ENABLED` | `false` initially | Controls worker-originated homeowner email/send effects while allowing in-app creation and dry-run inspection. Enable after internal recipient smoke testing. |
| `WORKER_EXTERNAL_INGEST_ENABLED` | `false` initially | Controls scheduled calls to CPSC, weather, rates, permit, tax, neighborhood, and similar sources. On-demand user operations retain their own policy. |
| `WORKER_MUTATING_SWEEPS_ENABLED` | `false` initially | Controls broad scheduled mutation/cleanup/backfill sweeps. Targeted event-driven jobs are evaluated separately. |
| `WORKER_MANUAL_TRIGGERS_ENABLED` | `true` | Allows capability-protected manual triggers in beta. |
| `ENFORCE_WORKER_MANUAL_TRIGGER_APPROVALS` | `false` | Optional future dual-control/human approval for high-impact manual jobs. It must not block beta testing while false. |

Per-job overrides should use `WORKER_JOB_<NORMALIZED_JOB_KEY>_ENABLED=true|false` and take precedence over group defaults. Only the exact lowercase string `true` should enable a normally disabled hazardous capability; malformed values must fail safe and appear in startup diagnostics.

### 7.2 What remains mandatory when approvals are disabled

MFA, admin role, capability checks, property context, safety rules, notification preferences, quiet hours, evidence requirements, provider compliance, idempotency, lease ownership, and audit logging are technical controls. They are not human policy approvals and must not be disabled by `ENFORCE_HUMAN_POLICY_APPROVALS` or `ENFORCE_WORKER_MANUAL_TRIGGER_APPROVALS`.

### 7.3 Registry metadata

Extend each registry entry with code-owned metadata:

```ts
type WorkerImpact = 'READ_ONLY' | 'INTERNAL_WRITE' | 'HOMEOWNER_STATE' | 'OUTBOUND' | 'DESTRUCTIVE';
type CustomerJob = 'STAY_AHEAD' | 'DECIDE' | 'MAJOR_MOMENT' | 'PLATFORM_OPERATIONS';

type WorkerExecutionPolicy = {
  impact: WorkerImpact;
  customerJob: CustomerJob;
  defaultEnabledInBeta: boolean;
  supportsDryRun: boolean;
  supportsPropertyScope: boolean;
  externalProvider?: string;
  humanApprovalClass?: 'NONE' | 'HIGH_IMPACT_MANUAL';
};
```

The Admin UI should display effective state, source flag, impact, dry-run support, last result, and disabled reason. Do not add a mandatory approval workflow for the current beta.

## 8. Implementation plan

### Increment W0 — Executable inventory and safe execution policy

Priority: P0

Implement:

1. Add the registry metadata in Section 7.3 to all 43 registered jobs.
2. Register the six long-running runners or create a parallel `RUNNER_REGISTRY` governed by the same policy.
3. Add `evaluateWorkerExecution(jobKey, triggerType, environment)` as the single scheduler/manual/poller decision function.
4. Add the flags in Section 7 to app-config, the worker Kubernetes deployment, Docker Compose, startup diagnostics, and documentation.
5. Propagate `ENFORCE_HUMAN_POLICY_APPROVALS` to workers.
6. Fail startup on registry/handler/queue drift; allow explicitly inactive placeholders.
7. Add Admin UI status for disabled and dry-run-only jobs.
8. Default `shared-data-backfill`, push, and SMS off.

Acceptance:

- every schedulable handler has exactly one registry policy;
- no disabled job schedules, polls, consumes, sends, or mutates;
- manual and scheduled paths produce the same policy decision;
- approval enforcement false never blocks beta execution solely for missing human attestations;
- approval enforcement true is visible and consistently applied in backend and worker; and
- no database migration is introduced.

### Increment W1 — Canonical homeowner effects

Priority: P0

Implement:

1. Replace or retire the fake maintenance-reminder implementation.
2. Source maintenance reminders from canonical property maintenance/Home Actions, with stable keys and terminal/snooze suppression.
3. Route seasonal homeowner messaging through `NotificationService.create`.
4. Remove direct SMTP calls for homeowner messages; retain direct transport only for explicitly internal operational email.
5. **Completed July 20, 2026:** Reconcile legacy seasonal checklist actions with the unified Home and Plan & Projects experience.
6. Add canonical source, evidence, confidence, timing, consequence, category, and action URL metadata.
7. Extend the route audit to worker sources and add typed URL builders for claims, recalls, permits, reserve fund, neighborhood, seasonal, and warranty destinations.
8. Ensure worker-created actionable outcomes appear once in the Home feed and preserve lineage.

Acceptance:

- no homeowner notification producer outside `NotificationService` calls a channel transport;
- maintenance reminders create a real governed notification or are explicitly skipped;
- seasonal preferences, quiet hours, cadence, mute, and outcome controls apply;
- all static and template worker deep links resolve to classified frontend routes; and
- duplicate scheduled runs do not create duplicate actions or notifications.

### Increment W2 — Honest outcomes, idempotency, and concurrency

Priority: P0/P1

Implement:

1. Introduce a shared `WorkerRunResult` with examined, created, updated, notified, skipped, failed, and reason counts.
2. Standardize `SUCCEEDED`, `PARTIAL`, `FAILED`, and `SKIPPED` status rules.
3. Make fatal errors reject instead of being swallowed.
4. Make queue dispatch exhaustive and reject unknown job names.
5. Route manual and scheduled cron execution through one coordinator.
6. Add renewable leases/heartbeats and per-job max-runtime configuration.
7. Define overlap policy: `SKIP_IF_RUNNING`, `QUEUE_AFTER_RUNNING`, or safe concurrency.
8. Add deterministic BullMQ job IDs/idempotency keys for every repeatable or manually triggerable effect.
9. Add bounded batch sizes, cursor/checkpoint behavior, and explicit retryability classification.
10. Await cron history recording and emit consistent metrics for skipped and partial runs.

Acceptance:

- a manual trigger cannot overlap an unsafe scheduled run;
- a job exceeding ten minutes retains its lease;
- unknown queue names fail visibly;
- false-green handlers are eliminated; and
- replay tests prove no duplicate homeowner state or notification.

### Increment W3 — Domain-by-domain product alignment

Priority: P1

Implement the following domain slices:

| Slice | Required work |
|---|---|
| Maintenance and seasonal | Seasonal checklist promotion to canonical Home is complete. Finish remaining W1 notification/reminder governance and preserve canonical lifecycle. |
| Risk/weather/coverage | Canonical severe-weather Home presentation, expiry context, and duplicate guidance suppression are implemented. Continue verifying source freshness, safety tier, property applicability, conservative failure, and job-level reliability. |
| Recall | Prove ingest deduplication, match confidence, homeowner confirmation, follow-up promotion, and route validity. |
| Provider compliance | Verify booking impact, homeowner versus provider/admin visibility, credential redaction, and automatic resolution. |
| Financial | Enforce educational-estimate boundaries, source timestamp, context applicability, material-notification cadence, and duplicate suppression. |
| Neighborhood | Enforce property distance/context, evidence language, action relevance, usefulness feedback, and noise caps. |
| Home intelligence | Disable backfill by default; keep read-only audits; ensure Gazette, habits, scores, and hidden assets feed canonical actions rather than competing dashboards. |
| Permit/project | Lock property context, jurisdiction limitations, evidence provenance, export safety, and reminder deep links. |
| Exports | Add safe claim ownership, bounded retries, object cleanup, redaction, and exact-record expiration. |
| AI/DIY | Add structured output validation, safety boundary, evidence limitations, deterministic fallback, idempotency, and explicit AI-disabled behavior. |

Acceptance:

- each homeowner-effecting job has a customer-job mapping and canonical output contract;
- read-only operational jobs cannot accidentally create homeowner-visible state;
- every external datum carries source and effective-time provenance; and
- each domain has focused tests for applicable, unknown, degraded, replay, and failure cases.

### Increment W4 — Test architecture without a test database

Priority: P1

Implement:

1. Refactor job entry points to accept repositories, transports, clocks, queues, and provider clients through small interfaces.
2. Add in-memory/fake implementations for tests; do not mock Prisma globally through fragile module replacement.
3. Add registry, execution-policy, scheduler, lease, route, notification, result-contract, redaction, and queue-dispatch suites.
4. Add one focused unit suite per registered job or domain wrapper.
5. Add Docker build to continuous validation.
6. Add a static rule preventing direct homeowner SMTP sends and direct notification row creation outside approved delivery/service boundaries.
7. Add a static rule preventing new backend-source imports unless exported from the approved worker-safe package boundary.
8. Add dry-run contract tests that assert planned writes/sends without performing them.

Acceptance:

- the worker suite validates every registered job's policy and handler;
- all P0 paths are tested without Redis, SMTP, external APIs, or a database;
- build and tests do not need a schema reset or migration; and
- a worker-only change cannot silently break route, notification, or shared-governance contracts.

### Increment W5 — Packaging and deployment simplification

Priority: P1/P2

Implement:

1. Define a worker-safe shared package for contracts, policies, and services used by both backend and workers.
2. Move dependencies incrementally from direct backend source imports to the shared package.
3. Compile from the repository workspace graph or publish internal build artifacts.
4. Remove Docker `sed` import rewriting and hand-maintained transitive copy lists.
5. Make local and Docker TypeScript use the same strictness and module-resolution rules.
6. Add startup dependency validation for database, Redis, enabled providers, SMTP, object storage, and AI only when the corresponding jobs are enabled.
7. Add graceful shutdown for intervals, queues, Redis clients, metrics, and in-flight jobs.

Acceptance:

- the Dockerfile contains no source-path rewrite commands;
- local and container builds compile the same dependency graph;
- enabling a job with missing required configuration fails clearly at startup; and
- disabling a capability removes its startup dependency requirement.

### Increment W6 — Controlled single-environment smoke validation

Priority: P2, after W0-W4

Implement:

1. Add dry-run controls to broad sweeps and external ingests.
2. Add property and internal-email allowlists for beta smoke execution.
3. Add correlation IDs and exact-ID cleanup helpers for jobs that can safely create disposable records.
4. Create an Admin UI smoke checklist showing prerequisites, planned effects, and actual result.
5. Exercise one representative job per domain with dry-run first and scoped effect second where safe.
6. Validate scheduled execution by temporarily enabling one low-risk job, observing one run, and disabling it again.

Acceptance:

- no smoke step resets or migrates the database;
- no test targets records outside the explicit allowlist;
- every created record is identified and individually removable;
- outbound delivery reaches only the configured internal beta recipient; and
- results are recorded as operational evidence, not fabricated user outcomes.

### Increment W7 — Real-user launch cutover

Priority: Pre-launch, not a beta implementation gate

1. Set `ENFORCE_HUMAN_POLICY_APPROVALS=true` for backend and worker.
2. Decide whether `ENFORCE_WORKER_MANUAL_TRIGGER_APPROVALS` is required for high-impact manual jobs; if used, set it to true only after the Admin UI workflow exists.
3. Review and explicitly enable each production job group and external provider.
4. Keep unsupported push/SMS jobs disabled until their providers and consent/preferences are implemented.
5. Run an isolated acceptance environment when one exists; do not retrofit destructive acceptance into the only database.
6. Establish notification usefulness/noise, action resolution, verified outcome, provider quality, and recurring-care measurements.
7. Review thresholds with actual user evidence before enabling broader automation or expansion.

## 9. Priority backlog

| ID | Priority | Increment | Deliverable |
|---|---:|---|---|
| WKR-001 | P0 | W1 | Real or retired maintenance reminders |
| WKR-002 | P0 | W1 | Seasonal messaging through canonical notification policy |
| WKR-003 | P0 | W1/W4 | Worker deep-link route audit |
| WKR-004 | P0 | W0 | Central worker execution policy and flags |
| WKR-005 | P0 | W0 | Governance flag propagated to worker |
| WKR-006 | P0 | W0/W4 | Executable registry/handler/queue parity |
| WKR-007 | P0 | W2 | Shared renewable lease for manual and scheduled runs |
| WKR-008 | P0 | W2 | Honest result and failure contract |
| WKR-009 | P1 | W2 | Exhaustive queue dispatch |
| WKR-010 | P1 | W0 | Push/SMS inactive until implemented |
| WKR-011 | P1 | W0 | Backfill disabled by default |
| WKR-012 | P1 | W5 | Replace Docker source-copy/rewrite coupling |
| WKR-013 | P1 | W4 | Comprehensive no-database worker test suite |
| WKR-014 | P1 | W2 | Consistent metrics and run outcomes |
| WKR-015 | P1 | W3/W4 | Worker log and alert redaction |

## 10. Recommended delivery order

```text
W0 Execution policy and inventory
  -> W1 Canonical homeowner effects
  -> W2 Reliability and idempotency
  -> W3 Domain alignment
  -> W4 No-database test architecture
  -> W5 Packaging simplification
  -> W6 Single-environment smoke validation
  -> W7 Real-user launch cutover
```

W0-W2 should be treated as one beta hardening program because they prevent false success, unintended sends, and duplicate effects. W3 and W4 can proceed domain-by-domain. W5 should be incremental to avoid a large build-system rewrite. W6 is operational proof using the only environment and must remain allowlisted and non-destructive. W7 is deliberately deferred until real-user launch planning.

## 11. Completion criteria

The worker module can be declared **implementation-complete for beta** when:

- all registered jobs and runners are governed by one execution policy;
- human approval enforcement is flag-controlled and false does not block beta tests;
- worker flags are visible in app-config and the Admin UI;
- maintenance and seasonal homeowner effects use canonical actions and notification policy;
- all worker deep links pass the route contract;
- scheduler, manual trigger, lease, retry, and result behavior are tested without a database;
- unsupported channels and backfill are disabled by default;
- every job declares impact, customer job, scope, dry-run support, and operational outcome;
- worker build, tests, and Docker build pass; and
- no database migration, reset, or separate environment is required.

The module can be declared **ready for real users** only after the pre-launch flag cutover, explicit job/provider enablement review, scoped operational smoke evidence, and actual notification/action outcome measurement. Those are future launch activities and must not be misrepresented as present implementation gaps.
