# Guidance Engine Homeowner CTA Audit FRD

Version: 1.1
Date: March 28, 2026
Status: Audit-only (no implementation changes)
Owner: Product + Engineering

## 1. Scope

This audit covers HOMEOWNER journeys only (EXISTING_OWNER and HOME_BUYER) and all homeowner-facing surfaces where a CTA can move a user through risk mitigation.

CTA definition used in this audit:
Any actionable UI element where there is an opportunity to guide the user through an end-to-end issue-resolution journey.

Out of scope:
- Provider-side dashboards
- Admin-only screens
- Purely informational/non-actionable UI

## 1.1 Audit Method and Surfaces Reviewed

Audit method:
- Read Guidance Engine template, resolver, execution guard, and completion-hook code paths.
- Enumerated homeowner-facing CTA surfaces and validated route/context propagation.
- Classified each CTA against intended end-to-end journey behavior.

Primary homeowner surfaces reviewed:
- Dashboard home surfaces (`/dashboard`, hero, Morning Pulse, Action Center, local updates, home tools rail)
- Property risk surfaces (`/dashboard/properties/:id/risk-assessment`, `/dashboard/risk-radar`)
- Guidance and AI/home tool surfaces (`guidance-overview`, replace-repair, coverage-intelligence, coverage-options, service-price-radar, negotiation-shield, do-nothing, home-savings, true-cost, capital-timeline, home-event-radar)
- Coverage and warranty surfaces (`inventory/coverage`, item coverage, `/dashboard/warranties`)
- Execution surfaces (`/dashboard/providers`, provider detail, booking form, bookings list/detail)
- Notifications and action orchestration (`/dashboard/notifications`, `/dashboard/actions`)
- Tool catalogs (`/dashboard/home-tools`, `/dashboard/ai-tools`)

## 2. Canonical Homeowner Journeys and Required Tools

| Journey ID | Intended End-to-End Journey | Required Home/AI Tools |
|---|---|---|
| J1 | Asset lifecycle resolution: decide repair vs replace, check coverage, validate price, negotiate, book, track | replace-repair, true-cost, coverage-intelligence, service-price-radar, negotiation-shield, providers/booking, maintenance/status-board |
| J2 | Coverage gap resolution: identify gap, estimate uninsured cost, compare options, update policy/docs | coverage-intelligence, service-price-radar, coverage-options, inventory coverage, warranties/documents |
| J3 | Recall safety resolution: acknowledge alert, review remedy, confirm resolution, schedule service if needed | recalls, coverage-intelligence (optional), providers/booking |
| J4 | Weather risk resolution: review risk, protect systems, check coverage, schedule follow-up | home-event-radar, maintenance, coverage-intelligence (optional), providers/booking |
| J5 | Inspection follow-up resolution: assess urgency, estimate costs, route specialist, track completion | inspection-report, replace-repair (optional), coverage-intelligence (optional), service-price-radar, providers/booking, guidance-overview |
| J6 | Financial exposure resolution: estimate out-of-pocket, compare act vs delay, find savings, execute and plan timeline | true-cost, do-nothing-simulator, home-savings, coverage-intelligence (optional), providers/booking, capital-timeline |
| J7 | Cost-of-inaction resolution: model delay cost, estimate total cost, coverage check, offset savings, execute | do-nothing-simulator, true-cost, coverage-intelligence, home-savings, providers/booking |
| J8 | Compliance resolution: understand requirement, evaluate coverage, complete maintenance tasks, schedule compliance service | guidance-overview, coverage-intelligence, maintenance, providers/booking |
| J9 | Energy efficiency resolution: review signal, find savings, estimate improvement cost, plan capital, book work | home-event-radar, home-savings, service-price-radar, capital-timeline, providers/booking |
| J10 | Neighborhood change tracking: monitor high-impact external changes and review implications | neighborhood-change-radar, guidance-overview |

## 3. CTA Inventory (All Homeowner Surfaces)

Classification values:
- existing + fully functional
- existing but needs updates
- missing tool (build new)

| CTA ID | Surface | CTA | Intended Journey | Required Tools | Classification | Severity |
|---|---|---|---|---|---|---|
| CTA-001 | /dashboard What To Do Next panel | Step-based primary guidance CTA | J1-J9 | Guidance API + journey tool route resolution | existing + fully functional | - |
| CTA-002 | /dashboard What To Do Next panel | See all steps drawer CTA | J1-J9 | Guidance drawer + step list | existing + fully functional | - |
| CTA-003 | Property hero action card | Step-based hero CTA | J1-J9 | useGuidance + GuidancePrimaryCta | existing + fully functional | - |
| CTA-004 | Morning Pulse rows | Review now / Open path | J1-J10 | useGuidance + route resolver | existing + fully functional | - |
| CTA-005 | Smart Context Tools section | Open recommended tool | J1-J10 | toolRegistry + property-aware routing | existing + fully functional | - |
| CTA-006 | Home Tools rail | Open any home tool | J1-J10 | mobileToolCatalog + per-tool routes | existing + fully functional | - |
| CTA-007 | Risk Assessment matrix row | Guidance step CTA in row | J1/J2/J3/J5 | useGuidance + row CTA resolver | existing but needs updates | High |
| CTA-008 | Risk Assessment matrix row | Schedule inspection/replacement | J1/J5 | providers search + booking | existing but needs updates | Medium |
| CTA-009 | Risk Assessment matrix row | Add Home Warranty | J2 | warranties + inventory coverage | existing but needs updates | Medium |
| CTA-010 | Property health insight list | Schedule inspection/book repair | J1/J5 | providers + booking + context | existing but needs updates | High |
| CTA-011 | Property health insight list | Check quote | J1/J5/J9 | service-price-radar | existing + fully functional | - |
| CTA-012 | Property health insight list | Manage appliance warranties | J2 | warranties | existing + fully functional | - |
| CTA-013 | Coverage Intelligence tool | Run analysis | J2/J6/J7 | coverage-analysis + guidance completion hook | existing + fully functional | - |
| CTA-014 | Coverage Intelligence tool | Get coverage for selected item | J2 | item coverage analysis + warranties | existing + fully functional | - |
| CTA-015 | Coverage Options tool | Get coverage | J2 | inventory item coverage | existing + fully functional | - |
| CTA-016 | Coverage Options tool | Repair/Replace | J1/J2 | replace-repair tool | existing + fully functional | - |
| CTA-017 | Coverage Options tool | Mark coverage options reviewed | J2 | recordGuidanceToolCompletion | existing + fully functional | - |
| CTA-018 | Item coverage tool | Run item-level worth-it analysis | J2 | item coverage analysis | existing + fully functional | - |
| CTA-019 | Item coverage tool | Add warranty coverage | J2 | warranties create flow | existing + fully functional | - |
| CTA-020 | Property inventory coverage | Get coverage / Quotes / Info / Replace-Repair | J2 | item coverage, quote modal, replace-repair | existing + fully functional | - |
| CTA-021 | Replace-Repair tool | Run analysis | J1/J5 | replaceRepairAnalysis + guidance completion hook | existing + fully functional | - |
| CTA-022 | Service Price Radar tool | Check quote | J1/J2/J5/J9 | servicePriceRadar + guidance completion hook | existing + fully functional | - |
| CTA-023 | Service Price Radar tool | Need help responding? | J1/J5/J9 | negotiation-shield handoff | existing + fully functional | - |
| CTA-024 | Negotiation Shield tool | Analyze case / mark step complete | J1/J5/J9 | negotiationShield + guidance completion hook | existing + fully functional | - |
| CTA-025 | Do Nothing Simulator tool | Run simulation / mark step complete | J6/J7 | doNothing simulator + guidance hook | existing + fully functional | - |
| CTA-026 | Home Savings tool | Run comparison / mark step complete | J6/J7/J9 | home-savings + guidance hook | existing + fully functional | - |
| CTA-027 | True Cost tool | Compute estimate / mark step complete | J1/J6/J7 | true-cost + guidance hook | existing + fully functional | - |
| CTA-028 | Capital Timeline tool | Mark timeline step complete | J6/J9 | capital-timeline + guidance completion card | existing + fully functional | - |
| CTA-029 | Guidance Overview tool | Open journey step + mark reviewed | J1-J10 | guidance APIs + completion hook | existing + fully functional | - |
| CTA-030 | Home Event Radar | Review event + mark radar review complete | J4/J9/J10 | home-event-radar + guidance completion card | existing + fully functional | - |
| CTA-031 | Recalls page | Confirm / Dismiss / Resolve recall | J3 | recalls controller + guidance hook | existing + fully functional | - |
| CTA-032 | Recalls page | Mark step complete | J3 | recordGuidanceToolCompletion | existing + fully functional | - |
| CTA-033 | Maintenance page | Add task | J4/J5/J8 | maintenance tasks + scheduling | existing but needs updates | Medium |
| CTA-034 | Maintenance page | Mark checklist complete (guidance step) | J4/J5/J8 | guidance completion card | existing + fully functional | - |
| CTA-035 | Providers list | View profile | J1/J4/J5/J6/J7/J8/J9 | execution guard + profile routing | existing + fully functional | - |
| CTA-036 | Provider profile | Book now | J1/J4/J5/J6/J7/J8/J9 | execution guard + booking handoff | existing + fully functional | - |
| CTA-037 | Provider booking form | Submit booking | J1/J4/J5/J6/J7/J8/J9 | booking controller + guard + completion hook | existing + fully functional | - |
| CTA-038 | Booking detail page | Mark booking step complete | J1/J4/J5/J6/J7/J8/J9 | guidance completion card | existing + fully functional | - |
| CTA-039 | Notifications page | Open actionUrl deep link | J1-J10 | notification actionUrl + target surface | existing but needs updates | Medium |
| CTA-040 | Action Center page | Schedule task / Continue / View in Maintenance | Cross-journey operational | orchestration + maintenance tasks | existing but needs updates | High |
| CTA-041 | Warranties page | Add/Edit/Upload warranty docs | J2 | warranties + docs | existing + fully functional | - |
| CTA-042 | Status Board | View item / edit override / hidden/pin controls | J1/J4/J5 (monitoring) | status-board + inventory drawer | existing but needs updates | Low |
| CTA-043 | Dashboard local updates card | External CTA URL open | J10/market/contextual | local updates feed + ctaUrl | existing but needs updates | Low |
| CTA-044 | /dashboard/actions (All Actions) | Orchestration card CTA (schedule task / already scheduled / view in maintenance) | J1-J9 (operational handoff) | OrchestrationActionCard + maintenance setup modal | existing but needs updates | High |
| CTA-045 | /dashboard/actions and Action Center | Decision trace actions (mark completed, snooze, undo) | J1-J9 (operational tracking) | decision trace + completion modal + snooze APIs | existing but needs updates | Medium |
| CTA-046 | /dashboard/risk-radar | Review Action Center | J1-J9 | risk-radar -> actions routing | existing but needs updates | Medium |
| CTA-047 | /dashboard/risk-radar | Open Full Risk Assessment | J1-J9 | risk-radar -> risk-assessment routing | existing + fully functional | - |
| CTA-048 | /dashboard/home-tools | QuickActionTile open tool | J1-J10 | home tool catalog route builder | existing but needs updates | Medium |
| CTA-049 | /dashboard/ai-tools | QuickActionTile open AI tool | J1-J10 | AI tool catalog route builder | existing but needs updates | Medium |
| CTA-050 | /dashboard/ai-tools | Intelligence detail links (Daily Snapshot / Risk Radar) | J1-J10 (monitoring) | deep links to intelligence pages | existing but needs updates | Low |

## 4. Gap Register (Severity-Ranked)

### G-01 (High)
Gap type: existing but needs updates
Issue: Risk matrix guidance CTA selection is domain-only, not asset-scoped.
Impact: Users can get the wrong journey CTA for a row (for example HVAC row opens a different system journey).
Evidence:
- `pickGuidanceActionForAsset` picks first action by issue domain priority, not by `inventoryItemId` or `homeAssetId`.
- `AssetRiskDetail` row data does not include item-level guidance identifiers.

### G-02 (High)
Gap type: existing but needs updates
Issue: Some execution steps route to `/dashboard/bookings` (list page) instead of provider discovery/booking entry.
Impact: Journey can stall at execution step because there is no direct booking creation CTA from this entry.
Evidence:
- `asset_lifecycle_resolution.book_service` route: `/dashboard/bookings`
- `inspection_followup_resolution.route_specialist` route: `/dashboard/bookings`

### G-03 (High)
Gap type: existing but needs updates
Issue: Signal resolver family maps are incomplete relative to template families.
Impact: Several journeys can ingest as `OTHER/UNKNOWN` unless callers always provide explicit issue domain/stage/readiness.
Evidence:
- Template families: 20
- Missing in resolver maps: `energy_inefficiency_detected`, `high_utility_cost`, `permit_required`, `hoa_violation_detected`, `safety_inspection_due`, `flood_risk`, `hurricane_risk`, `wind_risk`, `heat_risk`, `wildfire_risk`, `generic_actionable_signal`.

### G-04 (Medium)
Gap type: existing but needs updates
Issue: `cost_of_inaction_risk` first-step mapping is stale in resolver.
Impact: Initial canonical step can be misaligned with the financial inaction template.
Evidence:
- Resolver first step map: `estimate_out_of_pocket_cost`
- Template canonical first step: `model_cost_of_delay`

### G-05 (High)
Gap type: existing but needs updates
Issue: Action Center CTA path is not guidance-journey aware.
Impact: High-risk actions can be handled as checklist operations without enforcing deterministic journey sequencing.
Evidence:
- Orchestration card CTA uses `onCtaClick` task scheduling path; no guidance journey context.

### G-06 (Medium)
Gap type: existing but needs updates
Issue: Notification deep links are action-based but not guidance-context aware.
Impact: Users land on tool surfaces without preserved `guidanceJourneyId/guidanceStepKey`, reducing deterministic continuity.
Evidence:
- Notification `actionUrl` opens directly in notifications page; no guidance context enrichment.

### G-07 (Medium)
Gap type: existing but needs updates
Issue: Provider-level execution guard is evaluated at property scope by default.
Impact: Booking can appear blocked by unrelated active journeys on the same property.
Evidence:
- `useExecutionGuard(..., BOOKING)` invoked without journey/item scoping in provider discovery/detail pages.

### G-08 (Medium)
Gap type: existing but needs updates
Issue: Several surfaces rely on manual "Mark step complete" cards without verifying underlying business action.
Impact: Journey progress can be advanced without durable evidence (for example no real policy update or maintenance completion).
Evidence:
- `GuidanceStepCompletionCard` only calls `recordGuidanceToolCompletion` with timestamp payload.

### G-09 (High)
Gap type: existing but needs updates
Issue: Inspection-followup journey depends on inspection-report tooling that is HOME_BUYER-only.
Impact: Existing-owner users may be routed to a gated surface for this journey step.
Evidence:
- Inspection report UI/API checks segment and blocks non-HOME_BUYER users.

### G-10 (Medium)
Gap type: existing but needs updates
Issue: Financial execution routes to `/dashboard/providers` without explicit `propertyId` in some templates.
Impact: Cross-property homeowners can lose deterministic property context at execution handoff.

### G-11 (High)
Gap type: missing tool (build new)
Issue: No first-class multi-vendor quote comparison workspace for same scope/job.
Impact: Journey intent "get and compare quotes" is partially covered by single-check + history, but not side-by-side decisioning.
Needed tool: Quote Comparison Workspace (normalized quote cards, apples-to-apples adjustments, decision export).

### G-12 (High)
Gap type: missing tool (build new)
Issue: No explicit price finalization workflow after negotiation.
Impact: Journey intent "negotiate -> finalize price" ends informally before booking.
Needed tool: Price Finalization step/tool (accepted price capture, terms, trace to booking payload).

### G-13 (Medium)
Gap type: existing but needs updates
Issue: Status board and some dashboard operational CTAs are not wired into guidance journey state.
Impact: Users can act on risk items without journey progress updates or guardrail continuity.

### G-14 (Low)
Gap type: existing but needs updates
Issue: External/local update CTAs can route out of guided homeowner journey context.
Impact: Mild continuity loss.

### G-15 (Medium)
Gap type: existing but needs updates
Issue: Home tools and AI tools catalog CTAs are property-aware but not guidance-journey aware.
Impact: Users entering from catalogs lose deterministic journey context (`guidanceJourneyId`, `guidanceStepKey`) and step continuity.
Evidence:
- `/dashboard/home-tools` uses `buildPropertyAwareHref` with property context only.
- `/dashboard/ai-tools` uses `buildAiToolHref` with property context only.

### G-16 (Medium)
Gap type: existing but needs updates
Issue: Risk Radar next-step CTAs are generic and do not deep-link into active guidance steps.
Impact: Users are redirected to broad operational pages (Action Center or risk assessment) instead of precise next-step execution.
Evidence:
- `/dashboard/risk-radar` links to `/dashboard/actions?propertyId=...` and `/dashboard/properties/:id/risk-assessment` without guidance context.

## 5. Summary by Classification

### existing + fully functional
- Deterministic templates and ordered steps are implemented.
- Core journey tools (replace-repair, coverage-intelligence, service-price-radar, negotiation-shield, do-nothing, home-savings, true-cost, recalls, booking) are connected to guidance completion hooks.
- Execution guard is implemented server-side and surfaced in provider booking flow.
- Coverage options, item coverage, recalls, and guidance overview support guided completion.

### existing but needs updates
- Asset-scoped CTA resolution in risk matrix
- Execution step routing quality for booking-stage templates
- Resolver/template family alignment
- Action Center and notification guidance continuity
- Home tools/AI tools/risk-radar CTA guidance continuity
- Segment-aware journey eligibility and scope-aware execution guard
- Stronger proof-based completion for step progression

### missing tool (build new)
- Quote comparison workspace
- Price finalization workflow before booking

## 6. Recommended Next Implementation Order (Post-Audit)

1. Fix deterministic routing correctness first (G-01, G-02, G-03, G-04, G-09).
2. Close execution continuity gaps (G-05, G-06, G-07, G-10, G-15, G-16).
3. Add evidence-based completion hardening (G-08, G-13).
4. Build strategic moat tools for quote comparison and finalization (G-11, G-12).

## 7. Direct Answer to Intent Example (HVAC Furnace Past Life)

For the HVAC past-life example, Guidance Engine intent is correctly modeled as:
- decide repair vs replace
- evaluate total cost context
- check coverage worth-it
- validate market price
- prepare negotiation
- book execution

Current system has the required building blocks, but completion quality depends on routing and continuity fixes listed above (especially G-01, G-02, G-03, G-05).
