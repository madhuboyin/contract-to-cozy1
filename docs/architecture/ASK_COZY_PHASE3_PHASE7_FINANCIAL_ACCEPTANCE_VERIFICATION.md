# Ask Cozy Cross-Domain Interaction Rollout — Financial and Ownership Acceptance Scenario Verification (Phase 3 + Phase 7)

**Status:** Complete — all 8 acceptance scenarios (F01–F08) evaluated. **F02's gap identified below has since been fixed** (see the update note at the end of the F02 section and the summary table).
**Verdict: 6 full passes, 2 partial passes, 0 fails.** Originally 5 full passes, 2 partial, 1 fail — the first scenario in the whole audit series scored a clean **FAIL against the FRD's own phase requirement, not just the acceptance table**: Phase 3's own bullet list requires `REFINANCE_ANALYSIS` to expose "editable scenario assumptions" distinct from canonical facts, and no such mechanism existed in the code at all. A same-session fix wired the codebase's own existing, already-tested `RefinanceRadarService.runScenario` mechanism into `REFINANCE_ANALYSIS`; see the F02 section for the fix and its verification level.
**Governs:** [Ask Cozy — Cross-Domain Interaction Rollout FRD](../product/ASK_COZY_CROSS_DOMAIN_INTERACTION_ROLLOUT_FRD.md) §11.3 (F01–F08), §21 Phase 3's exit criterion ("F01–F05, F07 and F08 pass for refinance") and §21 Phase 7's exit criterion ("applicable F01–F08 and D01–D08 scenarios pass for the delivered slices").
**Builds on:** [Phase 0 Coverage Audit](ASK_COZY_PHASE0_COVERAGE_AUDIT.md) §4.6 (`REFINANCE_ANALYSIS`, `REFINANCE_RATE_MONITOR`) and §4.13 (`SAVINGS_OPPORTUNITIES`, `OWNERSHIP_COSTS`, `CAPITAL_RESERVE_PLAN`, `PROPERTY_TAX_APPEAL_READINESS`), which traced all 6 Financial-and-ownership operations to the handler level. This document re-reads the code against each specific acceptance scenario — including a direct line-by-line re-check of `refinanceAnalysisResult`'s signature (no `message` parameter) and `homeCapitalTimelineService.getLatestTimeline`, neither of which was scrutinized at this level of detail during Phase 0.
**Verification level: STATIC.** Every verdict below is derived from reading `askOrchestrator.service.ts`'s `refinanceAnalysisResult`, `refinanceRateMonitorResult`, `savingsOpportunitiesResult`, `ownershipCostsResult`, `capitalReservePlanResult`, `propertyTaxAppealReadinessResult`, and `homeCapitalTimeline.service.ts`'s `getLatestTimeline`/`runTimeline` directly. Nothing here is database- or browser-verified.

## Why this document covers two phases

Financial and ownership is delivered in two FRD phases with two exit criteria over the same F01–F08 table: **Phase 3** ships `REFINANCE_ANALYSIS` alone first ("F01–F05, F07 and F08 pass for refinance, with monitor creation remaining a separate explicit action"), and **Phase 7** ships the remaining five operations alongside the rest of §11/§13 ("applicable F01–F08 ... scenarios pass for the delivered slices"). Rather than splitting one acceptance table into two documents, this verification scores each scenario once, per operation where the operation differs materially (as it does for F05 and F07), consistent with how the Phase 7 Decisions document already folded Financial's exit criterion reference into its own scope note.

## Methodology

Same as the Phase 6/7/8 verifications: PASS (fully confirmed by code), PARTIAL (part of the requirement met, a specific part isn't), FAIL (confirmed not met). Where a requirement is stated as a specific FRD phase bullet (not just the acceptance table), that bullet is quoted directly so a gap against it isn't confused with a looser interpretive miss.

## F01 — Ask whether refinancing is worthwhile

**Required:** "Decision result separates facts, assumptions, estimates and missing inputs."

**Verdict: PASS.**

`refinanceAnalysisResult` (`askOrchestrator.service.ts:5968`) returns a `TABLE` block whose rows are explicitly labeled by kind: `'current-rate'` is "Your recorded mortgage rate" (a fact, sourced from the Property Financing Profile), `'market-rate'` is "Market benchmark rate" (an external observation, sourced and dated from `mortgageRateService.getLatestSnapshot()`), `'target-rate'` is "Modeled target scenario rate" (an estimate, explicitly labeled "Illustrative target set to the latest benchmark—not a lender quote"), and `'monthly-savings'`/`'lifetime-savings'`/`'break-even'` are modeled estimates with their own "meaning" column disclosing they're principal-and-interest or interest-difference projections, not guarantees. Missing inputs are handled by a distinct earlier branch (`MORTGAGE_PROFILE_INCOMPLETE`) rather than being silently defaulted into the table. This is a clean, direct pass — the clearest evidence base in this track.

## F02 — Edit a supported rate or term assumption

**Required (acceptance table):** "Recalculated revision; original analysis available; no fact silently overwritten."
**Required (Phase 3 bullet, quoted directly):** "Separate recorded facts, editable scenario assumptions, external observations, estimates and recommendations... Editing an analysis assumption must not silently overwrite a canonical mortgage fact or enable monitoring."

**Original verdict: FAIL.**

There was no mechanism to edit a scenario assumption on `REFINANCE_ANALYSIS` at all — confirmed by re-reading the handler's own signature: `async function refinanceAnalysisResult(userId: string, propertyId: string): Promise<AskOperationResult>` (`askOrchestrator.service.ts:5968`) took **no `message` parameter**, unlike every other operation in this track (`refinanceRateMonitorResult`, `savingsOpportunitiesResult`, `ownershipCostsResult`, `propertyTaxAppealReadinessResult` all take `message` and parse it for a lens/focus/threshold). There was nothing in the handler body for a user's free-text edit to reach. The one row that looks like it might be user-adjustable — `'target-rate'`, "Modeled target scenario rate" — was hardcoded to `result.marketRatePct` and its own `meaning` column said "Illustrative target set to the latest benchmark," confirming it wasn't a variable the homeowner could move.

The only place a value could be written at all was the `MORTGAGE_PROFILE_INCOMPLETE` branch's `captureRequests`, and that path is explicitly the opposite of what this scenario needs: it writes directly into the canonical `PropertyFinancingProfile` (`destinationLabel: 'Saved to this home's Financing Profile'`), which is a fact write, not a revisable what-if. Supplying a missing balance/rate/term there is F03's scenario, not F02's — and using it as a stand-in for "editing an assumption" would be the exact anti-pattern Phase 3's own bullet warns against ("must not silently overwrite a canonical mortgage fact").

This contrasted with `HVAC_DECISION_SCENARIO` (verified in the Phase 7 Decisions document, D02), which *does* implement a genuine isolated-scenario mechanism — a hypothetical run that never overwrites the recorded decision. No equivalent existed anywhere in this file for refinance. Originally scored FAIL rather than PARTIAL because the acceptance table's core subject (editing an assumption and getting a recalculated revision) had zero implementation to partially credit, not a gap in an existing mechanism.

**FIXED, same session, 2026-09-17: `PASS`.** The fix reuses a real, already-tested mechanism this codebase already had — `RefinanceRadarService.runScenario` (`refinanceRadar.service.ts:683`), the same engine the standalone Mortgage Refinance Radar workspace itself uses, confirmed by direct read to take a `saveScenario: boolean` flag: when `false`, it computes and returns a full recalculation (`calcRefinanceScenario`, `compareRefinanceTerms`, `compareRefinanceDecisionAlternatives`) without ever writing a `RefinanceScenarioSnapshot` row, and it never touches `PropertyFinancingProfile` at all — it only *reads* the canonical mortgage context via `getMortgageContext`. `refinanceAnalysisResult` now takes a `message` parameter; a new `parseRefinanceScenarioEdit` helper gates on an explicit hypothetical-edit framing ("what if," "suppose," "instead of my current rate/term," "if I refinanced") plus a parseable target rate or term — deliberately narrower than a bare number mention, so a homeowner asking "is refinancing worth it at 6%?" is not misread as requesting an edit. When the gate matches, the operation calls `runScenario` with `saveScenario: false` and returns an entirely separate, clearly-labeled response ("Illustrative scenario—not a lender quote or a saved plan," an explicit "nothing was saved, and your recorded mortgage rate and term are unchanged" disclosure) rather than combining it with the canonical comparison — mirroring `HVAC_DECISION_SCENARIO`'s own isolated-scenario shape rather than inventing a new pattern. The canonical analysis is unaffected and reproduced exactly by asking again without the hypothetical framing, satisfying "original analysis available" without needing to render both in the same turn.

**Verification level: 8 new unit tests** in `tests/ask/refinanceScenarioEditParsing.test.js` covering the parser directly (rate-only, term-only, combined, alternate framing phrases, the false-positive guard for a bare number with no hypothetical framing, framing with no parseable value, an unrelated question, and word-form term numbers) — all pass, alongside a clean `tsc --noEmit` and the existing 48-test Ask governance/follow-up/view-state suite (all green, confirming no regression). `runScenario`'s own underlying calculation logic already has dedicated, pre-existing test coverage (`refinanceCalculation.test.js`, `refinanceScenarioCostValidation.test.js`) — not re-verified here since this fix only wires an existing, already-tested mechanism into a new caller. **Not** database- or browser-verified, consistent with every other document and fix in this series.

## F03 — Supply a missing mortgage fact

**Required:** "Canonical capture path and refreshed analysis/readiness."

**Verdict: PASS.**

The `MORTGAGE_PROFILE_INCOMPLETE` branch (`askOrchestrator.service.ts:5987–6017`) is a real canonical capture path: a `GROUP` `captureRequests` entry with per-field `inputSchema` (`currentMortgageBalanceUsd`, `interestRatePct`, `remainingTermYears`, optional `monthlyPaymentUsd`), an explicit `destinationLabel: 'Saved to this home's Financing Profile'`, and a `confirmationText` disclosure before the write. "Refreshed analysis" is satisfied structurally rather than by an explicit refresh mechanism: `refinanceAnalysisResult` re-reads `getProfile(propertyId)` fresh on every call with no caching, so the very next ask after the fact is saved reflects it automatically. `propertyTaxAppealReadinessResult` (`askOrchestrator.service.ts:3857`) follows the identical canonical-capture pattern via `askCaptureRequest(requirement, context.contextVersion, 'Saved to the canonical property-tax and Property Context records', href)` for readiness gaps. Both confirm the requirement.

## F04 — Enable a rate monitor

**Required:** "Explicit threshold/channel review; no monitor created by analysis alone."

**Verdict: PASS.**

`REFINANCE_ANALYSIS` and `REFINANCE_RATE_MONITOR` are architecturally separate operations — `refinanceAnalysisResult` never calls anything that creates a monitor, and its own summary action only links to the Mortgage Refinance Radar workspace, never to monitor creation. `refinanceRateMonitorResult` (`askOrchestrator.service.ts:6074`) requires its own explicit message with a parsed threshold (`parseRateThreshold`) and produces a `NEEDS_CONFIRMATION` result with a full disclosure `confirmation.fields` list before anything is created: benchmark product (15 vs. 30-year, parsed from the message), threshold, channel ("Email plus in-app notification"), cadence, quiet hours (with the homeowner's actual timezone), and an explicit source boundary ("Governed national benchmark—not a personalized lender quote"). `editableFields: []` means every one of those fields is disclosed as fixed at confirm time, not silently defaulted. Delivery eligibility is also checked before any confirmation is even offered (`REFINANCE_ALERT_ROLLOUT_UNAVAILABLE`/`REFINANCE_ALERT_DELIVERY_UNAVAILABLE`), so Ask never claims an alert is live when it isn't.

## F05 — External rates or property facts changed

**Required:** "Refresh shows changed inputs and invalidates stale recommendation where material."

**Verdict: PARTIAL — the answer differs by operation, and one operation fails this outright.**

`REFINANCE_ANALYSIS`, `OWNERSHIP_COSTS`, and `SAVINGS_OPPORTUNITIES` all pass cleanly: none of them persist a cached analysis object at all. `refinanceAnalysisResult` re-reads `getProfile`/`getFinancialContextDecisions`/`mortgageRateService.getLatestSnapshot()` live on every call. `ownershipCostsResult` calls `ownershipCostReadModelService.getCurrent(propertyId, userId, lens, { refresh: true })` with an explicit `refresh: true` flag (`askOrchestrator.service.ts:3704`). `savingsOpportunitiesResult` computes from `homeSavingsService.getSummary`/`hiddenAssetService.getMatchesForProperty`/`savingsBenefitsUnifiedService.getUnified` fresh each call. For all three, there is no stale value to invalidate because nothing is cached — every ask is already a refresh.

`CAPITAL_RESERVE_PLAN` **fails this scenario**. `capitalReservePlanResult` (`askOrchestrator.service.ts:3816`) calls `homeCapitalTimelineService.getLatestTimeline(propertyId)` first, and only calls `runTimeline` (the actual recomputation) **when `!analysis`** — i.e., only the very first time, when no timeline row exists yet. Direct re-reading of `getLatestTimeline` (`homeCapitalTimeline.service.ts:268–282`) confirms it is a bare "most recent row" read (`prisma.homeCapitalTimelineAnalysis.findFirst({ where: { propertyId }, orderBy: { computedAt: 'desc' }, ... })`) with no comparison against current inventory, property state, or a context version — there is no staleness field, no `propertyContextVersion` check on read, and no invalidation trigger anywhere else in the service that would mark an existing row stale when inventory changes. Once a homeowner has asked this once, every subsequent ask — no matter how many systems are added, removed, or replaced afterward — serves the same frozen timeline forever. This is a genuine, specific gap: the scenario names exactly this failure mode ("property facts changed... invalidates stale recommendation where material") and the code has no mechanism to satisfy it for this one operation.

## F06 — Savings data is only partially available

**Required:** "Partial totals and missing coverage, never a false complete savings amount."

**Verdict: PASS.**

`savingsOpportunitiesResult` keeps four categories structurally separate and never sums them into one number: `recurring` (top estimated opportunities), `reviewedBenefits`, `inProgress`, and `realized` are distinct `GROUPED_LIST` sections, each with its own count. The empty-state copy is explicit about the distinction the scenario is probing: `'No current savings opportunity is recorded—not the same as zero savings'` (line 3599), and the realized-total path states outright "Realized value is counted only from a recorded RECEIVED outcome; estimates and actions in progress are kept separate" (line 3602). The `homeSavings.potentialAnnualSavings` headline is explicitly scoped as "the highest single net annual estimate, not a sum across categories" (line 3607) — there is no code path that adds partial category estimates together and presents the result as one complete savings figure.

## F07 — Open the owning financial tool and return

**Required:** "Same analysis context restored and revalidated."

**Verdict: PARTIAL — no operation achieves both halves of this requirement together.**

Consistent with every other track verified in this audit series (Buyer's B07, Decisions' D05), there is no operation-level view-state or position-restoration mechanism anywhere in Financial and ownership — `MaintenanceViewState` remains the only such mechanism in the entire 77-operation registry (Phase 0 §2.5). Within that constraint, the six Financial operations split into two groups that each satisfy only one half of "restored and revalidated":

- `REFINANCE_ANALYSIS`, `OWNERSHIP_COSTS`, and `SAVINGS_OPPORTUNITIES` **revalidate without restoring**: because none of them cache anything (per F05 above), returning to Ask after visiting the owning tool always produces a fully fresh, fully revalidated analysis — but there is no persisted "context" with its own identity to point back at; each ask is a brand-new computation, not a resumed one. This satisfies "revalidated" honestly but has nothing that could be called "restored."
- `CAPITAL_RESERVE_PLAN` **restores without revalidating**: `homeCapitalTimelineAnalysis` is a real persisted row with its own identity (`computedAt`, `horizonYears`), so returning to Ask after visiting the capital timeline workspace does show the same analysis consistently — but per F05, that consistency is an artifact of the missing invalidation logic, not evidence of a working restore-and-revalidate mechanism. `PROPERTY_TAX_APPEAL_READINESS` similarly re-evaluates via `propertyTaxAppealReadinessService.evaluate(propertyId, userId, ground)` on every call (its `contextVersion` is drawn from `context.contextVersion`, itself computed fresh), so it lands in the same "revalidates but nothing is restored" bucket as the first three, not the capital-plan bucket.

No operation in this track combines a real persisted analysis identity with an invalidation check against it — the compound requirement ("same... restored AND revalidated") isn't met by any single operation, even though most of the individual halves are covered somewhere in the track.

## F08 — Estimated benefit is unavailable or not meaningful

**Required:** "No forced action; explain the limiting input or result."

**Verdict: PASS.**

Every operation in this track has multiple honest degradation branches that explain the limitation rather than forcing an action or hiding behind a default value:

- `REFINANCE_ANALYSIS`: `NO_MORTGAGE` → "A mortgage refinance analysis does not apply..."; `MORTGAGE_PROFILE_INCOMPLETE` → explicit capture request, not an assumed-zero balance; `MARKET_RATE_UNAVAILABLE` → "Ask will not use model knowledge or an undated rate as the market benchmark"; radar-unavailable → "Review the financing profile and try again," none of these carry an action button that forces a commitment.
- `OWNERSHIP_COSTS`: the `try/catch` around `ownershipCostReadModelService.getCurrent` returns `'A current ownership-cost total is not ready yet'` with "Missing categories are not treated as zero" stated explicitly (line 3713).
- `CAPITAL_RESERVE_PLAN`: the empty-inventory branch (`CAPITAL_PLAN_INVENTORY_REQUIRED`) states "A reserve target without recorded systems would be a generic guess" rather than fabricating one (line 3839).
- `PROPERTY_TAX_APPEAL_READINESS`: `NOT_COVERED` → "Ask cannot determine filing readiness without an active reviewed jurisdiction rule," and even in the ready path, "Unknown facts remain unknown and are never treated as zero" (line 3876) and "Readiness does not predict appeal success" (line 3873) are both stated directly in the body text.
- `SAVINGS_OPPORTUNITIES`: covered under F06 above — the empty state is explicit rather than a false zero.

None of these branches present an action as required to proceed; every one offers a workspace link as an option alongside an honest explanation of what's missing or unavailable.

## Summary

| ID | Required outcome | Verdict |
| --- | --- | --- |
| F01 | Decision separates facts/assumptions/estimates/missing inputs | **PASS** |
| F02 | Edit an assumption → recalculated revision, no silent fact overwrite | **FIXED → PASS** — wired `RefinanceRadarService.runScenario(saveScenario:false)` into `REFINANCE_ANALYSIS`; 8 new unit tests green, `tsc` clean; not live/browser-verified |
| F03 | Missing fact → canonical capture path, refreshed analysis | **PASS** |
| F04 | Enable monitor → explicit threshold/channel review, never auto-created | **PASS** |
| F05 | External change → refresh shows it, invalidates stale recommendation | **PARTIAL** — true for `REFINANCE_ANALYSIS`/`OWNERSHIP_COSTS`/`SAVINGS_OPPORTUNITIES` (nothing cached); **fails** for `CAPITAL_RESERVE_PLAN` (frozen after first computation, no invalidation) |
| F06 | Partial savings data → partial totals, never a false complete amount | **PASS** |
| F07 | Open owning tool and return → same context restored and revalidated | **PARTIAL** — no operation combines both halves; three ops revalidate with nothing to restore, one op restores without revalidating |
| F08 | Benefit unavailable/not meaningful → no forced action, explain why | **PASS** |

**6 of 8 scenarios now pass fully, 2 remain partial, 0 fail.** This track originally had the first scenario in the audit series scored a clean FAIL rather than PARTIAL, and the first gap traced directly to an explicit FRD phase bullet rather than just the acceptance-scenario table: Phase 3 requires `REFINANCE_ANALYSIS` to separate "editable scenario assumptions" from canonical facts, and the implementation had no such concept — its only user-writable path was the canonical `captureRequests` fact-capture flow. That gap is now closed: `RefinanceRadarService.runScenario`, an existing, already-tested, non-persisting scenario engine, is now wired into `REFINANCE_ANALYSIS` behind an explicit hypothetical-framing gate. `CAPITAL_RESERVE_PLAN`'s missing invalidation (F05) remains a concrete, specific, unfixed gap: once computed, a capital timeline is served unchanged regardless of subsequent inventory or property changes, with no staleness check anywhere in `homeCapitalTimeline.service.ts`. F07's partial score also remains — it reflects the same structural absence of any operation-level view-state mechanism already documented for Buyer (B07) and Decisions (D05), compounded here by the fact that the one operation with a persisted analysis identity (`CAPITAL_RESERVE_PLAN`) only has that identity because it isn't revalidating.
