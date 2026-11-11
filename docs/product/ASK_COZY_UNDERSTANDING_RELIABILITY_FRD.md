# Ask Cozy — Understanding Reliability: Reaching 90% Resolved Prompts Without Controlling the User's Wording

**Status:** Draft v0.4 for owner review (v0.3 committed as `5d91c6fe`; v0.4 answers a third external review, mapped in §21). No requirement of this FRD has been implemented or wired as a complete change. Some building blocks it relies on already exist and are described in §2.4–§2.6 (the model router, prompt minimisation, local calibration, the routing cascade, the trust validators and recovery rendering). An early draft of the normaliser was deleted at the owner's request on 2026-11-11.
**Date:** 2026-11-11
**Owner decisions needed:** §13
**Governing documents (read before changing this one):**
- `AI_HOME_CONCIERGE_ASK_TRUST_ARCHITECTURE_ADDENDUM_FRD.md` — §7 (non-goals), §15 (confidence: five separate dimensions; raw model scores are **not** calibrated probabilities; thresholds by effect, materiality, ambiguity margin, language, routing path and entity requirement), the metrics table (**incorrect high-confidence operation selection < 1%**) and §29.2 (cost policy) govern this document. §7 lists "guarantee correct interpretation of every possible utterance" as a Version 1 non-goal. **This FRD does not reverse that**: it sets a *measured target* (§4), never a guarantee, and §13 D1 asks the owner to confirm that reading.
- `ASK_COZY_CONVERSATIONAL_CONCIERGE_COMPOSITION_FRD.md` — FR-DEC-0 to FR-DEC-7 bind: deterministic per-clause resolution, no classifier per clause, composition only of certified composable reads, and refusal if any clause is a write, a material decision, a clarification or a fallback. **This FRD does not change any of that.** A model's reading of a second clause is advisory only (FR-UND-11).
- `AGENTS.md` (working assumptions, lines 27 and 36) — states there are no real users and bars pilot cohorts, staged rollouts and manual release certification unless the owner explicitly requires them. The owner has confirmed (2026-11-11) that there are no real users, so this FRD makes **no** cohort, staged-release or production gate (FR-EVAL-7, §13 D9).
- `docs/architecture/ASK_COZY_ROUTING_COVERAGE_AND_CALIBRATION.md` — earlier routing measurements.
- `ASK_COZY_INLINE_WORKSPACE_FRD.md` — revision 1.574 records the four fixes that motivated this document.
- `docs/architecture/AUDIT_METHODOLOGY.md` — applied in §15.

**Evidence labels** (`AUDIT_METHODOLOGY.md` §1): **[Executed]** = a program was run and the output observed; **[Code-traced]** = read from source, not run; **[Recorded]** = taken from an earlier session's notes and not re-run today; **[Inferred]** = extrapolated. Every figure in §2 carries one.

---

## 1. Purpose

A homeowner can ask anything about their home, in any words. The product does not control the text. Today a small change in wording — a typo, a polite opener, "vs" for "or", a trailing "?" — moves a prompt from a correct answer to a dead end. This FRD specifies what must change so that at least **90% of real homeowner prompts end in a useful result** (§4), and so that the remaining prompts still leave the user with a useful next step.

It specifies **requirements** (§6–§12) separately from **design options** (§14), per `AUDIT_METHODOLOGY.md` §8.

## 2. Problem and evidence

### 2.1 The five prompts that triggered this document (2026-11-11, owner screenshots)

| # | Prompt | What happened | Layer that failed | Fixed in |
|---|---|---|---|---|
| 1 | "is water heater under warranty, what would be the replacement cost if not" | Generic "What would you like to focus on?" card with three unrelated options | Two-part understanding: the item was only recognised after "my" | `de7787ec` |
| 2 | "how much should I save monthly for repairs" | Routed correctly (`CAPITAL_RESERVE_PLAN` 0.97), answer withheld ("I'm not sure I understood that", then "I still can't confirm that answer") | Answer gate: contract allowlist lacked 7 block ids the handler emits | `de7787ec` |
| 3, 4 | "how old is my roof", "what's my roof's condition" | Routed correctly (`INVENTORY_LOOKUP` 0.96), answer withheld, one-option card | Answer gate: profile-roof answer matched no accepted shape | `f30e65aa` |
| 5 | "repair roof now vs replace in 5 yrs which is better option" | Matched no rule, fell to guidance fallback at 0.55, "Did you mean one of these?" | Routing: rules only knew "repair or replace" | `aa06fa30` (rev. 1.574 item 4) |

**[Executed]** cases 1, 3, 4 and 5 were reproduced offline (the decomposer, and the trust pipeline with the fix removed) before their fixes. **[Code-traced]** case 2: the missing block ids were found by reading the handler against the contract; its failure was not reproduced end to end, and the fix was checked by a contract test only. **Five of five owner-reported prompts failed, across three different layers.** Each fix covered only its own wording.

### 2.2 Routing accuracy, measured today

All **[Executed]** on 2026-11-11, working tree at `f30e65aa` plus the then-uncommitted rev. 1.574 item-4 change (since committed as `aa06fa30`), single-turn, no conversation history, no buyer-mode gating, no real data.

| Corpus | Prompts | Correct | Dead-end fallback | Misroute | Clarification card |
|---|---|---|---|---|---|
| Main (`tests/fixtures/askRoutingCorpus.js`; `node scripts/ask-routing-sweep.js`) | 708 over 111 operations | 425 (60.0%) | 188 (26.6%) | 47 (6.6%) | 48 (30 offered the right option) |
| Held-out set 1 | 36 over 12 operations | 26 (72.2%) | 6 | 3 | 1 |
| Held-out set 2 | 24 over 12 operations | 9 (37.5%) | 12 | 1 | 2 |

**Caveats that make 60% an optimistic figure:** the main corpus is written and extended by the same people fixing failures, so it rises by construction; the held-out sets are small (n = 36 and 24) and cover only 12 operations; the main-corpus figure is routing only and ignores the answer gate (§2.4).

### 2.3 Sensitivity to meaningless edits

**[Executed]** (one-off script, not committed). Starting from the 425 prompts that routed correctly, six edits that do not change the meaning were applied:

| Edit | Still correct |
|---|---|
| Prefix "hey cozy, " | 393 / 425 (92.5%) |
| Suffix " please" | 410 / 425 (96.5%) |
| Prefix "can you tell me " | 354 / 425 (83.3%) |
| Trailing "?" | 409 / 425 (96.2%) |
| "my" → "the" | 178 / 196 (90.8%) |
| One transposed letter in the longest word | 149 / 396 (37.6%) |
| **All edits** | **1,893 / 2,292 (82.6%)** |

Where the broken prompts went (counts of breaks): "can you tell me" — 32 to a `MONITOR` operation (`HOME_DEADLINE_MONITOR`), 3 to a `WRITE`, 6 to another `READ`, 15 clarification, 15 fallback. Typo — 149 fallback, 52 clarification, 36 `READ`, 10 `WRITE`. **17 edited prompts landed on a write operation** across all edits. The transposed-letter edit hits the longest word, so 37.6% is a stress figure, not a typical-typo rate.

### 2.4 The answer gate is a second, independent failure point

**[Executed]** (registry and validator source inspected by a script): 229 operations, 124 routable by message. 21 have a canonical block-prefix contract, 17 have a typed validator branch, **86 have neither** (51 `READ`, 30 `WRITE`, 2 `MONITOR`, 3 `BOUNDARY`) and are judged by word-overlap scoring. The "17 typed" figure counts `input.operationId === '…'` branches in `askSemanticAnswerValidator.ts` and undercounts any branch written through a helper.

**[Code-traced]** For operations with a typed contract the contract is a hand-written list of allowed block ids (`askCapitalPlanIntent.ts`, `askInventoryIntent.ts`). Cases 2–4 above failed because the handler emitted ids the list lacked. **[Executed]** with the fix removed, both roof prompts returned `NEEDS_CLARIFICATION` / `INSUFFICIENT_RELEVANCE_SIGNAL`; with it, `ANSWERED` / `CANONICAL_TYPED_ANSWER_CONTRACT_MATCH`.

### 2.5 Size of the rule base

**[Executed]** `askOperationRegistry.ts` is 2,044 lines with 176 `const …Pattern =` regular expressions and 142 `Pattern.test(` branches. **[Executed]** 17 commits touched it since 2026-11-07. **[Inferred]** from their subjects, nearly all add or widen a pattern; the diffs were not classified.

### 2.6 The existing model router

**[Code-traced]** `askModelRouter.ts` exists and is **off by default** (`ASK_MODEL_ROUTER_ENABLED`, default false). It runs only for messages the local router could not place; it chooses among at most 10 `READ` operations that the *local* retrieval ranked highest; it cannot see home data, write an answer, or pick a write, monitor, boundary or fallback operation; the response schema is an enum of the candidate ids. **[Recorded]** (2026-11-09 sessions, not re-run) the right operation was in the local top-3 for 68% of 203 fallback prompts and ranked first for 46%, so a candidate list built from local retrieval caps what the model can do. **[Code-traced]** it converts the provider's categorical `HIGH` straight into a confidence of 0.9 (`ROUTED_CONFIDENCE` in `askModelRouter.ts`), which the governing §15.2 forbids treating as calibrated (FR-CAL). **Its real accuracy has never been measured** (`ask-routing-sweep.js --model` needs a Gemini key and has not been run).

### 2.7 What is not known

The failure rate on real homeowner wording (there is no production traffic to measure); model-router accuracy; model latency and cost at expected volume; whether each of the 30 message-routable write operations can execute without a confirmation step (not traced — see FR-WRT-1); whether synthetic prompts predict real ones. §12 turns each into a measured requirement.

## 3. Root causes

| ID | Cause | Evidence |
|---|---|---|
| RC1 | Routing is first-match regex rules plus a word-overlap classifier. A rule covers the wordings its author thought of; nothing generalises. | §2.3, §2.5 |
| RC2 | Input is not normalised: typos, politeness, punctuation reach the rules unchanged. | §2.3 |
| RC3 | A second gate re-judges the handler's own answer by word overlap, or by a hand-kept id list that drifts from the handler. A correctly routed prompt is still lost. | §2.4 |
| RC4 | Uncertainty becomes a dead end or a one-option card that re-runs the thing that just failed. | §2.1 cases 2–4 |
| RC5 | Measurement uses prompts written by the fixers, so quality cannot be seen to be low until a user reports it. | §2.2 |
| RC6 | Capability coverage is unmeasured: some questions have no operation behind them, and no process finds out which. | §2.7 |

## 4. Goals, non-goals and the definition of success

### 4.1 Goals
1. At least **90% of in-scope prompts resolve** (definition below) on the release gate sets of §10.
2. A prompt's result must not depend on spelling, politeness, punctuation or word order that does not change its meaning.
3. A correctly routed prompt is never withheld because of how the answer is worded.
4. When Ask cannot answer, the user always gets a specific next step.
5. Quality is measured offline **before** a change ships, so fixes do not depend on someone hitting a failure first.

### 4.2 Non-goals
- Guaranteeing correct interpretation of every utterance (governing FRD §7). The target is measured, and §13 D1 asks the owner to confirm this reading.
- A general-purpose chatbot, or a model that writes answers. Handlers produce every answer from the home record (existing rule: Ask LLM is last resort for answers).
- Building every missing capability. RC6 is measured and prioritised here (FR-CAP), not solved here.

### 4.3 Definitions
A prompt is **in scope** when an operation exists that could answer it. A prompt for which none exists is **out of scope**: it is reported as the product-coverage KPI (FR-CAP), never counted toward the resolved rate, and a correct decline of it is **not** a success of understanding.

For an in-scope prompt, exactly one of these makes it **resolved**:
- **R1 Answered:** the intended operation and entity produced an answer that was shown.
- **R2 Missing-record-data decline:** the operation exists but the home record lacks the data; the user was told specifically what is missing and was offered an **applicable, authorised** next step. For a role that may add the data, that is the action that adds it; for a role that may not (for example a viewer), it is an explanation of who can. A call to action the current user cannot use fails R2.
- **R3 One-step clarification:** one clarification offered the intended option, and choosing it produced R1 or R2.

An in-scope prompt **fails** when: a wrong answer was shown; a correct answer was withheld; the user was told there is "no capability" when an operation exists (a **false decline**, which never qualifies as R2); a dead end or one-option loop occurred; a clarification omitted the intended option; or a write was routed wrongly.

Every result is also reported in the five classes **answered**, **missing-record-data**, **clarified-then-answered**, **correctly-declined-unsupported**, **failed**, so a headline cannot be raised by declining.

### 4.4 Metrics and proposed release gates (owner confirms, §13 D4)

A gate passes only when the **upper 95% confidence bound** (Wilson) of a failure rate meets the threshold, on a sealed set large enough for the interval to be narrower than the threshold (FR-EVAL-2). Counts of operations are **derived from the registry at run time**, not hard-coded (FR-EVAL-9).

| Metric | Definition | Proposed gate |
|---|---|---|
| **Resolved rate** | (R1 + R2 + R3) / in-scope prompts | ≥ 90% |
| **Direct-answer rate** | R1 / in-scope prompts whose data exists | ≥ 80% (so clarification and decline cannot carry the headline) |
| **False-decline rate** | declines of an in-scope, answerable prompt / in-scope prompts | ≤ 1% |
| **Incorrect high-confidence operation selection** | shown without clarification, operation did not match intent / all prompts shown without clarification | **< 1%** (governing trust addendum) |
| **Wrong-answer rate** | any wrong answer shown / all in-scope prompts | ≤ 2% |
| **Wrong-write routing** | a read-intent or meaning-preserving-edit prompt routed to a write operation | 0 in the perturbation suite |
| **Perturbation retention** | per edit type, share of correct prompts still correct | ≥ 97% each |
| **False-correction rate** | valid near-vocabulary words altered by FR-NRM, on the negative corpus | ≤ 0.5%, and zero that change the operation |
| **Gate false-withhold** | handler answer for the routed operation withheld / all such answers, on the evaluation corpus executed through the handlers on seeded data | ≤ 1% |
| **Dead-end rate** | fallback or one-option card / in-scope prompts | ≤ 3% |
| **Per-operation floor** | each operation's **human-confirmed sealed** prompts (FR-EVAL-1b) | at least N_min sealed prompts (proposed 30; D4) **and** a point estimate ≥ 70% resolved; the Wilson interval is reported, and an operation whose lower bound is below 50% is flagged **unproven** (reported, not failing). An operation with fewer than N_min human-confirmed sealed prompts fails the manifest check (FR-EVAL-9). Reported by operation and by topic |
| **Time to useful result** | end-to-end, p50 / p95 / p99, reported **separately** for deterministic, model-success, model-timeout, model-error, clarification and fallback routes, and cache hits separately | Targets set from the Phase 0 and Phase 2 measurements (D6). Rule now: the model-call timeout must be **no longer than the routing budget**, and timed-out calls count in the p95 |
| **Product-coverage KPI** | out-of-scope prompts / all prompts | Reported, with a ceiling the owner sets (D4); not part of the resolved rate |

## 5. Overview of the change

```
message
  → establish request context (FR-CTX-1)                  authenticate · authorise the property · audience, lifecycle, runtime health · build the ELIGIBLE catalogue
  → raw-message safety + explicit-command interception     (existing, deterministic, BEFORE normalisation)
  → normalise (FR-NRM)                                     framing, punctuation, spelling; routing only
  → safety gate again on the normalised text               a boundary on either text wins
  → audited deterministic fast path                        only rules proven precise by the eval sets
  → minimise (FR-PRV)                                      redact identifiers (server-known names only for the authorised property); if routing meaning is lost, no model call
  → understanding layer (FR-UND)                           model proposes ranked operations + slots (advisory), from the eligible catalogue only
  → calibrated confidence (FR-CAL)                         server-side, per path / effect / materiality / margin; stratum must qualify (FR-CAL-5)
  → decision (FR-UND-6, FR-WRT)                            execute read · open write PREVIEW · clarify · decline
  → pre-effect recheck (FR-CTX-2)                          eligibility, authorisation, entity membership, runtime applicability, immediately before a preview or execution
  → handler (unchanged, deterministic)                     produces the answer from the home record
  → answer gate (FR-GATE)                                  independent trust required to skip relevance
  → recovery rendering (FR-REC)                            never a dead end
```

The model never writes an answer, receives data held in the home record or the owner's or property's identity from the system, picks an operation outside the eligible set, or bypasses authorisation, confirmation or canonical validation (governing FRD §7). It **does** receive the homeowner's own words, which can contain personal data: FR-PRV governs that.

## 6. Requirements — normalisation (FR-NRM)

- **FR-NRM-1** Before routing, the message is normalised by (a) the existing closed misspelling list, (b) removal of conversational framing (greetings, "can/could you (please)", "tell me" when not followed by "when/whenever", trailing "please/thanks", trailing punctuation), and (c) correction of an unknown word of five or more letters to the single established product-vocabulary word one edit away (insert, delete, substitute, swap), only when both start with the same letter and the target is established in the vocabulary artifact (FR-NRM-6).
- **FR-NRM-2** Normalised text is used **only** for routing. The original message is what is stored, shown, and passed to handlers.
- **FR-NRM-3** An ambiguous correction (two equally established candidates) is not applied.
- **FR-NRM-4** Safety, restricted-request and explicit-command interception runs on the **complete raw message first** (composition FR-DEC-0), then again on the normalised text; a boundary or command result on either wins.
- **FR-NRM-5** Normalisation is deterministic and incurs no model call (governing FRD §29.2).
- **FR-NRM-6** The vocabulary is a **versioned, committed artifact** generated from the registry's example phrases. A change to the registry's examples cannot change routing silently: regenerating the artifact changes its version and re-runs the evaluation (FR-EVAL-3, FR-NRM-7).
- **FR-NRM-7** A **negative corpus** of valid words that are one edit from a product term (for example real words near "roof", "gutter", "boiler") must pass through unchanged. Gates: false-correction rate and zero operation changes (§4.4).
- **FR-NRM-8** Spelling correction applies to **English only**. No other language is corrected until separately certified (governing FRD §7, language non-goal).
- **FR-NRM-9** Telemetry records whether a correction was applied, the rule that applied it, and the vocabulary version.
- **Acceptance:** perturbation retention ≥ 97% for framing, punctuation and typo edits, **and** the false-correction gates.

## 7. Requirements — understanding layer (FR-UND)

- **FR-UND-1 Model output contract (normative).** One call per turn. For every message the audited fast path does not claim, the model returns a structured object: `candidates` — up to **three** operations **in ranked order**, each with bounded evidence features (`jobMatch`: DIRECT / PARTIAL / NONE, and `itemNamed`: true / false) and an enum `operationId` of registered, eligible, non-boundary operations; extracted **slots** (item, date or horizon, amount); an optional second-clause hint (FR-UND-11); and the provider's categorical self-assessment, recorded as a feature and never used as the confidence (FR-CAL-2). Candidates are `READ` operations plus `WRITE` operations as **preview-only** candidates (FR-WRT); no model-selected write executes. The ranked candidates and evidence features are what makes an ambiguity margin computable (FR-CAL-8).
- **FR-UND-2 Bounded candidate set and its metrics.** The prompt lists every operation in the **eligible catalogue** established by FR-CTX-1, one line each, in **one call** (reads and writes together, writes marked preview-only). **[Executed]** 2026-11-11: the 120 message-routable, non-boundary, non-fallback operations as `operationId: intentDescription` lines total 14,943 characters, about 3,700 tokens (characters ÷ 4, a rough proxy). **This is a lower bound, not evidence that the call fits:** it counts operation descriptions only, and the real request also carries instructions, the structured-output schema, enum definitions, any domain grouping, privacy placeholders, the homeowner's question and slot descriptions. Phase 2 measures the **complete serialised provider request** against the provider's schema and context limits. Requirements: (a) a maximum candidates-per-call C_max and prompt-token budget T_max, set from that measurement (D6); (b) the following metrics are reported separately, and each threshold names the one it governs: **catalogue-eligibility recall** (the intended operation was in the provider input) — must be 100%, and any miss is a catalogue or eligibility defect reported as such, not classifier error; **top-1 accuracy** (intended operation ranked first), which feeds the resolved rate; **top-3 recall** (intended operation anywhere in the returned candidates) ≥ 98% overall and ≥ 90% per operation (proposed; D4); **schema-valid response rate** (valid candidates from the offered catalogue) ≥ 99.5% (proposed; D4); and **domain-stage recall**, required only once a two-stage path exists; (c) if the eligible catalogue ever exceeds C_max or T_max, a **two-stage** call is used (domain, then operation), the domain stage is **modelled** (a deterministic prefilter would reintroduce the local recall ceiling), domain-stage errors are labelled and calibrated as their own stratum, and reads and writes are still classified together. Until then no two-stage design is built.
- **FR-UND-3** The model receives only the **minimised** question (FR-PRV) and static operation descriptions. It receives no data from the home record and no owner or property identity from the system.
- **FR-UND-4** The response schema is enforced and re-validated server side. An operation outside the eligible set, a malformed output, a timeout, a provider error or an uncalibrated model/prompt version (FR-CAL-7) **restores the original local candidate decision, which is then processed through the same FR-CAL, FR-WRT, eligibility, entity-resolution and answer-gate policies as any other route**. It is not "exactly as today": for example, a local-classifier write after a model timeout opens at most a preview (FR-WRT-2).
- **FR-UND-5** Wording that may describe something happening now (the existing urgency signal) is never routed by the model to a lookup (existing behaviour retained).
- **FR-UND-6 Decision policy** (uses the **calibrated** confidences of FR-CAL, never the provider's label):
  - `READ`, every confidence dimension at or above its threshold for this effect and materiality: execute.
  - `WRITE`: never executes from a message; at most opens an authorised preview (FR-WRT).
  - Routing confidence between the clarify and execute thresholds, or the ambiguity margin (FR-CAL-8) too small: one clarification whose options are the top operations, each labelled with what it gives (FR-REC).
  - Below the clarify threshold, "none fits", or a stratum with too few labelled results to calibrate (FR-CAL-5): decline (FR-REC-2). Never execute.
- **FR-UND-7** Slots extracted by the model are **advisory**. Each is revalidated against the home record by the existing slot revalidation (composition FRD, `slots.ts`) before use. A required slot that is missing or fails revalidation produces a clarification, never a default.
- **FR-UND-8 Routing cache.** Only the **context-free model classifier response** may be cached. Key: a hash of the minimised normalised text, the language, the **eligible-catalogue version hash** (FR-CTX-3), the registry and semantic-description versions, and the model, provider, prompt and schema versions; any version change invalidates. Scope: memory only, short TTL (owner sets, D6), same privacy classification as the prompt text. **Never cached:** eligibility, runtime health, safety and urgency verdicts, entity resolution, launch or conversation context, authorisation, and any resolved or executed outcome. The pre-call establishment (FR-CTX-1) and the pre-effect recheck (FR-CTX-2) happen on every turn, including cache hits.
- **FR-UND-9** Model usage for routing is recorded by cost band and measured separately from classifier and embedding usage (governing FRD §29.2). Deterministic routes make no model call.
- **FR-UND-10** A kill switch disables the model path without a deploy (existing `ASK_MODEL_ROUTER_KILL_SWITCH` retained).
- **FR-UND-11 Two-part questions — reconciliation with the composition FRD.** The model's second-clause hint is **advisory** and never authorises composition. The deterministic decomposition of composition FR-DEC-0 to FR-DEC-7 remains the **only** way two clauses become one composed answer, and it is unchanged. A model hint may only (a) become the existing **"Also answer"** offer for a clause whose operation is a certified composable `READ`, eligible for this user and property; or (b) inform a clarification. It may not compose, and it may not offer a write or a material-decision operation as a second part. Where deterministic decomposition does not compose, the turn is answered by the single best operation exactly as in composition FR-DEC-4. Whether the composition FRD should later admit model clause routing is out of scope (D10).
- **Acceptance:** the resolved, wrong-answer and incorrect-high-confidence gates (§4.4) on the sealed sets, measured with the **real** model, and a calibration report (FR-CAL-5).

## 7A. Requirements — calibrated confidence (FR-CAL)

Closing the trust-chain gap: a model saying "HIGH" is not evidence that the route is right.

- **FR-CAL-1** Routing confidence is a **server-side** value derived from labelled evaluation results (and any adjudicated corrections from real use, if it ever exists), computed per **routing path** (deterministic, local classifier, model), operation **effect**, **materiality**, **language**, entity-resolution requirement, and **ambiguity margin** as defined in FR-CAL-8 (governing §15.2).
- **FR-CAL-2** The provider's self-reported category is stored as a feature and never used as a probability. The fixed mapping of `HIGH` to 0.9 in today's router is replaced.
- **FR-CAL-3** Routing, entity/slot, context freshness and canonical-result confidence stay **separate** (governing §15.1) and are all consulted by the decision policy and the answer gate; they are never collapsed into one number.
- **FR-CAL-4** Execute and clarify thresholds are configured **per effect and materiality**, with a minimum ambiguity margin (FR-CAL-8) between the top two candidates.
- **FR-CAL-5 Calibration report and execution rule.** For each stratum: a reliability diagram, expected calibration error, the number of **independent** labelled prompts (distinct prompts; repeated calls to one prompt are one sample, FR-EVAL-10), the observed incorrect-high-confidence failures, and the upper 95% bound on the incorrect-high-confidence rate. **A stratum may execute on model confidence only when that Wilson upper bound, computed from its failures and independent sample count, is below the applicable execution threshold** (1% by default, FR-CAL-6). **[Executed]** 2026-11-11 arithmetic: 0 failures in 200 gives an upper bound of 1.885%, so 200 prompts can never qualify; the smallest sample that qualifies is **381 with no failures, 563 with one failure, 726 with two, 878 with three**. An administrative minimum (proposed 200; D4) only decides whether calibration is attempted and **never** authorises execution. Strata may be pooled only by a predefined hierarchical calibration method that demonstrates the pooled strata are exchangeable. A stratum that does not qualify falls to clarification or decline. Because qualifying strata need several hundred human-confirmed rows (FR-EVAL-1b), Phase 0 estimates the human-label volume per stratum before the strata are fixed.
- **FR-CAL-6** Objective: incorrect high-confidence operation selection **< 1%** (governing metrics table), reported with its upper confidence bound, using independent samples only.
- **FR-CAL-7** Calibration is tied to the model, provider, prompt, schema, registry and semantic-description versions. A version with no calibration report is **not enabled** (fail closed to the local decision).
- **FR-CAL-8 Ambiguity margin (normative).** Computed server-side, from **one** model call, as a calibrated function of: (i) the model's ranked candidates and their evidence features (FR-UND-1); (ii) the score gap that the existing **deterministic scorer** (local retrieval scoring) gives over **only the model's ≤ 3 candidates** — because the candidates come from the model, this does not reintroduce the local recall ceiling; and (iii) whether the model's first candidate is also the deterministic scorer's first. Repeated model runs are an **offline stability measure only** (FR-EVAL-10); production never requires more than one call per turn.
- **FR-CAL-9 Isolation from the sealed set.** Calibration curves, thresholds, ambiguity parameters and **stratum definitions** are fitted **only** on the tuning/calibration partition. The sealed set is evaluated **once** with the frozen artifact. Stratum definitions are not changed after sealed outcomes have been seen. Any recalibration produces a **new artifact version** and requires a **new sealed evaluation** on a sealed set version not previously used to evaluate a tuned artifact. A sealed result whose artifact was tuned on seeing it is reported as tuning, not as a release result.
- **FR-CAL-10** The calibration report labels **fitting** results and **sealed** results separately, and records the artifact version, the data partition versions and the model, prompt and schema versions.

## 7B. Requirements — privacy of model input (FR-PRV)

The model receives the homeowner's words, so "no home data" is not a claim this FRD can make for free. It must be built and tested.

- **FR-PRV-1 Minimisation contract (closed taxonomy).** Before any provider call a deterministic minimiser handles exactly these categories, each with a stated detection method: (1) emails, phone numbers, URLs, dates of birth and SSN-like numbers — patterns; (2) street addresses — pattern plus a gazetteer of street suffixes and unit words; (3) account, policy, claim, permit and serial numbers — digit patterns anchored on cue words and on digit-run shape; (4) person and company names — the names the **server** already knows for this home (contractors, insurers, lenders, household members, resolved server-side **only for the authorised property and only after FR-CTX-1**, and never sent), plus a conservative capitalised-token heuristic. Names are the category a deterministic artifact cannot detect with complete recall; FR-PRV-7 and FR-PRV-8 apply. The patterns, gazetteer and heuristics are a **versioned artifact** with their own tests.
- **FR-PRV-2** Quantities of money and time and item nouns are preserved when they are routing-critical or slot candidates. Free-form home facts that are not routing-critical are removed.
- **FR-PRV-3** When minimisation would remove routing-critical meaning (the identifier is the question), the model is **not** called: the local decision applies or the user is asked to rephrase. Unredacted text is never sent as a fallback.
- **FR-PRV-4 Provider terms.** Before enablement, the provider's retention, no-training and regional-processing terms are recorded and approved (D3a). The configuration evidence is kept with the calibration report.
- **FR-PRV-5 Privacy tests.** An adversarial set (addresses, emails, phones, claim and policy numbers, names embedded in sentences, prompt-injection text asking for system data) is run with the outbound payload captured. Gate: **zero** identifiers in any captured payload.
- **FR-PRV-6** Provider transmission (D3a) and internal prompt retention (D3b) are separate decisions.
- **FR-PRV-7 Placeholder semantics and the no-call outcome.** Placeholders carry the role when it is known or cued (`[INSURER]`, `[CONTRACTOR]`, `[ADDRESS]`, `[CLAIM_NUMBER]`, otherwise `[NAME]`), so routing meaning survives (an insurer question stays an insurer question). Text that looks identifier-like but cannot be safely classified (an unrecognised capitalised sequence next to a number, a long digit run with no cue) produces the conservative **no-call** outcome of FR-PRV-3.
- **FR-PRV-8 Thresholds (proposed; D4).** Per-category false-negative and false-positive rates are measured on a labelled corpus of **at least 200 examples per category**, varied in format, casing, typos and position in the sentence, with **known server-side names, unknown person names and company names measured separately**. Maximum false-negative rates: **zero** for SSN-like numbers and for account, claim, policy, permit and serial numbers; ≤ 1% for emails, phone numbers, URLs, dates of birth and known server-side names; ≤ 2% for street addresses; ≤ 10% for unknown person and company names (acknowledged as the weak category, backstopped by the capitalised-token heuristic, the no-call rule and the provider terms). Maximum **no-call / false-positive rate** caused by privacy conservatism: ≤ 5% of in-scope evaluation prompts, so privacy cannot silently remove routing coverage. The zero-identifier gate (FR-PRV-5) certifies **that adversarial corpus only**; it is not a claim that no identifier can ever reach the provider.
- **FR-PRV-9 Failing a threshold disables remote routing for that category.** A category that fails its threshold disables remote routing for any message its detector matches: those messages take the conservative no-call outcome (FR-PRV-3) until the category passes again.

## 7C. Requirements — request context and recheck (FR-CTX)

The governing trust addendum requires the semantic catalogue to be filtered by consumer, audience applicability, authorisation floor, runtime health and operation availability **before** model selection. Several requirements here need that context earlier than the model call (the eligible catalogue for FR-UND-2, server-known names for FR-PRV-1), so it is specified once.

- **FR-CTX-1 Pre-call establishment.** Before any preprocessing that reads home data and before any provider call, the request is authenticated, access to the selected property is authorised, the audience and lifecycle context and runtime health are established, and the **eligible operation catalogue** is built. A request that fails authentication or property authorisation makes **no** provider call and reads **no** home record.
- **FR-CTX-2 Pre-effect recheck.** Immediately before a write preview or any execution, and again before a confirmation is applied, eligibility, authorisation, entity membership and runtime applicability are rechecked, so a role change, a removed household member, a closed feature or a changed entity between the first check and the effect cannot be acted on. A failed recheck produces the existing unavailable or unauthorised recovery and never executes on stale context.
- **FR-CTX-3** The context of FR-CTX-1 is **request-scoped** and is not cached across requests. A cached routing result (FR-UND-8) is valid only when its key includes a hash of the eligible-catalogue version used for the call.
- **FR-CTX-4** Server-known names used by FR-PRV-1 are read only for the property authorised in FR-CTX-1, only after it, and are never sent to the provider.
- **Acceptance:** an unauthorised property produces no provider call and no home-record read; a role change between the model call and a confirmation causes the preview to be refused.

## 8. Requirements — answer gate (FR-GATE)

- **FR-GATE-1** Each handler declares the block ids its answer can contain in **one** exported constant read by both the handler and its trust contract. A hand-copied list may not exist.
- **FR-GATE-2 Variant manifest and contract test.** Each handler declares its **output variants** (for example: answer, missing-data, table, timeline, confirmation, role-dependent). Every routable operation must satisfy **one** of these, recorded in the manifest, and a text scan alone never passes an operation: (1) **real-path execution** of every declared variant with infrastructure boundaries replaced by recording adapters; (2) a **typed response builder** that records every emitted block id and variant; or (3) direct code-path evidence for each variant plus an operation-owned pure projection test. The source scan for undeclared block ids runs in addition and catches obvious drift, but it can miss blocks emitted by shared builders, helpers, dynamic ids or service-layer paths. A new operation, variant or block id not covered fails CI. This is a **conformance** test; it does not measure the false-withhold rate, which is measured on the evaluation corpus (§4.4).
- **FR-GATE-3 Independent trust, not provenance alone.** The word-overlap relevance check may be skipped only when **all** hold: (a) the operation resolution is independently trusted (an audited deterministic rule, a calibrated routing confidence at or above its threshold, or a homeowner confirmation); (b) the **entity and every required slot** were resolved and revalidated with their own confidence at or above threshold (a confidently selected roof handler must not answer a question about siding); (c) the answer covers **every requested clause**, and the system has **positively established** what the clauses are: either **(c1)** deterministic decomposition certifies full-message segmentation and that each detected clause is answered (by the registry's declared answered quantities, composition FR-DEC-7, not by prose), or **(c2)** a separately tested full-message detector certifies the message as single-intent; **(c3)** any message with possible compound or conditional wording (a clause boundary, a joiner such as and, also, plus, vs, versus, or, then, if or but, more than one question, a second predicate after a comma, or a length above a limit set from the tuning data) **keeps the relevance check** unless (c1) or (c2) holds. Declared answered quantities prove what the handler answered, not that every clause was detected; a model second-clause hint can force conservative treatment, but its absence never proves the message has one clause; and (d) the result carries the routed operation's authoritative source evidence. Authoritative handler lineage proves the data is real; it never proves the question was understood.
- **FR-GATE-4** For every other route the word-overlap relevance check is retained.
- **FR-GATE-5** This changes the effect of the 2026-11-09 owner ruling (a canonical block proves the handler produced normal output, not that routing was right). It drops the check only where independent evidence of correct operation **and entity** exists. Owner decision D2.
- **FR-GATE-6** The gate never bypasses authorisation, applicability, confirmation or canonical validation (governing FRD §7).
- **FR-GATE-7** An adversarial near-miss corpus (same operation, wrong entity: roof vs siding, water heater vs furnace) must show no answer for the wrong entity passing the bypass.
- **Acceptance:** gate false-withhold ≤ 1% and zero near-miss passes (§4.4).

## 9. Requirements — recovery (FR-REC)

- **FR-REC-1** A clarification never has fewer than two options. With one candidate, the system runs it (if FR-UND-6 allows) or declines; it does not ask the user to confirm the only choice.
- **FR-REC-2** Decline copy names the specific reason — "Ask doesn't have a tool for that yet" (only when no operation exists) or "I need your roof year to answer — add it here" — and offers one concrete action. The generic "I couldn't find an answer" copy is retired. A decline that claims "no capability" for an in-scope prompt is a false decline (§4.3).
- **FR-REC-3** Clarification options are labelled with the result each gives (horizon, scope), not the operation's name.
- **FR-REC-4** A withheld answer is never followed by a card whose only option re-runs the same operation.
- **FR-REC-5** When the user ignores a clarification and rephrases, the rephrase is routed fresh; the earlier clarification does not constrain it.
- **FR-REC-6** Each decline records a bounded reason code so unsupported demand can be counted (feeds FR-CAP).
- **Acceptance:** dead-end rate ≤ 3% and false-decline ≤ 1% (§4.4); a scripted check that no card has a single option.

## 10. Requirements — evaluation programme (FR-EVAL)

The programme exists so quality is known **before** release. Every set records its provenance. All gates are offline; there is no production gate (AGENTS.md).

- **FR-EVAL-1 Synthetic set.** For each routable operation (derived from the registry, FR-EVAL-9), at least **80** prompts generated by a model (proposed: 50 tuning/calibration, 30 sealed; D4) across: register, length, indirectness, typos, persona, item named or not, and two-part questions. A separate pass produces **out-of-scope** prompts so declining is tested. The generator model and prompt are recorded and differ from the router's. Sampling is **stratified by effect and materiality**, with a floor per write and per high-materiality operation, and a separate **traffic-weighted** aggregate. Which rows may authorise anything is set by FR-EVAL-1b.
- **FR-EVAL-1b Label governance.** A random 10% review is only a corpus-quality audit. **Human confirmation** (labels for operation, entity, slots, capability existence and expected recovery confirmed by a person) is required for: **all sealed rows used by a release gate**; **calibration rows in or near the execute band**; **every write and material-operation row**; **every ambiguous row**; **every observed model failure**; and rows behind a per-operation floor. **Model-to-model agreement** is permitted only for exploratory rows and for calibrating the clarify and decline bands, never the execute band, because two models can share a taxonomy bias, infer the expected operation from synthetic wording, or agree on a wrong entity or recovery label. Reports distinguish **human-confirmed**, **human-adjudicated** and **model-agreed** labels. Rows without human confirmation are excluded from gates and from execute-band calibration. If full human confirmation is impractical for a stratum, that stratum may not execute on model confidence (FR-CAL-5) unless the label uncertainty is modelled explicitly: a human-audited sample estimates the error rate of model-agreed labels and the intervals are widened accordingly.
- **FR-EVAL-2 Independent human set.** At least **1,000** prompts, written by people who did not work on Ask and have not seen the operation list, stratified as above, with at least 10 sealed prompts for every write and high-materiality operation. A gate passes only if the Wilson upper bound meets the threshold; with n = 1,000 and no failures the bound is about 0.4%, with 2% failures it is about 3%, so the set can support the ≤ 2% ceiling in aggregate but **cannot** prove per-operation safety. Per-operation safety rests on the synthetic set, the deterministic tests and calibration, and each operation reports its failure count and interval.
- **FR-EVAL-2a Labels.** Each prompt carries: intended operation, intended item/entity, slots, whether the capability exists, and the expected recovery. Two reviewers label independently; a third adjudicates; agreement (Cohen's kappa) is reported; unresolved items are excluded and counted.
- **FR-EVAL-3 Perturbation suite.** Meaning-preserving edits (§2.3 plus abbreviations, word order, contractions) applied to every correct prompt; runs in CI; retention gates per §4.4. Includes the negative corpus (FR-NRM-7).
- **FR-EVAL-4 Sealed held-out split.** Each set is split into a tuning part and a sealed part nobody tunes against. **Perturbations and paraphrases of a prompt stay in the same split as their source** to prevent leakage. A sealed set is versioned and content-hashed and immutable; a refresh makes a new version and old versions are kept so trends stay comparable.
- **FR-EVAL-5 Handler conformance and corpus execution.** FR-GATE-2 (conformance) and execution of the evaluation prompts through the handlers on seeded test data (false-withhold).
- **FR-EVAL-6 Write-safety test.** No read-intent or meaning-preserving edit routes to a write, and no model-selected write executes (§4.4, FR-WRT).
- **FR-EVAL-7 Independent scenario review (replaces the v0.1 cohort gate).** People outside the team run a scripted set of scenarios against the build offline and record outcomes against §4.3. This is an offline evaluation, not a staged release, pilot or production dependency. A pilot cohort or staged release is **not** required by this FRD and is added only if the owner explicitly requires it (D9).
- **FR-EVAL-8 Honest reporting.** Every report states the set, its size and version, whether it was tuned on, the date and the confidence interval. A figure from a tuned set is never presented as a release gate.
- **FR-EVAL-9 Manifest.** Gate scripts derive the routable and write operation sets from the registry, report the evaluated manifest and registry version, and **fail if any routable operation has fewer than N_min human-confirmed sealed prompts** (§4.4). No operation count is hard-coded in an exit criterion.
- **FR-EVAL-10 Model nondeterminism and the interval method.** Production makes **one** call per turn. The **primary** metric is computed from **one preregistered call per prompt** (the first run in a fixed-seed order), so the samples are independent and the **Wilson interval** applies; calibration (FR-CAL) is fitted to the same single-call behaviour, and calibration and release reports use this same method. Each prompt is additionally run at least twice more at the lowest available temperature, **only** for stability and for a **cluster-bootstrap sensitivity interval over prompts** (reported beside, never in place of, the primary result). **Majority voting is not used** unless production also makes the same calls and applies the same vote. **Worst-of-three** is a separate robustness stress result, never the headline. **Stability** (agreement across runs) is reported separately from correctness. Repeated calls to the same prompt are never counted as independent samples.

**Known limit (stated, not solved):** a synthetic set cannot reproduce the real distribution of homeowner wording. The design therefore does not rely on enumerating prompts: coverage comes from FR-UND, and the sets only **estimate** how well it works. FR-OBS exists because the estimate can be wrong.

## 11. Requirements — write safety, guided entry, capability coverage, observability

### 11.1 Write safety (FR-WRT)
As of 2026-11-11 **[Executed]** 30 operations are routable by message and are writes (derived from the registry; the live set is derived each run, FR-EVAL-9).
- **FR-WRT-1** Before any other change in this FRD ships, trace each routable write to establish whether a message-routed call can change state without a confirmation or preview step. **[Not done.]**
- **FR-WRT-2 Routing and effect decision table.**

| Path | Required behaviour |
|---|---|
| Write reached by a **declared action** | Unchanged. Eligibility and authorisation are rechecked before the preview and again before confirmation. |
| **Explicit command** intercepted before semantic routing | Unchanged and binding: interception runs before normalisation and decomposition (composition FR-DEC-0). |
| **Deterministic fast-path** message-routed write | Only for audited rules; opens a preview of the exact change and needs an explicit confirm. Never executes directly. |
| **Local-classifier** write (including when the model path fails and FR-UND-4 restores the local decision) | Never executes. Opens a preview only if its calibrated confidence meets the write threshold; otherwise clarify or decline. |
| **Model-selected** write | Never executes. At most opens an authorised preview; eligibility and authorisation rechecked at preview and at confirmation. |
| A two-clause result containing one read and one write | Not composed (composition FR-DEC-4). The read is answered; the write is offered as a separate preview action. |
| A confident operation with a **missing or low-confidence slot** | No preview. Ask for the slot; never default it. |

- **FR-WRT-3** Politeness, punctuation or typo edits must not turn a read prompt into a write (FR-EVAL-6).

### 11.2 Guided entry (FR-GUI)
- **FR-GUI-1** Reduce free-text variance with suggested prompts built from the home's own state (missing data, upcoming tasks, recent changes) and tool entry points that start a question with the item already named. Each suggestion is rendered from a **certified prompt template** with typed substitutions (item, date, amount, task name), not free text.
- **FR-GUI-2** Every template is in the evaluation sets together with a representative set of substitutions. Tests prove that no permitted substitution changes the template's intended operation or introduces unsafe or identifier-like text, and the templates pass the release gates. Home-specific literal prompts are not enumerated.

### 11.3 Capability coverage (FR-CAP)
- **FR-CAP-1** Report the product-coverage KPI (§4.4) and the share of recorded declines (FR-REC-6) for which no operation exists, grouped by topic.
- **FR-CAP-2** New operations are prioritised by that share. Each new operation ships with its answer-block constant and variant manifest (FR-GATE-1, FR-GATE-2), at least 80 synthetic prompts (FR-EVAL-1) with the sealed rows reviewed (FR-EVAL-1b), and its perturbation results.

### 11.4 Observability as a safety net (FR-OBS)
Observability is **not** the plan, **blocks nothing**, and is optional until real traffic exists; it catches what the evaluation missed.
- **FR-OBS-1** Record, per turn: routing stage, chosen operation, calibrated confidence bands, whether the gate withheld the answer, the recovery type, normalisation telemetry (FR-NRM-9) and any user signal. Prompt text is stored only as D3b allows.
- **FR-OBS-2 Proxy versus adjudicated.** Usage reports label every figure either **observed proxy** (thumbs-down, rephrase within the next turns, abandoned clarification, decline reason, gate withhold) or **adjudicated correctness** (a reviewed label). The absence of a negative signal is **never** counted as a correct route. Correctness metrics come only from a **reviewed-label sampling workflow**: a random sample is drawn, labelled under FR-EVAL-2a, and reported with its denominator and interval; labels arrive late and the report states how many turns remain unlabelled.
- **FR-OBS-3** A thumbs-down or decline can be added to the tuning sets after review; it never goes into the sealed set.

## 12. Phasing and exit criteria

Order is by dependency, not by calendar. Sizes are relative (S/M/L); no schedule is promised. No phase requires a staged release.

| Phase | Content | Size | Exit criterion |
|---|---|---|---|
| 0 | FR-WRT-1 trace; FR-CTX tests; human-label volume per stratum (FR-CAL-5); D3a provider terms; FR-EVAL-1 to FR-EVAL-4, FR-EVAL-9 sets built; today's system scored on them | M | A real baseline for every metric in §4.4, with intervals |
| 1 | FR-NRM (with FR-NRM-6/7); FR-GATE-1, FR-GATE-2; FR-REC-1, FR-REC-4 | M | Perturbation and false-correction gates met; the variant-manifest test is green for every routable operation in the registry manifest |
| 2 | FR-PRV; FR-UND measured **offline** with the real model; FR-CAL calibration report | M | Calibration report per stratum; the model beats Phase 1 on the sealed set with incorrect-high-confidence < 1% (upper bound), or the layer is not enabled |
| 3 | FR-UND enabled only for strata that passed calibration; FR-GATE-3 to FR-GATE-7; FR-WRT-2 | L | All §4.4 gates met on the sealed sets; zero identifiers in captured payloads; zero near-miss entity passes |
| 4 | FR-EVAL-7 independent scenario review; FR-GUI; FR-REC-2, FR-REC-3, FR-REC-6; FR-OBS | M | Scenario-review resolved rate within 5 points of Phase 3, or the gap explained |
| 5 | FR-CAP loop; quarterly sealed-set refresh; observability reports | ongoing | Reports are produced when sufficient adjudicated-label traffic exists; **otherwise no exit gate applies** (FR-OBS is optional) |

## 13. Owner decisions

| ID | Decision | Recommendation |
|---|---|---|
| D1 | Confirm that a *measured target* of 90% resolved is consistent with governing FRD §7 ("guarantee correct interpretation" is a non-goal) | Yes: this FRD guarantees nothing, and every report states set, version and interval |
| D2 | Allow the answer-gate rule in FR-GATE-3 to FR-GATE-5, which narrows the 2026-11-09 ruling | Yes, but only with independent operation **and** entity/slot trust and clause coverage; provenance alone is not enough |
| D3a | **Provider transmission:** which provider, its retention, no-training and regional-processing terms, and approval of the minimisation contract (FR-PRV) | Owner to approve the terms before Phase 2 |
| D3b | **Internal retention:** whether prompt text may be stored for evaluation, for how long, who may read it | Owner to decide; reason codes and hashes only until decided |
| D4 | Release-gate thresholds in §4.4, the per-stratum minimum sample (FR-CAL-5) and the product-coverage ceiling | Adopt as proposed, then adjust from the Phase 0 baseline |
| D5 | Model-use scope for routing: today's approval covers messages the local router cannot place (step 7); FR-UND-1 widens it to every message the fast path does not claim | Approve only after calibration (FR-CAL-7), subject to cost band, latency and kill switch |
| D6 | Per-turn cost budget, the routing latency budget and timeout, and the cache TTL (FR-UND-8) | Owner to set; measured in Phase 2 |
| D7 | Whether unsupported questions may be captured (FR-REC-6) and shown to the owner | Yes, reason code only, no prompt text unless D3b allows |
| D8 | Who writes the independent human set, who **human-confirms** the sealed, execute-band, write and material rows (FR-EVAL-1b), and who runs the scenario review | Owner to name |
| D9 | ~~Reconcile `AGENTS.md` with concern about losing customers~~ **Resolved 2026-11-11 by the owner: there are no real users.** `AGENTS.md` governs: no pilot cohort, staged release, canary or manual release certification, and no production gate | Closed. FR-EVAL-7 stays an offline scenario review; observability stays optional |
| D10 | Whether the composition FRD should later admit model clause routing | Out of scope; keep model hints advisory (FR-UND-11) |

## 14. Design options (not requirements)

1. **Understanding layer.** Decided by FR-UND-2: one call while the catalogue fits the measured budget (about 3,700 tokens today); two-stage only if it outgrows C_max or T_max.
2. **Fast path.** Keep only rules that score ≥ 99% precision on the tuning sets; demote the rest to model routing. Reduces the 142 branches over time; not a prerequisite.
3. **Spelling.** The vocabulary comes from the registry's own phrases. A general dictionary was rejected: it cannot ship offline and would correct domain terms.
4. **Handler block constants.** Export from each handler file and import in the contract; a lint rule rejects a literal block id in a contract file.
5. **Candidate-recall measure.** Report per operation how often the right one is in the model's candidate list, so a recall failure is seen separately from a model failure.
6. **Gate for non-trusted routes.** Keep word-overlap as today, or replace it with a second model check; decide from the Phase 2 numbers.
7. **Calibrator form.** The ambiguity inputs are fixed by FR-CAL-8; what remains open is the calibrator (isotonic, Platt, or a small monotone model over the FR-CAL-8 features), chosen from the Phase 2 sample sizes.
8. **Calibration method.** Per-stratum isotonic or Platt scaling over labelled results; choose from sample sizes.

## 15. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Synthetic prompts do not match real ones; the measured 90% is optimistic | Independent human set, independent scenario review, intervals on every figure, FR-OBS as a net |
| The model is confidently wrong | Calibrated server-side confidence (FR-CAL), incorrect-high-confidence < 1% with an upper bound, writes only open previews, relevance check kept for non-trusted routes |
| The provenance bypass hides a routing or entity mistake | Independent entity and clause trust (FR-GATE-3), near-miss corpus (FR-GATE-7), observed-proxy reporting |
| Personal data reaches the provider | FR-PRV minimisation, payload-capture tests, provider terms before enablement |
| A cached route is reused in the wrong context | Only the context-free classifier response is cached; eligibility, safety, entity and authorisation re-run every turn |
| Latency and cost rise | Fast path skips the model; cost-band recording; per-route latency reporting; timeout no longer than the budget; kill switch |
| A spelling correction changes meaning | Same-first-letter unique target, versioned vocabulary, negative corpus, zero operation changes |
| Tuning on the gate set inflates results | Sealed, versioned, leak-free split; FR-EVAL-8 |
| New operations reintroduce the gate bug or escape the gates | FR-GATE-1/2 fail CI; FR-EVAL-9 derives the manifest and fails on an uncovered operation |
| Declining raises the headline | Resolved rate excludes out-of-scope prompts; direct-answer floor; false-decline gate |

## 16. Test plan

- Unit: normalisation (framing, punctuation, spelling, ambiguity, negative corpus); decision policy; clarification never has one option; minimiser patterns; cache key and invalidation.
- Contract: FR-GATE-2 variant manifest over every routable operation in the registry manifest; source scan for undeclared block ids.
- Evaluation: the §10 sets in CI (perturbation, sealed held-out, write safety, near-miss entities) and offline for the model with three runs per prompt (Phase 2).
- Privacy: FR-PRV-5 payload-capture tests, per-category false-negative and false-positive rates against the FR-PRV-8 thresholds, and the FR-PRV-9 disable rule.
- Context: FR-CTX-1 (no provider call and no home-record read for an unauthorised property) and FR-CTX-2 (a role or membership change between the model call and a confirmation refuses the preview).
- Clause coverage: compound, conditional and elliptical messages keep the relevance check unless FR-GATE-3 (c1) or (c2) holds; a message with an undetected second clause must not pass the bypass.
- Calibration isolation: a check that the calibration artifact's recorded fitting partition contains no sealed row, and that a sealed set version is evaluated once per artifact (FR-CAL-9).
- Ambiguity: the FR-CAL-8 margin is computable from a single recorded model response; candidate recall per operation is reported (FR-UND-2).
- Calibration: reliability report per stratum before any model path is enabled.
- Regression: the five prompts in §2.1 and their variants remain in the tuning set.
- Not run until each phase ships: real-model accuracy and calibration, latency and cost at real volume, the independent scenario review.

## 17. Adversarial pass (per `AUDIT_METHODOLOGY.md` §7)

- *Does any figure read as measured when it was recorded or inferred?* The 68% / 46% recall figures are **[Recorded]**; the "17 typed" count is a regex count that undercounts; the 17-commit pattern claim is **[Inferred]**.
- *Does the 60% overstate quality?* Yes — §2.2 says why.
- *Does the perturbation figure overstate fragility?* Possibly for typos — §2.3 says so.
- *Does a requirement contradict a governing document?* v0.1 did, in four places the review found: the model's own confidence treated as calibrated (§15.2), model clause output beside deterministic composition (FR-DEC-2/4), a cohort gate against `AGENTS.md`, and an absolute "no home data" privacy claim. v0.2 changes each (§19). Two intended deviations remain and are **not assumed approved**: §7 of the trust addendum (D1) and the 2026-11-09 ruling (D2).
- *Can a gate pass by gaming it?* Declining could raise the headline in v0.1; v0.2 excludes out-of-scope prompts, adds the direct-answer and false-decline gates, and reports five result classes.
- *Is a fixture test being used to prove a rate?* v0.1 did; v0.2 separates conformance (FR-GATE-2) from the false-withhold rate (measured on the corpus).
- *Can the policy be computed from the specified output?* v0.2 could not (a single operation returned, yet a top-two margin required); v0.3 returns ranked candidates with evidence features and defines the margin (FR-UND-1, FR-CAL-8).
- *Is the sealed set contaminated by calibration?* v0.2 never said it was not; v0.3 isolates fitting from sealing (FR-CAL-9).
- *Does the evaluation measure what production does?* v0.2 used a three-run majority for a one-call path; v0.3 scores each call as a trial (FR-EVAL-10).
- *Is data read or a provider called before authorisation?* v0.3 ordered the eligible catalogue and server-known names after the model; v0.4 adds FR-CTX with a pre-call establishment and a pre-effect recheck.
- *Can the sample rule demonstrate the objective?* v0.3's 200-row minimum could not (the best case is a 1.885% upper bound); v0.4 derives execution eligibility from the confidence bound itself (FR-CAL-5).
- *Does an unreviewed or model-agreed label authorise execution?* v0.3 allowed it with a second model; v0.4 requires human confirmation for the execute band, sealed gate rows, writes, ambiguous rows and failures (FR-EVAL-1b).
- *Is anything unverified presented as fact?* FR-WRT-1, §2.7 and the "Not run" line in §16 list what was not traced or run.

## 18. Related

- Fixes that motivated this document: `de7787ec`, `f30e65aa`, `aa06fa30` (revision 1.574 of `ASK_COZY_INLINE_WORKSPACE_FRD.md`).
- Scripts: `apps/backend/scripts/ask-routing-sweep.js` (routing sweep; `--model` for the real-model run).
- Files this FRD would change: `askRoutingCascade.ts`, `askModelRouter.ts`, `askSemanticAnswerValidator.ts`, `askAnswerTrustValidator.ts`, `support/commonMisspellings.ts`, the handlers' block-id constants, the clarification builders in `execution/createAskExecution.ts`.

## 19. Review log (v0.1 → v0.2)

Each finding was checked against the governing text before being accepted. Verified: trust addendum §15.1–15.2 and its metrics table; composition FR-DEC-0 to FR-DEC-7; `AGENTS.md` lines 27 and 36; `askModelRouter.ts` `ROUTED_CONFIDENCE`.

| Finding | Verdict | Change |
|---|---|---|
| P0 Model HIGH treated as calibrated | Accepted | New §7A (FR-CAL-1 to 7); FR-UND-1/6 rewritten; FR-GATE-3 uses calibrated, separate confidences; <1% incorrect-high-confidence gate; §2.6 notes the 0.9 mapping |
| P0 Two-part model routing vs composition FRD | Accepted | FR-UND-11 (advisory only; "Also answer" or clarification; never composes, writes or material decisions); header and D10 |
| P0 Privacy claim unsupportable | Accepted | New §7B (FR-PRV-1 to 6); FR-UND-3, §5 and the risk row reworded; D3 split into D3a / D3b |
| P1 Resolved rate gamed by declining | Accepted | §4.3 splits R2, out-of-scope excluded, five result classes, direct-answer floor, false-decline gate, per-operation and per-topic floor, coverage KPI |
| P1 Provenance does not prove operation or entity | Accepted | FR-GATE-3 requires independent operation **and** entity/slot trust and clause coverage; FR-GATE-7 near-miss corpus |
| P1 FR-GATE-2 cannot prove completeness or ≤1% | Accepted | Variant manifest + source scan (conformance); false-withhold measured separately on the corpus |
| P1 Cache key and invalidation unsafe | Accepted | FR-UND-8 rewritten: context-free classifier response only, versioned key, memory-only, nothing contextual cached, re-run eligibility/safety/entity/authorisation every turn |
| P1 Write behaviour inconsistent | Accepted | FR-WRT-2 decision table; no model-selected write executes; preview only; recheck at preview and confirm |
| P1 Normalisation has no false-correction gate | Accepted | FR-NRM-4, 6–9; negative corpus; false-correction gates; raw-first safety; English-only; telemetry |
| P1 Evaluation statistically weak | Accepted | FR-EVAL-1, 2, 2a, 4, 10: stratification, 1,000-prompt human set, intervals, adjudication, leakage rule, versioned sealed sets, three runs. Per-operation safety is explicitly **not** claimed from the human set |
| P1 Cohort conflicts with repository constraints | Accepted | FR-EVAL-7 replaced by offline scenario review; no staged release. The owner confirmed on 2026-11-11 that there are no real users (D9 closed) |
| P2 Production metrics not computable | Accepted | FR-OBS-2: proxy vs adjudicated, reviewed-label sampling, late labels, unlabelled turns reported |
| P2 Latency contradictory and narrow | Accepted | §4.4 time-to-useful-result by route and by outcome, cache hits separate, timeout ≤ budget; numbers deferred to D6 |
| P2 Fixed operation counts go stale | Accepted | Counts are dated evidence in §2; gates derive the manifest (FR-EVAL-9) |

## 20. Review log (v0.2 → v0.3)

Each finding was checked against the v0.2 text; all were found to describe the document correctly. The catalogue-size claim was answered with a measurement (FR-UND-2). One adaptation is flagged: FR-EVAL-1b allows the independent reviewer to be a second model with human adjudication, to keep review practical for a small team; the owner may require full human review (D8).

| Finding | Verdict | Change |
|---|---|---|
| P0 Model output cannot support the ambiguity margin | Accepted | FR-UND-1 returns ranked top-3 with bounded evidence features; FR-CAL-8 defines the margin from one call (model rank + deterministic scorer over only the model's candidates + agreement); repeated runs are offline stability only; design option 7 reduced to the calibrator form |
| P1 Calibration not isolated from the sealed set | Accepted | FR-CAL-9 (fit on tuning/calibration only; sealed evaluated once with a frozen artifact; strata frozen; recalibration = new artifact + new sealed evaluation); FR-CAL-10 (fitting and sealed reported separately) |
| P1 Synthetic labels too weak to authorise execution | Accepted, with an adaptation | FR-EVAL-1b: full independent review for calibration, sealed, write/material, failure and floor rows; other rows are `unreviewed` and excluded from gates and calibration |
| P1 Nondeterminism aggregated inconsistently | Accepted | FR-EVAL-10 rewritten: per-call trials as the primary metric, no majority vote, worst-of-three and stability reported separately, calibration fitted to single-call behaviour |
| P1 "Every eligible operation" not a bounded design | Accepted | FR-UND-2: measured invariants (C_max, T_max, candidate recall), a measured catalogue size (about 3,700 tokens), a single shared read/write call, and a modelled two-stage fallback with its own labelled stratum; option 1 resolved |
| P1 Privacy promises more than deterministic detection can certify | Accepted | FR-PRV-1 closed taxonomy with methods; FR-PRV-7 placeholder semantics and no-call; FR-PRV-8 false-negative/positive reporting and an explicit statement that the gate certifies the corpus only |
| P1 FR-GATE-2 allows incomplete coverage | Accepted | One of three mechanisms is required per operation and recorded in the manifest; a text scan alone never passes |
| P1 Local fallback ambiguous after model failure | Accepted | FR-UND-4: the original local decision is restored and then processed through the new policies |
| P2 Per-operation gate lacks a sample floor | Accepted | §4.4: N_min (proposed 30), point estimate plus reported interval, "unproven" flag below 50% lower bound, reviewed rows only; FR-EVAL-1 sized to 80 per operation |
| P2 R2 may offer an action the user cannot perform | Accepted | §4.3 R2: applicable, authorised next step; an unusable CTA fails R2 |
| P2 Dynamic guided prompts cannot be enumerated | Accepted | FR-GUI-1/2: certified templates with typed substitutions and substitution-safety tests |
| P2 Phase 5 contradicts optional observability | Accepted | Phase 5 exit: reports are produced when sufficient adjudicated-label traffic exists; otherwise no exit gate applies |

## 21. Review log (v0.3 → v0.4)

Each finding was checked before acceptance. Verified: the Wilson arithmetic (0 failures in 200 → upper bound 1.885%; the smallest qualifying sample is 381 with none, 563 with one, 726 with two, 878 with three); the governing trust addendum's rule that the catalogue is filtered by audience, authorisation, runtime health and availability **before** model selection; and that v0.3's FR-PRV-1 reads server-known names and FR-UND-2 builds an eligible catalogue. **The v0.3 adaptation that let a second model count as full review (§20) is withdrawn** by FR-EVAL-1b.

| Finding | Verdict | Change |
|---|---|---|
| P0 Eligibility and authorisation ordered after data-dependent preprocessing and the model call | Accepted | New §7C (FR-CTX-1 pre-call establishment incl. eligible catalogue, FR-CTX-2 pre-effect recheck incl. before confirmation, FR-CTX-3/4); diagram reordered; FR-UND-8 and FR-PRV-1 updated; "re-run every time" now means pre-call check plus pre-effect recheck |
| P0 The 200-row minimum cannot establish <1% | Accepted | FR-CAL-5: a stratum executes only when its Wilson upper bound is below the execution threshold; the 200 minimum only gates attempting calibration; the 381 / 563 / 726 / 878 table; hierarchical pooling only with demonstrated exchangeability; repeated calls not independent; Phase 0 estimates human-label volume |
| P1 Candidate recall is almost tautological | Accepted | FR-UND-2 splits catalogue-eligibility recall (must be 100%, a defect if not), top-1, top-3, schema-valid rate and domain-stage recall, each threshold naming its metric |
| P1 Model-model agreement is not ground truth for execution calibration | Accepted | FR-EVAL-1b: human confirmation for sealed gate rows, execute-band calibration rows, writes, material, ambiguous and failure rows; model agreement only for exploratory and clarify/decline-band rows; three label classes reported; modelled label uncertainty if humans cannot cover a stratum |
| P1 Clause-completeness bypass can trust an incomplete interpretation | Accepted | FR-GATE-3(c): positive certification by deterministic segmentation or a tested single-intent detector, else compound or conditional wording keeps relevance validation; a hint's absence proves nothing |
| P1 Privacy gate has no false-negative thresholds | Accepted | FR-PRV-8 thresholds by category (zero for SSN, account, claim, policy, permit, serial), corpus size, separate name measurements, a no-call ceiling; FR-PRV-9 disables remote routing for a failing category |
| P2 Token evidence excludes parts of the request | Accepted | FR-UND-2: 3,700 tokens is a stated lower bound; Phase 2 measures the full serialised request |
| P2 Repeated-run interval method undefined | Accepted | FR-EVAL-10: one preregistered call per prompt with Wilson as the primary metric; extra runs for stability and a cluster-bootstrap sensitivity interval; same method in calibration and release |
| P2 "No code exists" too absolute | Accepted | Status line reworded; existing building blocks acknowledged |
