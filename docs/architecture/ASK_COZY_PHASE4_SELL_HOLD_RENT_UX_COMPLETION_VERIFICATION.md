# Ask Cozy Cross-Domain Interaction Rollout — Phase 4 Sell/Hold/Rent Persistent-Decision UX Completion Verification

**Status:** Complete — the 6 scenarios Phase 4's own exit criterion names, evaluated specifically against the sell/hold/rent family.
**Verdict: 5 pass, 1 fail.** The fail is clean and specific: there is no vague-follow-up continuation mechanism for sell/hold/rent anywhere in the codebase — `askFollowUpContext.ts`, the platform's one general-purpose vague-follow-up resolver, has dedicated branches for Maintenance, HVAC specialist engagement, and Radar/Envelope, but zero references to sell/hold/rent or `DecisionThread` at all.
**Governs:** [Ask Cozy — Cross-Domain Interaction Rollout FRD](../product/ASK_COZY_CROSS_DOMAIN_INTERACTION_ROLLOUT_FRD.md) §21 Phase 4's exit criterion verbatim: "the relevant D01/D05/D07 and G02/G04/G07 scenarios pass for sell/hold/rent at the level claimed; live model/browser limitations remain explicit."
**Builds on:** the FRD §22 decision work already completed and pushed this engagement (commit `197e5645`, Option B: `SELL_HOLD_RENT_ANALYSIS` reads but never creates/resumes a thread), the Phase 0 audit's §4.6/§4.8 tracing of `SELL_HOLD_RENT_ANALYSIS`/`SELL_HOLD_RENT_GOAL_CAPTURE`, and the Phase 7 Decisions document's D01/D02/D07 findings for the *HVAC* family — this document evaluates the same scenario IDs against a structurally different family (snapshot-based, not composed-from-facts) and does not assume the HVAC verdicts transfer.
**Verification level: STATIC.** Every claim below is derived from direct reads of `sellHoldRentAnalysisResult`, `processGoalCandidate`, `buildSellerPrepInlineBlock`, `createSnapshotDecisionFamilyAdapter` (`snapshotDecisionFamilyAdapter.ts`), `domainSnapshotAdapters.ts`'s `sellHoldRentDecisionFamilyAdapter`, and `askFollowUpContext.ts`. Nothing here is database- or browser-verified — this is exactly the "live model/browser limitations remain explicit" disclosure the exit criterion itself asks for.

## Why these 6 scenarios, mapped this way

Phase 4's exit criterion names D01, D05, D07 (from §13.3's Decisions-and-projects table) and G02, G04, G07 (from §15.3's Persistent-goals table) as the scenarios that must pass "for sell/hold/rent" specifically. D01 and D05's literal text already names sell/hold/rent or applies generically to any decision workspace. D07's literal text ("Seller-prep item changes in another session") is nominally about the separate `SELLER_PREP_CHECKLIST`/`SELLER_PREP_ITEM_DECISION` operations, already verified independently in the Phase 7 Decisions document — but `SELL_HOLD_RENT_GOAL_CAPTURE`'s own response embeds a seller-prep preview block (`buildSellerPrepInlineBlock`), so Phase 4 evaluating D07 "for sell/hold/rent" is read here as: does that embedded preview behave honestly with respect to staleness, not as a demand that sell/hold/rent duplicate seller-prep's own item-mutation logic.

## D01 — Start and later resume a sell/hold/rent decision

**Required:** "Same durable thread; current assumptions/evidence loaded."

**Verdict: PASS — stronger than the equivalent HVAC finding in the Phase 7 Decisions document.**

*Same durable thread*: `processGoalCandidate` calls `sellHoldRentDecisionFamilyAdapter.createOrResumeThread`, which calls `selectThread` first and only falls through to `createThread` on `NONE` — confirmed by direct read of `createSnapshotDecisionFamilyAdapter`'s `createOrResumeThread` (`snapshotDecisionFamilyAdapter.ts:366–378`). A second layer guards against a race: `createThread` catches a `P2002` on the `activeIdentityKey` unique constraint and falls back to `selectThread` + `resumeThread` rather than erroring (lines 329–340). Two independent goal statements for the same property resolve to the same thread, not two.

*Current assumptions/evidence loaded*: `sellHoldRentAnalysisResult` (`askOrchestrator.service.ts:5561`) unconditionally renders a `GROUPED_LIST` titled "Assumptions that materially affect the answer" (home value, rent, appreciation rate, selling costs, and whether mortgage effects are modeled — `limitations`, lines 5640–5646) and an `EVIDENCE` block ("Sources used," from `analysis.meta.dataSources`) on **every** call, independent of whether an active `DecisionThread` exists. This is materially stronger than what the Phase 7 Decisions document found for `HVAC_DECISION_START`/`CONTINUE`, which declare `EVIDENCE`/`ASSUMPTIONS` as allowed block types but were found to never actually render them (D01 there scored PARTIAL for exactly this reason). Sell/hold/rent's assumptions and evidence are not gated behind thread state at all — they're the operation's baseline content.

## D05 — Open the sell/hold/rent workspace and return

**Required:** "Workflow, selected item/scenario and position restored."

**Verdict: PASS, under the same interpretation applied consistently elsewhere in this series.**

As with Financial's F07 and Buyer's B07, there is no pixel-level UI position restoration anywhere in Ask — no operation-level view-state mechanism exists outside Maintenance's `MaintenanceViewState` (confirmed platform-wide in Phase 0 §2.5). What "restored" can mean here is whether the *durable decision state itself* comes back correctly and current on the next ask — and for sell/hold/rent that answer is genuinely strong, stronger than the comparable finding for `CAPITAL_RESERVE_PLAN` in the Financial document. `selectThread`'s own read-time freshness check (`snapshotDecisionFamilyAdapter.ts:179–191`) recomputes a digest of the current canonical `SellHoldRentAnalysis` row and compares it against the thread's last snapshot's `inputDigest` on **every read**, not only on an explicit resume — a mismatch is projected as `contextStatus: 'STALE'` immediately, with the code's own comment explaining why: "so Home, runtime status, and commitment guards cannot treat the old snapshot as current." Returning to Ask after visiting the external `/tools/sell-hold-rent` workspace and asking again re-runs exactly this check; the homeowner sees the same tracked thread (via `decisionProgressBlock`) with its genuinely current state, not a stale cached view. This is the one track in this whole series where "restored" and "revalidated" (Financial F07's unmet compound requirement) are both satisfied by the same mechanism.

## D07 — Sell/hold/rent's embedded seller-prep item state changes elsewhere

**Required (adapted, see mapping note above):** "Current disposition shown; no stale item action exposed inline."

**Verdict: PASS — mostly by construction rather than by a dedicated staleness guard.**

`buildSellerPrepInlineBlock` (`conversationalCapture.ts:1134`) calls `PropertySaleCaseService.getCase(userId, propertyId)` fresh on every invocation — no caching — so the preview always reflects the seller-prep checklist's current state, including which items are still `OPEN` versus resolved or waived elsewhere. Critically, the block exposes **no inline mutation control** at all: every item and the block's own primary action are `href`-only links out to the real seller-prep workspace (`SELLER_PREP_HREF`), never a confirmable action embedded in the goal-capture response itself. There is therefore no stale-item-action risk to guard against here specifically — a homeowner cannot accept, waive, or otherwise act on a seller-prep item from within this block, so there's nothing that could act on stale state. The actual item-level mutation path is `SELLER_PREP_ITEM_DECISION`, already verified independently with a real, confirmed stale-write guard in the Phase 7 Decisions document (D07 there: PASS). Scored PASS here on the honest, narrower claim this block actually makes — a live, accurate, read-only preview — not on a mechanism that doesn't need to exist because no inline action does.

## G02 — Repeat the sell/hold/rent goal in another session

**Required:** "Same active workflow; no duplicate thread."

**Verdict: PASS.**

Same evidence as D01's first half, reframed for session independence specifically: `activeIdentityKey` is a database-level uniqueness constraint on `(propertyId, decisionDefinitionId, primaryEntityType, primaryEntityId)`, not a session-scoped value, and `processGoalCandidate`'s own comment states the distinction explicitly: "`AskSession.activeDecisionThreadId` is a same-session cache only. The real cross-session resumption mechanism is `DecisionThread.activeIdentityKey`." A homeowner restating the same goal in a brand-new session with no cached session state still resolves through `selectThread` to the existing thread — the mechanism this requirement is actually testing does not depend on anything session-scoped at all, satisfying GOAL-004 directly.

## G04 — Vague follow-up with an unambiguous active sell/hold/rent goal

**Required:** "Continue exact thread using bounded structured state, not raw transcript replay."

**Verdict: FAIL — confirmed absent, not merely weak.**

`askFollowUpContext.ts`'s `resolveAskFollowUpMessage` is the platform's one general-purpose mechanism for resolving a vague follow-up against a prior typed execution (reading a bounded, recent, *structured* prior execution — genuinely the right kind of mechanism this requirement asks for, not raw transcript replay, when it applies). It has purpose-built branches for exactly four continuation kinds: entity continuation (a Maintenance task, via `ENTITY_CONTINUATION_PATTERN` and `MAINTENANCE_COMPLETE_VERB_PATTERN`), `INTELLIGENCE_ENVELOPE_QUERY` pagination and its Radar-notification vague-followup variant, `HVAC_SPECIALIST_ENGAGE` continuation (`SPECIALIST_CONTINUATION_PATTERN`), and a fixed allowlist of filter-continuable read operations (`FILTER_CONTINUABLE_OPERATIONS`). A direct read of the full file confirms zero references to `SELL_HOLD_RENT_ANALYSIS`, `SELL_HOLD_RENT_GOAL_CAPTURE`, or `DecisionThread` anywhere — and `SELL_HOLD_RENT_ANALYSIS` is not a member of `FILTER_CONTINUABLE_OPERATIONS` either, so even the generic filter-continuation branch doesn't apply to it.

The only DecisionThread-awareness found anywhere in the general routing/ranking layer is `askNextActions.ts`'s `activeSellHoldRentGoalRelatedCapabilityIds` — and that function does something different: it biases which capability *suggestion chips* get promoted after an already-answered turn, not which operation an ambiguous message *routes to*. A vague message like "what should I do about that?" or "keep going with the plan" after a sell/hold/rent turn hits none of `resolveAskFollowUpMessage`'s four gate patterns, so the function returns its bare `fallback` (`forcedOperationId: null`) and the message falls through to ordinary top-level intent classification with no pinning to the active thread at all — precisely the "raw transcript replay" / re-derive-from-scratch failure mode this requirement's wording is written to rule out. HVAC, Maintenance, and Envelope/Radar each got a dedicated, bespoke branch here; sell/hold/rent did not.

## G07 — Sell/hold/rent goal assumptions or evidence change

**Required:** "Progress/next actions re-evaluated and stale proposal invalidated."

**Verdict: PASS — the strongest-evidenced G07-equivalent mechanism found in this audit series.**

`createSnapshotDecisionFamilyAdapter`'s `resumeThread` (`snapshotDecisionFamilyAdapter.ts:210–268`) compares the previous snapshot's `inputDigest` against a freshly loaded `SnapshotSourceState`'s digest inside a transaction; an unchanged digest is a genuine no-op (`recomputed: false`), while a changed digest creates a **new** `RecommendationSnapshot` row (`supersedesSnapshotId` pointing at the old one — the prior snapshot is retained, not overwritten), advances the thread's `currentRecommendationSnapshotId`, and computes a real `RecommendationChangeDiff` via `compareRecommendationSnapshots`, then emits it through `emitDecisionRecommendationChange`. This is the same shape the Phase 7 Decisions document found for HVAC's `recomputeStaleThread` — confirmed here to be the *same shared factory*, not a parallel reimplementation, and genuinely applies to sell/hold/rent since `sellHoldRentDecisionFamilyAdapter` is built from this same `createSnapshotDecisionFamilyAdapter` factory.

What's stronger than the HVAC-specific mechanism: `selectThread`'s own read-time check (covered under D05 above) performs the same digest comparison on a **pure read**, not only when something explicitly triggers a resume — so "the assumptions changed" is detected and reflected (`contextStatus: 'STALE'`) the very next time anyone reads the thread, including a plain `SELL_HOLD_RENT_ANALYSIS` ask that never calls `resumeThread` at all. The code's own header comment in `snapshotDecisionFamilyAdapter.ts` names this design choice explicitly: "Staleness here is pull-based, not push-based... every resume recomputes a digest of the domain's current source state and compares it against the thread's last snapshot." A materially changed input (a new home-value estimate, a changed rent figure, anything `hashSourceState` covers) cannot be silently served as still-current from either a read or an explicit resume.

## Summary

| ID | Required outcome | Verdict |
| --- | --- | --- |
| D01 | Same durable thread; current assumptions/evidence loaded | **PASS** — stronger than the equivalent HVAC finding (assumptions/evidence render unconditionally, not just when declared) |
| D05 | Workspace open-and-return: workflow/scenario/position restored | **PASS** — durable thread identity plus genuine read-time revalidation on every ask |
| D07 | Embedded seller-prep preview: current disposition, no stale action | **PASS** — live read on every call, no inline mutation control to go stale |
| G02 | Repeat goal in another session: same workflow, no duplicate | **PASS** — `activeIdentityKey` DB-level uniqueness, session-independent by design |
| G04 | Vague follow-up continues the exact thread via structured state | **FAIL** — no mechanism exists; `askFollowUpContext.ts` has zero sell/hold/rent awareness |
| G07 | Assumptions/evidence change: re-evaluated, stale proposal invalidated | **PASS** — digest-based staleness at both read-time and resume-time, strongest such mechanism found in this series |

**5 of 6 scenarios pass, 1 fails outright.** The sell/hold/rent family, now that the §22 decision is implemented, is in materially better shape than its closest comparator (HVAC) on 3 of the 4 scenarios the two families share in spirit (D01, D05/analogous, G07) — its snapshot-and-digest architecture produces genuinely stronger staleness detection than HVAC's fact-driven `markThreadStaleOnFactCorrection` push model, because it doesn't depend on every relevant fact change routing through a specific correction path; any change to the canonical source row is caught the next time anyone reads the thread. G04's failure is not a weak or partial implementation of an existing mechanism — like Financial's F02 and Attention's T03, it is a scenario built around a capability (thread-aware vague-follow-up routing) that has never been built for this family at all, confirmed by the complete absence of any reference to sell/hold/rent in the platform's one general vague-follow-up resolver. **Phase 4's exit criterion, as literally written, is not yet met** — it requires all of D01/D05/D07 and G02/G04/G07 to pass, and G04 does not.
