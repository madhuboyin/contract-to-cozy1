---
title: "Home Intelligence Phase 0 — Registry and Ownership Report"
document_type: "Implementation status report"
status: "Phase 0 complete"
date: "August 23, 2026"
generated_from: "apps/backend/src/services/intelligence/"
---

# Home Intelligence Phase 0 — Registry and Ownership Report

Companion artifact to [`HOME_INTELLIGENCE_FUNCTIONAL_COMPLETENESS_FRD_AND_IMPLEMENTATION_PLAN.md`](./HOME_INTELLIGENCE_FUNCTIONAL_COMPLETENESS_FRD_AND_IMPLEMENTATION_PLAN.md) §15 Phase 0. This is the "one generated registry report [that] can trace every active recommendation source from fact/signal through action, work, completion, and outcome owner" Phase 0's functional exit criterion calls for. It reflects what the codebase actually contains as of this pass — every table below was derived by reading the real source, not inferred from the FRD's abstractions.

Phase 0 shipped four registries under `apps/backend/src/services/intelligence/`, each validated at process boot in `apps/backend/src/index.ts` alongside the existing Ask and Decision Platform registry checks:

| Registry | File | Populated? |
| --- | --- | --- |
| Home Action adapter ownership | `homeActionAdapterOwnership.ts` | Yes — 11/11 source kinds |
| Capability/skill/guidance bridge | `capabilitySkillGuidanceBridge.registry.ts` | Yes — 15 capabilities, 22 operations |
| Completion evidence policy | `completionEvidencePolicy.registry.ts` | Yes — 4/4 safety tiers |
| Intelligence consumer registry | `intelligenceConsumerRegistry.ts` | Empty by design — Phase 2 populates it |
| Compound rule registry | `compoundRuleRegistry.contract.ts` | Empty by design — Phase 5 populates it |

The last two are contract-only: nothing in the codebase yet invokes recompute handlers or compound rules, so populating them now would be dead code (see each file's header comment).

---

## 1. Home Action source inventory and ownership

`getHomeActionFeed()` (`apps/backend/src/services/homeActions.service.ts`) has no dynamic adapter registry today — it concatenates output from three call sites, the largest of which (`getPromotedHomeActions()` in `homeActionSourcePromotion.service.ts`) is a fixed list of 17 loader functions. All producers normalize through `adaptHomeActionSource()`, keyed only by `source.kind` (11 values) — so ownership below is declared at that granularity, which is the real granularity of today's completion/work-key decisions. `apps/backend/src/services/intelligence/homeActionAdapterOwnership.ts` is now the single source of truth for the three columns that used to live in three separate hardcoded structures.

| Source kind | Completion adapter | Work-item eligible | Loaders producing this kind |
| --- | --- | --- | --- |
| `PERSONALIZATION` | **Yes** — `applyPersonalizationHomeActionLifecycle` | No | `loadPersonalizationActions` |
| `MAINTENANCE` | No (ACKNOWLEDGE only) | Yes | `loadSeasonalChecklistActions`, `adaptEnvironmentInsightsToHomeActions` |
| `GUIDANCE` | No | Yes | `loadGuidanceActions` |
| `PROJECT` | No | Yes | `loadProjectActions` |
| `INCIDENT` | No | Yes | `loadIncidentActions` |
| `RECALL` | No | Yes | `loadRecallActions` |
| `COVERAGE` | No | Yes | `loadCoverageActions` |
| `SALE_PREP` | No (completion via Sale Case self-report) | Yes | `loadSalePrepActions` |
| `SYSTEM` | No, except id-prefix carve-outs `ownership-cost-change:*` / `activation:*` handled directly in `executeHomeActionCommand` | No | `loadRefinanceDataRequiredActions`, `loadRefinanceOpportunityActions`, `loadHomeDigitalTwinFactReviewActions`, `loadHomeCapitalTimelineMaterialWindowActions`, `loadPropertyTaxAppealCaseActions`, `loadOwnershipCostChangeActions`, plus `orchestration.service.ts` risk-assessment actions and `entryContext.service.ts` activation/missing-context actions |
| `SAVINGS_BENEFITS` | No | No | `loadSavingsBenefitsActions` |
| `INSPECTION_FINDING` | No | No (not promoted into a work item yet) | `loadInspectionFindingActions` |

Also re-entering the feed independent of the loaders above: `appendAcceptedOperationalWork()` projects already-`ACCEPTED` `OperationalWorkItem` rows back in with `presentation.variant: 'ACCEPTED_WORK'`.

**Known gap this table documents but does not close (Phase 1+ work):** the `SYSTEM` kind alone covers ~7 semantically distinct loaders (refinance, capital timeline, tax appeal, digital-twin fact review, ownership-cost, risk assessment, activation) with no per-loader ownership declaration — only two of them (`ownership-cost-change:*`, `activation:*`) get a real completion path today, via id-prefix string matching inside `executeHomeActionCommand` rather than a declared adapter. Moving to per-loader (not per-kind) ownership is a larger refactor than Phase 0 scope.

---

## 2. Independent priority calculations (inventory only — Phase 1 converts these)

Ten systems outside `homeActions.service.ts` independently compute urgency/priority/rank for "what needs attention," confirmed by direct code read. None were modified this phase — HI-ATT-001 through HI-ATT-004 (making `getHomeActionFeed()` the sole ranking authority) is Phase 1. Listing them here so Phase 1 starts from a real inventory instead of rediscovering them.

| # | File | Surface | What it computes independently |
| --- | --- | --- | --- |
| 1 | `apps/backend/src/services/resolutionCenter.service.ts` | Fix | Own priority scale (`critical/high/medium/low`), own status model, three separate sort functions (`sortCases`, `sortActions`) — no import of `homeActions.service.ts` at all |
| 2 | `apps/backend/src/services/homeStatusBoard.service.ts` | Status Board (backend) | `CONDITION_SEVERITY` + `CATEGORY_PRIORITY_WEIGHT` weighted sort |
| 3 | `apps/frontend/.../status-board/utils/priorityUtils.ts` | Status Board (frontend) | Re-ranks *again*, client-side, on top of #2, with yet a third weight set (`RECOMMENDATION_PRIORITY`) |
| 4 | `apps/backend/src/services/guidanceEngine/guidancePriority.service.ts` | Dashboard hero / Morning Pulse | `GuidancePriorityService.score()` — an entirely parallel weighted-score system (severity/urgency/financial/safety/confidence/readiness), zero references to Home Actions |
| 5 | `apps/frontend/.../DashboardHeroSection.tsx` | Dashboard hero | Ranks *again* on top of #4's already-scored guidance data (`estimateHeroStrength`, `rankHeroCandidates`) — the hero item is scored three times total across #4/#5 for this one surface |
| 6 | `apps/frontend/.../MorningPulseSection.tsx` | Dashboard | `PULSE_DOMAIN_ORDER` + own `deriveUrgency()`, on the same guidance-engine data as #4/#5 |
| 7 | `apps/backend/src/services/notification.service.ts` | Notifications | `resolveAttentionPriority()` fallback, used whenever a caller doesn't pass an explicit priority |
| 8 | `apps/backend/src/services/maintenanceReminder.service.ts`, `newHomeWarrantyDeadline.service.ts` | Notifications | Each computes its own `daysUntilDue`-based priority/urgency independently |
| 9 | `apps/backend/src/modules/homeEventRadar/services/radarNotificationDelivery.service.ts` | Notifications | Writes directly to the `Notification` table, bypassing `NotificationService.create` entirely, with its own urgency mapping |
| 10 | `apps/backend/src/homeBriefing/homeBriefing.service.ts` | Home Briefing | Independent `urgency`/materiality computation, separate from Home Action priority |

**Positive counter-example — the pattern Phase 1 should generalize, not replace:** `apps/backend/src/services/decisionPlatform/priorityListPolicy.ts`'s `buildPriorityListView()` is a genuinely pure, DB-free projection of `homeActions.service.ts`'s already-ranked feed — it never re-ranks. `askOrchestrator.service.ts` (Ask/Cozy) and `homeActionProactiveDelivery.service.ts` (external proactive notifications) already consume it correctly today.

---

## 3. Capability/skill/guidance bridge

No formal three-way capability↔skill↔guidance link existed before this phase. The closest prior art was an untyped `ASK_OPERATION_CAPABILITY: Partial<Record<AskOperationId, string>>` map inline in `askOrchestrator.service.ts` — 22 entries, no startup validation, no cross-check against the capability registry, skill registry, or operation registry. `apps/backend/src/services/intelligence/capabilitySkillGuidanceBridge.registry.ts` replaces it with the same real mappings, now grouped by capability, cross-validated at boot (`validateCapabilitySkillGuidanceBridge` — HI-SKL-002), and with launch destination / required context derived directly from `canonicalCapabilityRegistry` instead of hand-duplicated.

| Capability | Operations | Skill(s) resolved |
| --- | --- | --- |
| `maintenance` | `MAINTENANCE_STATUS`, `MAINTENANCE_TASK_CREATE`, `MAINTENANCE_TASK_COMPLETE`, `MAINTENANCE_TASK_UPDATE`, `HOME_DEADLINE_MONITOR` | `maintenance` |
| `coverage-intelligence` | `COVERAGE_GAPS` | `coverage` |
| `savings-benefits` | `SAVINGS_OPPORTUNITIES` | `savings` |
| `ownership-costs` | `OWNERSHIP_COSTS` | `ownership-cost` |
| `home-records` | `INVENTORY_LOOKUP` | `property-record` |
| `property-brief` | `PROPERTY_SUMMARY`, `MAJOR_EVENT_ENTRY` | (per-operation skill resolution) |
| `home-operations` | `HOME_ACTIONS` | — |
| `replace-repair` | `REPLACEMENT_GUIDANCE` | `repair-replace` |
| `mortgage-refinance-radar` | `REFINANCE_ANALYSIS`, `REFINANCE_RATE_MONITOR` | `refinance` |
| `sell-hold-rent` | `SELL_HOLD_RENT_ANALYSIS` | `sell-hold-rent` |
| `guidance-overview` | `GUIDANCE_JOURNEY_CREATE` | — |
| `quote-comparison` | `QUOTE_COMPARISON_CREATE`, `QUOTE_COMPARISON_REVIEW` | `quote-comparison` |
| `capital-timeline` | `CAPITAL_RESERVE_PLAN` | `capital-planning` |
| `property-tax` | `PROPERTY_TAX_APPEAL_READINESS` | `property-tax` |
| `home-renovation-risk-advisor` | `RENOVATION_PERMIT_READINESS` | `renovation` |

**Known gap this registry documents but does not close:** `guidanceJourneyTypeKeys` is empty for every entry above. No real capability↔guidance-journey linkage exists anywhere in the codebase today — guidance journeys are keyed by `signalIntentFamilies`, not capability id, and journey step `toolKey` strings are informal/free-text, not validated against `canonicalCapabilityRegistry`. Filling this in is HI-SKL work for Phase 6, not Phase 0 — populating it now would mean inventing mappings not backed by real behavior.

---

## 4. Canonical read boundary decision (FRD Phase 0 work item 4)

**Decision:** `buildPriorityListView()` in `apps/backend/src/services/decisionPlatform/priorityListPolicy.ts`, applied over `homeActions.service.ts`'s `getHomeActionFeed()`, is the canonical read boundary. It is already correctly implemented and already consumed by two of the ten systems in §2 (Ask/Cozy and proactive notification delivery). Phase 1 generalizes this exact pattern to the other eight — Resolution Center/Fix, Status Board (both layers), Guidance Engine/dashboard hero (all three layers), the remaining notification paths, and Home Briefing — rather than introducing a new boundary.

---

## 5. Completion evidence policy (FRD §8.5 HI-OUT-002)

Defined in `apps/backend/src/services/intelligence/completionEvidencePolicy.registry.ts`, keyed by the existing `RecommendationSafetyTier` enum (`recommendationGovernance.contract.ts`) rather than a new parallel tier — every `HomeAction.governance.safetyTier` already carries this value. Rows are the FRD table verbatim. Not yet consumed anywhere (Phase 4 wires it into the completion UI); defined now so Phase 4 has a validated contract to build against.

---

## What Phase 0 did not touch

Every system listed in §2 continues to rank independently, unchanged. `apps/backend/src/services/homeActionSourcePromotion.service.ts`'s 17 loaders are unchanged. No API response shape, ranking order, or UI changed in this phase — Phase 0 is registries, contracts, and ownership consolidation only, per the FRD's own §16 sequencing.
