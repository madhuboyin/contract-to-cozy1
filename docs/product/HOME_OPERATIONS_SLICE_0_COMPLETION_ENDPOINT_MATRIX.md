# Home Operations Slice 0 — Completion Endpoint Matrix

Companion to `HOME_OPERATIONS_AND_ACTION_MANAGEMENT_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md`,
Slice 0 deliverable: "matrix of every current completion endpoint and
authoritative source." Reflects the state of the backend after the Slice 0
truth-containment changes.

## Home Action `COMPLETE` / `ALREADY_DONE` commands, by source kind

All commands route through `executeHomeActionCommand` in
`apps/backend/src/services/homeActions.service.ts`.

| Source kind (`action.source.kind` / id prefix) | Authoritative domain adapter | COMPLETE/ALREADY_DONE offered? |
| --- | --- | --- |
| `ownership-cost-change:*` (id prefix, any `source.kind`) | `ownershipCostDecisionService.record` | Yes — real adapter |
| `activation:*` (id prefix, any `source.kind`) | `recordFirstActionResolution` (`entryContext.service.ts`) | Yes — real adapter |
| `PERSONALIZATION` | `applyPersonalizationHomeActionLifecycle` | Yes — real adapter |
| `GUIDANCE` | none | No — `ACKNOWLEDGE` only |
| `MAINTENANCE` (orchestrated risk/checklist items, seasonal aggregate) | none reachable — a matching `PropertyMaintenanceTask` suppresses the action from Home entirely before it can be acted on (`orchestrationSuppression.service.ts`) | No — `ACKNOWLEDGE` only |
| `INCIDENT` | none | No — `ACKNOWLEDGE` only (critical/weather still escalate via CTA, not COMPLETE) |
| `RECALL` | none | No — `ACKNOWLEDGE` only |
| `COVERAGE` (both `loadCoverageActions` and orchestrated coverage-gap actions) | none — coverage state reconciles automatically from live Inventory/warranty/insurance data, not from a command | No — `ACKNOWLEDGE` only |
| `PROJECT` | none — project completion requires the Project Tracker's completion checklist and evidence, which a single Home Action click cannot honestly satisfy | No — `ACKNOWLEDGE` only |
| `SYSTEM` (environment insights, refinance, digital twin, capital timeline, tax appeal) | none | No — `ACKNOWLEDGE` only |
| `SAVINGS_BENEFITS` | none | No — `ACKNOWLEDGE` only |

`executeHomeActionCommand` enforces this server-side (not just via hidden UI
buttons): COMPLETE/ALREADY_DONE against any source kind without a real
adapter is rejected with an explicit error, except for the two id-prefix
routes (`ownership-cost-change:`, `activation:`) which can appear under a
`SYSTEM`/other `source.kind` but are still backed by a real adapter.

## Maintenance task status mutation paths

| Path | Side effects |
| --- | --- |
| `PropertyMaintenanceTaskService.updateTaskStatus` | Project follow-up remediation, `MAINTENANCE_ITEM_COMPLETED` analytics, seasonal checklist sync, Radar reconciliation, maintenance adherence signal |
| `PropertyMaintenanceTaskService.updateTask` (generic field patch, `status` optional) | Same as above — as of Slice 0, both paths call the shared `buildStatusUpdateData` / `applyTaskCompletionSideEffects` helpers, so a status change through either path produces identical effects |

## Guidance journey completion

| Step completion source | Physical outcome write-back |
| --- | --- |
| Required step has `GuidanceStepEvidence` with `sourceType !== USER_INPUT`, or `status === VERIFIED` | `InventoryItem.condition` set (NEW/GOOD), `HomeEvent` created with `type: VERIFIED_RESOLUTION`, `sourceBadge: VERIFIED` |
| Required steps only have self-reported (`USER_INPUT`, non-`VERIFIED`) evidence, or none | No `InventoryItem` write. `HomeEvent` created with `type: MILESTONE`, `sourceBadge: USER_REPORTED` — records that the homeowner says the work is done without certifying it |

## Project safety/consequence tier (per instance)

`loadProjectActions` no longer applies a flat `LOW_CONSEQUENCE` tier to every
project. Derivation, in order:

1. Open `ProjectIssue.category === 'SAFETY'` or `severity === 'BLOCKING'`, or
   `ProjectRecord.safetyCheckResult === 'FAILED'` → `SAFETY_EMERGENCY`.
2. `fundingMode` is `COVERED`/`MIXED`, a contract amount is recorded, or money
   has been paid → `MATERIAL_FINANCIAL`. (Not `REGULATED_COVERAGE`: that tier
   requires a verified jurisdiction check, which nothing in Project Tracker
   currently produces — claiming it would be exactly the kind of overstated
   verification this slice is closing.)
3. Otherwise → `LOW_CONSEQUENCE`.

## Diagnostics

`getHomeActionFeed`'s `diagnostics.hiddenBecauseTrackedElsewhere` now lists
(up to 20) suppressed orchestrated actions with their suppression
reason/message, alongside the existing aggregate `suppressedCount` — so "why
isn't this on Home?" is answerable instead of only "how many are hidden."

## Explicitly out of scope for Slice 0

Per the parent plan's sequencing, this slice stops false completion — it does
not yet build the pipeline that would let a MAINTENANCE/PROJECT/GUIDANCE
recommendation become durable accepted work from a single Home Action click.
That is Slice 1 (durable operational identity) and Slice 2/3 (Home
cutover, Maintenance/seasonal convergence).
