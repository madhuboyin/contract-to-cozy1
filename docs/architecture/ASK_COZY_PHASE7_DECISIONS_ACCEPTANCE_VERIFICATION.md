# Ask Cozy Cross-Domain Interaction Rollout — Phase 7 Decisions and Projects Acceptance Scenario Verification

**Status:** Complete — all 8 acceptance scenarios (D01–D08) evaluated. **D07 revised 2026-09-17 after external review found the same "generic conflict message ≠ current state shown" substitution already corrected in the Phase 8 document's P04. D07 FIXED 2026-09-17, per explicit user request to continue the same defect fix already applied to Buyer's B06 into this track: a new `saleReadinessItemConflictDescription` now interpolates the item's real current title/status, closing PARTIAL→PASS. D03 FIXED 2026-09-17: `saveOwnershipHorizonPreference`/`saveRepairReplaceApproachPreference` now compute and return `affectedThreadIds` (household-wide for the former, `(userId, propertyId)`-scoped for the latter) and `confirmHvacPreferenceSave` marks them stale, closing the save/forget staleness asymmetry — PARTIAL→PASS. D01 FIXED 2026-09-17: new `evidenceItemsForCanonicalFacts`/`assumptionsItemsForSnapshot` resolve real current InventoryItem facts and the actual preference basis used (or explicitly disclose its absence) into EVIDENCE/ASSUMPTIONS blocks on all 3 HVAC resume read paths — closing PARTIAL→PASS. D05/D06/D08 deferred this round, per explicit user scoping: D05 (position restoration) pending a dedicated retrace of whether Buyer's B07 generic mechanism already covers this family; D06 (Home Action suppression on abandon) and D08 (distinct renovation guidance destination) both need a product decision on scope before implementation.**
**Verdict: no outright failures, and now 5 of 8 scenarios pass fully.** Originally scored 3 of 8 fully passing; external review corrected D07 from PASS to PARTIAL (`confirmSellerPrepItemDecision`'s stale-write guard was real, but its conflict message was static boilerplate with zero item-specific dynamic content — the same defect independently confirmed in Phase 8's P04 and Buyer's B06); D07's fix brought it back to 3/8; D03's fix brought it to 4/8; D01's fix now nets to 5/8. The Decisions and projects track is still more mature than Buyer's own verification found — real per-thread freshness, real scenario persistence, real staleness signaling all exist — and 3 of 8 scenarios still pass only partially, each against a specific, named gap.
**Governs:** [Ask Cozy — Cross-Domain Interaction Rollout FRD](../product/ASK_COZY_CROSS_DOMAIN_INTERACTION_ROLLOUT_FRD.md) §13.3 (D01–D08). Phase 7's own exit criterion also covers F01–F08 (Financial); this document covers D01–D08 only, per the specific request that produced it.
**Builds on:** [Phase 0 Coverage Audit](ASK_COZY_PHASE0_COVERAGE_AUDIT.md) §4.7 (`SELL_HOLD_RENT_ANALYSIS`/`GOAL_CAPTURE`) and §4.11 (the other 17 Decisions-and-projects operations), which traced every operation to the handler level. This document re-reads the code against each specific acceptance scenario, including several confirm-time handler bodies not read in full during Phase 0.
**Verification level: STATIC.** Every verdict below is derived from reading `askOrchestrator.service.ts`'s HVAC/seller-prep/renovation confirm and propose handlers, `decisionThreadService.ts`, and `askOperationRegistry.ts` directly. Nothing here is database- or browser-verified — no live decision thread was exercised end to end.

| Field | Status |
| --- | --- |
| Audit coverage | Complete — all 8 acceptance scenarios (D01–D08) evaluated |
| Static (code-read) acceptance | 5 pass, 3 partial, 0 fail |
| Runtime/browser acceptance | Not evaluated this session — no live database or browser exercised |
| Phase 7 exit criterion ("applicable F01–F08 and D01–D08 scenarios pass") | **Not met** — 3 of 8 D-scenarios are only partial |

## Methodology

Same as the Phase 6 Buyer verification: PASS (fully confirmed by code), PARTIAL (part of the requirement met, a specific part isn't), FAIL (confirmed not met). Scoping notes where a scenario spans multiple operation families with different answers.

## D01 — Start and later resume an HVAC or sell/hold/rent decision

**Required:** "Same durable thread; current assumptions/evidence loaded."

**Original verdict: PARTIAL.**

*Same durable thread*: real and well-engineered. `decisionThreadService.selectHvacDecisionThread` returns a `UNIQUE`/`AMBIGUOUS`/`NONE` discriminated union keyed on `(propertyId, decisionDefinitionId, primaryEntityType, primaryEntityId)`; `activeIdentityKey`'s own uniqueness constraint (confirmed via `abandonDecisionThread`'s comment: `ABANDONED` sets it to `null` specifically so it "frees up for a future create-or-resume") guarantees one active thread per subject. `HVAC_DECISION_START`'s "already active" branch and `HVAC_DECISION_CONTINUE` both resolve to the identical thread on a second ask. `SELL_HOLD_RENT_ANALYSIS` (post-§22 implementation) and `SELL_HOLD_RENT_GOAL_CAPTURE` share the same durable identity via `sellHoldRentDecisionFamilyAdapter`.

**What was missing:** "current assumptions/evidence loaded" was not met. Direct grep of both `hvacDecisionStartResult` and `hvacDecisionContinueResult` (`askOrchestrator.service.ts`) found **zero** `EVIDENCE` or `ASSUMPTIONS` block pushes in either function, despite `HVAC_DECISION_START`'s own registry entry declaring both as allowed block types (`HVAC_DECISION_CONTINUE`'s own entry declared `EVIDENCE` but not `ASSUMPTIONS` — a 2nd, narrower instance of the same gap, only found while implementing the fix). What *was* shown on resume: verdict, reason codes, confidence label, and any saved `PREFERENCE_REFERENCE` — real, but not the same thing as evidence citations or stated modeling assumptions. A homeowner resuming a decision saw the recommendation and why it might have changed, but not what facts or assumptions it was actually built on.

**FIXED, 2026-09-17.** `RecommendationSnapshot.canonicalFactReferences` only ever stores `{entityType, entityId, fieldPath}` references, not values (confirmed by direct read of `recomputeStaleThread`'s/`createHvacDecisionThread`'s own snapshot-creation code — currently always exactly `condition` and `installedOn` on the `InventoryItem`) — `evidenceReferences` is separately hardcoded to `[]` everywhere a snapshot is created, so there is genuinely no evidence-value source to surface yet beyond those 2 canonical fact references; building a real evidence-reference source (e.g. from inspection reports) is future scope, not part of this fix. A new pure `evidenceItemsForCanonicalFacts(canonicalFactReferences, item)` (`decisionThreadPresentationBlocks.ts`) resolves the 2 known `fieldPath`s against the item's **live, current** field values — not what they were at the snapshot's generation time, matching "current...evidence loaded"'s own literal wording — and is passed the InventoryItem already resolved by each call site's own `findHvacItemForMessage`/`focusedItem` query (extended to select `condition`/`installedOn`/`updatedAt`, previously only `id`/`name`). A new pure `assumptionsItemsForSnapshot(preferenceDetails, engineVersion)` states the actual ownership-horizon and repair/replace-approach basis used — reusing the same `getPreferenceReferenceDetails` call already made for `PREFERENCE_REFERENCE` blocks, not a second preference read — and explicitly discloses when no preference was on file for either ("this calculation does not assume any planned sale timeline" / "does not weight toward minimizing upfront cost or maximizing reliability"), verified against `evaluateHvacRepairReplace`'s own code (a null `repairReplaceApproach` genuinely triggers neither scoring branch — a true no-op, not a hidden default), rather than restating an unverified claim about what the engine "assumes." This is the real value-add over the existing `PREFERENCE_REFERENCE` blocks, which only render when a preference exists — a homeowner with no saved preference previously saw nothing telling them none was assumed. Also states the recommendation's `engineVersion`. A new `hvacDecisionDisclosureBlocks` function (separate from the pre-existing `preferenceReferenceBlocksForSnapshot`, which 2 confirm handlers elsewhere still use and whose operations don't declare `EVIDENCE`/`ASSUMPTIONS`) wires both into all 3 of `hvacDecisionStartResult`/`hvacDecisionContinueResult`'s read paths. `HVAC_DECISION_CONTINUE`'s registry entry gained `ASSUMPTIONS` (it already had `EVIDENCE`, unused until now).

**Verification: 22 tests** — 9 new in `tests/decisionPlatform/hvacDecisionDisclosureBlocks.test.js` (condition/installedOn resolution against live values, both together produce exactly 2 deduplicated items, an unrecognized `fieldPath` is skipped rather than throwing, malformed `canonicalFactReferences` degrades to an empty array, the 3 preference-presence combinations for `assumptionsItemsForSnapshot`) plus the pre-existing "declares every block type it can emit" cross-check test extended to assert `EVIDENCE`/`ASSUMPTIONS` for both operations. `tsc --noEmit` clean, fresh-parse clean on all 3 touched files, full `tests/decisionPlatform/*.test.js` + `tests/ask/*.test.js` suite green (816/820 pass, 3 pre-existing unrelated failures — an emitter try/catch governance check and an HVAC-routing heuristic, both confirmed present on the clean baseline via `git stash` earlier this session — 1 pre-existing unrelated skip). **Not** database- or browser-verified — a live resume showing a real EVIDENCE/ASSUMPTIONS block was not exercised against a live database this session.

**Revised verdict: `PASS`.** Both halves of the requirement are now genuinely met.

## D02 — Edit a scenario assumption

**Required:** "New comparison revision; original retained; no canonical fact silently changed."

**Verdict: PASS.**

`confirmHvacDecisionScenario` (`askOrchestrator.service.ts:10375`) calls `decisionThreadService.createHvacScenario(scenarioThread.id, userId, {...})`, which returns a real, persisted `scenario`/`scenarioSnapshot` (confirmed by its own `scenario.id` being used as the confirmation's `artifactId` — not an ephemeral, discard-after-display computation). The resulting `scenarioComparisonBlock` explicitly shows **both** the thread's existing `currentRecommendationSnapshot` (labeled "Current recommendation," unmodified) **and** the new scenario's own verdict side by side — a direct, literal match for "new comparison revision; original retained." Both propose- and confirm-time copy state explicitly that the recorded decision is never overwritten ("It never overwrites the recorded decision" / description text at confirm time). No canonical fact is touched — the scenario read/write path never calls `decisionThreadService`'s own recommendation-supersession functions.

## D03 — Save then forget a scoped preference

**Required:** "Exact scope disclosed; receipts; subsequent decision refresh reflects change."

**Original verdict: PARTIAL — a confirmed asymmetry between save and forget.**

*Exact scope disclosed*: real, on both sides. Propose-time (`hvacPreferenceSaveResult`) discloses "Who can see this" (Household summary), "Used for" (HVAC repair/replace decisions), and "Expires" (12 months or explicit forget) before confirmation.

*Receipts*: real, on both sides, and genuinely well-written. `confirmHvacPreferenceSave` returns a `PREFERENCE_REFERENCE` block per saved preference with `confirmedAt`/`summary`/`visibility`. `confirmHvacPreferenceForget` returns a `WORKFLOW_PROGRESS` block whose description explicitly discloses the refresh promise: "Affected decisions will be recalculated the next time you open them" (or "No active decision used this preference" when nothing was affected) — the receipt itself states the exact mechanism confirmed below, not just that the preference was removed.

*Subsequent decision refresh reflects change*: **originally confirmed true for forget only.** `confirmHvacPreferenceForget` explicitly calls `decisionThreadService.markThreadsStaleByIds(affectedThreadIds, 'PREFERENCE_REVOKED')` — this directly marks every affected `DecisionThread`'s `contextStatus` stale, so the next `HVAC_DECISION_CONTINUE` read recomputes and discloses the change via `WHY_NOW`/`RECOMMENDATION_CHANGE`. **`confirmHvacPreferenceSave` had no equivalent call** — direct reading of the full function found no `markThreadsStaleByIds` or any other staleness signal. Saving a new preference did not itself mark any thread stale, so a thread's recommendation was not guaranteed to reflect a just-saved preference until something else (a fact change, a manual resume) triggered a recompute. This was a real, specific, confirmed asymmetry — not a guess from absence of evidence.

**FIXED, 2026-09-17.** `saveOwnershipHorizonPreference` and `saveRepairReplaceApproachPreference` (`decisionPreferenceService.ts`) now each compute and return `affectedThreadIds`, mirroring `revokeHvacPreference`'s own return shape — but the two preferences' scopes differ, so the query differs per preference, not a copy-paste of forget's own reference-table lookup (there is no `DecisionThreadPreferenceReference` row yet for a brand-new preference to look up by): `OWNERSHIP_HORIZON` is household-wide (FRD §7.4 — any authorized household member benefits from it), so its affected set is every active `HVAC_REPAIR_REPLACE` thread across every property in the household, found via `HouseholdProperty`, not just the asking property; `REPAIR_REPLACE_APPROACH` is `(userId, propertyId)`-scoped, so its affected set is only this same user's own active threads on this property (`recomputeStaleThread` looks up preferences by `thread.createdByUserId`, so another household member's thread wouldn't apply this user's approach preference anyway). `confirmHvacPreferenceSave` now calls `decisionThreadService.markThreadsStaleByIds(affectedThreadIds, 'PREFERENCE_SAVED')` after both save calls, and its receipt gained a new `WORKFLOW_PROGRESS` block stating the same refresh promise forget's own receipt already states ("Affected decisions will be recalculated the next time you open them"). `HVAC_PREFERENCE_SAVE`'s `allowedBlockTypes` (registry) was extended to declare `WORKFLOW_PROGRESS` — the Skill manifest's own `allowedResultBlocks` already included it, so this was a one-file gap, not the 2-3-file drift the earlier sell/hold/rent fix found.

**Verification: 3 new governance tests** in `tests/decisionPlatform/decisionPreferenceServiceGovernance.test.js` (mirroring that file's own established source-shape-check convention, since there is no test database — see `docs/product/decision-platform/README.md`): `saveOwnershipHorizonPreference` queries `householdProperty.findMany` and does not scope the affected-thread query to only the asking property; `saveRepairReplaceApproachPreference` scopes by `createdByUserId: userId`; `confirmHvacPreferenceSave` calls `markThreadsStaleByIds`. Also extended the pre-existing "declares every block type it can emit" cross-check test to include `HVAC_PREFERENCE_SAVE`/`WORKFLOW_PROGRESS`. `tsc --noEmit` clean, fresh-parse clean, all 13 tests in that file pass, and the file's 3 pre-existing failures (an emitter try/catch governance check and an unrelated HVAC-routing heuristic) were confirmed present on the clean baseline via `git stash` — not caused by this fix. **Not** database- or browser-verified — a live save-then-resume round trip proving a thread's recommendation actually changes after a save was not exercised against a live database this session.

**Revised verdict: `PASS`.** Both halves of the save path now match the forget path's own staleness-marking behavior; the confirmed asymmetry is closed.

## D04 — Record an outcome after the source action changed

**Required:** "Revalidate linkage; clarify or reject stale target."

**Verdict: PASS.**

*Revalidate linkage*: `confirmHvacDecisionOutcomeReport` (and `confirmHvacDecisionOutcomeUnlink`) re-checks `parameters.hvacDecisionContextVersion !== await hvacDecisionThreadVersionFingerprint(candidate.data.decisionThreadId)` and throws `ASK_CONTEXT_VERSION_CONFLICT` on drift — the same atomic-freshness pattern verified platform-wide, applied here specifically to the thread the outcome is being attached to.

*Clarify or reject stale target*: `hvacDecisionOutcomeUnlinkResult` requires a genuinely disputable outcome (`REPORTED`/`CORROBORATED`/`VERIFIED` status) to exist before it will even propose a dispute confirmation — a stale or already-resolved target returns `NOT_APPLICABLE`, not a fabricated dispute option.

## D05 — Open quote/seller/decision workspace and return

**Required:** "Workflow, selected item/scenario and position restored."

**Verdict: PARTIAL, and the answer differs by operation family.**

There is no Decisions-and-projects equivalent of `MaintenanceViewState` (`askOrchestrator.service.ts:1520`, confirmed absent during the Phase 6 Buyer verification and re-confirmed here by the same grep returning nothing for this track) — no conversational `resultId`/filter/position cache exists anywhere in this family, same gap already found in Buyer (B07).

What *does* restore "workflow and selected item" is each operation's own durable, property-scoped identity, which stands in for an explicit cache without actually being one:
- HVAC: `selectHvacDecisionThread`'s identity key means re-asking about a specific system after visiting its workspace resolves to the *same* thread automatically.
- Seller prep: `PropertySaleCaseService.getCase` reads the one active sale case per property — there's only ever one to restore.
- Quote comparison: `quoteComparisonReviewResult` reads the most-recently-updated workspace (`orderBy: {updatedAt: 'desc'}`) — implicitly "the" current one, no selection state needed.

None of these restore **position** (which scenario tab was open, which section of a checklist was scrolled to, or any Ask-conversation-level state) — that half of the requirement is unmet everywhere in this track, same as Buyer.

## D06 — Abandon a decision

**Required:** "History retained according to domain rules; active next actions suppressed."

**Verdict: PARTIAL.**

*History retained*: real and carefully engineered. `decisionThreadService.abandonDecisionThread` (`decisionThreadService.ts:722`) is a version-guarded lifecycle transition (`updateMany` conditioned on `version: thread.version`, throws `DecisionThreadVersionConflictError` on a race) that sets `lifecycleStatus: 'ABANDONED'` and clears `activeIdentityKey` to `null` specifically so the identity "frees up for a future create-or-resume" (the function's own comment) — the thread row itself is never deleted, and its full history stays queryable.

*Active next actions suppressed*: **not implemented.** `abandonDecisionThread` touches only the `DecisionThread` row — confirmed by direct reading, it makes no call into `HomeAction`, `OperationalWorkItem`, or any suppression/feedback service. `HVAC_SPECIALIST_ENGAGE`'s own `homeActionOrigin` linkage (Phase 0 §4.11) shows HVAC decisions can originate from a Home Action; abandoning the decision thread does nothing to that Home Action, which could keep recommending the same repair/replace decision the homeowner just walked away from.

## D07 — Seller-prep item changes in another session

**Required:** "Stale item action blocked; current disposition shown."

**Original verdict: PARTIAL — corrected from an original PASS after external review; the same defect independently found in Phase 8's P04 and Buyer's B06.**

*Stale item action blocked*: genuinely real. `confirmSellerPrepItemDecision` (`askOrchestrator.service.ts:9797`) re-fetches the item fresh from the database, recomputes `sellerPrepItemContextVersion(item)`, and throws `ASK_CONTEXT_VERSION_CONFLICT` if it no longer matches the version captured at propose time. The stale action is genuinely blocked before `PropertySaleCaseService.setItemDecision` is ever called.

*Current disposition shown*: **originally not satisfied, confirmed by direct re-read.** The conflict was thrown as `new Error('This checklist item changed while confirmation was open. Review it and try again.')` — a static string with no interpolated disposition, status, or any other item-specific value. This was the identical pattern found in Phase 8's `confirmClaimTransition` (P04) and Buyer's `confirmBuyerTaskUpdate` (B06): the shared generic error-catch wrapper renders the result as a `WORKFLOW_PROGRESS` block with `details: []` and `actions: []` hardcoded empty, so "review it" was an instruction, not a display.

**FIXED, 2026-09-17, per explicit user request to continue the same defect fix into Decisions/Protection after Buyer's B06: `PASS`.** A new `saleReadinessItemConflictDescription` (pure, exported), mirroring `maintenanceConflictDescription`'s own shape, now interpolates the checklist item's real current title and status (e.g. "is now waived"/"is now pursuing"). No single status here is as clearly a terminal "nothing further to do" case as Maintenance's `COMPLETED`/`CANCELLED` (`OPEN`/`PURSUING`/`RESOLVED`/`WAIVED` are all legitimate current states a homeowner might want disclosed), so this stays a single, unconditional current-status phrasing rather than special-casing any one of them.

**Verification: 2 new unit tests** in `tests/ask/claimAndSaleReadinessConflictDescription.test.js` (a sale-readiness item names its current status across all 4 declared values; an unrecognized status degrades gracefully to a humanized string rather than throwing). All pass, alongside a clean `tsc --noEmit` and fresh-parse check. Not independently tested at the `confirmSellerPrepItemDecision` call-site level (composes a live Prisma lookup) — same STATIC-verification boundary applied throughout this audit series. **Not** database- or browser-verified.

Scored PASS: the block itself is real and correctly engineered, and the disclosure half of the requirement is now real too.

## D08 — Prospective renovation question has no tracked case

**Required:** "Route to distinct supported guidance or limitation, not tracked-case readiness."

**Verdict: PARTIAL.**

*Not tracked-case readiness*: real. `renovationPermitReadinessResult`'s empty-case branch returns an honest `NEEDS_CONTEXT` limitation ("No active renovation case is recorded... those records cannot establish the scope of new work") rather than fabricating a readiness verdict from raw Permit Tracker records — confirmed during Phase 0 §4.11 and re-verified here.

*Route to distinct supported guidance*: **not implemented.** Confirmed by grep across the whole file: `RENOVATION_PERMIT_READINESS` is the only operation that references renovation at all. The empty-case branch's only two actions are "Start renovation planning" and "Review permits" — both still inside the same tracked-case-adjacent workflow, not a genuinely separate guidance destination. `GUIDANCE_JOURNEY_CREATE`'s own scope-matching (Phase 0 §4.11) has no renovation-specific branch either. A prospective, non-tracked renovation question has nowhere distinct to go — it either starts a case or hits the same limitation again.

## Summary

| ID | Required outcome | Verdict |
| --- | --- | --- |
| D01 | Resume: same thread, current assumptions/evidence loaded | **PASS** (fixed) — thread identity real; new EVIDENCE (resolved current InventoryItem facts) and ASSUMPTIONS (real preference basis, or explicit absence, plus engine version) blocks now render on all 3 resume paths |
| D02 | Scenario edit: new revision, original retained, no silent fact change | **PASS** |
| D03 | Save/forget preference: scope, receipts, refresh reflects change | **PASS** (fixed) — save now computes `affectedThreadIds` (scoped per preference type) and marks them stale too, matching forget |
| D04 | Outcome report: revalidate linkage, reject stale target | **PASS** |
| D05 | Workspace round-trip: workflow/item/scenario/position restored | **PARTIAL** — durable identity substitutes for restoration; no position cache anywhere |
| D06 | Abandon: history retained, next actions suppressed | **PARTIAL** — history retention real; no Home Action suppression |
| D07 | Seller-prep item changed elsewhere: stale action blocked, current disposition shown | **PASS** (fixed) — block is real; disposition-shown now real via new `saleReadinessItemConflictDescription` |
| D08 | No tracked renovation case: distinct guidance, not fabricated readiness | **PARTIAL** — honest limitation shown; no distinct guidance destination exists |

**5 full passes, 3 partial passes, 0 outright fails, out of 8 scenarios.** Originally scored 3/5/0; external review corrected D07 (PASS→PARTIAL) for a moment, then D07's fix (2026-09-17, per explicit user request to continue the same defect fix already applied to Buyer's B06 into this track) restored it to PASS, netting to 3/5/0; D03's fix (2026-09-17) then closed the save/forget staleness asymmetry, netting to 4/4/0; D01's fix (2026-09-17) then closed the missing EVIDENCE/ASSUMPTIONS gap, netting to 5/3/0. This track remains genuinely more mature than Buyer's — every partial pass here fails on one specific, narrow, well-defined gap rather than lacking the underlying mechanism entirely, and the platform's more sophisticated safety mechanisms (per-thread staleness marking, disputable-outcome gating, scenario-revision persistence with original-retained disclosure) still live here. The 3 remaining partials, all deferred this round per explicit user scoping (each needs a design or product decision this session's discipline doesn't make unilaterally): durable identity substitutes for, but doesn't fully deliver, position restoration (D05 — pending a dedicated retrace of whether Buyer's B07 generic mechanism already covers this family, the same way B07 itself turned out narrower than first characterized); a real lifecycle transition doesn't reach into the one adjacent system (Home Actions) it plausibly should (D06 — needs a decision on what "suppressed" means operationally); and one track (renovation) has no distinct destination for a whole category of question (D08 — needs a product decision on what that destination is). D07's own stale-write guard now has a genuinely dynamic conflict message (`saleReadinessItemConflictDescription`), matching Claims' P04 fix and Buyer's B06 — the same platform-wide gap, now closed in all 3 places it was found. D03's own staleness-marking asymmetry between save and forget is now closed too, mirroring the exact same "forget/revoke handles X but the equivalent save/create path doesn't" defect shape found and fixed elsewhere in this engagement. D01's own missing-disclosure gap is closed by resolving real, already-existing data (canonical fact references, preference reference details) rather than inventing new evidence sources or unverified "engine assumption" copy.
