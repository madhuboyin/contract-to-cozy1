# Ask Cozy Cross-Domain Interaction Rollout — Phase 5 Read-Only Attention Acceptance Scenario Verification

**Status:** Complete — the 6 acceptance scenarios Phase 5 is actually scoped to (T01–T03, T08–T10) evaluated.
**Verdict: 4 full passes, 1 partial, 1 fail.** The fail is structural, not a bug: T03's "all-property view" doesn't exist anywhere in Ask — every one of the 77 registered operations except 5 non-property ones (`CAPABILITY_DISCOVERY`, the 3 boundaries, `GROUNDED_GUIDANCE`) is scoped to exactly one property, confirmed directly from `askOperationRegistry.ts`'s own `requiresProperty` flags.
**Governs:** [Ask Cozy — Cross-Domain Interaction Rollout FRD](../product/ASK_COZY_CROSS_DOMAIN_INTERACTION_ROLLOUT_FRD.md) §14.3 (T01–T10) and §21 Phase 5's exit criterion ("T01–T03 and T08–T10 pass without depending on unresolved attention-control semantics").
**Builds on:** [Phase 0 Coverage Audit](ASK_COZY_PHASE0_COVERAGE_AUDIT.md) §4.9, which traced all 5 Phase-5 operations (`HOME_ACTIONS`, `MAINTENANCE_FORECAST`, `INTELLIGENCE_ENVELOPE_QUERY`, `HOME_CHANGE_SUMMARY`, `INSPECTION_FINDINGS`) to the handler level. This document re-reads the code — including `rankAndDeduplicateHomeActions` in `homeActions.service.ts`, not read at this depth during Phase 0 — against each specific scenario.
**Verification level: STATIC.** Every verdict below is derived from reading `askOrchestrator.service.ts`'s `homeActionsResult`/`maintenanceForecastResult`/`intelligenceEnvelopeQueryResult`/`homeChangeSummaryResult`/`inspectionFindingsResult`, `homeActions.service.ts`'s `rankAndDeduplicateHomeActions`, and `askOperationRegistry.ts`'s operation definitions directly. Nothing here is database- or browser-verified.

## Why only 6 of the 10 scenarios

T04–T07 (`DISMISS`, `ALREADY_HANDLED`, `REMIND_LATER`, and dismiss-near-safety) are explicitly out of scope for Phase 5 — the FRD's own Phase 5 bullet says "Do not expose `DISMISS`, `ALREADY_HANDLED` or `REMIND_LATER` in this phase," and Phase 5's exit criterion only names T01–T03 and T08–T10. That gate is Phase 9's ("T04–T07 pass and every exposed control has a tested typed dispatch outcome"), already confirmed absent platform-wide during Phase 0 Stage 1 (`interactionDispatch.ts` maps `DISMISS`/`REMIND_LATER` to `UNSUPPORTED`) and reconfirmed untestable for the same reason in the Phase 8 Protection document (P08). Scoring them here would just repeat that finding under a different scenario ID.

## Methodology

Same as the Phase 6/7/8/Financial verifications: PASS (fully confirmed by code), PARTIAL (part of the requirement met, a specific part isn't), FAIL (confirmed not met — reserved for a requirement the FRD says is in scope *now*, as distinct from Protection's P08, which is unscored because its own precondition is explicitly deferred to a later phase).

## T01 — Several domains have active attention items

**Required:** "Deterministic categorized ordering with source/time/uncertainty."

**Verdict: PASS.**

`HOME_ACTIONS` is the strongest evidence here. `rankAndDeduplicateHomeActions` (`homeActions.service.ts:726–784`) sorts by `HOME_ACTION_PRIORITY_ORDER[priority]`, then `score.score`, then `a.winner.id.localeCompare(b.winner.id)` as an explicit final tie-break — fully deterministic, no model involvement in ordering, and the `GROUPED_LIST` block's own description says so directly: "Priority and order come from the canonical Home Action feed. Ask does not independently rerank them" (`askOrchestrator.service.ts:4502`). Each item's `meta` array carries `action.source.kind` (source), `action.timing.dueAt`/`rationale` (time), and `action.confidence.label` (uncertainty) — all three required fields present per item. `INSPECTION_FINDINGS`' query independently confirms the same discipline at the database level: `orderBy: [{ severity: 'asc' }, { updatedAt: 'desc' }]` (`askOrchestrator.service.ts:3055`) — a DB-enforced deterministic order with its own tie-break, not application-level sorting that could drift.

## T02 — Same underlying issue appears from two producers

**Required:** "Honest grouping/deduplication with all material evidence retained."

**Verdict: PARTIAL.**

The dedup mechanism itself is genuinely careful, not a naive first-wins collapse. `rankAndDeduplicateHomeActions` merges by `canonicalKey`, and when two producers project the same concern off different clocks, timing is explicitly merged to the more material value rather than arbitrarily kept from the "winner": `current.timing = isWeatherPreparationRevision ? laterWeatherPreparationTiming(...) : earlierTiming(current.timing, action.timing)` (line 748–750), with a code comment explaining why ("the homeowner should see the earliest actionable date, not the winner's"). Every merged-away duplicate's id is retained in `deduplication.mergedActionIds` (line 777) for traceability.

What isn't retained: the merged-away duplicate's own `evidence` array. The winning action keeps only its own `evidence` list (`{ ...winner, timing: entry.timing, ... }` — no evidence union), and `homeActionsResult`'s `EVIDENCE` block later iterates only `selectedActions` (the winners) for evidence items (`askOrchestrator.service.ts:4527–4534`). If two producers surface the same concern with materially different supporting evidence (e.g., one has a specific dollar estimate the other lacks), only the winning producer's evidence survives into what the homeowner sees — the losing producer's evidence is dropped, not merged, with only its bare ID left as a trace. The single most material fact the scenario is likely probing — the deadline/timing — genuinely is retained honestly (earliest wins); the broader "all material evidence" is not.

## T03 — Switch from selected-property to all-property view

**Required:** "Property labels and boundaries preserved; no cross-property action retargeting."

**Verdict: FAIL.**

There is no all-property view to switch to. `askOperationRegistry.ts`'s own `ASK_OPERATION_DEFINITIONS` shows `HOME_ACTIONS`, `MAINTENANCE_FORECAST`, `INTELLIGENCE_ENVELOPE_QUERY`, `HOME_CHANGE_SUMMARY`, and `INSPECTION_FINDINGS` are all declared `requiresProperty: true` (confirmed by direct grep: `HOME_ACTIONS: definition('HOME_ACTIONS', ..., true, ...)`, same for the other four). Across the entire 77-operation registry, only 5 operations pass `false` — `CAPABILITY_DISCOVERY`, `EMERGENCY_BOUNDARY`, `UNSAFE_RESTRICTED_BOUNDARY`, `OUT_OF_SCOPE_BOUNDARY`, `GROUNDED_GUIDANCE` — none of which are attention/list operations. A repository-wide search for `allProperty`/`ALL_PROPERT`/`portfolio` inside `apps/backend/src/services/ask/` returns zero matches. This isn't a case of an existing mechanism having a gap (like T02); the capability the scenario names doesn't exist at all.

This differs from Protection's P08 (`DISMISS`), which the FRD explicitly defers to a named later phase and which was therefore left unscored rather than failed. ATT-104 ("Selected-property and all-property modes are distinct...") carries no such phase deferral, and Phase 5's own bullet lists "property boundary" as in-scope work for this phase. Scored FAIL rather than left untestable, because the FRD's own phase sequencing says this requirement should already be met.

## T08 — Source becomes unavailable

**Required:** "Item becomes partial/unavailable; no 'all clear' state."

**Verdict: PASS, carried by one operation with a materially stronger mechanism than the rest of the track.**

`INTELLIGENCE_ENVELOPE_QUERY` implements exactly this. `queryIntelligenceEnvelope`'s result carries a `page.diagnostics` array; when non-empty, the operation returns `status: 'READY_WITH_LIMITATIONS'` with `reasonCode: 'INTELLIGENCE_ENVELOPE_PARTIAL'` and an explicit `BOUNDARY` block naming the exact failing producer and code: `body: page.diagnostics.map((diagnostic) => \`${diagnostic.producerModel}: ${diagnostic.code}\`).join('; ')` (`askOrchestrator.service.ts:6645–6653`). This never collapses into a false "all clear" — the summary's own `tone` is set to `'CAUTION'` whenever diagnostics exist (line 6611), and the partial state is visible alongside whatever data *did* come back, not instead of it.

`HOME_ACTIONS` is materially weaker on this specific scenario. Its `diagnostics` object (`homeActions.service.ts:1330–1354`) tracks counts (`candidateCount`, `surfacedCount`, `duplicateCount`, `suppressedCount`, `emptyStateReason`) but has no per-producer up/down signal comparable to Envelope's. If one underlying producer inside `getHomeActionFeed` fails without throwing, there's no mechanism visible in the diagnostics shape to mark the resulting gap as "partial" the way T08 asks — it would either throw (caught by `homeActionsResult`'s own try/catch into a coarse, honest, but track-wide `UNAVAILABLE`, not a per-item partial state) or silently produce fewer candidates with no visible signal that a source was down. Scored PASS on the strength of `INTELLIGENCE_ENVELOPE_QUERY`'s real implementation of this requirement, with the `HOME_ACTIONS` gap noted rather than hidden.

## T09 — Complete underlying work from another surface

**Required:** "Attention item reconciles without duplicate action."

**Verdict: PASS.**

All 5 Phase-5 operations recompute fully live from canonical Prisma state on every call — none of them cache a prior result. `getHomeActionFeed` is called fresh inside `homeActionsResult` with no memoization; `listForecast`/`generateForecast` read/write the live forecast table; `queryIntelligenceEnvelope` reads the live envelope; `listPropertyChanges` and the `prisma.inspectionFinding.findMany` call in `inspectionFindingsResult` are both direct, unmemoized queries. Because a Home Action is *derived* from live canonical state rather than stored as an independent redundant record, completing the underlying work on another surface (e.g., marking a maintenance task done directly) means the next ask simply no longer generates that candidate — there is no separate "attention item" record that could go stale or need a second, duplicate action to clear. This is architectural rather than a specific reconciliation feature, consistent with ATT-110's requirement and with the same live-recompute pattern already confirmed across every other track in this audit series.

## T10 — No actionable items remain

**Required:** "Honest completion/empty state with no forced suggestion."

**Verdict: PASS.**

Every operation in this track has a distinct, honest empty state rather than a generic "nothing to see" or a forced next action: `HOME_ACTIONS` uses `homeActionEmptyCopy(feed.diagnostics.emptyStateReason)`, varying the message by the actual reason (not a single canned string); `HOME_CHANGE_SUMMARY`'s empty state states explicitly, "This covers [sources]. It is not a confirmation that nothing at all happened at this property — only that no material change was recorded in these sources" (`askOrchestrator.service.ts:3416–3417`) — actively guarding against the false-completeness reading; `INSPECTION_FINDINGS` returns "No open confirmed inspection findings" with an optional (not forced) link to the Inspection Hub and an empty `suggestions` array; `MAINTENANCE_FORECAST`'s `NOT_APPLICABLE` branch names the specific reason ("no verified HVAC, roof, or water-heater inventory items"). None of these branches carry a mandatory action — every action offered is a `style: 'PRIMARY'`/`'SECONDARY'` link the homeowner can ignore, not a control the operation requires interacting with to proceed.

## Summary

| ID | Required outcome | Verdict |
| --- | --- | --- |
| T01 | Deterministic categorized ordering with source/time/uncertainty | **PASS** |
| T02 | Honest grouping/dedup with all material evidence retained | **PARTIAL** — timing/deadline genuinely merged to the most material value; merged-away duplicates' own evidence items are dropped, not unioned |
| T03 | Property labels/boundaries preserved switching to all-property view | **FAIL** — no all-property view exists anywhere in Ask; every attention operation requires exactly one property |
| T08 | Source unavailable → item partial/unavailable, never false all-clear | **PASS** — via `INTELLIGENCE_ENVELOPE_QUERY`'s real per-producer diagnostics; `HOME_ACTIONS` has no equivalent per-producer signal |
| T09 | Complete elsewhere → reconciles without duplicate action | **PASS** — architectural: every op recomputes live from canonical state, nothing cached to go stale |
| T10 | No items remain → honest empty state, no forced suggestion | **PASS** |

**4 of 6 in-scope scenarios pass fully, 1 partial, 1 fails.** This track's failure mode is different from every prior track verified in this series: T03 isn't a weak or missing implementation of an existing mechanism (like Buyer's B04 or Financial's F05) — it's a scenario built around a capability (all-property attention view) that the platform has never implemented for any operation, confirmed directly from the registry's own `requiresProperty` declarations. T02's partial score is a genuine, specific gap in an otherwise careful dedup implementation: the earliest-timing-wins logic shows real engineering thought went into *which* value survives a merge, but that same care wasn't extended to the evidence array. T08's pass rests entirely on `INTELLIGENCE_ENVELOPE_QUERY` — it remains, as Phase 0 first found, the strongest single operation in the whole 77-operation registry on freshness and coverage disclosure, and this track's one requirement that specifically depends on that strength would not pass on `HOME_ACTIONS` alone.
