# Ask Cozy — Target Product & Architecture (Stage 2)

**Type:** Design and architecture definition. No implementation, no migrations, no FRD, no backlog.
**Baseline:** `docs/architecture/ASK_COZY_CONVERSATIONAL_ARCHITECTURE_AUDIT.md` (Stage 1, three review-corrected revisions, `main@a12ab022`). This document does not repeat Stage 1's findings — it cites them and builds on them. Facts stated here that go beyond Stage 1 were independently verified against the current code during this design pass (five targeted research passes into confirmation mechanics, event/expense/warranty models, conversation-state mechanics, proactive-notification mechanics, and the skill/capability registries) and are cited `path:line` alongside Stage 1 citations.
**Labeling convention (per the request's evidence requirements):** every substantive claim is tagged **[FACT]** (verified in Stage 1 or this pass's code reading), **[DECISION]** (chosen in this stage — a design choice, not a finding), or **[FUTURE]** (a possibility explicitly deferred, not required for the target architecture). Do not read a **[DECISION]** as though it were established by code inspection.

---

## 1. Executive Summary

Stage 1 concluded Ask Cozy can evolve into a message-first interface **[FACT — Stage 1 verdict]**, but is currently a closed-intent command console whose biggest structural gaps are: no general fact/event extraction, no real capability-invocation layer (skill/adapter metadata exists but execution is still ~40 hardcoded orchestrator branches with non-uniform handler signatures), a non-atomic confirm/persist path in `GroundedAskProposal`, and proactive intelligence wired to exactly two bespoke callers.

This stage's central design decisions, in order of leverage:

1. **[DECISION]** Conversational understanding runs as a bounded, schema-constrained extraction pass **alongside** deterministic routing on every property-scoped turn (behind a cheap deterministic pre-filter), not only as a `GROUNDED_GUIDANCE` fallback — because a single message can carry both a routable intent and reportable information at once (§7, §8, Decision Log #1–2).
2. **[DECISION]** Retire `GroundedAskProposal`/`GroundedAskArtifact` as a parallel confirmation system. Every material conversational write becomes an `AskExecution` in `NEEDS_CONFIRMATION` status, confirmed through the existing `AskConfirmationReceipt` claim→execute→complete saga — which is already more correct (content-hash conflict detection, lease-based crash recovery, explicit terminal failure states) than anything `GroundedAskProposal` has today (§11, Decision Log #9).
3. **[DECISION]** Build the one missing piece of the capability layer — a real `adapterId → handler` map plus a thin per-operation input-shaping shim — rather than a new framework. Stage 1 found governance/routing metadata (`services/skills/*`) with zero code-level connection to the orchestrator's dispatch `switch`; this pass additionally found the ~40 handlers have **non-uniform signatures** (2–5 positional args, inconsistent optionality), so the fix is a registry *and* a normalization pass, not a drop-in generic call (§13, Decision Log #3).
4. **[DECISION]** Reuse `DecisionThread`/`DecisionThreadExecutionLink` — a durable, cross-turn, multi-participant workflow model that already exists and is currently used only for HVAC decisioning — as the canonical representation of Job 3's "major life event" goals (selling, buying, renovating, claims), instead of inventing a new goal/workflow abstraction (§16, §21, Decision Log #5).
5. **[DECISION]** Route conversational event capture (a roof replacement with a date, cost, and provider) through **existing** models — `HomeEvent` (already has `amount`, `occurredAt`/`datePrecision`, and an `isRetrospective` flag built for exactly this scenario) plus a narrow, precedented schema extension (a `providerName` field and a `warrantyId` link on `HomeEvent`, matching the denormalized-provider pattern already used by `Warranty`/`Claim`/`ProjectRecord`) — not a new universal event table (§9, §12, Decision Log #7).

None of Stage 1's strong foundations are replaced: `AskPresentationBlock`, the deterministic domain engines, the disciplined LLM boundary, the skills/governance metadata, `PropertyFactEvidence`, `PropertyChange`, the domain-event outbox, and the refinance/HVAC reference patterns are all extended, not rebuilt (§6, §30).

**Answer to the final question (§36, expanded there): YES** — the smallest coherent target architecture is one new capability-invocation layer, one converged confirmation mechanism, one new extraction stage sitting beside routing, and reuse of `DecisionThread` for long-lived goals. Everything else in this document specializes those four moves per subsystem.

---

## 2. Product Operating Model

**[DECISION]** Ask Cozy's operating model has three layers, each with a distinct job:

| Layer | Job | Owns |
|---|---|---|
| **Conversation** | Understand what the homeowner means and wants | Turn-level intent/information classification, response assembly |
| **Capability** | Do the thing / know the thing | Domain services, decision engines, integrations — invoked, never duplicated |
| **Knowledge** | Remember what's true about this home | `PropertyFactEvidence`, `HomeEvent`, `PropertyChange`, and friends — durable, outlives any conversation |

Conversation is a *consumer* of Capability and a *writer* to Knowledge, never a replacement for either. This is principle 1 (§27) made concrete, and it is the organizing idea behind every other decision in this document: when a design question in this stage has an answer of the shape "does X belong in the conversation layer, the capability layer, or the knowledge layer," that question is usually already answered by which of the three jobs above X actually is.

---

## 3. Why Ask Cozy Exists

**[FACT — Stage 1]** C2C cannot out-compete general-purpose LLMs on foundation-model quality, generic knowledge, or broad integrations. **[DECISION, restating the request's strategic framing as an architectural constraint]** Ask Cozy's product justification is entirely downstream of the Knowledge layer above: every design decision in this document is evaluated against whether it deepens what C2C durably knows about *this* home, not whether it makes Cozy sound smarter in the moment. A capability that only produces a good-sounding response without touching Knowledge (reading it or writing to it) is not differentiating — a general chatbot given the same context window could do the same thing. This is why §9 (conversational capture) and §19 (proactive intelligence) are treated as more architecturally important than, say, response phrasing quality.

---

## 4. Core Interaction Contract

**[DECISION]** Every Ask Cozy request conceptually passes through up to eight stages; **not every stage executes for every request**, and the architecture must make "does this stage apply" a cheap, explicit decision rather than something buried in conditionals:

```
REQUEST → UNDERSTAND → CONTEXTUALIZE → DECIDE/RETRIEVE/EXECUTE → RESPOND → CAPTURE → PERSIST → RECOMMEND
```

**[DECISION]** Stage applicability is determined by two independent, already-partially-existing signals, not a new "which stages apply" classifier:

- **DECIDE/RETRIEVE/EXECUTE** applies whenever routing (deterministic or capability-selection) resolves to an operation — this is unconditional today and stays that way.
- **CAPTURE/PERSIST** applies whenever the (new, §7) conversational-understanding pass's cheap pre-filter fires *and* produces at least one candidate item after schema-constrained extraction. A pure question ("What needs my attention?") never reaches CAPTURE because the pre-filter doesn't fire; a pure statement ("I replaced my roof...") reaches CAPTURE even if DECIDE/EXECUTE resolved to nothing (`GROUNDED_GUIDANCE`); a compound message ("I serviced the HVAC yesterday for $275 — was that a fair price?") does both, independently, in the same turn.

This is the concrete mechanism the request asks for in §5: a simple question is `REQUEST → CONTEXTUALIZE → RESPOND → RECOMMEND` because the pre-filter never fires; "I serviced the HVAC yesterday for $275" is the full chain because it does. No new orchestration state machine is introduced — the two independent triggers (routing confidence, extraction pre-filter) already produce the right subset of stages as a side effect of running both passes on every turn.

---

## 5. Architecture Principles

Per §27 of the request, evaluated against Stage 1 evidence and this stage's decisions:

| # | Principle | Verdict | Why |
|---|---|---|---|
| 1 | Conversation is an interface, not the source of truth | **ACCEPT** | Matches §2's layering exactly; no evidence contradicts it |
| 2 | Domain services own domain logic | **ACCEPT** | Stage 1 found this mostly true already (refinance, HVAC) — extend, don't violate |
| 3 | Capabilities expose domain functionality to Cozy | **ACCEPT** | This is §13's entire design |
| 4 | Ask Orchestrator coordinates; it should not become another domain layer | **ACCEPT** | Directly actioned in §14 — the orchestrator's dispatch `switch` is the domain-layer violation being removed |
| 5 | Home knowledge is structured and persistent | **ACCEPT** | Matches Stage 1's finding that the primitives (`PropertyFactEvidence`, `HomeEvent`) already exist and are sound |
| 6 | Conversation history is not home knowledge | **MODIFY** | Accept as stated, but add a third category: **active workflow state** (`DecisionThread`, in-flight `parametersJson`/`captureRequests`) is neither conversation history nor home knowledge — it's transient-but-durable-across-turns state that must be modeled separately from both (§16) |
| 7 | Material writes require confirmation and idempotency | **ACCEPT** | Already a hard requirement per the existing Trust FRD (Stage 1 finding); this stage's confirmation convergence (§11, §17) strengthens rather than relaxes it |
| 8 | Provenance is first-class | **ACCEPT** | Stage 1 found the primitives exist (`PropertyFactSourceType`, `confidence`) but are conflated; §10 separates them without adding a new store |
| 9 | LLMs interpret and communicate; deterministic systems remain authoritative | **ACCEPT** | This stage's one new LLM surface (§8's extraction pass) is designed to this exact standard (§24) |
| 10 | Every meaningful response evaluates the next logical action | **ACCEPT** | §17 designs this as a first-class, context-driven step, replacing today's static per-operation strings |
| 11 | Proactive intelligence and reactive conversation use the same capability layer | **ACCEPT** | §19's `notifyWithAskContinuation` design is exactly this — one continuation mechanism, many producers |
| 12 | Do not create an agent where a capability is sufficient | **ACCEPT** | §25 makes this a checkable test, not a slogan, grounded in the one existing specialist agent's actual justification (Stage 1 finding) |
| 13 | Preserve useful existing architecture; remove weak boundaries where necessary | **ACCEPT** | This is why `GroundedAskProposal` is retired (a weak boundary — a whole parallel confirmation system) while `AskConfirmationReceipt`, `PropertyFactEvidence`, and `DecisionThread` are extended, not replaced |
| 14 | No production users means architectural cleanup can be favored over backward compatibility | **ACCEPT** | Directly licenses the `GroundedAskProposal` retirement and the `HomeEvent` schema extension — there is no migration audience to protect |

---

## 6. Current → Target Architecture

**[DECISION]** The logical target, per the request's required diagram shape, annotated with what's new vs. reused:

```
User / UI (AskWorkspace — KEEP)
    ↓
Ask Cozy Conversation Layer (AskExecution/AskSession — EXTEND)
    ↓
   ┌─────────────────────────────┬──────────────────────────────────┐
   │  Deterministic Routing       │  Conversational Understanding     │
   │  (regex → local classifier   │  [NEW] schema-constrained         │
   │   — KEEP, unchanged)         │  extraction, gated by a cheap     │
   │                              │  pre-filter — §7                  │
   └─────────────────────────────┴──────────────────────────────────┘
    ↓                                          ↓
Context Assembly (aggregation context — EXTEND, §15)      Candidate Items (typed, unconfirmed)
    ↓                                          ↓
Capability Invocation Layer [NEW — §13]         Confirmation Path (AskConfirmationReceipt — EXTEND, §11)
    ↓                                          ↓
Domain Services / Decision Engines (KEEP — refinance, HVAC, etc.)  →  Domain writes (HomeEvent, Warranty, PropertyFactEvidence — EXTEND, §12)
    ↓
Response Assembly (AskPresentationBlock — KEEP, §18)
    ↓
Next-Action Generation [NEW logic, existing contract — §17]
    ↓
Response to User
```

```
Background: Domain Event Outbox (KEEP) → per-type consumer (KEEP)
              → Insight decision (per-domain, KEEP) → notifyWithAskContinuation [NEW wrapper — §19]
              → pre-loaded AskExecution (askNotificationContinuation — EXTEND) → user sees a Cozy-initiated turn
```

**[DECISION]** This stays a monorepo/single-application architecture, per the request's constraint. Nothing here requires a new service boundary — the capability invocation layer, the extraction pass, and the confirmation convergence are all in-process additions to `apps/backend`.

---

## 7. Router vs. Conversational Understanding

**[FACT — Stage 1 + this pass]** Today: regex → local embedding classifier → closed operation catalog → `GROUNDED_GUIDANCE` fallback, whose own LLM call never extracts. Bounded, regex-based parameter extraction already exists for ~3 write operations (`extractMaintenanceTaskInput`, `extractMaintenanceCompletionInput`, `extractHouseholdInvitationInput`), scoped to that operation's fixed field set — this is a different mechanism from what's being designed here and should stay as-is.

**Alternatives considered (per the request's instruction not to assume "add an extraction stage" is automatically right):**

| Alternative | Why not chosen |
|---|---|
| **Extraction only as `GROUNDED_GUIDANCE` fallback** (Stage 1's implicit framing) | Fails the compound-message case: "I serviced the HVAC yesterday for $275, was that fair?" should both answer the question *and* capture the event. If extraction only runs on routing failure, it never runs here because routing likely succeeds (a maintenance-cost question plausibly matches an existing operation). |
| **Extraction before routing, routing conditioned on extraction output** | Adds a mandatory LLM round-trip to every message before the cheap deterministic path even gets a chance — regresses the (working, cheap, auditable) high-confidence command path's latency and cost for no benefit to those messages. |
| **Replace routing with a single LLM classifier that also extracts** | Rejected outright — this is exactly "prompt everything to an LLM," which both Stage 1 and this request's own LLM-boundary principle (§27 #9) reject. It would also throw away the routing-quality calibration harness (`askRoutingQualityEvaluator`) Stage 1 found already exists and works. |

**[DECISION]** Extraction runs **in parallel with routing, gated by a cheap deterministic pre-filter, on every property-scoped turn** — not before, not only-as-fallback:

1. Deterministic routing runs exactly as today (regex → classifier → confidence gate), **unchanged**, and independently decides which capability (if any) to invoke.
2. A cheap, deterministic pre-filter (regex/heuristic — presence of past-tense service/replacement verbs near a cost, date, or proper-noun pattern; explicitly *not* an LLM call) decides whether this message is worth sending to the extraction step at all. Most turns (a pure question, a routed command with no extra information) never trigger it.
3. If the pre-filter fires, one bounded, schema-constrained LLM call runs — output is a typed list of **candidate items**, each tagged with a category from §8's model, never free text. This call does not block or gate the routed response; it runs to produce a *second*, independent output attached to the same turn.
4. The routed response and the extraction's candidate items are merged into one `AskExecutionResponse`: the ordinary answer/action blocks, plus (if any candidates exist) confirmation-pending blocks for the extracted information (§11, §18).

**Why parallel, not sequential:** this is the only option of the four considered that supports a compound message doing both things in one turn without regressing the cost/latency of messages that already resolve to a high-confidence deterministic match today (Stage 1's traced examples: `HOME_ACTIONS` at 0.96, `REFINANCE_ANALYSIS` at 0.97 — Stage 1 did not establish what fraction of real traffic this represents, and this design does not depend on any particular fraction). The pre-filter is what keeps this cheap regardless of that fraction — a turn that never matches the pre-filter's pattern skips the LLM call entirely.

---

## 8. Intent vs. Information Model

**[DECISION]** The five categories the request specifies (intent, information, event, goal, command) are not five new operation-enum members — they are the **candidate-item categories** the §7 extraction step tags, each mapping onto an *existing* target (not a new universal type):

| Category | Example | Target representation |
|---|---|---|
| **Intent** | "Should I refinance?" | Routed operation (unchanged — this is what deterministic routing already handles) |
| **Command** | "Remind me to service the HVAC in October" | Routed write operation with parameter extraction (unchanged — the existing bounded regex mechanism, or its future migration into the general extractor, §7 note) |
| **Information (scalar fact)** | "My current mortgage rate is 6.75%" | `PropertyFactEvidence` via `capturePropertyFact` (existing factKey catalog, extended as needed — §10) |
| **Event** | "I replaced my roof last summer" | `HomeEvent` (+ linked `Expense`/`Warranty` as needed — §12) |
| **Goal / life event** | "I'm thinking about selling next year" | `DecisionThread` (existing model, reused — §16, §21) |

**[DECISION]** A single message produces **zero or more** candidate items across these categories, independently of what operation routing selected. This is why no new operation enum member is needed per statement type: the extraction schema has exactly five discriminated variants (matching the table above), each mapping to one existing persistence target, and the *routing* enum is untouched. Multiple intents in one message ("I replaced my roof for $14,500 — should I file a claim?") produce one routed operation (the claim question, if it clears the confidence floor) plus one event candidate item, handled independently and merged at response-assembly time.

---

## 9. Context Architecture

**[FACT — Stage 1]** `getAggregationPropertyContext` already exists as a scoped, versioned context-assembly layer with a `KNOWN`/`MISSING` fact model; `SEARCH_ASSISTANT` (Ask's scope) deliberately pulls a narrower slice than other consumers.

**[DECISION]** Context needs are determined by a two-part rule, extending the existing scope mechanism rather than replacing it:

1. **Operation-declared needs** — every skill already declares `requiredContextProviders`/`optionalContextProviders` per operation (Stage 1 finding, `skill.contract.ts`). This is the existing, correct mechanism for "what does this specific capability need" — **kept unchanged**.
2. **Extraction-pass needs** — the new §7 extraction step needs a bounded, cheap context slice to disambiguate what it reads (e.g., knowing there's an existing `roofType` fact helps it decide "roof replacement" refers to the roof, not a generic "replaced X" statement). **[DECISION]** extend `SEARCH_ASSISTANT`'s scope list (today `['CORE', 'LOCATION', 'PRODUCT_CONTEXT']`) to include `STRUCTURE` and `EVENTS`, since the extraction step's job is precisely to reconcile new statements against existing structure/event facts. This is a config change to an existing mechanism, not a new context system.

**[DECISION]** Freshness/caching/latency/authorization all stay owned by the existing aggregation-context service — nothing here requires a new caching layer. Missing information surfaces through the existing `MISSING` fact state, which §17 (next actions) and §26 (cold start) both consume directly rather than inventing a second "what's missing" signal.

---

## 10. Capability Architecture

**[FACT — Stage 1 + this pass]** 26+ skill packages exist with manifests (`SkillDefinition` — id, domain, operations, `allowedAdapters`, `consumerPolicy`, `autonomyLevel`, `riskPolicy`, `contextBudget`, `dependencies`); `skillAdapterRegistry.ts` declares 56+ adapters (`SkillAdapterDefinition` — canonicalOwner, allowedOperations, effect, idempotencyPolicy, timeoutMs, retrySafety); `skillExecutionBinding.ts` builds and validates a descriptive, hash-pinned binding. **None of this resolves to a callable function anywhere** — confirmed by this pass: `inputContract`/`outputContract`/`canonicalOwner` are plain strings for documentation, not type or import references, and dispatch happens through a completely separate, code-disconnected `switch (operationId)` in `askOrchestrator.service.ts`.

**[FACT — this pass, not previously found in Stage 1]** Handler signatures behind that `switch` are **not uniform**: `refinanceAnalysisResult(userId, propertyId)` (2 args), `maintenanceTaskCreateResult(userId, propertyId, message, suppliedInput?)` (4 args), `quoteComparisonCreateResult(propertyId, message)` (2 args, no `userId`), `replacementGuidanceResult(userId, propertyId, message, focusedInventoryItemId, executionId)` (5 args) — different argument counts, orders, and optionality across ~20 sampled handlers. This changes the shape of the fix: a generic `capability.invoke(id, envelope)` cannot call these directly.

`productFramework/capabilities` is confirmed a separate ID namespace (`CapabilityIdSchema` is a plain `z.string()`, not tied to `AskOperationId`) and a pure navigation/recommendation catalog — no invoke path, kept as-is (§30).

This is Stage 1's most important finding and this stage's most important design decision — detailed in §11.

---

## 11. Capability Invocation Contract

**[DECISION]** Add exactly two things that do not exist today; reuse everything else:

**(a) A handler registry** — a plain `Record<AskOperationId, CapabilityHandler>` map, where `CapabilityHandler` is a normalized function type:

```ts
type CapabilityInvocationEnvelope = {
  userId: string;
  propertyId: string;
  message: string;
  executionId: string;
  launchContext?: AskLaunchContext;
  suppliedInput?: Record<string, unknown>;   // capture-answer or resumed-parameter data
};

type CapabilityHandler = (envelope: CapabilityInvocationEnvelope) => Promise<AskOperationResult>;
```

**(b) A thin per-operation shim** wrapping each existing handler function, destructuring the common envelope into that handler's actual (non-uniform) positional signature. This is the concrete, unavoidable cost the non-uniform-signature finding (§10) imposes — there is no way to avoid touching every existing handler once, but each shim is a one-line adapter (`(envelope) => refinanceAnalysisResult(envelope.userId, envelope.propertyId)`), not a rewrite of the handler itself.

**[DECISION]** `capability.invoke(operationId, envelope)`:
1. Looks up `getSkillAdapterForOperation(operationId)` (existing, `skillAdapterRegistry.ts:110-112`) and `resolveEffectiveSkillOperationPolicy` (existing) for authorization/risk metadata — **unchanged, reused as-is**.
2. Looks up the handler in the new registry by the adapter's `id` (the string ids already exist and are unique per Stage 1's finding — this pass confirms no collisions).
3. Calls the shim, gets back `AskOperationResult` — the one already-uniform part of the contract (every handler already returns this today).
4. Emits the same `SkillExecutionBinding` audit record the existing `skillExecutionBinding.ts` already knows how to build — **unchanged**.

**[DECISION]** `askOrchestrator.service.ts`'s dispatch collapses from a ~40-case `switch` containing domain glue to a single call: `return capability.invoke(operation.operationId, envelope)`. Adding a new capability going forward means registering a shim + a skill/adapter definition (both already-existing registration patterns) — **no orchestrator edit required**, which is exactly Stage 1's Test 8.

**[FUTURE, not required now]** Migrating the ~40 existing handlers to accept the envelope shape natively (eliminating the shim layer entirely) is a worthwhile cleanup but not required for the target architecture — the shim layer is a legitimate permanent adapter boundary, not just a migration aid, since third-party-shaped handlers (if any are ever added) will always need one.

This directly satisfies §14's requirement to identify what leaves the orchestrator: **all domain-service invocation logic** leaves; the orchestrator's remaining job is defined next.

---

## 12. Future Ask Orchestrator Responsibilities

**[DECISION]** Per principle 4 (§5) and the request's explicit instruction to define module boundaries, the orchestrator retains exactly these responsibilities and no others:

| Responsibility | Stays in orchestrator? | Where it goes if not |
|---|---|---|
| Conversation state (create/update `AskExecution`/`AskSession`) | **Yes** | — |
| Routing (deterministic + the new extraction trigger) | **Yes**, but calls out to `askRoutingCascade.ts` (already separate) and the new extraction module (§7) | Extraction logic itself lives in a new `services/ask/conversationalUnderstanding/` module, not inline in the orchestrator |
| Capability selection | **Yes** — this is "which operationId," a routing decision | — |
| **Execution coordination (domain glue)** | **No — removed** | `capability.invoke` (§11) |
| Response assembly (`AskPresentationBlock` construction) | **Yes**, but each capability handler returns its own blocks; the orchestrator only appends cross-cutting blocks (evidence, boundary, next-actions) | — |
| Capture coordination (candidate items → confirmation-pending blocks) | **Yes** — this is conversation-layer glue, not domain logic | — |
| Next-action generation | **No — new dedicated module** (§17) | `services/ask/nextActions/` |
| Trust/safety validation | **Yes**, unchanged (`askAnswerTrustValidator`, `askSemanticAnswerValidator` stay exactly where they are) | — |

**[DECISION]** The file itself should be decomposed along these lines as a structural refactor (still one module/directory, not a new service): `askOrchestrator.service.ts` becomes a coordinator importing `capability.invoke`, the extraction module, and the next-action module, rather than containing all of their logic inline. This is the concrete answer to "what leaves the 10K-line file": the ~40 handler function bodies (moved to their respective skill packages, which is where most of their real logic already calls into anyway) and the next-action string tables (moved to §17's module).

---

## 13. Conversational Capture Architecture

**[DECISION]** The pipeline the request specifies in §9, mapped to concrete stages and owners:

```
Message
 ↓ (§7 pre-filter + extraction)
Candidate items (typed: fact | event | goal — §8)
 ↓ (domain mapping — per category, see §9/§12 below)
Validation (Zod, per target model's existing schema — capturePropertyFact's factKey schemas, HomeEvent's field types)
 ↓
Provenance tagging (§14: source=USER_REPORTED always for homeowner statements; channel=CONVERSATION; extraction confidence from the LLM call)
 ↓
Confirmation (§11 of this doc — via AskConfirmationReceipt, not GroundedAskProposal)
 ↓
Persistence (existing atomic primitives: capturePropertyFact, or a new equivalent transactional writer for HomeEvent+Warranty — §12)
 ↓
Knowledge update (existing PROPERTY_FACT_CHANGED domain event → intelligenceRecompute — unchanged)
```

**[DECISION]** Per-category target model, addressing the request's explicit list:

| Information type | Target model | New schema needed? |
|---|---|---|
| Scalar property fact | `PropertyFactEvidence` via `capturePropertyFact` | No — extend factKey catalog only |
| Home event (completed, dated) | `HomeEvent` (`isRetrospective=true`) | Small, precedented — §14 |
| Maintenance event (recurring/planned) | `PropertyMaintenanceTask` (existing regex-extraction path, §7 note — unchanged) | No |
| Expense (standalone, not tied to an event) | `Expense`, linked via `HomeEvent.expenseId` if an event exists | No |
| Service-provider information | `HomeEvent.providerName` (new field, §14) or `Warranty.providerName` (existing) | Small addition on `HomeEvent` only |
| Warranty information | `Warranty` (existing model — has `providerName`, `cost`, dates) | Small — add `HomeEvent.warrantyId` link, §14 |
| Homeowner plans / goals | `DecisionThread` (existing) | No |
| Preferences | Existing preference models per domain (e.g., HVAC's `decisionPreferenceService` — Stage 1 finding); no general "preference" store is introduced | No |
| Decisions | `DecisionThread`/`RecommendationSnapshot` (existing, Stage 1 finding) | No |
| Uncertain / third-party-attributed information | Same target models, tagged via the confidence/attribution fields in §14 — **not** a separate storage tier | No — this is a field-level distinction, not a model-level one |

**[DECISION, directly answering the request's warning]** No new universal knowledge database is introduced. Every category above maps to a model that already exists; the only schema changes anywhere in this document are the two narrow additions in §14.

---

## 14. Fact/Event Persistence Model & Compound Information

**[FACT — this pass]** `HomeEvent` already has `amount` (Decimal), `occurredAt`/`datePrecision` (supports `MONTH`/`RANGE`/`UNKNOWN` — "last summer" fits natively), and `isRetrospective` (a boolean explicitly built, per an inline schema comment, for historical self-reported records — `schema.prisma:7488-7491`). It has **no** provider field and **no** relation to `Warranty`. `Warranty` has `providerName` (required) and `cost` (optional) but no relation back to `HomeEvent`. The established repo pattern for provider identity is a denormalized plain-text field independently repeated on `Warranty.providerName`, `Claim.providerName`, and `ProjectRecord.contractorName` (all confirmed in this pass) — never a required FK to a central vendor directory (`ProviderProfile` exists but is optional/supplementary everywhere it's used).

**[DECISION]** Two narrow, precedented schema additions — not a new table, not a new universal model:

1. `HomeEvent.providerName: String?` — a fifth denormalized-provider field, consistent with the exact pattern already used three times elsewhere in this schema.
2. `HomeEvent.warrantyId: String?` (FK → `Warranty`) — a fifth optional related-record link, consistent with `HomeEvent`'s existing pattern of optional links to `Claim`, `Expense`, and `ProjectRecord` (`claimId`, `expenseId`, `projectId` all already exist on this exact model).

**[DECISION]** The conversation-capture layer (§13), not a new domain service, orchestrates the compound write for "I replaced my roof last summer for $14,500 with ABC Roofing, 10-year warranty":

```
One transaction:
  1. Create HomeEvent { isRetrospective: true, occurredAt: <derived>, datePrecision: MONTH,
                         amount: 14500, providerName: 'ABC Roofing', type: <roof-replacement type>,
                         sourceType: USER, observationKind: USER_REPORTED,
                         verificationStatus: PENDING_CONFIRMATION }
  2. If a warranty duration was extracted: create Warranty { providerName: 'ABC Roofing', cost: null,
                         startDate: <event date>, expiryDate: <+10 years>, propertyId }
     and set HomeEvent.warrantyId to the new Warranty's id.
  3. emitPropertyChangeWithTransaction(...) — reusing the existing PropertyChange fan-in
     (typed FK via canonicalEventId, which HomeEvent already supports) so this shows up in
     the homeowner's briefing/history UI for free, exactly as any other HomeEvent would.
```

This is a genuinely new transactional writer function (not `capturePropertyFact`, which is scoped to scalar `Property` fields) — but it is a thin orchestration function, not a new domain model, and it reuses `HomeEvent`'s existing evidence/verification/supersession machinery (`HomeEventEvidence`, `HomeEventVerificationRecord`) for the confirmation step in §11.

**[FUTURE, not required now]** A `ProjectRecord` could eventually represent a roof replacement instead of a bare `HomeEvent` if the homeowner wants the fuller project-lifecycle tracking (permits, change orders) — the target architecture doesn't need to decide this now because both paths converge on the same `PropertyChange` fan-in.

---

## 15. Provenance & Confidence Model

**[FACT — Stage 1, corrected during audit review]** Four independent, partially-conflated provenance vocabularies exist today (`PropertyFactEvidence.sourceType`, `HomeEvent.sourceType`/`sourceBadge`/`observationKind`, `SignalProvenance`, `ExtractedFactCandidate`). The audit's own correction established that **source**, **capture channel**, **extraction confidence**, and **confirmation state** must be four independent axes — not folded into a new lower-trust "chat" source value.

**[DECISION]** For conversational capture specifically, map the four axes onto **existing** fields, adding only what's missing:

| Axis | Field | Status |
|---|---|---|
| Source (who supplied it) | `sourceType: USER_REPORTED` (on `PropertyFactEvidence`) / `sourceType: USER` (on `HomeEvent`) | **Existing** — unchanged, a homeowner's chat statement is `USER_REPORTED` exactly like a form submission |
| Capture channel (how C2C received it) | **New**: a `captureChannel` value (`CONVERSATION` \| `FORM` \| `DOCUMENT` \| `INTEGRATION`) | **[DECISION]** add as a field on `PropertyFactEvidence` and `HomeEvent` — small, additive, does not touch `sourceType`'s existing values or consumers |
| Extraction confidence (how sure was the parse) | **New**: reuse `PropertyFactEvidence.confidence`/`HomeEvent.confidenceScore` for this specific meaning going forward — but **only for conversationally-captured rows** | **[DECISION, with the audit's caution applied]**: before repurposing these fields, this pass confirms `decideFactMerge`'s only current *consumer* of `PropertyFactEvidence.confidence` is its own priority-arbitration logic (Stage 1 finding) — assigning extraction confidence to this field for conversational rows does not conflict with that consumer, since arbitration already treats confidence as "how much to trust this value," which extraction confidence directly answers. **[DECISION]** `HomeEvent.confidenceScore` gets the same treatment. No new confidence field is introduced. |
| Confirmation state | `HomeEvent.verificationStatus: PENDING_CONFIRMATION → HOMEOWNER_CONFIRMED` (already exists, exactly fits); `PropertyFactEvidence.verifiedAt` (already exists) | **Existing** — unchanged |

**[DECISION]** Confidence never bypasses confirmation, per the existing Trust FRD requirement (Stage 1 finding) and principle 7 (§5): every conversationally-captured item reaches `PENDING_CONFIRMATION`/awaits an `AskConfirmationReceipt` regardless of extraction confidence score. Confidence is used only to (a) pre-fill the confirmation prompt's default value and (b) decide whether the extraction step should proactively ask a disambiguating question before even proposing a value (low confidence → ask; high confidence → propose directly) — never to skip the confirmation step itself.

---

## 16. Confirmation & Transaction Safety

**[FACT — this pass]** `AskConfirmationReceipt` is keyed strictly on `executionId` (required FK, two unique constraints anchored on it) and implements a genuine three-phase saga: **claim** (one transaction: flip execution to `RUNNING`, create the receipt with a 60-second lease, log an event; content-hash-based race resolution on conflict), **execute** (the actual domain write, outside any transaction the receipt owns — each domain write is responsible for its own atomicity), **complete** (one transaction: flip execution to its final status, update the receipt to `COMPLETED`, log completion events; idempotent replay via hash comparison). Crash recovery re-claims via lease expiry with an incrementing attempt count, never a silent reset. `GroundedAskProposal` has **no** FK to `AskExecution`/`AskSession` at all — `sessionId` is an uncorrelated string.

**Alternatives for convergence:**

| Option | What it requires | Tradeoff |
|---|---|---|
| **(a) Make `AskConfirmationReceipt` polymorphic** — add nullable `proposalId` alongside `executionId`, mirror the unique constraint | Small schema change; every claim/complete call site needs an either/or branch | Keeps "proposal" as a distinct concept from "execution," but permanently two-headed |
| **(b) Retire `GroundedAskProposal`; route captured items through `AskExecution`** | Bigger one-time change; no schema change to `AskConfirmationReceipt` at all | Reuses the entire existing saga (claim/execute/complete/recovery) with zero new code; consistent with principle 13/14 (remove weak boundaries, no migration audience to protect) |

**[DECISION]** Option (b). A candidate item proposed by the §7 extraction step is not a separate database row in a separate table — it is a new `AskExecution` created in `NEEDS_CONFIRMATION` status (a status this enum already has), with the candidate payload in `parametersJson` (a field `AskExecution` already has for exactly this purpose — Stage 1 finding: it's where capture-answer state already lives) and a new operation family (`CAPTURE_FACT_CONFIRM`, `CAPTURE_EVENT_CONFIRM`) in the operation registry. Confirming it is an ordinary `confirmAskExecution` call through the **existing, unmodified** `AskConfirmationReceipt` saga. `GroundedAskArtifact`'s role (recording what was created) is already covered by the receipt's own `artifactType`/`artifactId` fields (Stage 1 finding: these already exist on the receipt).

**[DECISION]** `GroundedAskProposal`/`GroundedAskArtifact` are **retired** (§30) — their concept is fully absorbed into the execution/receipt model with strictly more correctness (atomic claim, lease recovery, content-hash conflict detection) and zero new schema.

**[DECISION]** Corrections/undo: reuse `AskDomainCommandRegistry`'s existing `correctionModes` vocabulary (`EDIT`/`PAUSE`/`RESUME`/`STOP`/`REVERSE`/`REOPEN`/`REVOKE`) for captured facts too — a confirmed `HomeEvent` gets a `REVERSE` correction mode (creating a superseding `HomeEvent` revision via the model's existing `supersedesEventId`/`isCurrent` chain, not a hard delete), consistent with how the model already tracks corrections.

**[FACT — this pass, flagged as a real bug to fix regardless of the above]** `askDomainCommandRegistry.ts` declares `correctionModes` as pure metadata with **no dispatch/handling logic in that file** — the actual mode implementations, if they exist, are elsewhere in `askOrchestrator.service.ts` and were not verified in this pass. **[DECISION]** Stage 3 must confirm whether a generic correction handler exists or whether corrections are hand-written per command before assuming this mechanism is reusable as designed above.

---

## 17. Multi-Turn Conversation State

**[FACT — this pass]** `AskSession` has no topic/goal field beyond a free-text `title`. `resolveAskFollowUpMessage` is a narrow, four-regex-gated rewrite operating on the single most recent execution within a 30-minute window — not general context carryover. Capture-request resumption (`submitAskCapture`) is a **structured, non-conversational API**: the client must already know the exact `requirementId`/`captureKey` from the prior response; it is restricted to 15 hardcoded operation IDs; resuming means re-running the original message with more parameters, not processing a new turn. `GroundedAskProposal` has zero query path for "pending proposals in this session" — nothing resurfaces an open proposal on the next turn today.

**Critically: `DecisionThread` + `DecisionThreadExecutionLink` already exist** as a durable, cross-turn, multi-participant workflow model — `DecisionThreadExecutionLink` is a join table letting many `AskExecution` rows across many turns attach to one thread, with optimistic concurrency (`version`), an `activeIdentityKey` enforcing one active thread per `(property, decisionDefinition, entity)` tuple, and an explicit "read receipt" (`lastChangeAcknowledgedSnapshotId`) for surfacing changes mid-thread rather than silently consuming them. Today it is used only for HVAC decisioning.

**[DECISION]** Three explicitly separated layers, per the request's requirement:

| Layer | Model | Scope | Durability |
|---|---|---|---|
| **Conversation history** | `AskExecution` rows | One session | Ephemeral (existing retention/cleanup via `askRetentionCleanup.ts`) |
| **Active workflow state** | `DecisionThread` + `DecisionThreadExecutionLink` | One goal, across sessions | Durable until the goal resolves (`DECIDED`/`COMPLETED`/`ABANDONED`) |
| **Persistent home knowledge** | `PropertyFactEvidence`, `HomeEvent`, `Warranty`, etc. | The home | Durable forever |

**[DECISION]** `DecisionThread` becomes the general-purpose target for **any** multi-turn goal, not only HVAC — a "life event" candidate item (§8) creates or attaches to a `DecisionThread` (new `goalCode`s: `SELL_HOLD_RENT`, `RENOVATION`, `CLAIM`, `REFINANCE` — reusing the existing enum-extension pattern, not a new model). **[DECISION]** Add one small, additive field: `AskSession.activeDecisionThreadId: String?` — a cheap pointer so a session can answer "what's my current goal" without querying the join table every turn; this does not change `DecisionThreadExecutionLink`'s existing many-to-many semantics, it's a convenience cache on the session side.

**[DECISION]** No raw historical transcript is ever sent to an LLM. The §7 extraction step and any future conversational reasoning consume: the current message, the bounded aggregation context (§9), and — when a `DecisionThread` is active — that thread's already-structured state (`factReferences`, `assumptions`, `options`, `questions`), never a list of prior raw messages. This is what keeps context bounded as conversations grow long, and it reuses a model that already enforces exactly this discipline for HVAC decisioning today.

---

## 18. Response / Generative UI Architecture

**[FACT — Stage 1]** `AskPresentationBlock` is a ~20-variant discriminated union already supporting summaries, tables, timelines, comparisons, decision traces, evidence, and boundaries — a real generative-UI contract, confirmed strong and not requiring replacement.

**[DECISION]** Two new block types, additive to the existing union (no breaking change to existing consumers):

- `FACT_CONFIRMATION` — renders a candidate item (from §7/§13) as a reviewable card: extracted value, source snippet, confidence label, confirm/edit/reject actions. This is the UI surface for the `NEEDS_CONFIRMATION`-status executions from §16.
- `PROACTIVE_INSIGHT` — renders a Cozy-initiated turn (§19) distinctly from a user-initiated one (a visual "Cozy noticed something" framing), reusing the existing `SUMMARY`+`WORKFLOW_PROGRESS` combination Stage 1 found `askNotificationContinuation` already builds, just with a distinguishing wrapper block.

**[DECISION]** Every response still assembles from existing block types wherever possible — the two additions above are the only new surface needed to support this stage's product requirements (conversational capture confirmation, proactive insight framing). Traditional UI (§21) remains the place for bulk review/editing; Cozy's blocks are for in-conversation confirmation and summary, not full CRUD.

---

## 19. Contextual Next-Action Architecture

**[FACT — Stage 1, corrected during audit review]** Next actions today are static, hand-picked strings per operation; `GROUNDED_GUIDANCE` does supply one generic suggestion but it is not capability-derived, and it passes through the same repeat-suppression filter (`suppressRepeatedAskSuggestions`) every operation's suggestions do.

**[DECISION]** Next-action generation becomes a dedicated module (§12) consuming exactly the five inputs the request specifies, each already available from an existing source — no new data collection required:

```
NextActions(operationResult, context, missingFacts, capabilities, activeThread)
  where:
    operationResult   = the AskOperationResult just produced (existing)
    context           = aggregation context's KNOWN/MISSING facts (existing, §9)
    missingFacts      = context.facts filtered by state === MISSING (existing)
    capabilities      = the skill registry's declared operations, filtered by
                         consumerPolicy allowing ASK and authorizationFloor met (existing metadata, §10)
    activeThread      = AskSession.activeDecisionThreadId's thread state, if any (new pointer, §17)
```

**[DECISION]** The generation rule is deterministic, not another LLM call: for each capability whose `requiredContextProviders` are satisfiable by combining `context` + the just-produced `operationResult`, and whose `consumerPolicy` includes `ASK`, propose it as a next action if it is not already suppressed by `askSuggestionPolicy.ts`'s existing repeat-filter. This directly fixes Stage 1's two named gaps: `GROUNDED_GUIDANCE` gets real suggestions once it's included in this capability-scan (rather than excluded from `OPERATIONS_BY_CAPABILITY` as today), and the sell/hold/rent → Seller Prep gap closes automatically once Seller Prep is registered as a capability (§22) with `SELL_HOLD_RENT_ANALYSIS`'s output satisfying its context requirements.

**[DECISION]** A next action, when clicked, resumes state via the mechanisms already designed above: if it targets an open `DecisionThread`, it attaches via `DecisionThreadExecutionLink`; if it targets a pending capture, it becomes a new `AskExecution` referencing the same `AskConfirmationReceipt` flow (§16) — no new "resume" mechanism is introduced beyond what §16/§17 already establish.

---

## 20. Proactive Intelligence Architecture

**[FACT — this pass]** `askNotificationContinuation`'s `operationId` parameter is hardcoded to a 2-member union (`REFINANCE_ANALYSIS`\|`MAINTENANCE_STATUS`). Its two current callers are structurally identical copy-pasted wrappers (both build a fallback URL, call `createAskNotificationContinuation`, then call `NotificationService.create()` separately, both degrading gracefully on failure) — no shared helper exists today. `NotificationService.create()` has no required category/urgency and no built-in Ask-continuation step. The `DomainEvent` outbox has a working claim/lease/retry/dead-letter poller (30s interval) with a hardcoded per-type `switch` dispatch — adding a new event type means adding a case, not registering a handler (and this pass found the `DomainEventType` union is duplicated, uncomfortably, between the emitter and the consumer worker file — a pre-existing bug worth flagging for Stage 3, unrelated to this design). Incidents notify through one indirection layer (`IncidentNotificationService`) that still calls `NotificationService.create()`. **Home Event Radar bypasses `NotificationService` entirely** — it writes `Notification` rows directly at its own decision/materialize boundary, with its own dedup/urgency logic. Home Habit Coach currently sends zero notifications through any path.

**[DECISION]** One new, small, generic wrapper, eliminating the duplication found:

```ts
notifyWithAskContinuation(input: {
  userId, propertyId, triggerKey, operationId: AskOperationId,  // widened from the 2-member union
  question, reasonCode, title, body, tone, details, domainAction, parameters, suggestions,
  notification: { type, category?, urgency?, deduplicationKey?, channels? }
}): Promise<void>
```
— internally calling `createAskNotificationContinuation` then `NotificationService.create()`, exactly replacing the two existing callers' hand-written boilerplate.

**[DECISION]** This wrapper is inserted at the **domain-event consumer's per-type handler boundary** (`processDomainEvents.job.ts`'s existing `switch`), not required of every intelligence engine individually — since every event type already funnels through this one choke point, adding the continuation call there (for event types whose handler decides the insight is user-facing) reaches every current and future producer without asking each one to implement bespoke Ask logic, satisfying the request's explicit requirement.

**[DECISION]** Home Event Radar is the one exception requiring an actual change (not just a new call site), because it bypasses the outbox pattern entirely. **[DECISION]** Migrate its notification path to publish a `DomainEvent` at the decision/materialize boundary instead of writing `Notification` directly — bringing it onto the same standard rail as every other producer. This is the single highest-leverage proactive-intelligence fix identified in this document, since it's both the system Stage 1 found "most complete and most disconnected" and the one whose absence (per Stage 1's Scenario A trace) currently makes "what needs my attention" blind to hazards.

**[DECISION]** Per-domain relevance/prioritization logic (radar's `radarNotificationDecision.service.ts`, incidents' evaluator) is **kept as-is** — it is genuinely domain-specific and should not be centralized. What's standardized is only the *output contract* each domain's decision step must produce before calling the new wrapper: `{title, body, tone, urgency, domainAction, suggestedOperationId, parameters}` — the same shape `createAskNotificationContinuation` already expects today.

---

## 21. Insight Lifecycle

**[DECISION]** No new "Insight" model or lifecycle abstraction is introduced. The existing pipeline — `DomainEvent` outbox (signal) → per-type consumer handler (evaluate) → domain-specific decision service (determine relevance/prioritize) → §20's `notifyWithAskContinuation` (surface through Cozy) → homeowner responds via the ordinary `AskExecution`/confirmation flow (continue) → the domain's own resolution state (`Incident.status`, `RadarNotificationDecision.outcome`, etc.) tracks resolve/dismiss/monitor — **already implements every stage the request's lifecycle diagram specifies**. The only gap, closed in §20, is that this pipeline isn't uniformly wired to Ask. This avoids the request's own explicit warning against duplicate notification systems.

---

## 22. Three-Jobs Architecture

**Job 1 — "Tell me what needs my attention."** **[FACT — Stage 1]** `HOME_ACTIONS` currently excludes Home Event Radar entirely (zero references in the feed's source files). **[DECISION]** `getHomeActionFeed`'s aggregation is extended to also pull radar-promoted `Incident` rows (Stage 1 confirmed radar already promotes matches into `Incident`) through the same dedup mechanism it already uses for `PropertyMaintenanceTask`/`OperationalWorkItem` — Job 1 becomes a genuine cross-system aggregation rather than one feature's feed, without a new read model.

**Job 2 — "Help me make the right home decision."** **[DECISION]** No change needed to the pattern — refinance and HVAC are already the reference implementations (Stage 1 finding). The capability invocation layer (§11) is what makes it cheap to add the *next* decision capability to this list without another 40th orchestrator branch.

**Job 3 — "When something major happens."** **[DECISION]** Represented by `DecisionThread` (§17) — a life-event statement creates or attaches to a thread; subsequent turns naturally link via `DecisionThreadExecutionLink`; the orchestrator checks `AskSession.activeDecisionThreadId` to bias routing/next-actions toward the active goal (e.g., once a `SELL_HOLD_RENT` thread is open, a vague follow-up question is more likely resolved toward Seller Prep than a cold classifier guess would manage alone) — this is the mechanism that lets Test 4 (§35) pass without the homeowner needing to know Seller Prep exists.

---

## 23. Existing Capability Integration Decisions

Applying the request's test — *does exposing this materially improve one of the Three Jobs* — to each system Stage 1 found unwired:

| Capability | Classification | Reasoning |
|---|---|---|
| **Home Event Radar** | **Expose now** | Directly required by Job 1's fix above and by Stage 1's Test 3 (storm-risk question) — the two highest-priority quality-test failures both trace to this one gap |
| **Seller Prep** | **Expose now** | Directly required by Test 4 (life-event without knowing the feature exists) — trivial to wire once `DecisionThread`'s `SELL_HOLD_RENT` goal exists as the trigger, since `SellerPrepService` is already UI-decoupled (Stage 1 finding) |
| **Personalization** | **Expose later** | Internally clean and isolated, but no Stage 1 evidence ties it to a specific Three-Jobs gap or a quality-test failure — wire once the capability layer (§11) exists so it's one clean registration, not a bespoke branch added to the old orchestrator |
| **Home Renovation Advisor** | **Do not expose directly yet** | Stage 1 found a real naming-collision risk: `RENOVATION_PERMIT_READINESS` already calls a thinner sibling (`permitTracker`/`renovationCase`). Wiring the richer engine in without first resolving whether it replaces or supplements that sibling risks maintaining two competing implementations behind one operation — Stage 3 must resolve this before exposure, not this stage |

---

## 24. LLM Boundary

**[FACT — Stage 1]** Routing is 100% deterministic; both existing live LLM calls (`synthesizeAskResult`, `selectAskRemoteFallbackTypedClaims`) are schema-constrained, temperature-near-zero, and explicitly instructed never to invent facts.

**[DECISION]** The one new LLM surface introduced by this stage — §7's extraction pass — is held to the same standard, concretely:

- **Schema-constrained output:** a strict Zod schema mirroring §8's five candidate-item categories; the model cannot emit free text, only typed candidates with required fields per category.
- **Validation:** every candidate item is validated against its target model's existing schema (the same `capturePropertyFact` factKey Zod schemas, `HomeEvent`'s field types) before ever becoming a `NEEDS_CONFIRMATION` execution — an invalid candidate is dropped, not coerced.
- **Bounded authority:** extraction produces proposals only; it has no write path of its own. The confirmation step (§16) is the only path to persistence, and it's the existing, unmodified `AskConfirmationReceipt` saga.
- **Provenance:** every candidate item carries its extraction-confidence score (§15) from the moment it's produced, before any human sees it.
- **Fallback behavior:** if the extraction call errors or times out, the turn's ordinary routed response still returns unaffected — extraction is additive, never blocking (§7).
- **Observability:** extraction attempts/outcomes are logged the same way `askRoutingQualityEvaluator` already logs routing decisions (Stage 1 finding) — reusing the existing calibration-harness pattern rather than building a second one.

**[DECISION]** Everything else stays exactly as Stage 1 found it: refinance math, HVAC decisioning, and every other deterministic engine remain the source of truth; the LLM never becomes an alternate path to a number or a decision an engine already produces.

---

## 25. Capability vs. Agent Decision Framework

**[FACT — Stage 1]** The one existing specialist agent (HVAC repair/replace) is justified by durable state that survives many turns, a bounded tool-calling loop (`REQUEST_CONTEXT`/`REQUEST_DOCUMENT`/`SCORE`/`EXPLAIN`), an autonomy ladder explicitly capped at 1, and its own invocation audit trail — and it was deliberately scoped narrowly (an inline comment excludes `SCHEDULE_FOLLOW_UP` from v1 read/recommend autonomy).

**[DECISION]** A capability graduates to a specialist agent only when **all four** of the following hold — otherwise it stays a capability invoked through §11's layer:

1. The decision genuinely evolves across many turns in a way a single command+confirmation cannot capture (not merely "the user might ask follow-up questions" — `DecisionThread` alone already handles that for every other domain).
2. It needs a bounded, typed tool-calling loop, not just "call a domain service and return."
3. Autonomy must be explicitly capped below full automation (a human confirms before anything material happens, same as everywhere else, but the *reasoning path* itself is multi-step and stateful).
4. It needs its own invocation audit trail beyond the standard `AskExecutionEvent`/`AskConfirmationReceipt` audit every other write already gets.

**[DECISION]** Given `DecisionThread` is now the general-purpose long-lived-goal container (§17), most "major event" workflows — selling, buying, renovating, filing a claim — satisfy the product need (multi-turn, stateful) via a `DecisionThread` plus ordinary capability invocations tied to it, **without** meeting criterion 2 or 3 above. No new agent is warranted for any of them under this framework. This directly operationalizes principle 12 (§5) as a checklist rather than a slogan, and it means Stage 3 should not treat "the product is becoming agentic" as license to add a Roof/Mortgage/Insurance/Seller agent — the HVAC pattern remains the reference for the rare case that actually needs it, not the template to replicate per domain.

---

## 26. Traditional UI Role

**[DECISION]** Accept the division as framed in the request, grounded in one Stage 1 fact: `AskWorkspace.tsx` is already "a stateful workflow UI, not a chat transcript" — meaning the current UI already blends conversational and structured interaction rather than being a pure chat window. **[DECISION]** Cozy remains the primary surface for intent, conversational capture, decisions, next actions, and proactive insight; traditional/structured pages remain the surface for reviewing the full home record, editing structured details directly, comparing complex scenarios side-by-side, document libraries, dashboards, audit history, and bulk management. **[DECISION]** Every capability that writes something material through Cozy (§16) must have a corresponding traditional-UI location where that same fact/event can be reviewed and corrected outside a conversation — this is the concrete answer to "how do users undo/correct prior information": conversational capture is never the *only* way to fix a fact once persisted, satisfying the request's own emphasis on this in §11.

---

## 27. Cold-Start Strategy

**[FACT — Stage 1]** RentCast enrichment is already a clean, ready-to-extend service that backfills structural property facts automatically; aggregation context already reports `MISSING` for anything not yet known.

**[DECISION]** No new onboarding flow. Cold start is handled by composing three already-existing/already-designed mechanisms: (1) RentCast continues backfilling structural facts automatically in the background, unchanged; (2) when a homeowner asks a decision question and required context is `MISSING`, §19's next-action generation surfaces "tell me about X" as a **conversational** prompt (not a form link) — reusing the existing `captureRequests`/slot-filling mechanism refinance's `NEEDS_CONTEXT` flow already proves works; (3) every natural statement the homeowner makes along the way is captured via §13's pipeline regardless of whether they were prompted for it. The product becomes more valuable as these three sources accumulate — no extensive form is ever a prerequisite, per the request's explicit constraint.

---

## 28. KEEP / EXTEND / REFACTOR / REPLACE / RETIRE Matrix

| Component | Verdict | Target role |
|---|---|---|
| `AskWorkspace.tsx` | **KEEP** | Primary Cozy surface; gains rendering for the two new block types (§18) |
| `AskExecution` | **EXTEND** | Becomes the home for captured candidate items too (§16), not just routed operations |
| `AskSession` | **EXTEND** | Gains `activeDecisionThreadId` pointer (§17) |
| `AskPresentationBlock` | **KEEP** | Gains `FACT_CONFIRMATION` and `PROACTIVE_INSIGHT` variants (§18) |
| Ask Orchestrator (`askOrchestrator.service.ts`) | **REFACTOR** | Sheds domain-glue dispatch to `capability.invoke` (§11); retains conversation state, routing, response assembly, trust validation (§12) |
| Ask operation registry (`askOperationRegistry.ts`) | **EXTEND** | Gains `CAPTURE_FACT_CONFIRM`/`CAPTURE_EVENT_CONFIRM` and any new domain operations (Seller Prep, etc.) |
| Semantic router (`askSemanticRouter.ts`) | **KEEP** | Unchanged — deterministic routing stays as-is (§7) |
| Skills registry (`services/skills/`) | **EXTEND** | Gains the handler-registry map (§11); everything else about it is reused unmodified |
| Skill adapter registry (`skillAdapterRegistry.ts`) | **KEEP** | Already the correct shape; becomes the actual dispatch key once §11 lands |
| Capability catalog (`productFramework/capabilities`) | **KEEP** | Stays a navigation/recommendation catalog — not repurposed into an execution registry |
| `GroundedAsk` (`answerGroundedAsk`/`groundedAskService`) | **REFACTOR** | The Q&A path (`selectAskRemoteFallbackTypedClaims`) is kept; its proposal-producing responsibility moves into §7's extraction pass |
| `GroundedAskProposal`/`GroundedAskArtifact` | **RETIRE** | Fully absorbed into `AskExecution` + `AskConfirmationReceipt` (§16) |
| `AskConfirmationReceipt` | **EXTEND** | Becomes the canonical confirmation mechanism for all material writes, including captured facts/events (§16) |
| `PropertyFactEvidence` | **EXTEND** | Gains `captureChannel` field (§15); `confidence` gains a second, compatible meaning for conversationally-captured rows |
| `PropertyChange` | **KEEP** | Remains the one real fan-in/briefing layer; unchanged |
| Aggregation context (`services/aggregationContext`) | **EXTEND** | `SEARCH_ASSISTANT` scope widened (§9) |
| Intelligence envelope | **KEEP** | Unchanged by this design; Stage 1's `askEnvelopeQueryScope.ts` domain-mapping bug is a separate, already-identified fix outside this stage's scope |
| Notification system (`NotificationService`) | **EXTEND** | Wrapped by `notifyWithAskContinuation` (§20), not replaced |
| `askNotificationContinuation.service.ts` | **EXTEND** | `operationId` type widened; becomes the generic building block every producer's insight decision calls into (§20) |
| Home Event Radar | **REFACTOR (integration point only)** | Notification path migrates to publish via the `DomainEvent` outbox instead of writing `Notification` directly (§20); its own detection/scoring logic is untouched |
| Refinance engine | **KEEP** | The reference pattern for every other decision capability (§10) |
| HVAC decision architecture | **KEEP** | The reference pattern for the rare case that genuinely needs a specialist agent (§25) |
| `DecisionThread` | **EXTEND** | Elevated from HVAC-only to the general-purpose multi-turn goal container for Job 3 (§17, §22) |
| Seller Prep | **EXTEND (wire in)** | New Ask operation(s), no new business logic (§23) |
| Personalization | **EXTEND (wire in later)** | Same shape as Seller Prep, deferred (§23) |
| Home Renovation Advisor | **HOLD — decide in Stage 3** | Not exposed until the naming-collision/duplicate-implementation question is resolved (§23) |
| Orphaned `/api/gemini/chat`, `/api/gemini/proposals*` routes | **RETIRE routes; reuse machinery** | The routes are deleted; the underlying `groundedAsk`/proposal *logic* that's worth keeping is already folded into §7/§16's design, not into these dead endpoints |

---

## 29. Target Request Lifecycle

**"I replaced my roof last summer for $14,500."**
```
REQUEST → deterministic routing misses (as today) → falls toward GROUNDED_GUIDANCE
        → §7 pre-filter fires (past-tense replacement verb + cost pattern) → extraction runs
        → candidate item: EVENT { type: roof-replacement, occurredAt: ~last summer,
                                    datePrecision: MONTH, amount: 14500, providerName: null }
        → validated against HomeEvent's schema → new AskExecution (CAPTURE_EVENT_CONFIRM, NEEDS_CONFIRMATION)
        → RESPOND: ordinary GROUNDED_GUIDANCE text/EVIDENCE blocks (unchanged) + a new FACT_CONFIRMATION block
        → user confirms → AskConfirmationReceipt claim/execute/complete (§16) writes HomeEvent
          (+ PropertyChange fan-in, unchanged) inside one transaction
        → RECOMMEND: "Would you like to add the receipt or warranty document?" (from §19's capability scan,
          since Document upload is a capability whose context requirement — an existing HomeEvent — is now satisfied)
```

**"Should I refinance?"**
```
REQUEST → deterministic routing matches REFINANCE_ANALYSIS at high confidence (unchanged)
        → §7 pre-filter does not fire (no reportable information in this message)
        → capability.invoke('REFINANCE_ANALYSIS', envelope) → refinanceAnalysisResult (unchanged logic)
        → RESPOND: existing structured comparison/summary blocks
        → RECOMMEND: §19's capability scan proposes "Calculate break-even," "Watch rates for me," etc.,
          based on which capabilities' context requirements this result just satisfied
```

**"Is my roof at risk because of the storms?"**
```
REQUEST → deterministic routing misses today (Stage 1 finding) — Stage 2 does not fix the routing miss itself
          (that's a §7-independent, narrower fix: adding this phrasing to the component-observation pattern)
        → assuming routing is extended to catch this phrasing (a Stage 3 implementation item, not blocked by
          this design): resolves to INTELLIGENCE_ENVELOPE_QUERY, component=ROOF
        → this design does NOT change resolveAskEnvelopeQueryScope's domain mapping (already identified as a
          separate, narrow bug in Stage 1 — ASSET_LIFECYCLE excludes WEATHER for component-scoped queries);
          fixing that bug is a prerequisite, tracked in Stage 3, not re-litigated here
        → once fixed: queryIntelligenceEnvelope returns radar-scored hazard data for this property
        → §7 pre-filter does not fire (a question, not a statement)
        → RESPOND: EVIDENCE + WHY_NOW blocks citing the radar match
        → RECOMMEND: "File a claim," "Schedule an inspection," etc., if those capabilities' context needs are met
```

**"I'm thinking about selling next year."**
```
REQUEST → deterministic routing may miss on this exact phrasing (Stage 1 finding — a narrower, separate
          routing-coverage fix, not blocked by this design)
        → §7 pre-filter fires (goal/life-event pattern) → extraction runs
        → candidate item: GOAL { goalCode: SELL_HOLD_RENT, horizon: ~1 year }
        → new or existing DecisionThread created/attached (§17), AskSession.activeDecisionThreadId set
        → RESPOND: SUMMARY acknowledging the goal + capability-derived next steps
        → RECOMMEND: §19's scan, now biased by the active SELL_HOLD_RENT thread, surfaces Seller Prep
          capabilities (§23) the homeowner never had to know existed — this is Test 4 (§35) passing
        → subsequent turns in this thread link via DecisionThreadExecutionLink automatically
```

---

## 30. Architecture Decision Log

| # | Decision | Alternatives | Selected approach | Why | Tradeoffs |
|---|---|---|---|---|---|
| 1 | Router + conversational-understanding relationship | Fallback-only; sequential-before-routing; single unified LLM classifier | **Parallel**, gated by a cheap deterministic pre-filter | Only option supporting compound messages (intent + information in one turn) without regressing high-confidence command latency/cost | Two independent passes to reason about instead of one; pre-filter itself needs tuning/evaluation |
| 2 | Conversational extraction approach | Free-form LLM extraction; per-category hand-written extractors; single schema-constrained multi-category call | **Single schema-constrained call**, five discriminated candidate-item variants | Matches the existing discipline (schema-constrained, temperature-near-zero) Stage 1 found working for the two existing LLM calls | One more prompt/schema to maintain and calibrate; still cheaper than N separate calls |
| 3 | Capability invocation architecture | Leave as-is; build a new framework; add a handler registry + shims over existing metadata | **Registry + shims** over existing skill/adapter metadata | Existing metadata is already correct; the only real gap is the missing function map, given non-uniform handler signatures | Every existing handler needs a one-time shim written; does not eliminate signature inconsistency, just isolates it |
| 4 | Future role of Ask Orchestrator | Keep as one large coordinator+executor; split into a separate microservice | **Coordinator only** — execution moves to `capability.invoke`, next-actions to a new module | Matches principle 4 without introducing a new service boundary the request explicitly disallows | Still one large file for conversation-state/routing/response-assembly; smaller, not tiny |
| 5 | Conversation-state model | New "goal" table; extend `DecisionThread`; keep everything on `AskSession` | **Reuse `DecisionThread`**, add one pointer field on `AskSession` | It already does exactly this job for HVAC; reusing avoids a second, competing long-lived-state model | `DecisionThread`'s HVAC-specific fields/goal codes need generalizing — a schema/enum extension, not a rewrite |
| 6 | Home-knowledge persistence approach | New universal fact/event store; force everything into `PropertyFactEvidence`; route to existing per-category models | **Existing per-category models**, per §13's table | Directly satisfies the request's explicit instruction against a new universal store; every category already has a home | Slightly more orchestration logic in the capture pipeline to route to the right model per category |
| 7 | Fact vs. event persistence | Treat every statement as a scalar fact; always create an event; decide per statement shape | **Decide per statement shape** — scalar → `PropertyFactEvidence`, compound/dated → `HomeEvent` (+links) | Matches what each model is actually built for; avoids forcing "last summer, $14,500, ABC Roofing" into one scalar field | Requires the extraction schema to correctly discriminate fact vs. event, adding one more classification the extraction step must get right |
| 8 | Provenance model | New unified provenance table; four separate untouched vocabularies; map onto existing fields + one new `captureChannel` field | **Map onto existing fields**, add `captureChannel` only | Existing fields already cover 3 of 4 axes correctly once source/channel are un-conflated (audit's own correction) | Doesn't solve Stage 1's broader "four incompatible vocabularies" consolidation gap — that remains a separate, larger Stage 3 item |
| 9 | Confirmation architecture | Keep `GroundedAskProposal` separate; make `AskConfirmationReceipt` polymorphic; retire `GroundedAskProposal` into `AskExecution` | **Retire into `AskExecution`** | Reuses a strictly more correct saga with zero new schema on the receipt; no migration audience to protect | One-time work to migrate the ~7 existing proposal kinds' semantics onto execution/operation shapes |
| 10 | Next-action architecture | Keep static per-operation strings; a new LLM call per response; deterministic capability-scan | **Deterministic capability-scan** | No new LLM call; reuses skill metadata (`requiredContextProviders`, `consumerPolicy`) that already exists for a different purpose | Only as good as each skill's declared context requirements — a poorly-declared skill produces poor suggestions |
| 11 | Proactive-to-Ask architecture | Bespoke per-producer Ask logic; a new insight/notification system; one generic wrapper at the existing outbox-consumer boundary | **Generic wrapper at the existing choke point** | Reaches every current and future `DomainEvent`-driven producer without per-producer Ask logic, per the request's explicit requirement | Home Event Radar still needs a real migration (off its direct-write bypass) to reach that choke point |
| 12 | Capability vs. specialist-agent criteria | No formal criteria (case-by-case); one agent per domain; a strict four-part test derived from the one working example | **Four-part test** (§25) | Grounded in the one case Stage 1 found actually justified (HVAC), not a general "agents are the future" argument | Some future domain might genuinely need a fifth criterion this framework doesn't anticipate |
| 13 | Traditional UI vs. conversation responsibilities | Cozy replaces all forms; traditional UI stays primary; split by task type as specified in the request | **Split by task type**, with the added rule that every material conversational write must have a traditional-UI correction path | Matches the request's own framing; the added rule directly answers "how do users undo/correct" | Requires auditing that every new capability actually gets a traditional-UI counterpart, not just a Cozy path |

---

## 31. Risks and Tradeoffs

**[DECISION-adjacent, i.e. risk framing, not a new decision]**

- **Retiring `GroundedAskProposal` (#9) is the single biggest one-time migration cost in this document.** Because there are no production users, there is no data-migration risk — but there is design risk: the ~7 existing proposal kinds (`ADD_FACT`, `CORRECT_FACT`, `CREATE_TASK`, `START_JOURNEY`, `COMPARE_OPTIONS`, `UPLOAD_EVIDENCE`, `ADD_NOTE`) must each map cleanly onto an operation-shaped execution; if any doesn't, this decision needs revisiting before implementation, not after.
- **The extraction pre-filter (#1) is a new deterministic component with no existing analog** — unlike routing, there's no existing calibration harness for "should this message go to the extractor at all." Under-firing silently drops real information; over-firing raises cost/latency. This needs its own evaluation suite, mirroring `askRoutingQualityEvaluator`'s pattern, before Stage 3 implementation.
- **Non-uniform handler signatures (§10, this pass's finding) mean the capability-invocation layer (#3) touches every existing operation once**, even though the design is additive in principle. This is bounded, known work (~40 shims), not open-ended, but it should be sized explicitly in Stage 3, not assumed to be free because "the metadata already exists."
- **`askDomainCommandRegistry.ts`'s correction modes may have no generic handler** (flagged as unverified in §16) — if corrections are actually hand-written per command today, reusing that vocabulary for captured facts (§16) is a smaller win than presented here, and Stage 3 must verify this before relying on it.
- **The `DomainEventType` union duplication** (emitter vs. worker consumer, found in this pass, unrelated to any decision above) is a latent bug that any new event-driven work in §20 will inherit if not fixed first — flagged for Stage 3, not addressed here since it predates and is independent of this design.

---

## 32. Target End-State Diagram

```
                         ┌─────────────────────────────┐
                         │   AskWorkspace (frontend)    │
                         └──────────────┬───────────────┘
                                        │
                         ┌──────────────▼───────────────┐
                         │  Ask Orchestrator (thin)      │
                         │  conversation state, routing, │
                         │  response assembly, trust     │
                         └───┬───────────────────────┬───┘
                             │                       │
              ┌──────────────▼─────┐   ┌─────────────▼──────────────┐
              │ Deterministic       │   │ Conversational Understanding│
              │ Routing (unchanged) │   │ (pre-filter + extraction)   │
              └──────────┬──────────┘   └─────────────┬──────────────┘
                         │                             │
              ┌──────────▼──────────┐      ┌───────────▼────────────┐
              │ Capability Invocation│      │ Candidate Items         │
              │ Layer (handler map + │      │ (fact/event/goal)       │
              │ shims — NEW)         │      └───────────┬────────────┘
              └──────────┬──────────┘                   │
                         │                    ┌──────────▼───────────┐
              ┌──────────▼──────────┐         │ AskConfirmationReceipt│
              │ Domain Services /    │         │ saga (EXTENDED to      │
              │ Decision Engines     │         │ cover captured items)  │
              │ (refinance, HVAC,    │         └──────────┬───────────┘
              │  seller prep, ...)   │                    │
              └──────────┬──────────┘         ┌──────────▼───────────┐
                         │                     │ Domain writes:        │
                         │                     │ HomeEvent, Warranty,  │
                         │                     │ PropertyFactEvidence  │
                         │                     └──────────┬───────────┘
                         │                                │
                         └───────────────┬────────────────┘
                                        │
                         ┌──────────────▼───────────────┐
                         │ PropertyChange fan-in (KEEP)  │
                         │ → briefing / history UI       │
                         └──────────────┬───────────────┘
                                        │
                         ┌──────────────▼───────────────┐
                         │ AskPresentationBlock response  │
                         │ + Next-Action scan (NEW module)│
                         └────────────────────────────────┘

Background (independent of the request path above):
  DomainEvent outbox (KEEP) → per-type consumer (KEEP)
    → domain-specific relevance decision (KEEP, per-domain)
    → notifyWithAskContinuation (NEW wrapper)
    → pre-loaded AskExecution → surfaces as a PROACTIVE_INSIGHT block on next open
  Home Event Radar migrates its direct Notification write onto this same rail.
```

---

## 33. Final Answer & Recommended Stage 3

**What should Ask Cozy become, and what is the smallest coherent target architecture that allows ContractToCozy to evolve into a message-first homeowner decision and action platform without discarding the strong domain intelligence and infrastructure that already exist?**

**Answer:** Ask Cozy should become the conversational front door to three things C2C already does well in isolation — deterministic decision engines, a durable and provenance-aware home-knowledge model, and a real (if under-connected) proactive-intelligence backbone — without becoming a fourth thing that duplicates any of them. The smallest coherent target architecture is four additions layered onto what exists, not a rebuild: **(1)** a schema-constrained conversational-understanding pass running beside (not instead of, not only after) deterministic routing; **(2)** a real capability-invocation layer that is genuinely just the missing function-map-and-shim piece over already-correct skill/adapter metadata; **(3)** one converged, atomically-correct confirmation mechanism (`AskConfirmationReceipt`, extended) replacing two parallel, unequal ones; and **(4)** `DecisionThread`, already built for exactly this purpose, generalized from one domain to every long-lived homeowner goal. Every other decision in this document — event persistence, provenance, next-actions, proactive wiring, capability exposure — is a specialization of one of those four moves applied to a specific existing subsystem. Nothing here proposes a new database, a new framework, a new service boundary, or an agent per domain; each of those was explicitly considered and rejected in favor of extending what Stage 1 found already works.

**Recommended Stage 3:** convert this document into a detailed FRD and implementation sequence. It should **not** re-litigate any decision in §30 without new evidence — it should instead:

1. Verify the two flagged open questions before relying on them: whether `askDomainCommandRegistry`'s correction modes have a generic handler (§16), and confirm each of the 7 `GroundedAskProposal` kinds maps cleanly onto an execution/operation shape (§31).
2. Size the ~40-handler shim migration (§10/§31) as its own sequenced work item, separate from the extraction-pass work — they can land independently and in either order.
3. Design and build the extraction pre-filter's evaluation harness (§31) before or alongside the extraction pass itself, not after — this is the one genuinely new deterministic component in this design with no existing analog to inherit test discipline from.
4. Sequence Home Event Radar's outbox migration (§20) early, since it's both a Job 1 blocker and a prerequisite for the generic proactive contract meaning anything for the system Stage 1 flagged as most in need of it.
5. Resolve the Home Renovation Advisor naming-collision question (§23) before wiring any renovation-related capability, to avoid building against the wrong sibling implementation.
6. Produce the detailed schema migration for the two narrow additions in §14/§15 (`HomeEvent.providerName`, `HomeEvent.warrantyId`, `captureChannel` fields) as a single small migration, and the operation-registry additions from §16 (`CAPTURE_FACT_CONFIRM`/`CAPTURE_EVENT_CONFIRM`) alongside it.

Stage 3's job is to sequence this, not to redesign it.
