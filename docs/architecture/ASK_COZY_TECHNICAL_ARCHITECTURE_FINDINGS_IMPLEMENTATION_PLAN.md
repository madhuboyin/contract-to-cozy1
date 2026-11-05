# Ask Cozy Technical Architecture Findings — Implementation Plan

**Date:** November 5, 2026

**Source review:** `docs/architecture/ASK_COZY_TECHNICAL_ARCHITECTURE_REVIEW.md`

**Planning basis:** code snapshot `61126057bbb063cd4a452c039289620952380655`, with the source review finalized through `79ed68fc`

**Status:** proposed plan; implementation has not started

## 1. Purpose and evidence boundary

This plan addresses the six current-state findings in the technical architecture review. It does not silently promote the review's future proposals—streaming, dense-vector routing, a multi-capability planner, provider abstraction, or offline mutation sync—into approved requirements.

The plan is based on static code and contract tracing. No database, Redis instance, deployed environment, worker, browser, or production-sized workload was executed while preparing it. Performance work therefore begins with measurement rather than an assumed architecture change.

The governing product constraints are:

- `ASK_COZY_MESSAGE_FIRST_FRD.md` MF-001: conversation proposes knowledge; canonical domain models remain the system of record.
- `ASK_COZY_MESSAGE_FIRST_FRD.md` MF-002: a new capability must not require a new dispatch branch in the orchestrator.
- `ASK_COZY_SOLE_HOMEOWNER_INTERFACE_FRD.md` §15, FR-PLAT-006: registered reads, commands, confirmations, search, work continuity, and saved artifacts remain available without an LLM.
- `ASK_COZY_SOLE_HOMEOWNER_INTERFACE_FRD.md` §17: property access is reauthorized and consequential actions remain confirmation-gated.
- `ASK_COZY_SOLE_HOMEOWNER_INTERFACE_FRD.md` §18, FR-PERF-001: providers have bounded timeout/partial-result behavior, and numeric p50/p95 targets must be established before retirement certification.
- `ASK_COZY_INTERACTION_MODEL_UI_FRD.md` §14, REC-002: this slice does not permit offline or queued mutations.

No phase may weaken authorization, confirmation, idempotency, provenance, source-health honesty, or deterministic operation availability to reduce latency or simplify registration.

## 2. Findings-to-work mapping

| Review finding | Plan treatment | Product decision required? |
|---|---|---|
| F1. Skill-ownership exceptions need classification | Phase 1: structured exception inventory and stronger startup validation | Only for exceptions whose intended ownership cannot be resolved from existing FRDs/code |
| F2. Import side-effect registration is latent coupling | Phase 2: one explicit runtime bootstrap contract and import/registration guardrails; descriptor consolidation remains optional | No for bootstrap/guardrails; yes before a wholesale registry-module redesign |
| F3. Single-turn serialization and possible write amplification are unmeasured | Phase 3: measurement contract and representative evidence; optimization selected afterward | Numeric targets and any user-visible transport change require approval |
| F4. Local semantic routing has no learned representation | Phase 4: certify and improve the existing deterministic router; dense embeddings remain a separate proposal | Yes before adding a remote/local learned embedding dependency or changing routing guarantees |
| F5. AI governance is process-local and health fan-out is per replica | Phase 5: shared rate/circuit state and one shared health-transition publication design | Yes for Redis-outage behavior and the authoritative global-vs-property health representation |
| F6. Provenance/evidence storage is fragmented, but user impact is unproven | Phase 6: consumer and journey impact trace; consolidate only if the trace proves a defect | Yes before schema ownership or foreign-key changes |

## 3. Cross-cutting definition of done

Every implementation phase must satisfy all applicable items:

1. The relevant FRD and directly affected contracts are cited in code or plan changes.
2. Property scope and `HouseholdRole` enforcement remain at the public capability invocation boundary.
3. Consequential writes remain proposal/confirmation flows with existing stale-version and idempotency behavior.
4. Registered deterministic capabilities still function when remote AI is disabled or unavailable.
5. Startup validation fails on missing, duplicate, stale, or contradictory registry entries.
6. Metrics use bounded labels; no property, user, execution, entity, message, or prompt identifiers become metric labels.
7. Focused environment-independent tests cover pure registry, policy, state-transition, and serialization logic where available.
8. `git diff --check` and the already-available lightweight TypeScript/registry checks are clean. Runtime infrastructure tests are reported, not fabricated, when no environment exists.
9. Any Prisma schema change updates affected contracts/types/services and runs `npm run prisma:generate` from `apps/backend` when dependencies are already available. No migration script is created.
10. A completed code phase ends with `graphify update .` after other validation and corrections.

## 4. Phase 0 — Freeze baselines and decisions

### Objective

Turn the review into reproducible inputs before changing runtime behavior.

### Work

1. Add a small read-only audit script under `apps/backend/src/scripts/` that emits:
   - operation, skill, capability-handler, domain-command, confirm-handler, presentation-block, renderer, suggested-action producer, and eligibility-rule counts;
   - every operation without an owning Skill;
   - whether each such operation is routable, launch-only, declared-action-only, internal capture, read, or command according to existing metadata;
   - missing/duplicate handler and adapter relationships using the existing validators rather than reimplementing their rules.
2. Add the audit command to the source review's reproducibility notes without making the generated count output a committed source of truth.
3. Record two owner/architecture decisions before Phase 5 implementation:
   - **AI-GOV-1:** on Redis failure, remote AI governance fails closed, uses a bounded local fallback, or uses another explicitly defined mode. Deterministic Ask operations must remain available either way.
   - **AI-HEALTH-1:** provider health is represented globally and resolved during reads, or property changes are published only to a deterministically affected property set. Re-enumerating every property per replica is not an accepted target.
4. Record that streaming, multi-capability planning, learned embeddings, provider abstraction, and offline mutation sync are outside the approved remediation scope unless separately authorized.

### Acceptance criteria

- One command reproduces the architecture inventory without network, database, Redis, or model access.
- The command reads authoritative registries/AST structures, not grep call-site counts.
- The two Phase 5 decisions are explicit before shared-governance code is written.

## 5. Phase 1 — Classify and govern skill-less operations

### Objective

Replace the flat `KNOWN_UNGOVERNED_OPERATIONS` carve-out with an auditable exception contract while preserving legitimate platform/internal operations.

### Affected areas

- `apps/backend/src/services/intelligence/skillOperationGovernance.contract.ts`
- `apps/backend/src/services/skills/skillRegistry.ts`
- `apps/backend/src/services/ask/askOperationRegistry.ts`
- `apps/backend/src/services/ask/askAudiencePolicy.ts`
- existing `apps/backend/tests/ask/*Registration*.test.js` and operation-specific governance tests

### Work

1. Introduce a structured exception definition keyed by `AskOperationId` with:
   - classification: `INTENTIONAL_PLATFORM`, `INTERNAL_CAPTURE`, `LAUNCH_ONLY`, or `TEMPORARY_GAP`;
   - reason and governing requirement/design reference;
   - allowed entry path;
   - equivalent controls that still apply (operation kill-switch, role floor, capability guard, declared-action verification, confirmation where applicable);
   - owner and removal condition for `TEMPORARY_GAP` entries.
2. Derive the legacy list shape from the structured registry temporarily if tests or consumers require it; do not maintain two independent sources.
3. Extend `validateSkillOperationGovernanceCoverage` so it rejects:
   - an undocumented skill-less property-scoped operation;
   - a stale exception after a Skill begins owning the operation;
   - an internal/launch-only exception that is message-routable;
   - a command exception without its required role floor, declared-action/typed route, or confirmation contract;
   - a temporary gap without an owner and removal condition.
4. Classify every current exception from repository evidence. If evidence conflicts or does not establish intended behavior, stop on that entry and request the product/architecture decision rather than guessing.
5. Add a generated audit table to this plan or a sibling audit document only after every entry has an evidence-backed classification.

### Acceptance criteria

- Every skill-less operation has exactly one structured classification.
- Startup validation detects an accidentally routable internal exception and a stale exception.
- Existing intentional internal, launch-only, and declared-action flows retain their operation-level guards.
- No operation receives a synthetic Skill merely to make validation green.

## 6. Phase 2 — Make capability registration initialization explicit

### Objective

Ensure every supported process/caller initializes the complete handler set through one documented contract, while preserving the existing acyclic import layers.

### Affected areas

- `apps/backend/src/services/ask/askOrchestrator.service.ts`
- `apps/backend/src/services/ask/capabilityHandlerRegistry.ts`
- `apps/backend/src/services/ask/confirmCapabilityHandlerRegistry.ts`
- a new explicit Ask runtime bootstrap/manifest module
- `apps/backend/src/index.ts`, controllers, scripts, and any worker entry points that invoke Ask capabilities
- `apps/backend/tests/ask/askImportGraphGuardrails.test.js`
- `apps/backend/tests/ask/orchestratorDecompositionGuardrails.test.js`

### Work

1. Inventory every production, script, test-helper, and worker import of `capabilityInvoke` and `confirmCapabilityInvoke`; classify whether it reaches the orchestrator facade first.
2. Define one explicit runtime bootstrap entry point that loads the complete static handler manifest and runs registry validation once. It must be idempotent and must not open a database/Redis connection merely by being imported in a pure test.
3. Call the bootstrap from every supported application entry point before accepting Ask traffic or jobs. Direct scripts must import the same bootstrap rather than depending on incidental import order.
4. Keep handlers from importing the orchestrator/bootstrap. Extend the import-graph guardrail to include the new module and detect cycles or reverse-layer imports.
5. Add a focused test that starts from an empty isolated registry/bootstrap state, initializes once and twice, and proves:
   - every operation adapter resolves;
   - every domain command's confirm adapter resolves;
   - the second initialization is harmless;
   - a deliberately omitted manifest entry is reported before invocation.
6. Remove the duplicate `claimActivity.handler` import as cleanup in this phase.
7. Do not combine this phase with the larger self-contained operation-descriptor proposal. If explicit bootstrap plus validation closes the demonstrated risk, descriptor consolidation remains a separate maintainability project.

### Acceptance criteria

- No supported caller relies on undocumented handler-import order.
- Missing handler registration fails during bootstrap/startup rather than on a homeowner invocation.
- Existing import-graph and facade-size guardrails remain green.
- No behavior, operation identifiers, role floors, or confirmation semantics change.

## 7. Phase 3 — Establish the Ask turn performance contract

### Objective

Measure the serialized turn path before selecting streaming, batching, query reduction, or async-tail changes.

### Affected areas

- `apps/backend/src/services/ask/execution/createAskExecution.ts`
- `apps/backend/src/lib/metrics.ts`
- synthesis, suggested-action, property-summary, and conversational-capture stage boundaries
- operations/runbook documentation for metric definitions and queries

### Work

1. Audit existing `askTurnStageDurationSeconds`, execution-duration, synthesis, Skill, context, and suggested-action metrics. Document whether each observation is a stage delta or elapsed-from-turn-start value.
2. Define bounded stage names for at least:
   - request/idempotency/session setup;
   - route and canonical execution;
   - synthesis;
   - trust validation;
   - action finalization;
   - base-result persistence;
   - post-persist events;
   - inline extraction;
   - property summary;
   - total turn.
3. Add counters/histograms only where the existing metrics cannot answer stage p50/p95 or failure/timeout attribution. Avoid operation IDs as labels if the resulting cardinality is not demonstrably bounded and useful.
4. Measure database work by a bounded per-turn query-count observation only if it can be scoped safely through existing Prisma instrumentation. Do not introduce global request cross-talk or log SQL/parameters. If safe attribution is unavailable, measure named repository stages instead and record query count as unresolved.
5. Define a representative static scenario matrix for later environment execution: deterministic read, write proposal, confirmation, clarification, remote synthesis enabled/disabled, extraction pre-filter miss, inline extraction success, and extraction timeout/fallback.
6. After real measurements exist, write a decision note choosing the smallest evidenced remedy:
   - remove redundant reads/writes;
   - batch independent event persistence;
   - move optional work after the durable response boundary;
   - or design progressive transport.
   Streaming is not the default conclusion.

### Acceptance criteria

- Every measured stage has an exact start/end definition and bounded labels.
- The metrics can distinguish canonical execution latency from synthesis and inline extraction.
- No unmeasured latency target is added to an FRD or acceptance criterion.
- Optimization implementation does not begin until representative p50/p95 evidence is available and FR-PERF-001 targets are approved.

## 8. Phase 4 — Harden the deterministic semantic router

### Objective

Improve and certify the existing local lexical/concept router without misrepresenting it as a learned embedding model.

### Affected areas

- `apps/backend/src/services/ask/askSemanticEmbedding.ts`
- `apps/backend/src/services/ask/askSemanticRouter.ts`
- `apps/backend/src/services/ask/askOperationSemanticPackages.ts`
- routing calibration, hard-negative, paraphrase, multi-intent, and trust certification corpora/tests

### Work

1. Rename documentation/telemetry descriptions that imply a learned dense embedding; preserve identifiers where renaming would break stored certification/version contracts unless a versioned migration is specified.
2. Generate a coverage report from the existing certification corpus by operation, language, confidence band, and failure class: false route, clarification, or fallback.
3. Add independently reviewed paraphrases and hard negatives only for measured gaps. Keep concepts operation-agnostic and examples owned by operation semantic packages.
4. Version the semantic index whenever features, weights, synonym groups, or examples change; recompute the existing calibration evidence.
5. Retain deterministic safety and direct-intent stages ahead of semantic classification.
6. Treat dense embeddings or `pgvector` as a separate design proposal requiring:
   - an approved privacy/data-flow and dependency decision;
   - deterministic degradation when the embedding source is unavailable;
   - new calibration and cross-operation negative certification;
   - an explicit latency budget from Phase 3.

### Acceptance criteria

- Documentation consistently calls the current mechanism feature hashing with curated concepts/subword features.
- Every semantic change has row-level positive and hard-negative evidence.
- Safety routing and high-materiality/write clarification thresholds do not weaken.
- Remote or learned embeddings are not introduced by this phase.

## 9. Phase 5 — Share AI governance across processes

### Objective

Enforce one aggregate rate window, one circuit state, and one health-transition publication policy across backend and worker processes.

### Affected areas

- `apps/backend/src/services/ai/aiRequestGovernance.service.ts`
- `apps/backend/src/lib/aiResilience.ts`
- `apps/backend/src/lib/redis.ts`
- existing Redis-backed rate-limit patterns in `apps/backend/src/middleware/rateLimiter.middleware.ts`
- `apps/backend/src/services/intelligence/sourceHealthImpact.service.ts`
- worker-side governed AI callers and startup health checks

### Work package 5A — Shared rate windows

1. Introduce a narrow storage port for governed-AI counters so policy logic is testable without Redis.
2. Implement an atomic Redis increment/expiry operation using a versioned namespace and route identifier. Do not place user text, property IDs, or credentials in keys.
3. Apply the approved AI-GOV-1 Redis-outage behavior. A local fallback must be explicitly identified as per-process and bounded; fail-closed behavior must return the existing transparent AI-unavailable degradation rather than break deterministic capabilities.
4. Add concurrency tests against a storage test double; run Redis integration coverage only when the existing environment is available.

### Work package 5B — Shared circuit state

1. Specify the circuit state machine: closed/open/half-open, failure threshold, open deadline, probe ownership, success reset, and stale-key expiry.
2. Store transitions atomically so only one half-open probe wins across processes.
3. Preserve per-route metrics while making the state itself shared.
4. Ensure a provider failure cannot authorize a request or mutate canonical state; it only controls optional AI availability.

### Work package 5C — Health publication without all-property fan-out per replica

1. Implement the approved AI-HEALTH-1 representation:
   - preferred when compatible with existing consumers: one global/provider health state resolved while assembling source health; or
   - publish only to properties deterministically known to depend on the route, using an affected-property query rather than `allPropertyIds()`.
2. Use a shared transition/version key so one logical provider transition is published once, not once per process.
3. Make publication retryable and idempotent. A failed publication must not advance the shared published-version cursor.
4. Remove `allPropertyIds()` from the AI route-health transition path after consumer parity is proven.

### Acceptance criteria

- Two simulated processes share one aggregate rate limit and one circuit transition.
- Exactly one half-open probe and one logical health publication occur per transition version.
- Redis failure follows the documented AI-GOV-1 behavior and leaves deterministic Ask operations usable.
- No route-health transition enumerates all properties unless the approved design explicitly proves that every property is affected.
- No secret, prompt, message, property ID, or user ID appears in shared governance keys or metric labels.

## 10. Phase 6 — Prove provenance/evidence impact before consolidation

### Objective

Determine whether the legacy `Document`/Home Record and provenance-model split causes a real user or integrity defect before changing schema ownership.

### Affected areas

- `apps/backend/src/services/ask/conversationalUnderstanding/conversationalCapture.ts`
- Prisma models and foreign keys for `Document`, Home Records, `HomeEventDocument`, `PropertyFactEvidence`, `SignalProvenance`, and `ExtractedFactCandidate`
- Ask consumers that attach, display, correct, promote, or export evidence
- Project Tracker, Negotiation Shield, Home Timeline, document promotion, and export flows

### Work

1. Produce a consumer matrix with, for each workflow:
   - accepted evidence identifier/store;
   - provenance/confidence representation;
   - visibility and household-role rule;
   - correction/deletion lifecycle;
   - export/search availability;
   - conversion or linking boundary.
2. Trace representative journeys end to end:
   - conversational event capture with legacy document evidence;
   - Home Record upload and later event attachment;
   - Project Tracker and Negotiation Shield evidence selection;
   - document candidate promotion;
   - correction, access loss, archive/delete, and export.
3. Classify each discrepancy as:
   - intentional bounded-context difference;
   - presentation-only inconsistency;
   - missing interoperability;
   - authorization/visibility defect;
   - provenance or referential-integrity defect.
4. If no material defect is demonstrated, close F6 as documented technical debt with ownership boundaries; do not build a universal knowledge store.
5. If a defect is demonstrated, write a focused design before implementation. It must choose the canonical owner, preserve existing IDs or define deterministic remapping, specify transactional/idempotent backfill behavior, and update every affected reader/writer/contract. No migration script is created by Codex; the user owns migration creation/execution.

### Acceptance criteria

- Every named store has at least one traced producer and consumer or is identified as unused.
- The audit identifies a concrete user/integrity impact before recommending consolidation.
- No cross-store identifier is silently reinterpreted.
- Any approved schema design includes authorization, correction, provenance, and rollback/retry semantics.

## 11. Decision-required proposals not scheduled by this plan

The following remain separate proposals because they change product behavior, trust boundaries, dependencies, or transport contracts:

### Progressive streaming

Requires Phase 3 evidence and an approved protocol for committed-result ordering, event IDs/replay cursors, reconnect, terminal idempotency, access-loss redaction, schema compatibility, partial failures, and accessible announcements.

### Multi-capability read planning

Requires an approved trust contract limiting the planner to independently authorized non-material reads, with per-result provenance/freshness, isolated failures, contradiction detection, deterministic merge/deduplication, composition-level trust validation, and clarification for ambiguous intent/entity scope. Writes, proposals, confirmations, transmissions, and financial decisions remain excluded.

### Provider-neutral LLM abstraction

Requires a provider contract and conformance suite for structured output, timeouts/cancellation, usage accounting, retry classification, safety/degradation, and data handling. Model-name configuration alone is not provider abstraction.

### Dense embeddings or hybrid RAG

Requires the Phase 3 latency budget, a privacy/dependency decision, deterministic fallback, and new cross-operation calibration/certification. It must not replace deterministic safety/direct-intent routing.

### Offline continuity

Under REC-002, current scope is limited to separately approved cached reads or unsent local drafts with staleness, encryption, sign-out, and access-loss eviction rules. Queued domain mutations require a new FRD covering reauthorization, stale confirmation, conflicts, privacy, idempotency, and reconnect reconciliation.

## 12. Recommended sequence and dependencies

```text
Phase 0 baseline and decisions
  ├─> Phase 1 skill-less governance
  ├─> Phase 2 explicit registration bootstrap
  ├─> Phase 3 performance measurement ──> later transport/optimization decision
  ├─> Phase 4 deterministic router certification
  └─> Phase 5 shared AI governance (blocked on AI-GOV-1 and AI-HEALTH-1)

Phase 6 provenance impact trace may run after Phase 0 and remains audit-only
until a concrete defect and focused design are approved.
```

Recommended delivery order is Phase 0, Phase 1, Phase 2, Phase 3, Phase 5, Phase 4, then Phase 6. This closes governance and initialization risks first, establishes evidence before performance work, and avoids spending schema effort on an unproven fragmentation impact.

Each phase should be its own reviewable change. Do not combine registry restructuring, performance optimization, AI shared-state migration, and provenance schema changes in one implementation slice.

## 13. Validation and reporting matrix

| Phase | Required lightweight validation | Not claimed without an environment |
|---|---|---|
| 0 | audit script output; registry/count parity; `git diff --check` | production counts or latency |
| 1 | focused governance-validator tests; startup validation; TypeScript check if already available | live routing across seeded users |
| 2 | bootstrap idempotency/completeness tests; import-graph and decomposition guardrails | server/worker startup in deployed topology |
| 3 | metric-definition tests; bounded-label review; static stage tracing | p50/p95, query counts, or user-perceived latency |
| 4 | routing calibration, paraphrase, hard-negative, multi-intent, and safety-overlap tests | open-ended language quality beyond the corpus |
| 5 | storage-port/state-machine tests; shared-key/idempotency tests; existing Redis integration tests when available | real multi-pod failover or production provider outage behavior |
| 6 | consumer/journey trace and contract/schema review; focused pure mapping tests if a design follows | migrated data or runtime interoperability without a database |

Final reporting for each phase must state what was code-traced, what was executed, what could not run, and whether any owner decision remains open. An unavailable runtime environment is not a blocker to completing static implementation work, but it must never be described as executed validation.
