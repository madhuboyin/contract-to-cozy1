# Dashboard — Next Best Move: Changes Reference

> **Scope:** `apps/frontend/src/app/(dashboard)/dashboard/page.tsx` and `apps/backend/src/services/coverageGap.service.ts`
> **Commits:** `c7e3e4c` · `f2fd55d` · `a195174`

---

## Overview

The "Next best move" card on the dashboard home page is driven by a client-side cascade called `heroNarrative`. Before these changes it had several gaps: coverage gaps were never detected, the fallback message was always "All systems healthy" regardless of health score, and two supporting UI sections were hardcoded stubs. These changes fix the gaps and augment the cascade with backend signal pressure from the orchestration engine.

---

## heroNarrative Cascade — Full Priority Order

The card evaluates conditions in this order and renders the first match. The cascade was extended from 6 steps to 9.

| Step | Condition | Badge | Key data source |
|------|-----------|-------|-----------------|
| 1 | Active incident (CRITICAL or WARNING) | `Priority alert` | `scopedActiveIncidents` |
| 2 | Health score insight flagged | `Top priority this week` | `scopedUrgentActions` (type: HEALTH_INSIGHT) |
| 3 | Items with no coverage at all | `Coverage gap detected` | `scopedUrgentActions` (type: COVERAGE_GAP) |
| 3b | Items with warranty but no insurance, or vice versa | `Partial coverage detected` | `scopedUrgentActions` (type: COVERAGE_PARTIAL) |
| 4 | Annual savings opportunity ≥ $200 | `Best savings move` | `homeSavingsSummaryQuery` |
| 4.5 | Backend risk or cost signal | `Risk signal active` / `Cost pressure detected` | `orchestrationQuery` (reasonCode: RISK_SPIKE / COST_PRESSURE) |
| 5 | Inventory fewer than 3 items | `Unlock more intelligence` | `data.inventoryCount` |
| 6 | Overdue maintenance tasks | `Action to take now` | `scopedUrgentActions` (type: MAINTENANCE_OVERDUE) |
| 7 | Fallback | `Next best move` | `healthScore` |

---

## Changes Detail

### 1. Coverage gap detection wired to the dashboard (`c7e3e4c`)

**Problem:** `consolidateUrgentActions` is called without `inventoryItems` as the sixth argument, so `COVERAGE_GAP` actions are never generated and never reach the `heroNarrative` cascade.

**Fix — frontend (`page.tsx`):**
- Added `inventoryItems?: InventoryItem[]` parameter to the local `consolidateUrgentActions` function.
- Added the coverage gap processing loop: for each item where `!warrantyId && !insurancePolicyId` (and not `coverageNotRequired`), pushes a `COVERAGE_GAP` action.
- Passes `inventoryItems` at the call site.
- Added `coverageGapExposure: number` to `DashboardData` — computed as the sum of `replacementCostCents` for all uncovered items — so the card can display the dollar amount.
- Added heroNarrative step 3: surfaces `COVERAGE_GAP` actions with badge "Coverage gap detected", title "N items have no coverage.", and a direct link to `/inventory?tab=items&smart=gaps`.

**Fix — backend (`coverageGap.service.ts`):**

| Threshold | Before | After |
|-----------|--------|-------|
| General items | $1,500 | $500 |
| Appliances | $750 | $250 |

The original thresholds were too high and silently excluded low-value items that the inventory page was already flagging as gaps (e.g., two items totalling $1,200 in unprotected value would not be picked up by the orchestration engine). The new thresholds align more closely with the inventory page's threshold-free definition.

---

### 2. Health-score-aware fallback (`c7e3e4c`)

**Problem:** The fallback (step 6, now step 7) unconditionally showed "All systems healthy." regardless of health score. A score of 60/100 triggered the same message as 100/100.

**Fix:** The fallback checks `healthScore`:

| Score | Title | Subtitle |
|-------|-------|----------|
| ≥ 75 | "All systems healthy." | "Review your score drivers and current health focus to stay ahead of issues." |
| < 75 | "Home health at {score} — review score drivers." | "Your health score has room to improve. Open the full report to see what is dragging it down and what to fix first." |

`impactLabel` also changes: `"HomeScore up to date"` vs `"Score at {score} / 100"`.

---

### 3. Partial coverage detection (`f2fd55d`)

**Problem:** Items that have either a warranty or insurance but not both (warranty XOR insurance) were not generating any urgent action and had no heroNarrative step.

**Fix:**
- `consolidateUrgentActions` now generates a `COVERAGE_PARTIAL` action for items with `!hasWarranty || !hasInsurance` (after the full-gap check).
- Added heroNarrative step 3b: surfaces `COVERAGE_PARTIAL` actions with badge "Partial coverage detected", title "N items have partial coverage.", and the same inventory gaps link.
- `COVERAGE_PARTIAL` is lower priority than `COVERAGE_GAP` — it surfaces only when no full gaps exist.

---

### 4. Health insight deduplication (`f2fd55d`)

**Problem:** The local `consolidateUrgentActions` used array index as action IDs (`${propertyId}-INSIGHT-${index}`) and added every matching insight per factor without deduplication. A factor with both "Needs attention" and "Needs Review" entries would produce two actions; IDs would shift if the insight array was reordered.

**Fix:**
- Insights are now deduplicated by factor name using a `Map<factor, { insight, statusIndex }>`.
- When multiple statuses exist for the same factor, the most severe is kept (lower index in the `CRITICAL_INSIGHT_STATUSES` array = more severe).
- IDs are now stable slugs: `${propertyId}-INSIGHT-${factorName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.

---

### 5. Cross-property incident fallback removed (`f2fd55d`)

**Problem:** The heroNarrative incident check fell back to searching `data.activeIncidents` (all properties) if `scopedActiveIncidents` (current property) had no match:

```typescript
// Before
const highSeverityIncident =
  scopedActiveIncidents.find(...) ||
  data.activeIncidents.find(...);  // ← searched all properties
```

This could surface an incident belonging to a different property in the current property's "Next best move" card.

**Fix:** The fallback line is removed. Only incidents scoped to the currently selected property are considered.

---

### 6. `hasCompletionState` scope fix (`f2fd55d`)

**Problem:** The condition that triggers the completion celebration mixed scoped and unscoped checks:

```typescript
// Before
const hasCompletionState =
  Boolean(selectedProperty) &&
  scopedUrgentActions.length === 0 &&    // current property only ✓
  data.activeIncidents.length === 0 &&   // ALL properties ✗
  overdueMaintenanceCount === 0;
```

If Property A had an active incident, the celebration was suppressed for Property B even when Property B was completely clean.

**Fix:** `data.activeIncidents.length === 0` → `scopedActiveIncidents.length === 0`.

---

### 7. `HeroValueStrip` and `SignatureRecommendationCard` wired with live data (`f2fd55d`)

**Problem:** Both components were rendered with hardcoded empty arrays:

```tsx
<HeroValueStrip tiles={[]} momentumLabel={null} />
<SignatureRecommendationCard moves={[]} summary="Analyzing latest data..." />
```

Both components return `null` when their data arrays are empty, so they were invisible on every dashboard load.

**Fix — `HeroValueStrip` tiles:**

| Tile | Icon | Tone logic | Always shown? |
|------|------|-----------|--------------|
| Health Score | `Gauge` | teal ≥ 75, amber ≥ 50, red < 50 | When `healthScore` is not null |
| Coverage | `Shield` / `ShieldAlert` | teal = 0 gaps, amber = 1 gap, red > 1 | Always |
| Annual savings | `PiggyBank` | teal | Only when ≥ $200 |
| Overdue tasks | `AlertCircle` | amber | Only when > 0 |
| Risk exposure | `ShieldAlert` | red | Only when > 0 |

`momentumLabel` is set to `"All clear"` when both `scopedUrgentActions` and `scopedActiveIncidents` are empty; otherwise `null`.

**Fix — `SignatureRecommendationCard` moves:**
- Derived from `scopedUrgentActions.slice(0, 3)`.
- Each action maps to `{ id, title, detail, href, impact }` where `impact` is a human-readable label per action type (e.g., `"Direct financial exposure with no safety net"` for COVERAGE_GAP).
- `summary` is derived from the highest-priority action type.
- Card does not render when `scopedUrgentActions` is empty (handled by the component's own `if (!moves.length) return null` guard).
- `propertyLabel` uses `selectedProperty?.address` instead of the hardcoded `"Your Home"`.

---

### 8. Backend orchestration signals augmented into the cascade (`a195174`)

**Problem:** The backend orchestration engine detects `RISK_SPIKE` (risk score spiked ≥ 0.55) and `COST_PRESSURE` (cost anomaly ≥ 0.55) signals that the frontend has no equivalent for, but the dashboard never called the orchestration API.

**Approach:** Augment, not replace. The heroNarrative cascade already handles the most impactful cases locally (coverage gaps, health insights, incidents). The orchestration endpoint is expensive — it runs a multi-signal decision engine — so it is loaded async/non-blocking via a separate React Query call and only surfaces when all local signals above it are clear.

**Implementation:**

```typescript
const orchestrationQuery = useQuery({
  queryKey: ['dashboard-orchestration-signals', effectiveSelectedPropertyId],
  queryFn: async () => {
    if (!effectiveSelectedPropertyId) return null;
    try {
      const summary = await api.getOrchestrationSummary(effectiveSelectedPropertyId);
      return adaptOrchestrationSummary(summary);
    } catch {
      return null;
    }
  },
  enabled: Boolean(effectiveSelectedPropertyId),
  staleTime: 3 * 60 * 1000,
});
```

- **staleTime: 3 min** — longer than other queries because the orchestration endpoint is the heaviest in the stack.
- **Errors swallowed silently** — any backend failure leaves the cascade unaffected; the step is simply skipped.
- **Non-blocking** — fires in parallel with all existing queries; first dashboard render does not wait for it.

**heroNarrative step 4.5** triggers when `orchestrationMove.reasonCode` is `RISK_SPIKE` or `COST_PRESSURE`. Title and detail text come directly from the backend response. The CTA routes to `orchestrationMove.targetPath` (backend-computed: Home Risk Replay for RISK_SPIKE, Break-Even tool for COST_PRESSURE).

**`SCENARIO_CONTINUITY` is intentionally excluded** — surfacing "continue your financial scenario" on the main dashboard is a power-user concept that needs a product decision before being shown to general users.

---

## Files Changed

| File | Changes |
|------|---------|
| `apps/frontend/src/app/(dashboard)/dashboard/page.tsx` | All frontend changes above |
| `apps/backend/src/services/coverageGap.service.ts` | Detection thresholds lowered: $1,500 → $500 (general), $750 → $250 (appliances) |

---

## Known Gaps Not Addressed Here

| Gap | Status |
|-----|--------|
| `SCENARIO_CONTINUITY` reasonCode not surfaced | Intentional — pending product decision |
| Backend `COVERAGE_GAP` DB signal may be stale (requires "Run full scan" to refresh) | Not addressed — signal is DB-backed; live detection in `detectCoverageGaps()` runs fresh each orchestration call |
| `RoomsSnapshotSection` and `MobileDashboardHome` use a different coverage gap definition than the inventory page (`!warrantyId \|\| !insurancePolicyId` vs frontend `getCoverageStatus`) | Not addressed in this batch |
