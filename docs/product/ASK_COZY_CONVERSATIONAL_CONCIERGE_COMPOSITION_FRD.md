# Ask Cozy — Conversational Concierge: Bounded Read Composition FRD

**Status:** Draft v0.2 for owner review (revised after review of v0.1)
**Date:** 2026-11-09
**Owner decisions needed:** §15
**Related:**
- `AI_HOME_CONCIERGE_ASK_TRUST_ARCHITECTURE_ADDENDUM_FRD.md` (§7 non-goals, §29.2 cost policy) — governs this document
- `ASK_COZY_INLINE_WORKSPACE_FRD.md` (revisions 1.539–1.554: item funding goal, "Also answer", cost-only mode, withdrawn auto-follow)
- `docs/architecture/ASK_COZY_COMPOUND_CROSS_TOOL_PROMPTS_AUDIT.md` (evidence and the phased proposal this FRD turns into requirements)
- `docs/architecture/ASK_COZY_ROUTING_COVERAGE_AND_CALIBRATION.md` (routing measurements)

**Evidence labels** (`AUDIT_METHODOLOGY.md` §1): **[Executed]** = a program was run; **[Code-traced]** = read from source, not run; **[Inferred]** = extrapolated. No claim in §2 was exercised against a real database.

**Revision history**
- v0.1: first draft.
- v0.2: composition limited to an explicit registry of standard-materiality reads (§4.1); validated blocks are immutable and basis handling moves to a separate projection (§6.3, §6.8); full-message safety before decomposition (FR-DEC-0); parent/child idempotency, persistence, replay and reconciliation (§5.2); dependency-based clarification (§6.2); typed `coverage` field instead of a new status (D5 decided); two-component first version (D6 decided); evidence counts corrected; zero-wrong-execution floor kept; assembly-failure fallback is one envelope, not separate answers; provenance and freshness derivation rules (§6.9); runtime verification matrix (§12.4).

---

## 1. Purpose and product boundary

### 1.1 Purpose

A homeowner should be able to type a natural question that touches more than one part of their home record, and receive **one answer** whose figures agree with each other and say where they came from.

> "How old is my roof and what would a new one cost?"

### 1.2 What Ask Cozy is

A **conversational home concierge over governed capabilities**: free-form text in, authorized and validated answers out, drawn from the homeowner's own home record and from registered operations.

### 1.3 What Ask Cozy is not (binding, from the trust addendum §7)

Ask Cozy does not become an unrestricted general-purpose chatbot, and a model never invents operations, adapters, routes, entities, facts, calculations or actions. This FRD adds no capability that conflicts with that. Deterministic work incurs no generative-model call (addendum §29.2).

### 1.4 Goals

| ID | Goal |
|---|---|
| G1 | One request produces one response and one history entry, even when it needs two read operations. |
| G2 | Every figure in a composed answer has one stated basis; two components never disagree silently. |
| G3 | Authorization, trust validation, provenance and freshness of each component survive composition unchanged. |
| G4 | Follow-up questions resolve against what was just discussed (item, date, amount, objective). |
| G5 | Anything Ask cannot answer fails honestly: a focused question, a calibrated suggestion, or a stated limit — never a guess. |

### 1.5 Non-goals

- A model that chooses or chains arbitrary operations (the audit §8 "Not recommended" stands; revisit only per §13).
- Composing, planning or inferring **writes**, proposals, transmissions, workflow creation or continuation, specialist engagement, or material decisions (§4.1).
- Answering general home questions from model knowledge.
- Replacing typed blocks with prose (§9).
- Feature flags, kill switches, staged rollouts or compatibility layers (owner rule: keep it simple).

---

## 2. Current state

| # | Finding | Label |
|---|---|---|
| C1 | The router resolves **one** operation per turn (`AskRoutingDecision.operation`); no layer composes several. | [Code-traced] |
| C2 | A two-part question is answered by one operation. `support/alsoAnswer.ts` finds the dropped part and offers a one-tap secondary "Also answer: …" button; tapping it asks that part as its own turn. No blocks are merged. | [Code-traced] |
| C3 | An automatic second turn was built and **withdrawn** (FRD 1.554). Live use of the roof prompt gave two user bubbles and two cost figures on different bases ($8,000–$15,000 "in today's dollars" from `INVENTORY_LOOKUP`; $16,650–$31,219 grown to the 2044 window from `CAPITAL_ITEM_FUNDING_GOAL` cost-only). | Observed live by the owner |
| C4 | Routing is hybrid: safety gate, direct patterns, local lexical/feature-hash retrieval with calibration, optional bounded model routing, clarification, remote fallback. | [Code-traced] |
| C5 | Certification corpus (126 authored fixtures): 92 routed to the expected operation (73%), 0 wrong, 8 clarified with the right operation offered, 26 to fallback. These fixtures were written with the router, so the figure is likely optimistic for unseen phrasing. | [Executed] (coverage doc) |
| C6 | Independent 690-prompt routing sweep: 53–59% correct operation. Different corpus from C5; neither is "the" accuracy. | [Executed] (earlier audit) |
| C7 | Compound corpus (33 prompts, each listing the operations its answer needs). First run (audit §0): 15 full / 11 partial / 1 clarify / 4 wrong / 2 fallback. After the sale-upgrade routing fix (FRD 1.550) the baseline was re-recorded at **15 / 12 / 1 / 3 / 2** (`node scripts/ask-compound-sweep.js`, 2026-11-09). Use the re-recorded baseline as the reference. | [Executed] |
| C8 | `askResultSynthesis` rewrites one operation's validated blocks into one sentence and rejects any number not in the payload. | [Code-traced] |
| C9 | Trust validation (`validateAskAnswerTrustPipeline`) is keyed to **one** operation: block-id contracts, per-operation action allowlists, boundary requirements, relevance. A block or action that fails is stripped, silently for actions. | [Code-traced] |
| C10 | Sessions, bounded follow-up rewriting, continuation contracts and capture context exist. General cross-operation carry-over of item/date/amount does not. | [Code-traced] |
| C11 | Shared slot readers exist: dates (`support/targetDate.ts`), item names (`inventoryItemAliases`, `itemFundingWording`), dollar amounts (`support/moneyAmount.ts`). | [Code-traced] |
| C12 | Operation definitions carry `safetyClass` (`STANDARD`, `MATERIAL_DECISION`, and three boundary classes) and a `family`. Family alone is not a safety classification: many `DECISION_ANALYSIS` operations are `MATERIAL_DECISION`. | [Code-traced] |
| C13 | `AskExecution` has `parentExecutionId` (turn-level parent for child captures) and a unique constraint on `(userId, clientRequestId)`. | [Code-traced] |

---

## 3. Definitions

- **Component:** one registered read operation executed for one clause of a request, producing a validated `AskOperationResult`.
- **Composite result:** one response assembled from two components under the rules of §6.
- **Composable read:** an operation on the composable allowlist (§4.1).
- **Basis:** the stated frame of a figure — for money, *today's dollars* versus *grown to a stated date*; for time, *as of* a stated date.
- **Slot:** a typed value carried in conversation: property, item, target date, horizon, amount, objective, referenced result.
- **Atomic read:** a small operation answering one fact (item age, condition, replacement cost, reserve share, funding gap).
- **Coverage:** `COMPLETE` when every clause the homeowner asked was answered by a component; `PARTIAL` otherwise.

---

## 4. Functional requirements — eligibility, decomposition and routing

### 4.1 Composable-read registry

| ID | Requirement |
|---|---|
| FR-ELG-1 | Eligibility is an **explicit property** on the operation definition, `composableRead: true`, defaulting to false. It is never inferred from `family`. |
| FR-ELG-2 | An operation may carry `composableRead: true` only if **all** hold: it is read-only (no write, no confirmation, no capture, no proposal, no transmission); `safetyClass === 'STANDARD'`; it creates or continues no workflow, journey, decision thread or specialist engagement; it is `messageRoutable`; and it needs no entity selection the clause cannot supply from slots. |
| FR-ELG-3 | `MATERIAL_DECISION` operations are **never** composable in the first version, including refinance, sell/hold/rent, repair-or-replace, break-even, quote comparison, capital planning, property-tax appeal readiness and HVAC scenarios. Lifting this needs its own FRD and owner decision. |
| FR-ELG-4 | A startup validation test fails the build if a `composableRead` operation violates FR-ELG-2, mirroring the existing registry validation. |
| FR-ELG-5 | The initial allowlist is proposed in §15 (D7) and contains only operations an owner has approved by name. |

> Consequence to note: the first allowlist is narrow. `CAPITAL_ITEM_FUNDING_GOAL` is `STANDARD`-class today, which is why the roof prompt can compose; `REPLACEMENT_GUIDANCE` is `MATERIAL_DECISION` and cannot.

### 4.2 Decomposition

| ID | Requirement |
|---|---|
| FR-DEC-0 | **Before** splitting, truncation, slot resolution or property access, run the existing safety, restricted-request, explicit-command and boundary interception against the **complete original message**. A safety, restricted or boundary result governs the whole turn, and no clause is routed. Clause routing is permitted only after the full-message gate passes. |
| FR-DEC-1 | A message may be split into at most **two** clauses in the first version (§15, D6), at joining words (`splitQuestionClauses` rules are the starting point). A message that yields more than two clauses is not composed: the first two are **not** answered automatically; the existing single-operation path and "Also answer" offer apply, and the response says how many parts were seen. (No silent truncation: a dropped third clause never disappears unannounced.) |
| FR-DEC-2 | Each clause is routed through the **existing cascade** (`resolveAskRoutingCascade`) with its own confidence. No separate decomposition router and no model in this step. |
| FR-DEC-3 | A clause is **composable** only if it routes, with confidence ≥ 0.85, to an operation with `composableRead: true` that is eligible for this user and property. |
| FR-DEC-4 | Composition requires **every** clause to be composable. If any clause is not (a write, a material decision, a safety/boundary class, a clarification, a fallback), the turn is not composed: it is answered by the single best operation as today, with the existing "Also answer" offer where it applies, and the response states which part was not answered and why. |
| FR-DEC-5 | Elliptical clauses ("what would a new one cost") resolve their referent from the first clause's slots (§8), not by string rewriting inside the composer. |
| FR-DEC-6 | Two clauses that resolve to the same operation and item are one component. |
| FR-DEC-7 | If the first clause's operation already states the second clause's quantity on the same basis, the second is not run. |

Single-clause messages follow today's path unchanged.

---

## 5. Functional requirements — execution and persistence

### 5.1 Execution

| ID | Requirement |
|---|---|
| FR-EXE-1 | Each component executes **independently** through the existing execution path: access check, adapter, audience policy, per-operation trust validation. A component's failure does not abort the other. |
| FR-EXE-2 | Access to the property is re-checked **per component** at execution time. A component whose access was lost between components returns a not-authorized section; the other component is unaffected and the composite is `coverage: PARTIAL`. |
| FR-EXE-3 | Component execution is read-only. A component that returns a confirmation, capture request or write action is treated as a violation of FR-ELG-2 and its section is replaced by a limitation. |
| FR-EXE-4 | The two components run concurrently when independent. Each has a timeout; a timed-out or cancelled component yields a limitation section, never a hang. The composite is `READY_WITH_LIMITATIONS` with `coverage: PARTIAL`. |
| FR-EXE-5 | No generative-model call occurs in decomposition, execution or assembly. Optional narration (§9) is separable and measured separately (addendum §29.2). |

### 5.2 Parent/child persistence, idempotency and recovery

| ID | Requirement |
|---|---|
| FR-PER-1 | A composed turn is **one parent execution** in history, with one child execution per component (`parentExecutionId`). History shows one entry. |
| FR-PER-2 | Each child's `clientRequestId` is deterministic: a stable hash of the parent's `clientRequestId` and a **stable component identity** (`operationId` plus the normalized slot set), never the array position alone. Because `(userId, clientRequestId)` is unique (C13), a retry of the parent computes the same child keys. |
| FR-PER-3 | Child creation is **get-or-create**: a retried parent finds existing children by key and reuses them; it does not recreate or re-run a terminal child. |
| FR-PER-4 | Assembly is **resumable**: if the process stopped after one child persisted, a retry runs only the missing child, then assembles. A child that is non-terminal when the parent retries is awaited or resumed under the existing execution lifecycle, not duplicated. |
| FR-PER-5 | The parent reaches a terminal status **only after both children are terminal** (answered, limited, failed, timed out or cancelled). Until then the parent is non-terminal and shows progress. |
| FR-PER-6 | The assembled composite is persisted on the parent when assembled and is the durable answer. Reload **replays** it from the same child set; it does not recompute. |
| FR-PER-7 | Refresh of a composed turn refreshes **each child** through the existing per-execution refresh and then reassembles the composite from the refreshed children, re-running §6.7. A refresh that would downgrade a child (existing downgrade rule) keeps that child's prior validated result and marks the section stale. |
| FR-PER-8 | If a child is expired, deleted or has become inaccessible when the parent is reloaded, that section is replaced by an "unavailable" limitation and the composite becomes `coverage: PARTIAL` on next read. The remaining validated section is unchanged. The parent is never reported `COMPLETE` while a section is unavailable. |
| FR-PER-9 | Duplicate delivery of the same parent request (double submit, network retry) yields one parent and the same two children. |

---

## 6. Composite result contract

### 6.1 Shape

```
CompositeResult {
  status: ANSWERED | READY_WITH_LIMITATIONS | NEEDS_CLARIFICATION | <existing failure statuses>
  coverage: COMPLETE | PARTIAL          // composite only
  answerFirst: string | null            // §9; derived only from section payloads
  sections: Section[]                   // 1..2, in the order the homeowner asked
  basis: BasisProjection | null         // §6.3; separate from sections
  notAnswered: { clause, reasonCode, detail }[]
  actions: ActionRef[]                  // deduplicated, §6.5
}

Section {
  clause: string
  operationId, executionId, status, reasonCode?
  blocks: AskPresentationBlock[]        // byte-for-byte as validated; never altered (§6.8)
  provenance: Provenance[]              // §6.9
}
```

No new value is added to the global execution-status enum. Composite-only semantics live in `coverage`, so no other Ask consumer must understand them.

### 6.2 Status and clarification

Status follows the components and `coverage`:

| Components | status | coverage |
|---|---|---|
| Both `ANSWERED` | `ANSWERED` | `COMPLETE` |
| Both answered, any `READY_WITH_LIMITATIONS` | `READY_WITH_LIMITATIONS` | `COMPLETE` |
| One answered, the other failed, timed out, unavailable or not authorized | `READY_WITH_LIMITATIONS` | `PARTIAL` |
| Neither answered | the most specific component recovery (§10) | n/a |

**Clarification depends on dependency, not position.** The result is identical for the same intents in either clause order.

| Situation | Behavior |
|---|---|
| An unresolved clause supplies a slot the other clause needs | Ask the one clarification **alone**; run nothing. |
| The ambiguity could change which operations are safe to run | Execute **none**; clarify first. |
| The unresolved clause is independent of the answered one | Show the answered section and ask **one** focused clarification for the rest, `coverage: PARTIAL`. |
| Both clauses are independently unresolved | Ask **one** clarification (the one whose answer unlocks more), never a questionnaire. |

### 6.3 One basis per quantity (resolves the C3 defect)

A **quantity** is a named figure such as *replacement cost of the roof*. For each quantity that appears in both sections:

| ID | Rule |
|---|---|
| FR-BAS-1 | Exactly one section is the **authority**, chosen by a fixed table (§6.3.1), not by execution order. |
| FR-BAS-2 | The composite states the basis in plain words with the figure ("in today's dollars", "grown to 2044"). |
| FR-BAS-3 | The authoritative figure is presented in the **`basis` projection and `answerFirst`**, outside the section blocks. Section blocks are not edited. A non-authoritative section that carries the same quantity on a different basis keeps its blocks as validated and is visibly labeled with its own basis by the presentation layer (a caption on the section, not a change to its blocks). |
| FR-BAS-4 | If the question names a date, the authority reports at that date. If it names none, the authority reports in **today's dollars** and may add the expected-window figure as a second, labeled line. |
| FR-BAS-5 | If no authority can be determined, the `basis` projection shows each figure with its own label and a one-line note that they use different bases. Two unlabeled figures for one quantity never appear. |

#### 6.3.1 Authority table (initial)

| Quantity | Authority | Note |
|---|---|---|
| Replacement cost, item, no date | `CAPITAL_ITEM_FUNDING_GOAL` cost line, restated in today's dollars | Requires R-ATM-3 |
| Replacement cost, item, dated | `CAPITAL_ITEM_FUNDING_GOAL` | Already grown to the date |
| Item age / install year | The inventory/profile read | |
| Reserve allocated to an item | `CAPITAL_ITEM_FUNDING_GOAL` (target-share allocation, labeled estimate) | |
| Monthly saving currently going toward an item | `CAPITAL_ITEM_FUNDING_GOAL` | Unknown, not $0, when no deposits are logged (FRD 1.553) |

Adding a row is a registry change with a test (§12.2).

### 6.4 Writes stay outside composition

Composite results contain **no** write, confirmation, capture or proposal. Existing authorization, proposal, confirmation, canonical validation and idempotency protections apply unchanged to any follow-up write the homeowner chooses in a later turn.

### 6.5 Actions

| ID | Rule |
|---|---|
| FR-ACT-1 | Actions come only from section blocks that survived their own operation's allowlist. |
| FR-ACT-2 | Duplicate actions (same id, or same operation and message) appear once. |
| FR-ACT-3 | At most one primary action in the composite; the rest are secondary. |
| FR-ACT-4 | The composite adds no actions of its own except the capability-discovery link in §10. |

### 6.6 Contradiction detection

After assembly, a deterministic check compares figures that share a quantity key (§6.3). Disagreement beyond rounding on the **same basis** sets `status: READY_WITH_LIMITATIONS`, shows both figures labeled, and adds a note. Disagreement on **different** bases is resolved by §6.3.

### 6.7 Trust validation

| ID | Requirement |
|---|---|
| FR-TRU-1 | Every section passes its own operation's trust validation first, unchanged. |
| FR-TRU-2 | The composite then passes a **composition validator**: block ids are unique across sections (a section prefix is applied **at presentation**, not by editing validated blocks), every action is in its section's allowlist, every figure in `answerFirst` and `basis` exists in a section payload, status and `coverage` follow §6.2, and **no section's blocks differ from the validated bytes** (a stored hash per section is compared). |
| FR-TRU-3 | A composite that fails FR-TRU-2 is returned as **one response envelope** on the same parent execution: a clear "combined view unavailable" limitation, the immutable validated sections inside the envelope, **no** `answerFirst` and **no** merged or authoritative figure. It is never split into separate turns or separate history entries. |
| FR-TRU-4 | Metrics record composition outcomes separately from single-operation outcomes. |

### 6.8 Immutability of validated blocks

Validated section blocks are **never modified, suppressed or reordered** after their operation's trust pipeline approved them. Any presentation need (basis captions, section prefixes for ids, de-duplication of identical actions) is applied in a separate projection layer. If a future requirement needs a block changed, the changed result must be re-validated by the originating operation's **complete** trust pipeline before use; that is out of scope for this version.

### 6.9 Provenance and freshness

| ID | Rule |
|---|---|
| FR-PRV-1 | Each section's provenance is the union of that operation's existing evidence items (label, source, `observedAt`). Nothing is added or inferred by the composer. |
| FR-PRV-2 | An evidence item with no observation timestamp keeps `observedAt: null` (unknown). **Request time is never substituted** for a missing observation time. |
| FR-PRV-3 | Authored or evergreen content (planning defaults, static guidance) is represented as `observedAt: null` with its source label; it does not count toward freshness. |
| FR-PRV-4 | A derived calculation inherits the **oldest** `observedAt` among its inputs; it never takes the calculation time. |
| FR-PRV-5 | `freshestAt` and `stalestAt` are computed only over items with a known timestamp; with none, both are null and the composite says freshness is unknown. |
| FR-PRV-6 | Mixed freshness does not change `status` by itself. A section whose existing operation already reports stale or limited keeps that state, which flows into §6.2. |

---

## 7. Atomic reads

Composition works only if small, trustworthy reads exist.

| ID | Requirement |
|---|---|
| R-ATM-1 | **Item age / install year** read that answers from inventory and the home profile (roof year included) and states its source. |
| R-ATM-2 | **Item condition** read. |
| R-ATM-3 | **Replacement cost** exposed in both *today's dollars* and *at the expected window*, each labeled, from one source (the capital timeline estimate), so the two cost bases in C3 cannot diverge. The inventory profile-roof wording and the capital timeline's roof default must read the same estimate. |
| R-ATM-4 | **Reserve allocation for an item** (estimate, labeled). |
| R-ATM-5 | **Funding gap** for an item and date (exists: `CAPITAL_ITEM_FUNDING_GOAL`). |

Each new read is a registered operation with the full registry footprint (governance allowlist, semantic maps, audience policy, trust policy, coverage matrix, certification fixture) and, if composable, `composableRead: true` under FR-ELG-2. R-ATM-3 may instead be met by one shared cost function (D2).

---

## 8. Conversational slots

| ID | Requirement |
|---|---|
| FR-SLT-1 | The session carries typed slots: `item`, `targetDate`, `horizonYears`, `amount`, `objective`, `referencedExecutionId`. Slots are set only from deterministic reads of the message (existing shared readers, C11) or from a validated operation result. |
| FR-SLT-2 | An elliptical message ("what about the water heater?", "make it 10 years", "what would it cost?") resolves against the slots of the most recent answered turn. |
| FR-SLT-3 | Before reuse, a slot is **revalidated**: the entity still exists, the user is still authorized, the property matches, and the slot is within the turn window (D4). A failed revalidation asks one focused question; it never silently falls back to a default. |
| FR-SLT-4 | A slot set by the homeowner overrides a carried slot. |
| FR-SLT-5 | A slot is never persisted beyond the session and never contains homeowner free text. |

---

## 9. Answer-first narration

| ID | Requirement |
|---|---|
| FR-NAR-1 | A composite and any single answer **may** open with one short conclusion ("Your roof is about 7 years old; a new one is about $X in today's dollars"). |
| FR-NAR-2 | The conclusion is built **only from section payloads**. A deterministic template is the default; a model-written sentence is permitted only behind the existing synthesis guard. |
| FR-NAR-3 | The synthesis guard stays mandatory: any number, date or name not present in the payloads rejects the sentence and the template is used. |
| FR-NAR-4 | Typed blocks remain the source of evidence, calculations, assumptions, limitations and actions. Prose supplements them and never replaces them. |
| FR-NAR-5 | Narration is separable from routing and measured and capped separately (addendum §29.2). |

---

## 10. Recovery when Ask cannot answer

In order, stopping at the first that applies:

1. **Answer from bounded recorded context** if an eligible operation supports it.
2. **One focused clarification** when the ambiguity is resolvable (for example "Worth doing for resale value, comfort or energy savings, or maintenance risk?").
3. **Offer a candidate** only when calibration permits (the existing "did you mean" floor). Never offer a nearest operation below the floor.
4. **State the limitation** plainly and expose capability discovery ("Explore with Cozy").

A model's general knowledge about the home or homeowner is never a recovery path.

---

## 11. Routing (conservative)

| ID | Requirement |
|---|---|
| FR-RTE-1 | Safety and direct-intent precedence are unchanged, and run on the complete message first (FR-DEC-0). No model overrides them. |
| FR-RTE-2 | Calibration drift (fixtures 015, 065, 075, 121, 068, 122) stays a recognised known set until calibration is isolated per operation or family; the exact-evidence test reports it separately and fails on any new drift. |
| FR-RTE-3 | Per-family calibration isolation is a design item (D3). |
| FR-RTE-4 | Hard negatives and independently authored examples are added alongside every new operation. |
| FR-RTE-5 | A model classifier remains bounded and optional, and only when the deterministic and local stages abstain. |

---

## 12. Acceptance and measurement

### 12.1 Corpora and floors

| Corpus | Today | Target |
|---|---|---|
| Compound corpus | 33 prompts (C7) | ≥ 100, across capital, ownership cost, coverage + cost, sell/refi/upgrade, timing comparisons; held-out slice written before looking at misses. Each row lists its **required component set**. |
| Routing certification | 126 fixtures, 0 wrong routes | Unchanged or larger |
| Independent routing sweep | 690 prompts | No phrasing that routed correctly stops; no new misroutes (existing ratchet) |
| Multi-turn slot corpus | none | New: ≥ 40 elliptical follow-ups with expected resolved slots |

**Invariants** (composition multiplies routing mistakes, so the floor is the current one, not weaker):
- **Zero wrong executed operations at any confidence**, including every composed clause.
- **Zero wrong offered candidates** above the suggestion floor.
- No worsening of clarification or fallback beyond an explicitly approved, measured tradeoff.
- **Component-set correctness** on the compound corpus: the set of operations a composed answer ran equals the row's required set. Per-clause route accuracy alone is not sufficient.
- No `MATERIAL_DECISION` operation ever executes as a component.

### 12.2 Required automated tests (no database)

- **Eligibility:** `composableRead` startup validation (FR-ELG-4); every `MATERIAL_DECISION` operation is rejected; a family-only classification is not accepted.
- **Safety first:** a safety, restricted or boundary phrase in clause one, two or **three** blocks the whole turn before any clause is routed; splitting cannot evade a full-message boundary; a third clause is never silently dropped (FR-DEC-1).
- **Decomposition:** clause split, two-clause cap, FR-DEC-3/4 all-clauses-composable rule, same-operation merge, FR-DEC-7 skip.
- **Status and clarification:** every §6.2 row; clause order reversed gives the same result for the same intents; dependency cases; one clarification, never a questionnaire.
- **Idempotency (unit level):** child key derivation is stable across array order and retries; get-or-create reuses; resumption runs only the missing child; parent terminal only when both children are terminal.
- **Authority table §6.3.1:** dated and undated cost; two sections with different bases never render two unlabeled figures (the C3 regression as a test).
- **Immutability:** a stored hash of each section's blocks equals the blocks after assembly and after projection; basis handling never edits a section.
- **Contradiction:** same-basis disagreement degrades to limited.
- **Composition validator:** unique ids at presentation, allowlist, numeric-in-payload, status/coverage, assembly-failure returns one envelope on one parent (FR-TRU-3).
- **Provenance:** unknown timestamps stay unknown; request time never substituted; derived figures inherit the oldest input; evergreen content excluded from freshness.
- **Actions:** de-duplication and single primary.
- **Slots:** removed entity, lost authorization, stale turn, property switch.
- **Narration guard:** fabricated number rejected, template used.
- **Writes:** a composite never contains confirmation, capture, proposal or write actions.

### 12.3 Metrics

Composition rate; per-section status; composite status and coverage distribution; composition-validator failures; contradiction detections; unanswered-clause reasons; clarification-by-dependency counts; added latency; component timeouts; model-call count (must be 0 for deterministic composition).

### 12.4 Runtime verification matrix (owner-run, real backend)

The repository does not require a development database, but the owner's backend must produce this evidence before Phase 2 is closed. Each row is pass/fail with the observed result recorded.

| # | Scenario | Expected |
|---|---|---|
| 1 | Roof prompt, home with profile roof year and no tracked roof item | One response, one history entry, one cost basis stated |
| 2 | Roof prompt, home with a tracked roof item | Same, authority = funding read |
| 3 | Roof prompt, no reserve deposits logged | "Not enough logged deposits"; no $0 shown as fact |
| 4 | Double submit of the same request | One parent, two children, no duplicates (FR-PER-9) |
| 5 | Kill the process after one child persists, retry | Only the missing child runs; one assembled answer (FR-PER-4) |
| 6 | Concurrent requests from two tabs | No unique-key violation surfaced; consistent single result |
| 7 | One component fails or times out | `READY_WITH_LIMITATIONS`, `coverage: PARTIAL`; other section intact |
| 8 | Property access removed between the two components | Not-authorized section; other section intact (FR-EXE-2) |
| 9 | A child expires or is deleted, then the parent is reloaded | Unavailable section, `coverage: PARTIAL`, remaining section unchanged (FR-PER-8) |
| 10 | Reload and open from history | Replayed from the same children; no recompute (FR-PER-6) |
| 11 | Refresh a composed turn after underlying data changed | Each child refreshed, composite reassembled, downgrade rule respected (FR-PER-7) |
| 12 | Viewer-role user versus owner on the same prompt | Authorization per component; no action offered that the role cannot take |
| 13 | A material-decision phrase in a compound message | Turn not composed; single-operation path with the stated reason |
| 14 | A boundary or safety phrase in clause three of a long message | Whole turn handled by the boundary; nothing routed |
| 15 | Source with no observation timestamp | Freshness shown unknown; no request time shown |
| 16 | Rendering of the composite in the Ask workspace, desktop and phone width | One response; basis stated; no duplicate or conflicting figure |

---

## 13. Phasing

| Phase | Content | Gate |
|---|---|---|
| 0 | This FRD accepted; §15 decisions taken; compound corpus grown to ≥ 100 with held-out slice and required component sets | Owner sign-off |
| 1 | R-ATM-3 single cost source (fixes the C3 divergence even without composition) | Test: profile-roof read and funding read give one figure per basis |
| 2 | `composableRead` registry property and validation; composite contract §6 and validator; parent/child persistence §5.2; two components, deterministic splitting, the roof prompt first | §12.2 tests green; §12.4 matrix rows 1–16 recorded by the owner; compound corpus component-set correctness measured |
| 3 | Slots §8 and elliptical follow-ups | Multi-turn corpus at target; no regression in sweeps |
| 4 | Remaining atomic reads R-ATM-1/2/4 | Each with registry footprint and certification fixture |
| 5 | Answer-first narration (template first) | Guard tests green |
| 6 | Recovery order §10; calibration isolation design | Known-drift set shrinks |
| 7 | **Only if** Phases 2–6 leave a measured gap: evaluate a bounded model classifier or decomposer for ambiguous requests; a third component | New FRD; owner decision |

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| A material-decision operation executes unattended inside a composite | FR-ELG-1/2/3 explicit registry property, startup validation, test that every `MATERIAL_DECISION` is rejected |
| Two components disagree on a figure | §6.3 authority table in a separate projection; §6.6 detection; the C3 case is a required test |
| Composer alters validated content and invalidates trust checks | §6.8 immutability; hash comparison in FR-TRU-2; projection layer only |
| A safety clause evades the gate by splitting or truncation | FR-DEC-0 full-message gate first; no silent truncation |
| Retries duplicate or orphan children | §5.2 deterministic child keys, get-or-create, resumable assembly, terminal-only-when-children-terminal |
| Composition raises latency | Concurrency; two-component cap; timeouts; latency metric |
| A stripped action fails silently inside a composite | FR-ACT-1/4; validator checks allowlists |
| Slot carry-over applies to a deleted or foreign entity | FR-SLT-3 revalidation |
| Registry footprint of new atomic reads | Known gotchas (governance allowlist or the API crash-loops at boot; action ids allowlisted; certification fixture; semantic maps). Run the startup registry validation test with each |
| Fabricated freshness | FR-PRV-2: unknown stays unknown |

---

## 15. Decisions for the owner

Decided in v0.2 (confirm or overrule):

| ID | Decision | Position in this draft |
|---|---|---|
| D5 | How to represent a partially answered composite | **Decided:** `READY_WITH_LIMITATIONS` plus a typed composite-only `coverage: COMPLETE | PARTIAL`. No new global execution-status value. |
| D6 | Component cap | **Decided:** **two** for the first version. Three only after latency, authorization and compound-corpus results justify it (Phase 7). |

Open:

| ID | Decision | Recommendation |
|---|---|---|
| D7 | **The composable-operation allowlist.** Which operations get `composableRead: true`. This precedes Phase 2. | Start with `STANDARD`-class reads only, approved by name; confirm the initial list (candidates: `CAPITAL_ITEM_FUNDING_GOAL`, `INVENTORY_LOOKUP`, `APPLIANCE_FAILURE_RISK`, `MAINTENANCE_BUDGET_FORECAST`) after a registry scan of every operation's `safetyClass` and side effects. |
| D1 | Replacement cost without a date: today's dollars first, expected-window figure as a second labeled line? | Yes (FR-BAS-4). The current cost-only mode leads with the future-dollar figure. |
| D2 | One shared cost function for the profile-roof inventory answer and the funding read, or a new atomic replacement-cost operation? | One shared function: smaller, and it removes the divergence at its source. |
| D3 | Calibration isolation: per operation, per family, or accept the global curve with the known-drift list? | Per family; keep the known-drift list until then. |
| D4 | Slot turn window and whether `objective` is carried | 5 turns; carry `objective` only when the homeowner stated it. |

---

## 16. Traceability

| This FRD | Source |
|---|---|
| §1.3, FR-EXE-5, FR-NAR-5 | Trust addendum §7, §29.2 |
| §4–§6 | Compound audit §8 Phase 3; FRD 1.540/1.542 (button), 1.554 (withdrawn auto-follow) |
| §4.1, C12 | `safetyClass` and `family` in `askOperationRegistry.ts` |
| §5.2, C13 | `AskExecution.parentExecutionId`, `@@unique([userId, clientRequestId])` in `prisma/schema.prisma` |
| §6.3 | FRD 1.548 (cost-only mode), observed live defect C3 |
| §6.7 | `askAnswerTrustPolicy`, `validateAskAnswerTrustPipeline` |
| §6.9 | Earlier correction of fabricated request-time freshness |
| §9 | `askResultSynthesis.service.ts` numeric guard |
| §11 | Routing coverage and calibration doc; known-drift list |
| §8 | FRD 1.539/1.543/1.544 shared slot readers; owner decision 2026-11-09 on "currently saving" |

---

## 17. What this document does not establish

- No composite has been built or run; every §5–§6 requirement is a proposal.
- The §2 findings about handlers are code-traced, not run against a real database.
- The 126-fixture and 690-prompt figures are offline sweeps on authored corpora, not live traffic.
- Whether any operation currently satisfies FR-ELG-2 beyond `safetyClass` is not verified; D7 requires a scan of side effects, not only the class.
- Whether two-component composition lifts the compound corpus enough to justify Phases 3–6 is unmeasured; Phases 0 and 2 exist to measure it.
- The child-key and resumption design assumes the existing execution lifecycle can wait on or resume a non-terminal child; that has not been checked against the code and must be confirmed before Phase 2.
