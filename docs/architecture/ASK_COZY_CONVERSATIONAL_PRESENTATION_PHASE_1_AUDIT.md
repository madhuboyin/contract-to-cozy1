# Ask Cozy — Conversational Presentation, Phase 1 Pre-Edit Audit

**Date:** October 6, 2026
**Status:** Pre-edit findings, revised October 6, 2026 after review (revision 2: progressive-disclosure decision, furnace-guide primary action, ordering statement, exact ids, reproducible script). No code had been changed when this revision was written. Implementation status and validation are appended after the code work.
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

Reproducible scratch script (kept outside the repository; run with `node <script>.js`):

```js
process.chdir('<repo>/apps/backend');
require('<repo>/apps/backend/node_modules/ts-node').register({ transpileOnly: true, project: '<repo>/apps/backend/tsconfig.json' });
const R = '<repo>/apps/backend/src/services/ask/support/';
const { buildSeasonalHomeCareResult, buildSeasonalTaskWalkthrough } = require(R + 'seasonalHomeCare.ts');
const { buildHomeBasicsResult } = require(R + 'homeBasicsGuide.ts');
const now = new Date('2027-01-15T12:00:00Z');
for (const zip of ['60601', '55401', '33101']) {
  const r = buildSeasonalHomeCareResult({ zipCode: zip, now, focus: 'THIS_SEASON', setup: { canSetUp: true, checklist: null } });
  // print r.blocks types/ids, GROUPED_LIST section titles + item ids, last block actions (id + style),
  // r.suggestions and (r.suggestedNextActionCandidates || []).length
}
const w = buildSeasonalTaskWalkthrough({ zipCode: '60601', now, focus: 'THIS_SEASON', taskKey: 'WINTER_FURNACE_FILTER_CHANGE', setup: { canSetUp: true, checklist: null } });
// print w.blocks types, w.blocks[0].eyebrow, actions (id + style), notes ids, main
const h = buildHomeBasicsResult('SAFETY_BASICS');
// print block types/ids, item counts per section, per-block actions length, boundary severity, suggestions, candidates
```

(`ts-node` is used transpile-only because the default `tsconfig` module settings reject a bare `-e`/scratch compile; the repository's own tests use `require('ts-node/register')`.) Dec 5 returned the fall window, so January 15 was used for winter.

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
- **Semantic sources [Code-traced]:** grouping and order come from the catalog template's `priority` (`CRITICAL` → "Do these soon", everything else → "Can wait"); `taskKey` order only breaks ties within a priority tier. Personalization state comes from `aboutBoundary()` (a fixed statement) and `regionNoteFor` (saved / zip / national default). No home data is read.
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
| 4 | Continuation competes with generic discovery / unrelated next-task actions | **Confirmed in two forms.** (a) The furnace-filter guide's dominant action is "Next winter task", picked from the producer's priority ordering (`CRITICAL` first, `taskKey` only as the tie-breaker); it is not selected from the homeowner's current progress, so it is catalog sequence presented as if it were the next step of a walkthrough. (b) For all three scenarios no handler nominates contextual response-level candidates, so any response-level chip is a generic curated starter; home-basics has no continuation at all. | [Executed] actions/candidates; [Code-traced] policy |
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
4. Remove the "Task N of M" progress implication from the eyebrow and stop making "Next task" the dominant action. **Revised:** no current-task help capability exists (item 6), so promoting a different plan-level continuation (`seasonal-add-tasks`, `seasonal-show-checklist`, `seasonal-back-to-plan`) to primary would not satisfy "prioritize help for the current task" either. The honest Phase 1 behavior is a guide with **no primary-styled footer action**: the producer declares every footer action `SECONDARY` (next task, set up / show checklist, back to the plan, update home details). The renderer honors each action's declared `style` and no longer forces the first action to `PRIMARY`; a guide with no primary action is a supported, tested state. Other producers of `TASK_GUIDE` (home-habit review) must keep their current look, so they declare `PRIMARY` explicitly where they rely on the old position rule (to be verified against `homeHabitCoach.handler.ts` before the renderer change).
5. Resolve F9: suppress or reword the "When" fact when its window has already passed for the current date, in the producer.
6. "Help for the current task" (C.11.9) has **no registered conversational capability** for a seasonal task today. This is recorded as a limitation, not invented in Phase 1.

**Home-safety basics (producer: `support/homeBasicsGuide.ts`)**
7. Lead with the few items that matter most, with a one-line reason each, and **truly** reveal the rest progressively. The existing plan renderer shows every item in every section; `detail` only hides one item's extra facts, so it would not hide the fourth through sixth recommendation. **Decision (option 1):** add one small additive, optional field to the existing grouped-list section contract, `initialVisibleCount` (positive integer): the producer declares how many items of that section are visible initially, the renderer only implements local expand/collapse ("Show N more" / "Show fewer", a button with `aria-expanded` and `aria-controls`; no Ask execution, no persisted state, items still in the DOM only when expanded). The renderer reads the field only; it does not special-case `home-basics-items`, infer hidden items from titles or section names, or hide anything when the field is absent. Consumers that ignore the field show every item (old stored executions stay lossless). The home-safety producer uses one section "Know these first" with `initialVisibleCount: 3` ordered by importance, and the remaining three items follow in the same section. Contract change: `ask.contract.ts` section schema + frontend `types.ts` section type; no block type, no registry change, no persisted-mode change. The winter plan does not use it in Phase 1.
8. Give the gas emergency instruction its own `EMERGENCY` boundary: **id `home-basics-gas-emergency`**, title "If you smell gas", body "Leave the home right away. Do not turn lights or appliances on or off, and do not use a phone inside. Call your gas utility or emergency number from outside.", added to `OPERATION_BOUNDARIES.HOME_BASICS_GUIDE` alongside `home-basics-boundary`. It is understandable without color (title and text state the severity; renderer already uses an alert icon and a heading, and color is only reinforcement). It appears on the safety guide only. Accepting constraint §4.2.
9. Gas state: keep conditional language, and make the unknown path informational: the gas item says how to find out whether the home has gas service (a gas meter or a gas bill; ask your utility or landlord). It is plain guidance text with no action, no capture and no wording that reads like a recorded assessment answer. Present/absent is not claimed (D1, approved).
10. Contextual block actions for home-basics, in a new `SUMMARY` block **`home-basics-next`** (added to `SEASONAL_NEXT_STEPS_BLOCK_IDS`, the existing id-set pattern; the block is already an allowed type). Action ids, all `START_WORKFLOW`, added to `OPERATION_ACTION_IDS.HOME_BASICS_GUIDE`: **`home-basics-monthly-routine`** (message `HOME_BASICS_MONTHLY_MESSAGE`, operation `HOME_BASICS_GUIDE`), **`home-basics-seasonal-plan`** (message `SEASONAL_HOME_CARE_THIS_SEASON_MESSAGE`, operation `SEASONAL_HOME_CARE`), and on the monthly guide **`home-basics-safety-basics`** (message `HOME_BASICS_SAFETY_MESSAGE`). None begins with a mutation verb, so none needs an owner-role gate.

**Cross-cutting**
11. Update the stale `starterCandidates.ts` header (F11) and add the two missing action icons (F10).
12. Do not change the exact-four policy, ranking, lifecycle, starter registry or the generic grouped-list view switch. The only contract change is the optional section field in item 7.

## 6. Decisions

Both decisions below were **approved on review (October 6, 2026)**; they are recorded here as settled, not open.

**D1 — "Known gas absence removes gas-specific recommendations" cannot be implemented in Phase 1.** No canonical gas-service fact exists (§4.4). Deriving "no gas" from `primaryHeatingFuel` would be an unsound inference, and capturing a new fact is Phase 4 scope (C.11.7, one question, governed capture). *Recommendation:* implement unknown-status wording now (item 9), leave present/absent for Phase 4 together with the decision on where gas service is recorded. **Approved.** Phase 1 uses conditional language and an informational "how to find out" path, records nothing, and leaves capture and present/absent personalization to Phase 4.

**D2 — `EMERGENCY` boundary on a routine guide suppresses the whole response's starter chips (§4.2).** *Recommendation:* follow the FRD and accept it, since an emergency instruction should not be accompanied by discovery prompts; the contextual actions in item 10 live in blocks, not response-level suggestions, so they remain. If instead you want the starter chips preserved, the alternative is a `CAUTION` boundary, which contradicts C.11.9. **Approved.** Not downgraded to `CAUTION`.

## 7. Adversarial pass (separate from the research pass)

Claims of the form "already exists / never / not reproduced" were checked against a falsifying scenario:

- *"No view controls on winter or home-basics."* Falsifier: a path that reaches `GenericGroupedListBlock` for those ids. Checked: both ids are in `PLAN_LAYOUT_BLOCK_IDS`; `GroupedListBlock` returns at `:327` before `:175`. Holds [Code-traced]. **Scoped** to these ids; not claimed for other lists.
- *"The furnace-filter guide has no multi-step claim."* Falsifier: any field naming steps. Checked: the `TASK_GUIDE` schema has `main`, `notes`, `history`; the producer sets one description and `history: []`. Holds for content; the eyebrow/actions are the only progress-like signals (cause 5).
- *"Starters are the only response-level suggestions."* Falsifier: another producer nominating for these operations. Checked: producers list is `resultCandidatesProducer` + four starters; the first returns `result.suggestedNextActionCandidates ?? []`, executed as empty. Holds. What actually survives selection is **not established**; stated as unknown above.
- *"An EMERGENCY boundary flips the mode."* Falsifier: a later check that resets it. Checked: the mode is computed once from `result.blocks` and read by eligibility and the exact-four exemption; no reset found [Code-traced].

Absolute-language grep over this document (`never|always|none|zero|nothing|fully|completely|entirely|invisible|impossible|cannot|can't|structurally|does not exist`) reviewed; each hit is scoped to a named file, id or run above.

## 8. Validation plan (no browser)

The FRD's earlier Playwright and fixture-build history is **historical evidence only**; Phase 1 does not run Playwright, start services, or build a fixture app.

Producer tests first:

- winter: lead sentence is a climate/season judgment; leading tasks named; no persistence before confirmation (`seasonal-add-tasks` still launches `SEASONAL_CHECKLIST_SETUP`); personalization wording states the basis;
- furnace guide: no "Task N of M" in the eyebrow; every footer action declared `SECONDARY`; stale "When" fact corrected;
- home-safety: items ordered by importance, section declares `initialVisibleCount: 3`, conditional unknown-gas wording present, no present/absent claim, emergency boundary id `home-basics-gas-emergency` with `severity: 'EMERGENCY'`;
- **trust validator:** run the home-safety result through `validateAskAnswerTrust` and assert the emergency boundary and the three action ids survive, with the allow-lists extended and, as a negative control, that an unlisted id is stripped;
- **suggestion mode:** assert `resolveSuggestedNextActionMode` returns `SAFE_RECOVERY_ONLY` for the real home-safety result (the "ordinary response containing the conditional emergency instruction" case), that the monthly guide (no emergency block) stays `NORMAL`, and, with injected collaborators in the finalizer test seam, that no starter or promotional candidate survives in `SAFE_RECOVERY_ONLY` while the block-level actions remain on the result;
- `HOME_BASICS_GUIDE` still within allowed block types; startup registry validators (`startupRegistryValidation.test.js`) because allow-lists change.

Component tests: `TASK_GUIDE` honors declared styles and renders a guide with no primary action; the section disclosure control (initial visible count, "Show N more"/"Show fewer", `aria-expanded`/`aria-controls`, keyboard activation, field absent = everything shown, hidden items not in the DOM); emergency boundary readable without color (title/text carry the severity).

Static: backend `npm run typecheck`; frontend `next build` if dependencies are installed. Desktop/narrow-width layout, real-browser behavior and live pipeline selection remain **runtime-unverified**.

## 9. Implementation and validation (Phase 1, October 6, 2026)

### 9.1 What changed

| File | Change |
| --- | --- |
| `apps/backend/src/services/ask/support/seasonalHomeCare.ts` | Winter summary leads with the judgment (the tasks that matter most, named, then pacing), basis and region follow; boundary rewritten as context (basis, what is not used, what would change that); walkthrough eyebrow is `["<Season> prep"]` only; every walkthrough footer action is `SECONDARY` and "Next winter task" became "Another winter task"; `timingFact` says "now is a good time" once the template's window has passed (plan and guide) |
| `apps/backend/src/services/ask/support/homeBasicsGuide.ts` | Safety guide ordered by importance with `initialVisibleCount: 3`; conditional, informational gas wording; `home-basics-gas-emergency` `EMERGENCY` boundary (safety guide only); `home-basics-next` summary with continuations; INFO boundary reworded |
| `apps/backend/src/services/ask/askAnswerTrustPolicy.ts` | `OPERATION_BOUNDARIES.HOME_BASICS_GUIDE` += `home-basics-gas-emergency`; new `OPERATION_ACTION_IDS.HOME_BASICS_GUIDE` = `home-basics-monthly-routine`, `home-basics-safety-basics`, `home-basics-seasonal-plan` |
| `apps/backend/src/productFramework/ask/ask.contract.ts` | Grouped-list section: optional `initialVisibleCount` (positive int) |
| `apps/backend/src/services/ask/suggestedActions/starterCandidates.ts` | Stale "not live" header corrected (F11), comment only |
| `apps/frontend/src/features/ask/types.ts` | Section type gains `initialVisibleCount?` |
| `apps/frontend/src/components/ask/SeasonalPlanResultList.tsx` | `PlanSection` shows the first `initialVisibleCount` items and a "Show N more" / "Show fewer" button (`aria-expanded`, `aria-controls`); no id or title inference; field absent or covering every item = no control |
| `apps/frontend/src/components/ask/TaskGuideBlock.tsx` | Footer actions keep their declared `style`; no longer forced to `PRIMARY` by position |
| `apps/frontend/src/components/ask/SeasonalAnswerCards.tsx` | `home-basics-next` added to the next-steps id set; icons for `seasonal-next-task`, `seasonal-back-to-plan` (F10) |
| Tests / fixtures | `conversationalPresentationPhase1.test.js` (new), `homeBasicsPresentation.test.tsx` (new), updated `homeBasicsGuide`, `seasonalHomeCare*`, `taskGuide`, `checklistPlanLayout`; Playwright fixture and spec text synced (not run) |

The home-habit review `TASK_GUIDE` producer already declares `PRIMARY` on its first action and `SECONDARY` on the back action, so the renderer change does not alter it [Code-traced, and `homeHabitsPlan.test.tsx` passes]. Old stored executions keep whatever style they declared; the old walkthrough stored `seasonal-next-task` as `PRIMARY` and still renders that way.

### 9.2 Before and after, executed (fixed clock 2027-01-15)

**Winter plan, zip 606.** Before: "Winter is the current season for your area. This is based on this home's zip code (a moderate climate). Here are 5 things to focus on. I recommend doing the first 3 soon, and the other 2 when you have time." After: leads with "The 3 things that matter most this winter are “Replace furnace filters monthly”, “Test GFCI outlets” and “Test smoke and carbon monoxide detectors”. Do those soon; the other 2 can wait until you have time." and then the season and basis. Grouping, per-item progressive detail and the confirm-before-persist `seasonal-add-tasks` path are unchanged.

**Furnace-filter guide.** Before: eyebrow `["Winter prep","Task 1 of 5"]`, `seasonal-next-task` PRIMARY, "Best done about 2 weeks before winter starts" in January. After: eyebrow `["Winter prep"]`; four footer actions all `SECONDARY` (no filled button); In-season timing reads "...; if you have not yet, now is a good time". Content is still the template's one description.

**Home-safety basics.** Before: `SUMMARY → GROUPED_LIST(6 equal items) → BOUNDARY(INFO)`, no actions. After: `SUMMARY → GROUPED_LIST(3 shown, 3 behind "Show 3 more") → BOUNDARY(EMERGENCY "If you smell gas") → SUMMARY(next: monthly routine, seasonal plan) → BOUNDARY(INFO)`. The monthly guide gains the next-steps block (safety basics, seasonal plan) and no emergency boundary.

### 9.3 Validation actually run

| Check | Result | Kind |
| --- | --- | --- |
| `node --test` on `conversationalPresentationPhase1`, `homeBasicsGuide`, `seasonalHomeCareEmptyHome`, `seasonalHomeCareOperation`, `seasonalStarterCandidates`, `askSeasonalMaintenance`, `seasonalChecklistSetup` | 62 pass, 0 fail | Executed |
| `node --test` on `checklistPlanLayout`, `askTrustArchitecture`, `askInteractionCoverageMatrix`, `exactFourActivation`, `exactFourStarterPoolMeasurement`, `hiringGuide`, `startupRegistryValidation`, home-habit tests | 93 pass, 0 fail | Executed |
| Backend `npm run typecheck` | clean | Executed |
| Frontend `jest` on the four plan/guide suites plus `homeBasicsPresentation` | 27 pass | Component-tested |
| Frontend `jest src/components/ask src/features/ask` | 574 pass, 5 fail: `maintenanceShelves.test.tsx` (4) and `displayPatterns.test.tsx` (1). Both fail identically with this work stashed (tracked changes), so they pre-date it and are unrelated (maintenance shelves, room map) | Component-tested |
| Frontend `next build` | compiled and generated routes | Static |
| `validateAskAnswerTrust` on both guides | emergency boundary and all continuation ids retained; an unlisted id stripped | Executed |
| `resolveSuggestedNextActionMode` and the finalizer with the real starter producers | safety guide is `SAFE_RECOVERY_ONLY` with zero response-level suggestions and its block actions intact; the monthly guide (control) stays `NORMAL` and does offer starters | Executed (injected collaborators, no database) |

### 9.4 Not run, and remaining limitations

- No Playwright, browser, service, database or Docker run (plan §8). The FRD's earlier Playwright history is historical evidence only. Desktop and narrow-width layout, focus behavior in a real browser, and non-color perceptibility are **runtime-unverified**; the component tests establish structure, ARIA state and text, not pixels.
- The live finalizer's selection against a real database (lifecycle, rotation, dismissals) is not exercised; the mode logic and the injected-collaborator run are.
- **Help for the current task** (C.11.9) has no registered capability; the furnace guide therefore shows no primary action rather than a plan-level one pretending to be it. Stateful walkthrough, step help and persistent assessment remain Phase 3/4.
- **Gas present/absent** is not modeled (no canonical fact); unknown/conditional wording only. Phase 4.
- ZIP prefix 554 still resolves to the national default (disclosed in the answer); not repaired here.
- `SeasonalNextSteps` still styles its first action `PRIMARY` by position (`seasonal-home-care-next`, `home-basics-next`); not changed because those cards present a recommended next step rather than a guide.
- The seasonal-plan boundary id and the `EMERGENCY` mode behavior apply to this one operation only; no generic policy change (Phase 2 inventory below).

### 9.5 Local special cases introduced (Phase 2 input)

1. `initialVisibleCount` on a grouped-list section (generic, one producer so far).
2. `home-basics-next` registered in the id-set `SEASONAL_NEXT_STEPS_BLOCK_IDS` (id-based, existing pattern).
3. The guide-with-no-primary-action convention (declared `SECONDARY`), generic through the renderer, used by one producer.
4. `timingFact` (seasonal only).
