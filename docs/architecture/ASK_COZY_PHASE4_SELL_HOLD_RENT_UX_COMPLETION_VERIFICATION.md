# Ask Cozy Cross-Domain Interaction Rollout — Phase 4 Sell/Hold/Rent Persistent-Decision UX Completion Verification

**Status:** Complete — the 6 scenarios Phase 4's own exit criterion names, evaluated specifically against the sell/hold/rent family. **G04's gap identified below has since been fixed** (see the update note at the end of the G04 section and the summary table). **D05 revised 2026-09-17 after external review found it inconsistent with the identical scoring call made in the Phase 7 Decisions document.**
**Verdict: 6 of 6 pass.** D05 was previously partial because the analysis had durable thread identity but no result-view identity. The 2026-10-22 completion pass now carries a stable result id across horizon continuations and uses the shared bounded result-view store for comparison selection, layout and scroll restoration.
**Governs:** [Ask Cozy — Cross-Domain Interaction Rollout FRD](../product/ASK_COZY_CROSS_DOMAIN_INTERACTION_ROLLOUT_FRD.md) §21 Phase 4's exit criterion verbatim: "the relevant D01/D05/D07 and G02/G04/G07 scenarios pass for sell/hold/rent at the level claimed; live model/browser limitations remain explicit."
**Builds on:** the FRD §22 decision work already completed and pushed this engagement (commit `197e5645`, Option B: `SELL_HOLD_RENT_ANALYSIS` reads but never creates/resumes a thread), the Phase 0 audit's §4.6/§4.8 tracing of `SELL_HOLD_RENT_ANALYSIS`/`SELL_HOLD_RENT_GOAL_CAPTURE`, and the Phase 7 Decisions document's D01/D02/D05/D07 findings for the *HVAC* family — this document evaluates the same scenario IDs against a structurally different family (snapshot-based, not composed-from-facts) and does not assume the HVAC verdicts transfer, except where (as with D05) the two families share the exact same absence and the same scoring standard should apply.
**Verification level: STATIC.** Every claim below is derived from direct reads of `sellHoldRentAnalysisResult`, `processGoalCandidate`, `buildSellerPrepInlineBlock`, `createSnapshotDecisionFamilyAdapter` (`snapshotDecisionFamilyAdapter.ts`), `domainSnapshotAdapters.ts`'s `sellHoldRentDecisionFamilyAdapter`, and `askFollowUpContext.ts`. Nothing here is database- or browser-verified — this is exactly the "live model/browser limitations remain explicit" disclosure the exit criterion itself asks for.

## Modernized analysis presentation (2026-10-21)

The standard Ask analysis now exposes more of the canonical `SellHoldRentDTO` without copying the desktop page into the conversation. The first block names the model lead, modeled outcome, confidence and horizon; the comparison shows the principal economics for all three paths and badges only the server-declared lead. A compact drivers section, an accessible full annual projection, source-aware inputs, and governed 5/10-year switching follow. Two ephemeral what-if prompts make the existing no-save scenario path discoverable. When a durable decision thread exists, its lifecycle and freshness are summarized in a dedicated compact region instead of repeating separate generic plan and "Why now" cards.

### Second-pass governed controls (2026-10-22)

The analysis now exposes the canonical write workflows without turning the answer into a copy of the desktop page:

- contributors and owners can edit the seven scenario assumptions exposed by the desktop tool; the form writes the existing `ToolOverride` contract only after an exact before/after confirmation, and can explicitly clear the saved scenario settings back to model defaults;
- owners can open the existing owner-only financing-profile editor from the inputs table, so mortgage and purchase facts keep their stricter authorization, validation, history and redacted receipt rather than being duplicated in the Sell / Hold / Rent handler;
- contributors and owners can start or stop the property-scoped `SELL_HOLD_RENT` decision thread after confirmation. Start uses the canonical snapshot adapter's create-or-resume path and stop uses the canonical optimistic-versioned abandon transition;
- both assumption and plan confirmations re-read a deterministic context fingerprint and refuse a stale proposal. Successful writes reconcile the originating `SELL_HOLD_RENT_ANALYSIS` answer.

The comparison still does not choose a final disposition or perform any external sale, rental, listing, financing or advisory action. It remains planning support rather than financial, tax, legal or valuation advice.

### Governed editor modernization (2026-10-23)

The two write surfaces launched from the comparison now use a dedicated, neutral Ask workspace treatment instead of the generic blue capture card. Both show whether the homeowner has changed anything, provide a governed **Back to comparison** cancellation path, preserve space above the fixed composer, and retain the existing exact before/after confirmation and context-version recheck.

- Scenario assumptions remain one compact surface, organized as property/rent, growth, and selling/rental-cost concepts. Each field identifies whether it is a saved override or will fall back to the model default. Resetting all seven overrides is presented as an explicit “Reset all to model defaults” choice rather than an ordinary ambiguous keep/clear question. Its financial acknowledgement now states accurately that these are planning settings and do not change the Home Record.
- Financing is a three-step editor: purchase and mortgage status, primary mortgage, then additional loans and costs. Mortgage-only inputs are hidden when the home has no mortgage, and second-mortgage balance is shown only when a second mortgage applies. The workflow remains owner-only and continues to use the canonical financing-profile writer and redacted receipt.

### Command governance correction (2026-10-22)

`SELL_HOLD_RENT_COMMAND` is owned by the existing `sell-hold-rent` Skill rather than exempted as an ungoverned internal command. The operation is property-scoped with a contributor floor and uses the registered `sell-hold-rent.command` mutation-preparation adapter. The Skill declares both read and write effects, partial reversibility, the command's workflow/limitation result blocks, its operation-contract dependency, and ASK consumer/evaluation coverage. Confirmation receipts, context-version rechecks, and the operation-level contributor requirement remain authoritative. Startup registry validation now verifies this ownership and the command is deliberately absent from `KNOWN_UNGOVERNED_OPERATIONS`.

### Completion pass (2026-10-22)

- every editable scenario assumption is visible in the read-only Inputs used table;
- the annual projection uses every modeled year in an accessible compact Hold-versus-Rent chart, with the complete values available as a disclosure table;
- an active thread has a dedicated Tracked decision region for lifecycle, freshness, last update and next action;
- `SELL_HOLD_RENT_ANALYSIS` now carries the same result id across declared horizon continuations. The shared result-view store restores comparison layout, selected scenario and scroll offset, rather than treating every refreshed horizon as an unrelated result;
- focused component and acceptance fixtures cover the modernized comparison, projection, inputs, governed actions and remount continuity.

| Field | Status |
| --- | --- |
| Audit coverage | Complete — all 6 named scenarios (D01/D05/D07, G02/G04/G07) evaluated |
| Static (code-read) acceptance | 6 pass |
| Runtime/browser acceptance | Not evaluated this session — no live database or browser exercised |
| Phase 4 exit criterion | **Met statically** — all six named scenarios pass; environment-independent UI coverage is included |

## Why these 6 scenarios, mapped this way

Phase 4's exit criterion names D01, D05, D07 (from §13.3's Decisions-and-projects table) and G02, G04, G07 (from §15.3's Persistent-goals table) as the scenarios that must pass "for sell/hold/rent" specifically. D01 and D05's literal text already names sell/hold/rent or applies generically to any decision workspace. D07's literal text ("Seller-prep item changes in another session") is nominally about the separate `SELLER_PREP_CHECKLIST`/`SELLER_PREP_ITEM_DECISION` operations, already verified independently in the Phase 7 Decisions document — but `SELL_HOLD_RENT_GOAL_CAPTURE`'s own response embeds a seller-prep preview block (`buildSellerPrepInlineBlock`), so Phase 4 evaluating D07 "for sell/hold/rent" is read here as: does that embedded preview behave honestly with respect to staleness, not as a demand that sell/hold/rent duplicate seller-prep's own item-mutation logic.

## D01 — Start and later resume a sell/hold/rent decision

**Required:** "Same durable thread; current assumptions/evidence loaded."

**Verdict: PASS — stronger than the equivalent HVAC finding in the Phase 7 Decisions document.**

*Same durable thread*: `processGoalCandidate` calls `sellHoldRentDecisionFamilyAdapter.createOrResumeThread`, which calls `selectThread` first and only falls through to `createThread` on `NONE` — confirmed by direct read of `createSnapshotDecisionFamilyAdapter`'s `createOrResumeThread` (`snapshotDecisionFamilyAdapter.ts:366–378`). A second layer guards against a race: `createThread` catches a `P2002` on the `activeIdentityKey` unique constraint and falls back to `selectThread` + `resumeThread` rather than erroring (lines 329–340). Two independent goal statements for the same property resolve to the same thread, not two.

*Current assumptions/evidence loaded*: `sellHoldRentAnalysisResult` unconditionally renders the complete editable scenario-input set (home value, rent, appreciation, selling costs, rent growth, vacancy, management and mortgage context), with the source of each input, on every call. It also renders the model sources through Ask's standard evidence metadata. Neither depends on an active `DecisionThread`; they are baseline analysis content. When a thread exists, a separate compact tracked-decision table adds lifecycle, context freshness, last update and next action without duplicating the economic inputs.

## D05 — Open the sell/hold/rent workspace and return

**Required:** "Workflow, selected item/scenario and position restored."

**Verdict: PASS after the 2026-10-22 result-continuity completion.**

`SELL_HOLD_RENT_ANALYSIS` now stamps a generic `AskViewState`, carries its `resultId` and revision through declared 5/10-year continuations, and renders the comparison through the shared `ResultViewContext`. That bounded store persists the selected comparison option, chosen presentation layout and scroll offset under the stable result key. Removed or renamed options are reconciled away rather than restored blindly. Durable thread identity continues to restore the workflow itself; result-view identity now restores what the homeowner was viewing.

The earlier correction remains important: freshness revalidation is not a substitute for view restoration. The completion pass closes that original gap with explicit result-view state rather than relaxing the scoring standard. Durable `DecisionThread` identity restores the workflow; stable `AskViewState.resultId` plus the bounded client store restores comparison selection, layout and scroll offset. Context-digest revalidation remains a separate G07 safeguard.

## D07 — Sell/hold/rent's embedded seller-prep item state changes elsewhere

**Required (adapted, see mapping note above):** "Current disposition shown; no stale item action exposed inline."

**Verdict: PASS — mostly by construction rather than by a dedicated staleness guard.**

`buildSellerPrepInlineBlock` (`conversationalCapture.ts:1134`) calls `PropertySaleCaseService.getCase(userId, propertyId)` fresh on every invocation — no caching — so the preview always reflects the seller-prep checklist's current state, including which items are still `OPEN` versus resolved or waived elsewhere. Critically, the block exposes **no inline mutation control** at all: every item and the block's own primary action are `href`-only links out to the real seller-prep workspace (`SELLER_PREP_HREF`), never a confirmable action embedded in the goal-capture response itself. There is therefore no stale-item-action risk to guard against here specifically — a homeowner cannot accept, waive, or otherwise act on a seller-prep item from within this block, so there's nothing that could act on stale state. Scored PASS here on the honest, narrower claim this block actually makes — a live, accurate, read-only preview — not on a mechanism that doesn't need to exist because no inline action does.

**Correction (external review, 2026-09-17): the cross-reference to Phase 7's D07 below was stale.** This section originally cited the actual item-level mutation path, `SELLER_PREP_ITEM_DECISION`, as "already verified independently... PASS" in the Phase 7 Decisions document. Phase 7's own D07 was later re-scored `PASS → PARTIAL` by a separate external-review round (the same "static conflict message doesn't show current disposition" defect found in Phase 8's P04 and Buyer's B06) — so that cross-reference is now wrong. This section's own PASS verdict stands on its own narrow claim (a read-only preview with no inline mutation control has nothing that could act on stale state), which the Phase 7 correction doesn't touch — but the underlying mutation itself, `SELLER_PREP_ITEM_DECISION`, is PARTIAL, not PASS: the stale action is genuinely blocked, but the conflict error shown on a blocked attempt is a static string with no interpolated current-disposition value. A homeowner following this block's own links out to the real seller-prep workspace and hitting a stale-write conflict there will not see what the item's current disposition actually is.

## G02 — Repeat the sell/hold/rent goal in another session

**Required:** "Same active workflow; no duplicate thread."

**Verdict: PASS.**

Same evidence as D01's first half, reframed for session independence specifically: `activeIdentityKey` is a database-level uniqueness constraint on `(propertyId, decisionDefinitionId, primaryEntityType, primaryEntityId)`, not a session-scoped value, and `processGoalCandidate`'s own comment states the distinction explicitly: "`AskSession.activeDecisionThreadId` is a same-session cache only. The real cross-session resumption mechanism is `DecisionThread.activeIdentityKey`." A homeowner restating the same goal in a brand-new session with no cached session state still resolves through `selectThread` to the existing thread — the mechanism this requirement is actually testing does not depend on anything session-scoped at all, satisfying GOAL-004 directly.

## G04 — Vague follow-up with an unambiguous active sell/hold/rent goal

**Required:** "Continue exact thread using bounded structured state, not raw transcript replay."

**Original verdict: FAIL — confirmed absent, not merely weak.**

`askFollowUpContext.ts`'s `resolveAskFollowUpMessage` is the platform's one general-purpose mechanism for resolving a vague follow-up against a prior typed execution (reading a bounded, recent, *structured* prior execution — genuinely the right kind of mechanism this requirement asks for, not raw transcript replay, when it applies). It had purpose-built branches for exactly four continuation kinds: entity continuation (a Maintenance task, via `ENTITY_CONTINUATION_PATTERN` and `MAINTENANCE_COMPLETE_VERB_PATTERN`), `INTELLIGENCE_ENVELOPE_QUERY` pagination and its Radar-notification vague-followup variant, `HVAC_SPECIALIST_ENGAGE` continuation (`SPECIALIST_CONTINUATION_PATTERN`), and a fixed allowlist of filter-continuable read operations (`FILTER_CONTINUABLE_OPERATIONS`). A direct read of the full file confirmed zero references to `SELL_HOLD_RENT_ANALYSIS`, `SELL_HOLD_RENT_GOAL_CAPTURE`, or `DecisionThread` anywhere — and `SELL_HOLD_RENT_ANALYSIS` was not a member of `FILTER_CONTINUABLE_OPERATIONS` either, so even the generic filter-continuation branch didn't apply to it.

The only DecisionThread-awareness found anywhere in the general routing/ranking layer was `askNextActions.ts`'s `activeSellHoldRentGoalRelatedCapabilityIds` — and that function does something different: it biases which capability *suggestion chips* get promoted after an already-answered turn, not which operation an ambiguous message *routes to*. A vague message like "what should I do about that?" or "keep going with the plan" after a sell/hold/rent turn hit none of `resolveAskFollowUpMessage`'s four gate patterns, so the function returned its bare `fallback` (`forcedOperationId: null`) and the message fell through to ordinary top-level intent classification with no pinning to the active thread at all — precisely the "raw transcript replay" / re-derive-from-scratch failure mode this requirement's wording is written to rule out. HVAC, Maintenance, and Envelope/Radar each got a dedicated, bespoke branch here; sell/hold/rent did not.

**FIXED, same session, 2026-09-17: `PASS`.** Added `SELL_HOLD_RENT_VAGUE_FOLLOWUP_PATTERN` — a fifth, closed pattern in `askFollowUpContext.ts` covering a bounded set of genuinely bare continuation phrasings ("what's the status on my plan?", "how's my plan going?", "keep going with it/that/the plan", "what's next for it?", "any updates on my plan?", "should I still sell/hold/rent?", "is that still accurate?", "what about my plan?") — plus a routing branch gated on `prior.operationId` being either `SELL_HOLD_RENT_ANALYSIS` or `SELL_HOLD_RENT_GOAL_CAPTURE`. Deliberately anchored to the whole message, like `MONITOR_VAGUE_FOLLOWUP_PATTERN`, rather than a broad word-boundary scan like `SPECIALIST_CONTINUATION_PATTERN`: `SELL_HOLD_RENT_ANALYSIS` is a deterministic snapshot read with no message-driven branching of its own (it takes no `message` parameter at all, confirmed under D01 above), not an open-ended agent conversation, so a narrow closed set is the right shape and lower-risk than a permissive keyword scan that could hijack an unrelated question.

The routing branch always forces `SELL_HOLD_RENT_ANALYSIS`, never `SELL_HOLD_RENT_GOAL_CAPTURE`, even when the prior turn *was* the goal-capture attachment — `SELL_HOLD_RENT_GOAL_CAPTURE` is not directly message-routable at all (`goalCaptureNotDirectlyRoutableResult`), while `SELL_HOLD_RENT_ANALYSIS` already reads and surfaces the same active thread's current progress per the FRD §22 Option B implementation, giving the homeowner the exact thread's current, bounded, structured state (via `decisionProgressBlock`/`whyNowBlock`) rather than re-deriving anything from the raw follow-up text. Like every other branch in this file, the fix is a conservative *nudge*: `askOrchestrator.service.ts`'s `shouldForceOperation` gate only actually forces the routed operation when the top-level classifier found nothing confident on its own (`routingDecision.stage === 'REMOTE_FALLBACK'`), so this never overrides a confidently-and-correctly-routed message.

**Verification level: 6 new unit tests added to `tests/ask/askFollowUpContext.test.js`** (routes back from both `SELL_HOLD_RENT_ANALYSIS` and `SELL_HOLD_RENT_GOAL_CAPTURE`; 6 distinct bare phrasings all recognized; an unrelated prior operation does not trigger it; an unrelated question after a sell/hold/rent turn is never rewritten) — all pass, alongside the full pre-existing 20-test suite (26/26 green) and a clean `tsc --noEmit`. **Not** database- or browser-verified, consistent with every other document in this series and with the "live model/browser limitations remain explicit" language in Phase 4's own exit criterion.

## G07 — Sell/hold/rent goal assumptions or evidence change

**Required:** "Progress/next actions re-evaluated and stale proposal invalidated."

**Verdict: PASS — the strongest-evidenced G07-equivalent mechanism found in this audit series.**

`createSnapshotDecisionFamilyAdapter`'s `resumeThread` (`snapshotDecisionFamilyAdapter.ts:210–268`) compares the previous snapshot's `inputDigest` against a freshly loaded `SnapshotSourceState`'s digest inside a transaction; an unchanged digest is a genuine no-op (`recomputed: false`), while a changed digest creates a **new** `RecommendationSnapshot` row (`supersedesSnapshotId` pointing at the old one — the prior snapshot is retained, not overwritten), advances the thread's `currentRecommendationSnapshotId`, and computes a real `RecommendationChangeDiff` via `compareRecommendationSnapshots`, then emits it through `emitDecisionRecommendationChange`. This is the same shape the Phase 7 Decisions document found for HVAC's `recomputeStaleThread` — confirmed here to be the *same shared factory*, not a parallel reimplementation, and genuinely applies to sell/hold/rent since `sellHoldRentDecisionFamilyAdapter` is built from this same `createSnapshotDecisionFamilyAdapter` factory.

What's stronger than the HVAC-specific mechanism: `selectThread`'s own read-time check (covered under D05 above) performs the same digest comparison on a **pure read**, not only when something explicitly triggers a resume — so "the assumptions changed" is detected and reflected (`contextStatus: 'STALE'`) the very next time anyone reads the thread, including a plain `SELL_HOLD_RENT_ANALYSIS` ask that never calls `resumeThread` at all. The code's own header comment in `snapshotDecisionFamilyAdapter.ts` names this design choice explicitly: "Staleness here is pull-based, not push-based... every resume recomputes a digest of the domain's current source state and compares it against the thread's last snapshot." A materially changed input (a new home-value estimate, a changed rent figure, anything `hashSourceState` covers) cannot be silently served as still-current from either a read or an explicit resume.

## Summary

| ID | Required outcome | Verdict |
| --- | --- | --- |
| D01 | Same durable thread; current assumptions/evidence loaded | **PASS** — stronger than the equivalent HVAC finding (assumptions/evidence render unconditionally, not just when declared) |
| D05 | Workspace open-and-return: workflow/scenario/position restored | **PASS** — durable thread identity restores the workflow; stable result identity plus bounded local result state restores scenario, layout and scroll position |
| D07 | Embedded seller-prep preview: current disposition, no stale action | **PASS**, scoped narrowly to this read-only preview block — live read on every call, no inline mutation control to go stale; the underlying mutation itself, `SELLER_PREP_ITEM_DECISION`, is **PARTIAL** in the Phase 7 document (stale write blocked, current disposition not shown on conflict) — not PASS as this section originally, incorrectly, cross-referenced |
| G02 | Repeat goal in another session: same workflow, no duplicate | **PASS** — `activeIdentityKey` DB-level uniqueness, session-independent by design |
| G04 | Vague follow-up continues the exact thread via structured state | **FIXED → PASS** — `SELL_HOLD_RENT_VAGUE_FOLLOWUP_PATTERN` + routing branch added to `askFollowUpContext.ts`, same session; 6 new unit tests green, `tsc` clean; not live/browser-verified |
| G07 | Assumptions/evidence change: re-evaluated, stale proposal invalidated | **PASS** — digest-based staleness at both read-time and resume-time, strongest such mechanism found in this series |

**All 6 scenarios pass statically.** The snapshot-and-digest architecture retains its strong staleness detection, bounded vague-follow-up routing restores the exact decision family, and the shared result-view mechanism now closes D05 without creating a Sell / Hold / Rent-specific cache. The comparison remains planning support: final disposition and external transaction execution are intentionally outside this capability's product boundary.
