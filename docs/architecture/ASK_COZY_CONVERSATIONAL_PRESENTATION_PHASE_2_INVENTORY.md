# Ask Cozy — Conversational Presentation, Phase 2 Inventory

**Date:** October 6, 2026
**Status:** Inventory complete and reviewed (October 6, 2026). Revision 2 incorporates the review: R1 and the narrowed seasonal wording fix are implemented (§8); R3 is a recorded product decision, not implemented; R4 is a recorded decision. Phase 2 closes with **no new contract**.
**Plan:** [`ASK_COZY_CONVERSATIONAL_PRESENTATION_IMPLEMENTATION_PLAN.md`](ASK_COZY_CONVERSATIONAL_PRESENTATION_IMPLEMENTATION_PLAN.md) §5
**Inputs:** [Phase 1 audit](ASK_COZY_CONVERSATIONAL_PRESENTATION_PHASE_1_AUDIT.md) §9.5 (shipped as `11233b57`), FRD v1.185 Appendix C.11
**Method:** `AUDIT_METHODOLOGY.md`. Labels: **[Executed]** ran and observed, **[Code-traced]** read not run, **[Inferred]** extrapolated (none is relied on). Searches are scoped to the directories named; "none found" means none found there.

## 1. The question Phase 2 answers

Plan §5: inventory every local special case Phase 1 introduced; if **two or more producers need the same missing semantic field or ordering policy**, propose the smallest additive contract (producer ownership, schema validation, old-response fallback, skill-manifest impact, frontend rendering, accessibility, history compatibility). Do not add a persisted `responseIntent` or seven block types to mirror the policy vocabulary; add something only if producers or clients cannot otherwise express or validate the behavior without string or block-id inference.

## 2. Inventory of Phase 1 special cases

| # | Special case | Where | Producers using it now | Other producers with the same need |
| --- | --- | --- | --- | --- |
| S1 | `initialVisibleCount` on a grouped-list section (generic contract field) | `ask.contract.ts`; `SeasonalPlanResultList.tsx` `PlanSection` | 1 (`home-basics-items`, safety guide) | See §3.1 |
| S2 | `home-basics-next` registered by id in `SEASONAL_NEXT_STEPS_BLOCK_IDS` | `SeasonalAnswerCards.tsx` | 4 producers use the id-set pattern (seasonal plan, seasonal checklist, home habits, home basics) | See §3.2 |
| S3 | A `TASK_GUIDE` may declare no primary action; footer honors declared `style` | `TaskGuideBlock.tsx`; `seasonalHomeCare.ts` | 1 (seasonal walkthrough). Habit review declares `PRIMARY` itself [Code-traced] | See §3.3 |
| S4 | `timingFact` ("now is a good time" once a window passed) | `seasonalHomeCare.ts` | 1 | None: the only other reader of `seasonalTaskFacts` (`askSeasonalMaintenance.ts:208`) filters out `When` [Code-traced] |
| S5 | `EMERGENCY` boundary inside a routine guide, which puts the whole response in safe-recovery suggestion mode | `homeBasicsGuide.ts`; `finalizeSuggestedNextActions.ts:53` | 1 routine producer; the emergency-help operation uses it by design (`miscHandlers.handler.ts:517`) | None found in `services/ask` or `services/skills` for gas/911/evacuate wording outside those two [Code-traced] |
| S6 | Per-operation allow-lists: boundary ids and action ids | `askAnswerTrustPolicy.ts` | All governed ids | n/a: existing governance, Phase 1 added 1 boundary id and 3 action ids |
| S7 | Lead-with-judgment summary wording | `seasonalHomeCare.ts` (`quotedTitles`, judgment sentence) | 1 | See §3.4 |
| S8 | Personalization-as-context boundary wording | `seasonalHomeCare.ts`, `homeBasicsGuide.ts` | 2 | See §3.5 |

## 3. Does any special case have a second producer with the same need?

### 3.1 S1 `initialVisibleCount`

Producers with plan-layout lists long enough to want a producer-declared disclosure boundary [Code-traced]:

- `renovation-readiness-items` (`capitalPlanning.handler.ts:255-259`): each section is built with `.slice(0, 20)`, so "Other open items" can hold up to 20 cards.
- `home-habits-items` (`homeHabitCoach.handler.ts`): up to `HOME_HABITS_ASK_LIMIT = 50` habits in `start` and `later` groups.
- `hiring-guide-items`: six equal items, the same shape home-basics had before Phase 1 (`hiringGuide.ts`).
- `home-basics-items` monthly routine: five equal items.

So **the need exists in at least two more producers**, which justifies keeping the field generic (it is). It does **not** by itself justify turning it on: the choice of how many items lead is a product ordering decision for each list (§5, R3), and only the producer knows it.

**Overlap found (F13).** Four record-list components already implement "show N, then Show more" through persisted view state, `ResultView.visibleCounts[sectionId]` (`HomeEventResultList`, `DocumentResultList`, `MaintenanceResultList`, `InventoryResultList`) [Code-traced]. The plan layout does not use it. Phase 1's `PlanSection` keeps its expansion in component-local state, as `PlanTask`'s own detail toggle already does. Consequences:

- Two disclosure mechanisms exist. They serve different families (record lists with live detail versus authored/plan lists), and the plan layout was already fully local, so Phase 1 is internally consistent, but a homeowner who expands a plan section loses that on reload while an inventory list keeps it.
- They **cannot be merged by changing one line.** `reconcileResultView` forces `visibleCounts[section.id]` to at least 5 for every section (`resultViewState.ts:94`) and the hydrator accepts only 5–100 (`:37`). A declared count of 3 would be raised to 5 by reconciliation. Unifying them is a view-state design change, not an adoption.
- Decision recommended: leave plan-layout disclosure local and record it (R4).

Decisions recorded for the adoption candidates (review, October 6, 2026; **not implemented**, a separately approved content increment):

- **Hiring guide.** Its six items are authored in an order, not ranked by importance, so setting `initialVisibleCount: 3` alone would imply a priority nobody chose. Disclosure requires **reordering** the lead set first. Recommended lead three: (1) check licensing and insurance, (2) get itemized written estimates, (3) put scope, price, schedule, payment and changes in a signed contract. That moves the contract/payment item up; references, permits and warranty/subcontractor checks sit under "Show 3 more". A continuation is added only if it launches a registered, relevant capability with correct targeting (for example quote comparison); otherwise no continuation is acceptable.
- **Monthly routine.** Stays fully visible and does **not** use `initialVisibleCount`: five short, equally relevant checks performed as one routine; hiding two would imply a priority the producer does not own.
- **Renovation readiness.** Local disclosure applies **only** to "Other open items", with an initial visible count of **five**. "Blocking" stays fully visible.
- **Renovation truncation is a separate, pre-existing issue.** The producer delivers at most 20 items per section (`.slice(0, 20)`) while `section.count` can state more (`capitalPlanning.handler.ts:255-259`) [Code-traced]. `initialVisibleCount` and its "Show N more" expose only delivered items; they neither fix the cap nor tell the homeowner that more items exist. That needs honest truncation copy or paging, handled separately and not conflated with this field.

Partial-window check: `initialVisibleCount` counts **delivered** items. A server-paged section (`offset`/`count`) with more items on the server than delivered shows "Show N more" for delivered items only; no current producer combines the two [Code-traced].

### 3.2 S2 next-steps recognized by block id

The client recognizes the card by id in three sets (`SEASONAL_INTRO_BLOCK_IDS`, `SEASONAL_NEXT_STEPS_BLOCK_IDS`, `SEASONAL_ABOUT_BLOCK_IDS`) plus the plan-layout set. Four producers use `*-next` ids with the identical title "What would you like to do next?" [Code-traced].

A semantic field (for example a role on `SUMMARY`) would remove the id-sets from the client, but it would **not** remove the trust-policy allow-lists, which are also id-keyed and are the governing mechanism (S6). Rendering is validated today by component tests per id. Nothing in the client or the validator is blocked for lack of the field. **Verdict: not justified. Defer** until a producer needs the card under an id that is not listed, or the id-sets exceed what a reviewer can audit.

Related, and a real consistency gap, not a missing field: three producers' siblings with no continuation at all (hiring guide) are covered by §5 R3.

### 3.3 S3 action prominence

The contract already carries the semantic: `style: PRIMARY | SECONDARY | QUIET`. The defect is that two renderers ignore it and style by position:

- `SeasonalNextSteps` (`SeasonalAnswerCards.tsx:83`): `index === 0 ? 'PRIMARY' : 'SECONDARY'`.
- `CalmReceipt` (`CoreBlocks.tsx:125`): same rule, for workflow receipts (out of scope here).

R1 fixes `SeasonalNextSteps` only. **`CalmReceipt` remains a separate positional-style exception**: it overrides declared style for workflow receipts and is outside this phase. R1 therefore does not eliminate the anti-pattern globally; the inventory should not be read as saying so.

Effect of the first, by producer [Code-traced unless noted]:

| `*-next` producer | Declared first action | Rendered first action | Divergence |
| --- | --- | --- | --- |
| `home-habits-next` | `PRIMARY` | filled | none |
| `seasonal-maintenance-next` | `PRIMARY` | filled | none |
| `seasonal-home-care-next` with checklist or setup | `PRIMARY` | filled | none |
| `seasonal-home-care-next` with no setup context (viewer, existing-home rules) | walkthrough `SECONDARY` | filled | **yes** |
| `home-basics-next` (added in Phase 1) | `SECONDARY` | filled | **yes [Executed]** |

[Executed]: a throwaway jest render of `SeasonalNextSteps` with two actions declared `SECONDARY` produced one filled button, and it is the first. Phase 1 therefore left `home-basics-next` inconsistent with the principle it applied to `TASK_GUIDE` (audit §9.4 recorded the renderer behavior as a limitation but described it as intentional; for `home-basics-next` that is not what the producer declared). **No new contract is needed**: make `SeasonalNextSteps` honor declared style. Producers that rely on the position rule already declare `PRIMARY` on the first action, so their rendering would not change.

### 3.4 S7 judgment-first summary wording

Of the two other producers I first listed, only one has the same correctness defect [Code-traced]:

- **Same defect: the recorded seasonal checklist** (`askSeasonalMaintenance.ts:182`): "Here are N things to focus on. I recommend doing the first X soon, and the other Y when you have time." It refers to tasks by position rather than naming them.
- **Not the same defect: Home Habit Coach** (`homeHabitCoach.handler.ts:155`): "…X past their suggested date, so I would start there." "There" refers to the explicitly named overdue group, not to the first X positions. It may be improved stylistically but is not a correctness defect, and is left unchanged absent a separate copy review.

A three-producer helper would couple different semantics: the winter plan ranks by catalog priority; the recorded checklist uses priority, status and recommended date; habits use overdue dates and coach ranking. **The helper is therefore seasonal-specific and shared only by the winter plan and the recorded seasonal checklist**: the callers decide what is urgent and pass the ordered urgent titles; the helper only words them. No broad cross-domain sentence generator is created.

Finding while implementing (F18): naming record titles puts them in authored summary text, and the answer checker rejects authored text containing an internal-key-like token (`INTERNAL_TOKEN` in `askAnswerTrustValidator.ts`). The existing test "keeps the plan answer even with a code-like task title" caught the regression. The helper therefore never quotes a title that looks like an internal key; it still makes the judgment ("…is listed first") without naming it.

### 3.5 S8 personalization wording

Five producers hand-author their disclosure ("General guidance", "About this recommendation", "About these habits", plus the walkthrough note) with different phrasing [Code-traced]. C.11.6 asks producers to translate the state into governed statements; it does not ask the client or validator to branch on the state. No consumer needs a machine-readable personalization state today. A field would be unused metadata, which the plan warns against. **Verdict: not justified now.** Revisit with Phase 4, where present/absent/unknown/stale states actually change content.

### 3.6 S5 emergency block and suggestion mode

Only one routine producer places an `EMERGENCY` boundary in an otherwise normal answer. The mode rule is response-wide by design and tested (Phase 1). A second routine producer with a conditional emergency instruction would face the same trade (starters suppressed), which is a product tradeoff, not a missing field. **No contract.** Recorded so a second occurrence is noticed.

### 3.7 S4 and S6

S4 has no second consumer. S6 friction is real (Phase 1 touched `askAnswerTrustPolicy.ts` in two places plus two frontend id-sets for one answer) but it is the governance model working as designed, and the Phase 1 tests exercise it through `validateAskAnswerTrust`.

## 4. Candidate contracts evaluated

| Candidate | Second producer need? | Express/validate without id or string inference? | Verdict |
| --- | --- | --- | --- |
| C1 `initialVisibleCount` (shipped) | Yes (§3.1) | Yes, that is its purpose | **Keep as is.** Checklist in §4.1 |
| C2 semantic role on `SUMMARY` for next steps | 4 producers use the card | The client and validator work by id today | **Defer** |
| C3 personalization/basis field | 5 producers hand-write text | No consumer branches on it | **Defer to Phase 4** |
| C4 persisted `responseIntent` / seven composition modes | n/a | n/a | **Rejected** per plan §5 and FRD C.11.2 |
| C5 action-prominence semantics | n/a | Already in `style` | **No contract; renderer fix** (§3.3) |
| C6 lead-sentence helper | One more producer with the same defect (the recorded seasonal checklist); habits is a different semantic (§3.4) | n/a (producer text) | **Seasonal-specific producer-side helper, not a schema change; not a cross-domain helper** |

### 4.1 `initialVisibleCount` against the plan's required checklist (retrospective)

| Requirement | Status |
| --- | --- |
| Producer ownership | The producer declares the boundary; the renderer never infers it [Code-traced, component-tested] |
| Schema validation | `z.number().int().positive().optional()` on the section; additive. Not validated against `items.length` or `count`; a value at or above the delivered items is simply "no control" (tested) |
| Old-response fallback | Field absent means every item shows; stored executions keep rendering in full [component-tested] |
| Skill-manifest impact | None: manifests list `allowedResultBlocks` block types only (`home-habit-coach`, `maintenance`), and the two producers here are skill-less [Code-traced] |
| Frontend rendering | One local expand/collapse in `PlanSection`; does not touch the generic list switch |
| Accessibility | Real `<button>`, `aria-expanded`, `aria-controls` (the always-present list), label changes "Show N more" / "Show fewer"; hidden items are not in the DOM. Not announced through a live region: the state is conveyed by `aria-expanded` and the label, which is the standard disclosure pattern; focus stays on the control [component-tested; not screen-reader tested] |
| History compatibility | Persisted with the block through the schema (`askAnswerTrustValidator` spreads the section, so the field survives repair [Code-traced]); an older client ignores it and shows everything |

Other places that rebuild `GROUPED_LIST` sections: `askResultSynthesis.service.ts:13` maps sections to a title/count/items summary for narration, which intentionally ignores display fields [Code-traced].

## 5. Recommendations and decisions

| ID | Decision | Status |
| --- | --- | --- |
| **R1** | `SeasonalNextSteps` honors each action's declared `style` (PRIMARY, SECONDARY, QUIET pass through; a card with no primary action is valid). `CalmReceipt` stays a separate positional-style exception | **Approved and implemented** (§8) |
| **R2** (narrowed) | A seasonal-specific pure lead helper shared by the winter plan and the recorded seasonal checklist, naming the leading tasks. Home Habit Coach unchanged. No generic helper | **Approved as narrowed and implemented** (§8) |
| **R3** | Hiring guide: reorder the lead three, then `initialVisibleCount: 3`; continuation only if it launches a registered relevant capability. Monthly routine: no disclosure. Renovation: "Other open items" only, initial five; the 20-delivered truncation is separate | **Decided, not implemented**; a separately approved content increment |
| **R4** | Plan-layout disclosure stays local; persisted `ResultView.visibleCounts` assumes a floor of five and record-list behavior, and unifying would need hydration-validation and reconciliation changes, a precedence rule between producer defaults and saved user state, old view-state checks, and a persistence-scope decision (per result, session or execution), with no demonstrated homeowner problem | **Approved** (record only) |

Phase 2 closes with **no new contract**: after R1 and the narrowed seasonal wording fix, no schema change beyond Phase 1's `initialVisibleCount` is required.

## 6. Adversarial pass

Claims of the form "no second producer", "not justified", "no contract needed" were checked against a falsifying scenario:

- *"No consumer needs a personalization state."* Falsifier: a client or validator branch on boundary text or id for personalization. Found only the id-set `SEASONAL_ABOUT_BLOCK_IDS` (rendering, not state) and the absence-claim regex in the trust validator (unrelated to personalization) [Code-traced]. Holds, scoped to `apps/frontend/src` and `backend/src/services/ask`.
- *"Only one routine producer has an emergency block."* Falsifier: another producer with emergency wording at a lower severity. Search for `smell gas|call 911|evacuat` over `services/ask` and `services/skills` found only `miscHandlers.handler.ts` and `homeBasicsGuide.ts`. Limited to those directories; not claimed beyond.
- *"Honoring declared style leaves habits, seasonal checklist and the setup-enabled plan unchanged."* Falsifier: a producer whose first `*-next` action is declared non-primary. Read all four producers' declarations (§3.3 table). Holds [Code-traced]; not yet executed against R1.
- *"The two disclosure mechanisms cannot be merged by one line."* Falsifier: a path that lets a declared count below 5 survive reconciliation. `reconcileResultView` clamps to `Math.max(5, ...)` and the hydrator filters below 5 [Code-traced].

Absolute-language grep over this document (`never|always|none|zero|nothing|fully|completely|entirely|invisible|impossible|cannot|can't|structurally|does not exist`) reviewed; each hit is scoped to a named file or search above.

## 7. Validation run

- Reading and `grep` across `apps/backend/src/services/ask`, `services/skills`, `apps/frontend/src/components/ask` and `features/ask` [Code-traced].
- One throwaway jest render of `SeasonalNextSteps` (file created and deleted in the same step; `git status` clean of it) [Executed].
- No code, schema, test or fixture changed. No browser, Playwright, service or database.

## 8. Implementation and validation (R1 and narrowed R2, October 6, 2026)

**Changed**

- `apps/frontend/src/components/ask/SeasonalAnswerCards.tsx`: `SeasonalNextSteps` passes each action through unchanged (no position-based style).
- `apps/backend/src/services/ask/support/seasonalHomeCare.ts`: new exported `seasonalLeadSentence` (seasonal-specific; names up to three leading tasks, counts the rest, paces them; falls back to "…is listed first" when a leading title looks like an internal key); the winter plan now uses it.
- `apps/backend/src/services/ask/askSeasonalMaintenance.ts`: the recorded checklist's lead sentence uses the same helper with the urgent tasks' titles (urgent = `CRITICAL` and `PENDING`, as before). Output for the first test case: "These tasks come from the Summer 2026 checklist. The one thing that matters most is “Service air conditioner”. Do that soon; the other 1 can wait until you have time."
- Tests: `seasonalNextSteps.test.tsx` (new), additions to `askSeasonalMaintenance.test.js`. The Playwright fixture strings for the seasonal plan, its boundary and the checklist summary were brought in line with the new copy (not run).
- Home Habit Coach: unchanged.

**Behavior change in R1.** Habits, the recorded checklist and the setup-enabled plan declare `PRIMARY` on their first action, so they render as before (component-tested with that shape). `home-basics-next` and the no-setup plan now show no filled button, matching what their producers declared. `ActionLink` renders `QUIET` like `SECONDARY` (existing behavior); R1 only stops overriding it.

**Validation run**

| Check | Result | Kind |
| --- | --- | --- |
| Backend `node --test` on the seasonal, maintenance, habit, checklist-layout, Phase 1 and startup-registry suites | 141 pass, 0 fail | Executed |
| Backend `node --test` on the seasonal/maintenance suites plus `askTrustArchitecture` | 78 pass, 0 fail (includes the code-like-title guard) | Executed |
| Backend `npm run typecheck` | clean | Executed |
| Frontend `jest src/components/ask src/features/ask` | 578 pass, 5 fail: the same `maintenanceShelves` (4) and `displayPatterns` (1) failures that exist without this work | Component-tested |
| Frontend `next build` | compiled successfully | Static |

**Not run:** Playwright, browser, services, database. Pixel-level appearance of the unfilled next-steps cards is unverified.
