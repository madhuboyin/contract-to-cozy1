---
title: "Home Intelligence Phase 0 — Registry and Ownership Report"
document_type: "Implementation status report"
status: "Phase 0 complete"
date: "2026-08-23"
generated_from: "scripts/generate-home-intelligence-phase0-report.ts (npm run report:home-intelligence-phase0)"
---

# Home Intelligence Phase 0 — Registry and Ownership Report

Companion artifact to [`HOME_INTELLIGENCE_FUNCTIONAL_COMPLETENESS_FRD_AND_IMPLEMENTATION_PLAN.md`](./HOME_INTELLIGENCE_FUNCTIONAL_COMPLETENESS_FRD_AND_IMPLEMENTATION_PLAN.md) §15 Phase 0. This is the "one generated registry report [that] can trace every active recommendation source from fact/signal through action, work, completion, and outcome owner" Phase 0's functional exit criterion calls for. Every table below is generated directly from the registries under `apps/backend/src/services/intelligence/` and `canonicalCapabilityRegistry` — not hand-typed — by `scripts/generate-home-intelligence-phase0-report.ts`; a parity test fails CI if this file stops matching that script's output.

Phase 0 ships six registries under `apps/backend/src/services/intelligence/`, each validated at process boot in `apps/backend/src/index.ts` alongside the existing Ask and Decision Platform registry checks:

| Registry | File | Populated? |
| --- | --- | --- |
| Home Action producer ownership | `homeActionProducerOwnership.ts` | Yes — 23/23 producers |
| Home Action adapter ownership (source-kind rollup) | `homeActionAdapterOwnership.ts` | Yes — derived from the producer registry |
| Capability/skill/guidance bridge | `capabilitySkillGuidanceBridge.registry.ts` | Yes — 33 capabilities bridged; 0 of 23 sourceKinds-claiming capabilities uncovered |
| Completion evidence policy | `completionEvidencePolicy.registry.ts` | Yes — 4/4 safety tiers |
| Intelligence consumer registry | `intelligenceConsumerRegistry.ts` | Empty by design — Phase 2 populates it |
| Compound rule registry | `compoundRuleRegistry.contract.ts` | Empty by design — Phase 5 populates it |

The last two are contract-only: nothing in the codebase yet invokes recompute handlers or compound rules, so populating them now would be dead code (see each file's header comment).

---

## 1. Home Action producer inventory and ownership

`getHomeActionFeed()` (`apps/backend/src/services/homeActions.service.ts`) has no dynamic adapter registry today — it concatenates output from three call sites, the largest of which (`getPromotedHomeActions()` in `homeActionSourcePromotion.service.ts`) runs the producers below. All producers normalize through `adaptHomeActionSource()`. `apps/backend/src/services/intelligence/homeActionProducerOwnership.ts` is the single source of truth for per-producer completion and work-item ownership; `homeActionAdapterOwnership.ts`'s source-kind-level table is derived from it, not maintained independently.

| Producer | Source file | Fact/signal origin | Source kind | Supported commands | Command owner | Completion adapter | Outcome owner | Work-item eligible | Id prefix(es) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `adaptEnvironmentInsightsToHomeActions` | `apps/backend/src/services/homeActionSourcePromotion.service.ts` | EnvironmentInsight[] — passed in by the caller (already-fetched weather/environment API results), not a direct DB query inside this adapter. | MAINTENANCE | `ACKNOWLEDGE`, `DEFER`, `SNOOZE`, `DISMISS`, `NOT_RELEVANT`, `CORRECT_FACT` | Generic default (executeHomeActionCommand, services/homeActions.service.ts): snoozeAction for DEFER/SNOOZE, recordOrchestrationEvent otherwise. | No | No | Yes (MAINTENANCE) | `environment:` |
| `loadGuidanceActions` | `apps/backend/src/services/homeActionSourcePromotion.service.ts` | ProjectRecord + GuidanceJourney (prisma.projectRecord.findMany with its guidance journey/step include). | GUIDANCE | `ACKNOWLEDGE`, `DEFER`, `SNOOZE`, `DISMISS`, `NOT_RELEVANT`, `CORRECT_FACT` | Generic default (executeHomeActionCommand, services/homeActions.service.ts): snoozeAction for DEFER/SNOOZE, recordOrchestrationEvent otherwise. | No | No | Yes (GUIDANCE) | _none_ |
| `loadIncidentActions` | `apps/backend/src/services/homeActionSourcePromotion.service.ts` | Incident (prisma.incident.findMany). | INCIDENT | `ACKNOWLEDGE`, `DEFER`, `SNOOZE`, `DISMISS`, `NOT_RELEVANT`, `CORRECT_FACT` | Generic default (executeHomeActionCommand, services/homeActions.service.ts): snoozeAction for DEFER/SNOOZE, recordOrchestrationEvent otherwise. | No | No | Yes (INCIDENT) | `incident:` |
| `loadSeasonalChecklistActions` | `apps/backend/src/services/homeActionSourcePromotion.service.ts` | SeasonalChecklist (prisma.seasonalChecklist.findMany). | MAINTENANCE | `SNOOZE`, `NOT_RELEVANT` | Generic default (executeHomeActionCommand, services/homeActions.service.ts): snoozeAction for DEFER/SNOOZE, recordOrchestrationEvent otherwise. | No | No | No | `seasonal-checklist:` |
| `loadRecallActions` | `apps/backend/src/services/homeActionSourcePromotion.service.ts` | RecallMatch (prisma.recallMatch.findMany). | RECALL | `ACKNOWLEDGE`, `DEFER`, `SNOOZE`, `DISMISS`, `NOT_RELEVANT`, `CORRECT_FACT` | Generic default (executeHomeActionCommand, services/homeActions.service.ts): snoozeAction for DEFER/SNOOZE, recordOrchestrationEvent otherwise. | No | No | Yes (RECALL) | `recall:` |
| `loadInspectionFindingActions` | `apps/backend/src/services/homeActionSourcePromotion.service.ts` | InspectionFinding (prisma.inspectionFinding.findMany). | INSPECTION_FINDING | `ACKNOWLEDGE`, `DEFER`, `SNOOZE`, `DISMISS`, `NOT_RELEVANT`, `CORRECT_FACT` | Generic default (executeHomeActionCommand, services/homeActions.service.ts): snoozeAction for DEFER/SNOOZE, recordOrchestrationEvent otherwise. | No | No | No | `inspection-finding:` |
| `loadCoverageActions` | `apps/backend/src/services/homeActionSourcePromotion.service.ts` | CoverageReview (prisma.coverageReview.findMany). | COVERAGE | `ACKNOWLEDGE`, `DEFER`, `SNOOZE`, `DISMISS`, `NOT_RELEVANT`, `CORRECT_FACT` | Generic default (executeHomeActionCommand, services/homeActions.service.ts): snoozeAction for DEFER/SNOOZE, recordOrchestrationEvent otherwise. | No | No | Yes (COVERAGE) | _none_ |
| `loadCoverageRenewalActions` | `apps/backend/src/services/homeActionSourcePromotion.service.ts` | Warranty + InsurancePolicy (prisma.warranty.findMany, prisma.insurancePolicy.findMany). | COVERAGE | `ACKNOWLEDGE`, `DEFER`, `SNOOZE`, `DISMISS`, `NOT_RELEVANT`, `CORRECT_FACT` | Generic default (executeHomeActionCommand, services/homeActions.service.ts): snoozeAction for DEFER/SNOOZE, recordOrchestrationEvent otherwise. | No | No | Yes (COVERAGE) | `coverage-renewal:` |
| `loadHealthInsightActions` | `apps/backend/src/services/homeActionSourcePromotion.service.ts` | Property + InventoryItem + Warranty (prisma.property.findUnique with inventoryItems/warranties include) — a computed health score, not one single domain record. | SYSTEM | `ACKNOWLEDGE`, `DEFER`, `SNOOZE`, `DISMISS`, `NOT_RELEVANT`, `CORRECT_FACT` | Generic default (executeHomeActionCommand, services/homeActions.service.ts): snoozeAction for DEFER/SNOOZE, recordOrchestrationEvent otherwise. | No | No | No | `health-insight:` |
| `loadRepairReplaceDecisionActions` | `apps/backend/src/services/homeActionSourcePromotion.service.ts` | ReplaceRepairAnalysis (prisma.replaceRepairAnalysis.findMany). | GUIDANCE | `ACKNOWLEDGE`, `DEFER`, `SNOOZE`, `DISMISS`, `NOT_RELEVANT`, `CORRECT_FACT` | Generic default (executeHomeActionCommand, services/homeActions.service.ts): snoozeAction for DEFER/SNOOZE, recordOrchestrationEvent otherwise. | No | No | Yes (GUIDANCE) | `repair-replace:` |
| `loadPersonalizationActions` | `apps/backend/src/services/homeActionSourcePromotion.service.ts` | PersonalizedRecommendation (prisma.personalizedRecommendation.findMany). | PERSONALIZATION | `COMPLETE`, `DEFER`, `SNOOZE`, `DISMISS`, `ALREADY_DONE`, `NOT_RELEVANT`, `CORRECT_FACT` | applyPersonalizationHomeActionLifecycle (modules/personalization/application/applyHomeActionLifecycle.usecase.ts), routed by source.kind === PERSONALIZATION in executeHomeActionCommand. | Yes — applyPersonalizationHomeActionLifecycle (modules/personalization/application/applyHomeActionLifecycle.usecase.ts) | No | No | `personalization:` |
| `loadProjectActions` | `apps/backend/src/services/homeActionSourcePromotion.service.ts` | ProjectRecord (prisma.projectRecord.findMany). | PROJECT | `ACKNOWLEDGE`, `DEFER`, `SNOOZE`, `DISMISS`, `NOT_RELEVANT`, `CORRECT_FACT` | Generic default (executeHomeActionCommand, services/homeActions.service.ts): snoozeAction for DEFER/SNOOZE, recordOrchestrationEvent otherwise. | No | No | Yes (PROJECT) | `project:` |
| `loadSalePrepActions` | `apps/backend/src/services/homeActionSourcePromotion.service.ts` | PropertySaleCase (prisma.propertySaleCase.findUnique). | SALE_PREP | `ACKNOWLEDGE`, `DEFER`, `SNOOZE`, `DISMISS`, `NOT_RELEVANT`, `CORRECT_FACT` | Generic default (executeHomeActionCommand, services/homeActions.service.ts): snoozeAction for DEFER/SNOOZE, recordOrchestrationEvent otherwise. | No | No | Yes (SALE_PREP) | _none_ |
| `loadRefinanceDataRequiredActions` | `apps/backend/src/services/homeActionSourcePromotion.service.ts` | DomainEvent (prisma.domainEvent.findFirst). | SYSTEM | `SNOOZE`, `DISMISS`, `NOT_RELEVANT`, `NO_MORTGAGE`, `CORRECT_FACT` | markPropertyAsHavingNoMortgage (services/homeActions.service.ts) for the exact-id NO_MORTGAGE command only, by exact string match (not an id-prefix check) in executeHomeActionCommand; every other command falls through to the generic default. | No | No | No | `refinance-data-required:` |
| `loadRefinanceOpportunityActions` | `apps/backend/src/services/homeActionSourcePromotion.service.ts` | PropertyRefinanceRadarState (prisma.propertyRefinanceRadarState.findUnique). | SYSTEM | `DEFER`, `SNOOZE`, `DISMISS`, `NOT_RELEVANT`, `CORRECT_FACT` | Generic default (executeHomeActionCommand, services/homeActions.service.ts): snoozeAction for DEFER/SNOOZE, recordOrchestrationEvent otherwise. | No | No | No | _none_ |
| `loadHomeDigitalTwinFactReviewActions` | `apps/backend/src/services/homeActionSourcePromotion.service.ts` | HomeDigitalTwin (prisma.homeDigitalTwin.findUnique). | SYSTEM | `DISMISS`, `SNOOZE`, `NOT_RELEVANT`, `CORRECT_FACT` | Generic default (executeHomeActionCommand, services/homeActions.service.ts): snoozeAction for DEFER/SNOOZE, recordOrchestrationEvent otherwise. | No | No | No | `home-digital-twin-fact-review:` |
| `loadHomeCapitalTimelineMaterialWindowActions` | `apps/backend/src/services/homeActionSourcePromotion.service.ts` | HomeCapitalTimelineAnalysis (prisma.homeCapitalTimelineAnalysis.findFirst). | SYSTEM | `DISMISS`, `SNOOZE`, `NOT_RELEVANT`, `CORRECT_FACT` | Generic default (executeHomeActionCommand, services/homeActions.service.ts): snoozeAction for DEFER/SNOOZE, recordOrchestrationEvent otherwise. | No | No | No | _none_ |
| `loadPropertyTaxAppealCaseActions` | `apps/backend/src/services/homeActionSourcePromotion.service.ts` | PropertyTaxAppealCase (prisma.propertyTaxAppealCase.findFirst). | SYSTEM | `SNOOZE`, `DISMISS`, `NOT_RELEVANT` | Generic default (executeHomeActionCommand, services/homeActions.service.ts): snoozeAction for DEFER/SNOOZE, recordOrchestrationEvent otherwise. | No | No | No | `property-tax-appeal-case:` |
| `loadSavingsBenefitsActions` | `apps/backend/src/services/homeActionSourcePromotion.service.ts` | SavingsBenefitAction (prisma.savingsBenefitAction.findMany) + PropertyHiddenAssetMatch (prisma.propertyHiddenAssetMatch.findMany) — two id-prefixed sub-shapes. | SAVINGS_BENEFITS | `ACKNOWLEDGE`, `DEFER`, `SNOOZE`, `DISMISS`, `NOT_RELEVANT`, `CORRECT_FACT` | Generic default (executeHomeActionCommand, services/homeActions.service.ts): snoozeAction for DEFER/SNOOZE, recordOrchestrationEvent otherwise. | No | No | No | `savings-benefit-action:`, `savings-benefit-match:` |
| `loadOwnershipCostChangeActions` | `apps/backend/src/services/homeActionSourcePromotion.service.ts` | OwnershipCostSnapshot (prisma.ownershipCostSnapshot.findFirst). | SYSTEM | `COMPLETE`, `DEFER`, `SNOOZE`, `DISMISS`, `ALREADY_DONE`, `NOT_RELEVANT`, `CORRECT_FACT` | ownershipCostDecisionService.record (services/ownershipCosts/ownershipCostDecision.service.ts), routed by OWNERSHIP_COST_CHANGE_ID_PREFIX in executeHomeActionCommand — owns every command for this producer, not completion only. | Yes — ownershipCostDecisionService.record (services/ownershipCosts/ownershipCostDecision.service.ts), routed by id prefix in executeHomeActionCommand (homeActions.service.ts) (id-prefix exception, not the source kind default) | No | No | `ownership-cost-change:` |
| `adaptOrchestratedActionToHomeAction` | `apps/backend/src/services/orchestration.service.ts` | Risk assessment engine output (orchestration.service.ts) — a pre-computed action object passed in by the caller, not a direct DB query inside this adapter; the underlying domain signal varies per orchestrated risk type. | _dynamic per-action_ | `ACKNOWLEDGE`, `DEFER`, `SNOOZE`, `DISMISS`, `NOT_RELEVANT`, `CORRECT_FACT` | Generic default (executeHomeActionCommand, services/homeActions.service.ts): snoozeAction for DEFER/SNOOZE, recordOrchestrationEvent otherwise. | No | No | No | _none_ |
| `getActivationFirstValue` | `apps/backend/src/services/entryContext.service.ts` | PropertyOnboarding.activeTriggerId, resolved by sourceAdapterForTrigger (entryContext.service.ts) to whichever domain record the trigger type points at (Incident/Warranty/InsurancePolicy/etc.). | _dynamic per-action_ | `COMPLETE`, `DEFER`, `SNOOZE`, `DISMISS`, `NOT_RELEVANT`, `CORRECT_FACT` | recordFirstActionResolution (services/entryContext.service.ts), routed by ACTIVATION_ID_PREFIX in executeHomeActionCommand — applies only to the "activation:" id family. The "activation-context:" family this producer also emits (see notes) falls through to the generic default and has no COMPLETE control, so it never reaches this owner. | Yes — recordFirstActionResolution (services/entryContext.service.ts), routed by id prefix in executeHomeActionCommand (homeActions.service.ts) (id-prefix exception, not the source kind default) | No | No | `activation:` |
| `appendAcceptedOperationalWork` | `apps/backend/src/services/homeActions.service.ts` | OperationalWorkItem (prisma.operationalWorkItem.findMany, acceptanceState: ACCEPTED). | _dynamic per-action_ | `CORRECT_FACT`, `SNOOZE` | Generic default (executeHomeActionCommand, services/homeActions.service.ts): snoozeAction for DEFER/SNOOZE, recordOrchestrationEvent otherwise. | No | No | No | `operational-work:` |

Also re-entering the feed independent of the producers above but included in the table: `appendAcceptedOperationalWork()` projects already-`ACCEPTED` `OperationalWorkItem` rows back in with `presentation.variant: 'ACCEPTED_WORK'`.

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

No formal three-way capability↔skill↔guidance link existed before Phase 0. `apps/backend/src/services/intelligence/capabilitySkillGuidanceBridge.registry.ts` is the code-owned bridge, cross-validated at boot against `canonicalCapabilityRegistry`, the Ask operation registry, and the skill registry. It also now enforces completeness against every capability whose `recommendation.sourceKinds` is non-empty (23 of 46 total capabilities) — a capability reachable only via an Ask operation, with no `sourceKinds` claim, has no independent canonical signal to check against and is not covered by that completeness check.

| Capability | Operations | Skill(s) resolved |
| --- | --- | --- |
| `break-even` | _none — Home Action only_ | — |
| `capital-timeline` | CAPITAL_RESERVE_PLAN | capital-planning |
| `coverage-intelligence` | COVERAGE_GAPS | coverage |
| `diy` | _none — Home Action only_ | — |
| `guidance-overview` | GUIDANCE_JOURNEY_CREATE | — |
| `hoa-compliance` | _none — Home Action only_ | — |
| `home-briefing` | _none — Home Action only_ | — |
| `home-digital-twin` | _none — Home Action only_ | — |
| `home-digital-will` | _none — Home Action only_ | — |
| `home-event-radar` | _none — Home Action only_ | — |
| `home-habit-coach` | _none — Home Action only_ | — |
| `home-operations` | HOME_ACTIONS | — |
| `home-records` | INVENTORY_LOOKUP | property-record |
| `home-renovation-risk-advisor` | RENOVATION_PERMIT_READINESS | renovation |
| `home-risk-replay` | _none — Home Action only_ | — |
| `inspection-hub` | _none — Home Action only_ | — |
| `maintenance` | MAINTENANCE_STATUS, MAINTENANCE_TASK_CREATE, MAINTENANCE_TASK_COMPLETE, MAINTENANCE_TASK_UPDATE, HOME_DEADLINE_MONITOR | maintenance |
| `material-specs` | _none — Home Action only_ | — |
| `mortgage-refinance-radar` | REFINANCE_ANALYSIS, REFINANCE_RATE_MONITOR | refinance |
| `neighborhood-change-radar` | _none — Home Action only_ | — |
| `ownership-costs` | OWNERSHIP_COSTS | ownership-cost |
| `permits` | _none — Home Action only_ | — |
| `plant-advisor` | _none — Home Action only_ | — |
| `project-tracker` | _none — Home Action only_ | — |
| `property-brief` | PROPERTY_SUMMARY, MAJOR_EVENT_ENTRY | property-record, seller-preparation |
| `property-tax` | PROPERTY_TAX_APPEAL_READINESS | property-tax |
| `quote-comparison` | QUOTE_COMPARISON_CREATE, QUOTE_COMPARISON_REVIEW | quote-comparison |
| `replace-repair` | REPLACEMENT_GUIDANCE | repair-replace |
| `savings-benefits` | SAVINGS_OPPORTUNITIES | savings |
| `sell-hold-rent` | SELL_HOLD_RENT_ANALYSIS | sell-hold-rent |
| `seller-prep` | _none — Home Action only_ | — |
| `service-price-radar` | _none — Home Action only_ | — |
| `status-board` | _none — Home Action only_ | — |

**Known gaps this registry documents but does not close:** `guidanceJourneyTypeKeys` is empty for every entry above. No real capability↔guidance-journey linkage exists anywhere in the codebase today — guidance journeys are keyed by `signalIntentFamilies`, not capability id, and journey step `toolKey` strings are informal/free-text, not validated against `canonicalCapabilityRegistry`. Filling this in is HI-SKL work for a later phase, not Phase 0 — populating it now would mean inventing mappings not backed by real behavior. `outcomeAdapter` is also `null` for every entry above — see §6.

---

## 4. Canonical read boundary decision (FRD Phase 0 work item 4)

**Decision:** `buildPriorityListView()` in `apps/backend/src/services/decisionPlatform/priorityListPolicy.ts`, applied over `homeActions.service.ts`'s `getHomeActionFeed()`, is the canonical read boundary. It is already correctly implemented and already consumed by two of the ten systems in §2 (Ask/Cozy and proactive notification delivery). Phase 1 generalizes this exact pattern to the other eight — Resolution Center/Fix, Status Board (both layers), Guidance Engine/dashboard hero (all three layers), the remaining notification paths, and Home Briefing — rather than introducing a new boundary.

---

## 5. Completion evidence policy (FRD §8.5 HI-OUT-002)

Defined in `apps/backend/src/services/intelligence/completionEvidencePolicy.registry.ts`, keyed by the existing `RecommendationSafetyTier` enum (`recommendationGovernance.contract.ts`) rather than a new parallel tier — every `HomeAction.governance.safetyTier` already carries this value.

| Safety tier | Minimum completion behavior |
| --- | --- |
| `LOW_CONSEQUENCE` | Homeowner attestation permitted. |
| `MATERIAL_FINANCIAL` | Attestation plus cost/result; document or domain record when available. |
| `REGULATED_COVERAGE` | Domain completion record or document evidence; policy/claim linkage where applicable. |
| `SAFETY_EMERGENCY` | Domain-owned resolution plus evidence or qualified-professional confirmation; simple dismissal prohibited. |

Not yet consumed anywhere (a later phase wires it into the completion UI); defined now so that phase has a validated contract to build against.

---

## 6. Outcome observation reality (FRD §8.5 HI-OUT-005)

The FRD §15 Phase 0 functional exit criterion asks the registry report to trace every active recommendation source through to its "outcome owner." The honest answer today: **0 of 23** Home Action producers have one.

`OutcomeObservationSourceType` (prisma/schema.prisma) already declares all 9 source types HI-OUT-005 calls for (`HOMEOWNER_REPORTED`, `COMPLETED_MAINTENANCE_RECORD`, `OPERATIONAL_WORK_ITEM`, `PROJECT_RECORD`, `BOOKING_RECORD`, `CLAIM_RECORD`, `INSPECTION_FINDING`, `DOCUMENT_PROMOTION`, `COVERAGE_DECISION`, `HOME_EVENT`), but `outcomeObservationService.ts` only implements creation for 2 of them: `recordHomeownerReportedOutcome` (reachable only from Ask/Cozy chat, `askOrchestrator.service.ts`) and `recordCompletedMaintenanceOutcome` (implemented, but has zero callers anywhere in the codebase). Neither is wired into `executeHomeActionCommand`'s COMPLETE path for any producer — completing a Home Action never creates an OutcomeObservation today, regardless of source.

This is real, verified functionality that HI-OUT-005 still needs to build — expanding outcome creation to the other 7 source types and wiring it into the Home Action completion path is a later-phase implementation project, not a Phase 0 registry-and-ownership gap. Phase 0's job here is honest declaration: `hasOutcomeAdapter`/`outcomeAdapterOwner` in `homeActionProducerOwnership.ts` and `homeActionAdapterOwnership.ts`, and the derived `outcomeAdapter` field in `capabilitySkillGuidanceBridge.registry.ts`, all resolve to false/null today — mechanically consistent with each other (validated at boot) and traceable in the table above, rather than a hardcoded placeholder.

---

## What Phase 0 did not touch

Every system listed in §2 continues to rank independently, unchanged. No API response shape, ranking order, or UI changed in this phase — Phase 0 is registries, contracts, and ownership consolidation only, per the FRD's own §16 sequencing.
