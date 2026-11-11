# Ask Cozy — Understanding Reliability: Reaching 90% Resolved Prompts Without Controlling the User's Wording

**Status:** Draft v0.1 for owner review. Nothing in it is implemented or wired. One unused, untracked file exists from before the owner paused work: `apps/backend/src/services/ask/support/routingNormalization.ts` (a first draft of FR-NRM; imported by nothing, never run, to be kept, rewritten or deleted at the owner's choice)
**Date:** 2026-11-11
**Owner decisions needed:** §13
**Governing documents (read before changing this one):**
- `AI_HOME_CONCIERGE_ASK_TRUST_ARCHITECTURE_ADDENDUM_FRD.md` — §7 (non-goals) and §29.2 (cost policy) govern this document. §7 lists "guarantee correct interpretation of every possible utterance" as a Version 1 non-goal. **This FRD does not reverse that**: it sets a *measured target* (§4), never a guarantee, and §13 D1 asks the owner to confirm that reading.
- `ASK_COZY_CONVERSATIONAL_CONCIERGE_COMPOSITION_FRD.md` — two-part questions; this FRD changes how a clause is understood, not how clauses are composed.
- `docs/architecture/ASK_COZY_ROUTING_COVERAGE_AND_CALIBRATION.md` — earlier routing measurements.
- `ASK_COZY_INLINE_WORKSPACE_FRD.md` — revision 1.574 records the four fixes that motivated this document.
- `docs/architecture/AUDIT_METHODOLOGY.md` — applied in §15.

**Evidence labels** (`AUDIT_METHODOLOGY.md` §1): **[Executed]** = a program was run and the output observed; **[Code-traced]** = read from source, not run; **[Recorded]** = taken from an earlier session's notes and not re-run today; **[Inferred]** = extrapolated. Every figure in §2 carries one.

---

## 1. Purpose

A homeowner can ask anything about their home, in any words. The product does not control the text. Today a small change in wording — a typo, a polite opener, "vs" for "or", a trailing "?" — moves a prompt from a correct answer to a dead end. This FRD specifies what must change so that at least **90% of real homeowner prompts end in a useful result** (§4), and so that the remaining prompts fail in a way that keeps the customer.

It specifies **requirements** (§6–§12) separately from **design options** (§14), per `AUDIT_METHODOLOGY.md` §8.

## 2. Problem and evidence

### 2.1 The five prompts that triggered this document (2026-11-11, owner screenshots)

| # | Prompt | What happened | Layer that failed | Fixed in |
|---|---|---|---|---|
| 1 | "is water heater under warranty, what would be the replacement cost if not" | Generic "What would you like to focus on?" card with three unrelated options | Two-part understanding: the item was only recognised after "my" | `de7787ec` |
| 2 | "how much should I save monthly for repairs" | Routed correctly (`CAPITAL_RESERVE_PLAN` 0.97), answer withheld ("I'm not sure I understood that", then "I still can't confirm that answer") | Answer gate: contract allowlist lacked 7 block ids the handler emits | `de7787ec` |
| 3, 4 | "how old is my roof", "what's my roof's condition" | Routed correctly (`INVENTORY_LOOKUP` 0.96), answer withheld, one-option card | Answer gate: profile-roof answer matched no accepted shape | `f30e65aa` |
| 5 | "repair roof now vs replace in 5 yrs which is better option" | Matched no rule, fell to guidance fallback at 0.55, "Did you mean one of these?" | Routing: rules only knew "repair or replace" | uncommitted (rev. 1.574 item 4) |

**[Executed]** cases 1, 3, 4 and 5 were reproduced offline (the decomposer, and the trust pipeline with the fix removed) before their fixes. **[Code-traced]** case 2: the missing block ids were found by reading the handler against the contract; its failure was not reproduced end to end, and the fix was checked by a contract test only. **Five of five owner-reported prompts failed, across three different layers.** Each fix covered only its own wording.

### 2.2 Routing accuracy, measured today

All **[Executed]** on 2026-11-11, working tree at `f30e65aa` plus the uncommitted rev. 1.574 item-4 change, single-turn, no conversation history, no buyer-mode gating, no real data.

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

**[Code-traced]** `askModelRouter.ts` exists and is **off by default** (`ASK_MODEL_ROUTER_ENABLED`, default false). It runs only for messages the local router could not place; it chooses among at most 10 `READ` operations that the *local* retrieval ranked highest; it cannot see home data, write an answer, or pick a write, monitor, boundary or fallback operation; the response schema is an enum of the candidate ids. **[Recorded]** (2026-11-09 sessions, not re-run) the right operation was in the local top-3 for 68% of 203 fallback prompts and ranked first for 46%, so a candidate list built from local retrieval caps what the model can do. **Its real accuracy has never been measured** (`ask-routing-sweep.js --model` needs a Gemini key and has not been run).

### 2.7 What is not known

Production failure rate; model-router accuracy; model latency and cost at production volume; whether each of the 30 message-routable write operations can execute without a confirmation step (not traced — see FR-WRT-1); whether synthetic prompts predict real ones. §12 turns each into a measured requirement.

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
1. At least **90% of prompts resolve** (definition below) on the release gate sets of §10.
2. A prompt's result must not depend on spelling, politeness, punctuation or word order that does not change its meaning.
3. A correctly routed prompt is never withheld because of how the answer is worded.
4. When Ask cannot answer, the user always gets a specific next step.
5. Quality is measured **before** users meet a change, not after they have been lost.

### 4.2 Non-goals
- Guaranteeing correct interpretation of every utterance (governing FRD §7). The target is measured, and §13 D1 asks the owner to confirm this reading.
- A general-purpose chatbot, or a model that writes answers. Handlers produce every answer from the home record (existing rule: Ask LLM is last resort for answers).
- Building every missing capability. RC6 is measured and prioritised here (FR-CAP), not solved here.

### 4.3 Definitions
A prompt is **resolved** when exactly one of these holds:
- **R1 Answered:** the intended operation and item produced an answer that was shown.
- **R2 Honest decline with a next step:** the home record lacks the data, or Ask has no such capability, and the user was told so specifically and offered an action (add the data, use a named tool).
- **R3 One-step clarification:** one clarification offered the intended option, and choosing it produced R1 or R2.

A prompt **fails** when: a wrong answer was shown; a correct answer was withheld; a dead end or one-option loop occurred; a clarification omitted the intended option; or a write was routed wrongly.

### 4.4 Metrics and proposed release gates (owner confirms, §13 D4)

| Metric | Definition | Proposed gate |
|---|---|---|
| **Resolved rate** | resolved / all prompts in the gate set | ≥ 90% |
| **Wrong-answer rate** | wrong answer shown / all prompts | ≤ 2% |
| **Wrong-write routing** | a read-intent prompt, or a prompt with a meaning-preserving edit, routed to a write operation | 0 in the perturbation suite |
| **Perturbation retention** | per edit type, share of correct prompts still correct | ≥ 97% each |
| **Gate false-withhold** | handler-produced answer for the routed operation that the gate withheld / all such answers | ≤ 1% |
| **Dead-end rate** | fallback or one-option card / all prompts | ≤ 3% |
| **Added routing latency** | extra time before the handler starts, p95 | ≤ 2 s (existing model-call timeout is 4 s) |

## 5. Overview of the change

```
message
  → normalise (FR-NRM)                       framing, punctuation, spelling; routing only
  → safety gate (existing, deterministic)    runs on raw AND normalised text
  → audited deterministic fast path          only rules proven precise by the eval sets
  → understanding layer (FR-UND)             model chooses among registered operations + fills slots
  → confidence policy (FR-UND-6)             execute · preview-and-confirm · clarify · decline
  → handler (unchanged, deterministic)       produces the answer from the home record
  → provenance gate (FR-GATE)                trusts the handler's own result when the route is trusted
  → recovery rendering (FR-REC)              never a dead end
```

Nothing here lets a model write an answer, see home data, invent an operation, or bypass authorisation, confirmation or canonical validation (governing FRD §7).

## 6. Requirements — normalisation (FR-NRM)

- **FR-NRM-1** Before routing, the message is normalised by (a) the existing closed misspelling list, (b) removal of conversational framing (greetings, "can/could you (please)", "tell me" when not followed by "when/whenever", trailing "please/thanks", trailing punctuation), and (c) correction of an unknown word of five or more letters to the single established product-vocabulary word one edit away (insert, delete, substitute, swap), only when both start with the same letter and the target occurs at least twice in the product's own example phrases.
- **FR-NRM-2** Normalised text is used **only** for routing. The original message is what is stored, shown, and passed to handlers.
- **FR-NRM-3** An ambiguous correction (two equally established candidates) is not applied.
- **FR-NRM-4** The safety gate is evaluated on both the raw and the normalised text; a boundary result on either wins.
- **FR-NRM-5** Normalisation is deterministic and incurs no model call (governing FRD §29.2).
- **Acceptance:** perturbation retention (§4.4) ≥ 97% for the framing, punctuation and typo edits.

## 7. Requirements — understanding layer (FR-UND)

- **FR-UND-1** For every message the audited fast path does not claim with high confidence, a model selects the operation. The model's output is a structured object: `operationId` (an enum of registered, eligible, non-boundary operations), `confidence` (HIGH / MEDIUM / LOW), extracted **slots** (item, date or horizon, amount), and, for a two-part question, at most two ordered clauses each with its own operation.
- **FR-UND-2** The candidate set is not limited to the local router's top 10. It covers every eligible operation, presented by domain so the prompt stays bounded. (Today's recall is capped by local retrieval — §2.6.)
- **FR-UND-3** The model sees the question and static operation descriptions only. It never sees home data, owner identity or property identity.
- **FR-UND-4** The response schema is enforced and re-validated server side. An operation outside the eligible set, a malformed output, a timeout or a provider error leaves the decision to the local router exactly as today.
- **FR-UND-5** Wording that may describe something happening now (the existing urgency signal) is never routed by the model to a lookup (existing behaviour retained).
- **FR-UND-6 Confidence policy.**
  - HIGH and the operation is a `READ`: execute.
  - HIGH and the operation is a `WRITE`: FR-WRT.
  - MEDIUM: ask one clarification whose options are the model's top operations, each labelled with what it gives (FR-REC).
  - LOW or "none fits": decline (FR-REC-2). Never execute.
- **FR-UND-7** Slots extracted by the model are **advisory**. Each is revalidated by the existing slot revalidation (composition FRD, `slots.ts`) against the home record before use.
- **FR-UND-8** Identical normalised messages reuse the stored routing result for a bounded time.
- **FR-UND-9** Model usage for routing is recorded by cost band and measured separately from classifier and embedding usage (governing FRD §29.2). Deterministic routes make no model call.
- **FR-UND-10** A kill switch disables the model path without a deploy (existing `ASK_MODEL_ROUTER_KILL_SWITCH` retained).
- **Acceptance:** resolved rate and wrong-answer rate (§4.4) on the held-out sets of §10, measured with the **real** model.

## 8. Requirements — answer gate (FR-GATE)

- **FR-GATE-1** Each handler declares the block ids its answer can contain, in **one** exported constant that both the handler and its trust contract read. A hand-copied list may not exist.
- **FR-GATE-2 Contract completeness test.** For every routable operation, a handler-shaped fixture result passes the real trust pipeline. A new operation, or a new block id, that is not covered fails CI. (Cases 2–4 would have failed this test.)
- **FR-GATE-3 Provenance.** When the route is trusted, a result carrying the routed operation's authoritative source evidence is shown without the word-overlap relevance score. A route is trusted when it came from an audited deterministic rule, from the understanding layer with HIGH confidence, or from a homeowner confirmation.
- **FR-GATE-4** For MEDIUM or LOW routes the word-overlap relevance check is retained.
- **FR-GATE-5** This requirement changes the effect of the 2026-11-09 owner ruling (a canonical block proves the handler produced normal output, not that routing was right). The rule here is narrower than removing the check: it drops the check only where independent evidence of correct routing exists. Owner decision D2 (§13).
- **FR-GATE-6** The gate never bypasses authorisation, applicability, confirmation or canonical validation (governing FRD §7).
- **Acceptance:** gate false-withhold ≤ 1% (§4.4), measured per operation by FR-GATE-2.

## 9. Requirements — recovery (FR-REC)

- **FR-REC-1** A clarification never has fewer than two options. With one candidate, the system runs it or declines; it does not ask the user to confirm the only choice.
- **FR-REC-2** Decline copy names the specific reason — "Ask doesn't have a tool for that yet" or "I need your roof year to answer — add it here" — and offers one concrete action. The generic "I couldn't find an answer" copy is retired.
- **FR-REC-3** Clarification options are labelled with the result each gives (horizon, scope), not the operation's name.
- **FR-REC-4** A withheld answer is never followed by a card whose only option re-runs the same operation.
- **FR-REC-5** When the user declines or ignores a clarification and rephrases, the rephrase is routed fresh; the earlier clarification does not constrain it.
- **FR-REC-6** Each decline records a bounded reason code so unsupported demand can be counted (feeds FR-CAP).
- **Acceptance:** dead-end rate ≤ 3% (§4.4); a scripted check that no card has a single option.

## 10. Requirements — evaluation programme (FR-EVAL)

The programme exists so quality is known **before** release. Every set records its provenance.

- **FR-EVAL-1 Synthetic set.** For each routable operation, at least 50 prompts generated by a model across these axes: register (formal, casual, terse), length, indirectness, typos, persona (first-time buyer, landlord, long-term owner, older owner), item named or not, and two-part questions. A separate generation pass produces prompts Ask **cannot** answer, so declining is also tested. The generator model and prompt are recorded and are **different from the router's**. A human reviews a random 10% for label correctness.
- **FR-EVAL-2 Independent human set.** At least 300 prompts written by people who did not work on Ask, with no sight of the operation list, labelled afterwards by two reviewers.
- **FR-EVAL-3 Perturbation suite.** Meaning-preserving edits (§2.3 plus abbreviations, word order, contractions) applied to every correct prompt; runs in CI; retention gates per §4.4.
- **FR-EVAL-4 Sealed held-out split.** Each set is split into a tuning part and a sealed part nobody tunes against. The sealed part is the release gate. It is refreshed each quarter so it cannot be fitted to.
- **FR-EVAL-5 End-to-end gate test.** FR-GATE-2.
- **FR-EVAL-6 Write-safety test.** No read-intent or meaning-preserving edit routes to a write (§4.4).
- **FR-EVAL-7 Cohort test before wide release.** 20–50 people use a build labelled as a test for two weeks; their prompts are labelled with the §4.3 definitions. The resolved rate must be within 5 points of the synthetic result, or the gap is investigated before release.
- **FR-EVAL-8 Honest reporting.** Every report states the set, its size, whether it was tuned on, and the date. A figure from a tuned set is never presented as a release gate.

**Known limit (stated, not solved):** a synthetic set cannot reproduce the real distribution of homeowner wording. The design therefore does not depend on enumerating prompts: coverage comes from FR-UND (understanding wording nobody listed), and the sets only **estimate** how well it works. FR-EVAL-7 and FR-OBS-1 exist because the estimate can be wrong.

## 11. Requirements — write safety, guided entry, capability coverage, observability

### 11.1 Write safety (FR-WRT)
30 operations are routable by message and are writes (`MAINTENANCE_TASK_CREATE`, `RESERVE_FUND_COMMAND`, `HOUSEHOLD_INVITATION`, `HOME_RECORD_EXPORT`, and others — §2.4).
- **FR-WRT-1** Before any other change in this FRD ships, trace each of the 30 to establish whether a message-routed call can change state without a confirmation or preview step. **[Not done.]**
- **FR-WRT-2** A message-routed write requires understanding-layer HIGH confidence **and** a visible preview of the exact change with an explicit confirm, unless the operation is already reachable only by a declared action.
- **FR-WRT-3** Politeness, punctuation or typo edits must not turn a read prompt into a write (FR-EVAL-6).

### 11.2 Guided entry (FR-GUI)
- **FR-GUI-1** Reduce free-text variance with suggested prompts chosen from the home's own state (missing data, upcoming tasks, recent changes) and tool entry points that start a question with the item already named.
- **FR-GUI-2** Every suggestion is a prompt that is in the evaluation sets and passes the release gates.

### 11.3 Capability coverage (FR-CAP)
- **FR-CAP-1** Report the share of evaluation prompts, and of production declines (FR-REC-6), for which no operation exists, grouped by topic.
- **FR-CAP-2** New operations are prioritised by that share. Each new operation ships with its answer-block constant (FR-GATE-1), at least 50 synthetic prompts, and its perturbation results.

### 11.4 Observability as a safety net (FR-OBS)
Observability is **not** the plan; it catches what the evaluation missed.
- **FR-OBS-1** Record, per turn: the routing stage, the chosen operation, confidence band, whether the gate withheld the answer, the recovery type, and a thumbs-down. Prompt text is stored under the existing retention and privacy rules; whether and how long is owner decision D3.
- **FR-OBS-2** Weekly report of the §4.4 metrics from production and a list of unlabelled declines for FR-CAP.
- **FR-OBS-3** A thumbs-down or a decline can be added to the tuning sets after review; it never goes into the sealed set.

## 12. Phasing and exit criteria

Order is by dependency, not by calendar. Sizes are relative (S/M/L); no schedule is promised.

| Phase | Content | Size | Exit criterion |
|---|---|---|---|
| 0 | FR-WRT-1 trace; FR-EVAL-1 to FR-EVAL-4 sets built; today's system scored on them | M | A real baseline for every metric in §4.4 |
| 1 | FR-NRM; FR-GATE-1, FR-GATE-2; FR-REC-1, FR-REC-4 | M | Perturbation retention ≥ 97% for framing, punctuation, typo; contract completeness test green for all 124 routable operations |
| 2 | FR-UND measured with the real model **offline** on the sets; no user impact | M | Resolved and wrong-answer rates measured, with the model beating Phase 1 on the sealed set, or the layer is not enabled |
| 3 | FR-UND enabled for the stages where Phase 2 showed it wins; FR-GATE-3 to FR-GATE-5; FR-WRT-2 | L | All §4.4 gates met on the sealed sets |
| 4 | FR-EVAL-7 cohort; FR-GUI; FR-REC-2, FR-REC-3, FR-REC-6; FR-OBS | M | Cohort resolved rate within 5 points of Phase 3; no gate regression |
| 5 | Wide release; FR-CAP loop; quarterly refresh of the sealed split | ongoing | Weekly production metrics stay inside the §4.4 gates |

## 13. Owner decisions

| ID | Decision | Recommendation |
|---|---|---|
| D1 | Confirm that a *measured target* of 90% resolved is consistent with governing FRD §7 ("guarantee correct interpretation" is a non-goal) | Yes: this FRD guarantees nothing, and every report states set and date |
| D2 | Allow the provenance rule (FR-GATE-3 to FR-GATE-5), which narrows the 2026-11-09 ruling | Yes, limited to trusted routes (audited rule, HIGH model confidence, confirmation) |
| D3 | Whether prompt text may be stored for evaluation, for how long, and who may read it; whether to export a de-identified sample for the human set | Owner to decide; nothing in this FRD sends home data to a model |
| D4 | Release-gate thresholds in §4.4 | Adopt as proposed, then adjust from the Phase 0 baseline |
| D5 | Model-use scope for routing: today's approval covers messages the local router cannot place (step 7); FR-UND-1 widens it to every message the fast path does not claim | Approve, subject to the cost band, latency gate and kill switch |
| D6 | Per-turn cost budget for routing and whether to cache (FR-UND-8) | Owner to set; measured in Phase 2 |
| D7 | Whether unsupported questions may be captured (FR-REC-6) and shown to the owner for prioritisation | Yes, reason code only, no prompt text unless D3 allows |
| D8 | Who forms the independent human set and the cohort (FR-EVAL-2, FR-EVAL-7) | Owner to name |

## 14. Design options (not requirements)

1. **Understanding layer.** (a) One call with all eligible operations grouped by domain; (b) two calls, domain then operation, when the catalogue outgrows one prompt. Start with (a) and measure.
2. **Fast path.** Keep only rules that score ≥ 99% precision on the tuning sets; demote the rest to model routing. Reduces the 142 branches over time; not a prerequisite.
3. **Spelling.** The vocabulary comes from the registry's own phrases (FR-NRM-1). A general dictionary was rejected: it cannot ship offline and would correct domain terms.
4. **Handler block constants.** Export from each handler file and import in the contract; a lint rule rejects a literal block id in a contract file.
5. **Candidate-recall measure.** Report, per operation, how often the right one is in the model's candidate list, so a recall failure is seen separately from a model failure.
6. **Gate for MEDIUM routes.** Keep word-overlap as today, or replace it with a second model check; decide from the Phase 2 numbers, not in advance.

## 15. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Synthetic prompts do not match real ones; the measured 90% is optimistic | FR-EVAL-2 and FR-EVAL-7; the cohort must agree within 5 points; FR-OBS as a net |
| The model is confidently wrong | Confidence policy; writes need preview and confirm; the gate retains the relevance check for MEDIUM routes; wrong-answer gate ≤ 2% |
| Latency and cost rise | Fast path skips the model; caching; p95 gate; cost band recording; kill switch |
| A spelling correction changes meaning | Same-first-letter, single unambiguous established target, routing-only; perturbation suite includes real words that are near-vocabulary |
| Tuning on the gate set inflates results | Sealed split, quarterly refresh, FR-EVAL-8 |
| New operations reintroduce the gate bug | FR-GATE-1 and FR-GATE-2 fail CI |
| The provenance rule hides a routing mistake | Applies only to trusted routes; FR-OBS-2 reports gate bypass counts against thumbs-down |
| Prompt text is personal data | D3; FR-UND-3 sends no home data |

## 16. Test plan

- Unit: normalisation (framing, punctuation, spelling, ambiguity, real words left alone); confidence policy; clarification never has one option.
- Contract: FR-GATE-2 over all 124 routable operations.
- Evaluation: §10 sets run in CI (perturbation, sealed held-out, write safety) and offline for the model (Phase 2).
- Regression: the five prompts in §2.1 and their variants remain in the tuning set.
- Not run until each phase ships: real-model accuracy, production latency and cost, the cohort.

## 17. Adversarial pass (per `AUDIT_METHODOLOGY.md` §7)

Questions asked of this document, with the answer found:
- *Does any figure read as measured when it was recorded or inferred?* The 68% / 46% recall figures are labelled **[Recorded]**; the "17 typed" count is labelled as a regex count that undercounts.
- *Does the 60% overstate quality?* Yes — §2.2 says why and gives the held-out figures beside it.
- *Does the perturbation figure overstate fragility?* Possibly for typos (longest-word edit) — §2.3 says so.
- *Does a requirement contradict a governing FRD?* Two touch one: §7 non-goal (D1) and the 2026-11-09 ruling (D2). Neither is assumed approved.
- *Is "never blocks" / "merged" ambiguity present?* No requirement here merges component answers; composition is unchanged.
- *Is anything unverified presented as fact?* FR-WRT-1 and §2.7 list what was not traced or run.

## 18. Related

- Fixes that motivated this document: `de7787ec`, `f30e65aa`, and the uncommitted repair-or-replace wording rule (revision 1.574 of `ASK_COZY_INLINE_WORKSPACE_FRD.md`).
- Scripts: `apps/backend/scripts/ask-routing-sweep.js` (routing sweep, `--model` for the real-model run).
- Files this FRD would change: `askRoutingCascade.ts`, `askModelRouter.ts`, `askSemanticAnswerValidator.ts`, `askAnswerTrustValidator.ts`, `support/commonMisspellings.ts`, the handlers' block-id constants, the clarification builders in `execution/createAskExecution.ts`.
