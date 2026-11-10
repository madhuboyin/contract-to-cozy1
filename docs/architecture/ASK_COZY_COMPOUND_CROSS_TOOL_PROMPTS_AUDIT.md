# Ask Cozy: Compound, Cross-Tool Prompts Audit

**Date:** 2026-11-08
**Question audited:** Can Ask Cozy take an arbitrary free-form prompt that needs data from several tools or features, do the arithmetic, and return one consolidated answer? The owner's worked example:

> "In case if i want to replace my roof in 5 years how much capital do i need and how much additional capital i need to start saving"

**Relationship to the existing audit:** `ASK_COZY_NATURAL_LANGUAGE_FREE_FORM_PROMPTS_AUDIT.md` measures whether a *single-intent* prompt reaches the right *single* operation (690-prompt sweep, 53-59% hit). This audit asks a different question, which that one does not cover: what happens when the prompt needs *more than one* operation, or a *calculation across* operations' data. The two compound: a prompt that needs three data sources fails if any one is misrouted, and the routing sweep contains no compound prompts.

**Method / labels (`AUDIT_METHODOLOGY.md` §1):**
- **[Executed]** — I ran the real `resolveAskRoutingCascade` (transpile-only ts-node, no DB, no network) on 23 compound prompts; output is in Appendix A. Script: scratchpad `route.js` / `compound.js` (not committed).
- **[Code-traced]** — read from source, not run. Everything about what a handler returns for a real home is code-traced: there is no local DB (owner testing policy), so **no handler was executed against real data in this audit**.
- **[Inferred]** — extrapolated.
- The *fit* verdicts in Appendix A (right op / half an answer / wrong op) are my judgment of what each prompt needs, not a measured score.

---

## 0. Implementation status (updated 2026-11-09)

| Step | State |
|---|---|
| Compound corpus + ratchet (§8 Phase 0) | Built: `tests/fixtures/askCompoundCorpus.js` (33 prompts, each with the operations its answer needs; first run 15 full / 11 partial / 1 clarify / 4 wrong / 2 fallback), `scripts/ask-compound-sweep.js`, `tests/ask/compoundSweepRatchet.test.js`, baseline `tests/fixtures/askCompoundSweepBaseline.json` |
| Item funding goal operation (§8 Phase 1) | Built: `CAPITAL_ITEM_FUNDING_GOAL`, FRD Revision 1.539. Owner prompt now FULL. Handler not run against a real database |
| Shared slot parsing (§8 Phase 2) | **Partially built: shared date parsing for the capital paths only** (FRD 1.539, 1.540): `support/targetDate.ts` is used by the funding goal, and a named date now picks the capital plan view in `parseCapitalTimelineHorizonRequest` (up to 5 years gives the 5-year view, up to 10 gives the 10-year view, longer is not matched; the 15/20-year tests still hold). The "in 3 years" question in §9 was decided as recommended: it maps to the 5-year view. Consumers of `parseTargetDate`: the funding goal, the capital timeline horizon parser, funding wording detection and "Also answer". The ownership-cost forecast now also uses it (FRD 1.543; a named horizon takes the shortest offered 1/3/5/10-year horizon that covers it). The maintenance-budget forecast is an annual figure with no horizon slot, so there is nothing to adopt there. Dollar amounts are now read by one module, `support/moneyAmount.ts`, used by the funding goal (a stated monthly amount) and Break-Even what-if (FRD 1.544); item naming was already shared. **Not built:** a single `askQuestionSlots` facade, and amount use by the other capital and ownership-cost operations (the `askQuestionSlots` module proposed in §8 Phase 2) |
| Bounded multi-operation answers (§8 Phase 3) | Not built, on purpose. A second operation's blocks must pass the first operation's answer-trust checks (block-id contracts, per-operation action allowlists, boundary requirements, relevance), and a stripped action fails silently. That path cannot be exercised here without a database, and the result semantics (what status when one half needs context) are an owner decision (§9). The compound corpus measures it: 11 of 33 prompts get one clause answered and the rest dropped |
| Single-fact building blocks (§8 Phase 4) | Condition routed to the existing item answer (FRD 1.539). "Cost of a new X" is now a cost-only mode of the funding goal read (FRD 1.548), from the capital timeline's estimate; an item missing from the timeline gets the plain not-on-timeline notice |
| Dropped second part: "Also answer" button (§8 Phase 3 alternative, step 4) | Built, FRD 1.540: `support/alsoAnswer.ts` splits a two-part question, routes each part, and adds one secondary button "Also answer: …" for a part that clearly (confidence 0.85 or more) belongs to a different READ operation. Tapping it asks that part as its own question, so it is routed, executed and trust-checked like any turn; no blocks from two operations are merged. Three elliptical follow-up shapes are recognised only inside a two-part question. Measured on the 21 two-part rows, in sequence: 2 before any follow-up shapes, 5 after the first shapes (FRD 1.540, commit 02ad7cd4), 7 immediately before FRD 1.542, 12 after it. The 5 → 7 step is not attributed in the FRD or the commit messages and I did not trace which change produced it. FRD 1.542 added five more follow-up shapes (reserve-plan money follow-ups, "which of those items are old enough to fail", "how much would a replacement cost"), so 12 of 21 now get one (offered clauses read by hand; one older offer, upgrades question to sell/hold/rent, looks wrong), none on single-question rows. The other 9 have second parts too vague to route safely. A tapped button's second answer was checked by reading the START_WORKFLOW path, not by running it |
| Roof recorded only on the home profile | Built, FRD 1.541: the funding goal, "how old is my roof" and the repair-or-replace read answer from `Property.roofReplacementYear` and the timeline's roof default when no roof item is tracked. Not run against a real database |
| Still open | A single slot facade and wider amount use (rest of Phase 2, low value); multi-operation answers in one turn (Phase 3, owner decision on UX and status); baseline for "currently saving" (stays a six-month deposit average); calibration refresh for fixtures 015, 065, 075, 121, 068, 122 |

## 1. Verdict

**Current verdict (2026-11-09):** the owner's roof prompt is solved: it routes to `CAPITAL_ITEM_FUNDING_GOAL` and the compound baseline records it as FULL (handler not run against a real database). Arbitrary cross-operation consolidation is **not** solved: one operation still answers per turn, and the "Also answer" button only offers the dropped part as a separate question (§0, Phase 3 not built).

**Original verdict (2026-11-08 baseline, kept for history; §§2-5 and Appendix A likewise describe behavior before the implementation in §0):** Ask Cozy could not answer the roof prompt as asked, and the cause was structural, not wording. Four independent gaps, each sufficient to fail it:

| # | Gap | Evidence |
|---|---|---|
| G1 | The router picks **one** operation per turn; no layer composes several. | §2 |
| G2 | The roof prompt routes to the **wrong** operation (`REPLACEMENT_GUIDANCE`, a repair-vs-replace verdict) | §3, Appendix A #1 |
| G3 | The operation that owns the data (`CAPITAL_RESERVE_PLAN`) is **whole-home**; it cannot be scoped to one item, a target date, or a stated horizon other than 5/10 years | §4 |
| G4 | A per-item monthly figure exists (`homeReserveFundCalculation.service.ts:224-225`), but it is tied to the **model's** window, ignores what is already saved, and is never compared with what the user **currently** puts aside, so "additional capital" is never produced | §5 |

Fixing routing alone (G2) would send the prompt to a whole-home reserve plan that does not answer it. Building the calculation alone (G4) would be unreachable because the router sends the prompt elsewhere. Both are needed.

The problem is general. Of the 23 prompts I tried (Appendix A), 11 reached a wrong operation or the fallback, 5 got half an answer, 5 got the right operation but a whole-home or partly unverified answer, and 2 were simple single-fact questions answered correctly. None got a consolidated cross-tool answer. These counts are my judgment, see the label note above.

---

## 2. G1 — One operation per turn; no composition layer

- `resolveAskRoutingCascade` returns a single `AskRoutingDecision.operation` (`askRoutingCascade.ts:36-43`). Every stage (SAFETY → DETERMINISTIC → LOCAL_CLASSIFIER → MODEL_CLASSIFIER → CLARIFICATION → REMOTE_FALLBACK) ends in one operation, a clarification, or the fallback **[Code-traced]**.
- The only multi-intent handling is `MULTI_INTENT` in `classifyAskCandidates` (`askSemanticRouter.ts:354-360`). It fires only when two candidates are both HIGH-band **and** the message contains `and|also|plus|then`, and its outcome is a **clarification asking the user to pick one** (`askRoutingCascade.ts:176`). It never runs both **[Code-traced]**.
- It is also bypassed on the deterministic path: Stage 2 regexes resolve before the classifier runs. The roof prompt contains "and" and still resolves at confidence 0.96 **[Executed]**, so no multi-intent check ever saw it.
- I searched `src/services/ask` for composition machinery (`composite`, `fan-out`, `decompos`, `planAndExecute`, sub-question, operation chain). The only hits are unrelated comments, plus the `MULTI_INTENT` code above **[Executed grep; absence of a name is not proof of absence of the feature, but I found no entry point that invokes two operations for one message]**.
- `askResultSynthesis.service.ts` is *not* a composition layer: it rewrites one operation's already-validated blocks into one sentence, and rejects any number not present in the payload (`numericalClaims`, line ~46) **[Code-traced]**. That numeric guard is the best reusable invariant for any future narration step.

Consequence: any prompt of the shape "A *and* B" is answered as A, as B, or as a clarification. The other half is silently dropped.

## 3. G2 — Keyword-first routing sends the roof prompt to the wrong operation

**[Executed]** `resolveAskRoutingCascade(<roof prompt>)` → `DETERMINISTIC`, `REPLACEMENT_GUIDANCE`, 0.96, sole candidate.

Cause **[Code-traced]**: `itemKeepOrReplacePattern` (`askOperationRegistry.ts:1365`) is a lookahead that fires when the message contains a replaceable item (`roof` is in `REPLACEABLE_NON_HVAC_ITEM`, line 1361) **and** `KEEP_OR_REPLACE_INTENT` (line 1364), which includes `replac\w*` via `worth repl…` / `(need|have|time|ready) … replac…`. Any "replace my roof" sentence therefore matches regardless of what else is asked. `capitalReservePattern` (line 1214) would not have matched this prompt anyway: it knows "how much should I save", "capital plan", "budget for roof", but not "how much capital do I need".

Same prompt with different wording **[Executed]**: "How much will it cost to replace my roof in 5 years and how much should I save each month" → `CAPITAL_RESERVE_PLAN` 0.97. Whether the owner gets the right operation depends on whether the user happens to say "save each month".

What `REPLACEMENT_GUIDANCE` returns for a roof **[Code-traced]** (`miscHandlers.handler.ts:~207-330`):
1. If no roof is in inventory: "I don't have a roof recorded for your home yet" plus an add action.
2. If recorded: the Repair-vs-Replace engine's verdict, a table of *next repair cost / replacement cost / annual repair risk*, and a factor trace. It does **not** use the "5 years" at all, computes no savings figure, and reads no reserve-fund data.

So the best case is a replacement cost estimate with a verdict, which is one input to the answer, not the answer.

## 4. G3 — The owning operation is whole-home and not parameterised

`capitalReservePlanResult(userId, propertyId, message)` (`capitalPlanning.handler.ts:~190`) **[Code-traced]**:
- Reads the full capital timeline (`homeCapitalTimelineService.getLatestTimeline`) and the reserve fund (`getSummary`, `listLineItems`, `listContributions`).
- Output: a summary using fund-level `recommendedMonthlyContributionCents` and `currentShortfallCents`, a progress block, a **timeline of the 200 soonest windows for every item**, allocations, ledger, and so on.
- The only message-derived parameter is the horizon, via `parseCapitalTimelineHorizonRequest`, which accepts **only** the literal `5 year` or `10 year` (`support/domainHelpers.ts:39-43`). "In 3 years", "by 2035", "next year" return `null` and the stored horizon is used **[Code-traced]**. The 5-year run for the roof prompt happens to work; the 3-year HVAC+roof prompt (Appendix A #4) would silently show the 10-year plan.
- No item scoping: the user asking about the roof gets a plan covering every item. The roof's own timeline row (window, min/max cost, confidence) is *in* the payload, but nothing selects it.
- No target-date override: the plan's roof window is the model's prediction. The user's scenario ("replace in 5 years") is not compared with it, so a roof the model expects to fail in 2 years and a user planning for 5 get the same answer.

## 5. G4 — The "additional capital" figure is never produced

What the user asked decomposes into **[Inferred decomposition]**:
1. Roof age and condition → *inventory item* (`installedOn`, `condition`).
2. Replacement cost at the target date → timeline item `estimatedCostMinCents/MaxCents`, or Repair-vs-Replace `estimatedReplacementCostCents`.
3. Months until target → target date minus today.
4. Required monthly = (cost at target − already allocated to the roof) ÷ months.
5. Currently saving per month → fund line item `allocatedMonthlyCents` for the roof, or the fund's contribution ledger.
6. Additional per month = (4) − (5).

Data availability **[Code-traced, schema]**:

| Input | Where | Status |
|---|---|---|
| Roof age/condition | `InventoryItem` | exists |
| Cost range at a date | `HomeCapitalTimelineItem.estimatedCost{Min,Max}Cents`, window | exists; default `inflationRate: 0.035` is applied in `homeCapitalTimeline.service.ts:~327`. **Whether the stored cost range is already inflated to the window is not established by this audit** — must be read before presenting a number as "cost in 5 years" |
| Amount already saved for roof | `HomeReserveFundLineItem.allocatedBalanceCents` | exists |
| Planned monthly for roof | `HomeReserveFundLineItem.allocatedMonthlyCents` | exists, but it is the model's *recommended* allocation (`recommendedMonthlyContributionCents` is explicitly "recommended") |
| What the user *actually* saves per month | `HomeReserveFundContribution` ledger (self-reported, "not connected to a bank") | raw events only; **no rate is derived anywhere I found** |
| Per-item monthly requirement | `homeReserveFundCalculation.service.ts:213-229` | **exists, with three limits [Code-traced]:** (1) `ceil(targetCost ÷ monthsUntil(item.windowStart))` uses the model's predicted window, so a user's "in 5 years" cannot change it; (2) the balance is **not** subtracted for non-near-term items (the per-item balance is a proportional display share, lines 204-209); (3) items starting within 6 months (`NEAR_TERM_MONTHS`) get a lump-sum shortfall and a monthly of 0 |
| Gap vs. what the user currently saves | — | **not computed.** `capitalReservePlanResult` shows fund-level shortfall and the model's recommended monthly, never a per-item or scenario gap against actual contributions |

So roughly half of step 4 exists (as the model-window version) and steps 3 and 6 do not. Point 5 is a real product ambiguity, not just a missing line: "how much additional do I need" needs a baseline of what the user is *currently* putting aside. The ledger can supply one only if the user logs contributions. If the ledger is empty, the correct answer is "the full amount, and here is the monthly figure", with the assumption stated. That is a design decision for the owner (§9).

## 6. Wider evidence: the failure is general, not the roof example

Appendix A, **[Executed]** routing + my judgment of fit. Failure shapes:

| Shape | Examples (Appendix A #) | Effect |
|---|---|---|
| Second clause dropped | 7 (refinance + roof → roof only), 16 (insurance premium), 5/6 (warranty half lost) | confident, partial, wrong |
| Wrong operation by keyword | 8 (TCO vs reserve → `COVERAGE_COMPARISON_STATUS`), 12 (systems needing replacement + capital → `INVENTORY_LOOKUP`), 17 (repair now vs replace later → `FINANCING_OVERVIEW`) | irrelevant answer |
| Horizon not understood | 4 (3-year), 13 ("through 2035" → fallback) | wrong or no answer |
| Falls to fallback | 11, 13, 18, and **single-fact** 20 ("what's my roof's condition"), 21 ("how much does a new roof cost") | "nothing in your record answers this" or did-you-mean |
| Right op, whole-home answer | 2, 4, 15, 23 | usable but unscoped |

Item 21 matters: the simplest roof-cost question does not route at all **[Executed]**: no item-cost or item-condition read exists as a building block. Any composed answer needs those blocks first.

## 7. Constraints any fix must respect (governing docs, `AUDIT_METHODOLOGY.md` §5)

1. **LLM is last resort** (owner rule, memory `feedback_ask_llm_last_resort`; target architecture Principles #2/#9): answers come from deterministic operations. A composition design must not make an LLM the answer engine. Using the model for *classification into registered frames* is already precedented (`askModelRouter.ts`, READ-only, default OFF, unmeasured) **[Code-traced]**.
2. **Model router is READ-only and off by default**; real accuracy is unmeasured (needs `--model` sweep with a Gemini key). Do not plan on it.
3. **Numbers must trace to data.** `numericalClaims` already throws if narration invents a number. Keep that.
4. **Every new operation needs governance registration** (memory `feedback_new_ask_op_needs_governance_allowlist`: unregistered skill-less ops crash-loop prod at boot; also action-id allowlist). Run `startupRegistryValidation.test.js`.
5. **Ask never links to desktop pages** (owner rule 2026-10-10): composite answers must be fully inline.
6. **Routing changes are gated by the sweep ratchet** (`npm run test:ask:routing`) and the 126-fixture certification; the existing audit already showed naive threshold changes add misroutes.
7. **Prod is the Raspberry Pi ARM**: anything doing per-request fan-out should stay cheap (reads only, parallel, no new LLM call on the hot path).

## 8. Recommended design (phased, smallest correct first)

Keep it simple (owner: no real customers, avoid flags and compat layers).

**Phase 0 — Measure (do first; no product change).**
Add a *compound corpus* (start from Appendix A, grow to ~100 across domains: capital, ownership cost, coverage+cost, sell/refi/upgrade, timing comparisons) where each row lists the **set** of operations/data sources a correct answer needs, not one expected op. Add a runner mode and a ratchet like `routingSweepRatchet`. Without this, fixes can't be shown to generalise (the existing audit's own holdout discipline applies: write the held-out slice before looking at misses).

**Phase 1 — One new deterministic READ operation: item funding goal** (e.g. `CAPITAL_ITEM_FUNDING`; name TBD).
Slots: `item` (roof, water heater, HVAC… via the existing `findSpecificInventoryAlias` + roof), `targetDate` (parse "in N years/months", "by YYYY", "next year", "when it fails"), optional `monthlyBudget`. Computation, all from existing services, read-only:
cost at target (timeline item, with an explicit statement of whether it is inflated) → minus allocated balance → ÷ months to the *user's* target date (reuse `monthsBetween`/the posture-based `pointEstimateCents` rather than re-deriving) → compare with the roof's `allocatedMonthlyCents` and with the observed contribution rate if the ledger has one.
Output: one SUMMARY ("about $X in 5 years; you'd need $Y/month; you're putting aside $Z; save $W more"), a TABLE of the steps with sources, EVIDENCE, BOUNDARY, and a canonical block-id contract so the relevance validator keeps it (same fix pattern as `capital-` prefixes). Missing inputs → `READY_WITH_LIMITATIONS` with a plain statement of each assumption, never a guessed figure (`AUDIT_METHODOLOGY.md` §12). Route it **ahead of** `itemKeepOrReplacePattern` when save/capital/afford/set-aside/budget words appear with a replaceable item.
This directly delivers the owner's example and is the template for the general case.

**Phase 2 — Slot parsing as a shared service.**
Extract horizon/target-date/item/amount parsing out of one-off regexes (`parseCapitalTimelineHorizonRequest` only knows 5/10) into one `askQuestionSlots` module used by capital, ownership-cost, maintenance-budget and the new op. Fixes G3 for every existing op (e.g. the silent 10-year default for "3 years").

**Phase 3 — Bounded multi-operation answers (the general fix for G1).**
For a prompt whose clauses map to **two registered READ operations whose data is independent** (e.g. refinance + roof, warranty + replacement cost), run both and return one result with a section per operation, each under its own validator contract, led by a one-line statement of which parts were answered. Deterministic splitting first (clause boundary + per-clause routing through the existing cascade); no LLM. Cap at 2-3 clauses; any clause that routes to a write, safety or non-READ operation is not executed, and the reply says so. This reuses all existing handlers and validators rather than creating a second answer engine. Requires an owner decision on the composite result's status and trust semantics (what if one half is `NEEDS_CONTEXT`).

**Phase 4 — Missing building blocks** found by the single-fact failures (roof condition, "what does a new X cost"): item-level condition/cost reads, so Phases 1 and 3 have something to compose.

**Not recommended:** an LLM planner that chooses and chains arbitrary operations. It conflicts with constraints 1-3, is unmeasurable today, and the Phase 1-3 path covers the stated goal without it. Revisit only after Phase 0 shows what deterministic composition cannot reach.

## 9. Decisions needed from the owner

1. **Baseline for "currently saving".** Use (a) the reserve line's recommended allocation, (b) a rate derived from the contribution ledger, or (c) ask the user for it as an inline capture question when neither exists. I recommend (b) falling back to (c), stating the assumption.
2. **Cost-at-target basis.** Inflate the planning estimate to the target date (needs confirmation of what the timeline already does, §5) or quote today's dollars with a stated growth assumption.
3. **User scenario vs model window.** If the user says "in 5 years" and the model predicts failure in 2, show both and say so (recommended), or answer only the user's scenario.
4. **Phase 3 scope:** is a two-section composite answer acceptable UX in the calm conversational shell, or must it be one prose answer?
5. Whether the Phase 0 corpus may use anonymised real prompts.

## 10. What this audit did **not** establish

- No handler was run against real home data. What the roof prompt actually renders for a home with a recorded roof, a timeline row and a reserve fund is code-traced only. A manual checklist for the owner: with a home that has a roof in inventory, send the roof prompt and the "save each month" variant, and record what appears; the first should show a repair/replace verdict, the second the whole-home plan.
- The 23-prompt set is small and written by me; Appendix A's fit column is my judgment. It shows the failure shapes; it is not a rate.
- Whether stored capital cost ranges are already inflated to their window (§5).
- Buyer-gated operations may behave differently in prod (the earlier review's caveat).
- Whether `REPLACEMENT_GUIDANCE` for a roof has a timeline-backed cost or only the generic category default was not traced into `replaceRepairService`.

---

## Appendix A — Routing of 23 compound prompts **[Executed]** (2026-11-08 baseline, before implementation; see §0 for current state)

Stage/op/confidence are program output. "Fit" is my judgment.

| # | Prompt | Stage | Operation (conf) | Fit |
|---|---|---|---|---|
| 1 | **Owner's roof prompt** | DETERMINISTIC | REPLACEMENT_GUIDANCE (0.96) | wrong op: verdict + replacement cost only, no savings math |
| 2 | cost to replace roof in 5 yrs and save each month | DETERMINISTIC | CAPITAL_RESERVE_PLAN (0.97) | right op, whole-home, no roof gap |
| 3 | when will roof need replacing, set aside per month | DETERMINISTIC | REPLACEMENT_GUIDANCE (0.95) | half: "set aside" dropped |
| 4 | replace HVAC and roof in 3 yrs, total cost, on track with reserve | DETERMINISTIC | CAPITAL_RESERVE_PLAN (0.97) | right op; "3 years" ignored (10-yr default) |
| 5 | water heater under warranty, replacement cost if not | LOCAL_CLASSIFIER | APPLIANCE_FAILURE_RISK (0.49; WARRANTY_LOOKUP 0.47 close) | half: warranty clause lost |
| 6 | appliances out of warranty, likely to fail in 2 yrs, cost to replace | DETERMINISTIC | APPLIANCE_FAILURE_RISK (0.96) | half: warranty filter lost |
| 7 | afford to refinance and also replace roof next year | DETERMINISTIC | REPLACEMENT_GUIDANCE (0.96) | wrong: refinance dropped |
| 8 | total cost of ownership next year vs monthly reserve | DETERMINISTIC | COVERAGE_COMPARISON_STATUS (0.96) | wrong op |
| 9 | monthly maintenance spend and more to save over 10 yrs | DETERMINISTIC | OWNERSHIP_COSTS (0.97) | half: savings gap missing |
| 10 | replace furnace now or wait 3 yrs, savings by waiting | DETERMINISTIC | HVAC_DECISION_START (0.96) | plausible; "3 years" scenario not traced |
| 11 | sell in 5 yrs, which upgrades and cost | REMOTE_FALLBACK | GROUNDED_GUIDANCE (top cands OWNERSHIP_COSTS 0.43, CAPITAL 0.43) | fail |
| 12 | systems needing replacement in 5 yrs and total capital | DETERMINISTIC | INVENTORY_LOOKUP (0.96) | wrong op (CAPITAL_RESERVE_PLAN needed) |
| 13 | monthly savings for all big replacements through 2035 | REMOTE_FALLBACK | GROUNDED_GUIDANCE (CAPITAL 0.50 top) | fail: year-range horizon |
| 14 | roof is 18 yrs old, how much longer, cost of new | DETERMINISTIC | REPLACEMENT_GUIDANCE (0.95) | partial; user-stated age not injected [Code-traced] |
| 15 | reserve fund covers water heater and roof | DETERMINISTIC | CAPITAL_RESERVE_PLAN (0.97) | right op, unscoped |
| 16 | insurance premium if I replace roof | DETERMINISTIC | REPLACEMENT_GUIDANCE (0.96) | wrong: no premium data path |
| 17 | repair roof now vs replace in 5 yrs, cost | LOCAL_CLASSIFIER | FINANCING_OVERVIEW (0.50) | wrong op |
| 18 | top 3 spends this year, what if I skip | REMOTE_FALLBACK | GROUNDED_GUIDANCE | fail |
| 19 | equity and could it pay for a new roof | DETERMINISTIC | FINANCING_OVERVIEW (0.96) | half |
| 20 | what's my roof's condition | REMOTE_FALLBACK | GROUNDED_GUIDANCE | fail (single fact) |
| 21 | how much does a new roof cost | REMOTE_FALLBACK | GROUNDED_GUIDANCE | fail (single fact) |
| 22 | how old is my roof | DETERMINISTIC | INVENTORY_LOOKUP (0.96) | ok |
| 23 | how much should I save monthly for repairs | DETERMINISTIC | CAPITAL_RESERVE_PLAN (0.97) | ok |

Count by judged fit (each prompt counted once, by dominant outcome; judgment, not measurement): ok 2 (22, 23); right operation but unscoped or partly unverified 5 (2, 4, 10, 14, 15); half an answer 5 (3, 5, 6, 9, 19); wrong operation 6 (1, 7, 8, 12, 16, 17); fallback 5 (11, 13, 18, 20, 21). Total 23.
