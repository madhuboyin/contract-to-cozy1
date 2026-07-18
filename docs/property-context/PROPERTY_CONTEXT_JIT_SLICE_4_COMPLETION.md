# Property Context JIT — Slice 4 completion audit

Date: 2026-07-17

## Outcome

Slice 4 is complete. This final tranche closes the deferred maintenance-template gap, adopts the remaining Phase 5 financial decision surfaces, and locks aggregation/reporting surfaces to explanation-only behavior. No Prisma schema change or migration is required.

## Completion matrix

| FRD feature group | Completion boundary |
|---|---|
| Maintenance, seasonal setup, Plant Advisor | Installed-system, detector-safety, outdoor-space, HVAC, water-heater, equipment-presence, exterior-presence, and responsibility requirements use backend-owned contracts. Template creation re-evaluates before the canonical task write and retains the existing applicability/deduplication policy. |
| Risk, incidents, claims, coverage, insurance, warranties | Claim and coverage decision points are adopted. Incident, policy, and warranty screens remain governed lifecycle editors because they already carry explicit property/entity identity, evidence, and dates; no generic questionnaire is introduced. |
| Projects, permits, HOA, inspections, Seller Prep, planning | Project, permit, HOA, Seller Prep, and planning invocation points are adopted. Inspection upload/confirmation remains evidence-owned and was audited as already explicit and lifecycle preserving. |
| Repair vs. Replace, Capital Timeline, Reserve Fund, Phase 5 finance | Repair vs. Replace, Capital Timeline, and Reserve Fund retain their item-aware contracts. Do Nothing, Home Savings, Budget Planner, True Cost, Cost Growth, Cost Volatility, Cost Explainer, Break Even, Sell/Hold/Rent, Property Tax, Tax Appeal, and Hidden Assets now use feature-scoped shared panels. Their missing facts are accuracy enhancements so existing default-backed results remain available. Mortgage, financing, and value inputs remain in their governed editors. |
| Environment, energy, dashboards, reports, guidance | Environment insight questions remain backend-issued, property-scoped canonical captures with in-place report refresh. Energy Auditor retains explicit manual/bill evidence inputs and does not launch an unrelated HVAC questionnaire. Dashboard, report, replay, continuity, advisory, and shared-guidance notices are explicitly read-only and route users through their existing feature actions/correction paths. |

## Contract and execution details

- `MAINTENANCE / PREPARE_TEMPLATE` receives backend-derived operation input from the selected canonical template. It prompts only for the relevant presence or responsibility fact and uses exact installed-item membership when equipment identity matters.
- The same maintenance contract executes in `PropertyMaintenanceTaskService` before the established applicability policy and task persistence.
- Remaining financial tools declare only `ENHANCEMENT_ACCURACY` requirements. Capture writes to canonical Property/Inventory owners and invokes the tool's existing loader or query refetch without a page reload.
- `PropertyContextNotice.readOnly` prevents capture-definition retrieval and suppresses inline controls on aggregate surfaces while retaining staleness, limitation, and correction-path messaging.
- Background workers remain noninteractive consumers. No worker invokes shared evaluation as a prompting gate or writes capture answers.

## Validation boundary

The completion test locks the financial contract classifications, explicit `propertyId`, in-place callbacks, maintenance execution ordering, read-only aggregate behavior, and environment/energy evidence ownership. Backend, frontend, worker builds, unit tests, Prisma validation, and whitespace checks are the release gate for this tranche.

Slice 5 may retire the remaining compatibility-notice implementation after all non-Slice-4 consumers are migrated; that cleanup is not part of Slice 4.
