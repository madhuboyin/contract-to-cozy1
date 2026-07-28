# Contract-to-Cozy
# Home Digital Twin / Home Upgrade Planner
Functional Documentation

> **Status:** Implementation in progress. The July 28, 2026 P0 trust pass
> removed age-derived failure/risk claims, separated input assumptions from
> system-derived impacts, removed heuristic “Bottom line” treatment, and
> removed projection-owned confirmation. Remaining slice gaps are listed in
> section 7; this document must not be read as evidence that Slices 0–8 are
> complete.

---

# 1. What this capability actually is

"Home Digital Twin" is the internal name for a versioned **projection
engine**: it derives modeled system state (HVAC, roof, water heater, etc.)
from data that already lives elsewhere in Contract-to-Cozy — the property
profile, inventory, documents, and risk reports. It does not own any fact;
it is a read-time lens over canonical data, rebuilt on init/refresh.

**"Digital Twin" is an internal architecture term only.** The homeowner-
facing surface built on top of the projection is called the **Home Upgrade
Planner** — the nav label, page title, and toasts all use this name. The
route slug (`/tools/home-digital-twin`) and backend module/table names were
intentionally left as-is; renaming them would have been a large, purely
cosmetic risk with no homeowner-facing value.

The homeowner promise:

> See what Contract-to-Cozy knows about your home, correct what is
> uncertain, and compare the likely cost, timing, savings, and risk
> trade-offs of a specific upgrade.

## What it is not

- Not a standalone "Home Digital Twin" primary nav destination — it is
  reached contextually from a system, project, maintenance, or risk signal,
  or from the property overview's Home Record summary.
- Not a second source of truth for system facts, current status, or
  lifecycle planning. Those live on their own canonical surfaces (below).
- Not a 3D/CAD model, news feed, or scorecard report.

## Canonical fact ownership (do not duplicate)

| Concern | Canonical owner | Twin's role |
|---|---|---|
| System facts (age, condition, install date) | Property profile / Inventory | Read-only projection with per-field lineage |
| Corrections | Property edit, Inventory item, Room, Document | Twin links out to these; has no edit UI of its own |
| Current status / what needs attention now | Status Board | Twin's projected facts feed into it |
| Lifecycle / replacement windows / reserve implications | Capital Timeline | Twin's projected facts feed into it |
| Active upgrade decisions (repair/replace/upgrade/wait) | Home Upgrade Planner (this capability) | Owns this |
| Completed work, canonical write-back | Project Tracker (`projectTracker.service.ts`) | Twin links a scenario to a project; does not duplicate its completion write-back |

---

# 2. The decision loop

The Home Upgrade Planner is built around one loop, not a dashboard:

1. **See** — modeled home systems with age, condition, and cost, each
   showing whether it's known, estimated, or conflicting, and why.
2. **Correct** — every inferred, default, unknown, or conflicting fact links
   to the real owning surface (property edit / a specific inventory item),
   never a twin-owned edit or confirmation action.
3. **Compare** — repair / replace / upgrade / wait scenarios for one system,
   with ranges (not point values), sensitivity, and a safety boundary for
   safety-sensitive systems (electrical, roof, foundation).
4. **Decide** — select, defer, reject, or close, with a reason recorded for
   defer/reject.
5. **Act** — from a selected decision: create or link a Project Tracker
   project (pre-filled, no duplicate entry), or jump to inspection, Service
   Price Radar, Renovation Advisor, reserve fund, or capital timeline.
6. **Reconcile** — once a linked project is verified complete, Project
   Tracker's own write-back (already existed before this capability) updates
   the inventory item, Home Timeline, expense, and warranty records. The
   planner does not re-implement this — it only links to the project and,
   once complete, shows expected-vs-actual cost on that one scenario.

---

# 3. Data model

## HomeDigitalTwin (1:1 Property)

`id, propertyId, status (DRAFT|ACTIVE|STALE|ARCHIVED), version,
completenessScore, confidenceScore, lastComputedAt, lastSyncedAt,
contextVersion, dependencyFingerprint, lastGoodComputedAt,
lastGoodContextVersion, staleReason, notes, createdAt, updatedAt`

- `dependencyFingerprint` is a hash of the property/inventory/risk-report
  timestamps the projection was last built from. A cheap, read-only
  recompute of this hash on every `GET twin` (no full rebuild) detects
  "your data changed since this was last computed" — surfaced to the
  homeowner as `needsRecompute` on the twin response.
- `lastGoodComputedAt`/`lastGoodContextVersion` only advance on a
  **successful** build. A failed init/refresh sets `staleReason` and leaves
  the last good projection exactly as it was — a failed computation can
  never look current.

## HomeTwinComponent (N per twin)

One row per real system. `identityKey` gives a component stable identity
across rebuilds — `"<TYPE>:PRIMARY"` for a property-profile-derived slot, or
`"<TYPE>:<inventoryItemId>"` when backed by a specific inventory item, so a
property with two HVAC zones gets two distinct rows instead of collapsing
into one.

`componentType (ROOF|HVAC|WATER_HEATER|PLUMBING|ELECTRICAL|INSULATION|
WINDOWS|SOLAR|FLOORING|EXTERIOR|FOUNDATION|APPLIANCE|OTHER)`,
`lifecycleState (ACTIVE|SUPERSEDED|RETIRED)`, `status`, `sourceType`,
`sourceReferenceId`, `installYear`, `estimatedAgeYears`, `usefulLifeYears`,
`conditionScore`, cost estimates,
`confidenceScore`.

`failureRiskScore` and `isUserConfirmed` remain legacy schema fields only.
The builder clears both on refresh, the API never emits a failure-risk value,
and neither field is used for readiness, recommendations, or computation.
Age relative to typical service life is shown only as a planning window.

A component whose backing inventory item disappears (deleted, replaced) is
retired, not silently left stale — never deleted outright, so `retiredAt`/
`supersededByComponentId` preserve why it stopped being active.

## HomeTwinProjectedFact (N per component)

Field-level lineage — the mechanism that makes "known vs. estimated vs.
conflicting" a real, per-field fact rather than a single trust score.
`fieldName, valueNumeric/valueText, factState (VERIFIED|REPORTED|
DOCUMENT_DERIVED|INFERRED|DEFAULT|CONFLICTED|UNKNOWN), sourceType,
sourceRecordType, sourceRecordId, sourceField, observedAt,
correctionDestination`. `factState` must never read more confidently than
the underlying source justifies — this is enforced in one place
(`resolveInstallYear` in the builder service), not scattered across
call sites.

## HomeTwinScenario (N per twin)

A saved "what if" for one component. `componentId` (added once a property
could have multiple systems of the same type — required for repair/replace/
upgrade/wait so componentType alone can't be ambiguous), `scenarioType
(REPAIR_COMPONENT|REPLACE_COMPONENT|UPGRADE_COMPONENT|WAIT_MONITOR|
ADD_FEATURE|REMOVE_FEATURE|ENERGY_IMPROVEMENT|RESILIENCE_IMPROVEMENT|
RENOVATION|CUSTOM)`, `status (DRAFT|READY|COMPUTED|FAILED|ARCHIVED)`,
`inputPayload`, `baselineSnapshot`, `isPinned`, `isArchived`,
`lastComputedAt`.

Decision fields (separate from `status`, which only tracks whether it's
been computed): `decisionStatus (OPEN|SELECTED|DEFERRED|REJECTED|CLOSED)`,
`decisionReason`, `decidedAt`, `decidedByUserId`.

## HomeTwinScenarioImpact (N per scenario)

Normalized computed outputs. `impactType, valueNumeric` (base/midpoint, kept
for backward-compat display), `valueLow, valueHigh` (the range — a
homeowner quote and a category default carry very different uncertainty,
so the spread reflects that, not a fixed percentage), `unit, direction,
confidenceScore, isUserSupplied` (must never be presented as
system-computed evidence).

## HomeTwinComputationRun (N per twin, N per scenario)

Audit trail for every init/refresh/scenario-compute attempt.
`runType (INITIAL_BUILD|REFRESH|SCENARIO_COMPUTE), status (QUEUED|RUNNING|
SUCCEEDED|FAILED), startedAt, completedAt, errorMessage, summary,
inputSnapshot` (immutable snapshot of the assumptions/component facts a
scenario run used — so "why did this change?" always has a concrete
before/after), `calculationVersion`.

## HomeTwinDataQuality (N per twin)

Per-dimension completeness/confidence (`PROPERTY_PROFILE, SYSTEMS,
APPLIANCES, DOCUMENTATION, COST_BASIS, ENERGY_BASIS, RISK_BASIS`).

---

# 4. Backend

## Services (`apps/backend/src/services/`)

- **`homeDigitalTwin.service.ts`** — twin lifecycle (`getTwin`, `initTwin`,
  `refreshTwin`) and operator diagnostics (`getDiagnostics`).
- **`homeDigitalTwinBuilder.service.ts`** — derives components/facts from
  property + inventory + risk report; computes and compares the dependency
  fingerprint; retires orphaned components.
- **`homeDigitalTwinQuality.service.ts`** — completeness/confidence scoring.
- **`homeDigitalTwinFactReadiness.service.ts`** — the Home Record hub
  summary: known/missing/conflicting facts with a homeowner-readable reason
  and a link to the owning correction surface.
- **`homeDigitalTwinScenario.service.ts`** — scenario CRUD, compute engine,
  readiness (what's known/missing for *this* decision), comparison, decision
  recording, and handoff assembly (linked project lookup, project
  pre-fill, wayfinding links, expected-vs-actual cost).
- **`homeDigitalTwinRunLock.ts`** — concurrent-run dedup.
- **`homeDigitalTwinRecommendations.service.ts`** — suggested scenarios
  ranked by urgency from current component state.

## Reliability and operational controls

- **Concurrent-run dedup** — `findInFlightRun` refuses to start a second
  init/refresh/scenario-compute while one is already `RUNNING` for the same
  twin/scenario (409 `COMPUTATION_IN_PROGRESS`). A `RUNNING` row older than
  5 minutes is treated as abandoned (crashed process) rather than a
  permanent lock, so this is self-healing without a cleanup job.
- **Bounded retry** — `withBoundedRetry` retries `buildComponents` once on a
  transient failure before falling through to the existing failure path.
  `buildComponents` is transactional and idempotent, so a retry is safe.
- **Last-good preservation** — a failed init/refresh never touches
  `lastGoodComputedAt`/`lastGoodContextVersion`; it only sets `staleReason`.
- **Category disable switch** — `HOME_DIGITAL_TWIN_DISABLED_COMPONENT_TYPES`
  (comma-separated component types) stops the builder from upserting new
  rows of that type without disabling the rest of the twin. Existing rows of
  a disabled type are left untouched (neither updated nor retired).
- **Scenario-compute kill switch** — `HOME_DIGITAL_TWIN_SCENARIO_COMPUTE_
  DISABLED=true` refuses new scenario computes (503) while leaving facts,
  corrections, and already-decided scenarios fully readable. This is the
  practical rollback lever: there is only one calculation model in
  production (`calculationVersion` is always 1; nothing to branch to), so a
  real version rollback would be dishonest to claim — this switch buys time
  to revert the offending code change through git and redeploy.
- **Operator diagnostics** — `GET /api/admin/analytics/home-digital-twin`
  (capability `ANALYTICS_VIEW`, admin + MFA required) returns run counts by
  type/status over a lookback window, stale-twin count, recent failures, and
  effective operational-control state. Aggregate only — no per-property
  drill-down; a specific property's own state is already visible via its
  own `GET twin` response to whoever has access to that property.

## APIs (all under `/api/properties/:propertyId/home-digital-twin`)

**Twin:** `GET /`, `POST /init`, `POST /refresh`
**Facts:** `GET /fact-readiness` (corrections link to canonical owning routes;
there is no projection-owned confirmation mutation)
**Recommendations:** `GET /recommended-scenarios`
**Scenarios:** `GET /scenarios`, `POST /scenarios`, `GET /scenarios/:id`,
`PATCH /scenarios/:id`, `DELETE /scenarios/:id` (archived-only, refused if a
project is linked), `POST /scenarios/:id/compute`,
`GET /scenarios/readiness`, `GET /components/:id/scenarios/compare`
**Decision loop:** `PATCH /scenarios/:id/decision`,
`GET /scenarios/:id/handoff`

**Admin:** `GET /api/admin/analytics/home-digital-twin`

---

# 5. Frontend

**Route:** `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-digital-twin/`
(`HomeDigitalTwinClient.tsx` + `homeDigitalTwinApi.ts`). Nav-visible as
**Home Upgrade Planner** (`mobileToolCatalog.ts`).

State is plain TanStack React Query (`useQuery`/`useMutation`) against the
typed API wrapper — there are no bespoke `useHomeDigitalTwin()`-style hooks.

Key sections on the page: status card (with stale / dependency-drift /
degraded / returning-user banners), fact-readiness summary (shared with the
property overview's Home Record card), modeled systems, suggested and
recent scenarios — laid out as a single column on mobile and a two-column
(systems / decisions) grid at desktop widths.

Component and scenario detail open in a `Sheet`, including: age/lifespan,
planning-attention (qualitative, not a "failure probability"), cost
estimates with source/date per fact, safety boundary (electrical/roof/
foundation), projected-impact ranges split from homeowner-entered estimates,
sensitivity ("what drives this range"), decision controls (select/defer/
reject/close with a required reason for defer/reject), compare, rename, and
archived-only delete, and the handoff panel (linked project or pre-filled
create-project link, wayfinding links, expected-vs-actual cost once a linked
project completes).

Caller-provided values and calculations that depend on them render under
**Input assumptions**. Heuristic scenarios do not receive a “Bottom line”
banner. Risk-reduction percentages are never derived from age; an explicitly
entered risk expectation remains an unverified input assumption.

Accessibility: `motion-reduce:animate-none` on every animated element,
`aria-live`/`aria-busy` on the async content region. `Sheet` is Radix-based,
so focus trapping/ESC/keyboard behavior come from the primitive rather than
being reimplemented per screen. A full contrast audit has not been run —
this needs visual/automated tooling this capability's own test suite does
not cover yet.

---

# 6. Measurement

Frontend `track()` events (see `src/lib/analytics/events.ts`), tool key
`home-digital-twin`:

- `workflow_started` — page entry.
- `action_taken` with `actionType`: `scenario_compare_opened`,
  `decision_selected` / `decision_deferred` /
  `decision_rejected` / `decision_closed`, `handoff_service_price_radar`,
  `handoff_inspection`, `handoff_renovation_advisor`, `handoff_reserve_fund`,
  `handoff_capital_timeline`, `handoff_create_project`,
  `handoff_view_linked_project`.
- `data_quality_signal` with `signalType`: `STALE`, `NEEDS_RECOMPUTE`,
  `DEGRADED`, `FACT_CONFLICT` — deliberately a separate event from the
  interaction events above, so projection freshness and conflict resolution
  can be measured independently of engagement, per design.

Backend `analyticsEmitter` events: `DIGITAL_TWIN_VIEWED` (`getTwin`),
`featureOpened` (twin init — a projection build is exposure, not homeowner
value, and must not count as property activation).

Expected-vs-actual cost comparison is returned only inside a scenario's own
`GET .../handoff` response, once its linked project is verified complete —
never aggregated across properties or homeowners. There is currently no
platform-wide rollup of this data; if one is built later, it must remain
opt-in per the plan's "only with homeowner control" requirement.

---

# 7. Known remaining work

- A universal Home Record CRUD page remains intentionally out of scope —
  corrections stay on the existing
  owning surfaces (property edit, inventory item, room, document, policy,
  warranty, project detail).
- Real external pricing/utility/incentive-provider integrations are not yet
  implemented — cost/
  utility/risk defaults are internal, reviewed category defaults, not live
  third-party data feeds. No "incentive discovery" handoff exists because no
  such capability exists elsewhere in the platform yet.
- A BullMQ-backed async job queue for computation is not yet implemented —
  init/refresh/scenario-
  compute run synchronously in the request; the reliability controls above
  (dedup, bounded retry, last-good) were built to make that safe without
  one. If genuine long-running/background computation becomes necessary,
  this would be revisited as new, explicitly-scoped work.
- Editing a scenario's assumptions after creation remains incomplete — only name/description
  are editable; there is no reusable assumption-editing form to extend (the
  only creation path today is from a suggested scenario's pre-built
  payload). A full manual "new scenario" form is future work.
- Automated browser/end-to-end and formal accessibility test suites remain
  incomplete — this
  session's environment does not run one; only backend unit tests exist for
  this capability today.
