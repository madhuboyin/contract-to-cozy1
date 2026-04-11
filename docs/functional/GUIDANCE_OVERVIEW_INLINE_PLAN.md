---

# Guidance Overview — Inline Step Actions Plan

## Goal

Eliminate page navigation for guidance steps. Every step action renders inline on the guidance overview page, following the seller-prep pattern: focused sub-components, parallel data loading, no page-leave required.

Only `book_service` steps keep their outbound navigation (booking is an external flow by nature).

---

## Architecture Reference: Seller-Prep Pattern

| Seller-prep | Guidance equivalent |
|---|---|
| `SellerPrepOverview` (tab container) | `GuidanceOverviewClient` (step container) |
| `TaskItem` with Done/Skip inline | Active step with inline action component |
| `BudgetTrackerCard`, `ValueEstimatorCard` (focused cards) | `CoverageCheckInline`, `PriceCheckInline`, etc. |
| `Promise.all([overview, comparables, report])` on page load | `useJourney` + parallel `useQuery` per active step |
| No navigation for task actions | No navigation for step actions |

---

## Current State

Already inline (no change needed):
- `history-verify` → `VerifyHistoryStep`
- `replace-repair` → `RepairReplaceGate`
- `negotiation-shield` → `NegotiationShieldInline`

Still navigating out (target of this plan):
- `check_coverage` → `/tools/coverage-intelligence`
- `validate_price` → `/tools/service-price-radar`
- `compare_quotes` → `/tools/quote-comparison`
- `safety_alert`, `check_recall_coverage`, `review_remedy_instructions`, `recall_resolution`, `schedule_recall_service` → `/recalls`
- `book_service` → `/providers` ← **keep as navigation**

---

## New Inline Components (to create)

All live in `apps/frontend/src/components/guidance/`.

### Shared prop contract (all inline step components)
```ts
type InlineStepProps = {
  propertyId: string;
  journeyId: string;
  stepId: string;
  stepKey: string;
  inventoryItemId: string | null;
  assetName: string;
  onComplete: () => void;
};
```

---

### 1. `CoverageCheckInline.tsx`

**Purpose:** Check whether the item has coverage (warranty + insurance policy). User reviews and marks the step done.

**Data fetched:**
- `api.listWarranties(propertyId)` — filter by `inventoryItemId`
- `api.listInsurancePolicies(propertyId)` — relevant policies
- Both fetched in parallel via `Promise.all` inside a single `useQuery`

**UI:**
- Coverage status card: warranty linked / insurance linked / no coverage found
- If covered: green success card with coverage name and expiry
- If gap: amber warning card with "No coverage linked to this item"
- Two actions: `Mark coverage reviewed` (completes step) + `Open full coverage tool →` (link, secondary)

**Completion:** Calls `completeGuidanceStep(propertyId, stepId, { coverageStatus })` then `onComplete()`

---

### 2. `PriceCheckInline.tsx`

**Purpose:** Lightweight price check form, pre-filled with journey context. User enters a quote, gets a verdict inline.

**Data fetched on mount:**
- `listServicePriceRadarChecks(propertyId, 3)` — show last 3 checks for this item if they exist

**UI (3 states):**

**State A — Form (no existing check):**
- Category dropdown (pre-selected from `issueType` mapping)
- Description field (pre-filled from `assetName + issueType`)
- Quote amount input
- `Check this quote` button → calls `createServicePriceRadarCheck`

**State B — Result:**
- Verdict badge: FAIR / HIGH / VERY_HIGH / UNDERPRICED
- Expected range (`expectedLow` – `expectedHigh`)
- `explanationShort`
- `Mark price validated` button → completes step
- `Check another quote` link (resets to form)

**State C — Prior check exists:**
- Shows most recent check result for this context
- `Use this result` button → completes step immediately
- `Run a new check` link → resets to form

**Completion:** Calls `completeGuidanceStep(propertyId, stepId, { checkId, verdict })` then `onComplete()`

**Note:** Does NOT include history list, filters, advanced options, or recent checks scroll — those live on the full service-price-radar page.

---

### 3. `RecallCheckInline.tsx`

**Purpose:** Show open recalls for this item. User acknowledges and marks step done.

**Data fetched:**
- `listInventoryItemRecalls(propertyId, inventoryItemId)` if `inventoryItemId` present
- `listPropertyRecalls(propertyId)` as fallback

**UI:**
- If recalls found: list of `RecallMatchCard` (already exists at `components/recalls/RecallMatchCard`)
- If no recalls: green "No open recalls found for this item" card
- `Mark recall check complete` button (always shown)
- `Open full recalls page →` secondary link

**Completion:** Calls `completeGuidanceStep(propertyId, stepId)` then `onComplete()`

**Covers these stepKeys:** `safety_alert`, `check_recall_coverage`, `review_remedy_instructions`, `recall_resolution`

---

## Changes to `GuidanceOverviewClient.tsx`

Only `renderStepCta` needs to change. Add three new cases before the fallback `href` resolution:

```ts
// NEW: check_coverage → inline coverage check
if (step.toolKey === 'coverage-intelligence' && activePrimaryAction) {
  return <CoverageCheckInline ... />;
}

// NEW: validate_price → inline price check
if (step.toolKey === 'service-price-radar' && activePrimaryAction) {
  return <PriceCheckInline ... />;
}

// NEW: recall steps → inline recall check
if (step.toolKey === 'recalls' && activePrimaryAction) {
  return <RecallCheckInline ... />;
}
```

No other changes to `GuidanceOverviewClient`. All other logic (scope selection, journey strip, progress, skip) stays the same.

---

## Scope Selection Simplification (Phase 2 — separate task)

The 4-step in-page wizard (category → asset → issue → confirm) is heavy for first-time users. This is out of scope for the inline step work above and should be planned separately.

**Proposed:** Replace the multi-screen in-page flow with a `GuidanceScopeModal` (Sheet-based, like `SellerPrepIntakeForm`) that opens once on entry if no scope is set, collects all inputs in one pass, then dismisses. Standalone URL-param entry (`?scopeCategory=...`) remains unchanged.

---

## Sequence

1. **`CoverageCheckInline`** — highest visibility step (`check_coverage` appears in 5 of 9 journey templates)
2. **`PriceCheckInline`** — second most common (`validate_price`, `estimate_improvement_cost`)
3. **`RecallCheckInline`** — handles all recall journey steps
4. Wire into `renderStepCta` in `GuidanceOverviewClient`
5. Smoke test: start an `asset_lifecycle_resolution` journey, walk through all 8 steps without leaving the page
6. Phase 2: scope selection modal (separate PR)

---

## What stays unchanged

- Full tool pages (`/tools/coverage-intelligence`, `/tools/service-price-radar`, etc.) remain — they are still valid standalone entry points
- The `GuidanceStepCompletionCard` on those pages continues to work for users who do navigate directly
- `book_service` steps keep their navigation to `/providers`
- All skip / block / dismiss flows unchanged
- `TEMPLATE_REMOVED` filter in mapper unchanged
