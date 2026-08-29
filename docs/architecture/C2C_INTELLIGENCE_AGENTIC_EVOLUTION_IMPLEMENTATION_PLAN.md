# C2C Intelligence & Agentic Evolution — Implementation Plan

**Date:** 2026-08-27  
**Status:** Approved implementation plan — implementation in progress; unresolved owner inputs in §3 remain phase-gated
**Source architecture:** [`C2C_INTELLIGENCE_AGENTIC_EVOLUTION_ARCHITECTURE.md`](./C2C_INTELLIGENCE_AGENTIC_EVOLUTION_ARCHITECTURE.md)  
**Authoritative requirements:** `HI-ATT-001`, `HI-ATT-004`, `ASK-INT-019`, the Ask Trust Architecture Addendum, and the Skill Platform FRD cited by the source architecture

## 1. Outcome

Implement the approved architecture without creating a second ranking, promotion, eligibility, or delivery authority. Delivery proceeds in five dependency-ordered phases:

1. a property-authorized, read-only Intelligence Envelope and the HVAC authority correction;
2. a structural Envelope promotion-coverage audit;
3. an immutable, code-defined agent runtime with one HVAC Repair/Replace Specialist;
4. Ask Cozy integration with the same Envelope and Specialist contracts; and
5. the non-HVAC appliance decision family and a repeatable admission path for later specialists.

Each phase must be independently reviewable and leave the existing canonical path intact:

```text
registered intelligence producer
  -> hand-authored compound promotion rule
  -> getHomeActionFeed() ranking
  -> existing eligibility/delivery
  -> homeowner engagement
  -> specialist decision support, when applicable
```

The implementation is backend-first. Frontend work is limited to admin coverage reporting and homeowner engagement with the Specialist; it does not reproduce feed ranking or agent decision logic.

## 2. Binding decisions and non-goals

| Decision | Implementation consequence |
|---|---|
| `ARD-001` | Register only `Signal`, `GuidanceSignal`, `IntelligenceObservation`, `RecommendationSnapshot`, `PersonalizedRecommendation`, `PropertyRadarMatch`, and `PropertyRadarCompoundInsight`. Treat global `RadarEvent` as evidence. Do not register ordinary domain records. |
| `ARD-002` | Extract one versioned `IntelligenceIssueDomain` vocabulary. `GuidanceIssueDomain` and `EnvelopeDomain` alias it. Asset identity belongs in typed `entityRef` metadata. |
| `ARD-003` | HVAC computation comes only from `hvacRepairReplaceEngine.service.ts`; the current Decision Platform snapshot is the only published HVAC verdict. Generic `ReplaceRepairAnalysis.verdict` remains non-authoritative for HVAC. |
| `ARD-004` | Coverage universe is exact declared capabilities union authorized observations. Declared-only capabilities stay visible; observed-but-undeclared capabilities fail certification. Findings remain coarse `(producerModel, primaryDomain)` records. |
| `ARD-005` | `AgentDefinition` is an immutable, multi-version code registry. Persist runs, paused state, and bounded invocation audit only. Pin all continuations to their originating definition version. |

The following are explicitly out of scope:

- a second feed ranker or priority policy;
- automatic creation or execution of promotion rules from coverage findings;
- a generic Envelope write API, dismissal state, or per-item evaluation cursor;
- direct agent access to Prisma or unscoped property context;
- database-owned or runtime-editable `AgentDefinition` records;
- a new event bus, vector database, LLM provider, or notification pipeline;
- electrical, plumbing, roofing, or structural specialists without a separate safety review and approved evaluation suite; and
- rollout cohorts, compatibility layers, or backfills solely for nonexistent production users.

## 3. Owner inputs required before the affected work package closes

These inputs do not block Phase 0. They must not be silently invented during implementation.

| ID | Required by | Owner input | Default treatment until resolved |
|---|---|---|---|
| `IPD-002` | Phase 1 operational acceptance | Versioned evaluation contract: fixture corpus, baseline, numeric coverage target, sample minimum, measurement window, and failure action | Report `NOT_MEASURED`; do not claim the phase operationally accepted |
| `IPD-003` | Phase 2 schema specification | Retention periods and purge behavior for `AgentRun`, expired `AgentState`, `ToolInvocation`, and `LLMInvocation` | Implement bounded payloads and purge seams; do not choose retention durations |
| `IPD-004` | Phase 2 scope | Include confirmed delayed follow-up in the first HVAC Specialist release, or remove `SCHEDULE_FOLLOW_UP` from its enabled tool set | Do not simulate follow-up in memory |
| `IPD-005` | Phase 2 evaluation approval | Versioned HVAC agent evaluation contract, including acceptable abstention band and minimum deterministic/no-LLM completion rate | Keep the definition below `EVAL_APPROVED` |
| `IPD-006` | Phase 4 activation | Versioned generic-appliance evaluation contract and reviewed verdict mapping from `ReplaceRepairAnalysis` to Decision Platform verdict codes | Build contracts only; do not enable the profile |
| `IPD-007` | Phase 2 schema specification | Define “append-only `AgentRun`” precisely: immutable terminal insert plus a separate idempotency reservation, or a run row that may transition once from `RUNNING` to a terminal/paused outcome and is immutable afterward | Do not finalize run constraints or concurrency logic |

Resolved input:

| ID | Resolution |
|---|---|
| `IPD-001` | **APPROVED — 2026-08-28.** Register the Envelope Promotion Coverage Audit as a weekly global internal-write worker scheduled at 04:30 UTC every Sunday. Support an admin-only manual trigger through the existing worker-jobs infrastructure. Scheduled and manual executions use the same handler, execution policy, renewable per-job lease, and run-record contract; overlapping executions are skipped, and only complete global runs may retire findings. Keep scheduled execution disabled until `IPD-002` operational acceptance. |
| `IPD-008` | **APPROVED — 2026-08-28.** Use immutable versioned code registries and explicit mappings. Closed native vocabularies map exhaustively; open observation/Radar vocabularies require explicit admission and return `UNMAPPED_NATIVE_VALUE` otherwise. Use the reviewed Signal matrix, seed asset kinds from `RISK_ASSET_CONFIG.systemType`, keep asset kind optional when not reliably known, and begin property components with `ROOF`, `FOUNDATION`, `EXTERIOR`, `INTERIOR`, and `SITE`. |
| `IPD-009` | **APPROVED — 2026-08-28.** Add a minimal durable `CoverageAuditRun` as the authoritative scheduled/manual audit-attempt record. Insert it as `RUNNING` after lease acquisition and permit exactly one CAS-protected transition to `COMPLETE`, `PARTIAL`, or `FAILED`. Reconcile findings and terminalize the run in one transaction; only `COMPLETE` may retire findings. Persist bounded metadata, digest/version identity, aggregate counts, diagnostics, and reconciliation totals—never raw Envelope items or homeowner data. Interrupted runs fail and restart globally; resumability would require future bounded per-run observation staging, not cursor-only continuation. |

`IPD-001`'s shared run-record requirement is satisfied by the `CoverageAuditRun` contract in `IPD-009`. Redis cron history remains generic worker telemetry and is not the domain-authoritative audit history.

The source architecture metadata is normalized to approved implementation status. Remaining owner inputs continue to gate only the work packages named above.

## 4. Delivery strategy and dependency graph

```text
P0A shared contracts
  ├─> P0B Envelope adapters ─> P0C Envelope query + Skill ─> P1 coverage audit
  └─> P0D HVAC authority correction ───────────────────────> P2 HVAC Specialist

P0C + P2 ─> P3 Ask integration
P2 runtime + P0D authority split ─> P4 generic appliance family
```

Relative size is a planning aid, not a calendar commitment:

| Phase | Relative size | Primary risk |
|---|---:|---|
| Phase 0 | L | Mapping fidelity across seven registered producer models |
| Phase 1 | M | False coverage caused by vacuous data or imprecise declarations |
| Phase 2 | XL | Durable idempotency, pause/resume state, and bounded adaptive execution |
| Phase 3 | M | Accidentally creating a second Ask ranking or authorization path |
| Phase 4 | L | Preserving the non-HVAC authority boundary while adding Decision Platform lineage |

## 5. Phase 0 — Intelligence Envelope and HVAC authority

### 5.1 Work package P0A — shared product contracts

Create shared product-framework contracts before adapters so Guidance, Home Actions, and the Envelope import one vocabulary.

**Proposed new files**

- `apps/backend/src/productFramework/intelligence/intelligenceIssueDomain.contract.ts`
- `apps/backend/src/productFramework/intelligence/evidenceRef.contract.ts`
- `apps/backend/src/productFramework/intelligence/entityRef.contract.ts`
- `apps/backend/src/productFramework/intelligence/qualifiedClaim.contract.ts`
- `apps/backend/src/productFramework/intelligence/index.ts`

**Existing files to change**

- `apps/backend/src/services/guidanceEngine/guidanceTypes.ts`
- `apps/backend/src/productFramework/homeAction.contract.ts`
- all direct importers of the current `GuidanceIssueDomain` and Home Action evidence type

**Implementation tasks**

1. Move the closed issue-domain constant and type into the shared contract and add `INTELLIGENCE_ISSUE_DOMAIN_TAXONOMY_VERSION`.
2. Export `GuidanceIssueDomain` and `EnvelopeDomain` as aliases, not copied unions.
3. Extract the canonical evidence shape from `EvidenceReferenceSchema`; preserve the existing Home Action API contract while sharing its underlying schema/type.
4. Add closed property-component, asset-kind, and proposition-type registries or reuse an existing canonical registry where repository evidence shows one already owns the vocabulary.
5. Add compile-time exhaustiveness and runtime validation for taxonomy values and normalized confidence.
6. Keep the Prisma `GuidanceIssueDomain` enum aligned. If schema generation cannot directly consume the shared TypeScript constant, add a parity test rather than duplicating the vocabulary without a guard.

**Acceptance criteria**

- Guidance, Home Actions, and Envelope contracts resolve to one issue-domain vocabulary.
- `ROOF`, `HVAC`, and appliance names cannot appear as `EnvelopeDomain` values.
- Existing Home Action response shapes remain compatible.
- Taxonomy/version and Prisma parity tests fail on drift.

### 5.2 Work package P0B — Envelope contracts, adapters, and registry

**Proposed new files**

- `apps/backend/src/services/intelligenceEnvelope/intelligenceEnvelope.contract.ts`
- `apps/backend/src/services/intelligenceEnvelope/envelopeAdapter.contract.ts`
- `apps/backend/src/services/intelligenceEnvelope/envelopeAdapterRegistry.ts`
- `apps/backend/src/services/intelligenceEnvelope/adapters/signalEnvelopeAdapter.ts`
- `apps/backend/src/services/intelligenceEnvelope/adapters/guidanceSignalEnvelopeAdapter.ts`
- `apps/backend/src/services/intelligenceEnvelope/adapters/intelligenceObservationEnvelopeAdapter.ts`
- `apps/backend/src/services/intelligenceEnvelope/adapters/recommendationSnapshotEnvelopeAdapter.ts`
- `apps/backend/src/services/intelligenceEnvelope/adapters/personalizedRecommendationEnvelopeAdapter.ts`
- `apps/backend/src/services/intelligenceEnvelope/adapters/propertyRadarEnvelopeAdapter.ts`
- `apps/backend/src/services/intelligenceEnvelope/envelopeMappingRegistry.ts`
- `apps/backend/src/services/intelligenceEnvelope/qualifiedClaimCompatibilityRegistry.ts`
- `apps/backend/src/services/intelligenceEnvelope/envelopeRegistryValidation.ts`

**Implementation tasks**

1. Implement `EnvelopeKey`, `LineageKey`, `RevisionKey`, `IntelligenceEnvelopeItem`, query/page contracts, diagnostics, and stable cursor encoding.
2. Give every adapter one immutable descriptor containing exact `(type, domain, nativeSubtype, propositionType?)` capabilities, taxonomy version, lineage derivation version, revision-token algorithm, and freshness policy.
3. Make native-subtype mappings exhaustive and versioned. Unknown values return `UNMAPPED_NATIVE_VALUE` and fail certification; they never fall through to `OTHER`.
4. Preserve native provenance, evidence, nullable confidence, currentness, and native status. Do not copy native ranking fields such as `score` or `priorityBand`.
5. Implement lineage independently from revision identity so immutable successors share lineage but receive new revision/envelope keys.
6. For Radar, read only property-scoped matches/compound insights and retain global events as evidence references.
7. Populate `qualifiedClaim` only for verdict-bearing mappings. Detect conflict only when the complete claim key matches and a domain-owned compatibility table says the verdicts are incompatible; otherwise leave the relationship unknown.
8. Validate registry key/descriptor parity and reject duplicate capability ownership or missing subtype mappings at startup.

**Acceptance criteria**

- All seven registered producer models are represented and no ordinary domain store is registered.
- Every emitted item has mandatory identity, authorization scope, provenance, evidence, and freshness fields.
- Adapter failure is isolated to diagnostics; it cannot fabricate an item or negative factual claim.
- No Envelope contract contains ranking, delivery, dismissal, or promotion state.

### 5.3 Work package P0C — authorized query service and `query-envelope` Skill

**Implementation status (2026-08-28): Complete.** The implemented service is `intelligenceEnvelopeQuery.service.ts`. It authorizes through the canonical property-access resolver before invoking any producer reader; applies the closed producer/filter contract, stable ordering, query-bound cursor, bounded reads, total/per-producer latency budgets, and isolated diagnostics; and exposes a bounded Ask presentation. The `query-envelope` Skill, read-only adapter, dependency contract, evaluation package, and operation are registered. Every Skill manifest now declares autonomy explicitly (`0` observe, `1` material read/recommendation, `2` confirmation-gated mutation preparation), and startup validation rejects autonomy below declared materiality/effects or above the platform ceiling. This does not broaden the Envelope to ordinary domain records or create another Home Action ranking path.

**Proposed new files**

- `apps/backend/src/services/intelligenceEnvelope/intelligenceEnvelopeQuery.service.ts`
- `apps/backend/src/services/skills/query-envelope/skill.manifest.ts`
- `apps/backend/src/services/skills/query-envelope/index.ts`
- a query adapter in `apps/backend/src/services/skills/adapters/`

**Existing files to change**

- `apps/backend/src/services/skills/skill.contract.ts`
- `apps/backend/src/services/skills/skillRegistry.ts`
- `apps/backend/src/services/skills/adapters/skillAdapterRegistry.ts`
- `apps/backend/src/services/ask/askOperationRegistry.ts`
- `apps/backend/src/index.ts` startup validation aggregation

**Implementation tasks**

1. Authorize the real principal/property relationship before any adapter runs; `requestingAgentId` is audit context, never authorization.
2. Enforce filters, `limit` 1–100, deterministic ordering, query-shape-bound cursor, total latency budget, and per-adapter timeout.
3. Add `autonomyLevel` to `SkillDefinition` and validate it against operation effects/materiality and platform maxima.
4. Add an explicit reviewed autonomy level to every existing registered Skill manifest; do not introduce an implicit default that could hide a capability-policy mismatch.
5. Register the read-only `query-envelope` operation, adapter, Skill manifest, context budget, evaluation suite ID, and allowed result blocks.
6. Return a bounded summary contract suitable for Ask/Home Briefing; do not expose a public unbounded scan.

**Acceptance criteria**

- Cross-property and fabricated-principal reads fail closed.
- Pagination is stable and a cursor cannot be reused under different filters.
- One adapter timeout returns diagnostics while healthy adapters still contribute within the total budget.
- Skill registry/startup parity passes and the operation is read-only.

### 5.4 Work package P0D — authoritative HVAC presentation correction

**Implementation status (2026-08-28): Complete.** HVAC-category `ReplaceRepairAnalysis` records now act only as review triggers and supporting evidence in this promotion path. `loadRepairReplaceDecisionActions` fails closed unless exactly one active HVAC Decision Thread has current context and a supported current snapshot verdict; missing, stale, invalid, or ambiguous lineage produces neutral review copy. Verdict-dependent copy, option recommendation, confidence, priority, published-verdict evidence, and source revision come only from that snapshot; neutral urgency may still come from canonical non-verdict evidence such as recurring failures. Generic HVAC verdict-bearing summaries are also excluded from Guidance journey URLs. Non-HVAC analysis behavior and the canonical Home Action ranking, eligibility, and delivery owners are unchanged.

**Existing files to change**

- `apps/backend/src/services/homeActionSourcePromotion.service.ts`
- supporting presentation helpers used by `loadRepairReplaceDecisionActions`
- focused Home Action and Ask presentation tests

**Implementation tasks**

1. For an HVAC `ReplaceRepairAnalysis`, treat the generic verdict as trigger/evidence only.
2. Resolve the active HVAC `DecisionThread` and current, non-stale `RecommendationSnapshot`.
3. Before a current snapshot exists, emit neutral “review/decide” copy without a repair/replace verdict.
4. After a current snapshot exists, derive verdict copy and decision detail only from that snapshot.
5. Prove generic HVAC verdict fields cannot affect Home Action copy, priority inputs, or the deterministic HVAC engine input.
6. Leave non-HVAC `ReplaceRepairAnalysis` behavior unchanged in Phase 0.

**Acceptance criteria**

- Current snapshot: one published HVAC verdict, sourced from Decision Platform.
- Missing/stale snapshot: neutral action, no generic fallback verdict.
- No changes to `getHomeActionFeed()` ranking ownership, eligibility, or delivery.

### 5.5 Phase 0 verification

- TypeScript build and Prisma generation if the schema changed.
- Focused unit tests for taxonomy parity, adapter mappings, identity/revision, authorization, pagination, cursor binding, failure isolation, and HVAC before/current/stale states.
- Existing tests: `homeActionRepairReplacePromotion`, `replaceRepairPresentation`, Decision Platform HVAC routing/engine tests, Skill registry/evaluation/binding tests, and producer-ownership tests.
- Static negative assertion that Envelope modules do not import ranking, proactive-delivery, or producer-write services.

## 6. Phase 1 — Envelope Promotion Coverage Audit

**Implementation status (2026-08-28): Code complete; scheduled execution IPD-002-gated; not yet committed or live-verified.** Delivery increments 5–7 are all implemented. The hand-authored `COVERAGE_MANIFEST`, explicit non-actionable registry, startup validation, semantic digest, declared/authorized-observed union projection, evidence-basis classification, and exact declaration-drift certification are implemented. `CoverageAuditFinding` persists the coarse natural key and observation lifecycle; the audit reads properties in stable ID pages, resolves the real homeowner principal, uses the authorized internal Envelope coverage view, reports unresolved owners and adapter failures, and permits retirement only after a complete global run. The audit has no imports from promotion, ranking, eligibility, or delivery owners. No migration script was created. The `IPD-009` durable `CoverageAuditRun` model, `envelopeCoverageRun.repository.ts` (idempotent `createCoverageAuditRun`, CAS-protected atomic `finalizeCoverageAuditRun`, CAS `failCoverageAuditRun`), and the `IPD-001` weekly Sunday 04:30 UTC worker (`evaluateEnvelopePromotionCoverage.job.ts`) plus admin-only manual trigger through the shared `cron-trigger-queue` handler are implemented; `workerExecutionPolicy` gains `defaultScheduledEnabled: false` so manual inspection is allowed while cron activation stays closed until `IPD-002` operational acceptance. The admin backend (`adminEnvelopeCoverage.{service,controller,routes}.ts`, MFA + ADMIN + `WORKER_JOB_VIEW`) and the read-only admin frontend dashboard (`/dashboard/envelope-coverage`, nav entry `admin-envelope-coverage`) are implemented — active `REVIEW_REQUIRED` findings, declared-only support, observed declaration drift, matched rule IDs, digest/taxonomy version, bounded diagnostics, durable last-complete run, recent partial/failed runs, and retired history, with no promote/create-rule/mutation controls. Focused unit tests cover the run-lifecycle contract (`envelopeCoverageRunLifecycle.test.js`) and the shared scheduled/manual handler (`evaluateEnvelopePromotionCoverageJob.test.js`). Runs remain bounded to one invocation: interruption produces `FAILED` and a later invocation restarts globally; cursor-only resumption is prohibited. Remaining: commit the working tree, user runs `prisma db push` (1 new model + 2 enums) and `apps/workers` prisma client resync, resolve `IPD-002` to enable the schedule, and live-verify.

### 6.1 Persistence contract

`CoverageAuditFinding` remains the current-state projection in `apps/backend/prisma/schema.prisma`. Its natural key is `(producerModel, domain)`; do not add an item/envelope dimension.

Minimum fields:

- `producerModel`, `domain`, `determination`, `evidenceBasis`;
- `auditInputsDigest`, matched rule IDs, first/last observation timestamps;
- `active`, `lastAuditedAt`, `retiredAt`; and
- created/updated timestamps.

Store rule IDs using the repository's established JSON/list convention after checking existing Prisma patterns. Declaration-drift details may be bounded run diagnostics rather than a second durable model unless the admin reporting requirement demonstrates a need for historical per-capability records.

Add the minimal `CoverageAuditRun` approved by `IPD-009`. Required identity/lifecycle fields are `id`, unique `idempotencyKey`, `trigger` (`SCHEDULED` or `MANUAL`), `status` (`RUNNING`, `COMPLETE`, `PARTIAL`, or `FAILED`), `workerJobKey`, `correlationId`, `startedAt`, and `finishedAt`. Required reproducibility fields are `auditInputsDigest`, taxonomy version, deployment revision, and optional evaluation-contract version/status. Persist aggregate execution and reconciliation counts already returned by the audit service, including properties/pages, owner/property/adapter failures, observed capabilities, findings/review-required/declaration-drift/certification totals, and created/updated/retired totals. Diagnostics and failure summaries are bounded structured metadata; raw Envelope items, homeowner data, principals, and unrestricted errors are prohibited.

Insert the run as `RUNNING` only after the shared lease is acquired. Terminalize it exactly once with a CAS predicate on `status = RUNNING`. Finding reconciliation and terminalization share one database transaction; a `COMPLETE` run may retire absent findings, a `PARTIAL` run may update but never retire them, and a fatal pre-reconciliation error records `FAILED`. Do not store a continuation cursor or resume a run across invocations. A later retry creates or resolves through its own idempotent invocation identity and restarts the global audit. Future resumability requires a separate approved bounded observation-staging design.

Per project rules, update the Prisma schema and generated client, but do not create migration scripts; the user owns migration creation/execution.

### 6.2 Coverage audit service

**Proposed new files**

- `apps/backend/src/services/intelligence/envelopeCoverageManifest.ts`
- `apps/backend/src/services/intelligence/envelopeCoverageAudit.service.ts`
- `apps/backend/src/services/intelligence/envelopeCoverageDigest.ts`
- `apps/backend/src/services/intelligence/envelopeCoverageValidation.ts`
- `apps/backend/src/services/intelligence/envelopeCoverageRun.repository.ts`
- `apps/workers/src/jobs/evaluateEnvelopePromotionCoverage.job.ts`

**Existing files to change**

- `apps/backend/src/config/workerJobRegistry.ts`
- `apps/backend/src/config/workerExecutionPolicy.ts`
- `apps/workers/src/worker.ts`
- `apps/backend/src/index.ts`

**Implementation tasks**

1. Project exact declared adapter capabilities and authorized observed capabilities into distinct `(producerModel, primaryDomain)` pairs while preserving `DECLARED_ONLY`, `OBSERVED_ONLY`, and `DECLARED_AND_OBSERVED` evidence basis.
2. Emit certification-failing declaration drift for each observed exact tuple absent from its descriptor, even when the coarse pair is covered.
3. Match coverage only through a hand-authored `COVERAGE_MANIFEST`; never infer it from free-form `inputContracts` strings.
4. Validate manifest rule IDs, producer/domain values, contradictory non-actionable declarations, duplicate entries, and current taxonomy version at startup/CI.
5. Hash only semantically relevant sorted inputs: rule IDs, manifest, non-actionable declarations, exact adapter capabilities, and taxonomy version.
6. Read properties in stable pages, resolve each real homeowner principal, and record `OWNER_UNRESOLVED` rather than fabricating authority. Do not apply notification-consent filtering.
7. Create `CoverageAuditRun` after lease acquisition, mark it `COMPLETE` only after every page/adapter succeeds, and CAS-terminalize it exactly once. Reconcile findings and terminalize the run in one transaction: a complete run may retire missing natural keys, while a partial run may update observations but cannot retire findings. Fatal interruption records `FAILED`; retries restart globally rather than resume from a cursor.
8. Register the global internal-write job and handler with the `IPD-001` schedule (`04:30 UTC` every Sunday) and admin-only manual triggering. Both invocation paths use the same handler, execution policy, renewable per-job lease, and run-record contract; skip overlaps, never permit property-scoped retirement, and keep scheduled execution disabled until `IPD-002` operational acceptance. The job never performs homeowner delivery.

### 6.3 Admin reporting

**Proposed backend files**

- `apps/backend/src/services/adminEnvelopeCoverage.service.ts`
- `apps/backend/src/controllers/adminEnvelopeCoverage.controller.ts`
- `apps/backend/src/routes/adminEnvelopeCoverage.routes.ts`

**Proposed frontend files**

- `apps/frontend/src/lib/api/adminEnvelopeCoverage.ts`
- `apps/frontend/src/hooks/useAdminEnvelopeCoverage.ts`
- `apps/frontend/src/app/(dashboard)/dashboard/envelope-coverage/page.tsx`

The dashboard is admin-only and read-only. It shows active `REVIEW_REQUIRED` findings by default, declared-only support, observed declaration drift, matched rule IDs, digest/version, bounded diagnostics, the durable last complete run, recent partial/failed runs, and retired history. Run history comes from `CoverageAuditRun`, not the five-entry generic Redis cron history. It does not provide “promote,” “create rule,” or runtime mutation controls.

### 6.4 Phase 1 acceptance

- A zero-row database still produces declared-only findings.
- Observed exact capability drift fails certification and remains visible.
- Every projected pair has exactly one explicit determination.
- A rule without a matching manifest entry does not close a finding.
- A complete run retires removed keys; a partial run retires none.
- Run creation is idempotent, terminal transition is CAS-protected, and reconciliation plus terminalization is atomic.
- An interrupted run is `FAILED` and a retry restarts globally; no cursor-only continuation exists.
- The audit does not call `homeActionSourcePromotion.service.ts`, ranking, eligibility, or delivery.
- `IPD-002` evaluation metrics are checked in before operational acceptance.

## 7. Phase 2 — HVAC Specialist Agent

**Implementation status (2026-08-28): In progress.** Pull-request increment 8's code-owned foundation is implemented: the immutable multi-version `AgentDefinition` registry, canonical definition digest and checked-in baseline, active-version lookup, startup parity checks, referenced-version deployment-readiness seam, and the HVAC-only `RepairReplaceProfileRegistry`. The HVAC definition narrows the existing `repair-replace` Skill to its registered Decision Platform start/continue operations; it does not duplicate HVAC scoring. `ARD-002` is preserved by declaring `ASSET_LIFECYCLE` as the Envelope domain and keeping HVAC in the profile's typed inventory category. No `AgentDefinition` database model was added. The runtime trigger handler and the versioned agent evaluation suite are explicitly registered as `PENDING`, which validation permits only for `DEV`; moving the definition to `EVAL_APPROVED` or `ENABLED` fails closed until those dependencies are real. Runtime persistence and execution remain gated by `IPD-003`, `IPD-004`, `IPD-005`, and `IPD-007` as described below.

### 7.1 Code-owned definition and profile registries

**Proposed new files**

- `apps/backend/src/services/agents/agent.contract.ts`
- `apps/backend/src/services/agents/agentDefinitionRegistry.ts`
- `apps/backend/src/services/agents/agentDefinitionDigestBaseline.ts`
- `apps/backend/src/services/agents/agentRegistryValidation.ts`
- `apps/backend/src/services/agents/repairReplaceProfileRegistry.ts`
- `apps/backend/src/services/agents/definitions/hvacRepairReplaceAgent.definition.ts`

**Implementation tasks**

1. Store immutable definitions by `(agentId, semanticVersion)` with one code-declared active version.
2. Canonicalize and digest behavior-bearing fields. CI rejects a digest change under an existing key; behavior changes add a new version.
3. Validate referenced Skills, operations/adapters, context providers, trigger handlers, output contracts, evaluation suites, budgets, autonomy, safety, and active-version existence.
4. Add deployment-readiness validation against versions referenced by nonterminal runs, paused states, and delayed jobs.
5. Register only the HVAC profile in Phase 2. Category overlap, missing evaluation suite, or an unregistered decision definition fails startup.
6. Do not add an `AgentDefinition` Prisma model.

### 7.2 Runtime persistence

Add the following models to `apps/backend/prisma/schema.prisma` after `IPD-003` fixes retention policy and `IPD-007` fixes the run write lifecycle:

- `AgentRun`: append-only execution identity, pinned agent/version/digest/deployment revision, trigger/idempotency identity, principal/property/thread references, budget use, outcome, and correlation ID;
- `AgentState`: one live paused-state record per run, CAS version, schema version, bounded serialized state, expected event, expiry, and optional delayed-job identity;
- `ToolInvocation`: bounded append-only tool metadata, input/output hashes/references, timing, outcome, and correlation ID; and
- `LLMInvocation`: bounded append-only governed-request metadata, model/policy references, typed-claim references, tokens/cost/timing/outcome, without raw secrets or unrestricted prompts.

Required constraints include unique idempotency identity, one active paused state per run, indexes for property/user/status/expiry, and referential cleanup consistent with the approved retention policy. Do not write migration scripts.

### 7.3 Runtime and Specialist loop

**Proposed new files**

- `apps/backend/src/services/agents/agentRuntime.service.ts`
- `apps/backend/src/services/agents/agentRunRepository.ts`
- `apps/backend/src/services/agents/agentStateRepository.ts`
- `apps/backend/src/services/agents/agentInvocationAudit.service.ts`
- `apps/backend/src/services/agents/agentRetention.service.ts`
- `apps/backend/src/services/agents/agentPropertyContext.service.ts`
- `apps/backend/src/services/agents/repairReplaceSpecialist.service.ts`
- `apps/backend/src/services/agents/specialistToolSelection.ts`
- `apps/backend/src/services/agents/agentTriggerRegistry.ts`
- `apps/backend/src/services/agents/agentMetrics.service.ts`

**Implementation tasks**

1. Implement typed operations: `START_OR_RESUME`, `SUBMIT_CONTEXT`, `DISPUTE_INPUT`, `CONFIRM_FOLLOW_UP`, `CANCEL_FOLLOW_UP`, and `GET_STATUS`.
2. Re-authorize property access and verify expected CAS state version on every operation.
3. Resolve the pinned definition version before resuming; never silently upgrade a paused run.
4. Implement bounded selection among `REQUEST_CONTEXT`, `REQUEST_DOCUMENT`, `SCORE`, `EXPLAIN`, and—only if `IPD-004` approves it—`SCHEDULE_FOLLOW_UP`.
5. Enforce per-tool attempts, total loop iterations, time/context/LLM/cost budgets, explicit state-flag clearing, and first-class abstention.
6. Wrap `hvacRepairReplaceEngine.service.ts` through a registered Skill/tool. Do not duplicate its scoring logic and do not use generic HVAC verdicts as inputs.
7. Wrap `modules/propertyContext` with the typed `AgentContextRequest`; pass the real session/resolved-owner user ID through `getPropertyContext` authorization before any fact read. Agents never import Prisma for property facts, and `requestingAgentId` is attribution only.
8. Reuse `DecisionThread` and immutable `RecommendationSnapshot` for canonical decision state.
9. Make explanation LLM-optional. Deterministic score/result is authoritative; the LLM may select only registered typed claims and may not invent quantitative facts.
10. Treat follow-up scheduling as a Level 2 draft requiring confirmation, idempotent delayed job creation, CAS consumption, cancellation, and audit. If omitted, remove the tool from the enabled definition.
11. Extend `apps/backend/src/services/ai/aiRequestGovernance.service.ts` and the closed LLM-purpose contract for typed claims, per-agent budgets, structured-output validation, safety filtering, and governed caching/rate limits; do not add a second provider.
12. Implement retention/purge behavior from `IPD-003` using existing Ask minimization conventions and auditable bounded batches.
13. Attribute accepted/rejected Specialist outcomes through the existing `OutcomeObservation`/`CalibrationRelease` path; do not create a parallel learning store.

### 7.4 API and homeowner presentation

Add an authenticated Specialist controller/route using the repository's property authorization middleware. Return the canonical `DecisionThread` plus a bounded run-status projection; never expose raw persistence rows.

Extend the shared Home Action detail surface (`apps/frontend/src/components/home/HomeActionDecisionDetail.tsx` and its canonical consumers) with “Get help deciding” only for an eligible, delivered HVAC action. Render exactly five states: working, needs context/document, recommendation ready, abstained, and paused awaiting confirmed follow-up. Ask and in-app entry points must call the same backend operation.

### 7.5 Phase 2 verification and acceptance

- Registry key/version/digest immutability and missing-reference tests.
- Active-version selection and old-version continuation tests.
- Deployment failure when referenced versions are removed.
- Duplicate/concurrent start and resume idempotency tests.
- Authorization recheck, CAS conflict, expiry, ambiguous-thread, missing-identity, and budget-exhaustion tests.
- A static boundary test proving agent modules do not import Prisma for property facts and context reads pass through the existing authorization gate.
- Deterministic no-LLM path, typed-claim semantic validation, redaction, and bounded audit tests.
- HVAC engine and Decision Platform regression tests.
- Confirmed/cancelled/retried follow-up tests if `IPD-004` includes the tool.
- `IPD-005` evaluation contract passes before `EVAL_APPROVED`.

## 8. Phase 3 — Ask Cozy integration

**Existing files to change**

- `apps/backend/src/services/ask/askOperationRegistry.ts`
- `apps/backend/src/services/ask/askRoutingCascade.ts`
- `apps/backend/src/services/ask/askOrchestrator.service.ts`
- Ask Skill routing/evaluation fixtures and frontend chat presentation as required

**Implementation tasks**

1. Register `query-envelope` for non-actionable property intelligence questions.
2. Route HVAC “why/compare/help me decide” engagement to the same Specialist operation used by the Home Action UI.
3. Preserve canonical ranking: proactive/priority questions continue to consume `getHomeActionFeed()` only.
4. Permit Envelope summaries only from authorized returned items; adapter diagnostics or absence cannot become negative factual claims.
5. Preserve Ask execution governance, typed result blocks, citations/evidence, and remote-fallback policy.

**Acceptance criteria**

- A test fails if Ask ranks raw Envelope items.
- Non-actionable questions read the Envelope without creating Home Actions or coverage records.
- HVAC engagement continues the canonical Decision Thread and respects run idempotency.
- Cross-property and unsupported-domain queries fail safely.

## 9. Phase 4 — Generic appliance family and later extension

Treat Phase 4 as two scopes. Phase 4A is concrete; Phase 4B remains an admission process, not a promise to add unspecified specialists.

### 9.1 Phase 4A — `APPLIANCE_REPAIR_REPLACE`

**Existing files to change**

- `apps/backend/src/services/decisionPlatform/decisionDefinitionRegistry.ts`
- `apps/backend/src/services/decisionPlatform/decisionContextContracts.ts`
- `apps/backend/src/services/decisionPlatform/decisionFamilyAdapterRegistry.ts`
- `apps/backend/src/services/decisionPlatform/homeActionDecisionLineage.ts`
- `apps/backend/src/services/homeActionSourcePromotion.service.ts`
- `apps/backend/src/services/agents/repairReplaceProfileRegistry.ts`

**Proposed new file**

- `apps/backend/src/services/decisionPlatform/applianceDecisionFamilyAdapter.ts`

**Implementation tasks**

1. Add the definition ID, decision definition, context contract, evaluation suite, and registry entry as one atomic Decision Platform family.
2. Use `createSnapshotDecisionFamilyAdapter`; project the authoritative non-HVAC `ReplaceRepairAnalysis` without recomputing its verdict.
3. Explicitly map native appliance verdicts to Decision Platform verdict codes. Do not infer a 1:1 vocabulary.
4. Exclude HVAC at the adapter eligibility boundary.
5. Add `appliance-repair-replace:` lineage routing while retaining `repair-replace:` for HVAC.
6. Make both Home Action lineage and work-item lineage choose the family from the underlying inventory category.
7. Add `GENERIC_APPLIANCE` to the profile registry only after `IPD-006` is approved.

**Acceptance criteria**

- HVAC always routes to `HVAC_REPAIR_REPLACE`; eligible non-HVAC appliances route to `APPLIANCE_REPAIR_REPLACE`.
- The appliance snapshot preserves `ReplaceRepairAnalysis` provenance and supersedes only when the field-scoped input digest changes.
- Existing Home Action ranking/delivery behavior is unchanged.
- Ambiguous or unsupported categories abstain rather than falling back to HVAC.

### 9.2 Phase 4B — admission of later specialists

For each candidate, separately decide whether it is:

- another profile under an existing decision shape;
- a new Decision Platform definition with the same Specialist loop; or
- a genuinely new specialist with different tools, safety, or evaluation requirements.

Require a safety-tier review, autonomy ceiling, authoritative engine/source, typed context contract, professional boundary, evaluation suite, and complete promotion/lineage path. Do not admit higher-risk home systems by analogy to HVAC.

## 10. Cross-cutting schema and data rules

1. Update `apps/backend/prisma/schema.prisma` and every affected contract/service together.
2. Do not create migration files; the user creates and applies migrations.
3. Run `npm run prisma:generate` from `apps/backend` when dependencies are already available.
4. There is no Envelope item table, evaluation cursor, `AgentDefinition` table, or generic agent memory table.
5. Store only bounded, purpose-specific execution state and audit metadata.
6. Apply property/user authorization to every read and mutation, including worker reads.
7. Use immutable snapshots and append-only audit records where specified; use CAS for mutable paused state.

## 11. Pull-request sequence

Keep reviews bounded and preserve a green dependency chain:

| PR | Scope | Depends on |
|---|---|---|
| 1 | Shared issue-domain/evidence/entity/claim contracts and parity tests | None |
| 2 | Envelope contract, adapter descriptor registry, static mappings, certification tests | PR 1 |
| 3 | Authorized Envelope query service, cursor, diagnostics, and `query-envelope` Skill | PR 2 |
| 4 | HVAC Home Action authority/presentation correction | PR 1; may proceed parallel to PRs 2–3 |
| 5 | Coverage manifest, validation, audit/digest pure logic | PR 2 |
| 6 | `CoverageAuditFinding`, `CoverageAuditRun`, worker execution, atomic reconciliation/terminalization, and metrics | PRs 3, 5; `IPD-001` and `IPD-009` resolved; scheduled activation gated by `IPD-002` |
| 7 | Admin coverage API and dashboard | PR 6 |
| 8 | Agent contracts, immutable registry/digest baseline, HVAC profile, startup/readiness validation | PRs 3–4 |
| 9 | Agent persistence, repositories, and retention seams | PR 8; `IPD-003`, `IPD-007` |
| 10 | Bounded HVAC Specialist runtime, governed tools, typed claims, API | PR 9; `IPD-004` |
| 11 | Home Action engagement UI and Phase 2 evaluation closure | PR 10; `IPD-005` |
| 12 | Ask Envelope and Specialist routing | PRs 3, 10 |
| 13 | Generic-appliance Decision Platform family and category-aware ingress | PR 10; `IPD-006` |

No PR may combine a coverage finding with an automatically generated promotion rule. Closing a real finding is a separate human-authored change containing the producer loader, `compoundRuleRegistry.ts` entry, tests, and matching `COVERAGE_MANIFEST` entry.

## 12. Validation strategy

The repository has no development/test environment; verification is therefore code-path and contract focused.

For each PR:

1. trace requirements and affected workflows through Graphify and direct source inspection;
2. run `git diff --check`;
3. run `npm run build` in `apps/backend` when the existing dependency installation permits it;
4. run Prisma validation/generation after schema changes;
5. run only focused, environment-independent unit tests for the changed contracts and pure logic;
6. inspect startup registry validation aggregation in `apps/backend/src/index.ts`;
7. update affected architecture/FRD documentation when implemented behavior materially changes; and
8. run `graphify update .` after code validation and corrections as the final repository-maintenance step.

Do not spend implementation time configuring databases, containers, seeded users, browser infrastructure, or external providers solely to execute unavailable tests. Report exactly what was inspected and run.

## 13. Definition of done

The architecture is implemented when all of the following are true:

- all seven registered Envelope producer models pass mapping certification and authorized query tests;
- the shared taxonomy and evidence contracts have no unguarded duplicate vocabulary;
- HVAC has one computation authority and one published verdict authority;
- coverage cannot pass vacuously, declaration drift fails certification, and findings reconcile only after complete runs;
- no coverage component promotes, ranks, or delivers an item;
- the HVAC Specialist runs from a pinned immutable code definition with bounded tools, durable idempotency, CAS pause/resume, abstention, and bounded audit;
- Ask and Home Action UI use the same Specialist operations and canonical Decision Thread;
- generic appliances, if Phase 4A is activated, reach their own Decision Platform family without overlapping HVAC authority;
- all applicable owner inputs in §3 are recorded in versioned contracts; and
- no second ranking, eligibility, delivery, or mutable definition source exists.

## 14. Implementation start recommendation

Start with PR 1 (shared contracts) and PR 4's investigation in parallel at the engineering-workstream level, but merge shared contracts first. Then deliver the Envelope registry/query path before persistence-heavy coverage or agent work. This order exposes mapping and authority errors early, keeps Phase 1's universe mechanically derived from certified adapters, and prevents Phase 2 from building against unstable context/evidence contracts.

`IPD-001`, `IPD-008`, and `IPD-009` are resolved. Implement the Phase 1 weekly/manual worker and durable run contract, but keep scheduled execution disabled until `IPD-002` operational acceptance. Do not start Phase 2 schema migration work until `IPD-003` and `IPD-007` are resolved, and do not enable follow-up or generic appliance profiles without `IPD-004`/`IPD-006` respectively.
