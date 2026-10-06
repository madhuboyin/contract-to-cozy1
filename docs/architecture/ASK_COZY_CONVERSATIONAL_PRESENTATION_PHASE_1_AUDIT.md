# Ask Cozy — Conversational Presentation, Phase 1 Pre-Edit Audit

**Date:** October 6, 2026
**Status:** Pre-edit findings. No code has been changed. Implementation status and validation are appended after the code work.
**Plan:** [`ASK_COZY_CONVERSATIONAL_PRESENTATION_IMPLEMENTATION_PLAN.md`](ASK_COZY_CONVERSATIONAL_PRESENTATION_IMPLEMENTATION_PLAN.md)
**Requirements authority:** `docs/product/ASK_COZY_INLINE_WORKSPACE_FRD.md` v1.184, Appendix C.11 (C.11.4–C.11.9)
**Method:** `AUDIT_METHODOLOGY.md`. Every claim carries one label:

- **[Executed]** — the code was run and the output observed (command in §1).
- **[Code-traced]** — source read, not run. Applies to all rendering, all pipeline behavior that needs a database, and anything about the browser.
- **[Inferred]** — extrapolation; none relied on for a conclusion below.

No browser, service, database, Docker or Playwright run was made (plan §8). Desktop/narrow-width layout is **runtime-unverified** throughout.

## 1. What was executed

The three producers are pure functions. They were run directly through `ts-node` (transpile-only) from a scratch script outside the repository, with a fixed clock (`2027-01-15`) and the zips below:

```text
buildSeasonalHomeCareResult({ zipCode, now, focus: 'THIS_SEASON', setup: { canSetUp: true, checklist: null } })
buildSeasonalTaskWalkthrough({ ..., taskKey: 'WINTER_FURNACE_FILTER_CHANGE' })
buildHomeBasicsResult('SAFETY_BASICS')
```

Results [Executed]:

| Scenario | Output |
| --- | --- |
| Winter plan, zip 606 (moderate) | blocks `SUMMARY → GROUPED_LIST → BOUNDARY → SUMMARY(next)`; "Do these soon" = furnace filter, GFCI test, smoke/CO test; "Can wait" = humidity check, sink leak check; actions `seasonal-add-tasks`(PRIMARY), `seasonal-walkthrough`, `seasonal-update-home-details`; `suggestions: []`; **0** typed next-action candidates |
| Winter plan, zip 554 | `ZIP_PREFIX` has no mapping, so the answer uses the national default ("moderate") and says so in the summary |
| Winter plan, zip 331 (tropical) | 4 tasks (2 soon, 2 can wait) |
| Furnace-filter walkthrough | one `TASK_GUIDE`; eyebrow `["Winter prep","Task 1 of 5"]`; actions `seasonal-next-task`(**PRIMARY**), `seasonal-add-tasks`, `seasonal-back-to-plan`, `seasonal-update-home-details`; notes `why`, `personalized`; `main.body` is the template's single description; **0** candidates |
| Home-safety basics | blocks `SUMMARY → GROUPED_LIST(1 section, 6 items) → BOUNDARY(INFO)`; **0** block actions on all three blocks; `suggestions: []`; **0** candidates |

A side observation from the same run: on Dec 5 the "current season" resolved to **fall**, not winter, so "this season" on a December date is the astronomical window. That is existing behavior and not changed here.

## 2. Scenario traces

### 2.1 Winter preparation

- **Route [Code-traced]:** `SEASONAL_HOME_CARE` is a launch-only, non-routable operation (`askOperationRegistry.ts:505`) reached by the stored starter message. Handler `seasonalHomeCare.handler.ts` loads zip, saved climate region, onboarding and owner/checklist state, then calls `buildSeasonalHomeCareResult` (`support/seasonalHomeCare.ts`).
- **Semantic sources [Code-traced]:** grouping and order come from the catalog template's `priority` (`CRITICAL` → "Do these soon", everything else → "Can wait"); ties break alphabetically by `taskKey`. Personalization state comes from `aboutBoundary()` (a fixed statement) and `regionNoteFor` (saved / zip / national default). No home data is read.
- **Renderer [Code-traced]:** `GroupedListBlock` returns `SeasonalPlanResultList` early for `seasonal-home-care-tasks` (`GroupedListBlock.tsx:327`), **before** the generic Auto/List/Cards switch (`:175–188`). Tasks start collapsed; facts open behind "How to do it" / "What to know" with `aria-expanded`.
- **Actions [Code-traced]:** `seasonal-add-tasks` (offered only to an owner of an existing home with automatic checklists on) launches `SEASONAL_CHECKLIST_SETUP`, which owns confirmation; `seasonal-walkthrough`, `seasonal-update-home-details` are conversational starts; nothing is written by the plan itself. They live in the `seasonal-home-care-next` summary, not in response-level suggestions.
- **Response-level suggestions [Code-traced]:** the builder returns `suggestions: []` and no `suggestedNextActionCandidates`. The finalizer therefore has only the four curated-starter producers to nominate (`suggestedNextActionProducers.ts:44-51`, wired by commit `252f1efd`); selection, rotation and presentation-duplicate suppression need a database and were not run. What survives is unknown, but anything that does is a `CURATED_STARTER` (generic discovery) action, and the policy takes `CONTINUE_WORK/URGENT_WORK/EXACT_RECORD` and opportunity classes ahead of starters (`suggestedNextActionExactFourPolicy.ts`).
- **Existing tests:** backend `seasonalHomeCareOperation.test.js`, `seasonalHomeCareEmptyHome.test.js`, `seasonalStarterCandidates.test.js`, `askSeasonalMaintenance.test.js`; frontend `seasonalPlan.test.tsx`, `checklistPlanLayout.test.tsx`; e2e `seasonalPlan.spec.ts` with a pasted real-builder fixture (`e2e/ask/fixtures.ts`). e2e not run.

### 2.2 Furnace-filter guidance

- **Route [Code-traced]:** the same operation. "Walk me through" launches `SEASONAL_HOME_CARE` with `entityType: SEASONAL_TASK` and `entityId: <FOCUS>:<taskKey>`; the handler parses it and calls `buildSeasonalTaskWalkthrough`. Template: `WINTER_FURNACE_FILTER_CHANGE` (`CRITICAL`, DIY, `timingOffsetDays` before the season).
- **Content [Executed]:** one `TASK_GUIDE` whose `main.body` is the template's single `description`. No steps, no progress state — the content is consistent with C.11.8.
- **Renderer [Code-traced]:** `TaskGuideBlock.tsx` renders the eyebrow as a breadcrumb `nav`, summary, chips, "What to do", two notes and the footer actions. The footer **re-styles by position**: `index === 0 ? 'PRIMARY' : 'SECONDARY'` (`TaskGuideBlock.tsx`), so the producer's first action is always the dominant button regardless of its declared `style`.
- **Existing tests:** `taskGuide.test.tsx` (breadcrumb/chips, row-vs-footer actions, tip/history), `askSeasonalMaintenance`/`seasonalHomeCareOperation` walkthrough chain test.

### 2.3 Home-safety basics

- **Route [Code-traced]:** `HOME_BASICS_GUIDE`, launch-only (`registerCapabilityHandler('home-basics.guide', …)`), builder `support/homeBasicsGuide.ts`. Pure and data-independent by design: it reads no home data. The initial hypothesis that a home-basics component or documented block id might not be the producer was checked: there is no other producer for "What home safety basics should I know?" — the message is the stored starter `HOME_BASICS_SAFETY_MESSAGE` and `homeBasicsFocus` selects `SAFETY_BASICS` for any message that does not mention a month.
- **Content [Executed]:** six authored items, one section "Know these first", equal weight, no priority, no `detail`, no `meta`, no actions. The gas item reads "If you have gas service, know where the shutoff is. If you ever smell gas, leave the home and call your gas utility or emergency number from outside." The only boundary is `INFO` "General guidance".
- **Renderer [Code-traced]:** `home-basics-items` is in `PLAN_LAYOUT_BLOCK_IDS`, so it uses `SeasonalPlanResultList` with the "calm" palette. Because items carry no `detail`, the renderer has nothing to disclose: all six descriptions are always visible. `home-basics-summary` is not in `SEASONAL_INTRO_BLOCK_IDS`, so it renders as a generic summary.
- **Existing tests:** `homeBasicsGuide.test.js` (registration, executed content, "no claim about the home", starters), `checklistPlanLayout.test.tsx`.

## 3. Root causes: confirmed, narrowed or not reproduced

| # | Plan hypothesis | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | Responses do not lead with the answer or judgment | **Partly confirmed.** Winter leads with a fact ("Winter is the current season… based on this home's zip code") rather than a judgment about what the climate means for the home; the priority statement refers to tasks by position ("the first 3"). Home-safety leads with "A few things worth knowing about any home" and does not say which matter most. | [Executed] summary text; builder source |
| 2 | Grouped-list/table renderers give ordinary attributes too much weight | **Not reproduced for these three.** Plan-layout renders compact chips ("High priority · DIY") rather than per-attribute cards. Not a Phase 1 defect for these scenarios. | [Code-traced] `PlanTask` |
| 3 | View controls exposed from renderer capability | **Not reproduced for these three.** Plan-layout ids return before the switch (`GroupedListBlock.tsx:327` precedes the generic path at `:175`), so no Auto/List/Cards appears for winter or home-basics, and a `TASK_GUIDE` is not a `GROUPED_LIST`. The switch is still reachable for any other 5+ item list with no declared pattern; that is outside this task. | [Code-traced]; layout runtime-unverified |
| 4 | Continuation competes with generic discovery / unrelated next-task actions | **Confirmed in two forms.** (a) The furnace-filter guide's dominant action is "Next winter task", an unrelated task selected only by alphabetical `taskKey` order. (b) For all three scenarios no handler nominates contextual response-level candidates, so any response-level chip is a generic curated starter; home-basics has no continuation at all. | [Executed] actions/candidates; [Code-traced] policy |
| 5 | `TASK_GUIDE` read as a walkthrough | **Confirmed, narrowly.** The content is honest (one description), but "Task 1 of 5", "Next winter task" and the request "Walk me through" present list position and sequencing as if it were a progress state. | [Executed] eyebrow/actions |
| 6 | Personalization / "general guidance" reads as a system disclaimer | **Confirmed.** Winter: "These are general seasonal tasks… not an assessment of this home" is a stand-alone boundary after the list; home-basics: "This is general guidance, not an assessment of your home…". Both are accurate; neither tells the homeowner what would make the advice specific. | [Executed] text |

Additional findings not in the plan's hypotheses:

- **F7 — Emergency gas guidance has no emergency treatment.** It sits inside an ordinary list item's description, and the only boundary is `INFO`. FRD C.11.6/C.11.9 require an `EMERGENCY` boundary. [Executed] content, [Code-traced] severity.
- **F8 — Home-safety does not prioritize.** Six equal items in one section; the FRD requires "the few that matter most, remainder progressively". [Executed]
- **F9 — Stale timing in a current-season guide.** The furnace-filter guide says "Best done about 2 weeks before winter starts" while the user is in winter (`timingLabel` always speaks relative to season start). The description says "monthly". The two facts are the template's own, but the combined card reads inconsistent. [Executed] for 2027-01-15.
- **F10 — Two missing icons.** `seasonal-next-task` and `seasonal-back-to-plan` are absent from `ACTION_ICONS`. Cosmetic. [Code-traced]
- **F11 — Stale comment.** `starterCandidates.ts` header says "Not registered… nothing here is live"; the producers *are* registered and live (`suggestedNextActionProducers.ts`, commit `252f1efd`). Documentation-only. [Code-traced]
- **F12 — Climate mapping gap.** Zip prefix 554 is unmapped, so a Minneapolis-area zip answers as "moderate". The disclosure is honest (national default stated). Out of scope; recorded.

## 4. Constraints discovered that shape the implementation

1. **Boundary ids and action ids are allow-listed per operation** (`askAnswerTrustPolicy.ts` `OPERATION_BOUNDARIES` line 10–40, `OPERATION_ACTION_IDS` line 83+). A new boundary or action id on `SEASONAL_HOME_CARE` or `HOME_BASICS_GUIDE` is silently removed unless added there. Tests must go through `validateAskAnswerTrust`, not the schema alone. `HOME_BASICS_GUIDE` currently allows only `home-basics-boundary` and has no action allow-list entry.
2. **An `EMERGENCY` boundary changes the whole response's suggestion mode.** `resolveSuggestedNextActionMode` returns `SAFE_RECOVERY_ONLY` if *any* block is an `EMERGENCY` boundary (`finalizeSuggestedNextActions.ts:53`); eligibility then drops every non-recovery candidate (`suggestedNextActionEligibility.ts:134`), so starter chips would not be offered on a home-safety response that contains one. This is the repository's stated emergency policy, but it is a real side effect on an otherwise routine guide.
3. **`HOME_BASICS_GUIDE` allows only `SUMMARY`, `GROUPED_LIST`, `BOUNDARY`** (`askOperationRegistry.ts:504`). Any new block type, including `PRIORITY_LIST`, would need a registry change and the startup-registry validators. Reuse of existing blocks is sufficient (see §5).
4. **No canonical gas-service fact exists.** The Property Context fact catalog has `safety.hasSmokeDetectors`, `hasCoDetectors`, `hasFireExtinguisher`, `hasSecuritySystem`, `hasSumpPump…` and `systems.heatingType`, but no gas-service fact. `Property.primaryHeatingFuel` (free text, "For Utility Nudge") and `Property.gasProvider` (self-reported territory fact) exist on the schema but are not catalog facts, and neither proves the absence of gas service (a gas range or water heater can exist with electric heat). [Code-traced]

## 5. Pre-edit conclusions and planned edit set

Each item states the claim it satisfies and the smallest place to change it.

**Winter preparation (producer: `support/seasonalHomeCare.ts`)**
1. Lead the summary with a climate/season judgment in homeowner language and name the leading tasks instead of "the first 3". Judgment stays server-side; derived only from the template priority and the region already resolved.
2. Reword personalization so it says what the advice is based on (region, saved vs. mapped vs. default) and what would make it more specific, as part of the answer rather than a separate warning card. Keep it truthful: still general guidance, no home data.
3. Keep tasks, grouping, progressive disclosure and the confirm-before-persist action path unchanged.

**Furnace-filter guide (producer: `buildSeasonalTaskWalkthrough`; renderer: `TaskGuideBlock`)**
4. Remove the "Task N of M" progress implication from the eyebrow and stop making "Next task" the dominant action. Primary becomes the existing plan-level step when one applies (`seasonal-add-tasks` or `seasonal-show-checklist`), otherwise `seasonal-back-to-plan`; "Next task" stays available as secondary. Renderer honors the producer's declared `style` instead of re-styling by position (the producer already declares one PRIMARY).
5. Resolve F9: suppress or reword the "When" fact when its window has already passed for the current date, in the producer.
6. "Help for the current task" (C.11.9) has **no registered conversational capability** for a seasonal task today. This is recorded as a limitation, not invented in Phase 1.

**Home-safety basics (producer: `support/homeBasicsGuide.ts`)**
7. Lead with the few items that matter most (producer-declared grouping: a short first section and a "Also worth doing" section) with a one-line reason each, and give the remaining items progressive disclosure through the existing `detail` field and plan-layout toggle, with no new block type.
8. Give gas emergency guidance its own `EMERGENCY` boundary (new id added to `OPERATION_BOUNDARIES` and covered by a `validateAskAnswerTrust` test), accepting constraint §4.2.
9. Gas state: keep the conditional "if you have gas service" language and add an explicit "not sure" path (find your meter / bill); do **not** claim present/absent (§4.4).
10. Add contextual continuation actions (existing action contract, allow-listed): ask about the monthly routine and the winter/seasonal plan — both existing launch operations — so a response is not left with only generic starters.

**Cross-cutting**
11. Update the stale `starterCandidates.ts` header (F11) and add the two missing action icons (F10).
12. Do not change the exact-four policy, ranking, lifecycle, starter registry or the generic grouped-list switch.

## 6. Open items that need a decision

These are the only points where repository evidence does not settle the answer.

**D1 — "Known gas absence removes gas-specific recommendations" cannot be implemented in Phase 1.** No canonical gas-service fact exists (§4.4). Deriving "no gas" from `primaryHeatingFuel` would be an unsound inference, and capturing a new fact is Phase 4 scope (C.11.7, one question, governed capture). *Recommendation:* implement unknown-status wording now (item 9), leave present/absent for Phase 4 together with the decision on where gas service is recorded. Proceeding on this recommendation unless told otherwise.

**D2 — `EMERGENCY` boundary on a routine guide suppresses the whole response's starter chips (§4.2).** *Recommendation:* follow the FRD and accept it, since an emergency instruction should not be accompanied by discovery prompts; the contextual actions in item 10 live in blocks, not response-level suggestions, so they remain. If instead you want the starter chips preserved, the alternative is a `CAUTION` boundary, which contradicts C.11.9. Proceeding on the FRD unless told otherwise.

## 7. Adversarial pass (separate from the research pass)

Claims of the form "already exists / never / not reproduced" were checked against a falsifying scenario:

- *"No view controls on winter or home-basics."* Falsifier: a path that reaches `GenericGroupedListBlock` for those ids. Checked: both ids are in `PLAN_LAYOUT_BLOCK_IDS`; `GroupedListBlock` returns at `:327` before `:175`. Holds [Code-traced]. **Scoped** to these ids; not claimed for other lists.
- *"The furnace-filter guide has no multi-step claim."* Falsifier: any field naming steps. Checked: the `TASK_GUIDE` schema has `main`, `notes`, `history`; the producer sets one description and `history: []`. Holds for content; the eyebrow/actions are the only progress-like signals (cause 5).
- *"Starters are the only response-level suggestions."* Falsifier: another producer nominating for these operations. Checked: producers list is `resultCandidatesProducer` + four starters; the first returns `result.suggestedNextActionCandidates ?? []`, executed as empty. Holds. What actually survives selection is **not established**; stated as unknown above.
- *"An EMERGENCY boundary flips the mode."* Falsifier: a later check that resets it. Checked: the mode is computed once from `result.blocks` and read by eligibility and the exact-four exemption; no reset found [Code-traced].

Absolute-language grep over this document (`never|always|none|zero|nothing|fully|completely|entirely|invisible|impossible|cannot|can't|structurally|does not exist`) reviewed; each hit is scoped to a named file, id or run above.

## 8. Validation plan (no browser)

Producer tests first (judgment order, lead sentence, no persistence, gas wording, EMERGENCY boundary present and **retained by `validateAskAnswerTrust`**, allow-listed action ids, `HOME_BASICS_GUIDE` still within allowed block types), then component tests (primary action honors declared style, no progress eyebrow, disclosure `aria-expanded`, keyboard toggle), `npm run typecheck` for the backend, and `next build` for the frontend if dependencies are installed. Startup registry test (`startupRegistryValidation.test.js`) because allow-lists change. Desktop/narrow-width layout, real-browser behavior and the live pipeline selection remain **runtime-unverified**.
