# Ask Cozy — Conversational Concierge: Bounded Read Composition FRD

**Status:** Draft v0.1 for owner review
**Date:** 2026-11-09
**Owner decisions needed:** §14
**Related:**
- `AI_HOME_CONCIERGE_ASK_TRUST_ARCHITECTURE_ADDENDUM_FRD.md` (§7 non-goals, §29.2 cost policy) — governs this document
- `ASK_COZY_INLINE_WORKSPACE_FRD.md` (revisions 1.539–1.554: item funding goal, "Also answer", cost-only mode, withdrawn auto-follow)
- `docs/architecture/ASK_COZY_COMPOUND_CROSS_TOOL_PROMPTS_AUDIT.md` (evidence and the phased proposal this FRD turns into requirements)
- `docs/architecture/ASK_COZY_ROUTING_COVERAGE_AND_CALIBRATION.md` (routing measurements)

**Evidence labels** (`AUDIT_METHODOLOGY.md` §1): **[Executed]** = a program was run; **[Code-traced]** = read from source, not run; **[Inferred]** = extrapolated. No claim in §2 was exercised against a real database.

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
| G1 | One request produces one response, even when it needs two or three read operations. |
| G2 | Every figure in a composed answer has one stated basis; two components never disagree silently. |
| G3 | Authorization, trust validation, provenance and freshness of each component survive composition. |
| G4 | Follow-up questions resolve against what was just discussed (item, date, amount, objective). |
| G5 | Anything Ask cannot answer fails honestly: a focused question, a calibrated suggestion, or a stated limit — never a guess. |

### 1.5 Non-goals

- A model that chooses or chains arbitrary operations (the audit §8 "Not recommended" stands; revisit only per §13).
- Composing, planning or inferring **writes**. Writes stay single-operation, confirmed, idempotent (§6.4).
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
| C7 | Compound corpus (33 prompts, each listing the operations its answer needs): 15 full, 12 partial, 1 clarify, 3 wrong, 2 fallback. | [Executed] |
| C8 | `askResultSynthesis` rewrites one operation's validated blocks into one sentence and rejects any number not in the payload. | [Code-traced] |
| C9 | Trust validation (`validateAskAnswerTrustPipeline`) is keyed to **one** operation: block-id contracts, per-operation action allowlists, boundary requirements, relevance. A block or action that fails is stripped, silently for actions. | [Code-traced] |
| C10 | Sessions, bounded follow-up rewriting, continuation contracts and capture context exist. General cross-operation carry-over of item/date/amount does not. | [Code-traced] |
| C11 | Shared slot readers exist: dates (`support/targetDate.ts`), item names (`inventoryItemAliases`, `itemFundingWording`), dollar amounts (`support/moneyAmount.ts`). | [Code-traced] |

---

## 3. Definitions

- **Component:** one registered read operation executed for one clause of a request, producing a validated `AskOperationResult`.
- **Composite result:** one response assembled from two or three components under the rules of §6.
- **Basis:** the stated frame of a figure — for money, *today's dollars* versus *grown to a stated date*; for time, *as of* a stated date.
- **Slot:** a typed value carried in conversation: property, item, target date, horizon, amount, objective, referenced result.
- **Atomic read:** a small operation answering one fact (item age, condition, replacement cost, reserve share, funding gap).

---

## 4. Functional requirements — decomposition and routing

| ID | Requirement |
|---|---|
| FR-DEC-1 | A message may be split into at most **three** clauses at joining words (the existing `splitQuestionClauses` rules are the starting point). More than three: answer the first three and say the rest were not answered. |
| FR-DEC-2 | Each clause is routed through the **existing cascade** (`resolveAskRoutingCascade`) with its own confidence. No separate decomposition router and no model in this step. |
| FR-DEC-3 | A clause is **composable** only if it routes, with confidence ≥ 0.85, to a READ operation (`RECORD_QUERY`, `STATUS_SUMMARY`, `DECISION_ANALYSIS`) that is eligible for this user and property. |
| FR-DEC-4 | A clause that routes to a write, safety, boundary, clarification or fallback is **not executed** as a component. The answer says it was not answered and why, using the existing recovery wording (§10). |
| FR-DEC-5 | Elliptical clauses ("what would a new one cost") resolve their referent from the first clause's slots (§8), not by string rewriting inside the composer. |
| FR-DEC-6 | If two clauses resolve to the **same** operation and item, they are one component. |
| FR-DEC-7 | If the first clause alone already answers the second (the answering operation states the second's quantity on the same basis), the second is not run. |

Single-clause messages follow today's path unchanged.

---

## 5. Functional requirements — execution

| ID | Requirement |
|---|---|
| FR-EXE-1 | Each component executes **independently** through the existing execution path: access check, adapter, audience policy, per-operation trust validation. A component's failure does not abort the others. |
| FR-EXE-2 | Components are persisted as child executions of one parent turn, so history, refresh and reconciliation keep working per component. (The execution model already has `childExecutions`.) |
| FR-EXE-3 | Component execution is read-only. A component that returns a confirmation, capture request or write action is demoted to an "available next step" and is not auto-run. |
| FR-EXE-4 | Components run concurrently when independent; total added latency for a two-component answer is bounded by the slower component plus assembly. |
| FR-EXE-5 | No generative-model call occurs in decomposition, execution or assembly. Optional narration (§9) is separable and measured separately (addendum §29.2). |

---

## 6. Composite result contract

### 6.1 Shape

```
CompositeResult {
  status: ANSWERED | READY_WITH_LIMITATIONS | NEEDS_CLARIFICATION | PARTIAL
  answerFirst: string | null           // §9; derived only from section payloads
  sections: Section[]                  // 1..3, in the order the homeowner asked
  notAnswered: { clause, reasonCode, detail }[]
  basisStatement: BasisStatement | null // §6.3
  actions: ActionRef[]                 // deduplicated, §6.5
}

Section {
  clause: string
  operationId, executionId, status, reasonCode?
  blocks: AskPresentationBlock[]       // already validated for this operation
  provenance: { source, observedAt }[]
  freshestAt, stalestAt
}
```

`PARTIAL` is new and exists only on composites: at least one section answered and at least one clause was not answered or came back limited. A composite never reports `ANSWERED` if any section is limited or any clause is unanswered.

### 6.2 Status rules

| Components | Composite status |
|---|---|
| All `ANSWERED` | `ANSWERED` |
| All answered, any `READY_WITH_LIMITATIONS` | `READY_WITH_LIMITATIONS` |
| At least one answered, others failed, needed context or not run | `PARTIAL` |
| First component `NEEDS_CONTEXT`/`NEEDS_CLARIFICATION` | The clarification is asked **alone**; no partial composite is shown. |
| None answered | The most specific component recovery (§10). |

### 6.3 One basis per quantity (resolves the C3 defect)

A **quantity** is a named figure such as *replacement cost of the roof*. For each quantity that appears in more than one section:

| ID | Rule |
|---|---|
| FR-BAS-1 | Exactly one section is the **authority** for a quantity, chosen by a fixed table (§6.3.1) — not by whichever ran first. |
| FR-BAS-2 | The composite states the basis in plain words next to the figure ("in today's dollars", "grown to 2044"). |
| FR-BAS-3 | A non-authoritative section's duplicate figure is **removed or relabeled** (never shown with a different basis and no label). |
| FR-BAS-4 | If the question names a date, the authority reports at that date. If it names none, the authority reports in **today's dollars**, and may add the figure at the expected replacement window as a second, labeled line. |
| FR-BAS-5 | If no authority can be determined (a component lacks the quantity or the basis is unknown), the composite shows each figure with its own label and a one-line note that they use different bases. It never presents two unlabeled figures for one quantity. |

#### 6.3.1 Authority table (initial)

| Quantity | Authority | Note |
|---|---|---|
| Replacement cost, item, no date | `CAPITAL_ITEM_FUNDING_GOAL` cost line, restated in today's dollars | Requires §7 R-ATM-3: the funding read exposes today's-dollar cost |
| Replacement cost, item, dated | `CAPITAL_ITEM_FUNDING_GOAL` | Already grown to the date |
| Item age / install year | The inventory/profile read | |
| Reserve allocated to an item | `CAPITAL_ITEM_FUNDING_GOAL` (target-share allocation, labeled estimate) | |
| Monthly saving currently going toward an item | `CAPITAL_ITEM_FUNDING_GOAL` | Unknown, not $0, when no deposits are logged (FRD 1.553) |

Adding a row is a registry change with a test (§12).

### 6.4 Writes stay outside composition

Composite results contain **no** write, confirmation or capture. Existing authorization, proposal, confirmation, canonical validation and idempotency protections apply unchanged to any follow-up write the homeowner chooses.

### 6.5 Actions

| ID | Rule |
|---|---|
| FR-ACT-1 | Actions come only from section blocks that survived their own operation's allowlist. |
| FR-ACT-2 | Duplicate actions (same id or same operation+message) appear once. |
| FR-ACT-3 | At most one primary action in the composite; the rest are secondary. |
| FR-ACT-4 | A stripped action never appears in the composite; the composite adds none of its own except the capability-discovery link in §10. |

### 6.6 Contradiction detection

After assembly, a deterministic check compares figures that share a quantity key (§6.3). Disagreement beyond rounding on the **same basis** fails the composite to `READY_WITH_LIMITATIONS` with both figures labeled and a note. Disagreement on **different** bases is resolved by FR-BAS-3.

### 6.7 Trust validation

| ID | Requirement |
|---|---|
| FR-TRU-1 | Every section passes its own operation's trust validation first, unchanged. |
| FR-TRU-2 | The composite then passes a **composition validator**: block ids are unique across sections (section-prefixed), every action is in its section's allowlist, every figure in `answerFirst` exists in a section payload, status follows §6.2, and no section's blocks were altered after validation. |
| FR-TRU-3 | A composite that fails FR-TRU-2 is not shown as assembled; each validated section is returned as its own answer with a note that the combined view was unavailable. |
| FR-TRU-4 | Metrics record composition outcomes separately from single-operation outcomes. |

---

## 7. Atomic reads

Composition works only if small, trustworthy reads exist.

| ID | Requirement |
|---|---|
| R-ATM-1 | **Item age / install year** read that answers from inventory and the home profile (roof year included) and states its source. |
| R-ATM-2 | **Item condition** read. |
| R-ATM-3 | **Replacement cost** read exposing both *today's dollars* and *at the expected window*, each labeled, from one source (the capital timeline estimate), so the two cost bases in C3 cannot diverge. The current inventory profile-roof wording ("$8,000 to $15,000 in today's dollars") and the capital timeline's roof default must read the same estimate. |
| R-ATM-4 | **Reserve allocation for an item** (estimate, labeled). |
| R-ATM-5 | **Funding gap** for an item and date (exists: `CAPITAL_ITEM_FUNDING_GOAL`). |

Each new read is a registered operation with the full registry footprint (governance allowlist, semantic maps, audience policy, trust policy, coverage matrix, certification fixture). R-ATM-3 may instead be satisfied by making the existing profile-roof inventory answer and the funding read share one cost function; this is a design choice recorded in §14.

---

## 8. Conversational slots

| ID | Requirement |
|---|---|
| FR-SLT-1 | The session carries typed slots: `item`, `targetDate`, `horizonYears`, `amount`, `objective`, `referencedExecutionId`. Slots are set only from deterministic reads of the message (existing shared readers, C11) or from a validated operation result. |
| FR-SLT-2 | An elliptical message ("what about the water heater?", "make it 10 years", "what would it cost?") resolves against the slots of the most recent answered turn. |
| FR-SLT-3 | Before reuse, a slot is **revalidated**: the entity still exists, the user is still authorized, the property matches, and the slot is no older than the turn window (§14, default: the last 5 completed turns). A failed revalidation asks one focused question; it never silently falls back to a default. |
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

## 11. Routing improvements (conservative)

| ID | Requirement |
|---|---|
| FR-RTE-1 | Safety and direct-intent precedence are unchanged. No model overrides them. |
| FR-RTE-2 | Calibration drift (fixtures 015, 065, 075, 121, 068, 122) stays a recognised known set until calibration is isolated per operation or family; the exact-evidence test already reports it separately and fails on any new drift. |
| FR-RTE-3 | Per-family calibration isolation is a design item (§14, D3): adding or re-recording evidence for one operation must not move unrelated operations' routing. |
| FR-RTE-4 | Hard negatives and independently authored examples are added alongside every new operation. |
| FR-RTE-5 | A model classifier remains bounded and optional, and only when the deterministic and local stages abstain. |

---

## 12. Acceptance and measurement

### 12.1 Corpora

| Corpus | Today | Target |
|---|---|---|
| Compound corpus | 33 prompts | ≥ 100, across capital, ownership cost, coverage + cost, sell/refi/upgrade, timing comparisons; held-out slice written before looking at misses |
| Routing certification | 126 fixtures | Unchanged or larger; 0 wrong routes at HIGH confidence |
| Independent routing sweep | 690 prompts | No phrasing that routed correctly stops; no new misroutes (existing ratchet) |
| Multi-turn slot corpus | none | New: ≥ 40 elliptical follow-ups with expected resolved slots |

### 12.2 Required automated tests (no database)

- Decomposition: clause split, ≤ 3 cap, FR-DEC-3/4 eligibility, same-operation merge, FR-DEC-7 skip.
- Status table §6.2 for every row, including first-component clarification.
- Authority table §6.3.1: dated and undated cost; two sections with different bases never render two unlabeled figures (the C3 regression, as a test).
- Contradiction detection §6.6: same basis disagreement fails to limited.
- Composition validator §6.7: unique ids, allowlist, numeric-in-payload, post-validation immutability.
- Action deduplication §6.5.
- Slot revalidation §8: removed entity, lost authorization, stale turn, property switch.
- Narration guard §9: fabricated number rejected, template used.
- Writes: a composite never contains confirmation, capture or write actions (§6.4).

### 12.3 Metrics

Composition rate; per-section and composite status distribution; composition-validator failures; contradiction detections; unanswered-clause reasons; added latency; model-call count (must be 0 for deterministic composition).

### 12.4 Runtime verification (owner, real backend)

Only data-dependent behavior needs it: the roof prompt on a home with a profile roof year and no tracked roof item, on a home with a tracked roof, and with no reserve deposits logged; rendering of the composite in the Ask workspace.

---

## 13. Phasing

| Phase | Content | Gate |
|---|---|---|
| 0 | This FRD accepted; §14 decisions taken; compound corpus grown to ≥ 100 with held-out slice | Owner sign-off |
| 1 | R-ATM-3 single cost source (fixes the C3 divergence even without composition) | Test: profile-roof read and funding read give one figure per basis |
| 2 | Composite result contract §6 + composition validator, for **two** components, deterministic splitting, the roof prompt first | §12.2 tests green; compound corpus partial→full gain measured |
| 3 | Slots §8 and elliptical follow-ups | Multi-turn corpus ≥ target; no regression in sweeps |
| 4 | Remaining atomic reads R-ATM-1/2/4 | Each with registry footprint and certification fixture |
| 5 | Answer-first narration (template first) | Guard tests green |
| 6 | Recovery order §10, calibration isolation design | Calibration known-drift set shrinks |
| 7 | **Only if** Phases 2–6 leave a measured gap: evaluate a bounded model classifier or decomposer for ambiguous requests | New FRD; owner decision |

---

## 14. Open decisions for the owner

| ID | Decision | Recommendation |
|---|---|---|
| D1 | Replacement cost without a date: today's dollars first, with the expected-window figure as a second labeled line? | Yes (FR-BAS-4). The current cost-only mode leads with the future-dollar figure. |
| D2 | One shared cost function for the profile-roof inventory answer and the funding read, or a new atomic replacement-cost operation? | One shared function: smaller, and it removes the divergence at its source. |
| D3 | Calibration isolation: per operation, per family, or accept the global curve with the known-drift list? | Per family; until then keep the known-drift list. |
| D4 | Slot turn window and whether `objective` is carried | 5 turns; carry `objective` only when the homeowner stated it. |
| D5 | Composite status `PARTIAL`: new status value, or `READY_WITH_LIMITATIONS` with a flag? | `READY_WITH_LIMITATIONS` plus a `partial: true` marker if adding a status value touches the client contract widely; confirm before Phase 2. |
| D6 | Cap on components | 2 for Phase 2; raise to 3 after measurement. |

---

## 15. Risks

| Risk | Mitigation |
|---|---|
| Two components disagree on a figure | §6.3 authority table and §6.6 detection; the C3 case is a required test. |
| A stripped action fails silently inside a composite | FR-ACT-1/4: composite adds no actions; the composition validator checks allowlists. |
| Composition raises latency | FR-EXE-4 concurrency; two-component cap in Phase 2; latency metric. |
| Over-composition of vague clauses | FR-DEC-3 requires ≥ 0.85 and READ only; vague clauses are reported as not answered, not guessed. |
| Slot carry-over applies to a deleted or foreign entity | FR-SLT-3 revalidation. |
| Registry footprint of new atomic reads | Known gotchas (governance allowlist or the API crash-loops at boot; action ids must be allowlisted; certification fixture; semantic maps). Run the startup registry validation test with each. |

---

## 16. Traceability

| This FRD | Source |
|---|---|
| §1.3, FR-EXE-5, FR-NAR-5 | Trust addendum §7, §29.2 |
| §4–§6 | Compound audit §8 Phase 3; FRD 1.540/1.542 (button), 1.554 (withdrawn auto-follow) |
| §6.3 | FRD 1.548 (cost-only mode), observed live defect C3 |
| §6.7 | `askAnswerTrustPolicy`, `validateAskAnswerTrustPipeline` |
| §9 | `askResultSynthesis.service.ts` numeric guard |
| §11 | Routing coverage and calibration doc; known-drift list |
| §8 | FRD 1.539/1.543/1.544 shared slot readers; owner decision 2026-11-09 on "currently saving" |

---

## 17. What this document does not establish

- No composite has been built or run; every §6 requirement is a proposal.
- The §2 findings about handlers are code-traced, not run against a real database.
- The 126-fixture and 690-prompt figures are offline sweeps on authored corpora, not live traffic.
- Whether two-component composition lifts the compound corpus enough to justify §13 Phases 3–6 is unmeasured; Phase 0 and Phase 2 exist to measure it.
