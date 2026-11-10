# Ask Cozy — Conversational Concierge: Bounded Read Composition FRD

**Status:** Draft v0.8 for owner review (deterministic attempt selection, retry-near-expiry policy, contractual coverage)
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
- v0.8: deterministic selection among multiple successful attempts, derived from the whole attempt set and independent of completion order (FR-PER-10, FR-PER-15); retries are rejected when the family is expired or has less than one execution timeout left (FR-PER-16); FR-DEC-7 is **contractual** coverage declared in the registry, inactive until an operation declares it (FR-DEC-7, FR-ELG-7); tests and runtime rows for each.
- v0.7: a final authorization gate before visible persistence and on every replay and delivery (§6.10, FR-AUT-1 to FR-AUT-5); property-access loss invalidates the whole composite, role or eligibility changes redact only affected sections, and authorization loss overrides refresh downgrade preservation (FR-PER-7); replay order made explicit (FR-PER-6); assembly-version initialization defined (FR-PER-13: null for non-composites, 0 at creation, exactly one increment per accepted mutation, null on a composite is an invariant failure); runtime rows 8, 8b, 10 and 11d.
- v0.6: atomic assembly ownership (FR-PER-13: assembly version, guarded claim, compare-and-set, idempotent completions); retention and deletion of a composite as one family (FR-PER-14), grounded in the retention code (`purgeExpiredAskExecutions` expires each row on its own `expiresAt`, so a parent can be purged before its later-created children); timeout test uses the existing `AskExecutionTimeoutError` and distinguishes it from the composite's `notAnswered` reason; unit and runtime tests no longer assume resumption or immediate partial on first timeout.
- v0.5: lifecycle trace T1–T7 completed against the code (§5.3, all [Code-traced], none exercised against a database). It changed requirements: there is no resume of a half-finished execution, only a new attempt (FR-PER-4 reworded); the main create path has no unique-violation catch, so concurrent identical requests race (FR-PER-11); timeout already maps to `FAILED_RETRYABLE` with the error name `AskExecutionTimeoutError` (§5.2.1 corrected); existing child executions are first-class transcript items, so hiding component children needs a discriminator and a composite renderer (FR-PER-12, D10); retry linkage lives in `resultJson`, not a column (FR-PER-10).
- v0.4: runtime matrix corrected to the settled architecture (the roof composite uses `ITEM_REPLACEMENT_COST`, not the funding goal; the no-deposits case moves to the funding goal's own suite); FR-ELG-6 certifies the **real** handler and real domain-service path with recording adapters only at infrastructure boundaries; child-state mapping including `FAILED_RETRYABLE` (§5.2.1); execution-lifecycle trace made a Phase 0 gate with preliminary findings (§5.3); R-ATM-3 no longer allows the shared function alone; concurrent-dispatch authorization test uses synchronization hooks; certification-corpus claim narrowed to what the coverage document supports.
- v0.3: registry scan done and D7 settled (§4.3); corrected the v0.2 claim that `CAPITAL_ITEM_FUNDING_GOAL` is `STANDARD` (it is `MATERIAL_DECISION`), so the roof prompt needs a new `STANDARD` atomic cost read (R-ATM-3, D2); added the corpus-reach finding (C14) and a per-operation purity test as the admission gate (FR-ELG-6).
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
| C5 | Certification corpus (121 independent fixtures plus 5 regressions, 126 total; English only; written to avoid the operation index, per the coverage document): 92 routed to the expected operation (73%), 0 wrong, 8 clarified with the right operation offered, 26 to fallback. These are authored certification fixtures, not production traffic, and they do not establish accuracy on unseen messages. | [Executed] (coverage doc) |
| C6 | Independent 690-prompt routing sweep: 53–59% correct operation. Different corpus from C5; neither is "the" accuracy. | [Executed] (earlier audit) |
| C7 | Compound corpus (33 prompts, each listing the operations its answer needs). First run (audit §0): 15 full / 11 partial / 1 clarify / 4 wrong / 2 fallback. After the sale-upgrade routing fix (FRD 1.550) the baseline was re-recorded at **15 / 12 / 1 / 3 / 2** (`node scripts/ask-compound-sweep.js`, 2026-11-09). Use the re-recorded baseline as the reference. | [Executed] |
| C8 | `askResultSynthesis` rewrites one operation's validated blocks into one sentence and rejects any number not in the payload. | [Code-traced] |
| C9 | Trust validation (`validateAskAnswerTrustPipeline`) is keyed to **one** operation: block-id contracts, per-operation action allowlists, boundary requirements, relevance. A block or action that fails is stripped, silently for actions. | [Code-traced] |
| C10 | Sessions, bounded follow-up rewriting, continuation contracts and capture context exist. General cross-operation carry-over of item/date/amount does not. | [Code-traced] |
| C11 | Shared slot readers exist: dates (`support/targetDate.ts`), item names (`inventoryItemAliases`, `itemFundingWording`), dollar amounts (`support/moneyAmount.ts`). | [Code-traced] |
| C12 | Operation definitions carry `safetyClass` (`STANDARD`, `MATERIAL_DECISION`, and three boundary classes) and a `family`. Family alone is not a safety classification: many `DECISION_ANALYSIS` operations are `MATERIAL_DECISION`. | [Code-traced] |
| C14 | **Registry scan** (227 operations, over `ASK_OPERATION_DEFINITIONS`, 2026-11-09): 55 are `STANDARD`, routable, deterministic, property-scoped RECORD_QUERY/STATUS_SUMMARY reads (candidates); 76 are `MATERIAL_DECISION` and routable or not (13 decision analyses, 15 status summaries, 46 commands, 1 monitor, 1 workflow). `CAPITAL_ITEM_FUNDING_GOAL`, `CAPITAL_RESERVE_PLAN`, `REPLACEMENT_GUIDANCE` and `OWNERSHIP_COSTS` — the four operations the compound corpus needs most (10, 8, 6 and 5 rows) — are all `MATERIAL_DECISION`. Of the corpus's 21 multi-operation rows, **only 4 need `STANDARD` reads alone**. | [Executed] |
| C15 | Handler files contain no direct `prisma.<model>.<write>` calls; writes go through services, and handler files are shared with command handlers. A static scan therefore **cannot certify an operation as read-only**; certification needs a per-operation runtime test (FR-ELG-6). | [Executed] scan, [Inferred] conclusion |
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
| FR-ELG-7 | Every declared `quantityKey` in `answersQuantities` must exist in the authority table (§6.3.1) and name that operation as the authority for the declared mode; the startup validation test (FR-ELG-4) fails the build otherwise. |
| FR-ELG-5 | The initial allowlist is §4.3 and contains only operations the owner has approved by name. |
| FR-ELG-6 | **Admission gate.** An operation joins the allowlist only with a per-operation runtime test that executes the **real handler and the real domain-service path**, replacing only **infrastructure boundaries** with recording adapters: the Prisma client, event publication, job queueing, outbound model and network calls, and cache or storage writers. The test **fails** on any Prisma write, published event, queued job, outbound model or network call, workflow, journey or thread creation, or other mutation; it **permits and records** reads; and it asserts the result contains no confirmation, capture request, proposal, write action or `WORKFLOW_PROGRESS` block. A fake that replaces a domain service does not count, because it hides the transitive behavior being certified. Where a service cannot be exercised this way, admission requires direct code-path evidence **and** a narrower operation-owned pure reader that the composable operation uses instead. The existing `correctionHandlersRuntime` test is a starting pattern only, since it stubs the writers. |

> Consequence: the allowlist is narrow, and it does **not** include `CAPITAL_ITEM_FUNDING_GOAL` (`MATERIAL_DECISION`). The roof prompt composes only if its cost clause is answered by a `STANDARD` atomic read (R-ATM-3), not by the funding goal.

### 4.3 The initial allowlist (D7, settled)

Selection rule: the operation is `STANDARD`, routable, deterministic, a RECORD_QUERY or STATUS_SUMMARY, property-scoped, with no workflow, capture or confirmation block type, and it either appears in the compound corpus's needs or answers a core item fact. Approved by name, **subject to FR-ELG-6 passing for each**:

| Operation | Why | Role floor |
|---|---|---|
| `INVENTORY_LOOKUP` | Item age, condition, install year; includes the home-profile roof read | VIEWER |
| `WARRANTY_LOOKUP` | In 5 corpus rows | VIEWER |
| `APPLIANCE_FAILURE_RISK` | Age-based failure risk, replacement estimate; in 3 rows. Report path calls `generateOracleReport` with recommendations off; the separate `recalculateLifespan` writer is not on that path (to be proven by FR-ELG-6) | OWNER |
| `MAINTENANCE_BUDGET_FORECAST` | Yearly upkeep forecast; in 2 rows. Calls `generateBudgetForecast` with recommendations off | OWNER |
| `DO_NOTHING_SIMULATION` | Latest saved simulation read; in 2 rows | OWNER |
| `HOME_UPGRADE_SCENARIOS` | Saved upgrade options; in 1 row | VIEWER |
| `RECALL_REVIEW` | In 1 row | VIEWER |
| `HOME_TIMELINE_EVENTS` | Home timeline read; no mutator calls found | VIEWER |
| `ITEM_REPLACEMENT_COST` (new, R-ATM-3) | A `STANDARD` fact: the replacement-cost estimate for an item in today's dollars and at the expected window | VIEWER |

**Excluded on purpose:**

| Operation | Reason |
|---|---|
| `MAINTENANCE_STATUS` | Emits a `WORKFLOW_PROGRESS` block |
| `PROPERTY_SUMMARY` | Same handler file carries area-capture confirmation paths; needs a trace before admission |
| `INTELLIGENCE_ENVELOPE_QUERY`, `HOME_CHANGE_SUMMARY` | Call `runItemAnalysis` |
| `INSPECTION_NEGOTIATION_PACKAGE` | Builds a package (`generateNegotiationPackage`) |
| `CLAIM_CHECKLIST_VIEW`, `GUIDANCE_JOURNEYS_LIST`, `HOME_HABITS`, `HOME_EVENT_RADAR_FEED`, `PROJECT_TRACKER_PROJECTS` | Same handler file calls mutators (`updateChecklistItem`, `dismissJourney`, `dismissHabit`, `updateState`, `createSpec`); admit only after a per-operation test proves the read path is clean |
| Every `MATERIAL_DECISION` operation, including `CAPITAL_ITEM_FUNDING_GOAL`, `CAPITAL_RESERVE_PLAN`, `REPLACEMENT_GUIDANCE`, `OWNERSHIP_COSTS`, `COVERAGE_GAPS` | FR-ELG-3 |

**Reach, stated plainly.** With this list only a minority of today's compound corpus rows can compose (4 of 21 multi-operation rows need `STANDARD` reads alone, C14). The headline roof prompt composes only through `ITEM_REPLACEMENT_COST`. Rows that need funding, reserve planning, replacement guidance or ownership costs keep the "Also answer" button. If the owner wants those composed, that is a separate decision with its own tier and thresholds (§15, D8).

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
| FR-DEC-7 | **Contractual coverage only.** A composable operation may declare in the registry the quantities it **always** answers, per mode, as `answersQuantities: [{ quantityKey, mode }]`. Before execution, if the first clause's operation declares the quantity the second clause asks for, on the basis the question implies, the second clause is not dispatched. Coverage is **never inferred** from prose, block contents or a result before trust validation, and the first component is never run just to decide whether to run the second (that would break concurrent dispatch, FR-EXE-4). **In v1 no operation declares coverage, so this requirement is inactive and both components run**; duplicates are handled by the authority table (§6.3), contradiction detection (§6.6) and the basis projection instead. |

Single-clause messages follow today's path unchanged.

---

## 5. Functional requirements — execution and persistence

### 5.1 Execution

| ID | Requirement |
|---|---|
| FR-EXE-1 | Each component executes **independently** through the existing execution path: access check, adapter, audience policy, per-operation trust validation. A component's failure does not abort the other. |
| FR-EXE-2 | Access to the property is re-checked **per component** at execution time, inside that component's own service path. This is **not sufficient on its own**: authorization can change before assembly, persistence, replay or delivery, so the final gate in §6.10 applies regardless of what each component saw at execution time. A component that fails its own check returns a not-authorized section. |
| FR-EXE-3 | Component execution is read-only. A component that returns a confirmation, capture request or write action is treated as a violation of FR-ELG-2 and its section is replaced by a limitation. |
| FR-EXE-4 | The two components are dispatched concurrently when independent. Each has a timeout; a timed-out or cancelled component yields a limitation section, never a hang (state mapping in §5.2.1). Authorization is checked **independently inside each component's own canonical service path**, so no ordering between components is assumed. |
| FR-EXE-5 | No generative-model call occurs in decomposition, execution or assembly. Optional narration (§9) is separable and measured separately (addendum §29.2). |

### 5.2 Parent/child persistence, idempotency and recovery

| ID | Requirement |
|---|---|
| FR-PER-1 | A composed turn is **one parent execution** in history, with one child execution per component (`parentExecutionId`). History shows one entry. |
| FR-PER-2 | Each child's `clientRequestId` is deterministic: a stable hash of the parent's `clientRequestId` and a **stable component identity** (`operationId` plus the normalized slot set), never the array position alone. Because `(userId, clientRequestId)` is unique (C13), a retry of the parent computes the same child keys. |
| FR-PER-3 | Child creation is **get-or-create**: a retried parent finds existing children by key and reuses them; it does not recreate or re-run a terminal child. |
| FR-PER-4 | Assembly is **recoverable**, not resumable. If the process stops after one child persisted, a retry **creates an initial attempt for a child that never existed** and a **new numbered attempt for a `FAILED_RETRYABLE` child**; a child already in a terminal outcome is reused, never re-run (FR-PER-10) and then assembles. The current lifecycle has no resume of a half-finished execution (T1, T2). |
| FR-PER-5 | The parent reaches a terminal status **only after both children have a terminal component outcome** under §5.2.1. A child in `FAILED_RETRYABLE` is **not** terminal: the parent stays non-terminal (or shows a retry affordance) until the child's retry policy is exhausted or it is explicitly converted to a terminal limited outcome. Parent replay never freezes a retryable child indefinitely as a limitation. |
| FR-PER-6 | The assembled composite is persisted on the parent when assembled and is the durable **domain answer**. Reload **replays** it from the same child set without recomputing that answer, but **only after the §6.10 gate passes**, in this order: (1) authorize the session and property; (2) re-authorize every selected child operation and its source visibility; (3) redact or invalidate inaccessible sections; (4) recompute **only the delivery projection and status**, never the underlying domain answer; (5) return the authorized projection. Returning the stored parent result before step 2 is a defect: stale authorization must never become durable disclosure authority. |
| FR-PER-7 | Refresh of a composed turn refreshes **each child** through the existing per-execution refresh and then reassembles the composite from the refreshed children, re-running §6.7. A refresh that would **downgrade a child for a data-quality or temporary-service reason** keeps that child's prior validated result and marks the section stale. **That preservation rule never applies to authorization-class changes:** lost property access; household-role downgrade below an operation's floor; changed source-record visibility; deleted or private records; or a safety or policy change that now prohibits disclosure. In those cases the prior section is **removed from the parent's deliverable projection** even though its child execution remains stored for audit and retention. Authorization loss always overrides stale-result preservation and downgrade protection. |
| FR-PER-8 | If a child is expired, deleted or has become inaccessible when the parent is reloaded, that section is replaced by an "unavailable" limitation and the composite becomes `coverage: PARTIAL` on next read, subject to the stronger rule in §6.10 when the cause is loss of property access (the whole composite is withheld). The parent is never reported `COMPLETE` while a section is unavailable. |
| FR-PER-9 | Duplicate delivery of the same parent request (double submit, network retry) yields one parent and the same two children. |
| FR-PER-10 | A successful retry of a `FAILED_RETRYABLE` child updates the parent **deterministically and idempotently**. Each attempt is its own child execution with a stable attempt number in its key (`…:attempt:N`). The existing retry link, `continuesExecutionId`, is stored inside `resultJson` and not in a column (T7), so the **parent holds the authoritative attempt set** and the selection below. A duplicate delivery of the same retry yields the same parent state. |
| FR-PER-11 | Child creation is **create-then-catch**: the child row is created and a unique-violation (`P2002`) on `(userId, clientRequestId)` is treated as "already exists", after which the existing row is read and, if `RECEIVED`, claimed with a status-guarded `updateMany` (`RECEIVED` → `RUNNING`, count 1 wins). The main `createAskExecution` path has no such catch today (T3) and must not be the model; `askConfirm`, `askCapture` and conversational capture already are. |
| FR-PER-12 | **Component children are not transcript items.** Session reads, pending-work reads, search, history and the client's transcript merge must show one composite per parent and hide its component children, while capture children (today first-class cards) keep their behavior. This needs a discriminator between the two kinds of child (T5, D10). |
| FR-PER-13 | **Atomic assembly ownership.** Concurrent child completions, retries and refreshes must not lose an attempt or assemble two different composites. (a) The parent carries an **assembly version** (an integer; D10(c) adds a nullable column, otherwise a version field inside the composite JSON updated only through a guarded write). (b) The authoritative child-attempt set is read, merged and written **atomically**: a transaction that reads the parent, merges the change, and writes with a guarded `updateMany` whose `where` includes the version read (count 1 wins), or an equivalent row lock. (c) A worker may **assemble only after winning the claim** for a given version; the version is incremented as part of the winning write. (d) A failed compare-and-set **re-reads and retries** (bounded, then surfaces a retryable error). (e) Before the parent becomes terminal, the assembler **validates that both selected child attempts still match the claimed version**; if either changed, it reassembles for the new version. (f) A duplicate completion event for an attempt already recorded is a no-op that returns the current parent state. **Version initialization:** a non-composite execution has `assemblyVersion = null`; a composite parent is created with `assemblyVersion = 0`; every accepted attempt-set mutation increments it **exactly once**; the compare-and-set always matches a concrete integer; a composite parent whose version is `null` is an **invariant failure** (surfaced and logged), never silently read as 0. |
| FR-PER-14 | **A composite is one retention family.** (a) Component children get the **same `expiresAt` as their parent** at creation, so per-row retention (`purgeExpiredAskExecutions`) cannot expire a parent before its children. (b) Deleting a parent execution, by user request or retention, **deletes its component children in the same transaction**; a database cascade cannot do this because `onDelete: SetNull` and capture children must keep their behavior, so it belongs in the deletion and retention services. (c) A **cleanup pass** removes orphaned component children, detected as `parentRole = COMPONENT` **and** `parentExecutionId IS NULL`, covering an interrupted deletion. (d) Cleanup **never deletes a component child that an active attempt set still references**; because all attempts belong to the same parent, this means no child is removed while its parent exists. (e) Capture children (no `parentRole`) keep today's behavior. (f) Session deletion already cascades every execution in the session (`AskExecution.session` is `onDelete: Cascade`); this requirement adds nothing there but must be tested. |
| FR-PER-15 | **Deterministic attempt selection.** (a) **Attempt numbers are allocated by the parent** inside the same compare-and-set that records the new attempt (FR-PER-13), so they are unique and totally ordered per component. (b) Each attempt has a **kind**: `INITIAL`, `RETRY` (automatic or manual recovery of a `FAILED_RETRYABLE` child) or `REFRESH` (an explicit correction or refresh). (c) The selected attempt for a component is **derived from the complete attempt set**, never by moving a pointer to the most recently completed attempt: first, only attempts with a successful component outcome (answered or answered-with-limitations) are candidates; among them, the **highest-numbered successful `REFRESH` attempt** wins if any exists (an explicit supersession), otherwise the **lowest-numbered successful** `INITIAL` or `RETRY` attempt wins. (d) If no attempt succeeded, the **highest-numbered terminal limited attempt** is selected; if none is terminal, the component is pending. (e) Completion of an older attempt can never replace a selected newer `REFRESH` attempt. (f) The parent stores the **selected attempt id and a selection reason** (`LOWEST_SUCCESSFUL`, `EXPLICIT_REFRESH`, `ONLY_TERMINAL_LIMITED`) in its authoritative state, and reassembly recomputes both from the attempt set. The result is therefore identical regardless of the order in which attempts complete. |
| FR-PER-16 | **Retries near family expiration are rejected, not extended.** All component attempts share the parent's fixed `expiresAt` (FR-PER-14). A retry, automatic or manual, is **rejected** if the parent is expired or has **less than one configured execution timeout (`executionTimeoutMs`)** remaining; a rejected automatic retry converts the component to a terminal limited outcome immediately (D9), and a rejected manual retry tells the user to ask the question again, which creates a new parent family. Creation of an attempt is **guarded in the same transaction** by re-reading the parent's `expiresAt`, so retention racing with retry creation cannot leave an attempt that expires before it completes. No attempt ever has an `expiresAt` later than its parent's, and the parent is never extended. |

#### 5.2.1 Child-state mapping

Existing `AskExecutionStatus` values, as they contribute to the parent:

| Child status | Terminal for the parent? | Component outcome |
|---|---|---|
| `ANSWERED`, `COMPLETED` | Yes | Answered section |
| `READY_WITH_LIMITATIONS` | Yes | Limited section |
| `FAILED_TERMINAL` | Yes | Limitation section with the child's reason code |
| `CANCELLED` | Yes | "Not completed" limitation |
| `UNAVAILABLE`, `BLOCKED`, `OUT_OF_SCOPE`, `NOT_APPLICABLE` | Yes | Limitation or not-answered entry by reason code |
| `FAILED_RETRYABLE` | **No** until the retry policy is exhausted, then converted to a terminal limited outcome | Pending; shown as "retrying" or with a retry affordance |
| `RUNNING`, `RECEIVED`, `ROUTING` | **No** | Pending |
| `NEEDS_CLARIFICATION`, `NEEDS_CONTEXT`, `NEEDS_ENTITY`, `NEEDS_PROPERTY` | Handled by §6.2 (dependency-based clarification), not as a component failure | Clarification |
| `NEEDS_CONFIRMATION`, `OUTCOME_UNKNOWN` | Never produced by an allowlisted read (FR-ELG-2/3); if observed, the component is a violation (FR-EXE-3) | Limitation plus an integrity metric |

**Timeout.** The existing mechanism already maps a timeout correctly: `withAskTimeout` rejects with `AskExecutionTimeoutError` after `executionTimeoutMs`, and `askFailureStatus` maps it to `FAILED_RETRYABLE` (only permission, missing-property, schema and invariant errors are `FAILED_TERMINAL`). A component timeout therefore uses that path unchanged, with `errorCode: AskExecutionTimeoutError`, not a new reason code. `withAskTimeout` does not cancel the underlying work, which is acceptable for an allowlisted read (FR-ELG-6) but must be remembered when sizing the timeout. Proposed policy (owner to confirm, D9): one automatic retry within the same turn, then conversion to a terminal limited outcome; a later manual retry follows the existing retry path.

**Retry mechanics.** `retryAskExecution` accepts a source in `FAILED_RETRYABLE` (or `UNAVAILABLE` unless the reason is relevance-unresolved), builds a request with a fresh `clientRequestId`, pins the source's operation, and creates a **new execution**; it records `continuesExecutionId` in the new row's `resultJson` and `RETRY_STARTED` / `RETRY_OF_EXECUTION` events. Child retry reuses that pattern: it records a new attempt on the parent (FR-PER-10), the parent derives the selected attempt from the whole set (FR-PER-15), and the failed attempt is never mutated.

### 5.3 Lifecycle trace (completed 2026-11-09; was a Phase 0 gate)

Each finding is **[Code-traced]**: read from source, not exercised against a database. File references are relative to `apps/backend/src/services/ask/` unless noted.

| # | Question | Finding | Verdict for this FRD |
|---|---|---|---|
| T1 | Which statuses can be resumed, and which are retried by new execution? | No status is resumed. `askExecutionCanRetry` (`execution/askRetry.ts`) allows retry for `FAILED_RETRYABLE` and for `UNAVAILABLE` unless the reason is `ASK_ANSWER_RELEVANCE_UNRESOLVED_AFTER_CLARIFICATION`. A retry calls `createAskExecution` with a fresh `clientRequestId`, producing a new row. | FR-PER-4 reworded: recovery by new attempt, not resume. |
| T2 | Which function resumes or runs a child, or is a new one needed? | None exists for composition. Conversational capture creates its children as rows directly, already in `NEEDS_CONFIRMATION`, and never *executes* them (`conversationalUnderstanding/conversationalCapture.ts`). A component must be executed: `executeOperation` (`execution/executeOperation.ts`) runs an operation for an existing `executionId`, wrapped by `withAskTimeout`, but the row lifecycle (`RECEIVED` → `ROUTING` → `RUNNING` → terminal, events, failure persistence) is inline in `createAskExecution`. | **New component runner required** that creates a child row and drives it through the same lifecycle, reusing `executeOperation`. Extracting the lifecycle from `createAskExecution` is a refactor risk to weigh in Phase 2. |
| T3 | Two requests meet the same key or the same running child | `createAskExecution` does `findUnique` on `(userId, clientRequestId)` and returns the existing row verbatim, after `reclaimOrphanedRunningExecution`; it does **not** wait for an in-flight `RUNNING` row. It then does a plain `create` with **no `P2002` catch**, so two simultaneous identical requests race and the loser gets a unique-violation error. Leases exist only for confirmed commands (`execution/askConfirm.ts`, `leaseExpiresAt`). Status-guarded `updateMany` is the existing compare-and-set pattern (`reclaimOrphanedRunningExecution`). | FR-PER-9 and runtime rows 4 and 6 **would fail today at the parent level**. FR-PER-11: create-then-catch plus a status-guarded claim for children; decide separately whether the parent path gets the same catch (D10). No lease column needed. |
| T4 | Stale `RUNNING` after process death | `reclaimOrphanedRunningExecution` (`execution/askSessions.ts`) moves a `RUNNING` read with no confirmation receipt to `FAILED_RETRYABLE` / `ASK_EXECUTION_INTERRUPTED` once `executionTimeoutMs + 30 s` has passed. It is **lazy**: triggered by a duplicate request, by `expirePendingInteraction`, and by the pending-work read; there is no background sweep for `RUNNING` reads. | Works for allowlisted components. The composite assembler must call it for its children before deciding a child is stuck. |
| T5 | Do history and pending-work hide component children while allowing recovery? | **No.** `getAskSession` reads every execution by `sessionId` with no parent filter; the pending-work read selects by status with no parent filter; the client flattens `[response, ...childExecutions]` into the transcript (`mergeResultExecutions`). Existing children are therefore first-class cards. `AskExecutionResponse.childExecutions` is capped at 3 for a parent and empty for a child; two components fit. `askOutcomeReport` already excludes children (`parentExecutionId: null`). `onDelete: SetNull` on the parent relation leaves orphaned children if a parent is deleted, and retention (`askRetention.service.ts`) expires each execution on its **own** fixed `expiresAt`, so a parent created before its children is purged first (FR-PER-14). | FR-PER-12 and D10: a discriminator between component children and capture children, a composite renderer, and filters in the session and pending-work reads (the search read, `askSearch.service.ts`, was **not traced** and must be checked in Phase 2). A behavior change that must not hide capture cards. |
| T6 | Existing child-key precedent | Capture children use `ask-extraction:{parentId}:{index}` with `parentExecution: connect`, deterministic per parent and idempotent through `@@unique([userId, clientRequestId])`, with a documented `P2002` catch for the concurrent-create race. | FR-PER-2's identity-based key (operation plus normalized slots, plus attempt) is compatible and stricter; position alone is not used. |
| T7 | Schema changes required? | `AskExecution` has `parentExecutionId` (nullable, indexed, `SetNull`) and `childExecutions`. It has **no** attempt, lease, composition-kind or retry-link column; `continuesExecutionId` lives in `resultJson`. | **Recommended: one nullable discriminator column** (for example `parentRole`, with a value for component children) to satisfy FR-PER-12 without prefix-sniffing the `clientRequestId`. No lease or attempt column: the status-guarded claim and the key suffix suffice. Schema edits go in `prisma/schema.prisma` and are applied by the owner with `prisma db push` (no migration file). |

**Consequences.** The trace removes the "resume" assumption, shows two parent-level gaps (the unique-violation race and the visible-children behavior), and confirms two things the FRD already assumed (timeout maps to `FAILED_RETRYABLE`; orphaned `RUNNING` reads recover). Phase 2 is unblocked **once D10 is decided**, because FR-PER-11 and FR-PER-12 depend on it.

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
| Replacement cost, item, no date | `ITEM_REPLACEMENT_COST`, in today's dollars | R-ATM-3 |
| Replacement cost, item, dated | `ITEM_REPLACEMENT_COST`, grown to the date | Same shared cost function as the funding read, so they agree |
| Item age / install year | The inventory/profile read | |
| Reserve allocated to an item | Not composable in v1 | `CAPITAL_ITEM_FUNDING_GOAL` is `MATERIAL_DECISION`; stays single-operation |
| Monthly saving currently going toward an item | Not composable in v1 | Same; unknown, not $0, when no deposits are logged (FRD 1.553) |

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

### 6.10 Final authorization gate

Authorization is evaluated again at the **end**, not only at execution time.

| ID | Requirement |
|---|---|
| FR-AUT-1 | **Immediately before visible persistence of the composite and on every replay, refresh result and delivery**, revalidate (a) property access and (b) current audience and role eligibility for **every selected component**, including source-record visibility. |
| FR-AUT-2 | **Property access lost:** the whole composite is invalidated. No section, summary, figure, action or provenance is delivered, and the response is the same "no longer available" outcome `getAskSession` already gives for an inaccessible property (it drops those executions, FRD ASK-25.2). |
| FR-AUT-3 | **Household role changed, property access intact:** each operation is re-evaluated under the new role. Sections whose operation floor is still met are retained; sections no longer authorized are redacted. A composite with one section left is `coverage: PARTIAL`. |
| FR-AUT-4 | **Operation-specific eligibility changed** (feature or capability no longer eligible, record made private or deleted): only the affected section is redacted. |
| FR-AUT-5 | Authorization loss **overrides** stale-result preservation (FR-PER-7), downgrade protection, retry reuse, and the immutability rule (§6.8): redaction is applied in the delivery projection, never by editing validated blocks. The child executions remain stored for audit and retention. `answerFirst` and `basis` are recomputed from the surviving sections, or dropped if a section they cite was redacted. |

## 7. Atomic reads

Composition works only if small, trustworthy reads exist.

| ID | Requirement |
|---|---|
| R-ATM-1 | **Item age / install year** read that answers from inventory and the home profile (roof year included) and states its source. |
| R-ATM-2 | **Item condition** read. |
| R-ATM-3 | **`ITEM_REPLACEMENT_COST`**, a new `STANDARD`, composable read (§4.3) exposing the replacement cost in both *today's dollars* and *at the expected window*, each labeled, from one source (the capital timeline estimate), so the two cost bases in C3 cannot diverge. It is needed because `CAPITAL_ITEM_FUNDING_GOAL` is `MATERIAL_DECISION` and cannot compose. The inventory profile-roof wording, the funding read's cost line and this operation all call **one shared cost function**. |
| R-ATM-4 | **Reserve allocation for an item** (estimate, labeled). |
| R-ATM-5 | **Funding gap** for an item and date (exists: `CAPITAL_ITEM_FUNDING_GOAL`). |

Each new read is a registered operation with the full registry footprint (governance allowlist, semantic maps, audience policy, trust policy, coverage matrix, certification fixture) and, if composable, `composableRead: true` under FR-ELG-2 and the FR-ELG-6 purity gate. `ITEM_REPLACEMENT_COST` is required, not optional: it exists because `CAPITAL_ITEM_FUNDING_GOAL` is `MATERIAL_DECISION` and cannot compose (D2).

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
- **Decomposition:** clause split, two-clause cap, FR-DEC-3/4 all-clauses-composable rule, same-operation merge, FR-DEC-7 is inactive when no operation declares coverage and skips only on a registry declaration, never on result content; `answersQuantities` validation against the authority table (FR-ELG-7).
- **Status and clarification:** every §6.2 row; clause order reversed gives the same result for the same intents; dependency cases; one clarification, never a questionnaire.
- **Idempotency (unit level):** child key derivation is stable across array order and retries; recovery creates an **initial attempt only for a missing child** and a **new numbered attempt only for a `FAILED_RETRYABLE` child**; existing terminal children are reused and never re-run; parent terminal only when both children have a terminal component outcome.
- **Attempt selection (FR-PER-15):** two successful attempts for one component, completed in either order, select the same result and the same selection reason; the lowest-numbered successful `INITIAL`/`RETRY` wins over a later one; a successful `REFRESH` supersedes an earlier success and cannot be replaced by an older completion; with no success the highest-numbered terminal limited attempt is selected; attempt numbers are unique under concurrent allocation; reassembly recomputes the selection from the full set and ignores completion order.
- **Retry near expiry (FR-PER-16):** retry after the parent expired is rejected and creates nothing; retry with less than one execution timeout remaining is rejected; an automatic retry that would cross the boundary becomes a terminal limited outcome; retention racing with attempt creation leaves no attempt that outlives or expires before its parent; no attempt has an `expiresAt` after its parent's.
- **Retryable failure:** a child in `FAILED_RETRYABLE` keeps the parent non-terminal; after the retry policy is exhausted it converts to a terminal limited outcome; a retry that succeeds updates the parent once, idempotently, including on duplicate delivery; a timeout persists the child as `FAILED_RETRYABLE` with `errorCode: AskExecutionTimeoutError` (the existing mechanism, no new persisted reason), and only the composite's `notAnswered.reasonCode` is `COMPONENT_TIMEOUT` once retries are exhausted.
- **Assembly concurrency (FR-PER-13):** two simultaneous child completions both end up in the attempt set (no lost update); only one worker assembles a given version; a failed compare-and-set re-reads and retries; a retry completion racing a refresh produces one consistent composite; a duplicate completion is a no-op; the parent never becomes terminal on stale attempts.
- **Assembly version (FR-PER-13):** a non-composite has a null version; a composite is created at 0; the first accepted mutation sets 1 and a duplicate completion leaves it at 1; the compare-and-set matches a concrete integer; a composite parent with a null version raises the invariant failure and is not treated as 0; the counter near its integer limit is rejected, not wrapped.
- **Final authorization gate (§6.10):** complete property-access loss before first persistence, after persistence, on replay and on refresh returns no section data of any kind; a role downgrade keeps only still-eligible sections; an operation-eligibility change redacts only that section; redaction beats stale-result preservation and the refresh downgrade rule; `answerFirst` and `basis` are recomputed or dropped when a cited section is redacted; validated blocks are not edited by redaction; replay performs the five steps of FR-PER-6 in order.
- **Retention (FR-PER-14):** component children share the parent's `expiresAt`; parent deletion deletes its component children; an interrupted deletion leaves orphans that the cleanup pass removes (detected by `parentRole` and a null parent); capture children are untouched; session deletion removes the whole family; purge never deletes a child while its parent exists.
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
| 1 | Roof prompt, home with a profile roof year and no tracked roof item | One response, one history entry; authority for cost = `ITEM_REPLACEMENT_COST`, one basis stated |
| 2 | Roof prompt, home with a tracked roof item | Same; authority = `ITEM_REPLACEMENT_COST`; the profile-roof read and `ITEM_REPLACEMENT_COST` give the same figure per basis |
| 3 | Roof prompt where the cost estimate is incomplete: no capital timeline, an item with no cost estimate, or an unknown expected window | Cost section says what is missing; no guessed figure; `coverage` reflects it; age section unaffected |
| 4 | Double submit of the same request | One parent, two children, no duplicates (FR-PER-9) Fails today at the parent level (T3) until D10(b). |
| 5 | Kill the process after one child persists, retry (after the Phase 0 trace defines the mechanism) | Only the missing child runs; one assembled answer (FR-PER-4) |
| 5b | A child fails with `FAILED_RETRYABLE`, then a retry succeeds | Parent stays non-terminal while retryable; after the retry the parent reassembles once with the successful attempt; replay does not freeze the failure (FR-PER-5, FR-PER-10) |
| 5c | An automatic and a manual retry of the same child overlap and both succeed, then reload and refresh | The same single attempt is selected every time, with its selection reason, whatever the completion order (FR-PER-15) |
| 6 | Concurrent requests from two tabs | No unique-key violation surfaced; consistent single result |
| 7a | A component times out (first time) | Child persists as `FAILED_RETRYABLE` with `AskExecutionTimeoutError`; the parent stays **non-terminal** while the automatic retry is pending (D9) |
| 7b | The retry also fails or times out (retries exhausted), or a component fails terminally | Parent becomes `READY_WITH_LIMITATIONS` with `coverage: PARTIAL`; the other section is intact; `notAnswered.reasonCode` is `COMPONENT_TIMEOUT` for the timeout case |
| 8 | Property access revoked entirely while one component is paused at a synchronization hook just **before its own authorization check**, after the other component has completed | **No property data is delivered**: neither the paused component's section nor the completed one. The turn resolves to the no-longer-available outcome. Deterministic, not timing-dependent (FR-EXE-2, FR-AUT-2) |
| 8b | Household role downgraded (property access intact) after the composite was persisted, then the turn is reloaded | Sections whose operation floor is still met remain; sections now above the user's role are redacted; `coverage: PARTIAL` if one remains (FR-AUT-3) |
| 9 | A child expires or is deleted, then the parent is reloaded | Unavailable section, `coverage: PARTIAL`, remaining section unchanged (FR-PER-8) |
| 10 | Reload and open from history | Authorized first (FR-PER-6 steps 1–3), then replayed from the same children with no recomputation of the domain answer; revoked access returns nothing |
| 11 | Refresh a composed turn after underlying data changed | Each child refreshed, composite reassembled, downgrade rule respected (FR-PER-7) |
| 11d | Refresh a composed turn after property access was lost, or after a role downgrade, or after a source record became private or deleted | Prior section is **not** preserved; it is removed from the deliverable projection even though the child execution remains stored (FR-PER-7, FR-AUT-5) |
| 11b | Two components finish retries at the same instant, or a retry finishes during a refresh | One consistent assembled composite; no attempt lost; one assembly per version (FR-PER-13) |
| 11c | Delete the parent, run retention, interrupt a deletion midway | No hidden component children remain; capture children unaffected; a user-deleted session leaves nothing (FR-PER-14) |
| 11e | A retry is requested just before, at, and after the family's expiration | Rejected when expired or with under one execution timeout left; no orphan or short-lived attempt; the user is told to ask again (FR-PER-16) |
| 12 | Viewer-role user versus owner on the same prompt | Authorization per component; no action offered that the role cannot take |
| 13 | A material-decision phrase in a compound message | Turn not composed; single-operation path with the stated reason |
| 14 | A boundary or safety phrase in clause three of a long message | Whole turn handled by the boundary; nothing routed |
| 15 | Source with no observation timestamp | Freshness shown unknown; no request time shown |
| 16 | Rendering of the composite in the Ask workspace, desktop and phone width | One response; basis stated; no duplicate or conflicting figure |

---

## 13. Phasing

| Phase | Content | Gate |
|---|---|---|
| 0 | This FRD accepted; §15 decisions taken (including D10); lifecycle trace §5.3 **done**; compound corpus grown to ≥ 100 with held-out slice and required component sets | Owner sign-off |
| 1 | Shared cost function and the new `ITEM_REPLACEMENT_COST` operation (fixes the C3 divergence even without composition) | Test: profile-roof read, funding read and `ITEM_REPLACEMENT_COST` give one figure per basis |
| 2 | `composableRead` registry property and validation; FR-ELG-6 purity test for each allowlisted operation; composite contract §6 and validator; parent/child persistence §5.2; two components, deterministic splitting, the roof prompt first | §12.2 tests green; §12.4 matrix rows 1–16 recorded by the owner; compound corpus component-set correctness measured |
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
| Retries duplicate or orphan children | §5.2 deterministic child keys, create-then-catch, recovery by new attempt, assembly version and guarded claim (FR-PER-13), terminal-only-when-children-terminal, family retention (FR-PER-14) |
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

Settled in v0.3 by the registry scan (confirm or overrule):

| ID | Decision | Position in this draft |
|---|---|---|
| D7 | The composable-operation allowlist | **Settled:** §4.3. `STANDARD` reads only, approved by name, each admitted only after the FR-ELG-6 runtime purity test. Nine operations including the new `ITEM_REPLACEMENT_COST`. |
| D2 | One shared cost function, or a new atomic operation? | **Settled: both.** One shared cost function behind the profile-roof answer, the funding read and the new `STANDARD` `ITEM_REPLACEMENT_COST` operation, because the funding read is `MATERIAL_DECISION` and cannot compose. |

Open:

| ID | Decision | Recommendation |
|---|---|---|
| D8 | **Should `MATERIAL_DECISION` reads ever compose?** The scan shows only 4 of 21 multi-operation corpus rows are composable without them, and the four operations the corpus needs most are all `MATERIAL_DECISION` (C14). The trust addendum protects material *actions* and requires stronger routing and entity confidence for material decisions (clarify at medium confidence); it does not itself forbid composing material *reads*. | Not in v1: keep FR-ELG-3. Revisit after Phase 2 with a separate tier (read-only, HIGH confidence only, per-operation owner approval) if the measured reach is too low. This is a product-risk tradeoff, not a mechanical rule. |
| D1 | Replacement cost without a date: today's dollars first, expected-window figure as a second labeled line? | Yes (FR-BAS-4). The current cost-only mode leads with the future-dollar figure. |
| D3 | Calibration isolation: per operation, per family, or accept the global curve with the known-drift list? | Per family; keep the known-drift list until then. |
| D4 | Slot turn window and whether `objective` is carried | 5 turns; carry `objective` only when the homeowner stated it. |
| D9 | Component timeout and retry policy | One automatic retry within the turn, then a terminal limited outcome; timeout value set from measured component latency in Phase 2 |
| D10 | **Component-child discriminator and the parent-path race.** (a) Add a nullable `parentRole` column to `AskExecution` (owner runs `prisma db push`) so component children can be hidden from the session, pending-work and search reads while capture children stay visible. (b) Also add a `P2002` catch to the main `createAskExecution` create path so concurrent identical requests return the existing row instead of erroring. (c) Add a nullable integer assembly-version column (FR-PER-13) for compare-and-set on the parent. | (a) Yes, one nullable column, no migration file. (b) Yes: it fixes a latent race today, independent of composition. (c) Yes for the assembly version as a nullable integer column; the alternative, a version inside `resultJson`, needs the same guarded write and is harder to query and index. |

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
- Whether any allowlisted operation is actually side-effect-free is **not verified**: the scan found no direct database writes in handler files, but writes go through services and handler files are shared with commands (C15). FR-ELG-6 is the proof and has not been written.
- Whether two-component composition lifts the compound corpus enough to justify Phases 3–6 is unmeasured; Phases 0 and 2 exist to measure it.
- The lifecycle trace (§5.3) is code-traced only. It has not been exercised against a database, and the concurrent-create race (T3) is inferred from the absence of a `P2002` catch, not reproduced.
