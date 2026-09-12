# Ask Cozy — Message-First Functional Requirements Document (Stage 3, Part A)

**Type:** Functional/technical requirements. No implementation, no schema edits, no migrations in this document.
**Baseline:** `docs/architecture/ASK_COZY_CONVERSATIONAL_ARCHITECTURE_AUDIT.md` (Stage 1) and `docs/architecture/ASK_COZY_TARGET_PRODUCT_AND_ARCHITECTURE.md` (Stage 2, four external-review-corrected revisions, `main@9f667ecb`). Stage 2's decisions are treated as approved baseline per this stage's brief — **not re-litigated** except where fresh code verification in this pass produced evidence Stage 2 didn't have, flagged inline as:
```
STAGE 2 ASSUMPTION → NEW CODE EVIDENCE → IMPACT → RECOMMENDED ADJUSTMENT
```
Two such adjustments are formatted this way directly in this document (§14, §16); two more appear in the companion implementation plan (`docs/architecture/ASK_COZY_INCREMENTAL_IMPLEMENTATION_PLAN.md` §4.1, §4.4); one more (the `GroundedAskProposal.kind` mapping gaps) is presented as a table rather than this format, in §23 below and implementation plan §4.2 — all five are evidence-backed, none speculative.
**Labeling convention (continued from Stage 2):** **[FACT]** verified in Stage 1/2 or this pass's fresh code reading; **[REQUIREMENT]** a Stage 3 functional/technical requirement (not a finding); **[OPEN]** a question this pass could not resolve and flags for the implementation plan or Phase 0.

---

## 1. Executive Summary

Ask Cozy is becoming ContractToCozy's primary conversational front door: a homeowner should be able to ask a decision question, report something that happened, state a plan, or issue a command in ordinary language, and have the system understand, retrieve relevant context, act through existing domain capabilities, and — when the message contains new information about the home — capture it as durable, confirmed knowledge that improves every future interaction.

**What changes for homeowners:** they gain a conversational path to information capture that exists today only through forms (§6.2), decision answers get contextually-relevant next steps instead of static suggestion text (§27), and background detections (a rate drop, a hazard) can start a conversation instead of only a notification (§29).

**What changes architecturally:** a bounded extraction step runs alongside deterministic routing (§12); domain dispatch moves out of the orchestrator into a real capability-invocation layer (§16); `AskConfirmationReceipt` becomes the one confirmation mechanism instead of two unequal ones (§22); `DecisionThread` generalizes from HVAC-only to any long-lived homeowner goal (§30).

**What does not change:** deterministic routing (regex → local classifier), the domain decision engines (refinance, HVAC), `AskPresentationBlock`'s existing ~24 variants, `PropertyFactEvidence`/`HomeEvent`/`PropertyChange` as the durable knowledge models, and the principle that structured UI remains the review/correction surface for anything conversation creates (§33).

> Conversation becomes a first-class interface for both requesting intelligence and supplying home information, while structured domain models remain the source of truth.

---

## 2. Product Goal

Per Stage 2 §33: the smallest coherent architecture that lets Ask Cozy become the conversational front door without discarding working domain intelligence. This FRD converts that architecture into requirements a team can build and test against.

---

## 3. Product Principles

Adopted unchanged from Stage 2 §5 (all 14 principles, ACCEPT/MODIFY verdicts as decided there). Restated as the two principles most load-bearing for this FRD's requirements:

1. **[REQUIREMENT]** Conversation invokes capabilities and proposes knowledge; it never becomes the system of record. Every conversational write lands in an existing domain model (`PropertyFactEvidence`, `HomeEvent`, `Warranty`, `DecisionThread`) via the confirmation path (§22) — never a conversation-only store.
2. **[REQUIREMENT]** A capability added after this program lands must not require a new dispatch branch inside `askOrchestrator.service.ts` (Stage 2's Test 8, restated as Definition of Done Test G in the implementation plan).

---

## 4. Scope

In scope: conversational understanding/extraction (§9–§15), the capability invocation layer (§16), confirmation convergence (§22–§23), knowledge capture for facts/events/warranties/goals (§18–§21), contextual next actions (§27), proactive continuation generalization (§29), and the specific pilot capabilities in §31 (Home Event Radar, refinance as reference, Seller/life-event, personalization deferral).

---

## 5. Non-Goals

**[REQUIREMENT]** This program does not: replace deterministic routing with an LLM classifier; build a provider marketplace or new service-provider integrations; create a new universal knowledge database; build a specialized agent per domain (only the existing HVAC specialist agent remains, per Stage 2 §25's four-part test); redesign traditional UI pages beyond the smallest addition needed for review/correction of new conversational writes (§33); or achieve perfect extraction accuracy before pilot (§15 defines pragmatic thresholds instead).

---

## 6. Primary User

**[FACT — Stage 2]** Homeowner. The behavioral requirement: a homeowner should not need to know C2C's module/navigation structure to get value — they express a question, concern, completed action, plan, goal, or instruction in ordinary language, and the system resolves which capability or capture path applies.

---

## 7. Core Interaction Model

```
Homeowner → Message/Document/Action → Ask Cozy
  → Understand intent + information
  → Retrieve relevant home context
  → Invoke C2C capabilities
  → Respond
  → Capture new information
  → Confirm material changes
  → Persist structured home knowledge
  → Update C2C context
  → Recommend logical next actions
  → Continue conversation
```

Each arrow maps to a concrete mechanism defined in §10 (turn processing contract) and is not a new abstraction — it composes deterministic routing (unchanged), the new extraction path (§9–§13), the capability layer (§16), the confirmation saga (§22), and next-action generation (§27).

---

## 8. User Stories

### 8.1 Ask a decision question
> "Should I refinance?"

**[REQUIREMENT]** Understand refinance intent (deterministic routing, unchanged — `REFINANCE_ANALYSIS` at 0.97 confidence per Stage 1's traced example) → retrieve mortgage/property/rate context (existing aggregation context, unchanged) → invoke `refinance.analysis` via the capability layer (§16) → return the decision-oriented answer with existing `NOT_APPLICABLE`/`NEEDS_CONTEXT`/`UNAVAILABLE` degradation states (**[FACT — Stage 1]**, already reference-quality) → expose missing context via existing `captureRequests` slot-filling → recommend next actions (§27).

### 8.2 Report something that happened
> "I replaced my roof last summer for $14,500."

**[REQUIREMENT]** Pre-filter fires (§11) → extraction identifies one `EVENT` candidate with `datePrecision: RANGE` (not a fabricated month — Stage 2 §14 correction) → candidate becomes a `CAPTURE_EVENT_CONFIRM` child execution in `NEEDS_CONFIRMATION` status → homeowner confirms → `AskConfirmationReceipt` saga executes the idempotent `HomeEvent` upsert (§22) → future turns see the fact via the existing aggregation-context read path, unchanged.

### 8.3 Combined statement + question
> "I serviced the HVAC yesterday for $275. Was that too expensive?"

**[REQUIREMENT]** Deterministic routing resolves the cost/fairness question to whatever capability answers it (existing or a Stage 3 gap to confirm in Phase 0 — **[OPEN]**: no `AskOperationId` was found in the handler inventory (§16, full detail in the implementation plan §5) that answers "is this price fair" directly; if none exists today, this scenario's *answer* half degrades to `GROUNDED_GUIDANCE` while the *capture* half still succeeds — both halves are independently testable and neither blocks the other, so this gap does not block the capture requirement). Independently, the pre-filter fires and extraction proposes the service-event candidate — but only for fields the routed operation's own bounded regex extractor didn't already consume this turn (Stage 2's dedup rule), so a routed `MAINTENANCE_TASK_COMPLETE` that already captured `actualCost` does not also get a duplicate general-extraction candidate for the same cost.

### 8.4 External/contextual intelligence question
> "Is my roof at risk because of the storms?"

**[REQUIREMENT]** Depends on two Phase 0 fixes being complete first (both detailed in §31): the `askEnvelopeQueryScope.ts` domain-mapping fix (confirmed still present) and confirmed/established Radar data for the property in question (Stage 1/2 never verified this was populated; this pass confirmed the seed script creates none). Once both hold: property + weather/radar context assembles via `queryIntelligenceEnvelope` (existing, unchanged) → grounded answer with `EVIDENCE`/`WHY_NOW` blocks (existing block types, unchanged) → honest `MISSING`/`LIMITATION` blocks where data isn't available → next actions.

### 8.5 Life-event / goal statement
> "I'm thinking about selling next year."

**[REQUIREMENT]** Pre-filter fires on a goal pattern → extraction produces a `GOAL` candidate → per Stage 2 §17's materiality carve-out, `DecisionThread` creation/attachment happens **without** a confirmation gate (it's workflow bookkeeping, not durable knowledge — Stage 2's own correction) → `AskSession.activeDecisionThreadId` cache set, canonical resolution via `DecisionThread.activeIdentityKey` (Stage 2 §17) → next-action scan biased toward the active thread surfaces Seller Prep/sell-hold-rent capabilities (§26) without the homeowner needing to know either exists.

### 8.6 Proactive interaction
> Mortgage rates become favorable.

**[REQUIREMENT]** `DomainEvent` (existing outbox, unchanged) → per-domain relevance evaluation (existing, per-domain, unchanged per Stage 2 §20) → `notifyWithAskContinuation` (generalized wrapper, §29) → pre-loaded `AskExecution` the homeowner opens with context already assembled.

### 8.7 Correction
> "Actually, the roof was replaced in 2023, not 2024."

**[REQUIREMENT]** Detected as a `CORRECT_FACT`-shaped candidate (existing `GroundedAskProposal.kind` semantics migrate onto the new operation model per §23) → proposed change shown via the existing `confirmation` object (not a new block type — §14 finding) → on confirm, `HomeEvent`'s existing `supersedesEventId`/`isCurrent` revision chain creates a new current revision, never a hard delete (**[FACT — Stage 1]**, already the model's designed behavior) → audit trail via `HomeEventVerificationRecord` (existing) → future context reads see the corrected value.

**[OPEN — Phase 0 finding, see §31]**: this pass found `askDomainCommandRegistry.ts`'s `correctionModes` vocabulary — which Stage 2 planned to reuse for exactly this story — is **entirely unconsumed** anywhere in the codebase (not even hand-written per-command). The correction UX above must be built using `HomeEvent`'s existing revision chain directly; there is no existing correction dispatcher to plug into.

---

## 9. Turn Types

**[REQUIREMENT]** Eight interaction types, none of which become a new routing operation ID by itself:

| Type | Owner | Mechanism |
|---|---|---|
| QUESTION | Router | Deterministic routing (unchanged) |
| COMMAND | Router + bounded per-operation extraction | Deterministic routing + existing regex parameter extraction (§12) |
| INFORMATION | Extraction | Candidate item, category `FACT` (§14) |
| EVENT | Extraction | Candidate item, category `EVENT` (§14) |
| GOAL | Extraction | Candidate item, category `GOAL` → `DecisionThread` (§30) |
| CORRECTION | Extraction + confirmation | `CORRECT_FACT`-shaped candidate → confirmation → supersession (§23) |
| CONFIRMATION | Orchestrator | `AskConfirmationReceipt` saga (§22) — not a turn a homeowner initiates in free text, a structured API response to a proposal |
| FOLLOW_UP | Orchestrator | `resolveAskFollowUpMessage`'s existing bounded rewrite (unchanged, **[FACT — Stage 2]** narrow, 4-regex-gated) |

A single message may produce multiple types simultaneously (§8.3's combined example: QUESTION + EVENT).

---

## 10. Turn Processing Contract

**[REQUIREMENT]** Normative lifecycle, synchronous unless marked:

```
1.  Receive message
2.  Authenticate / authorize (unchanged, existing middleware)
3.  Create AskExecution record (RECEIVED)
4.  Resolve deterministic intent (unchanged: regex → local classifier → confidence gate)
5.  Resolve relevant context (existing aggregation context; extended scope per Stage 2 §9)
6.  Invoke capability if routing resolved one (§16's capability.invoke)
7.  Evaluate whether extraction should run (§13's pre-filter — deterministic, cheap)
8.  [ASYNC-CAPABLE] Extract candidate information if the pre-filter fired (§14) — bounded
    synchronous attempt with async fallback (Stage 2 §7's corrected delivery contract)
9.  Deduplicate against routed-operation capture (Stage 2 §7's dedup rule)
10. Validate candidate information (Zod, against each target model's existing schema)
11. Assemble response (existing AskPresentationBlock construction)
12. Surface confirmation via the existing `confirmation` field on each child execution (§14 finding — not a new block)
13. Generate contextual next actions (§27)
14. [ASYNC] Persist durable extraction intent before step 8 is attempted, not after (Stage 2 §7's
    persist-first correction) — this step's ordering is actually *before* step 8, listed here for
    lifecycle completeness
15. Return response
```

Steps 6 and 8 are independent — routing succeeding or failing does not gate extraction (Stage 2 §7). Step 8's synchronous portion has a strict timeout (~1.5s, Stage 3 tuning question, §14); anything not completed within it proceeds via the existing `DomainEvent` outbox, unchanged from Stage 2's corrected design.

---

## 11. Routing Requirements

**[REQUIREMENT]** No change to deterministic routing itself (regex → local embedding classifier → confidence gate, per Stage 1/2, unchanged). **[OPEN]**: the specific routing-coverage misses Stage 1 traced (Scenario D "storms," Scenario E "selling next year") are pattern/example additions, not architecture — Stage 3's implementation plan should size adding these patterns as ordinary routing-quality work using the existing `askRoutingQualityEvaluator`/`askTrustCertificationCorpus` harness (**[FACT — this pass]**, confirmed to exist: `apps/backend/tests/ask/askRoutingCalibration.test.js` + a hand-labeled `CERTIFICATION_ROWS` corpus tagged by category), not a new evaluation system.

---

## 12. Conversational Understanding Requirements

**[REQUIREMENT]** Two components, specified in full in §13/§14: a deterministic pre-filter that gates whether an LLM call happens at all, and a bounded structured-extraction contract for when it does. Both are additive to deterministic routing (unchanged, §11), never a replacement for it, per Stage 2 §7's decision that extraction is an independent decision from routing's outcome, not gated on routing failing.

---

## 13. Extraction Pre-filter

**[REQUIREMENT]** Deterministic, cheap, no LLM call for the common case. Must:
- Run before any LLM extraction call, gating whether one happens at all.
- Achieve measurable recall/precision against the evaluation corpus (§15).
- Fail safe: a missed trigger (false negative) loses conversational capture for that turn but never blocks the routed answer; a false trigger costs one extra bounded LLM call, never a wrong write (extraction only ever produces *proposals*, per §16).
- Be independently unit-testable (pure function, no I/O).

Illustrative trigger/non-trigger examples per the request are directional, not exhaustive — the evaluation corpus (§15) is the actual acceptance mechanism, not a fixed example list.

---

## 14. Structured Extraction Contract

**[REQUIREMENT]** When the pre-filter fires: one bounded, schema-constrained LLM call; output is a typed list of candidate items (never free text); the model never writes to a canonical domain model directly (only produces proposals — Stage 2 §16's confirmation-required rule, unchanged, still enforced by the existing Trust FRD's unconditional material-write-confirmation requirement, **[FACT — Stage 1]**); each candidate carries:
- category (`FACT` | `EVENT` | `GOAL` — command/intent stays in deterministic routing per Stage 2 §8)
- `attribution` (`FIRSTHAND` | `THIRD_PARTY_RELAYED` | `INFERRED` — Stage 2 §15)
- `extractionConfidence` (a field genuinely separate from each target model's existing `confidence`/`confidenceScore`, per Stage 2's corrected §15 — reusing the existing field was found to conflate parse-confidence with fact-reliability, since `groundedAsk.service.ts:85` already averages the existing field into answer-level trust)
- date precision preserved as stated (`RANGE`/`MONTH`/`EXACT_DATE`/`UNKNOWN` — never manufactured, per Stage 2 §14's corrected worked example)

**STAGE 2 ASSUMPTION → NEW CODE EVIDENCE → IMPACT → RECOMMENDED ADJUSTMENT**:
```
STAGE 2 ASSUMPTION: two new AskPresentationBlock variants are needed — FACT_CONFIRMATION and
  PROACTIVE_INSIGHT — to surface a captured candidate for confirmation and to distinguish a
  Cozy-initiated turn.
NEW CODE EVIDENCE: AskExecutionResponseSchema already has a top-level, singular
  `confirmation: AskConfirmationSchema.nullable()` field (ask.contract.ts) — a complete
  confirmation-card contract (confirmationId, title, description, fields[], confirmLabel,
  consentText, expiresAt) already used by all 25 existing domain commands. Since Stage 2 already
  decided each captured candidate becomes its own child AskExecution (§17 below), that execution's
  response can carry this EXISTING field with zero new schema. Separately, no existing field
  distinguishes a Cozy-initiated execution from a user-initiated one — PROACTIVE_INSIGHT has no
  redundant existing mechanism.
IMPACT: adding FACT_CONFIRMATION as a new block type would duplicate a working mechanism the
  25 existing commands already rely on, and would require frontend changes (a new `if` branch in
  AskWorkspace.tsx's single-file BlockView, §28) for something the existing renderer likely already
  handles for the 25 commands.
RECOMMENDED ADJUSTMENT: drop FACT_CONFIRMATION. Represent a captured candidate's confirmation via
  the existing `confirmation` field on its own child execution, exactly like existing domain
  commands. Keep PROACTIVE_INSIGHT — it is a genuine gap.
```

**[REQUIREMENT] Failure behavior:** per Stage 2 §7's corrected design, durable intent (a `DomainEvent`) is persisted **before** any LLM call is attempted, not after success — a process restart never silently loses the fact that extraction was owed for a turn. The routed answer always succeeds independently of extraction's outcome. A stale, slow-finishing attempt whose lease was legitimately reclaimed must not persist its result (Stage 2's commit-time claim-token re-verification, §22). No duplicate candidate proposals reach the user (Stage 2's atomic all-or-nothing candidate-set persistence plus deterministic candidate identities reusing `AskExecution.clientRequestId`'s existing uniqueness).

---

## 15. Extraction Evaluation

**[REQUIREMENT]** A dedicated corpus, extending the existing pattern (**[FACT — this pass]**: `askTrustCertificationCorpus.ts` already establishes hand-labeled, categorized, frozen fixtures with a `provenance` tag — this is the template, not a new harness design). Categories, per the request, all required: positive factual statements, negative questions, mixed question+fact, hedged statements, third-party statements, corrections, ambiguous dates, cost/provider combinations, multiple facts in one turn, unrelated household conversation, false-positive traps.

Metrics and **pragmatic pilot thresholds** (illustrative starting points — a Stage 3 implementation calibration task, not fixed science):

| Metric | Pilot threshold (illustrative) |
|---|---|
| Pre-filter recall | ≥ 85% on the positive-statement categories |
| Pre-filter precision | ≥ 70% (a missed trigger is worse than an extra bounded LLM call, so precision can trail recall) |
| Candidate extraction accuracy (right category assigned) | ≥ 90% |
| Field accuracy (value correctly extracted, when a candidate is produced) | ≥ 85% |
| Date-precision accuracy (RANGE vs MONTH vs EXACT never over-claimed) | ≥ 95% — this one should be near-exact, since fabricated precision is the specific failure Stage 2's correction targeted |
| Source-attribution accuracy (FIRSTHAND vs THIRD_PARTY_RELAYED) | ≥ 85% |
| Duplicate rate (same fact proposed twice for one message) | ≤ 2% |
| False persistence proposal rate (a candidate proposed for information that isn't actually new/true) | ≤ 5%, since confirmation is the backstop, not the only defense |

**[REQUIREMENT]** These thresholds gate pilot readiness (§40), not general availability — they are revisited once real usage data exists, and this document does not claim they are validated against production traffic.

---

## 16. Capability Invocation Requirements

**[REQUIREMENT]** Given an `operationId`, the layer must: resolve adapter (existing `getSkillAdapterForOperation`) → validate policy (existing `resolveEffectiveSkillOperationPolicy`) → resolve registered handler (new registry) → build the normalized invocation envelope → execute → return `AskOperationResult` → emit execution metadata (existing `SkillExecutionBinding`).

**[REQUIREMENT] Canonical envelope**, per Stage 2 §11 with two corrections from this pass's full 68-operation handler inventory (`docs/architecture/ASK_COZY_INCREMENTAL_IMPLEMENTATION_PLAN.md` §5):

```ts
type CapabilityInvocationEnvelope = {
  userId: string;
  propertyId?: string;       // optional — GROUNDED_GUIDANCE and CAPABILITY_DISCOVERY both have
                              // real no-property/optional-property modes (this pass confirmed
                              // CAPABILITY_DISCOVERY's handler takes propertyId non-asserted)
  sessionId: string;         // required — needed by GROUNDED_GUIDANCE (Stage 2 §11 correction)
  executionId: string;
  message: string;
  launchContext?: AskLaunchContext;
  suppliedInput?: Record<string, unknown>;
  continuationCursor?: string;   // NEW — this pass found INTELLIGENCE_ENVELOPE_QUERY needs
                                   // pagination support the Stage 2 envelope didn't include
};
```

**STAGE 2 ASSUMPTION → NEW CODE EVIDENCE → IMPACT → RECOMMENDED ADJUSTMENT**:
```
STAGE 2 ASSUMPTION: a per-operation shim maps the common envelope onto each handler's actual
  (non-uniform) positional signature — "in some cases requiring lookups beyond simple
  destructuring," per Stage 2's own hedge.
NEW CODE EVIDENCE: this pass's full 68-operation inventory found two genuine structural outliers,
  not just "more complex destructuring": GROUNDED_GUIDANCE takes the entire raw `input` object plus
  a separate `trace` argument (not a scalar subset of the envelope at all), and
  HVAC_SPECIALIST_ENGAGE takes the whole `launchContext` object rather than any derived field, and
  has no entry in `askDomainCommandRegistry.ts` at all despite being classified
  MATERIAL_DECISION/CONTRIBUTOR in the operation registry — its confirmation (if any) is
  self-managed inside the specialist-agent runtime, not via the standard command path.
IMPACT: forcing these two into the same "shim destructures scalar envelope fields" pattern as the
  other 66 operations either loses information the handler needs or requires an awkward
  restructure of two of the codebase's more complex flows for no clear benefit.
RECOMMENDED ADJUSTMENT: define a second, explicit adapter category — "passthrough" — for
  operations whose shim receives the full envelope (and, for GROUNDED_GUIDANCE, the trace object)
  rather than a destructured subset. Two operations, not a general pattern. Separately, resolve
  HVAC_SPECIALIST_ENGAGE's missing confirmation-registry entry as an explicit Phase 0 decision
  (§31) — confirm whether the agent runtime's self-managed confirmation is sufficient by design,
  or a genuine gap, before migrating it.
```

**[REQUIREMENT] Handler registration:** Registry keyed by **adapter id** (Stage 2's corrected §11 — not `AskOperationId`, since an adapter's `allowedOperations` is declared as an array). Duplicate-handler registration must fail at initialization (a startup assertion, mirroring the existing `validateSkillAdapterDefinitions`/`validateSkillDefinitions` static-consistency checkers Stage 1 found already exist and run at build/test time); a missing handler for a registered, enabled adapter must fail as a typed `ASK_CAPABILITY_HANDLER_MISSING` error (existing `errorContract: 'ASK_TYPED_RESULT'` convention, per Stage 1's finding on `SkillAdapterDefinition`), never an undefined-function runtime crash; adapter-to-handler integrity is checked by the same initialization validator that already checks adapter-to-operation integrity (`validateSkillAdapterDefinitions`, extend rather than duplicate).

**[REQUIREMENT] Existing handler migration:** every existing handler gets a shim; **thin shims are acceptable and preferred** — do not rewrite handler bodies to a common signature unless a handler is independently being modified for another reason. The full inventory of all 68 operations (exact args, adapter ids, confirmation requirements, shim complexity) lives in the implementation plan (`docs/architecture/ASK_COZY_INCREMENTAL_IMPLEMENTATION_PLAN.md` §5), not duplicated here per the two-document separation. **[FACT — this pass]** summary: 61 fit the standard scalar-destructure shim pattern, 3 are trivial (no envelope fields at all), 2 need the passthrough category above; 25 require confirmation via `AskDomainCommandRegistry`.

---

## 17. Ask Orchestrator Responsibilities

**[REQUIREMENT]** Owns: execution/session coordination, routing coordination, context coordination, capability invocation coordination (calls `capability.invoke`, does not contain domain branches), extraction coordination (calls the extraction module, does not contain extraction logic inline), response aggregation, trust/safety gates (unchanged: `askAnswerTrustValidator`, `askSemanticAnswerValidator` stay where they are).

**[REQUIREMENT]** Does NOT own: refinance logic, seller-prep logic, maintenance logic, weather/radar logic, domain calculations, domain-specific write logic, static next-action catalogs (moves to §27's dedicated module).

**[REQUIREMENT] Measurable completion criterion** (per the request's explicit instruction against a line-count target):
> Adding a new capability after this refactor does not require adding another domain-specific dispatch branch inside `askOrchestrator.service.ts`.

Testable directly: a new capability's PR diff touches the handler registry (one new entry) and its own skill package — never `askOrchestrator.service.ts`'s dispatch switch.

---

## 18. Knowledge Capture

Per Stage 2 §9/§13's per-category routing table — no new universal store; every category maps to an existing model.

## 19. Scalar Fact Capture

**Target: `PropertyFactEvidence` via `capturePropertyFact`.**

**[REQUIREMENT]**, per Stage 2 §16 (fully corrected across four review rounds — this FRD carries forward the *final* design, not any intermediate draft):
- fact-key validation: existing Zod schemas per factKey, extend catalog only as needed (unchanged mechanism)
- source: `sourceType` unchanged in meaning (`USER_REPORTED` for homeowner statements regardless of channel)
- attribution: new `attribution` field (`FIRSTHAND`/`THIRD_PARTY_RELAYED`/`INFERRED`) — for `THIRD_PARTY_RELAYED`/`INFERRED` items, the confirm-time write must **not** apply the existing unconditional `verifiedAt`-set/`confidence: 0.9` treatment (`capturePropertyFact.ts:311` confirmed to do this for every `USER_REPORTED` value today) — write `verifiedAt: null` and a distinctly lower confidence instead (Stage 2's corrected §15)
- capture channel: new `captureChannel` field, independent of `sourceType`
- extraction confidence: new, genuinely separate `extractionConfidence` field (not a reuse of `confidence` — Stage 2's corrected §15, restated in §14 above)
- confirmation: via `AskConfirmationReceipt` (§22), never bypassed by confidence
- idempotency: new `captureExecutionId` field + `@@unique([propertyId, factKey, captureExecutionId])` — **not** `sourceEntityId`, which this pass confirmed (`capturePropertyFact.ts:309`) already means "acting user" for every existing caller; reusing it would break ordinary repeat edits by the same homeowner (Stage 2's third-round correction)
- supersession/conflict: existing `supersededAt` chain and `decideFactMerge` priority pattern, unchanged; idempotency dedup must resolve to the original execution's write regardless of current supersession state (Stage 2's second-round correction — a stale replay must not resurrect a value a later, unrelated correction already superseded)

---

## 20. Home Event Capture

**Target: `HomeEvent`, extended with two narrow, precedented fields.**

**[REQUIREMENT]**: `HomeEvent.providerName: String?` and `HomeEvent.warrantyId: String? (FK → Warranty)` — both consistent with the model's existing pattern of optional related-record links (`claimId`, `expenseId`, `projectId` already exist on this exact model, per Stage 2's verified finding). Approximate dates preserved via existing `datePrecision`/`dateRangeStart`/`dateRangeEnd` fields — never collapsed to a fabricated exact month (Stage 2's corrected §14). Retrospective status via existing `isRetrospective` flag (purpose-built for this, per an inline schema comment Stage 2 found). Cost via existing `amount`. Evidence/provenance via existing `HomeEventEvidence`/`HomeEventVerificationRecord`. Confirmation via `AskConfirmationReceipt` (§22). Idempotency via existing `idempotencyKey` field + existing `@@unique([propertyId, idempotencyKey])` constraint, populated with the execution id for the first time for this purpose (Stage 2's finding — the field already exists, unused for this until now). Correction: **[OPEN, per §31's finding]** — no existing `correctionModes` dispatcher to reuse; build directly on `HomeEvent`'s existing `supersedesEventId`/`isCurrent` revision chain.

---

## 21. Goal Capture

**Target: `DecisionThread` (existing, generalized from HVAC-only).**

**[REQUIREMENT]**: **[FACT — this pass]** `DecisionThread.goalCode` is a plain string column (confirmed, no Prisma enum) — adding `SELL_HOLD_RENT`/`RENOVATION`/`CLAIM`/`REFINANCE` requires zero schema change. Create/reuse/resume/close rules per Stage 2 §17:
- **Create**: a `GOAL` candidate with no matching open thread for `(propertyId, decisionDefinitionId, primaryEntityType, primaryEntityId)` creates one — exempt from the confirmation gate that applies to durable-knowledge writes (Stage 2's materiality carve-out: a thread is workflow state, not a fact about the home, and is reversible at zero cost).
- **Reuse/resume**: canonical lookup is `DecisionThread.activeIdentityKey`, not a session-level pointer — this supports multiple concurrent goals for one property and cross-session resumption (Stage 2's third-round correction of an earlier single-pointer design). `AskSession.activeDecisionThreadId` is a same-session cache only.
- **Close**: existing `lifecycleStatus` transitions (`DECIDED`/`COMPLETED`/`ABANDONED`), unchanged mechanism.

**[REQUIREMENT]** Avoid one thread per casual mention: a `GOAL` candidate only creates/attaches a thread when the pre-filter+extraction combination reaches its normal confidence bar for the `GOAL` category (§14) — a passing mention that doesn't clear extraction confidence produces no thread, consistent with how every other candidate category already requires the pre-filter to fire before anything happens.

---

## 22. Confirmation & Idempotency

**[REQUIREMENT] Canonical lifecycle** (Stage 2 §16, four-times-corrected — this is the final design):

```
candidate → AskExecution (NEEDS_CONFIRMATION, parametersJson holds the candidate payload)
  → AskConfirmationReceipt claim (transaction: execution → RUNNING, receipt created with lease,
     content-hash-based conflict detection)
  → authorization re-check (roleFloor + property-access, at claim AND at completion)
  → idempotent domain write (execute phase, outside the claim/complete transactions — each write
     is independently idempotent: HomeEvent upsert on idempotencyKey, PropertyFactEvidence create
     on captureExecutionId with P2002-catch-and-return, Warranty create on its own new
     sourceExecutionId, none of them borrowing another model's state to decide idempotency)
  → completion (transaction: execution → final status, receipt → COMPLETED, artifactId recorded)
  → audit (existing AskExecutionEvent log)
```

**[REQUIREMENT]** Specify each of the following exactly per Stage 2's final, corrected design:
- **Confirm**: as above.
- **Reject**: existing `rejectGroundedAskProposal`-equivalent path — status → `REJECTED`/`CANCELLED`, no domain write.
- **Edit-before-confirm**: candidate payload is editable via the existing `captureRequests`/`suppliedInput` mechanism before the confirm call, not a separate edit endpoint.
- **Retry**: idempotent per-model, as above — a replayed execute phase never duplicates or resurrects a superseded value (Stage 2's second-round correction, resolved via matching on the execution's own identity, never on current/active state).
- **Timeout / stale lease**: existing lease-expiry re-claim pattern (`AskConfirmationReceipt`'s 60-second lease, incrementing attempt count — unchanged, already correct per Stage 2's verification).
- **Duplicate request**: existing content-hash comparison on the receipt (`P2002`-catch-and-re-read), unchanged.
- **Permission change / property access lost between proposal and confirmation**: re-check access at confirmation completion time, not only at proposal time (Stage 2 §16's explicit requirement, inherited from the existing `AskConfirmationReceipt` saga's own behavior — this is not new, just newly required for the capture-confirm operation family too).
- **Partial failure (a slow, reclaimed attempt finishes late)**: the commit-time claim-token re-verification (Stage 2's fourth-round correction) — a stale attempt's entire transaction, including any candidate writes, rolls back if its claim token no longer matches.
- **Warranty/event dependency ordering**: bidirectional `linkedExecutionId` (Stage 2's fourth-round correction — set on both sibling candidates, not one-sided) plus asynchronous reconciliation via a `DomainEvent` (`ASK_CAPTURE_LINK_RECONCILE`) processed against durably-committed state, not a synchronous check at completion time (Stage 2's third-round correction of a race-prone earlier design).

**[REQUIREMENT]** Material writes are never committed by the extraction LLM directly — extraction produces typed candidates only; every persistence path above runs through this confirmation lifecycle, with zero exception (Stage 2 §15, unconditional per the existing Trust FRD).

---

## 23. GroundedAskProposal Retirement

**[FACT — this pass]** Kind-by-kind mapping, verified against `groundedAsk.service.ts`'s actual confirm behavior and both operation registries:

| Kind | Current semantics | Target representation | Parity? |
|---|---|---|---|
| `ADD_FACT` / `CORRECT_FACT` | `capturePropertyFact(..., sourceType:'USER_REPORTED', confidence:0.9)` | New `CAPTURE_FACT_CONFIRM` operation (§19) | Full — this is exactly what §19 replaces it with, with the added attribution/idempotency correctness Stage 2 built in |
| `CREATE_TASK` | `propertyMaintenanceTask.upsert` keyed on `actionKey` | **Exact existing match**: `MAINTENANCE_TASK_CREATE` / command `MAINTENANCE_CREATE` | Full — same target table either way |
| `START_JOURNEY` | `guidanceJourneyService.createUserInitiatedJourney(...)` | **Exact existing match**: `GUIDANCE_JOURNEY_CREATE` | Full |
| `COMPARE_OPTIONS` | Creates a `quoteComparisonWorkspace` | **Exact existing match**: `QUOTE_COMPARISON_CREATE` | Full |
| `UPLOAD_EVIDENCE` | Links an already-uploaded `Document` as evidence for another proposal | **No exact match** — `DOCUMENT_PROMOTION_CONFIRM` is semantically adjacent (both are document→canonical-record actions) but promotes an *extracted candidate* into canonical truth, a different operation than merely *linking* a document as supporting evidence | **Gap — flagged, not assumed.** Requires an explicit Phase 0 decision: either extend `DOCUMENT_PROMOTION_CONFIRM`'s semantics to cover evidence-linking, or keep a small, distinct evidence-link operation. Do not silently map onto `DOCUMENT_PROMOTION_CONFIRM` without this decision. |
| `ADD_NOTE` | Creates a `GroundedAskArtifact` with the note text **only in `artifactJson`** — no queryable domain model today | **No existing operation found in either registry** | **Gap — not flagged by Stage 2 at all.** Today's behavior isn't even a real domain write (a note in an artifact JSON blob is not queryable outside its own proposal). Phase 0 must decide: a lightweight note field/model, or fold into `HomeEvent` as a no-date/no-amount annotation type. This is a genuine net-new decision, not a migration of existing semantics. |

**[REQUIREMENT]** Per the request's explicit instruction: `GroundedAskProposal`/`GroundedAskArtifact` are not deleted until all 7 kinds — including the two flagged gaps above — have a resolved target representation and passing parity tests. No "delete first, discover semantic loss later."

---

## 24. Provenance

**[REQUIREMENT]** Four independent axes (Stage 2 §15, final corrected design): **source** (`sourceType`, unchanged meaning), **capture channel** (new `captureChannel` field), **extraction confidence** (new, genuinely separate `extractionConfidence` field), **confirmation state** (existing `verificationStatus`/`verifiedAt` fields). Never collapsed into one field, and never reusing an existing field whose current meaning would conflict (§14's `confidence`-reuse correction). `attribution` (`FIRSTHAND`/`THIRD_PARTY_RELAYED`/`INFERRED`) is a fifth, related tag that determines how source/confidence combine for a given candidate (§19).

---

## 25. Context Assembly

**[REQUIREMENT]** Reuse `getAggregationPropertyContext` (existing, unchanged) with `SEARCH_ASSISTANT`'s scope widened to include `STRUCTURE`/`EVENTS` (Stage 2 §9 — a config change to an existing mechanism). Each capability's own `requiredContextProviders`/`optionalContextProviders` (existing skill metadata) remains the per-operation context-selection mechanism — not replaced. Freshness/latency/authorization/missing-value handling: owned by the existing aggregation-context service, unchanged. Provider failures/stale integrations: surfaced via the existing `MISSING`/`UNAVAILABLE` fact states, consumed directly by next-action generation (§27) and cold-start behavior (Stage 2 §27), not a new signal.

---

## 26. Multi-turn State

**[REQUIREMENT]** Three explicitly separated layers (Stage 2 §17, final design):

| Layer | Model | Persists |
|---|---|---|
| Conversation history | `AskExecution` rows | Current topic (via `resolveAskFollowUpMessage`'s narrow rewrite, unchanged), bounded follow-up references, pending capture requests (existing `captureRequests`/`AskCaptureReceipt`), pending confirmations (`AskConfirmationReceipt`) |
| Active workflow state | `DecisionThread` + `DecisionThreadExecutionLink` | Active goal, selected next action's resumption target |
| Persistent home knowledge | `PropertyFactEvidence`, `HomeEvent`, `Warranty`, etc. | Durable facts/events |

**[REQUIREMENT]** No unbounded transcript stuffing into LLM context — extraction and any conversational reasoning consume the current message, bounded aggregation context, and (when active) the `DecisionThread`'s already-structured state (`factReferences`, `assumptions`, `options`, `questions`) — never a raw list of prior messages (Stage 2 §17, explicit).

---

## 27. Next Actions

**[REQUIREMENT]** Dedicated module (moves out of the orchestrator, §17). Deterministic generation (Stage 2's decision, confirmed sufficient — no new LLM call), consuming: current request, current response, available capabilities (existing skill `consumerPolicy`), missing context (existing `MISSING` fact state), active `DecisionThread`, known home state, logical decision path.

Corrected design (Stage 2's second-round finding, incorporating an under-credited existing mechanism):
- **Candidate generation**: capabilities whose `consumerPolicy` includes `ASK`.
- **Ranking**: reuse `productFramework/capabilities`'s existing `capabilityCandidateMatcher`/`capabilityRanking` machinery (`baseScore`, `recommendation.triggerFamilies`) — **[FACT — Stage 2, this pass]** this infrastructure already exists and was under-credited in the first Stage 2 draft as "just a navigation catalog"; it is a real, working relevance-scoring pipeline.
- **Suppression**: existing `capabilitySuppressionPolicy.ts` (`cooldownDaysAfterDismissal`) plus existing `askSuggestionPolicy.ts` repeat-filter — both apply, they suppress different things.
- **Duplication control**: covered by the suppression layer above; no separate mechanism needed.
- **READY vs NEEDS_INFO**: two tiers — fully-satisfiable context → direct action chip; partially-satisfiable (gap is `MISSING`, not `UNAVAILABLE`) → conversational "tell me about X" prompt via existing `captureRequests` (Stage 2's second-round correction — an earlier "satisfiable → propose" rule would have excluded this entire tier, backwards for cold-start homeowners).
- **Max shown**: reuse the existing max-5 convention already used elsewhere in the Ask response contract (`askNotificationContinuation`'s `resultJson.suggestions`, **[FACT — Stage 1]**).

---

## 28. Structured UI Blocks

**[REQUIREMENT]** Keep `AskPresentationBlock` (**[FACT — this pass]** confirmed 24 current variants, full list in the implementation plan §5). Add exactly **one** new block type: `PROACTIVE_INSIGHT` (a genuine gap — no existing field distinguishes a Cozy-initiated execution). **Do not add `FACT_CONFIRMATION`** — per §14's STAGE 2 ASSUMPTION correction, the existing `confirmation` field already covers this need with zero new schema.

**[REQUIREMENT]** Frontend impact (**[FACT — this pass]**): `AskWorkspace.tsx`'s `BlockView` is a single 1707-line function using an inline `if (block.type === 'X')` chain — not a per-block-component architecture. Adding `PROACTIVE_INSIGHT` means one more `if` branch in this same file (and the mirrored type in `apps/frontend/src/features/ask/types.ts`); no new component-registry pattern is introduced by this program.

---

## 29. Proactive Cozy

**[REQUIREMENT]** Generalize the existing pattern (Stage 2 §20, final design): `DomainEvent` (existing outbox) → domain relevance evaluation (existing, kept per-domain — genuinely domain-specific, not centralized) → `notifyWithAskContinuation` (**new, small wrapper** eliminating the confirmed copy-pasted duplication between the two existing callers) → pre-loaded `AskExecution` → homeowner sees a `PROACTIVE_INSIGHT`-tagged Cozy turn.

**[REQUIREMENT]** Deduplication: existing `NotificationService.create()`'s `deduplicationKey`, unchanged. Urgency/suppression: existing per-domain logic + `askSuggestionPolicy.ts`'s repeat-filter, unchanged mechanisms reused. Ask deep-linking: existing `actionUrl` pattern from `createAskNotificationContinuation`. Already-resolved insight / dismissal / repeat reminders / user preferences: **[OPEN]** — not explicitly designed in Stage 2; Stage 3's implementation plan should scope this as its own small vertical slice within Phase 5, reusing whatever dismissal/preference mechanism `NotificationService` already has (not verified in this pass — flag for Phase 0).

**[REQUIREMENT]** Home Event Radar migrates its direct `Notification` write onto this same `DomainEvent` rail (Stage 2's explicit decision) — see §31 for the specific migration requirements and the two things this pass found still open.

---

## 30. DecisionThread / Job 3

Covered in full in §21. Restated: Job 3 ("when something major happens") is served by `DecisionThread` generalized from HVAC-only to any long-lived goal, not a new abstraction (Stage 2 §17/§21/§25, unchanged).

---

## 31. Domain Capability Exposure

**[REQUIREMENT]**, per Stage 2 §23's classification, restated with this pass's fresh findings:

- **Home Event Radar — expose now, but two things must happen first**, both **[OPEN]**:
  1. **[FACT — this pass]** the `askEnvelopeQueryScope.ts` domain-mapping bug is confirmed still present exactly as previously described (component-scoped queries hardcode `domains: ['ASSET_LIFECYCLE']`, excluding `WEATHER`). This pass found the fix is **not** simply "always add WEATHER" — roof-related signals are already legitimately split across both domains (`aging_roof_condition_review` → `ASSET_LIFECYCLE`, `SEVERE_WEATHER_OPEN_ROOF_ISSUE` → `WEATHER`), and other WEATHER-domain rules (`heavy_rain`/`flood_risk`, gutter drainage) plausibly apply to `FOUNDATION`/`SITE`/`EXTERIOR` too, not just `ROOF`. Phase 0 must decide between an unconditional widen (`domains: ['ASSET_LIFECYCLE', 'WEATHER']` for every matched component) or a per-component allowlist (excluding `INTERIOR`, which has no plausible WEATHER-domain rule) — and must first verify `intelligenceEnvelopeQuery.service.ts`'s entityRef-filtering logic, since it may already keep results relevant regardless of which option is chosen (not verified in this pass).
  2. **[FACT — this pass]** runtime Radar population could not be verified in this environment (no reachable database matching the app's configured connection string) — but the seed script (`apps/backend/prisma/seed.ts`) was confirmed to create **zero** `PropertyRadarMatch`/`RadarEvent` rows for any seeded test property. Treat "Radar data exists for a demo/test property" as a precondition to establish (via the real ingestion pipeline or a purpose-built fixture), not an assumption — this is a real Phase 0 blocker for any live demonstration of Scenario 8.4, not just a documentation gap.

- **Refinance — reference implementation, wrap cleanly, do not refactor.** Per Stage 2 §25/this document's §8.1: direct capability access, deterministic calculations, graceful degradation, missing-context capture, clear output states. The capability layer's shim for `refinance.analysis` is the simplest in the entire 68-operation inventory (2 args, no `message` needed) — no reason to touch the underlying service.

- **Seller Prep / life-event — expose now.** Per §8.5/§21/§26. `SellerPrepService` is confirmed UI-decoupled already (Stage 1 finding) — needs a new Ask operation registration, not new business logic.

- **Personalization — defer.** Per Stage 2 §23: internally clean, isolated, no Three-Jobs dependency found. Future next-action ranking (§27) may consume it once available; the core architecture functions without it.

- **Home Renovation Advisor — do not expose until the naming ambiguity is resolved.** **[FACT — Stage 2]** `RENOVATION_PERMIT_READINESS` currently calls a thinner `permitTracker`/`renovationCase` pair, not the richer `homeRenovationAdvisor/` evaluation engine — zero references to the latter exist under `services/ask/`. Phase 0 must decide which implementation Ask should invoke for which user intent before any renovation-related capability work proceeds, per the request's explicit instruction not to wire the wrong implementation due to naming overlap.

---

## 32. LLM Boundaries

**[REQUIREMENT]** For the one new LLM call (extraction, §14), document per the request's checklist:

| Aspect | Requirement |
|---|---|
| Purpose | Structured candidate extraction only — never routing, never a domain decision, never the write itself |
| Input boundary | Current message + bounded context slice (§26) — never raw transcript history |
| Output schema | Strict Zod schema, five discriminated candidate-item variants (§14) — no free text |
| Authority | Produces proposals only; zero write path of its own (§22 is the only path to persistence) |
| Failure behavior | Routed answer succeeds regardless (§14); durable retry via the existing `DomainEvent` outbox |
| Timeout | ~1.5s illustrative bounded synchronous attempt, async fallback beyond that (§10 step 8) |
| Retry | Handled by the outbox's existing lease/attempt-count mechanism, with commit-time claim-token re-verification (§22) |
| Observability | Logged the same way `askRoutingQualityEvaluator` already logs routing decisions (existing calibration-harness pattern, reused) |
| Test strategy | Extends the existing 48-file Ask test suite + 3 DB-integration tests + certification corpus (**[FACT — this pass]**, confirmed to exist) — new fixture rows and new `.db.test.js` files following the established naming convention, not a new harness |

**[REQUIREMENT]** The existing two live LLM calls (`synthesizeAskResult`, `selectAskRemoteFallbackTypedClaims`) are unchanged — still schema-constrained, still instructed never to invent facts (**[FACT — Stage 1]**).

---

## 33. Traditional UI Requirements

**[REQUIREMENT]** Every material conversational write must have a review/correction path outside chat (Stage 2 §21/§33, unchanged principle). For the two capture targets this program adds: `PropertyFactEvidence` edits already have an existing property-edit UI path (per Stage 1's project history — property basics/systems editing exists); `HomeEvent` needs confirmation that an equivalent timeline/history view exists for reviewing and correcting a conversationally-captured event (**[OPEN]** — not verified in this pass; flag for Phase 0 as a smallest-required-UI-addition check, per the request's explicit instruction not to redesign every feature page).

---

## 34. Security

**[REQUIREMENT]** User/property authorization: unchanged existing middleware, applied identically to the new `CAPTURE_FACT_CONFIRM`/`CAPTURE_EVENT_CONFIRM` operation family (Stage 2 §7's explicit "safety is inherited, must be verified, not assumed" requirement). Confirmation-time re-check: existing `AskConfirmationReceipt` behavior, unchanged, must not be weakened for the new operation family. Role enforcement: same `roleFloor` mechanism as the 25 existing commands — a `VIEWER` cannot confirm a captured fact any more than they can create a maintenance task today. No cross-property context leakage: existing property-scoping on aggregation context and capability invocation, unchanged.

---

## 35. Reliability

**[REQUIREMENT]** Durable extraction intent: persisted before the LLM call is attempted, not after (§14). Retry-safe workers: shared lease ownership between the inline attempt and the async worker (one claim, two triggers — Stage 2's third-round correction). Lease correctness: commit-time claim-token re-verification, not just claim-time (Stage 2's fourth-round correction). Idempotent writes: per-model, matching on execution identity, not current/active state (§22).

---

## 36. Performance

**[REQUIREMENT]** Deterministic routing path unaffected — the pre-filter is the only new cost on every turn, and it's deterministic/cheap by requirement (§13). Extraction's bounded synchronous attempt (~1.5s illustrative timeout) must not materially degrade a simple request's latency when the pre-filter doesn't fire (the common case). Async fallback (§10 step 8) must work correctly under process restart (§14).

---

## 37. Observability

**[REQUIREMENT]** Log, per turn: route chosen, capability invoked, whether extraction triggered, candidates generated (count + category), confirmation state transitions, write result, next actions generated (count + which), proactive-continuation origin (which producer). Reuse existing `AskExecutionEvent` audit trail and `askRoutingQualityEvaluator`'s calibration pattern (§32) — not a new observability system.

---

## 38. Testing

Full test pyramid defined in the implementation plan (§23). This FRD's requirement: unit tests for the pre-filter, candidate schemas, capability shims, next-action ranking, idempotency helpers; integration tests for message→route→capability, message→extraction→candidate, candidate→confirm→write (fact and event), `DomainEvent`→proactive continuation; the 10 end-to-end scenarios listed in the implementation plan §23, including correction, duplicate-retry, permission-loss, and async-fallback scenarios explicitly (not just the happy path).

---

## 39. Evaluation

Per §15 (extraction) and §11 (routing) — both extend existing infrastructure (`askRoutingQualityEvaluator`, `askTrustCertificationCorpus`, the 48-file `apps/backend/tests/ask/` suite). **[REQUIREMENT]** pilot release does not depend only on conventional unit tests — the extraction evaluation corpus (§15) and its pragmatic thresholds are a required, non-optional deliverable, per the request's explicit instruction.

---

## 40. Acceptance Criteria

**[REQUIREMENT]** This FRD is satisfied when every user story in §8 passes its stated behavior against the turn processing contract (§10), every knowledge-capture target (§19–§21) enforces its idempotency/attribution/confirmation requirements under the race-condition tests defined in the implementation plan (§23), the capability layer (§16) passes all 68 operations through the registry with zero orchestrator dispatch branches remaining, and the extraction evaluation corpus (§15) clears its pilot thresholds. Full Definition of Done in the implementation plan (§27).

---

*End of Part A. See `docs/architecture/ASK_COZY_INCREMENTAL_IMPLEMENTATION_PLAN.md` (Part B) for phased execution, the full 68-operation handler migration inventory, dependency graph, and rollout sequencing.*
