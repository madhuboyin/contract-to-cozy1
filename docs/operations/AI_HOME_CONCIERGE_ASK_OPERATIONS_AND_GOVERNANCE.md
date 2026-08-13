# AI Home Concierge — Ask Operations and Governance

Status: repository implementation baseline
Last updated: August 13, 2026

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

All commands show a typed review card, require explicit consent, expire after 30 minutes, and return an artifact-linked completion. Before any domain mutation, confirmation atomically transitions the execution to `RUNNING` and creates one unique leased `CLAIMED` receipt per execution. A competing confirmation cannot pass that database claim. After the short claim lease expires, the same confirmed input may acquire a recovery lease, including from another device or after the domain write succeeded but before Ask finalized its response. Completion updates that receipt to `COMPLETED` with the artifact reference. Creation paths additionally use stable action keys, canonical get-or-create transactions, or the unique nullable `GuidanceJourney.sourceAskExecutionId` key. The repository includes the Prisma schema changes but intentionally includes no migration script; schema application is user-managed.

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

## Phase 7A–8C — Decision Platform (HVAC Decision Threads and preference reuse)

Implements the FRD's contract-closure and Decision Thread phases (§7–§15). Full detail lives in
[`docs/product/decision-platform/`](../product/decision-platform/README.md) (README + three ADRs +
retention/privacy policy docs); this section is the operational summary.

**Governance status — read before relying on the ADRs' own status lines.** The FRD/ADRs describe
Phase 7A as a gate: "blocks production implementation... permits ADRs, fixtures, prototypes" until
Product/Domain/Architecture/Privacy/Security/Trust/Operations approval is recorded (FRD §5.1,
§25). **That gate was never implemented as a code-level control.** There is no feature flag,
config value, or database marker anywhere that conditions Phase 8A–9C code on Phase 7A having been
formally approved — `HVAC_DECISION_*`/`HVAC_PREFERENCE_*` are registered and dispatched in
`askOperationRegistry.ts`/`askOrchestrator.service.ts` exactly like any other live operation. The
decision-platform docs still self-report "Proposed — pending approval"; that framing was
procedural, not enforced, and no record exists of the named approvals actually having been
obtained. Treat the Decision Platform as **live in the codebase**, not as gated-pending-approval,
when reasoning about what this repository actually does today.

**Phase 7A — P0 contract closure.** Delivered as code-based typed registries in
`apps/backend/src/services/decisionPlatform/`: `decisionPreferenceRegistry.ts`
(`DecisionPreferenceDefinition`), `decisionContextContracts.ts` (`DecisionContextContract`), and
the decision-family catalog, each with a `validate*()` consistency check run at backend startup
(`src/index.ts`) and asserted empty in `tests/decisionPlatform/decisionPlatformGovernance.test.js`.
`decisionThreadTransitions.ts` is the pure, DB-free lifecycle/context-status transition contract —
`validateDecisionThreadTransitionContract()` confirms no duplicate/undocumented transition and that
every non-`ARCHIVED` status has an outbound edge.

**Phase 8A — HVAC Decision Thread foundation.** Six Ask operations: `HVAC_DECISION_START`,
`HVAC_DECISION_CONTINUE`, `HVAC_DECISION_SCENARIO`, `HVAC_DECISION_ABANDON`,
`HVAC_PREFERENCE_SAVE`, `HVAC_PREFERENCE_FORGET` (`decisionThreadService.ts`,
`hvacRepairReplaceEngine.service.ts`). Key mechanics:

- **Thread selection** (`selectHvacDecisionThread`) is scoped to `propertyId + inventoryItemId`,
  restricted to active lifecycle statuses, and classified `NONE`/`UNIQUE`/`AMBIGUOUS`
  (`classifyThreadSelection`) — an ambiguous result is surfaced back to the homeowner, never
  resolved by recency guessing.
- **Concurrency.** Every mutating write is an optimistic-concurrency `updateMany` gated on the
  row's `version`; a zero-count update throws `DecisionThreadVersionConflictError`. A separate
  Ask-layer context-version fingerprint additionally guards the propose→confirm window.
- **Correction/invalidation.** `recomputeStaleThread` never edits a snapshot in place — it creates
  a new `RecommendationSnapshot` with `supersedesSnapshotId` set to the prior one, diffs the two
  (`compareRecommendationSnapshots`), and restores `contextStatus` via the same
  `computeContextStatus` precedence rule (`CONFLICTED` > `STALE` > `CURRENT`) Phase 7A defined.
  Triggered by an explicit preference "forget" or a canonical-fact correction on the item — see
  the Phase 8B expiry note below for what does *not* trigger it.
- **Multi-session continuation** needs no session/device identifier at all: a `DecisionThread` is a
  durable row keyed on property + item, so any later authorized session simply re-resolves the same
  thread via `selectHvacDecisionThread`.
- **Scenario isolation.** `createHvacScenario` evaluates a hypothetical quote without ever mutating
  the thread's `currentRecommendationSnapshotId` or saving a preference — both invariants are
  governance-tested. `SCENARIO_COMPARISON`'s `comparisonDirection` is derived from an ordinal
  verdict rank (`REPAIR` < `MONITOR` < `REPLACE`), not a raw equality check, so a
  `REPLACE`→`MONITOR` shift reads correctly as "less urgent," not mislabeled.

**Phase 8B — confirmed ownership-horizon personalization.** Three preference definitions are
registered (`OWNERSHIP_HORIZON`, `REPAIR_REPLACE_APPROACH`, `DECISION_DETAIL_LEVEL`), but **only
the first two are implemented end to end** — `DECISION_DETAIL_LEVEL` is registered and validated
but has no save/read/parse path anywhere in the codebase. The registry's declared
`correctionRoute` values (`/dashboard/settings/decision-preferences/...`) **do not exist as real
frontend routes or backend endpoints** — review/edit/delete of a saved preference happens
exclusively through Ask (`HVAC_PREFERENCE_SAVE`/`HVAC_PREFERENCE_FORGET`) and the rendered
`PREFERENCE_REFERENCE` block; there is no standalone settings UI.

A preference save requires an explicit save/remember verb in the message (never silently
inferred); a household-scoped `OWNERSHIP_HORIZON` save requires the household OWNER role, while
`REPAIR_REPLACE_APPROACH` is user-scoped to any authorized member. `getActiveHvacPreferences` —
the sole read path the HVAC engine composer uses — filters to `status: 'ACTIVE'` and
non-expired, which is the actual enforcement mechanism behind the "zero unconfirmed material
preference use" exit criterion. Revoke ("forget") flips `status` to `REVOKED` synchronously inside
the same transaction and marks every affected thread stale.

**Expiry is enforced passively only.** No cron/worker proactively transitions an expired
`DecisionPreferenceValue` to a terminal status or marks a dependent thread stale purely because
`expiresAt` passed — `getActiveHvacPreferences`'s read-time filter simply stops returning that row
for *future* compositions. There is no reconfirmation UX. Only an explicit "forget" or a canonical
fact correction triggers recompute — natural expiry does not. (`policy-retention-erasure-export.md`
previously stated expiry sets `status = 'EXPIRED'`; that write does not exist in the codebase and
the policy doc has been corrected to describe the actual read-time-filter behavior.)

**Phase 8C — bounded cross-domain composition and graph reads.** One registered
`DecisionContextContract` (`HVAC_REPAIR_REPLACE`, version `1.0`, `decisionContextContracts.ts`)
declares required/optional fact definitions, allowed preference/scenario-input definitions, and
concrete latency budgets: 300ms for required facts, 200ms for optional enhancers, 500ms overall
(`requiredFactLatencyMs`/`maximumEnhancerLatencyMs`/`overallLatencyMs`). `decisionContextEnhancer
.ts`'s `withEnhancerTimeout` enforces those budgets: a required-fact timeout degrades to a blocked
result (fail closed); an optional-enhancer timeout is omitted and disclosed via a limitation code
(degrade with disclosure, never silently). `homeIntelligenceGraph.ts` registers four typed read
edges (not a graph database) — three within the Decision Platform's own data and one,
`INVENTORY_ITEM_WARRANTY_AND_FUTURE_EXPENSE`, crossing into Coverage and Home Capital Timeline via
a direct foreign key. Every read function scopes its query by `propertyId` first, defense-in-depth
even though callers are already authorized upstream — this is the property-access/sensitivity
propagation behavior the FRD's exit criterion calls for, governance-tested in
`homeIntelligenceGraphGovernance.test.js`.

**This graph module is still not wired into any production read path.** It was built as standalone,
tested infrastructure explicitly for Phase 9A+ to consume; as of Phase 9C it is imported only for
its startup registry-validation call (`validateHomeIntelligenceGraphEdges` in `src/index.ts`) — the
Phase 9A/9B/9C work in the section below reads `PropertyChange`, the governed Home Actions feed,
and `DecisionThread` directly, none of it through `homeIntelligenceGraph.ts`.

**Tests.** `tests/decisionPlatform/`: `decisionPlatformGovernance.test.js` (7A registries),
`decisionThreadServiceGovernance.test.js` (8A transition-contract enforcement),
`hvacDecisionRouting.test.js` (8A/8B Ask routing), `decisionPreferenceServiceGovernance.test.js`
(8B read-gate/authorization/isolation invariants), `homeIntelligenceGraphGovernance.test.js` (8C
edge registry and property scoping). `tests/unit/decisionPlatform/`:
`decisionThreadTransitions.test.js`, `decisionThreadSelection.test.js`,
`hvacRepairReplaceEngine.test.js`, `decisionPreferenceParsing.test.js`,
`recommendationChangeDiff.test.js`, `decisionContextEnhancer.test.js`.

Deliberately not built through Phase 8C, still outstanding: a `DecisionPreferenceValue`/
`DecisionThread` export API (FRD §8.3), the `decision-platform-retention-cleanup` job and
`ABANDONED`→`ARCHIVED` auto-archival, and any independent test asserting preference values never
reach logs/metrics (true by inspection of the two emitter functions today, not governance-tested).

## Phase 9A–9C — Change Intelligence, Priority Intelligence, and Proactive Delivery

Implements the FRD's "What changed?", "What matters now," and bounded external-delivery phases. §16–§18 govern the requirements; this section is the operational reality.

**Phase 9A — read-only Change Intelligence.** `HOME_CHANGE_SUMMARY` is a pure read projection over the existing `PropertyChange` ledger (`propertyChange.service.ts`) — it owns no source truth and materializes no second change-tracking system. `decisionPlatformChangeEmitter.ts` bridges Decision Platform lifecycle events (recommendation snapshots, preference saves/revocations) into that same ledger. In-product only; no external delivery path exists for this operation.

**Phase 9B — Priority Intelligence and Concierge Home.** `priorityListPolicy.ts` is a versioned, pure ranking-annotation layer over the existing governed Home Actions feed (`homeActions.service.ts`'s `getHomeActionFeed`) — it never re-ranks or publishes a second feed, only maps each item to a consumer category (`DO_NOW`/`PLAN_SOON`/`WATCH`/`OPTIONAL`/`NO_ACTION`), attaches comparative reason codes, and truncates per channel (`PRIORITY_LIST_CHANNEL_DISPLAY_LIMITS`: `ASK`=8, `CONCIERGE_HOME`=5, `EXTERNAL_PROACTIVE`=1). Current policy version: `priority-list-policy-v1`. The `PRIORITY_LIST` presentation block is additive on the existing `HOME_ACTIONS` operation, not a new operation — this is the enforcement mechanism behind the FRD's "no competing action source" exit criterion.

Usefulness feedback (`POST /api/ask/executions/:executionId/priority-list/:homeActionId/feedback`, ratings `USEFUL`/`NOT_USEFUL`) reuses the existing generic `Feedback` model (`homeActionUsefulnessFeedback.service.ts`), keyed by a `home-action:{homeActionId}` page rather than a new table. A `NOT_USEFUL` rating suppresses that item's display (a `suppressed` flag only, never a removal, and never applied to a `SAFETY_EMERGENCY` item) for `HOME_ACTION_FEEDBACK_SUPPRESSION_COOLDOWN_DAYS` = 14 days.

Concierge Home (`GET /api/ask/concierge-home?propertyId=`) composes three already-governed sources — the priority list above, `HOME_CHANGE_SUMMARY`'s `PropertyChange` read, and active `DecisionThread`s (`listActiveDecisionThreadsForProperty`) — into a single read for the Ask landing page. It creates no `AskExecution`. Each section reports its own state (`AVAILABLE`/`NO_ACTION`/`NO_CHANGE`/`NO_DECISIONS`/`UNAVAILABLE`) so a failed or empty section is never presented as "nothing needs attention."

**Phase 9C — external proactive delivery.** Bounded, EMAIL-only (per the existing pilot policy, `PILOT_CONFIGURABLE_NOTIFICATION_CHANNELS`), and gated off by default end to end:

- **Consent.** `NotificationChannelConsent` is a versioned, revocable, explicit per-(category, channel) grant (`GET`/`POST /api/notifications/channel-consents`, `POST /api/notifications/channel-consents/revoke`), distinct from `NotificationPreference` — a user can have EMAIL cadence configured for a category and still receive nothing externally until they grant consent. A toggle is exposed on `/dashboard/notifications`.
- **Eligibility.** `homeActionProactiveEligibilityPolicy.ts` is a pure FRD §18.2 checklist: materiality floor (only `DO_NOW`/`PLAN_SOON`), suppression/completion/unavailable, a real CTA required (never a watch/no-action state), consent, channel enabled, and a daily/weekly budget (`HOME_ACTION_PROACTIVE_DAILY_BUDGET` = 1, `HOME_ACTION_PROACTIVE_WEEKLY_BUDGET` = 3). A same-day materiality escalation (`PLAN_SOON` → `DO_NOW` for the same Home Action) bypasses only the daily budget — never consent, channel, or the weekly budget. Material-financial and regulated-coverage items have currency/percentage figures redacted from the externally-sent copy.
- **Delivery and continuity.** `homeActionProactiveDelivery.service.ts` evaluates at most the single top-ranked eligible item per property per pass. On eligibility it creates a real `AskExecution` (the same result a homeowner gets asking "What needs my attention?") and hands off to the existing `NotificationService.create()` pipeline — never a second send path — with `metadata.{propertyId,askSessionId,askExecutionId}` so the notification's link resumes the literal execution it was generated from (mirrors `apps/frontend/src/lib/notifications/destination.ts`'s existing continuity pattern). The notification `type` is `HOME_ACTION_PROACTIVE`; its `deduplicationKey` bounds it to one send per item per day per materiality level.
- **Kill switches.** Two independent, both required: the env flag `HOME_ACTION_PROACTIVE_DELIVERY_ENABLED` (deploy-time default, unset/`false`) and a DB-backed switch (`homeActionProactiveDeliveryKillSwitch.service.ts`, `SystemSetting` key `homeActionProactiveDelivery.killSwitch`) that an admin can flip with no deploy. The worker cron additionally sits behind the existing `WORKER_OUTBOUND_NOTIFICATIONS_ENABLED` flag (`impact: OUTBOUND` in the job registry) and its own `defaultEnabledInBeta: false`.
- **Scheduling.** Registered in `JOB_REGISTRY` as `home-action-proactive-delivery` (daily 9:00 AM EST, `apps/workers/src/jobs/evaluateHomeActionProactiveDelivery.job.ts`). Scopes its property scan to users who already hold an active EMAIL consent for some category, so it never table-scans every property.
- **Monitoring.** Every evaluation pass — eligible or not — is logged to `HomeActionProactiveDeliveryDecision` with its reason codes. `/dashboard/admin/home-action-proactive-delivery` (capabilities `ANALYTICS_VIEW`/`SYSTEM_SETTINGS_MANAGE`) shows the kill-switch toggle and the last 50 decisions. This is a monitoring view, not a launch-gate/approval workflow — the product has no real users yet to gate a rollout against, so `releaseGate.service.ts`'s cohort/governance-review machinery is deliberately not used here.

Deliberately out of scope for the current implementation: push-channel proactive delivery (the pilot channel restriction is a pre-existing, deliberate product decision, not new to this phase), evaluating/sending more than one item per property per pass, and any external-fatigue-guardrail metric aggregation (the metric is defined in `docs/product/decision-platform/metrics-dictionary.md` but nothing computes it yet — see Retention and deletion below for the related consent/decision-log retention gap).

## Runtime controls

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `ASK_ENABLED` | `true` | Global Ask kill switch |
| `ASK_REMOTE_GENERATION_ENABLED` | `true` | Turns off open-ended generation while deterministic Ask remains available |
| `ASK_LOCAL_ROUTING_ENABLED` | `true` | Independently disables the bounded local lexical-classifier stage and returns unmatched questions to the governed remote fallback |
| `ASK_LOCAL_ROUTING_MIN_CONFIDENCE` | `0.42` | Minimum bounded classifier score required to select a deterministic operation |
| `ASK_ROUTING_AMBIGUITY_MARGIN` | `0.10` | Minimum lead over another qualified candidate; closer candidates produce clarification |
| `ASK_RESULT_SYNTHESIS_ENABLED` | `false` | Opts eligible deterministic answers into result-only remote formatting; canonical typed output remains the fallback |
| `ASK_OPERATION_<OPERATION_ID>_ENABLED` | `true` | Per-operation kill switch |
| `ASK_EXECUTION_TIMEOUT_MS` | `15000` | Bounded execution timeout; maximum accepted value is 120 seconds |
| `ASK_RAW_CONVERSATION_RETENTION_DAYS` | `30` | Raw session, message, execution, event, and receipt retention |
| `ASK_FEEDBACK_RETENTION_DAYS` | `365` | Ask-specific homeowner feedback retention |
| `HOME_ACTION_PROACTIVE_DELIVERY_ENABLED` | `false` (unset) | Phase 9C external proactive delivery env-level kill switch. Also requires the DB-backed switch (see Phase 9A–9C) and `WORKER_OUTBOUND_NOTIFICATIONS_ENABLED` to actually send. |

When generation is disabled, `GROUNDED_GUIDANCE` returns a typed unavailable boundary and routes the homeowner toward deterministic record questions. It does not synthesize or invent a fallback answer.

Routing order is safety/negative boundary, registered deterministic rule, bounded local lexical classifier, ambiguity clarification, then remote grounded guidance. The local classifier receives only the current question in process and makes no database or model-provider call. Grounded generation receives a redacted question capped at 600 characters and no more than 20 relevant Property Context facts within a 6,000-character serialized budget. It never receives the complete property snapshot merely because no relevant fact matched.

Result synthesis is an optional presentation enhancement, not a reasoning or data-retrieval stage. It receives only a validated, redacted DTO projected from eligible typed result blocks. Actions, links, internal IDs, raw records, questions, context snapshots, confirmations, commands, boundaries, monitors, and workflow progress are excluded. Synthesis failures or unsupported numeric claims return the original deterministic result without failing Ask.

Material refinance-rate and Maintenance deadline signals create deterministic Ask notification continuations before delivery. Each trigger uses a stable source identity to converge on one session/execution, stores typed signal parameters, and links the notification to `/dashboard/ask` with the selected property and exact session. The Ask result owns the explanation and domain deep link; the monitor/task domain remains the source of truth. Continuation failure is logged and degrades to the canonical domain URL.

## Retention and deletion

- Ask sessions, raw messages, executions, execution events, capture receipts, and confirmation receipts expire together after 30 days by default.
- Ask feedback expires after 365 days by default.
- The production `ask-retention-cleanup` CronJob applies these policies daily in bounded batches.
- `DELETE /api/ask/sessions/:sessionId` lets the authenticated homeowner remove a conversation and its Ask feedback immediately.
- Deleting an Ask session never deletes canonical domain artifacts such as maintenance tasks, invitations, monitors, property facts, or financing profiles. Their owning domain retention policy applies.
- Prometheus metrics contain bounded registry labels only and never include prompts, user IDs, property IDs, addresses, execution IDs, session IDs, or captured values.
- Conversation history reads (`GET /api/ask/sessions/:sessionId`, `GET /api/ask/executions/:executionId`) recheck current property access, not just row ownership. A revoked household member's session/execution rows are not deleted, but property-scoped answers inside them stop being returned to that user the moment access is revoked — retention/deletion remain the only mechanisms that remove the underlying rows.
- **Gap:** `NotificationChannelConsent` and `HomeActionProactiveDeliveryDecision` (Phase 9C) have no defined retention/expiry policy yet. Consent rows are revocable (`revokedAt`) but not purged; the decision log grows unbounded. This needs a policy before Phase 9C delivery is turned on for real users.

## Measurement and cost baseline

The initial deterministic baseline is zero model calls and zero model-token cost for every operation whose definition declares `DETERMINISTIC`. `GROUNDED_GUIDANCE` is the only current `REMOTE_GENERATION` operation.

Operational metrics:

- `ask_executions_total{operation,status,generation_mode}`
- `ask_execution_duration_seconds{operation,generation_mode}`
- `ask_remote_generation_total{outcome}`
- `ask_remote_generation_characters_total{direction}` as the provider-neutral cost proxy
- `ask_routing_decisions_total{stage,outcome}` for deterministic containment, local-classifier use, clarification, and remote fallback
- `ask_result_synthesis_total{outcome}` for eligible, successful, and failure-fallback formatting attempts
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
4. Apply the Ask Prometheus rule and Grafana dashboard resources (`infrastructure/kubernetes/monitoring/prometheus/ask-alert-rules.yaml`, `.../grafana/ask-dashboard-configmap.yaml`) — these live in the `monitoring` namespace and are not part of the `raspberry-pi` app kustomization, so they still require a separate `kubectl apply -f`.
5. The retention CronJob (`infrastructure/kubernetes/apps/backend/ask-retention-cronjob.yaml`) is included in the `raspberry-pi` overlay's kustomization as of this change, so it deploys automatically with `make deploy-pi`. Before that first rollout, verify one dry run against a non-production database.
6. Verify deterministic containment, latency, capture resume success, and repeated-prompt rate in the dashboard.
7. For an incident, disable the affected `ASK_OPERATION_<ID>_ENABLED` flag. Disable `ASK_REMOTE_GENERATION_ENABLED` for model/provider incidents. Use `ASK_ENABLED=false` only when the entire surface must be paused.
8. For routing regressions, set `ASK_LOCAL_ROUTING_ENABLED=false`. For formatting regressions, set `ASK_RESULT_SYNTHESIS_ENABLED=false`; both controls preserve canonical deterministic answers.
9. Before enabling Phase 9C external delivery for the first time: run `npx prisma db push` (schema changes for `NotificationChannelConsent` and `HomeActionProactiveDeliveryDecision` ship with no migration file, per this repo's convention), resolve the retention gap noted above, then flip `HOME_ACTION_PROACTIVE_DELIVERY_ENABLED=true`, `WORKER_OUTBOUND_NOTIFICATIONS_ENABLED=true`, and resume the DB-backed kill switch from `/dashboard/admin/home-action-proactive-delivery`. For an incident, pausing that kill switch (no deploy required) is faster than toggling the env flag.

Production launch still requires recorded desktop/mobile E2E, accuracy/latency, restart, horizontal-scale, privacy, and domain-owner sign-off evidence. Repository implementation alone does not manufacture those attestations.
