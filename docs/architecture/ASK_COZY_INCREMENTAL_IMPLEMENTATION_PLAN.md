# Ask Cozy — Incremental Implementation Plan (Stage 3, Part B)

**Type:** Phased execution plan. No implementation, no schema edits, no migrations in this document.
**Baseline:** `docs/product/ASK_COZY_MESSAGE_FIRST_FRD.md` (Part A — defines *what*) and `docs/architecture/ASK_COZY_TARGET_PRODUCT_AND_ARCHITECTURE.md` (Stage 2 — architecture decisions, treated as approved baseline per this stage's brief). This document defines *how to get there incrementally*.
**Evidence discipline:** every claim about current implementation is cited `path:line` and was verified fresh during this stage's research (five parallel verification passes into correction-mode dispatch, schema representations, Home Event Radar runtime state, the handler inventory (67 operations documented, confirmed complete against the registry per §4.8), and existing UI/eval infrastructure) — not copied from Stage 2 without re-checking where implementation detail matters, per this stage's explicit instruction.
**Revision note 1:** an external review round against this document and the FRD together, checked against fresh code reading rather than taken on faith, found: a second, undocumented dispatch surface for confirmed-write execution (§4.9, new); Phase 3's own representative mortgage-rate example targets a fact the current capture path rejects (§9); Phase 3's async-fallback delivery has an unstated dependency on Phase 5 infrastructure (§9, §15); a real contradiction between this document's own §8 and §20 on which phase adds three schema fields (§20, fixed); and one review claim — that the request's instructions prohibit production-usage gating and rollout flags — was checked directly against the original request text and found unsupported (the request explicitly asks for these flags and this risk ordering in its own §39/§40); Phase 7's "production use, not just tested" gate is this document's own addition beyond the request's vaguer "proves stable," softened accordingly (§13).
**Revision note 2:** a follow-up review round found revision 1 had acknowledged two gaps without closing them. Both now closed: §9 specifies the financing writer's full atomicity/idempotency contract (transaction shape modeled on `capturePropertyFact`, evidence-create gating the profile upsert for replay safety, and verification that the existing financing context assembler already reads real evidence over its synthetic fallback with zero reader-side change) and explicitly revises Phase 3's acceptance criterion to exclude proactive async-fallback delivery rather than leaving that gap implicit; §18/§19 decide the child-execution delivery contract (a bounded, one-level-deep `childExecutions` field on the response, plus a one-line frontend change) instead of deferring the choice.
**Revision note 3 — Phase 0 implementation pass (this session):** closes every decision §6 listed as blocking Phase 1, each verified fresh against code rather than assumed, per `docs/architecture/AUDIT_METHODOLOGY.md`: §4.2's two `GroundedAskProposal.kind` gaps (`UPLOAD_EVIDENCE` scoped to `HomeEventEvidence`-backed evidence on a sibling `HomeEvent` candidate only, not a generic cross-kind link — the schema has no evidence-attachment target for any other candidate type, confirmed by reading `PropertyFactEvidence`'s columns directly, so that remainder is left explicitly open rather than silently dropped; `ADD_NOTE` mapped onto `HomeEvent` with `type: NOTE`, already a precedented enum value in production code paths); §4.6's domain-list fix (per-component allowlist, not unconditional widen) **plus a new finding this pass's own verification surfaced that the FRD's speculative "may already keep results relevant" framing turned out to be false**: `matchesQuery`'s domain and entityRef filters are independent ANDs, and `PropertyRadarMatch`/`PropertyRadarCompoundInsight` — the actual source of the WEATHER-domain radar insights this fix exists to surface — never populate an `entityRef` at all, so neither fix option alone makes Scenario 8.4 work; §4.7's `HVAC_SPECIALIST_ENGAGE` question (closed: not a gap, see below); and the renovation-naming ambiguity FRD §31 flagged (closed: two genuinely distinct features, no rewiring — new §4.10). One more Phase 0-flagged item lived only in the FRD, not mirrored into this document's own §4/§6 checklist (FRD §33): whether a `HomeEvent` review/correction UI exists — confirmed yes, already fully wired (`/dashboard/properties/[id]/timeline`, `correctHomeEvent` PATCH with a required `correctionReason`), no new UI work needed. No schema edits or code changes were made in this pass; per this document's own charter (line 3), Phase 0 output is decisions, cited against code, not implementation.

---

## 1. Executive Summary

Seven phases, each independently releasable, each leaving Ask Cozy fully operational at every boundary. Phase 0 resolves five open questions Stage 2 explicitly could not verify (this stage now has code-grounded answers for four of them, one genuinely still open pending a reachable database). Phases 1–2 build the two pieces of infrastructure everything else depends on — capability invocation and confirmation convergence — before Phase 3 lets extraction produce a single write. Phases 4–7 layer next actions, proactive continuation, long-lived goals, and additional capability exposure on top of a foundation that doesn't need to change again once Phase 2 lands.

---

## 2. Implementation Principles

1. Each slice leaves Ask Cozy operational — no phase requires a "big bang" cutover.
2. Each slice delivers one coherent architectural capability, not a partial fragment of several.
3. Each slice has a rollback boundary (a feature flag, or a change small enough to revert cleanly).
4. Each slice has acceptance criteria and tests/evals before it's considered done.
5. No unnecessary feature expansion — a slice does the smallest thing that proves the architecture, not the most complete version of a feature.
6. No production users exist — clean internal refactoring is preferred over compatibility shims, but this does not license breaking already-working flows (refinance, HVAC decisioning) without a concrete architectural reason.

---

## 3. Architecture Dependencies

```
Capability Invocation (Phase 1)
        ↓
Confirmation Convergence (Phase 2)
        ↓
Conversational Capture (Phase 3)
        ↓
Next Actions (Phase 4)
        ↓
Proactive / Goal workflows (Phase 5, 6)
        ↓
Additional Capability Exposure (Phase 7)
```

Capability Invocation must precede Confirmation Convergence because the new `CAPTURE_FACT_CONFIRM`/`CAPTURE_EVENT_CONFIRM` operations need somewhere to register a handler. Confirmation Convergence must precede Conversational Capture because extraction should never produce a write path that hasn't already been proven safe with a synthetic candidate (this plan's Phase 2 acceptance criterion is deliberately extraction-free). Next Actions depends on capabilities being invokable through the registry (Phase 1) to scan for relevance. Proactive/Goal work depends on confirmation being safe (Phase 2) since both eventually produce material writes. Additional capability exposure is last because it's pure surface-area growth on a now-stable foundation.

---

## 4. Pre-implementation Verification (Phase 0 results)

Five items from Stage 2's own flagged-unverified list, resolved by this stage's research — presented as the four-part format wherever new evidence changed a Stage 2 assumption, otherwise as a direct resolution.

### 4.1 `askDomainCommandRegistry.ts` correction-mode dispatch
```
STAGE 2 ASSUMPTION: reuse AskDomainCommandRegistry's correctionModes vocabulary (EDIT/PAUSE/
  RESUME/STOP/REVERSE/REOPEN/REVOKE) for captured facts too.
NEW CODE EVIDENCE: a repo-wide grep for `correctionModes` finds only its own type declaration,
  factory parameter, and assignment inside the command() builder (askDomainCommandRegistry.ts:40,
  54, 64) — it is never read anywhere else. The only field from AskDomainCommandDefinition
  actually consumed elsewhere is `.supportsCancelBeforeExecution`, used once
  (askOrchestrator.service.ts:9356-9357) for pre-execution dismissal of a still-NEEDS_CONFIRMATION
  execution — a materially simpler operation than EDIT/REVERSE/REOPEN/REVOKE. Grepping the literal
  mode strings against askOrchestrator.service.ts finds only unrelated, coincidentally-named
  concepts (a maintenance-task action enum sharing 'EDIT'/'REOPEN' values, a buyer-journey
  PAUSE/RESUME boolean) — REVERSE appears nowhere outside its own type union.
IMPACT: there is no existing correction/reversal dispatcher to reuse at all — not "hand-written
  per command" as Stage 2 hedged, but entirely unconsumed metadata.
RECOMMENDED ADJUSTMENT: build correction/reversal for captured facts and events directly on
  HomeEvent's existing, working supersedesEventId/isCurrent revision chain (confirmed real and
  already the model's designed correction mechanism) and PropertyFactEvidence's existing
  supersededAt chain. Do not design around correctionModes providing anything. Scoped as its own
  small task in Phase 2 (§8.2).
```

### 4.2 `GroundedAskProposal.kind` mapping — 2 of 7 kinds need a Phase 0 decision, not an assumed mapping
Full table in FRD §23. `ADD_FACT`/`CORRECT_FACT`/`CREATE_TASK`/`START_JOURNEY`/`COMPARE_OPTIONS` map cleanly (the last three onto exact existing operations with zero semantic drift). `UPLOAD_EVIDENCE` and `ADD_NOTE` do not — see FRD §23 for the specific gap in each.

**Phase 0 resolution (this pass), both verified fresh against code:**

```
UPLOAD_EVIDENCE:
  NEW CODE EVIDENCE: today's confirm path (`groundedAsk.service.ts:252-260`) only verifies an
    already-uploaded Document belongs to the user/property, then records the linkage inside
    `GroundedAskArtifact.artifactJson` (`groundedAsk.service.ts:261-273`) — it never writes
    `Document` itself and never uses either of the schema's two real "Document evidences record X"
    join tables. `DOCUMENT_PROMOTION_CONFIRM`, checked directly, writes to a materially different
    target: it promotes an already-extracted candidate field from a domain-specific pending-review
    row (`MaterialExtractionReview`, `InsurancePolicyFact`, `InspectionReport`) into that domain's
    canonical record (`MaterialSpec`, `InsurancePolicy`/`InsurancePolicyTerm`, inspection findings)
    — never touching `Document` or evidence at all (`askOrchestrator.service.ts:8333-8364`). These
    are confirmed genuinely different persistence targets, not one write under two names — the FRD
    §23 gap was real, not an artifact of under-specification.
  SCOPE FINDING: the schema's only "Document is evidence for record X" table is
    `HomeEventEvidence` (`schema.prisma:7545-7567`) — and its `eventId` is a required FK to
    `HomeEvent`, not a generic polymorphic target. `PropertyFactEvidence` (`schema.prisma:4489-4506`)
    — the only other plausible target, for evidence on a captured fact rather than an event — has
    no `documentId` column and no evidence-array of any kind. So there is no existing schema
    surface for "this Document is evidence for a *fact*, task, journey, or comparison candidate,"
    only for a HomeEvent.
  DECISION: do not extend `DOCUMENT_PROMOTION_CONFIRM`'s semantics (confirmed wrong target above).
    Scope `UPLOAD_EVIDENCE` down to what the schema actually supports today: evidence attached to a
    sibling `HomeEvent` capture candidate in the same extraction batch, using the same bidirectional
    `linkedExecutionId` sibling-linking mechanism §22 already specifies for Warranty/HomeEvent pairs,
    writing to `HomeEventEvidence` on confirm (`documentId` + `eventId` + `sourceEntityType`/
    `sourceEntityId` for secondary provenance). Evidence for any other candidate kind (a fact, a
    task, a journey) has no existing write target and is **left explicitly open** — this is a real
    schema-change decision (a `documentId`/evidence-array on `PropertyFactEvidence`, or an
    equivalent), out of a verification-only Phase 0's scope per this document's own charter (line 3:
    no schema edits in this document). Whoever scopes Phase 3 (the phase that first touches
    `PropertyFactEvidence` writes, §9) must decide whether to add it there or continue deferring it
    — tracked here so it is not silently dropped the way the original UPLOAD_EVIDENCE gap was.

ADD_NOTE:
  NEW CODE EVIDENCE: note text lives only in `GroundedAskArtifact.artifactJson`
    (`groundedAsk.service.ts:265-271`) today — no dedicated column, no queryable domain model, per
    FRD §23's original finding, confirmed unchanged. `HomeEvent.type` already has a precedented
    `NOTE` value in the `HomeEventType` enum (`schema.prisma:7328-7344`), already used by
    `permitDetection.service.ts:299` and `claims.service.ts:1151` — this is not a hypothetical fit,
    it is an existing pattern. `HomeEvent.occurredAt` is a required, non-nullable column
    (`schema.prisma:7440`), so a note cannot be literally dateless — it needs `occurredAt` defaulted
    to confirm-time and `datePrecision: UNKNOWN` (`schema.prisma:7378-7384`, an existing enum
    variant built for exactly this). `amount`/`summary` are nullable (`schema.prisma:7450, 7447`),
    so a note with no dollar figure is fully supported.
  DECISION: `ADD_NOTE` → `HomeEvent` capture (§20) with `type: NOTE`, `occurredAt` = confirm time,
    `datePrecision: UNKNOWN`, `amount`/`summary` null. No new model. **Behavior change to flag
    explicitly, not silently absorb:** today's proposal schema exempts `ADD_NOTE` alone from
    requiring a `propertyId` (`groundedAsk.contract.ts:18`); `HomeEvent` is inherently
    property-scoped, so this mapping requires a `propertyId` for every note going forward. Accepted
    under Implementation Principle #6 (no production users exist yet) — but Phase 3, which
    implements this capture path, must state this narrowing in its own acceptance criteria rather
    than let it surface as an unreviewed regression.
```

**Action closed this revision** — both decisions above are final for this program; the one remainder (non-HomeEvent evidence attachment) is a tracked, explicit open item for Phase 3's scoping, not an unresolved Phase 0 question.

### 4.3 `AskOperationId` / `DecisionThread.goalCode` schema representation — resolved, no schema change needed
**[FACT]** `AskExecution.operationId` (`schema.prisma:7951`) is a plain nullable `String`; `AskOperationId` (`askOperationRegistry.ts:19-22`) is a plain TS string-literal union, not generated from or synced with any Prisma enum. `DecisionThread.goalCode` (`schema.prisma:8269`) is likewise a plain, non-nullable `String`, no Prisma enum exists. **Conclusion:** adding `CAPTURE_FACT_CONFIRM`/`CAPTURE_EVENT_CONFIRM` and `SELL_HOLD_RENT`/`RENOVATION`/`CLAIM`/`REFINANCE` requires zero schema change — new string literals used by convention, exactly like every existing addition to these two spaces.

### 4.4 `DomainEventType` duplication — narrower and different than Stage 1/2 described
```
STAGE 2 ASSUMPTION (inherited from Stage 1): DomainEventType is duplicated between a 9-member
  backend emitter union and a 14-member worker consumer union — a maintenance-risk duplication.
NEW CODE EVIDENCE: DomainEventType IS a real, correct 14-member Prisma enum (schema.prisma:
  9360-9374), the actual source of truth (used at schema.prisma:9543 on the DomainEvent model).
  The worker consumer's hand-written type (processDomainEvents.job.ts:17-30) currently matches
  all 14 members in the same order — a redundant hand-copy (future-drift risk), not a present
  divergence. The actual divergence is on the EMITTER side: domainEvents.service.ts:7-16's
  EmitDomainEventInput.type has only 9 members, missing 5 refinance-related ones
  (REFINANCE_DATA_REQUIRED, REFINANCE_DECISION_RECORDED, REFINANCE_DECISION_CHANGED,
  REFINANCE_NEXT_STEP_STARTED, REFINANCE_OUTCOME_COMPLETED). This is a live bug, not theoretical:
  refinanceDecision.service.ts:470 already writes these 5 event types via a raw
  tx.domainEvent.create(...) call, bypassing DomainEventsService.emit() entirely because the typed
  helper doesn't support them, and homeActionSourcePromotion.service.ts:3669 already reads
  REFINANCE_DATA_REQUIRED events back out — these events are live in production code paths today.
IMPACT: the new ASK_EXTRACTION_REQUESTED and ASK_CAPTURE_LINK_RECONCILE event types this program
  adds (FRD §14, §22) need to go into the already-correct 14-member Prisma enum plus the
  emitter's type (which needs widening regardless of this program, since it's already
  incomplete) — not two independently-maintained lists as previously assumed.
RECOMMENDED ADJUSTMENT: as part of Phase 1 (the first phase touching DomainEvent for this
  program's own new event types), widen EmitDomainEventInput.type to the full correct set (or
  import Prisma's generated enum directly instead of hand-duplicating), and migrate
  refinanceDecision.service.ts:470's raw call onto the typed emit() path once it supports the
  full set — this is pre-existing debt this program's own event-type additions would otherwise
  compound. Separately flag to the worker file's owner: replace its hand-copied union with an
  import of the same Prisma-generated enum.
```

### 4.5 Home Event Radar runtime population — could not be verified; treat as a precondition to establish
**[FACT]** No database reachable in this environment matching the app's configured `DATABASE_URL` (`127.0.0.1:5433`, nothing listening; no Docker containers running). Could not query live data. **What code shows instead:** `apps/backend/prisma/seed.ts` has zero references to `PropertyRadarMatch`/`RadarEvent`/`PropertyRadarCompoundInsight` — none of the seeded test users/properties get any radar rows. **Action for Phase 0:** do not assume Radar data exists for any test property. Establish it via either (a) running the real ingestion/matching pipeline against a reachable weather API and database, or (b) a purpose-built fixture script, before Phase 7's Home Event Radar work is demonstrated or tested end-to-end.

### 4.6 `askEnvelopeQueryScope.ts` weather-domain bug — confirmed unchanged, fix scope is a real decision
**[FACT]** Bug confirmed present exactly as Stage 1/2 described (`askEnvelopeQueryScope.ts:26` hardcodes `domains: ['ASSET_LIFECYCLE']` for every matched component). **New nuance this pass found:** roof signals are already legitimately split across both `ASSET_LIFECYCLE` (`aging_roof_condition_review`) and `WEATHER` (`SEVERE_WEATHER_OPEN_ROOF_ISSUE`, `envelopeMappingRegistry.ts:55,87`) domains — so the fix is a real design choice, not a one-line addition:
- **(a)** Unconditional widen: `domains: ['ASSET_LIFECYCLE', 'WEATHER']` for every matched component.
- **(b)** Per-component allowlist: add `WEATHER` only for `ROOF`/`FOUNDATION`/`EXTERIOR`/`SITE` (each has a plausible WEATHER-domain rule), excluding `INTERIOR`.
**Action:** before picking (a) or (b), verify `intelligenceEnvelopeQuery.service.ts`'s `entityRef`/`componentKind` filtering logic (not read in this pass) — it may already keep results relevant regardless of domain-list breadth, which would make (a) safe and simpler.

**Phase 0 resolution (this pass):** the FRD's speculation above does not hold — verified directly.

```
NEW CODE EVIDENCE: `matchesQuery` (`intelligenceEnvelopeQuery.service.ts:505-516`) applies the
  `domains` filter and the `entityRefs` filter as two independent `if (...) return false` checks —
  an item must pass both, neither compensates for the other. So entity-ref scoping does not make an
  unconditional domain widen "safe by narrowing anyway," as the open question above speculated.
NEW FINDING (not previously flagged, more consequential than the (a)/(b) choice itself):
  `matchesEntityScope` (`:490-503`) only matches a componentKind-scoped `{PROPERTY, entityId,
  componentKind}` query against an item whose `subject.entityRef.entityType === 'INVENTORY_ITEM'`
  with a category in `COMPONENT_INVENTORY_CATEGORIES`. Of the seven envelope producer readers, only
  three ever populate `entityRef` at all: `Signal`, `GuidanceSignal` (`guidanceSignalEnvelopeAdapter.ts:38-44`,
  only when the underlying row has an `inventoryItemId`), and `RecommendationSnapshot`
  (`intelligenceEnvelopeQuery.service.ts:349-354`, same condition). `PropertyRadarMatch` and
  `PropertyRadarCompoundInsight` — the producers that actually carry the WEATHER-domain radar
  insights this fix exists to surface (`SEVERE_WEATHER_OPEN_ROOF_ISSUE`, `heavy_rain`,
  `flood_risk`, etc., per `envelopeMappingRegistry.ts:63-89`) — never set `entityRef`
  (`intelligenceEnvelopeQuery.service.ts:397-460`, no `entityRef` field in either mapped item).
  `matchesEntityScope` returns `false` immediately when `actual` is absent (`:492`). So today, no
  Radar-sourced item can ever satisfy a component-scoped query from `resolveAskEnvelopeQueryScope`
  — regardless of which domain-list option is chosen, Scenario 8.4 (asking about roof weather risk)
  would still return nothing from Radar.
DECISION: adopt **(b)**, the per-component allowlist (`ROOF`/`FOUNDATION`/`EXTERIOR`/`SITE` gain
  `WEATHER`; `INTERIOR` does not) — it is strictly more precise than (a) with no downside now that
  entity-ref scoping is confirmed not to compensate for an overly broad domain list, and it
  documents intent correctly for future WEATHER-domain rules. **But this alone does not achieve the
  fix's actual goal.** Separately required, and not previously scoped anywhere in this program:
  give `propertyRadarMatchEnvelopeAdapter`/`propertyRadarCompoundInsightEnvelopeAdapter` an
  `entityRef` (at minimum `{entityType: 'PROPERTY', entityId, componentKind}` when a radar rule can
  be attributed to a specific component — e.g. `SEVERE_WEATHER_OPEN_ROOF_ISSUE` → `ROOF`) before
  §31's Scenario 8.4 is actually demonstrable. Scoped into **Phase 7** (§13, Home Event Radar
  exposure), alongside the already-known Radar-seed-data precondition (§4.5) — both are
  preconditions for the same demonstration, not Phase 0 or Phase 1 work, since neither phase
  touches these adapters.
```

### 4.7 Handler inventory, and the one confirmation-registry question it surfaced — **CLOSED this revision**
Full handler table in §5 below — completed in this pass, not deferred. That table surfaced one open question worth resolving here rather than leaving implicit: `HVAC_SPECIALIST_ENGAGE` is classified `MATERIAL_DECISION`/`CONTRIBUTOR` in `askOperationRegistry.ts` but has **no entry** in `askDomainCommandRegistry.ts` — every other material-write operation has one. Its confirmation (if any) is handled inside the specialist-agent runtime itself, not via the standard command path.

**Phase 0 resolution (this pass):**

```
NEW CODE EVIDENCE: `hvacSpecialistEngageResult` (`askOrchestrator.service.ts:5897-6135`) never
  returns `NEEDS_CONFIRMATION` — it resolves only to `ANSWERED`/`READY_WITH_LIMITATIONS`/
  `NEEDS_ENTITY`/`BLOCKED`/`UNAVAILABLE` (`:6072-6085`, `:6091-6135`) and never enters the
  `AskConfirmationReceipt` flow at all. Tracing into the runtime it calls
  (`hvacRepairReplaceSpecialist.service.ts:1-9`, header comment: "drives the canonical
  decision-family adapter... never recomputes HVAC scoring"), the only Prisma writes anywhere in
  that file are through the `DecisionThread`/`RecommendationSnapshot` decision-family adapter —
  advisory decision-support records, not a consequential real-world mutation. No booking,
  scheduling, or claim-creation call exists in this path. Separately, the agent runtime has its own
  durable, immutable audit trail, architecturally parallel to `AskConfirmationReceipt` rather than
  absent: `AgentRun` (`schema.prisma:15800-15828`, immutable terminal insert per run, full
  attribution — `principalUserId`, `propertyId`, `originAskExecutionId`, etc.),
  `AgentRunReservation` (`:15771-15798`, concurrency/claim control), `AgentState`
  (`:15844-15866`, CAS-versioned pause/resume state), and `ToolInvocation`
  (`:15868+`, per-tool-call audit rows).
VERDICT: not a gap. The specialist writes only advisory artifacts, never a consequential mutation,
  and substitutes a dedicated, equally durable, agent-specific audit trail for the homeowner
  confirmation gate specifically because what it writes doesn't warrant one.
DECISION: no `askDomainCommandRegistry` entry for `HVAC_SPECIALIST_ENGAGE`. Its confirmation column
  in §5's table stays `N`, now resolved rather than open; Phase 1's passthrough-category shim
  (FRD §16) preserves this behavior as-is — no new confirmation wiring needed.
```

No Phase 0 action remains for this item.

### 4.8 Handler count: a caveat on this pass's own inventory — **CLOSED this revision**
**[FACT — this pass]** The table in §5 documents **67** operations, cross-referenced by name against `askOperationRegistry.ts`, `askDomainCommandRegistry.ts`, and the orchestrator's dispatch `switch`. Earlier drafts of this stage's documents referred to "68 operations" throughout (an estimate carried from the research task's framing, not a recount against the finished table) — the table itself, once built, contains 67 distinct `operationId` values.

**Action closed this revision:** ran the automated diff this subsection originally deferred to Phase 0 — the exact `AskOperationId` string-literal union in `askOperationRegistry.ts:19-99` (67 literals) against the 67 `operationId` values in §5's table. Result: **exact match, no missing operation, no extra row, no duplicate.** Every count derived from this table elsewhere in this document and the FRD (Simple/Medium/Trivial/Passthrough/High tallies, the "25 require confirmation" figure) is now confirmed complete against the registry's full literal union, not merely "relative to the rows documented." No Phase 0 action remains for this item.

### 4.9 Confirmed-write execution is a second, undocumented dispatch surface — new finding this revision
```
STAGE 2 ASSUMPTION: `capability.invoke()` (§2.4's `operationId → skill adapter → capability
  handler registry → input shim → existing domain service` model) is the one dispatch surface
  the orchestrator uses per operation, and migrating it plus the routing `switch`
  (askOrchestrator.service.ts:6137-6234) satisfies Test G ("a new capability's PR diff touches
  the registry, never askOrchestrator.service.ts's dispatch switch").
NEW CODE EVIDENCE: the 6137-6234 switch (and the handler call sites §5's table documents) only
  produce each operation's *result* — for the 25 confirmation-required rows, that result is a
  MUTATION_PREPARATION (the confirmation card), not the actual write. The actual write happens
  later, when the homeowner confirms, inside a SEPARATE if/else chain keyed on
  `execution.operationId` starting at askOrchestrator.service.ts:8285 (e.g. `CLAIM_FILE` at
  :8286 calling `ClaimsService.createClaim`, `INSPECTION_FINDING_UPDATE` at :8315 calling
  `acceptFindingAsWork`/`dismissFinding`/`resolveFinding`, `DOCUMENT_PROMOTION_CONFIRM` at :8327
  with its own three-way `kind` dispatch inside). This chain runs well past line 8360 and is not
  cross-referenced by, or included in, §5's inventory, Phase 1's "Work," or Test G's stated scope.
IMPACT: Phase 1 (capability invocation) and the current Handler Migration Inventory only replace
  the PREPARE-time dispatch. Test G would not actually hold after Phase 1: a new confirmed-write
  capability still requires a new branch in the 8285+ chain, exactly the outcome Test G exists to
  prevent. This is a second, equally real instance of the same problem §16/§17 already target —
  just not the one those sections' code reading found.
RECOMMENDED ADJUSTMENT: fold migrating the 8285+ confirmed-write chain into Phase 2 ("Confirmation
  Convergence & Write Safety" — the phase whose whole purpose is the write path, and which already
  touches every one of these operations' `AskConfirmationReceipt` completion step). Extend the
  capability-handler registry (or add a second, confirm-time registry keyed the same way) so each
  of the 25 confirmation-required operations in §5 registers its confirmed-write handler exactly
  once, and retire the 8285+ chain incrementally exactly as Phase 1 retires 6137-6234. Update Test
  G (FRD §17, this document §23) to state explicitly that it covers both the propose-time dispatch
  and the confirm-time execution dispatch — a capability is not fully migrated until neither
  remains.
```
Reflected in Phase 2's Work (§8) and Test G's restated scope (§23) below.

### 4.10 Renovation naming ambiguity (FRD §31) — **CLOSED this revision**
FRD §31 flagged that `RENOVATION_PERMIT_READINESS` calls a thinner `permitTracker`/`renovationCase` pair while a separate, richer `homeRenovationAdvisor/` module exists with zero references from `services/ask/` — Phase 0 was asked to decide which implementation Ask should invoke before any renovation-related capability work proceeds.

```
NEW CODE EVIDENCE: `renovationPermitReadinessResult` (`askOrchestrator.service.ts:3299-3318`)
  confirmed to call `listRenovationCases` (`renovationCase.service.ts`), `permitTrackerService
  .getPermitSummary` (`permitTracker.service.ts`), and `getRenovationReadiness`
  (`renovationReadiness.service.ts`) — exactly as the plan's original inventory claimed, no
  drift. These operate on an already-started, governed `RenovationCase` (scope versions,
  participants, links) and its readiness checklist against canonical project/permit/compliance/
  quote/schedule/evidence records.
  `homeRenovationAdvisor/` (`homeRenovationAdvisor.service.ts:1-53`,
  `evaluationEngine.service.ts:1-40`) is a self-contained prospective jurisdiction/risk evaluator —
  its own Prisma models (`RenovationAdvisorSession` etc.), running `evaluatePermit`/
  `evaluateTaxImpact`/`evaluateLicensing` against a resolved jurisdiction to produce a risk level,
  confidence score, warnings, and next actions as a versioned "session" — answering "what
  jurisdictional risk would a prospective project of type X carry?", not tied to any
  `RenovationCase`.
VERDICT: two legitimately different features that happen to share the word "renovation," not one
  feature wired to the wrong implementation. `RENOVATION_PERMIT_READINESS` already invokes the
  correct target for what it answers (an in-progress case's permit/readiness status).
DECISION: no rewiring. Drop the "confirm target implementation before migrating" caveat on this
  operation's §5 row — it migrates in Phase 1 like any other Simple row. `homeRenovationAdvisor/`
  remains unexposed via Ask; if it is exposed in a future phase, it needs its own new
  `operationId` (e.g. a distinct `RENOVATION_RISK_ASSESSMENT`-shaped operation), never folded into
  or confused with `RENOVATION_PERMIT_READINESS`.
```

---

## 5. Handler Migration Inventory

**[FACT — this pass]** 67 `AskOperationId` values documented, confirmed complete against the registry's full literal union (§4.8), cross-referenced against `askOperationRegistry.ts` (adapter keys), `askDomainCommandRegistry.ts` (confirmation requirements), and the single dispatch `switch` in `askOrchestrator.service.ts:6137-6234`. Every row below is directly observed from a handler call site and its definition — none inferred.

| operationId | adapterId | handler (file:line) | current args | effect | confirmation (Y/N, via) | shim complexity |
|---|---|---|---|---|---|---|
| MAINTENANCE_STATUS | maintenance.status | maintenanceResult (:1432) | userId, propertyId, message, two composedContext values, a derived boolean | READ | N | High — needs context-provider values, not envelope fields |
| MAINTENANCE_TASK_CREATE | maintenance.create | maintenanceTaskCreateResult (:875) | userId, propertyId, message | MUTATION_PREPARATION | Y — MAINTENANCE_CREATE | Simple |
| MAINTENANCE_TASK_COMPLETE | maintenance.complete | maintenanceTaskCompleteResult (:1033) | userId, propertyId, message | MUTATION_PREPARATION | Y — MAINTENANCE_COMPLETE | Simple |
| MAINTENANCE_TASK_UPDATE | maintenance.update | maintenanceTaskUpdateResult (:1169) | userId, propertyId, message | MUTATION_PREPARATION | Y — MAINTENANCE_UPDATE | Simple |
| COVERAGE_GAPS | coverage.review | coverageResult (:1595) | userId, propertyId, message | READ | N | Simple |
| INCIDENT_CLAIM_STATUS | incident-claim.status | incidentClaimStatusResult (:2687) | userId, propertyId, message | READ | N | Simple |
| CLAIM_FILE | incident-claim.file | claimFileResult (:2483) | propertyId, message (no userId) | MUTATION_PREPARATION | Y — CLAIM_FILE | Simple |
| CLAIM_TRANSITION | incident-claim.transition | claimTransitionResult (:2502) | propertyId, message, launchContext | MUTATION_PREPARATION | Y — CLAIM_TRANSITION | Simple |
| INCIDENT_CONTINUATION | incident-claim.continuation | incidentContinuationResult (:2526) | propertyId only | READ | N | Simple |
| SAVINGS_OPPORTUNITIES | savings.opportunities | savingsOpportunitiesResult (:2880) | userId, propertyId, message | READ | N | Simple |
| OWNERSHIP_COSTS | ownership.costs | ownershipCostsResult (:3086) | userId, propertyId, message | READ | N | Simple |
| INVENTORY_LOOKUP | inventory.lookup | inventoryLookupResult (:3372) | userId, propertyId, message | READ | N | Simple |
| PROPERTY_SUMMARY | property.summary | propertySummaryResult (:3595) | userId, propertyId, message | READ | N | Simple |
| INTELLIGENCE_ENVELOPE_QUERY | intelligence-envelope.query | intelligenceEnvelopeQueryResult (:5659) | userId, propertyId, message, continuationCursor | READ | N | Needs `continuationCursor` — added to the envelope (FRD §16) |
| HOME_ACTIONS | home-actions.feed | homeActionsResult (:3787) | userId, propertyId, message, launchContext-derived actionId | READ | N | Medium |
| OPERATIONAL_WORK_UPDATE | home-operations.update | operationalWorkUpdateResult (:2636) | propertyId, message, launchContext | MUTATION_PREPARATION | Y — OPERATIONAL_WORK_UPDATE | Simple |
| INSPECTION_FINDINGS | inspection-findings.review | inspectionFindingsResult (:2541) | propertyId only | READ | N | Simple |
| INSPECTION_FINDING_UPDATE | inspection-findings.update | inspectionFindingUpdateResult (:2566) | propertyId, message, launchContext | MUTATION_PREPARATION | Y — INSPECTION_FINDING_UPDATE | Simple |
| DOCUMENT_PROMOTION_REVIEW | document-promotion.review | documentPromotionReviewResult (:2603) | propertyId only | READ | N | Simple |
| DOCUMENT_PROMOTION_CONFIRM | document-promotion.confirm | documentPromotionConfirmResult (:2610) | propertyId, message, launchContext | MUTATION_PREPARATION | Y — DOCUMENT_PROMOTION_CONFIRM | Simple |
| CAPABILITY_DISCOVERY | capability.discovery | capabilityResult (:5268) | userId, propertyId (optional), message | READ | N | Simple |
| REPLACEMENT_GUIDANCE | inventory.replacement | replacementGuidanceResult (:1722) | userId, propertyId, message, launchContext-derived entityId, executionId | READ | N | Medium |
| REFINANCE_ANALYSIS | refinance.analysis | refinanceAnalysisResult (:5110) | userId, propertyId only | READ | N | Simple — reference implementation |
| REFINANCE_RATE_MONITOR | refinance.monitor | refinanceRateMonitorResult (:5216) | userId, propertyId, message | MUTATION_PREPARATION | Y — REFINANCE_MONITOR_CREATE | Simple |
| SELL_HOLD_RENT_ANALYSIS | sale-case.analysis | sellHoldRentAnalysisResult (:4975) | userId, propertyId only | READ | N | Simple |
| HOUSEHOLD_INVITATION | household.invitation | householdInvitationResult (:596) | userId, propertyId, message | MUTATION_PREPARATION | Y — HOUSEHOLD_INVITE | Simple |
| GUIDANCE_JOURNEY_CREATE | guidance.journey.create | guidanceJourneyCreateResult (:1308) | userId, propertyId, message | MUTATION_PREPARATION | Y — GUIDANCE_JOURNEY_CREATE | Simple |
| QUOTE_COMPARISON_CREATE | quote-comparison.create | quoteComparisonCreateResult (:1256) | propertyId, message (no userId) | MUTATION_PREPARATION | Y — QUOTE_COMPARISON_CREATE | Simple |
| QUOTE_COMPARISON_REVIEW | quote-comparison.review | quoteComparisonReviewResult (:1274) | propertyId only | READ | N | Simple |
| HOME_DEADLINE_MONITOR | home-deadline.monitor | homeDeadlineMonitorResult (:1333) | userId, propertyId, message | MUTATION_PREPARATION | Y — HOME_DEADLINE_MONITOR_CREATE | Simple |
| CAPITAL_RESERVE_PLAN | capital-reserve.plan | capitalReservePlanResult (:3230) | userId, propertyId only | READ | N | Simple |
| PROPERTY_TAX_APPEAL_READINESS | property-tax.appeal-readiness | propertyTaxAppealReadinessResult (:3271) | userId, propertyId, message | READ | N | Simple |
| RENOVATION_PERMIT_READINESS | renovation-permit.readiness | renovationPermitReadinessResult (:3299) | propertyId, message (no userId) | READ | N | Simple — target implementation confirmed correct, resolved §4.10 |
| MAJOR_EVENT_ENTRY | major-event.entry | majorEventEntryResult (:3323) | userId, propertyId, message | READ | N | Simple |
| EMERGENCY_BOUNDARY | boundary.emergency | emergencyResult (:5416) | none | READ | N | Trivial |
| UNSAFE_RESTRICTED_BOUNDARY | boundary.unsafe-restricted | unsafeRestrictedResult (:5442) | none | READ | N | Trivial |
| OUT_OF_SCOPE_BOUNDARY | boundary.out-of-scope | outOfScopeResult (:5429) | none | READ | N | Trivial |
| GROUNDED_GUIDANCE | grounded.guidance | groundedGuidanceResult (:5607) | entire input object + separate trace object | READ | N | **Passthrough category** (FRD §16) — highest complexity |
| HVAC_DECISION_START | decision-platform.hvac.start | hvacDecisionStartResult (:1970) | userId, propertyId, message, executionId | MUTATION_PREPARATION | Y — HVAC_DECISION_START | Simple |
| HVAC_DECISION_CONTINUE | decision-platform.hvac.continue | hvacDecisionContinueResult (:2024) | userId, propertyId, message, executionId, launchContext-derived entityId | READ | N | Medium |
| HVAC_SPECIALIST_ENGAGE | decision-platform.hvac.specialist-engage | hvacSpecialistEngageResult (:5897) | userId, propertyId, message, executionId, whole launchContext | MUTATION_PREPARATION (advisory only — never returns NEEDS_CONFIRMATION) | N — by design, resolved §4.7: writes only advisory DecisionThread/RecommendationSnapshot records, gated by its own AgentRun/AgentState/ToolInvocation audit trail instead of AskConfirmationReceipt | **Passthrough category** (FRD §16) — confirmation question closed, no registry entry needed |
| HVAC_DECISION_SCENARIO | decision-platform.hvac.scenario | hvacDecisionScenarioResult (:2117) | userId, propertyId, message | MUTATION_PREPARATION | Y — HVAC_DECISION_SCENARIO | Simple |
| HVAC_DECISION_ABANDON | decision-platform.hvac.abandon | hvacDecisionAbandonResult (:2173) | userId, propertyId, message | MUTATION_PREPARATION | Y — HVAC_DECISION_ABANDON | Simple |
| HVAC_PREFERENCE_SAVE | decision-platform.hvac.preference.save | hvacPreferenceSaveResult (:2354) | userId, propertyId, message | MUTATION_PREPARATION | Y — HVAC_PREFERENCE_SAVE | Simple |
| HVAC_PREFERENCE_FORGET | decision-platform.hvac.preference.forget | hvacPreferenceForgetResult (:2390) | userId, propertyId, message | MUTATION_PREPARATION | Y — HVAC_PREFERENCE_FORGET | Simple |
| HOME_CHANGE_SUMMARY | home-change.summary | homeChangeSummaryResult (:2820) | userId, propertyId only | READ | N | Simple |
| HVAC_DECISION_OUTCOME_REPORT | decision-platform.hvac.outcome.report | hvacDecisionOutcomeReportResult (:2214) | userId, propertyId, message | MUTATION_PREPARATION | Y — HVAC_DECISION_OUTCOME_REPORT | Simple |
| HVAC_DECISION_OUTCOME_VIEW | decision-platform.hvac.outcome.view | hvacDecisionOutcomeViewResult (:2266) | userId, propertyId, message | READ | N | Simple |
| HVAC_DECISION_OUTCOME_UNLINK | decision-platform.hvac.outcome.unlink | hvacDecisionOutcomeUnlinkResult (:2301) | userId, propertyId, message | MUTATION_PREPARATION | Y — HVAC_DECISION_OUTCOME_UNLINK | Simple |
| BUYER_PLAN_STATUS | buyer.plan.status | buyerPlanStatusResult (:4019) | userId, propertyId only | READ | N | Simple |
| BUYER_DEADLINES | buyer.deadlines | buyerDeadlinesResult (:4053) | userId, propertyId only | READ | N | Simple |
| BUYER_DOCUMENT_READINESS | buyer.document-readiness | buyerDocumentReadinessResult (:4107) | userId, propertyId only | READ | N | Simple |
| BUYER_INSPECTION_REVIEW | buyer.inspection-review | buyerInspectionReviewResult (:4145) | userId, propertyId only | READ | N | Simple |
| BUYER_TASK_COMPLETE | buyer.task.complete | buyerTaskCompleteResult (:4187) | userId, propertyId, message | MUTATION_PREPARATION | Y — BUYER_TASK_COMPLETE | Simple |
| BUYER_TASK_CREATE | buyer.task.create | buyerTaskCreateResult (:4272) | userId, propertyId, message | MUTATION_PREPARATION | Y — BUYER_TASK_CREATE | Simple |
| BUYER_TASK_UPDATE | buyer.task.update | buyerTaskUpdateResult (:4332) | userId, propertyId, message | MUTATION_PREPARATION | Y — BUYER_TASK_UPDATE | Simple |
| BUYER_MOVE_STATUS | buyer.move-status | buyerMoveStatusResult (:4408) | userId, propertyId only | READ | N | Simple |
| BUYER_FINANCING_READINESS | buyer.financing-readiness | buyerFinancingReadinessResult (:4450) | userId, propertyId only | READ | N | Simple |
| BUYER_TITLE_ESCROW_READINESS | buyer.title-escrow-readiness | buyerTitleEscrowReadinessResult (:4510) | userId, propertyId only | READ | N | Simple |
| BUYER_WALKTHROUGH_READINESS | buyer.walkthrough-readiness | buyerWalkthroughReadinessResult (:4555) | userId, propertyId only | READ | N | Simple |
| BUYER_DISCLOSURE_FUNDS_READINESS | buyer.disclosure-funds-readiness | buyerDisclosureFundsReadinessResult (:4598) | userId, propertyId only | READ | N | Simple |
| BUYER_CLOSING_DAY_READINESS | buyer.closing-day-readiness | buyerClosingDayReadinessResult (:4637) | userId, propertyId only | READ | N | Simple |
| BUYER_CONTRACT_TIMELINE | buyer.contract-timeline | buyerContractTimelineResult (:4676) | userId, propertyId only | READ | N | Simple |
| BUYER_NEGOTIATION_READINESS | buyer.negotiation-readiness | buyerNegotiationReadinessResult (:4723) | userId, propertyId only | READ | N | Simple |
| BUYER_COST_READINESS | buyer.cost-readiness | buyerCostReadinessResult (:4768) | userId, propertyId only | READ | N | Simple |
| BUYER_FINDING_DISPOSITION | buyer.finding.disposition | buyerFindingDispositionResult (:4812) | userId, propertyId, message | MUTATION_PREPARATION | Y — BUYER_FINDING_DISPOSITION | Simple |
| BUYER_LIFECYCLE_UPDATE | buyer.lifecycle.update | buyerLifecycleUpdateResult (:4875) | userId, propertyId, message | MUTATION_PREPARATION | Y — BUYER_LIFECYCLE_UPDATE | Simple |

**Coverage: 67 operations documented above, none guessed, confirmed complete** — §4.8 records the automated diff against `askOperationRegistry.ts`'s full literal union: exact match, nothing missing. Cross-cutting internal helper functions (`audienceApplicabilityResult`, `needsPropertyResult`, `hvacDecisionThreadAmbiguousResult`, `buyerNotActiveResult`, `routingClarificationResult`, `maybeSynthesizeDeterministicResult`, `operationalUnavailableResult`, `dispatchOperationAdapterResult`) are invoked within several handlers above and are correctly excluded — they are not per-operation handlers themselves.

**Summary (recounted directly from the table above, correcting an earlier draft's arithmetic error):** 58 "Simple" (pure scalar destructure, including `INTELLIGENCE_ENVELOPE_QUERY` once `continuationCursor` is added to the envelope), 3 "Medium" (need one `launchContext`-derived field), 3 "Trivial" (no envelope fields at all), 2 "Passthrough" (`GROUNDED_GUIDANCE`, `HVAC_SPECIALIST_ENGAGE` — receive the whole envelope/launchContext, per FRD §16's new adapter category), 1 "High" (`MAINTENANCE_STATUS` — needs context-provider values the envelope doesn't carry). 58+3+3+2+1 = 67, matching the table's row count. 25 require confirmation via `AskDomainCommandRegistry`; `HVAC_SPECIALIST_ENGAGE`'s confirmation status is resolved as intentionally self-managed, not a gap (§4.7 above / FRD §16).

---

## 6. Phase 0 — Pre-implementation Verification

Output: this document's §4, now fully closed as of this revision — `UPLOAD_EVIDENCE`/`ADD_NOTE` target representations (§4.2), the envelope-scope fix choice for `askEnvelopeQueryScope.ts` (§4.6), `HVAC_SPECIALIST_ENGAGE`'s confirmation-registry question (§4.7), and the renovation naming ambiguity (§4.10). §4.8's handler-count diff was closed the prior revision (exact match, no open action). §4.9 (the confirmed-write dispatch surface) is a scoping decision for Phase 2, not Phase 0 — no code changes start there before Phase 1 either way.

**Acceptance criterion — met as of this revision:** every item in §4 now has either a resolved answer (4.1, 4.3, 4.4, 4.8) or an explicit, documented decision (4.2's two gaps, 4.6's fix choice, 4.7's confirmation question, 4.10's renovation-naming question). §4.5 (Home Event Radar runtime population) remains genuinely open pending a reachable database — by design not a Phase 0 blocker, since it only gates Phase 7's live demonstration, not any Phase 0–6 code path.

**New scope this pass generated for later phases** (neither invented nor silently dropped — tracked here so Phase 1 doesn't have to rediscover them):
1. **Phase 3** must decide whether to add a `documentId`/evidence-array capability to `PropertyFactEvidence` (or continue deferring it) — `UPLOAD_EVIDENCE` evidence on anything other than a sibling `HomeEvent` candidate has no existing schema target (§4.2).
2. **Phase 3** must state explicitly, in its own acceptance criteria, that capturing an `ADD_NOTE` now requires a `propertyId` where it previously didn't (§4.2) — a deliberate narrowing under Implementation Principle #6, not an unreviewed regression.
3. **Phase 7** must give `PropertyRadarMatch`/`PropertyRadarCompoundInsight`'s envelope adapters an `entityRef` before Scenario 8.4 is demonstrable — the domain-list fix alone (§4.6) does not surface Radar-sourced WEATHER items to a component-scoped query, since those two adapters never populate `entityRef` today. Add this as a third precondition alongside §4.5's existing seed-data gap.

---

## 7. Phase 1 — Capability Invocation Foundation

**Goal:** remove domain dispatch from the orchestrator without changing product behavior.

**Work:** `CapabilityInvocationEnvelope` (FRD §16, including the `continuationCursor` field and the passthrough category for `GROUNDED_GUIDANCE`/`HVAC_SPECIALIST_ENGAGE`), `CapabilityHandlerRegistry` keyed by adapter id, `capability.invoke()`, incremental migration of the handlers per §5's inventory (67 operations documented and confirmed complete per §4.8; Simple/Trivial rows first — lowest risk, highest count; Medium rows next; Passthrough rows last, since they need the adapter-category decision from Phase 0 settled first). Widen `EmitDomainEventInput.type` to the full 14-member `DomainEventType` enum as part of this phase's own `DomainEvent` touch-points (§4.4).

**Acceptance criterion:** existing Ask behavior is functionally equivalent for all 67 documented operations (§4.8's diff confirmed this is the complete set) (verified against the existing 48-file `apps/backend/tests/ask/` suite, unchanged pass rate), and the propose-time dispatch (the 6137-6234 switch) no longer requires domain-specific switch logic inside the orchestrator for any migrated operation. This phase migrates propose-time dispatch only — the confirm-time execution dispatch (§4.9) is Phase 2's, not this phase's, so Test G is not fully satisfied until Phase 2 also lands.

**Status: shipped this revision.** `capabilityInvocation.contract.ts` (the envelope + `AskCapabilityHandlerMissingError`, the existing `errorContract: 'ASK_TYPED_RESULT'` convention) and `capabilityHandlerRegistry.ts` (registry keyed by adapter id, `capabilityInvoke()`, `validateCapabilityHandlerRegistry()` wired into `index.ts`'s existing fail-fast `askRegistryIssues` startup check) are new files under `apps/backend/src/services/ask/`. All 67 operations register a thin shim there against their own `ASK_OPERATION_DEFINITIONS`-declared `adapterKey` — handler bodies untouched, still in `askOrchestrator.service.ts`. `dispatchOperationAdapterResult`'s former 97-line switch (`askOrchestrator.service.ts:6137-6234` as of Phase 0's inventory) is now a single `capabilityInvoke(...)` call; the function no longer branches on `operationId` at all. Deliberately does **not** import handler functions across the registry/orchestrator boundary in either direction to avoid a real circular-`require` hazard under this codebase's CommonJS build (TS emits `exports.foo = foo` at each function's source position, not hoisted, so a cycle can observe a not-yet-assigned export) — `askOrchestrator.service.ts` instead calls `registerCapabilityHandler` on its own, already in-scope handlers.

`EmitDomainEventInput.type` (§4.4) now imports the real 14-member Prisma `DomainEventType` enum directly instead of a hand-copied 9-member union (`domainEvents.service.ts`); `refinanceDecision.service.ts:470`'s raw `tx.domainEvent.create` bypass is migrated onto `DomainEventsService.emit(..., tx)`, now that the typed path supports all 5 refinance event types it previously couldn't.

**Verification:** `tsc --noEmit` clean. Full 48-file `apps/backend/tests/ask/` suite: 294/300 pass; the 6 failures (3× `askLaunchContextCapability.test.js`, 1× `skillDecisionFinancialRegistration.test.js`, 2× `askTrustArchitecture.test.js`) are confirmed **pre-existing on unmodified `HEAD`** — re-run against clean `HEAD` reproduces the identical failure counts (including the two slowest, `1 !== 0` and `56 !== 0`), none touch anything this phase changed. New `capabilityHandlerRegistry.test.js` covers registry completeness (all 67 resolve), end-to-end dispatch through the registry for the three no-DB boundary operations, the typed missing-handler error, and that the dispatch switch is actually gone from source. Not yet live/browser-verified — no homeowner-observable change per this phase's own charter, so none expected.

**Post-sign-off fix (this revision):** an external review, reproduced with a mocked database read, found `capabilityInvoke()` as originally shipped only resolved a handler and called it — operational controls and property-access authorization lived solely in `askOrchestrator.service.ts`'s `executeOperationCore`, never inside the reusable invocation layer FRD §16 specifies (`resolve adapter → validate policy → resolve registered handler → build envelope → execute`). Calling `INSPECTION_FINDINGS` directly through `capabilityInvoke()` with its operation disabled, or with an unverified user/property, still queried the property and returned `ANSWERED` — the existing Ask route stayed guarded (`executeOperationCore` ran its own copy of these checks first), but any future direct consumer of the new entry point (a specialist agent, a background job, Phase 2's confirm-time dispatch migration) would not have been.

Fixed: `operationalUnavailableResult`, `needsPropertyResult`, and `skillRuntimeUnavailableReason` moved from `askOrchestrator.service.ts` into `capabilityHandlerRegistry.ts` (exported, single source of truth — `askOrchestrator.service.ts` now imports them rather than maintaining a second, driftable copy); a new `permissionRequiredResult` factors out the authorization-floor `BLOCKED` response the same way. `capabilityInvoke()` now runs the full guard chain itself — ask-enabled/operation-enabled/skill-runtime-availability/remote-generation kill switches (cheap, in-memory, always re-checked), then `requiresProperty` and authorization-floor checks against a real property-access lookup — before ever resolving or calling a handler. `executeOperationCore` still performs its own property-access check first (needed for `composedContext`/audience-decision composition, which FRD §17 keeps as an orchestrator "context coordination" responsibility, deliberately separate from capability invocation) and now passes the already-resolved result through `CapabilityInvocationDependencies.propertyAccess` so the guarded path isn't charged a second DB round trip; `capabilityInvoke()` still performs its own full check whenever that isn't supplied, so a caller cannot bypass authorization by omission — only by fabricating an already-verified `PropertyAccess` for the exact userId/propertyId being invoked, which is not user input, just an internal optimization parameter.

Verified two ways: (1) a new, source-isolated `capabilityInvokePolicyEnforcement.test.js` mocks the database (household membership and legacy ownership both `null`, i.e. a genuinely unverified user/property) before first requiring anything under test, then calls `capabilityInvoke('INSPECTION_FINDINGS', ...)` directly — with the operation disabled via env var, and separately with the unverified property — asserting in both cases that `inspectionFinding.findMany` (the handler's own, access-check-free query) is never reached; both pass. (2) `tsc --noEmit` clean; `capabilityHandlerRegistry.test.js` and `skillAdapterRegistry.test.js` (updated for the guard functions' new home and the dispatch call site's added `propertyAccess` argument) pass, 15/15 across the three targeted files.

**Independently releasable:** yes — this phase changes nothing a homeowner can observe.

---

## 8. Phase 2 — Confirmation Convergence & Write Safety

**Goal:** prove the write path safe with a synthetic candidate before extraction ever produces a real one.

**Work:**
- Extend `AskConfirmationReceipt`'s pattern to the new `CAPTURE_FACT_CONFIRM`/`CAPTURE_EVENT_CONFIRM` operation family (FRD §22) — no schema change to the receipt itself (Stage 2's decision), but new schema fields on the target models: `PropertyFactEvidence.captureExecutionId` + its unique constraint, `Warranty.sourceExecutionId` + its unique constraint, `HomeEvent.providerName`/`warrantyId`, `captureChannel`/`attribution`/`extractionConfidence` on both `PropertyFactEvidence` and `HomeEvent`, `AskExecution.parentExecutionId`/`linkedExecutionId` (full inventory in §17). These columns land now — before extraction exists — because the new confirm operation family writes them for every capture regardless of source (a routed, deterministic capture is `attribution: FIRSTHAND` with high confidence too); Phase 3 is what first makes an LLM the thing setting non-trivial values into columns Phase 2 already created (see §20's corrected phase assignment).
- **New this revision (§4.9):** migrate the 25 confirmation-required operations' confirm-time write dispatch off the `askOrchestrator.service.ts:8285+` if/else chain and onto a confirm-time capability handler, one registry entry per operation, exactly as Phase 1 migrates the propose-time switch. This is Phase 2's work, not Phase 1's, because it's fundamentally a write-safety concern (the same handlers this phase is already touching for `AskConfirmationReceipt` convergence) — see §4.9 for why Phase 1 alone does not satisfy Test G.
- Implement the commit-time claim-token re-verification for the `DomainEvent`-backed extraction job (FRD §22, Stage 2's fourth-round correction) — this is infrastructure Phase 2 builds even though Phase 3 is what first uses it, since Phase 2's acceptance criterion explicitly requires proving retry/reclaim safety before extraction exists.
- Implement bidirectional `linkedExecutionId` + `ASK_CAPTURE_LINK_RECONCILE` async reconciliation (FRD §22) for the event/warranty pairing case — buildable and testable synthetically before extraction can produce such a pair.
- Resolve §4.1's correction finding: build `HomeEvent`/`PropertyFactEvidence` correction on their existing supersession chains, not on `correctionModes`.
- Map `GroundedAskProposal`'s 5 clean kinds onto their target operations; resolve `UPLOAD_EVIDENCE`/`ADD_NOTE` per Phase 0's decision; do not retire `GroundedAskProposal`/`GroundedAskArtifact` until all 7 have passing parity tests (FRD §23, explicit).

**Acceptance criterion:** a synthetically-created candidate fact/event (created directly via a test harness, no LLM involved) can be confirmed, retried under a simulated lease-reclaim race, rejected, and persisted exactly once — including the event+warranty pairing case under simulated concurrent confirmation — with zero LLM extraction involved anywhere in this phase's tests. Additionally (§4.9): all 25 confirmation-required operations from §5 execute their confirmed write through the new confirm-time registry, with the `askOrchestrator.service.ts:8285+` chain deleted, not just shrunk — this is what makes Test G actually true.

**Status: Phase 2 is now fully shipped.** §4.9's confirm-time dispatch migration, the schema fields, the `CAPTURE_FACT_CONFIRM`/`CAPTURE_EVENT_CONFIRM` operation family, the supersession-based correction path, `GroundedAskProposal` kind mapping, claim-token re-verification, and the bidirectional `linkedExecutionId` pairing + `ASK_CAPTURE_LINK_RECONCILE` consumer have all landed across this revision's commits (see each below). New `confirmCapabilityHandlerRegistry.ts` mirrors `capabilityHandlerRegistry.ts` exactly (registry keyed by adapter id, `confirmCapabilityInvoke()`, `validateConfirmCapabilityHandlerRegistry()` wired into `index.ts`'s fail-fast startup check) but scoped to the 25 `ASK_DOMAIN_COMMAND_REGISTRY` entries, not all 67 operations — only confirmation-required operations have a confirm-time write. `confirmAskExecution`'s former ~960-line if/else write-dispatch chain (`askOrchestrator.service.ts`, previously `:8268-9228`) is now a single `confirmCapabilityInvoke(...)` call inside the same `try` block; the 25 handler bodies moved verbatim (mechanically extracted with a script, not hand-retyped, specifically to rule out transcription drift in write-critical code) into standalone functions immediately before `confirmAskExecution`, each registered by its command's own declared `adapterKey`. `confirmAskExecution`'s own claim/lease/authorization/completion lifecycle (FRD §22) — the code before and after the dispatch point — is untouched. One real type gap found and fixed during extraction: `execution.propertyId`'s `!execution.propertyId` early-guard narrowing (`string | null` → `string`) doesn't cross a function boundary, so `ConfirmCapabilityContext.execution` is typed `AskExecution & { propertyId: string }`, asserted once at the single call site where the narrowing already holds.

**Verification:** `tsc --noEmit` clean. New `confirmCapabilityHandlerRegistry.test.js` (registry completeness for all 25, one registration each, chain confirmed gone from source) passes, plus every test across `apps/backend/tests/{ask,decisionPlatform,integration,unit}/` that reads `askOrchestrator.service.ts` as source text for governance assertions (~20 files) was swept for the old switch/chain text patterns this migration and Phase 1's own migration made stale — 5 further pre-existing assertions across 4 files (`decisionPreferenceServiceGovernance.test.js` ×2, `askGovernance.test.js`, `decisionThreadServiceGovernance.test.js`, `decisionPlatformChangeEmitterGovernance.test.js`) updated to check the same underlying invariant (claim-before-mutation, executionId threading, handler wiring) against the new registry-based structure instead of the removed literal `if`/`case` text; all now pass. Sweep also surfaced 2 further pre-existing failures unrelated to any Ask Cozy Phase 1/2 work (`decisionThreadService.ts`'s `emitDecisionRecommendationChange` transaction-boundary/try-catch tests) — confirmed untouched by this or Phase 1's changes, left as-is per the same pre-existing-failure discipline as the original 6.

**Schema + `CAPTURE_FACT_CONFIRM`/`CAPTURE_EVENT_CONFIRM` (this revision):** `schema.prisma` gains `PropertyFactEvidence.captureExecutionId` (+ `@@unique([propertyId, factKey, captureExecutionId])`), `Warranty.sourceExecutionId` (+ `@@unique([propertyId, sourceExecutionId])`), `HomeEvent.providerName`/`warrantyId`, `captureChannel`/`attribution`/`extractionConfidence` on both `PropertyFactEvidence` and `HomeEvent` (new shared `AskCaptureAttribution` enum), `AskExecution.parentExecutionId`/`linkedExecutionId` self-relations, and `DomainEventType.ASK_EXTRACTION_REQUESTED`/`ASK_CAPTURE_LINK_RECONCILE` — all additive/nullable, no existing column touched. `npx prisma generate` run for both `apps/backend` and `apps/workers`; **applying this to any database (`npx prisma db push`) is still the user's own manual step**, per CLAUDE.md.

Two new `AskOperationId`s (§4.3 reconfirmed: zero further schema change needed for the literals themselves), registered in both capability registries and `ASK_DOMAIN_COMMAND_REGISTRY`. Deliberately **not reachable via ordinary message routing** in this slice — a capture candidate is created directly in `NEEDS_CONFIRMATION` status by whatever produces it (Phase 3's not-yet-built extraction, or a test harness), never proposed from a raw homeowner message; the propose-time capability handler exists only so Phase 1's registry has no coverage gap, and returns a defensive `OUT_OF_SCOPE` boundary rather than a real analysis. The calibration corpus (`askOperationSemanticPackages.ts`, `askTrustCertificationCorpus.ts`) still required real positive/negative/answer examples for both operations regardless (`Record<AskOperationId, ...>` types have no "non-routable" exemption) — written as explicit "record that..." phrasings anticipating Phase 3's routing, documented inline as aspirational rather than current behavior.

The confirm-time write handlers (`confirmCaptureFact`/`confirmCaptureEvent`, registered alongside the 25 migrated ones) are the actual functional core: both delegate to an **existing, already-idempotent writer** rather than reimplementing idempotency — `capturePropertyFact` (extended, not replaced: four new optional fields, `captureExecutionId` short-circuit checked before any write with no `supersededAt` filter so a stale replay resolves to the original row regardless of current supersession state, plus a P2002 defense-in-depth catch for the concurrent-claim race; `verifiedAt`/`confidence` no longer get the unconditional firsthand treatment when `attribution` is `THIRD_PARTY_RELAYED`/`INFERRED`, per FRD §19) and `HomeEventsService.createHomeEvent` (extended the same way: five new optional fields threaded through, including a new `assertWarrantyBelongs` property-scope check mirroring the existing claim/expense/room checks; idempotency was already correct for this requirement — its existing `idempotencyKey` lookup carries no `isCurrent`/`deletedAt` filter either). Both new operations dispatch through `confirmAskExecution`'s one existing `confirmCapabilityInvoke(...)` call site — the same claim/lease/retry/reject lifecycle already proven for the other 25 operations, not a parallel path.

**Verification (capture path):** `tsc --noEmit` clean across `apps/backend` and `apps/workers`. New `captureConfirmWriteSafety.test.js` — source-governance style, matching this exact codebase's own established convention for `capturePropertyFact.ts`/`getPropertyContext.ts` (no runtime DB-mocked test exists anywhere in this codebase for either function, for any caller, including all 25 pre-existing confirmation-required operations — `getPropertyContext`'s own multi-service dependency chain has no DB-mock harness to build on) — proves the idempotency short-circuit, the P2002 race handling, the attribution-conditioned confidence/verifiedAt logic, the new field threading on both writers, and that both new operations dispatch through the one shared confirm lifecycle rather than a bypass. Four hardcoded operation-count assertions across three test files (`capabilityHandlerRegistry.test.js` 67→69, `confirmCapabilityHandlerRegistry.test.js` 25→27, `askGovernance.test.js` both counts) updated and re-verified; full targeted sweep (10 files, 83 tests) confirms 81 pass, 2 fail — the same 2 pre-existing `emitDecisionRecommendationChange` failures already confirmed unrelated, nothing new.

**Correction path (this revision):** built on the existing supersession chains per §4.1, not `correctionModes`. `PropertyFactEvidence` needed **no new code at all** — `capturePropertyFact`'s existing write path already supersedes the prior evidence row for any *new*, distinct `captureExecutionId` on the same `factKey` (the idempotency check only short-circuits a *replay* of the *same* execution); a second, genuinely different `CAPTURE_FACT_CONFIRM` is already a correction by construction. `HomeEvent` correction reuses `HomeEventsService.updateHomeEvent` — the same supersession-chain mechanism already proven by the homeowner-facing timeline correction UI — via a new `correctingEventId` branch in `confirmCaptureEvent`. Found and fixed a real bug while wiring this: `updateHomeEvent`'s replacement row carried forward `existing.idempotencyKey` verbatim, which collides with the original (now `isCurrent: false`) row's own `@@unique([propertyId, idempotencyKey])` entry — previously rare enough to go unhit, but every `CAPTURE_EVENT_CONFIRM`-created event now has a non-null `idempotencyKey`, making this a routine collision. Fixed to default `null` (a correction is a distinct write, not a replay), with an explicit-override parameter for a caller that needs its own marker on the replacement — used by `confirmCaptureEvent`'s own new pre-check (`updateHomeEvent` has no idempotency guard of its own, so a lease-reclaim retry would otherwise chain a second correction). Verification: `tsc --noEmit` clean; `captureConfirmWriteSafety.test.js` gained 3 tests for this; full targeted sweep (42 tests across 6 files) — 41 pass, 1 pre-existing unrelated failure (`homeTimelineTruthHardening.test.js`'s appliance-date test, confirmed via `git blame` to predate this session by weeks, in code this change never touched).

**`GroundedAskProposal` kind mapping (this revision):** FRD §23's table already had the full kind-by-kind resolution; this revision closes the two gaps that were code-actionable within `GroundedAskProposal`'s own architecture (not retiring it — the FRD's explicit "no delete first, discover semantic loss later" gate still stands).
- `ADD_FACT`/`CORRECT_FACT` now pass `captureExecutionId: proposal.id`, `attribution: 'FIRSTHAND'`, `captureChannel: 'ASK_LEGACY_GROUNDED_PROPOSAL'` into the same `capturePropertyFact` call — `proposal.id` is as stable/unique as a real `AskExecution.id`, so this legacy path gets the same replay-safe idempotency `CAPTURE_FACT_CONFIRM` has.
- `ADD_NOTE`, when the proposal has a `propertyId`, now creates a real `HomeEvent` (`type: NOTE`) via `HomeEventsService.createHomeEvent` instead of only stashing text in `artifactJson` — closing FRD §23's original finding that this "isn't even a real domain write." Split into its own claim-then-write-then-catch-revert block (the pattern `ADD_FACT`/`START_JOURNEY` already used) because `HomeEventsService` uses the global `prisma` client and can't join the catch-all block's transaction. The schema still allows a property-less `ADD_NOTE` proposal (Phase 0's documented narrowing applies going forward, not retroactively) — that case falls through to the original `artifactJson`-only path unchanged, not a hard failure.
- `CREATE_TASK`/`START_JOURNEY`/`COMPARE_OPTIONS` are left as-is: verified by inspection to already call the identical underlying write as their new confirm-registry counterparts (`confirmMaintenanceTaskCreate`/`confirmGuidanceJourneyCreate`/`confirmQuoteComparisonCreate`) — FRD §23's "exact match" claim confirmed true by inspection, not just assumed; rewriting already-correct code to route through the new registry would need a synthetic `AskExecution`/`ConfirmCapabilityContext` (GroundedAskProposal has no real execution row), adding risk for zero behavior change.
- `UPLOAD_EVIDENCE` remains a genuinely open gap, confirmed not forceable: Phase 0's resolution requires a sibling `HomeEvent` candidate in the *same extraction batch*, and `GroundedAskProposal` is architecturally a single, standalone proposal with no batch concept — this can only close once Phase 3's candidate-batch model exists.

Verification: `tsc --noEmit` clean. New `groundedAskProposalMapping.test.js` (5 tests). Also ran the two existing non-DB test files that reference `groundedAsk.service.ts` (`phase4RemainingCompletion.test.js`, `askRemoteFallbackTypedClaims.test.js`) — every assertion actually checking `groundedAsk.service.ts`'s content still passes (verified each regex against the file directly); the only 2 failures in that sweep check a *different* file (`apps/frontend/src/components/AIChat.tsx`, for UI text/button labels from a since-redesigned chat panel) and are confirmed pre-existing via `git blame` (last touched 2026-08-14, a month before this session).

**Claim-token re-verification (this revision):** new `apps/workers/src/lib/domainEventClaimToken.ts` — `verifyDomainEventClaimToken(tx, domainEventId, claimedAttempts)`, a small, isolated CAS-style utility mirroring `cronLease.ts`'s existing `updateMany`-guard idiom. Call once, early, inside the same `prisma.$transaction(...)` callback that will persist a claimed attempt's durable output (Phase 3's extraction candidates): re-verifies `attempts` still matches this attempt's own claim value (`processDomainEvents.job.ts`'s existing claim loop's post-claim value, `attempts: { increment: 1 }`) before any candidate write commits; throws `DomainEventClaimLostError` — left to propagate uncaught, rolling back the whole transaction including any candidate rows already written earlier in the same callback — if a later attempt has since reclaimed the lease (the slow-not-crashed worker case the existing lease-expiry mechanism alone doesn't cover). No real caller yet (Phase 3 doesn't exist); built now per this phase's own acceptance criterion. The two `DomainEventType` enum members this needs (`ASK_EXTRACTION_REQUESTED`, `ASK_CAPTURE_LINK_RECONCILE`, added in this phase's schema commit) are already usable via `DomainEventsService.emit()` with zero further emitter-side code — confirmed directly against the regenerated Prisma client, thanks to Phase 1's fix importing the real enum instead of a hand-copied union.

Verification: `apps/workers`' `tsc --noEmit` clean. New `domainEventClaimToken.test.js` — unlike this session's other Phase 2 tests, a genuine runtime-mocked test (not source-governance), following `cronLease.test.js`'s established `require.cache`-injection pattern, since this utility is small and isolated enough (one `updateMany` call, no deep dependency chain) to actually execute rather than only read as text. All 3 pass, covering: resolves when the claim still holds; throws `DomainEventClaimLostError` when reclaimed; the conditional update is genuinely keyed on both `id` and `attempts` together, not just `id`.

**Bidirectional `linkedExecutionId` pairing + `ASK_CAPTURE_LINK_RECONCILE` consumer (this revision):** new `apps/backend/src/services/ask/captureLinkReconciliation.ts` — `linkSiblingCaptureExecutions(executionAId, executionBId)` sets `linkedExecutionId` on both sibling `AskExecution` rows atomically in one `$transaction` (per Stage 2's fourth-round correction: bidirectional, not one-sided); `reconcileCaptureLink(executionId)` is the async reconciliation half, called against durably-committed state rather than an in-request check (per Stage 2's third-round correction, which found the synchronous version race-prone). It reads the execution's `linkedExecutionId`, looks up both sides' `AskConfirmationReceipt`, and is a no-op — not an error — unless both sides are `COMPLETED`; once they are, and the pair is a `HOME_EVENT`+`WARRANTY` combination (the only pairing FRD §22 documents so far — `Warranty`'s `homeEvents` back-relation reads through `HomeEvent.warrantyId`, so only the `HomeEvent` side ever needs a write), it sets `HomeEvent.warrantyId` guarded by `where: { warrantyId: null }` — making a duplicate or out-of-order re-trigger of the same pair a genuine no-op (`count: 0`), never a spurious overwrite. `processDomainEvents.job.ts` gained a new `ASK_CAPTURE_LINK_RECONCILE` case (`handleAskCaptureLinkReconcile`, following the existing `mustHave`-validated handler pattern) that dispatches `ev.payload.executionId` to `reconcileCaptureLink` via the same injectable-`deps` pattern as every other consumer in that file. While wiring this, also closed the debt Phase 0's §4.4 finding flagged: the file's hand-copied `DomainEventType` union is now `import type { DomainEventType } from '@prisma/client'`, the real enum. No real producer sets `linkedExecutionId` yet — nothing creates a linked capture pair before Phase 3's extraction exists — so both functions are, like the claim-token utility, built and tested synthetically ahead of any caller, per this phase's own acceptance criterion (proving the pairing mechanism under simulated concurrent confirmation before extraction exists).

Verification: `tsc --noEmit` clean across `apps/backend` and `apps/workers`. New `captureLinkReconciliation.test.js` (7 tests, genuine runtime-mocked via `require.cache` injection, same pattern as `domainEventClaimToken.test.js`) covers: the bidirectional pairing transaction; no-op with no linked sibling; no-op with only one side completed; no-op when neither completed side is a `HOME_EVENT`/`WARRANTY` pair; the real link write once both sides complete; order-independence (self vs. linked holding the `HOME_EVENT` side); the `warrantyId: null` guard making a duplicate re-trigger a genuine no-op. `processDomainEventsJob.test.js` gained 3 tests for the new switch case (dispatches `executionId` to the reconciler; a missing `executionId` fails without dispatching; reconciler failures use the shared retry/dead-letter path) — all 28 tests in that file pass, all 3 `domainEventClaimToken.test.js` tests still pass.

This closes Phase 2's last remaining Work-list item — every item in this phase's Work list (§8) has now shipped.

**Correction (2026-09-12, external review — the claim above was too broad):** an external review found Phase 2 not actually ready for sign-off, with four verified gaps, all now fixed:
1. **[P1, fixed]** `updateHomeEvent`'s supersede step nulled the OLD row's own `idempotencyKey` (not just `projectId`) when superseding it for a correction. `createHomeEvent`'s idempotency lookup has no `isCurrent` filter specifically so a replay of the ORIGINAL capture resolves to its original row regardless of later supersession (the same invariant `capturePropertyFact.ts` already enforces for `PropertyFactEvidence.captureExecutionId`) — nulling the key silently defeated that guarantee, letting a stale replay of the original confirmation create a second, duplicate event after a correction had already happened. Fixed: the superseded row's `idempotencyKey` is left untouched; only `projectId` needs clearing (it alone is `@@unique`, and the replacement carries it forward).
2. **[P1, fixed]** `confirmCaptureEvent`'s correction branch had a pre-check (`alreadyCorrected`) with no matching P2002 recovery on the write below it — two overlapping attempts for the same execution.id (a lease-reclaim retry racing the still-running original; `confirmAskExecution`'s own reclaim path does not verify the original actually crashed) could both pass the pre-check, and the loser's P2002 propagated to `confirmAskExecution`'s shared catch block, which **unconditionally** set the execution to EXPIRED — clobbering a concurrent winner's already-COMPLETED state. Fixed two ways: (a) `confirmCaptureEvent`'s correction branch now catches P2002 on its own write and re-reads/returns the winner, mirroring `capturePropertyFact`'s own outer-catch pattern exactly; (b) defense-in-depth, the shared catch block's EXPIRED write is now conditioned on the execution still being `RUNNING` (`updateMany` + count check, not a bare `update`), and always re-reads the execution's actual current row afterward instead of trusting its own local state — protects all 27 confirmation-required operations, not just captures.
3. **[P1, fixed]** `ASK_CAPTURE_LINK_RECONCILE` had a tested consumer and no production emitter anywhere in the codebase — `linkSiblingCaptureExecutions` was never called, and nothing ever created a `DomainEvent` of that type outside test fixtures, so "even synthetically linked executions cannot trigger it through confirmation" (the review's own words, confirmed true by a repo-wide grep before fixing). Fixed the connection generically: the confirmation-completion transaction now emits `ASK_CAPTURE_LINK_RECONCILE` (idempotency-keyed per execution, via `upsert`) whenever the completing execution has a `linkedExecutionId` set — for ANY confirmation-required operation, not just captures, so the mechanism is reachable the moment any future producer sets that field. **Not fixed, and explicitly out of scope for this pass:** no warranty-capture writer exists at all yet (no `CAPTURE_WARRANTY_CONFIRM`-equivalent operation, no extraction candidate type for it) — nothing currently sets `Warranty.sourceExecutionId` or creates a linked pair, so the "required paired-confirmation scenario" the original Phase 2 acceptance criterion names is connected end-to-end but has no real producer to exercise it yet. Building that writer is real, unspecified-until-now scope (Phase 3 itself defers warranty capture, per §9's "not warranty" scoping) and was not invented under this fix pass; the claim of Phase 2 completeness above should be read with this caveat.
4. **[P2, fixed]** `updateHomeEvent`'s replacement `create()` omitted `providerName`, `warrantyId`, `captureChannel`, `attribution`, and `extractionConfidence` entirely — any correction, even one only changing `amount`, silently reset all five to `null`/default. Fixed with the same `patch.X !== undefined ? patch.X : existing.X` fallback pattern already used for every other field; `warrantyId`, when explicitly changed, is now also validated via `assertWarrantyBelongs` (createHomeEvent already did this; the correction path hadn't).

Verification: `tsc --noEmit` clean across `apps/backend`. `captureConfirmWriteSafety.test.js` gained 6 new tests pinning each fix (one fix — the shared catch block hardening — covered by its own test in addition to the correction-branch-specific one); full targeted sweep across every file touching this code (`askGovernance`, `capabilityHandlerRegistry`, `confirmCapabilityHandlerRegistry`, `captureConfirmWriteSafety`, `captureLinkReconciliation`, `groundedAskProposalMapping`, `capturePropertyFinancingFact`): 59/59 pass, zero regressions.

**Second review round (2026-09-12), same session — a regression in fix #1 above, plus one more real race fix #2's P2002-only recovery didn't cover, both verified against source before fixing:**
5. **[P1, fixed]** Fix #1 above introduced its own regression: the corrected comment described clearing `projectId` while leaving `idempotencyKey` alone, but the actual `data: {}` object only had `isCurrent: false` — `projectId: null` had been dropped entirely along with the `idempotencyKey: null` it was originally bundled with. Since the replacement still carries `existing.projectId` forward and `projectId` is `@@unique`, any correction of a project-linked event would hit P2002. Fixed by restoring `projectId: null` on the superseded row while still leaving `idempotencyKey` untouched.
6. **[P1, fixed]** A tighter race than fix #2's P2002 case: if a concurrent winning attempt's whole transaction (supersede + create) commits strictly *between* this attempt's own `alreadyCorrected` pre-check and `updateHomeEvent`'s internal `existing`-event lookup, that lookup sees the original already superseded and throws `HOME_EVENT_NOT_FOUND` — never reaching the P2002 case at all, since it never attempts its own create. `confirmCaptureEvent`'s `HOME_EVENT_NOT_FOUND` handler rejected immediately without checking whether the correction had, in fact, already succeeded via that concurrent winner. Because the winner's supersede and replacement-create commit atomically together in one transaction, re-reading by `correctionIdempotencyKey` at this point is guaranteed to find the winner whenever this exact race occurs — fixed by adding that re-check before rejecting, mirroring the P2002 recovery's own shape. (The shared `RUNNING`-status guard from fix #2(b) does not close this gap on its own: a winner whose domain write already committed but whose own `AskExecution`/receipt completion transaction hasn't run yet still reads as `RUNNING`, so relying on that guard alone would have let this race's loser transiently overwrite the winner's state before the winner's own completion caught up. Fixing the re-check at the source, in `confirmCaptureEvent` itself, closes the gap before the shared catch block is ever reached.)
7. **[Unchanged, already documented]** No warranty-capture writer exists yet — this review round reconfirmed item 3 above still stands as an explicit, open gap, not a new finding.

Verification: `tsc --noEmit` clean. `captureConfirmWriteSafety.test.js` gained 2 more tests pinning both fixes (17 total in that file). Full targeted sweep (`askGovernance`, `capabilityHandlerRegistry`, `confirmCapabilityHandlerRegistry`, `captureConfirmWriteSafety`, `captureLinkReconciliation`, `groundedAskProposalMapping`, `capturePropertyFinancingFact`): 61/61 pass, zero regressions.

**Independently releasable:** yes, behind a flag (§21) — the new operation family exists and is testable without any conversational trigger reaching it yet.

---

## 9. Phase 3 — Conversational Capture MVP

**Goal:** capture homeowner-supplied information from ordinary conversation, narrow scope.

**Recommended first supported types:** scalar fact, simple retrospective home event (per the request's explicit recommendation — not warranty, not goal, not every category at once).

**Work:** deterministic pre-filter (FRD §13) with its own unit-test suite; extraction evaluation harness and corpus (FRD §15) built *alongside* the extraction pass itself, not after (per the request's explicit sequencing instruction, since this is the one genuinely new deterministic component with no existing analog to inherit test discipline from); constrained extraction (FRD §14); candidate execution creation using Phase 2's now-proven write path; confirmation via the existing `confirmation` field (not a new block — FRD §14's correction); persistence via `capturePropertyFact` (extended) and the new `HomeEvent` writer; `PropertyChange` fan-in (existing, unchanged); correction path (via §8.2's supersession-based mechanism, not `correctionModes`); a minimal `PropertyFinancingProfile.interestRateBps` writer (new this revision — see the mortgage-rate finding below).

```
NEW EVIDENCE AGAINST THE REQUEST'S OWN REPRESENTATIVE EXAMPLE (not a Stage 2 assumption — this
  scenario is the request's §36/Phase-3 text, checked against fresh code this pass):
NEW CODE EVIDENCE: `financial.currentMortgage`/`financial.financingProfile` are marked
  `writable: false` in `factCatalog.ts:127-128` (`canonicalOwner: PropertyFinancingProfile`), and
  `capturePropertyFact.ts:270-271` throws `Property Context fact is not writable through
  contextual capture` for any non-writable key. `PropertyFinancingProfile` (`schema.prisma:19375`)
  is a separate, `propertyId`-unique 1:1 model with `interestRateBps: Int?` — not a
  `PropertyFactEvidence` row — so the generic extended `capturePropertyFact` writer this phase
  already plans cannot serve this example regardless of the writable flag; a distinct writer is
  needed no matter what.
IMPACT: "My mortgage rate is 6.75%" would fail today exactly as extraction would try to persist
  it, via the exact path this phase's own Work list names as the persistence mechanism.
RECOMMENDED ADJUSTMENT: add one small, explicitly-scoped writer for this phase (contract specified
  below) — a one-field, one-model writer, small, but new, not "already extended
  `capturePropertyFact`" as originally scoped, and belongs in this phase's estimate rather than
  being silently absorbed by it.
```

**Financing writer — end-to-end integrity contract (specified this revision, sequencing corrected in a follow-up round):**
- **Model, not the generic path.** `capturePropertyFact`'s existing pattern (`capturePropertyFact.ts:283-311`) is the template, not a function to extend — same four effects (canonical write, supersede-prior, create-evidence, emit `PropertyChange`), all atomic — but the **order is not a straight copy of that function's**, because this writer's idempotency check has to run first (see below), and a naive copy of the original order would let the blanket supersession step re-supersede the row it just created. The corrected, single sequence (`capturePropertyFinancingFact`):
  1. Inside one `prisma.$transaction`, attempt `tx.propertyFactEvidence.create(...)` first, keyed on the new `captureExecutionId` + its `@@unique([propertyId, factKey, captureExecutionId])` constraint (Phase 2's addition). This is the idempotency gate, and it must be the transaction's first statement — see the rollback note below for why.
  2. **Only on that create's success** (this is a first-time attempt, not a replay): within the *same* transaction, supersede prior active evidence — `tx.propertyFactEvidence.updateMany({ where: { propertyId, factKey, supersededAt: null, id: { not: newEvidence.id } }, data: { supersededAt: observedAt } })`. **The `id: { not: newEvidence.id }` clause is required and was missing from an earlier draft of this contract** — without it, this blanket `updateMany` (which matches every active row for the fact key, with no awareness that one of them is the row this same transaction just created) would immediately re-supersede the new row alongside the genuinely-stale ones, leaving no active evidence at all for the assembler to read.
  3. Upsert `PropertyFinancingProfile.interestRateBps` by `propertyId` (`schema.prisma:19375-19399`).
  4. Emit `PropertyChange`, then commit.
  - **Duplicate-key recovery is an outer-catch, not an inner one.** A `P2002` on step 1's create aborts the whole Postgres transaction — once any statement inside a transaction errors, that transaction can't safely run further statements, so steps 2-4 cannot be reached this attempt regardless of whether the JS error is caught inline. The correct handling wraps the entire `prisma.$transaction(...)` call, not the create alone: catch `P2002` at that outer boundary, then issue a fresh, separate (non-transactional) `findUnique` on `(propertyId, factKey, captureExecutionId)` against the row the *original*, successful attempt already committed, and return that result — never retry steps 2-4 for a replay. This mirrors the outer-catch shape FRD §22 already specifies generically for `PropertyFactEvidence` ("create on `captureExecutionId` with `P2002`-catch-and-return"); this writer follows it exactly rather than inventing a different one.
  - `capturePropertyFact`'s own `!definition.writable` gate (`:270-271`) stays exactly as-is for its existing generic-UI caller; this is a new, separate function for the conversational-capture caller specifically, not a bypass flag threaded through the old one.
- **Why this ordering, not the original function's:** this is the same failure class Stage 2's second-round correction already named generically ("a stale replay must not resurrect a value a later, unrelated correction already superseded"), applied here to a mutable 1:1 model instead of an append-only evidence log — the create-first ordering is what stops a retried confirmation from reapplying a stale rate over a newer one written by a *different*, later execution in between.
- **Normalization:** `Math.round(rate * 100)` (percent → basis points, 6.75 → 675), validated against a sane bounds check (reject obviously-wrong values, e.g. negative or > 100%) before the transaction opens.
- **Reader side — verified this revision, zero change needed.** `financingAssembler` (`prismaAssemblers.ts:974-1000`) already reads real evidence in preference to a synthetic default: `evidence.get('financial.currentMortgage') ?? mortgageEvidence`, where `evidence` is `loadEvidence(propertyId, 'FINANCIAL')` — a generic `PropertyFactEvidence` query, filtered `supersededAt: null`, keyed by `factKey` (`:50-57`), ranked by `selectEvidence`'s existing known/verified/source-priority ordering (`:23-45`). Once the new writer creates a live, non-superseded `PropertyFactEvidence` row for `financial.currentMortgage`, this assembler surfaces it automatically and stops falling back to the hand-built `mortgageEvidence` placeholder — no assembler code changes; this claim is falsifiable directly by reading `:1020-1022`'s ternary, which already prefers `evidence.get(key)` when present.

**Async-fallback delivery — dependency, with an explicit acceptance-scope carve-out (revised this revision, not just documented as a dependency):** per FRD §10's Turn Processing Contract, a synchronous extraction attempt that misses its ~1.5s budget falls back to the existing `DomainEvent` outbox, completing later via a worker. The only delivery mechanism this program builds for "a background process created something the homeowner should see, outside the request/response cycle" is `notifyWithAskContinuation`, generalized in **Phase 5**, not this phase — pulling a duplicate, narrower version of that mechanism into Phase 3 would pre-empt Phase 5's own scope and violate this plan's own "no unnecessary feature expansion" principle (§2.5) for a genuinely rare tail case (the common case completes synchronously). Given that trade-off, **this phase's acceptance criterion below is scoped to exclude proactive delivery of the fallback tail — explicitly, not silently:**

**Representative scenarios:** "My mortgage rate is 6.75%." (covered by the writer above) / "I replaced my roof last summer for $14,500." (warranty explicitly deferred — Stage 2 §14's Candidate item 2 pattern is designed but not required for MVP scope).

**Acceptance criterion (revised this revision):** information supplied naturally in conversation and captured within the synchronous extraction attempt becomes structured, confirmed home knowledge, delivered inline in that same turn's response (via §19's `childExecutions` field) and visible to the existing aggregation-context read path on the next turn, with the extraction evaluation corpus clearing its pilot thresholds (FRD §15). The mortgage-rate scenario specifically exercises the new `PropertyFinancingProfile` writer and its idempotency/atomicity contract above, not `capturePropertyFact`. **Explicitly out of this phase's acceptance bar:** proactive delivery of an async-fallback capture — that capture is durably persisted and correctly idempotent (Phase 2's guarantees hold regardless of delivery timing) and becomes visible the next time the homeowner opens that session, but Phase 3 does not push it to their attention; a homeowner watching the same open session live does not see it appear on its own either, since there is no live refresh channel. This is a real, accepted scope reduction for this phase, not an oversight — full proactive delivery of the fallback tail is Phase 5's acceptance criterion, not this one's.

**Independently releasable:** yes, behind a flag — homeowners who don't trigger the pre-filter see no change.

**Status (2026-09-13): shipped, complete against this section's own Work list, and code-review-clean after a fifth external review round found and got four real [P1]s fixed** (`5b3369cf`, detailed below) — behind `askConversationalCaptureEnabled` (default OFF). The last two acknowledged Work-list gaps (warranty capture writer + paired-confirmation scenario, then edit-before-confirm) closed `e331083a`/`2e59e5a5`; the suppression-mechanism gap in Phase 4 (a different phase, found the same day by re-deriving "is it done" from the requirement's own text rather than trusting this banner) is tracked in §10, not here. "Code-review-clean" is still not the same claim as "deployed and browser-verified" (it is not — see below). Eleven commits, each independently tsc-clean and targeted-test-verified:
- `aac6f26e` — `capturePropertyFinancingFact.ts`: the dedicated `PropertyFinancingProfile.interestRateBps` writer this section's own mortgage-rate finding required, full atomicity/idempotency contract as specified above. `confirmCaptureFact` branches `financial.currentMortgage` to it.
- `b9987f02` — `extractionPreFilter.ts` (pure, no-I/O) + `extractionEvaluationCorpus.ts` (all 11 FRD §15 categories). Pre-filter recall/precision against the frozen corpus: 100%/100%, clearing the 85%/70% pilot thresholds.
- `f310f3c4` — `extractionCandidateSchema.ts` (FACT/EVENT only — GOAL deliberately excluded, per this section's own "not warranty, not goal" scoping) + `extractionContract.ts` (the bounded Gemini call, following `inspectionExtraction.service.ts`'s established structured-output convention).
- `5f585bcb` — `ask.contract.ts`'s `childExecutions` field (bounded to 3, one level deep, exactly as §19 specifies) + `conversationalCapture.ts` (persist-first `ASK_EXTRACTION_REQUESTED` DomainEvent → inline claim → 1.5s-budgeted extraction attempt → claim-token-verified child-execution persistence) + the one `askOrchestrator.service.ts` call site, independent of the routed answer per FRD §10.
- `37b6790a` — the `ASK_EXTRACTION_REQUESTED` worker consumer (`processDomainEvents.job.ts`), closing the async-fallback path for a genuine backend-process crash mid-attempt.
- `df0fdf43` — frontend: `childExecutions` on the type, one line in `AskWorkspace.tsx`'s `ask()`, exactly as §19 scoped ("one schema field, one line").
- `2ea335a3` — external review round 3 fixes (5 findings: unregistered AI route made extraction fully non-functional, worker persistence atomicity, an invented FRD §10 violation, missing correction-target resolution, unvalidated FACT values).
- `2231fe5f` — external review round 4 fixes (2 findings: sparse correction patch replacing the data-destroying full-overwrite behavior, guarded worker completion writes).
- `e331083a` — the warranty capture writer + paired-confirmation scenario (below).
- `2e59e5a5` — edit-before-confirm for capture candidates (below), closing the last item the round-4/round-5 status banner named as genuinely unfinished.
- `5b3369cf` — fifth external review round on edit-before-confirm/warranty specifically (below): 4 findings, all [P1], all verified true, all fixed.

**What remains unfinished as of 2026-09-13:** nothing against this section's own Work list. Not deployed or browser-verified — the flag is off by default and no end-to-end conversation (extraction → edit → confirm) has been run against a live Gemini key.

**Fifth external review round, same day, commit `5b3369cf`: 4 findings, all [P1], all verified true against source before fixing, all fixed.** Scope: specifically the edit-before-confirm (`2e59e5a5`) and warranty capture writer (`e331083a`) work.

1. **Confirmation-version invalidation was a no-op.** Every card-builder function hardcoded `confirmation.version: 1` — a pre-existing, codebase-wide convention (verified during this program's own Phase 3 research: `confirmationVersion` is `1` in literally every operation's `NEEDS_CONFIRMATION` result) that was harmless before edit-before-confirm existed, since a capture candidate's `parametersJson` never changed between proposal and confirmation. Editing broke that invariant without anyone updating the version scheme to match: `confirmAskExecution`'s only defense against a stale confirmation attempt (`expectedVersion !== input.confirmationVersion`, `askOrchestrator.service.ts`) compares the CLIENT-submitted version against the CURRENTLY-STORED one — since both a pre-edit card and a post-edit card said `1`, that check became a reproducible no-op for these three operations specifically. A stale, already-superseded card could authorize the NEW, edited values. Fixed with `nextConfirmationVersion()` (increments past whatever was last stored), threaded through all five card-builder functions and all three `editCapture*Candidate` functions, in both the returned `confirmation.version` and the stored `parameters.confirmationVersion`.
2. **An edit racing a confirmation could resurrect completed state.** `submitAskCapture`'s shared final save (used by every branch in that function, not just captures) was an unconditional `tx.askExecution.update({where: {id}, ...})`. If `confirmAskExecution` claimed the row into `RUNNING` (or completed it) between this function's initial read and this write, the unconditional write would silently overwrite that newer state back to `NEEDS_CONFIRMATION` with this attempt's own now-stale parameters. Fixed generically (benefits every `submitAskCapture` branch, not just captures) with a compare-and-swap: `tx.askExecution.updateMany({where: {id, status: execution.status}, ...})`, throwing `ASK_CAPTURE_NOT_ACTIVE` when `count !== 1` and re-reading the row inside the same transaction for the return value — the same idiom this file already uses for the analogous confirm-side race.
3. **Retrying an edit could replace its own confirmation card with an unrelated answer.** The idempotency-replay branch (a genuine retry of an already-succeeded submission, matched by `(executionId, idempotencyKey)`) called `resolveAskOperation(execution.message)` + `executeOperation(...)` — correct for the routable operations this branch was originally built for (household invitation, maintenance task), but capture-edit operations are never routable; `execution.message` for them is the candidate's own `sourceSentence` (e.g. "My home was built in 1998."), not a homeowner request. Replaying it through the full router could silently reroute to an unrelated operation and overwrite the correctly-persisted edit. Fixed: capture-edit operations now return the already-persisted execution directly from this branch, before ever reaching the reroute.
4. **Warranty dates manufactured unsupported precision.** `resolveWarrantyDates` used an approximate paired event's `dateRangeStart` (or `now`, if no date info existed at all) as an exact `Warranty.startDate` — reproduced exactly as reported: "last summer" (a RANGE-precision event) became a fabricated exact "June 1." `Warranty.startDate`/`expiryDate` are required, non-nullable `DateTime` columns with no precision/uncertainty field of their own (unlike `HomeEvent`'s `datePrecision`), so this can't be fixed by preserving imprecision the same way. Fixed two ways: (a) `resolveWarrantyDates` now reports `startDateApproximate` (true whenever the resolved date isn't a homeowner-stated exact value or an `EXACT_DATE`-precision paired event), and both the creation-time and edit-time confirmation cards label an approximate date as an estimate rather than presenting it as fact; (b) `startDate`/`expiryDate` are now genuinely editable (previously excluded from edit scope entirely — this document's own §10-adjacent scoping decision, now reversed specifically for Warranty since its two dates are schema-simple exact values with no `HomeEvent`-style range/precision complexity), cross-validated (`expiryDate` after `startDate`) the same way `captureWarranty.ts`'s actual confirm-time writer validates them, so an edited card can never propose a date pair that would fail once confirmed.

Verification: `tsc --noEmit` clean. `conversationalCapture.test.js` grew from 41 to 53 tests, covering all four fixes directly (confirmation-version incrementing across multiple edits and across operations, the exact-vs-approximate branches of `resolveWarrantyDates`, cross-field date validation, the "estimated" label appearing/disappearing) plus two new source-governance tests for the orchestrator-side fixes. A full `tests/ask/*.test.js` + `intelligenceRegistries.test.js` sweep (471 tests) shows the same 7 pre-existing failures already confirmed against baseline `main` earlier this session, zero new ones.

**Warranty capture writer + paired-confirmation scenario, closed 2026-09-13 (`e331083a`):** new `CAPTURE_WARRANTY_CONFIRM` operation, registered identically to `CAPTURE_FACT_CONFIRM`/`CAPTURE_EVENT_CONFIRM` across `askOperationRegistry.ts`, `askDomainCommandRegistry.ts`, `askOrchestrator.service.ts` (propose-time `OUT_OF_SCOPE` handler + confirm-time `confirmCaptureWarranty`), and both calibration corpora (`askOperationSemanticPackages.ts`, `askTrustCertificationCorpus.ts`) — hardcoded operation-count assertions bumped 69→70 / 27→28 in `askGovernance.test.js`, `capabilityHandlerRegistry.test.js`, `confirmCapabilityHandlerRegistry.test.js`. New writer `modules/propertyContext/application/captureWarranty.ts`: a single idempotent `Warranty` create gated on the schema's own `@@unique([propertyId, sourceExecutionId])` (already forward-provisioned in Phase 2, needing zero schema change), `homeownerProfileId` resolved from `propertyId` via a direct `Property` lookup — the same pattern `relationalCaptureAdapters.ts`'s own `createWarranty` already uses, confirmed by reading it directly before writing this rather than assumed. `extractionCandidateSchema.ts` gains a third candidate category (`WARRANTY`, sibling to FACT/EVENT — not a merged field on the EVENT schema) carrying `linkedEventCandidateIndex`, required to point at an EVENT candidate in the same extraction batch (a standalone warranty statement with no paired event is dropped entirely, per this section's own "needs a sibling HomeEvent candidate" scoping). `extractionContract.ts` gains a WARRANTY prompt block and `withValidWarrantyLinks`, run after `withValidCorrectionReferences` (not before — correction-filtering can itself drop the EVENT a warranty links to). `conversationalCapture.ts`'s `persistCandidates` now wires each pair's `AskExecution.linkedExecutionId` bidirectionally inside the same transaction that creates both child rows, giving Phase 2's `linkSiblingCaptureExecutions`/`ASK_CAPTURE_LINK_RECONCILE` mechanism (built and tested synthetically, with zero real producer) its first real producer — closing the exact gap Phase 2's review addendum flagged (§17 above, "wired but has no real producer yet").

**Real correctness issue found and fixed while building this (not a review-round finding — caught during implementation):** any of the three candidate-list filters that can drop a candidate (`filterValidCandidates`'s invalid-FACT drop, `withValidCorrectionReferences`'s invalid-correction drop, `withValidWarrantyLinks`'s own invalid-link drop) shifts every later candidate's array position via plain `.filter()` compaction — silently invalidating a *surviving* WARRANTY candidate's `linkedEventCandidateIndex` if anything before its paired EVENT gets dropped by an unrelated filter, even though the WARRANTY/EVENT pair itself was never touched. Fixed with one shared helper, `filterCandidatesPreservingWarrantyLinks` (`extractionCandidateSchema.ts`), used by all three filtering steps: it remaps a surviving WARRANTY's index to its EVENT's new position, and drops the WARRANTY outright (rather than leaving it pointing at the wrong candidate) if its paired EVENT did not itself survive. Unit-tested directly (index remap after an earlier drop; drop-when-target-missing; no-op-filter leaves indices untouched).

Verification: `tsc --noEmit` clean. Targeted unit tests added for the WARRANTY schema (accepts/rejects, both expiry forms), `withValidWarrantyLinks` (valid link, out-of-bounds index, non-EVENT target), `resolveWarrantyDates` (explicit expiry, `durationMonths` computation, EVENT-occurredAt fallback, EVENT-dateRangeStart fallback, now-fallback), `buildChildExecutionData`'s WARRANTY branch, `filterCandidatesPreservingWarrantyLinks`'s three cases, and a source-governance test for `persistCandidates`'s sibling-linking wiring (same class as this file's other DB-touching-function coverage, per the established no-DB-mock-harness convention). A full `tests/ask/*.test.js` sweep was run and diffed against a `git stash`-isolated baseline run on unmodified `main`: the same 7 tests fail on both (`HVAC_SPECIALIST_ENGAGE` registry-list drift from a different program — the same one this document's own memory already names — plus a `askRoutingCalibration.test.js`/`askTrustArchitecture.test.js`/`askLaunchContextCapability.test.js` cluster whose failures reproduce byte-for-byte on baseline, confirmed via a real stash-and-rerun rather than assumed from a prior session's note) — zero new regressions from this change. Not deployed or browser-verified; flag remains off by default.

**Edit-before-confirm for capture candidates, closed 2026-09-13 (`2e59e5a5`).** A prior session's own note characterizing this item (Phase 3 review round 3, item 5 below) was WRONG and was re-checked against fresh code rather than trusted: `extractHouseholdInvitationInput`/`extractMaintenanceTaskInput`'s `suppliedInput` parameter is not a separate, lighter mechanism — it is fed BY `submitAskCapture`/`AskCaptureRequestSchema` itself (`askOrchestrator.service.ts:7815,7843`), which is the ONLY existing edit mechanism in this codebase. Re-reading the FRD directly (not a summary of it) resolved the actual scope: FRD line 383 states plainly, "candidate payload is editable via the existing `captureRequests`/`suppliedInput` mechanism before the confirm call, not a separate edit endpoint" — i.e. plug the three capture operations into the existing generic `submitAskCapture`/`AskCaptureReceipt` system, not invent a new chat-message-correction NLU pipeline.

Implementation: `buildChildExecutionData` now attaches one `AskCaptureRequest` to every capture candidate's own `resultJson.captureRequests` at creation time (`factEditCaptureRequest`/`eventEditCaptureRequest`/`warrantyEditCaptureRequest`, `conversationalCapture.ts`) — built off the STORED PARAMETERS SHAPE rather than the `ExtractionCandidate` type, so the identical builder runs both at creation and after every edit (an edited execution's original candidate object no longer exists). `submitAskCapture`'s operationId allow-list (`askOrchestrator.service.ts:7574`) now includes all three `CAPTURE_*_CONFIRM` operations, dispatching to three new exported functions (`editCaptureFactCandidate`/`editCaptureEventCandidate`/`editCaptureWarrantyCandidate`) that re-validate the submitted answer with the exact same per-field logic used at proposal time (`isValidFactCandidateValue`, per-field EVENT/WARRANTY zod schemas) and rebuild a fresh `NEEDS_CONFIRMATION` `AskOperationResult` — never writing to any domain model directly; only an actual confirm does that. Required **zero frontend changes**: `AskWorkspace.tsx`'s `InlineCaptureCard` already renders any execution's `captureRequests` generically alongside its `confirmation` card (confirmed by reading the component directly, not assumed), and already supports every `inputSchema` type used here (`SHORT_TEXT`/`SINGLE_SELECT`/`DECIMAL`/`BOOLEAN`/`GROUP`).

**Scope decision, explicit not silent:** date/date-precision fields (EVENT's `occurredAt`/`datePrecision`/`dateRangeStart`/`dateRangeEnd`, WARRANTY's `startDate`/`expiryDate`/`durationMonths`) are not editable in this pass — each has cross-field validation dependencies (a RANGE needs two consistent dates; a warranty's expiry is derived from either an explicit date or a duration) that would have multiplied this feature's surface considerably against the FRD's own representative examples, which are cost/provider/value corrections, not date corrections. A correction-type EVENT execution's editable fields are derived dynamically from whichever of its sparse `correctedFields` are actually present, so editing never offers a field the original correction didn't touch; if a correction's only field is `date` (outside this pass's scope), no captureRequest is attached at all rather than one with an empty field list.

**Real UI-consistency bug found and fixed while building this (caught before shipping, not a review-round finding):** the first classification chosen, `ENHANCEMENT_ACCURACY`, was reverted after reading `AskWorkspace.tsx` directly — that classification renders a "Use general estimate" dismiss button (correct copy for the Property-Context feature-capture flow it was designed for, nonsensical for editing a capture candidate) and is excluded from the set of classifications that suppress a premature `property-context:updated` DOM event on submit (firing that event before an actual confirm has happened would be misleading, since an edit never itself writes to PropertyContext). Switched to `SCENARIO_INPUT`, which renders the correct "Save and update answer" submit label, no stray dismiss button, and correctly suppresses the premature event — verified directly against the component's own render logic, not assumed from the schema's enum alone.

Verification: `tsc --noEmit` clean. 41 targeted tests in `conversationalCapture.test.js` (up from 24) covering every `captureRequest` shape (FACT, new EVENT, correction EVENT with only the corrected field(s), correction EVENT whose only field is out-of-scope → no captureRequest, WARRANTY), every `editCapture*Candidate` function (valid edits, invalid values, an answer naming a field the execution never had, an execution with no editable fields at all), and source-governance tests for `submitAskCapture`'s new branch (allow-list membership, gating order — captureKey check → contextVersion check → editor call, and confirming no domain-writing function is ever called from this branch). A full `tests/ask/*.test.js` sweep (430 tests) shows the same 7 pre-existing failures as the warranty-writer verification above and zero new ones.

**What this pass deliberately did NOT do, left open for a follow-up pass:**
- **Dedup rule is narrower than Stage 2's field-level design.** `skipDueToRoutedCapture` only fires when the routed operation itself completed a `MATERIAL_DECISION` write this same turn — not the field-level dedup FRD §8.3 describes (a routed `MAINTENANCE_TASK_COMPLETE` that already captured `actualCost` skipping only that field, not the whole turn). Full per-field dedup across all 69 operations was judged too large a sub-slice to fold into this pass silently; flagging it here instead.
- **GOAL candidates are not extracted.** The pre-filter recognizes goal-statement language (`GOAL_STATEMENT` reason) but `extractionCandidateSchema.ts` only accepts FACT/EVENT — matches this section's own "Recommended first supported types" scoping, but means FRD §8.5's "thinking about selling next year" scenario produces no candidate yet. Phase 6 (DecisionThread expansion) is where this closes.
- **Extraction accuracy against FRD §15's non-pre-filter metrics (candidate/field/date-precision/attribution accuracy, duplicate rate, false-persistence rate) is not measured.** Those require live Gemini calls scored against the corpus; this pass verified the pre-filter's own recall/precision only (100%/100%) and the candidate schema's validation logic (pure, no LLM). FRD §15 is explicit that these are pilot-readiness gates requiring real usage data, not unit-test assertions — not attempted here.
- **Warranty pairing was untouched as of this bullet's original writing (2026-09-13) — closed later the same day, see the "Warranty capture writer + paired-confirmation scenario, closed 2026-09-13" note above.** Phase 2 built `linkSiblingCaptureExecutions`/`ASK_CAPTURE_LINK_RECONCILE` synthetically with zero real producer; the warranty capture writer is that producer.
- **Not deployed or browser-verified.** `npx prisma db push` needed no new run this phase (all schema fields were already added in Phase 2, forward-provisioned) — but the flag is off by default and no end-to-end conversation has been run against a live Gemini key in this pass.

**External review (2026-09-13): five findings (4 P1, 1 P2), all verified against source before fixing. All five were real.**
1. **[P1, fixed]** `ai:ask-conversational-capture-extraction` was called with no `AI_SOURCE_REGISTRY` entry -- every extraction attempt threw `AI_SOURCE_UNREGISTERED` before the model was ever invoked, confirmed by reproducing it via a genuine (unmocked) `executeGovernedAIRequest` call in the new regression test. Extraction never actually worked, flag on or off, until this fix. Registered the route in `sourceRegistry.ts`.
2. **[P1, fixed]** `persistCandidates` committed candidates and marked the `DomainEvent` `PROCESSED` in two separate, non-atomic writes for the worker path (candidates inside its own transaction, `PROCESSED` via `processDomainEvents.job.ts`'s generic post-handler write). A crash between the two left candidates durably committed but the event still `PROCESSING`; once reclaimed, a retried extraction's own candidates would reuse the first attempt's rows purely by clientRequestId index position, silently mixing stale content with a different new result. Fixed by always marking `PROCESSED` inside the SAME transaction that creates the candidates, for both paths (removed the `markProcessed` parameter entirely) -- the worker's own subsequent generic write is now a harmless no-op re-write. The empty-candidates early-return also skipped `verifyClaimStillOwned` entirely; it now goes through the identical transaction+verify path as the non-empty case.
3. **[P1, fixed]** The extraction-trigger call site suppressed extraction whenever routing needed clarification or the routed operation itself returned `NEEDS_CONFIRMATION` -- an invented UX simplification (avoid "stacking" confirmation cards) that directly violated FRD §10's explicit "routing succeeding or failing does not gate extraction," silently discarding an independent home fact stated alongside an ambiguous or confirmation-requiring command. `childExecutions` already supports multiple simultaneous cards by design (bounded to 3) -- there was no real stacking conflict to avoid. Removed both gates; only `executionPropertyId` remains.
4. **[P1, fixed]** `EventExtractionCandidateSchema` had no `correctingEventId` field, and extraction received no context about prior events at all -- a correction statement ("Actually, that roof replacement cost $15,000") could not resolve a target and would either be dropped or proposed as a duplicate new event. Fixed: `correctingEventId` added to the schema; `extractionContract.ts` now accepts a bounded `recentHomeEvents` context (≤8 most recent current events, id/title/date/amount only) and includes it in the prompt; a returned `correctingEventId` not present in that bounded list is treated as a hallucination and the candidate is dropped (`withValidCorrectionReferences`, unit-tested directly). `conversationalCapture.ts` threads the field through to `confirmCaptureEvent`'s existing (Phase 2-built, previously unreachable from conversation) `correctingEventId` branch, and the confirmation card now reads "Update this home timeline event?" instead of "Add" when correcting. **Known limitation at the time (closed in the next review round, item 6 below):** the candidate schema required a full EVENT shape regardless of correction-vs-new, so a correction reconstructed the FULL event content rather than patching only the field(s) actually mentioned.
5. **[P2, partially fixed]** A FACT candidate's `value` was accepted at the schema level with no per-factKey validation, so an invalid number or enum value could reach a Save card that only failed once confirmed, with no way to edit it. Fixed the first half: `isValidFactCandidateValue` validates every FACT candidate with the exact same `normalizeCaptureValue` logic (or the financing-specific 0-100 bound) the confirm-time writer itself uses, dropping invalid candidates before they are ever proposed (`filterValidCandidates`, called inside `persistCandidates` before the transaction opens) -- this closes the "Save card that fails when confirmed" outcome directly. **Not fixed:** "wire the required edit-before-confirm path." The FRD §22 mechanism this refers to (`suppliedInput`) is, on inspection, this codebase's existing pattern of re-extracting a corrected value from a homeowner's follow-up chat message for an already-pending command (see `extractHouseholdInvitationInput`/`extractMaintenanceTaskInput`'s own `suppliedInput` parameters) -- not the heavier, structurally unrelated `AskCaptureRequestSchema`/`submitAskCaptureRequest` mechanism used by Property Context gap-filling. Building the equivalent for a pending `CAPTURE_FACT_CONFIRM`/`CAPTURE_EVENT_CONFIRM` child execution (detecting a follow-up message refers to it, re-running extraction, updating its `parametersJson`) is a real, distinct feature this pass does not attempt -- left open, not silently implied complete.

   **Correction (2026-09-13, later the same day, before implementing edit-before-confirm):** the characterization directly above is WRONG on both counts, caught by a fresh investigation rather than trusted. `extractHouseholdInvitationInput`/`extractMaintenanceTaskInput`'s `suppliedInput` is not a separate, lighter mechanism -- it is fed BY `submitAskCapture`/`AskCaptureRequestSchema` itself. That IS the only existing edit mechanism in this codebase; there is no second, lighter one. The FRD's own line 383 (not paraphrased) settles the actual scope: plug the three capture operations into the existing `submitAskCapture`/`captureRequests` system. Left as written above rather than rewritten, per this document's own history-is-not-rewritten convention -- see "Edit-before-confirm for capture candidates, closed 2026-09-13" above for what was actually built.

Verification: `tsc --noEmit` clean across `apps/backend` and `apps/workers`. New `extractionContract.test.js` (9 tests, including a genuine unmocked `executeGovernedAIRequest` regression test for finding 1, plus a negative control proving that test isn't vacuous). `conversationalCapture.test.js` extended (14 tests total) covering the routing-gate removal, the atomicity fix, FACT-value validation, and `correctingEventId` threading/card text. Full targeted sweep across every Phase 2/3 Ask test file: 105/105 pass in `apps/backend`, 30/30 in `apps/workers`' `processDomainEventsJob.test.js` -- zero regressions.

**Fourth review round (2026-09-13): two more real P1 defects found, both fixed; the two acknowledged gaps (edit-before-confirm, warranty writer) reconfirmed still open.**
6. **[P1, fixed]** The known limitation in item 4 above was worse than characterized: `buildChildExecutionData` built a correction's parameters exactly like a new event, so a cost-only correction candidate ALSO set the event's date to "now," precision to `UNKNOWN`, and provider/summary/dateRange to `null` -- and `updateHomeEvent` treats every explicitly-set field as an intentional change, so confirming a `$15,000` amount correction silently destroyed the original event's real date, provider, and summary. Fixed with a genuine sparse patch: `correctedFields` added to `EventExtractionCandidateSchema` (`'eventType'|'title'|'summary'|'date'|'amount'|'currency'|'providerName'` -- `'date'` bundles `occurredAt`/`datePrecision`/`dateRangeStart`/`dateRangeEnd` together, since they must stay internally consistent), the prompt instructs the model to name only the group(s) actually being corrected, and `buildEventContentParameters` (new, unit-tested directly) includes ONLY those named fields for a correction -- everything else is *omitted*, not nulled, so `updateHomeEvent`'s own `patch.X !== undefined ? patch.X : existing.X` fallback preserves it untouched. A correction with `correctingEventId` set but empty/missing `correctedFields` is dropped by `withValidCorrectionReferences` (a correction naming nothing to change is meaningless). The confirmation card's `fields` now show only the field(s) actually changing, not a generic new-event summary.
7. **[P1, fixed]** `processDomainEvents.job.ts`'s shared success/failure completion writes were both unconditional `update` calls. Since `ASK_EXTRACTION_REQUESTED`'s own handler (`persistCandidates`) already commits candidates and marks the event `PROCESSED` atomically inside its own transaction, this file's subsequent generic completion write is redundant by design -- and if that redundant write itself failed for any reason, the resulting throw fell into the catch block, which unconditionally flipped the row's status to `FAILED`/`DEAD_LETTER`, discarding an already-successful, already-durable extraction and letting the poller reprocess it (with the same stale-index-reuse risk as finding 2 above). It also had no claim-token fencing: a stale/reclaimed attempt's failure write could stomp a later attempt's state. Fixed by converting both writes to guarded `updateMany` calls: the success write requires `status: 'PROCESSING'` (a no-op for `ASK_EXTRACTION_REQUESTED`, which is already `PROCESSED` by that point; unchanged behavior for every other event type, which never self-completes); the failure write additionally requires `attempts` to still match this iteration's own claimed value, and `failed`/`deadLettered` only increment when the guarded write actually matched a row.

Verification: `tsc --noEmit` clean across `apps/backend` and `apps/workers`. New tests: `conversationalCapture.test.js` +4 (18 total) reproducing the exact cost-only-correction defect and pinning the sparse-patch/bundling/new-event/empty-correctedFields behaviors; `extractionCandidateSchema.test.js` +3; `extractionContract.test.js`'s existing correction tests updated for the new `correctedFields` requirement; `processDomainEventsJob.test.js` +3 (33 total) reproducing the exact "handler self-completed, redundant write then fails" scenario and pinning both guards' source shape. Full targeted sweep: 113/113 pass in `apps/backend`, 33/33 in `apps/workers` -- zero regressions.

**Still explicitly unfinished, unchanged from the prior round:** edit-before-confirm for capture candidates (item 5 above), and the warranty capture writer + paired-confirmation acceptance scenario (item 3 in the Phase 2 review addendum above).

---

## 10. Phase 4 — Contextual Next Actions

**Goal:** no dead-end responses.

**Work:** dedicated next-action module (FRD §27) using the existing `capabilityCandidateMatcher`/`capabilityRanking`/`capabilitySuppressionPolicy` machinery (confirmed to already exist and be more capable than Stage 2's first draft credited) plus `askSuggestionPolicy.ts`'s existing repeat-filter; READY vs. NEEDS_INFO tiering; max-5 cap (existing convention, reused).

**Acceptance criterion:** representative Ask responses (the FRD §8 user stories) consistently produce a small set (≤5) of relevant, executable next actions rather than generic suggestion text, with `GROUNDED_GUIDANCE` and sell/hold/rent responses specifically verified to surface previously-missing suggestions (Stage 1's two named gaps).

**Independently releasable:** yes — purely additive to existing responses.

**Status (2026-09-13): shipped, `129cfaef`.** Before implementing, fresh code research (an Explore-agent pass, not taken on faith) found this section's own "confirmed to already exist" framing needed a real decision, not just confirmation — see the four corrections below, each checked against source before this pass wrote any code.

**STAGE 2/FRD ASSUMPTION → NEW CODE EVIDENCE → IMPACT → RECOMMENDED ADJUSTMENT, four corrections:**

```
1. TWO PARALLEL RANKING SYSTEMS, NOT ONE
ASSUMPTION: `capabilityCandidateMatcher`/`capabilityRanking` (this section's own
  named machinery) is what Ask already uses for its existing partial
  "related capabilities" append.
NEW CODE EVIDENCE: Ask's existing append (`executeOperation()`, pre-Phase-4)
  calls `getRelatedCapabilities` → `resolveRelatedCapabilities`
  (`capabilityRelatedResolver.ts`) -- a lighter, manifest-relationship
  scorer with no `baseScore` concept at all. `capabilityCandidateMatcher`/
  `capabilityRanking` (which DOES use `baseScore` as its `expectedValue`
  score component) is a separate system used only by a standalone Home
  Actions REST endpoint (`getCapabilitySuggestions`,
  `capabilityRecommendation.service.ts`), requiring a full
  `CapabilityRecommendationContext` (home actions feed, journeys, projects,
  personalization, completions, governance, dismissal lifecycle) that Ask's
  response-building path does not assemble today.
IMPACT: adopting the FRD-named system literally means wiring Ask into
  substantially more of the Home Actions pipeline than "a dedicated
  next-action module" suggests -- a real scope decision, not a
  confirmation.
RECOMMENDED ADJUSTMENT: put to the user directly (system-vs-system is a
  genuine architecture fork, not an implementation detail) — decided:
  adopt the FRD-named system (`getCapabilitySuggestions`) as directed,
  accepting the larger footprint. `getRelatedCapabilities`/
  `resolveRelatedCapabilities` is left untouched, still powering the
  separate, deliberate `CAPABILITY_DISCOVERY` operation's own "what can
  help me" feature (`capabilityResult()`) -- not a next-action append, so
  out of this phase's scope.

2. THE "MISSING FACT STATE" DOES NOT EXIST BY THAT NAME
ASSUMPTION: a `MISSING` fact state drives READY vs NEEDS_INFO tiering.
NEW CODE EVIDENCE: no enum/type literally named `MISSING` exists anywhere
  in the property-context/capability stack (`PropertyFactState` is
  `KNOWN|UNKNOWN|CONFLICTED|STALE`; `CapabilityReadinessState` is
  `READY|NEEDS_CONTEXT|UNAVAILABLE`). The real, already-computed
  distinction the FRD is describing is `CapabilitySuggestion.readiness.state`
  (`READY|NEEDS_CONTEXT`, `capabilityExplanationBuilder.ts`) --
  `getCapabilitySuggestions` already excludes `UNAVAILABLE` candidates from
  its own output before this module ever sees them.
IMPACT: none -- the tiering this phase needs is already fully computed
  upstream; a corrected literal reading avoided building a redundant,
  parallel tiering mechanism.
RECOMMENDED ADJUSTMENT: `askNextActions.ts` reads `readiness.state` directly
  off each `CapabilitySuggestion`; no new tiering logic written.

3. THE 'RELATED' SUGGESTION SURFACE IS DECLARED BUT HAS ZERO CALLERS
NEW FINDING (not previously flagged): `CAPABILITY_SUGGESTION_SURFACES`
  includes `'RELATED'` and `'WORKFLOW'`, both accepted by the standalone
  REST route's own Zod validation, but grep confirms neither is produced by
  any caller anywhere in the codebase today.
DECISION: adopt `surface: 'RELATED'` for Ask's next-actions call rather than
  adding a new `'ASK'` surface member -- avoids touching the shared surface
  enum, its schema, and the REST route's own validation, while still being
  semantically accurate (Ask's next actions ARE "related to what was just
  answered"). `selectionLimit()` (`capabilityRanking.ts`) only special-cases
  `HOME`'s cap at 3; every other surface (including `RELATED`) respects
  `context.limit` directly, so requesting `limit: 5` needed no ranking-side
  change.

4. "ACTIVE DECISIONTHREAD" IS NOT THIS CONTEXT'S "JOURNEYS" SOURCE
NEW FINDING: `CapabilityRecommendationContext`'s `journeys` source
  (`loadDefaultJourneys`) reads `GuidanceJourney` rows -- a materially
  different model from `DecisionThread`, and `CAPABILITY_CONTEXT_SOURCE_KINDS`
  (the enum gating `sourceContext.kind` for scoping suggestions to a specific
  source) has no `DECISION_THREAD` member at all.
IMPACT: the FRD's "consuming: ... active DecisionThread" input cannot be
  wired through the existing `sourceContext` mechanism without a real,
  separate design/schema change (a new source kind, a new context loader).
RECOMMENDED ADJUSTMENT: not attempted in this slice -- `askNextActions.ts`
  calls `getCapabilitySuggestions` with no `sourceContext`, giving broad,
  property-relevant ranking rather than goal-scoped ranking. Documented
  here as explicit, tracked follow-up (candidate for Phase 6, which is the
  phase that generalizes `DecisionThread` itself), not silently dropped.
```

**What shipped:** new `apps/backend/src/services/ask/askNextActions.ts` (`buildAskNextActionsBlock` + the pure `selectAskNextActionCapabilities`), called from `executeOperation()`'s `finalize()` in place of the old `getRelatedCapabilities`-based append. The old gate additionally required an `ASK_OPERATION_CAPABILITY` entry (excluding `GROUNDED_GUIDANCE`, which has none) and exactly `ANSWERED`/`COMPLETED` status (excluding sell/hold/rent's own common `READY_WITH_LIMITATIONS` case whenever `recommendation.confidence !== 'HIGH'`) — both removed/widened, directly closing Stage 1's two named gaps. `CapabilityListBlockSchema.capabilities`'s max raised from 3 to 5 (this section's own max-5 convention); `capabilityResult()`'s separate `CAPABILITY_DISCOVERY` feature is untouched and still slices at 3.

**Verification:** `tsc --noEmit` clean. 10 new tests in `askNextActions.test.js` — the pure selection/mapping function directly (self-exclusion of the just-answered capability, READY vs NEEDS_CONTEXT labeling, an unknown-capability-id drop, the 5-item cap) plus source-governance tests for the orchestrator's widened gate (matching this program's established convention for DB-touching functions with no mock harness — `getCapabilitySuggestions` itself is not unit-tested here for the same reason `persistCandidates`/`capturePropertyFact` aren't). A full `tests/ask/*.test.js` + `tests/unit/intelligenceRegistries.test.js` sweep (456 tests) was diffed against a `git stash`-isolated baseline run on unmodified `main`: the same 7 pre-existing failures reproduce on both (confirmed via stash-and-rerun, not assumed) — zero new regressions. **Not live-verified:** no reachable database in this environment to confirm `GROUNDED_GUIDANCE`/sell-hold-rent responses actually surface a populated, non-empty next-actions block end-to-end against a real property's data — only that the gate and mapping logic are correct by direct inspection and unit test.

**Gap closed same day, `a643a11b`, found when directly asked "is Phase 4 fully implemented" rather than assumed done:** this section's own Work line names TWO suppression mechanisms — `capabilitySuppressionPolicy.ts` AND `askSuggestionPolicy.ts`'s repeat-filter, "both apply, they suppress different things." Only the first was actually wired (it comes for free inside `getCapabilitySuggestions`'s own pipeline — verified by reading `evaluateCapabilitySuggestions`, which calls `applyCapabilitySuppressionPolicy` before ranking). The second, `suppressRepeatedAskSuggestions`, was never applied to the new `CAPABILITY_LIST` block at all — it only ever touches the flat `suggestions: string[]` field, a structurally different shape from a capability candidate list. Fixed by applying the same underlying signal (this session's own last-5-completed-turns recency) as a parallel exclusion: `executeOperation()`'s existing recency query (previously computed only inside `finalize()`, for the string-suggestion filter alone) is hoisted above `finalize` and now also selects `operationId`, mapped to each turn's owning capability via `ASK_OPERATION_CAPABILITY` — a capability completed earlier this same session is now excluded from next-action suggestions, exactly like the just-answered operation's own capability already was. One query, shared by both mechanisms, not a second DB round trip. 4 new/updated tests (13 total in `askNextActions.test.js`); same 7 pre-existing failures, zero new ones, on a fresh full sweep (459 tests). **Lesson: "is X fully implemented" is worth re-deriving from the requirement's own text line-by-line before answering yes — a plausible-sounding "shipped" status can still be missing an explicitly-named half of a two-part requirement.**

**External review round, 2026-09-13, commit `f2912e7d`: 2 more findings (1 P1, 1 P2), both verified true, both fixed.** (1) **[P1] Ranking never used the conversation's context**, exactly as reported — `getCapabilitySuggestions` was called with no `sourceContext` at all, so an unrelated question against the same property produced near-identical candidates, and the block's own description ("Ranked from this answer") overstated behavior that never existed. Fixed by deriving a real `sourceContext` from the turn's `launchContext.actionId`/`journeyId` (`deriveAskNextActionsSourceContext`, new pure function) — these are genuinely populated for any Ask session launched from a Home Action or Journey card, proven by `askOrchestrator.service.ts`'s own pre-existing `continuity` object being built from the exact same fields. This closes the "decision path" half of the finding using `getCapabilitySuggestions`'s own already-registered `HOME_ACTION`/`JOURNEY` `sourceContext` kinds — it deliberately does NOT thread literal question/answer text into ranking (no existing mechanism in `capabilityCandidateMatcher.ts` scores free text; that remains separate, larger, undone work, stated explicitly rather than silently implied fixed). The overstated description now only claims turn-specific ranking when a `sourceContext` was actually derived. (2) **[P2] Exclusions ran after the fetch limit** — `getCapabilitySuggestions` was asked for exactly `MAX_ASK_NEXT_ACTIONS` (5) candidates, then this module's own exclusion of the current + up to 5 recently-completed capabilities applied on top of that already-limited set, so a heavily-excluded response could return nothing even with real eligible candidates beyond the old cutoff. Fixed by fetching `CapabilityRecommendationContextSchema`'s own hard ceiling (10) instead of 5, giving exclusion real room before the final 5-item slice. 8 new tests (20 total in `askNextActions.test.js`); 3 pre-existing unrelated failures in `toolCapabilityRecommendation.test.js` (`CAP-405`, 2× `CAP-604`) reconfirmed via `git stash` against unmodified `main` — not introduced by this fix.

---

## 11. Phase 5 — Proactive Cozy

**Goal:** C2C can initiate useful conversations.

**Work:** generalize `notifyWithAskContinuation` (FRD §29) — widen `operationId` from its current 2-member union, build the shared wrapper eliminating the two existing callers' duplicated boilerplate. Sequence: (1) refinance monitoring, (2) maintenance — both already have working, if duplicated, callers to consolidate; (3) Home Event Radar — requires §4.5's runtime-population precondition and §4.6's scope-bug fix to be resolved first, so it lands last within this phase, not first, despite being the highest-priority target per Stage 1/2's own framing.

**Acceptance criterion:** a background signal produces one deduplicated, contextual Ask continuation the homeowner can enter and continue naturally, for all three producers, including a dismissal/already-resolved check (FRD §29's flagged **[OPEN]** item — scope this as part of the slice, not deferred silently).

**Independently releasable:** yes, per-producer, behind a flag.

**Status (2026-09-13): shipped** (`5c85ffff`, `d2b1ff15`) — `notifyWithAskContinuation` built and both pre-existing callers (refinance, maintenance) migrated onto it; Home Event Radar's `RadarNotificationDeliveryService.materialize()` wired to `createAskNotificationContinuation` directly (the lower-level primitive, not the wrapper — its own dedup and injected, narrowly-typed `db` interface don't fit the wrapper's `NotificationService.create` call shape); new `PROACTIVE_INSIGHT` presentation block, rendered in `AskWorkspace.tsx`. `tsc --noEmit` clean on both apps; `tests/ask/*.test.js` plus the three migrated callers' unit tests pass in isolation.

Four real gaps found and closed while verifying, none of them cosmetic:

1. **The feature flag this section itself names never existed.** §22's own table already listed `askProactiveContinuation` for this phase, but no such flag was anywhere in source — both pre-existing callers created continuations unconditionally. Re-deriving "is this done" from this document's own §22, not just from "does the code work," caught it. Added `askProactiveContinuationEnabled` (defaults **on** — this isn't a new, unproven capability like conversational capture; two of three producers already ran this path) gating `createAskNotificationContinuation` before any side effect, so it doubles as a kill switch for every producer at once.
2. **query-envelope's hand-authored evaluation fixture drifted from its manifest.** Adding `PROACTIVE_INSIGHT` to `allowedResultBlocks` broke `skillEvaluationRegistry.test.js`'s block-coverage check for exactly one skill — refinance/maintenance's fixtures are *derived* from their manifests automatically, but query-envelope has its own hand-authored `skill.evaluation.ts` that isn't. Fixed by updating that fixture; worth remembering query-envelope is the one skill whose evaluation package needs a matching manual edit whenever its `allowedResultBlocks` changes.
3. **A source-governance test asserted the pre-consolidation call shape.** `askGovernance.test.js`'s "material monitor notifications link to durable Ask continuations" test string-matched `createAskNotificationContinuation` and `askExecutionId:` directly inside the refinance/maintenance source files — both moved into the new wrapper as part of consolidating the callers' duplicated logic, so the test was checking for text that had legitimately moved, not a regression. Updated to check for `notifyWithAskContinuation` in the two callers and moved the `askExecutionId:` threading assertion to the wrapper file where that logic now lives once.
4. **The operation-registry's own `allowedBlockTypes` list (a separate, real gate from the skill manifest's `allowedResultBlocks` — see `askAnswerTrustValidator.ts` and `skillRegistry.ts:118`) was not updated for `REFINANCE_ANALYSIS`/`MAINTENANCE_STATUS`.** Verified this is currently harmless: `createAskNotificationContinuation` writes `resultJson` directly, bypassing the orchestrator's dispatch path (and therefore `validateAskAnswerTrustPipeline`) entirely — the persisted continuation is never validated against `allowedBlockTypes`. Left unchanged rather than widened speculatively; flagged here as a latent inconsistency worth revisiting if a continuation's execution is ever re-validated or replayed through the normal dispatch path.

**Not done as part of this phase, by design or by scope:** §4.5 (Home Event Radar runtime population) and §4.6 (the `askEnvelopeQueryScope.ts` weather-domain scope bug) were **not** re-verified or touched this phase — this phase's Radar work is confined to the notification-delivery layer (`RadarNotificationDeliveryService.materialize()`, which already had its own test coverage and a real, already-firing decision pipeline upstream of it), not the event-ingestion/matching layer §4.5/§4.6 are about. The dismissal/already-resolved mechanism is scoped exactly as narrowly as FRD §29's own **[OPEN]** item allows — `isRead`-based, single producer-agnostic check in the wrapper — "repeat reminders" and "user preferences" are explicitly not attempted. **Not live/browser-verified** — same standing caveat as every other phase in this program.

**One unrelated pre-existing red test noted, not fixed:** `skillDecisionFinancialRegistration.test.js`'s hardcoded HVAC operation list is missing `HVAC_SPECIALIST_ENGAGE` (present in `repairReplace/skill.manifest.ts` on `HEAD` before this phase's own commits, confirmed via `git stash`/re-run against unmodified `main` — this phase touched neither file).

---

## 12. Phase 6 — Long-Lived Goals / DecisionThread Expansion

**Goal:** support Job 3, starting with one vertical slice.

**Work:** generalize `DecisionThread.goalCode` beyond HVAC (FRD §21, zero schema change per §4.3); creation/resume rules using `activeIdentityKey`, not a session pointer (Stage 2's corrected design); `AskSession.activeDecisionThreadId` as a same-session cache only; context loading from the thread's structured state (`factReferences`/`assumptions`/`options`/`questions`); Seller Prep + sell/hold/rent exposure (Phase 7 dependency — sequence Phase 7's Seller Prep registration to land alongside or just before this phase's acceptance test); next-action continuity via the thread.

**Recommended first vertical slice:** "I'm thinking about selling next year." — per the request's explicit instruction not to generalize all life events at once.

**Acceptance criterion:** the selling scenario creates/attaches a `DecisionThread` without a confirmation gate (materiality carve-out, FRD §21), surfaces Seller Prep capabilities without the homeowner navigating there, and the thread resumes correctly across a new session.

**Independently releasable:** yes, behind a flag.

**Status (2026-09-13): shipped**, one vertical slice (SELL_HOLD_RENT only), behind two flags (`ASK_CONVERSATIONAL_CAPTURE_ENABLED` and the new `ASK_GOAL_CAPTURE_ENABLED`/`_KILL_SWITCH`, both default OFF). A prior session's own research pass (recorded in memory before this session started) was re-verified against current code before building anything, per this program's standing discipline — most of it held, one real correction below.

```
STAGE ASSUMPTION (prior research pass): "AskSession.activeDecisionThreadId... implying it might
  already exist from earlier Decision Platform work, but this was not verified."
NEW CODE EVIDENCE: read schema.prisma's AskSession model directly -- it had no such field. It was
  not, in fact, forward-provisioned by any earlier program (unlike Phase 3's own capture fields,
  which genuinely were).
IMPACT: a real (small, additive, nullable) schema change was needed for this phase, unlike every
  other Phase 6 primitive (DecisionThread/goalCode/the generic snapshot adapter), which needed none.
RECOMMENDED ADJUSTMENT: added `AskSession.activeDecisionThreadId String?`, a plain unenforced
  pointer (no Prisma relation), matching this schema's existing convention for same-purpose soft
  caches (e.g. `SaleReadinessItem.canonicalWorkItemId`). Confirmed, not just asserted, that nothing
  treats a stale/missing value as authoritative -- the real resumption mechanism is
  `DecisionThread.activeIdentityKey`, looked up fresh by `createOrResumeThread`'s own `selectThread`
  call every time, independent of this cache.
```

The prior pass's headline finding held exactly as stated: `sellHoldRentDecisionFamilyAdapter`
(`domainSnapshotAdapters.ts`) was already registered and already worked from real
`SellHoldRentAnalysis` rows — this phase's own code needed to *call* it, not build a recommendation
engine. Building from that reuse point kept the new code small: one 4th extraction-candidate
category (`GOAL`, `extractionCandidateSchema.ts`), one new prompt block
(`extractionContract.ts`), a `splitGoalCandidates` array-safety helper (the same
positional-index-under-compaction bug class Phase 3 already fixed once for WARRANTY links —
verified this one doesn't reintroduce it, with dedicated tests), and one new
`SELL_HOLD_RENT_GOAL_CAPTURE` `AskOperationId` processed entirely inside
`conversationalCapture.ts` (never NEEDS_CONFIRMATION, created directly as COMPLETED, per the
materiality carve-out FRD §21 states explicitly). `decisionProgressBlock`/`whyNowBlock` (already
family-generic, confirmed by reading them before reusing) were extracted out of
`askOrchestrator.service.ts` into a new shared module, `decisionThreadPresentationBlocks.ts` --
required, not optional polish: `conversationalCapture.ts` cannot import anything defined inside
`askOrchestrator.service.ts` (that file imports `conversationalCapture.ts` one-directionally, per
its own header, to dodge a CommonJS circular-import hazard), so the functions had to move to a
module both files can import.

**Real forks and gaps found and decided explicitly this phase, not silently:**

1. **"Seller Prep capabilities... without navigating there"** — confirmed no Ask Skill/operation for
   Seller Prep exists (`apps/backend/src/sellerPrep/` is a standalone REST feature only) and building
   one is real ~8-10-file Skill-registration work, explicitly named Phase 7 scope by this document's
   own §13. Chose the cheaper option the prior research pass already leaned toward: embed real,
   live `PropertySaleCase`/`SaleReadinessItem` data (via the existing, already-reviewed
   `PropertySaleCaseService.getCase`, not a new service) as an inline `GROUPED_LIST` block on the
   GOAL-capture child execution, with a "Start/Open seller prep" action link either way. This is a
   scope decision with a real, named alternative — flagged here rather than assumed, matching this
   program's own Phase 4 precedent (System-A-vs-B), though not separately put to the user this
   session given the prior pass's own research had already narrowed it to a clear proportionate
   default.
2. **The generic snapshot adapter factory silently drops `askExecutionId`** (`createOrResumeThread`'s
   own interface declares the param; `snapshotDecisionFamilyAdapter.ts`'s actual implementation
   never destructures or uses it, so no `DecisionThreadExecutionLink` audit row is ever created from
   this path — confirmed by reading the function, not assumed from the interface). Decided
   explicitly: **left as-is, not fixed this phase.** `DecisionThreadExecutionLink` is confirmed
   (schema read directly) to be supplementary audit lineage only — `activeIdentityKey` is what makes
   resumption correct, independent of this link. Fixing it would mean changing a shared factory used
   by six decision families (refinance/capital-timeline/ownership-cost/savings-benefit/
   coverage-question/sell-hold-rent), a cross-cutting change out of proportion to one vertical
   slice's own scope. Real, named, undone follow-up — not silently ignored.
3. **Whether the routed `SELL_HOLD_RENT_ANALYSIS` operation itself (a direct question like "should I
   sell, hold, or rent?") should also attach a DecisionThread on every invocation**, not just the
   GOAL-statement path. Deliberately NOT done this phase: the acceptance criterion (this section's
   own text) names only the GOAL-statement scenario, and the "one vertical slice, not every
   life-event at once" instruction argues against widening scope unprompted. `SELL_HOLD_RENT_ANALYSIS`
   itself is completely untouched by this phase's code.

**Verified, not assumed, before building:** `SELL_HOLD_RENT_ANALYSIS` (the routed operation) has no
`askDomainCommandRegistry.ts` entry and is `safetyClass: 'MATERIAL_DECISION'`/family `DECISION_ANALYSIS`,
not `COMMAND` — it was never confirmation-gated to begin with, independent of anything this phase
built. `SELL_HOLD_RENT_GOAL_CAPTURE` (the new operation) deliberately uses `safetyClass: 'STANDARD'`,
unlike the three `CAPTURE_*_CONFIRM` operations' `MATERIAL_DECISION` — this is the materiality
carve-out's own point, made visible in the registry, not just in prose.

**Registry/governance surface touched, mirroring the exact ritual the three `CAPTURE_*_CONFIRM`
additions established** (and learning directly from that program's own production incident,
`project_ask_cozy_stage3_frd_implementation_plan.md`'s memory entry): new `AskOperationId` literal +
`ASK_OPERATION_DEFINITIONS` entry (70→71); a defensive, never-routed propose-time
`registerCapabilityHandler` stub; `KNOWN_UNGOVERNED_OPERATIONS` carve-out added
**proactively this session**, before any deploy, rather than discovered via a crashloop again;
required entries in all `Record<AskOperationId, ...>` calibration maps (`askOperationSemanticPackages.ts`'s
`jobs`/`positives`/`negatives`/`answerPositives`/`answerNegatives`, `askTrustCertificationCorpus.ts`'s
`ASK_CERTIFIED_DIRECT_ANSWERS`) — `tsc --noEmit` catching every missing required key was the actual
completeness proof, not a manual checklist. `tests/unit/intelligenceRegistries.test.js` run explicitly
(green) before considering this done, per that program's own standing lesson. No entry added to
`askDomainCommandRegistry.ts` or `confirmCapabilityHandlerRegistry.ts` — deliberate, since this
operation is never confirmation-gated (those two registries' own counts, 28, are unchanged).

**Verification discipline applied:** `npx tsc --noEmit` clean on `apps/backend`, `apps/frontend`, and
`apps/workers` (the last needed its own `npm run prisma:generate` re-sync, per this repo's own
established workers-Prisma-client convention). New targeted unit tests added
(`extractionCandidateSchema.test.js`: GOAL schema acceptance/rejection + two `splitGoalCandidates`
array-index-remap cases, mirroring the exact bug class Phase 3 already found once for WARRANTY
links) and passing. Existing `conversationalCapture.test.js`/`askGovernance.test.js`/
`capabilityHandlerRegistry.test.js`/`confirmCapabilityHandlerRegistry.test.js` all re-run individually
and green, including two source-governance regex tests updated for this phase's own refactor
(a renamed variable, a restructured transaction boundary) rather than weakened. Per-file sweep (not
a combined glob, per this program's own standing note that a full-glob run produces resource-contention
false failures) surfaced two pre-existing, unrelated failure clusters, both confirmed via `git stash` +
re-run against unmodified `main` before being ruled out as this phase's own regressions: (a) a
whole-file `ReferenceError: Cannot access 'propertyFacts' before initialization` TDZ crash in
`extractionCandidateSchema.test.js` and `extractionContract.test.js` when run standalone (reproduces
identically on `main`; a circular-import module-load-order fragility in `capturePropertyFact.ts`,
unrelated to this phase's own GOAL-category addition — confirmed the new schema/helper logic itself
is correct via a throwaway script that pre-warms the same module graph a different way); (b) the
previously-named `askRoutingCalibration`/`askTrustArchitecture`/`askLaunchContextCapability` cluster
(also reproduces on `main`, with different exact numeric assertions since those counts scale with
total operation count — the failures themselves, not just the numbers, are pre-existing). Neither
cluster was touched or fixed -- both are real, standing, out-of-scope repo issues, not newly
introduced.

**Not done, stated plainly:** not deployed or browser-verified (both flags default off, no live
end-to-end conversation run against a real Gemini key or database); no `npx prisma db push` run
(the user's own manual step, per this program's standing convention — the only schema change is the
single additive, nullable `AskSession.activeDecisionThreadId` field); `REFINANCE_OPPORTUNITY`
already has its own registered `DecisionFamilyAdapter` (confirmed by reading
`decisionFamilyAdapterRegistry.ts`) but is deliberately not wired to GOAL capture this slice, per
the "one vertical slice" instruction — real, easy, named follow-up work for whoever picks up a
second goal type; the full Seller Prep Ask Skill (fork #1 above) remains Phase 7 scope, not started.

---

## 13. Phase 7 — Additional Capability Exposure

Only after Phases 1–2 prove stable (the request's own §36 criterion) — **softened this revision:** an earlier draft required "production use, not just tested" as this phase's gate. That specific bar is this document's own addition, not the request's: the request's §36 asks only that "the core architecture proves stable," and its own §41 states there are currently no production users at all, which a hard production-use gate sits awkwardly against. Demonstrated stability under this program's own test/eval suites (§23/§24) is the actual gate; a genuine production rollout, once users exist, only strengthens that signal rather than being required to reach it. Candidates, prioritized by the Three Jobs (Stage 1/2), not code availability: Seller Prep (needed by Phase 6, effectively co-scheduled), Home Event Radar query capability (blocked on §4.5/§4.6), Home Renovation Advisor (blocked on §4.2's naming-ambiguity resolution — do not wire until resolved), coverage/insurance, personalization-supported ranking (explicitly deferred per Stage 2 §23 — core next-actions works without it), documents, additional maintenance intelligence.

---

## 14. Vertical Slice Definition

Every slice in every phase above is specified against this template — restated once here rather than per-slice, to keep this document from ballooning past what the FRD already covers:

```
User outcome | Code areas touched | Schema changes | API changes | Frontend changes |
Backend changes | Events | Feature flags | Tests | Evaluation corpus | Acceptance criteria |
Rollback approach | Dependencies
```

Phase 3's "capture a retrospective home event" slice, filled in as a worked example:

| Field | Value |
|---|---|
| User outcome | "I replaced my roof last summer for $14,500" becomes confirmed, queryable home knowledge |
| Code areas touched | `services/ask/conversationalUnderstanding/` (new), `askOrchestrator.service.ts` (extraction-trigger call site only), `modules/propertyContext/` (HomeEvent writer, new function) |
| Schema changes | `HomeEvent.providerName`, `HomeEvent.warrantyId` (unused this slice, added for §17 completeness), `HomeEvent.captureChannel`/`attribution`/`extractionConfidence`, `AskExecution.parentExecutionId` |
| API changes | No new endpoint — extraction is server-internal to the existing turn endpoint. The response *contract* does change (this slice is what first populates `childExecutions`, §18/§19), but that's tracked there, not as a new API surface. |
| Frontend changes | The `CAPTURE_EVENT_CONFIRM` child execution arrives via the routed turn's `childExecutions` field (§19, decided this revision) and is spread into `AskWorkspace.tsx`'s flat `executions` state in `ask()`; it then renders the existing `confirmation` field exactly like any other execution (no new block type, per FRD §14/§28, and no new rendering code — §19) |
| Backend changes | Pre-filter, extraction call, candidate-set persistence, `HomeEvent` upsert writer |
| Events | `ASK_EXTRACTION_REQUESTED` (new `DomainEventType` member) |
| Feature flags | `askConversationalCapture` |
| Tests | Unit: pre-filter, candidate schema validation. Integration: message→extraction→candidate, candidate→confirm→event write, retry-under-reclaim |
| Evaluation corpus | FRD §15's event-capture-relevant categories |
| Acceptance criteria | Phase 3's stated criterion, scoped to this one message |
| Rollback approach | Flag off — extraction never triggers, existing routed behavior unaffected |
| Dependencies | Phase 1 (capability layer, if the routed half of a compound message is involved), Phase 2 (confirmation) |

---

## 15. Dependency Graph

See §3. Additional detail: Phase 4 (Next Actions) depends on Phase 1 (needs the capability registry to scan) but **not** on Phase 3 (extraction) — it can be built and demonstrated against existing routed operations alone, then automatically benefits once Phase 3 adds capture-confirm operations to the registry.

**New this revision:** Phase 3's async-fallback delivery has a partial, previously-unstated dependency on Phase 5 (§9) — the synchronous capture path and the write itself have no such dependency, only the proactive-notification half of the fallback case does. This does not block Phase 3 from shipping before Phase 5 (the fallback write is still safe and eventually visible per §9), it only means the *fully delivered* async-fallback experience isn't complete until Phase 5 lands too.

---

## 16. Parallel Work Opportunities

- **Phase 1 (Capability Invocation) and the extraction evaluation harness (part of Phase 3)** may proceed independently — one is a backend dispatch refactor, the other is a corpus-and-metrics build with no code dependency on the registry. Verified: the extraction pre-filter and candidate-schema work touch none of the files Phase 1's migration touches.
- **§4.2/§4.6/§4.7's Phase 0 decisions** can be made in parallel with each other (different subsystems: `GroundedAskProposal` kinds, envelope scope bug, HVAC confirmation registry) — none blocks resolving the others.
- **Phase 5's three producers** (refinance, maintenance, Home Event Radar) can be built in parallel once the shared `notifyWithAskContinuation` wrapper exists, since each producer's migration is independent of the others.

---

## 17. Schema Change Inventory

Consolidated from Stage 2's final (four-times-corrected) inventory, re-verified in this pass where flagged:

| Field | Model | Verified this pass? |
|---|---|---|
| `providerName: String?` | `HomeEvent` | Carried from Stage 2, not re-verified this pass (no new evidence contradicts it) |
| `warrantyId: String?` (FK → `Warranty`) | `HomeEvent` | Carried from Stage 2 |
| `captureChannel` | `PropertyFactEvidence`, `HomeEvent` | Carried from Stage 2 |
| `extractionConfidence: Float?` | `PropertyFactEvidence`, `HomeEvent` | Carried from Stage 2 |
| `attribution` | `PropertyFactEvidence`, `HomeEvent` | Carried from Stage 2 |
| `captureExecutionId: String?` + `@@unique([propertyId, factKey, captureExecutionId])` | `PropertyFactEvidence` | Carried from Stage 2 (its third-round correction) |
| `sourceExecutionId: String?` + `@@unique([propertyId, sourceExecutionId])` | `Warranty` | Carried from Stage 2 |
| `parentExecutionId: String?` (self-FK) | `AskExecution` | Carried from Stage 2 |
| `linkedExecutionId: String?` (self-FK) | `AskExecution` | Carried from Stage 2 (bidirectional per its fourth-round correction) |
| `activeDecisionThreadId: String?` | `AskSession` | Carried from Stage 2 |
| New `AskOperationId` values (`CAPTURE_FACT_CONFIRM`, `CAPTURE_EVENT_CONFIRM`) | — | **Verified this pass: zero schema change needed** (§4.3) |
| New `DecisionThread.goalCode` values | — | **Verified this pass: zero schema change needed** (§4.3) |
| Two new `DomainEventType` enum members (`ASK_EXTRACTION_REQUESTED`, `ASK_CAPTURE_LINK_RECONCILE`), taking the enum from 14 to 16; `EmitDomainEventInput.type` widened from its current 9 members to the full set (16, once this program's 2 additions land — the pre-existing 9→14 gap and this program's 14→16 addition are the same widening edit, done once) | `DomainEvent` (Prisma enum) | **New finding this pass** (§4.4) — the enum itself needs 2 new members; the emitter's TS type is separately missing 5 pre-existing (refinance) members regardless of this program, a gap this program's additions would otherwise compound rather than fix |

**Per the request's instruction:** this is documentation only. No migration script. Schema edits go directly into `prisma/schema.prisma` when implementation begins; applying them to any database (local or otherwise) is the user's own step, not part of this plan or any future implementation session's automatic responsibility.

---

## 18. API Change Inventory

No new public API endpoints — extraction and next-action generation are internal to the existing `POST /api/ask/executions` turn lifecycle. The one surface change: `submitAskCapture`/`confirmAskExecution`-equivalent calls now also apply to the `CAPTURE_FACT_CONFIRM`/`CAPTURE_EVENT_CONFIRM` operation family, using existing endpoint shapes. **Response contract change (decided this revision, §19):** `AskExecutionResponseSchema` (`ask.contract.ts:495-529`) gains `childExecutions: AskExecutionResponse[]` (max 3, one level deep, no further nesting) — an additive field on the existing `POST /api/ask/executions` response, not a new endpoint or a breaking change to any existing field.

---

## 19. Frontend Change Inventory

**[FACT — this pass]** `AskWorkspace.tsx`'s `BlockView` is a single 1707-line function with an inline `if (block.type === 'X')` chain — no per-block component split. Changes required: one new `if` branch for `PROACTIVE_INSIGHT` (mirrored in `apps/frontend/src/features/ask/types.ts`); **no change needed for confirmation rendering itself** (the existing `confirmation` field's renderer, already exercised by 25 commands, is reused as-is per FRD §14/§28's correction — this removes what would otherwise have been a second new-block frontend change).

**Child-execution delivery — decided this revision (FRD §16/§28, no longer [OPEN]):** rendering was never the gap; *discovery* was. **[FACT — this pass]** `ask()` (`AskWorkspace.tsx:1435`) appends exactly one execution — `response.data` — to state, and `updateExecution` (`:1532`) only replaces the entry whose `executionId` already matches; neither had any way to learn a turn also created a *separate* child `AskExecution` for a captured candidate.

**Decision:** `AskExecutionResponseSchema` gets a new field, `childExecutions: z.array(AskExecutionResponseSchema_NoChildren).max(3).default([])` — bounded exactly like the existing `captureRequests: z.array(...).max(3)` precedent, each entry a **full** `AskExecutionResponse` object (not a thin summary), with its own `childExecutions` fixed at `[]` by construction (one level of nesting only — a captured candidate cannot itself spawn a further nested candidate inline, matching Stage 2's own decision not to allow arbitrarily deep candidate chains, and sidestepping unbounded recursive-type definition). This is a real, additive schema change — §14/§16's "zero new schema" claim is now scoped correctly to mean "the confirmation-card mechanism itself needs no new block type," not "the response contract needs no change at all."

**Full contract, addressing discovery/render/edit/refresh in one place:**
- **Discovered:** for a synchronous capture (the common case — extraction completes within the turn's ~1.5s budget), the candidate's child `AskExecution` is embedded directly in `childExecutions` on the *same* turn response that triggered it — no separate fetch. For the async-fallback case (§9), the child is not embedded anywhere (the original response already returned) — see §9's explicit acceptance-scope carve-out for that path.
- **Rendered:** `ask()`'s existing `setExecutions` call is extended one line — `setExecutions((current) => [...current, response.data!, ...(response.data!.childExecutions ?? [])])` — after which each child is an ordinary entry in the flat `executions` array, rendered by whatever per-execution bubble/loop already renders every other execution today. `ConfirmationCard` and `BlockView` need **no changes**: they already operate per-`executionId`, agnostic to whether that execution arrived as the "main" response or via `childExecutions`.
- **Edited (before confirm):** a child's own `captureRequests`/`suppliedInput` mechanism (FRD §22, existing) applies identically to any other execution — nothing child-specific to add.
- **Refreshed after confirmation:** `ConfirmationCard.confirm()`'s existing `onCompleted(response.data)` → `updateExecution` (`:1532`) already matches by `executionId` and replaces in place. Because the child's real `executionId` is now present in the flat `executions` array (from the line above), this **already works unmodified** once the schema field lands — no new refresh path needed.

Net frontend diff: one schema field, one line in `ask()`. Everything else in the existing confirm/render/edit path is reused exactly as-is.

---

## 20. Backend Change Inventory

Summarized by phase — full detail per-slice in §14's template, per-operation in §5:

| Phase | New backend modules/files | Modified existing files | New Prisma fields (see §17) |
|---|---|---|---|
| 1 | `services/ask/capabilityInvocation/` (envelope type, registry, `capability.invoke()`), one shim file per operation family | `askOrchestrator.service.ts` (propose-time dispatch `switch`, lines 6137-6234, replaced incrementally), `domainEvents.service.ts` (`EmitDomainEventInput.type` widened) | None |
| 2 | `services/ask/captureConfirmation/` (new operation-family handlers), `services/ask/captureLinkReconciliation.ts`, one confirm-time handler per confirmation-required operation (§4.9, new this revision) | `groundedAsk.service.ts` (kind-by-kind migration), `capturePropertyFact.ts` (idempotency check), `modules/propertyContext/application/` (`HomeEvent`/`Warranty` writers), `askOrchestrator.service.ts` (confirm-time dispatch chain, lines 8285+, replaced incrementally — §4.9) | `PropertyFactEvidence.captureExecutionId`, `Warranty.sourceExecutionId`, `AskExecution.parentExecutionId`/`linkedExecutionId`, `HomeEvent.providerName`/`warrantyId`, `captureChannel`/`attribution`/`extractionConfidence` on `PropertyFactEvidence` and `HomeEvent` (**corrected this revision** — these three columns are added here, in Phase 2, because the new confirm operation family writes them for every capture regardless of source; see Phase 2's Work, §8) |
| 3 | `services/ask/conversationalUnderstanding/` (pre-filter, extraction call, candidate-set persistence), `capturePropertyFinancingFact` (§9's full atomicity/idempotency contract, new this revision — modeled directly on `capturePropertyFact.ts:283-311`'s transaction shape, not a bypass of it) | `askOrchestrator.service.ts` (one new call site) | None new — Phase 3 is the first to write non-trivial `attribution`/`extractionConfidence` values into the columns Phase 2 already added, not a new column itself. No change needed to `prismaAssemblers.ts`'s financing assembler (verified §9 — its existing `evidence.get(key) ?? mortgageEvidence` fallback already prefers real evidence). |
| 4 | `services/ask/nextActions/` | `askOrchestrator.service.ts` (removes static suggestion tables) | None |
| 5 | `services/notifications/notifyWithAskContinuation.ts` | `maintenanceReminder.service.ts`, `refinanceRateMonitor.service.ts` (both simplified to call the new wrapper), `modules/homeEventRadar/` (notification path migrated to the `DomainEvent` rail) | None |
| 6 | None new — extends `DecisionThread` usage | `askOrchestrator.service.ts` (goal-candidate routing), `AskSession` read/write sites | `AskSession.activeDecisionThreadId` |
| 7 | Per-capability, scoped when each is exposed | Per-capability | None anticipated |

---

## 21. Event/Worker Changes

Two new `DomainEventType` members and their consumer handlers in `processDomainEvents.job.ts`'s existing per-type switch: `ASK_EXTRACTION_REQUESTED` (Phase 3) and `ASK_CAPTURE_LINK_RECONCILE` (Phase 2). Both follow the existing lease-claim/attempt-count/dead-letter pattern already established for the other 12+ event types — no new poller, no new consumer architecture.

---

## 22. Feature Flags

| Flag | Gates | Removal criterion |
|---|---|---|
| `askCapabilityInvocationV2` | Phase 1's registry-based dispatch (per-operation, can be enabled incrementally per §5's migration order) | Remove once every operation (the confirmed complete set per §4.8) is migrated and the old switch is deleted |
| `askConfirmationConvergence` | Phase 2's new operation family + `GroundedAskProposal` retirement | Remove once all 7 kinds have parity and the old proposal path is deleted |
| `askConversationalCapture` | Phase 3's pre-filter/extraction | Remove once pilot thresholds (FRD §15) are cleared in production and the flag has been at 100% for one full release cycle |
| `askContextualNextActions` | Phase 4 | Remove once next-action generation is the only path (no fallback to static strings remains) |
| `askProactiveContinuation` (implemented as `ASK_PROACTIVE_CONTINUATION_ENABLED` / `_KILL_SWITCH`, defaults **on**) | Phase 5, all three producers at once (`createAskNotificationContinuation` itself, not per-caller) | Not a migration gate to retire — this is a standing kill switch, kept indefinitely, for instantly stopping Ask continuations without a redeploy |
| `askDecisionThreadGoals` (implemented as `ASK_GOAL_CAPTURE_ENABLED`/`_KILL_SWITCH`, on top of the already-existing `ASK_CONVERSATIONAL_CAPTURE_ENABLED` this pipeline shares with Phase 3 — both must be on) | Phase 6, GOAL candidate processing (SELL_HOLD_RENT only this slice) | Remove once the selling vertical slice is stable and a second goal type is added |

No flags for trivial internal refactors (e.g., the `DomainEventType` widening in §4.4 ships unflagged, since it's additive and backward-compatible).

---

## 23. Test Plan

**Unit:** pre-filter, candidate schemas, capability shims (one per §5 row, prioritizing Simple rows for a shared test pattern), next-action ranking, idempotency helpers (the `captureExecutionId`/`sourceExecutionId` create-then-catch-conflict pattern, the claim-token re-verification).

**Integration:** message→route→capability; message→extraction→candidate; candidate→confirm→fact write; candidate→confirm→event write; `DomainEvent`→proactive Ask continuation. Reuse the existing `.db.test.js` convention (`apps/backend/tests/integration/`) — three precedents already exist for exactly this shape of test (`askOrphanedRunningReclaim.db.test.js`, `askRetentionExecutionPurge.db.test.js`, `phase4TrustCadenceGroundedAsk.db.test.js`).

**End-to-end** (10, per the request):
1. "What needs my attention?"
2. "Should I refinance?"
3. "I replaced my roof last summer for $14,500."
4. "I serviced the HVAC yesterday for $275. Was that fair?"
5. "Is my roof at risk because of the storms?" (blocked on §4.5/§4.6)
6. "I'm thinking about selling next year."
7. Correction scenario (§8.7 of the FRD)
8. Duplicate retry scenario (the lease-reclaim race, FRD §22)
9. Permission-loss scenario (property access revoked between proposal and confirmation)
10. Async extraction fallback scenario (inline timeout → outbox pickup)

---

## 24. Evaluation Plan

Extends existing infrastructure — **[FACT — this pass]** 48 existing `.test.js` files under `apps/backend/tests/ask/`, 3 DB-integration tests, `askRoutingQualityEvaluator.ts` (exercised by `askRoutingCalibration.test.js`), and `askTrustCertificationCorpus.ts` (a hand-labeled, categorized, frozen fixture set). New suites: extraction trigger (pre-filter recall/precision), extraction accuracy (FRD §15's full metric table), context selection, next actions, trust (existing trust-validation tests extended for the new operation family), proactive deduplication. Pilot release gate: FRD §15's thresholds cleared against the new corpus, not conventional unit tests alone.

---

## 25. Risks

**High-risk (sequence first, per the request's explicit risk-based ordering):** write confirmation correctness (Phase 2's entire purpose, now including the confirm-time dispatch migration found this revision, §4.9), idempotency under lease-reclaim races (Stage 2's fourth-round finding — genuinely subtle, needs dedicated race-condition tests, §23), extraction accuracy (no amount of architecture fixes a poorly-calibrated pre-filter), event/fact classification (a `GOAL` misclassified as a `FACT` creates the wrong kind of record), async retry races (the shared-lease-ownership contract, Stage 2's third-round finding), authorization (re-check at confirmation completion, not just proposal time), handler migration (67 operations documented and confirmed complete against the registry per §4.8, 2 genuine structural outliers found this pass that Stage 2 didn't know about, plus a second dispatch surface for the 25 confirmation-required operations found this revision, §4.9), child-execution delivery for captured candidates (§19 — decided, an in-turn `childExecutions` schema field; risk here is implementation fidelity, not an open design question), the Phase 3 mortgage-rate example's writer and its atomicity/replay-ordering contract (§9 — small but previously unscoped, and the ordering itself needed a correction after this document's first draft of it).

**Lower-risk (sequence later):** visual block additions (reduced from two to one after this pass's `FACT_CONFIRMATION` finding), suggestion text, additional capability exposure (Phase 7).

---

## 26. Rollback Strategy

Every phase behind a flag (§21) except Phase 0 (research, no code) and the `DomainEventType` widening (additive, non-breaking). Rolling back any phase disables its flag; no phase's rollback requires a data migration, since every new field is additive and every new write path is gated behind its own operation family that simply stops being invoked when its flag is off.

---

## 27. Definition of Done

The program is complete when all seven tests from the request pass together, plus the two this plan adds given this pass's findings:

- **Test A:** "I replaced my roof last summer for $14,500." → candidate event → confirmation → persisted home knowledge → future Ask turn sees it.
- **Test B:** "Should I refinance?" → existing deterministic capability → personalized answer → contextual next actions.
- **Test C:** "I serviced my HVAC yesterday for $275. Was that too expensive?" → decision response + event capture → no duplicate extraction.
- **Test D:** "Is my roof at risk because of recent storms?" → property + weather/radar intelligence (blocked on §4.5/§4.6 being resolved).
- **Test E:** "I'm thinking about selling next year." → durable goal → relevant capabilities → continued conversation across sessions.
- **Test F:** Background signal → one contextual proactive Ask continuation.
- **Test G:** New capability added → registry/shim registration → no new orchestrator domain branch, **covering both dispatch surfaces (corrected this revision, §4.9)**: neither the propose-time registry (Phase 1) nor the confirm-time registry (Phase 2) gains a new `askOrchestrator.service.ts` branch when a new confirmation-required capability is added.
- **Test H (added this pass, relabeled this revision):** the `DomainEvent`-backed **extraction job's** candidate-set persistence — not the `AskConfirmationReceipt` confirmation saga, which is a separate mechanism with its own, already-correct lease pattern — whose claim is reclaimed mid-flight while the original attempt is still running does not persist the stale attempt's result once its claim token has moved on (FRD §22, Stage 2's fourth-round correction — this is the one race condition subtle enough to deserve its own named acceptance test, not just inclusion in "idempotency works").
- **Test I (added this pass):** All 7 `GroundedAskProposal` kinds — including `UPLOAD_EVIDENCE` and `ADD_NOTE`, whose target representations this pass found were not yet decided — have passing parity tests before the old mechanism is deleted.

---

## 28. Recommended First Implementation Slice

**What is the smallest first implementation slice that proves the new Ask Cozy architecture without introducing unnecessary scope?**

**Answer:** Phase 2's acceptance criterion, taken literally as the first slice: **a synthetically-created candidate fact — not yet reachable from any real conversation — confirmed through the new `AskConfirmationReceipt`-based `CAPTURE_FACT_CONFIRM` path, persisted to `PropertyFactEvidence` with its new idempotency fields, and visible on the next aggregation-context read.** No extraction, no pre-filter, no LLM call — the candidate is created directly by a test harness or an internal debug endpoint, exercising exactly the chain the request itself names as the best first proof point: *one conversationally captured fact + canonical confirmation + persistence + future-context reuse* — with "conversationally captured" deliberately faked at this stage so the slice isolates write-path correctness from extraction-quality risk entirely.

**Why this is the best first proof point:** it validates the two hardest, highest-risk pieces of the entire program — the capability-invocation layer's new operation family and the confirmation saga's replay/idempotency correctness (§25's top risks) — using zero LLM involvement, so a failure is unambiguously an architecture bug, not a prompt-quality problem. It requires no schema beyond what Phase 2 already needs for real capture, so nothing here is thrown away once Phase 3 adds the real trigger. And it's a complete, demonstrable vertical slice on its own — "the fact exists, was confirmed once, and Cozy remembers it next turn" — not a fragment of a larger feature, satisfying the implementation-philosophy requirement (§2) that every slice deliver a coherent capability rather than partial infrastructure with nothing to show for it yet.

Building the whole conversational system first, or starting with extraction before the write path is proven safe, would put the least-tested, highest-variance component (an LLM call) in front of the most safety-critical one (a material write) — exactly backwards from the risk-based ordering this plan follows throughout.
