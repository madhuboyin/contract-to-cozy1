# Guidance Engine — Phased Implementation Plan
**Date:** 2026-03-29
**Based on:** `guidance-engine-gap-analysis.md`
**FRD:** Guidance Engine (User-First End-to-End Resolution Journeys)

---

## Overview

This plan delivers the Guidance Engine FRD in four sequential phases. Each phase has a clear dependency on the one before it. No phase requires reworking the previous phase's output.

| Phase | Focus | Dependency |
|---|---|---|
| **1** | DB schema review and updates | None — must complete first |
| **2** | Backend service and API layer | Phase 1 migration must be applied |
| **3** | Frontend UX correctness fixes (Phase 1A) | Phase 2 endpoints must be available |
| **4** | Frontend entry flow completion (Phase 1B) | Phase 3 screen must be stable |

---

## Phase 1 — DB Schema Review and Updates

### Goal

Establish the correct data foundation before any service or UI work begins. All new fields, enums, and indexes added here are additive. Existing journeys are backfilled without downtime.

### 1.1 New Enum: `GuidanceScopeCategory`

Add a top-level scope category enum supporting the two Phase 1 values and extensible for future categories.

**Add to `prisma/schema.prisma` (after `GuidanceIssueDomain`):**

```prisma
// Top-level scope category for a guidance journey.
// Phase 1: ITEM (asset from inventory / home asset) and SERVICE (non-item service).
// Future phases may add: COVERAGE_PLAN, INCIDENT_CASE, SAVINGS_INCENTIVE, DOCUMENT_COMPLIANCE.
enum GuidanceScopeCategory {
  ITEM
  SERVICE
}
```

**Notes:**
- Enum-only addition. No table changes yet.
- PostgreSQL enum additions are non-breaking (no lock, no downtime).

---

### 1.2 Updated Enum: `GuidanceJourneyStatus`

Add `NOT_STARTED` and `DISMISSED` to the existing journey status enum.

**Current values:** `ACTIVE | COMPLETED | ABORTED | ARCHIVED`

**Updated values:**

```prisma
enum GuidanceJourneyStatus {
  NOT_STARTED  // User-initiated journey created before first step is taken
  ACTIVE       // Existing — journey in progress
  COMPLETED    // Existing — all required steps complete
  ABORTED      // Existing — system-cancelled (internal only, not shown to users)
  ARCHIVED     // Existing — system-archived (internal only, not shown to users)
  DISMISSED    // New — user explicitly marked "not relevant"
}
```

**Notes:**
- `NOT_STARTED` is needed for user-initiated journeys between creation and the first step action.
- `DISMISSED` is distinct from `ABORTED` (`ABORTED` = system cancellation; `DISMISSED` = user decision).
- `ABORTED` and `ARCHIVED` remain for internal engine use but must not be rendered as user-facing copy.
- Existing rows are unaffected — no backfill needed; existing `ACTIVE` journeys stay `ACTIVE`.
- Audit all `switch` statements on `GuidanceJourneyStatus` in the service layer and add cases for `NOT_STARTED` and `DISMISSED` before migration.

---

### 1.3 Updated Enum: `GuidanceJourneyEventType`

Add event types to support the new user-override controls.

**Add to existing `GuidanceJourneyEventType`:**

```prisma
enum GuidanceJourneyEventType {
  // --- Existing ---
  JOURNEY_CREATED
  JOURNEY_STATUS_CHANGED
  JOURNEY_READINESS_CHANGED
  STEP_STATUS_CHANGED
  STEP_STARTED
  STEP_COMPLETED
  STEP_SKIPPED
  STEP_BLOCKED
  STEP_UNBLOCKED
  CONTEXT_UPDATED
  DERIVED_DATA_UPDATED
  // --- New ---
  JOURNEY_DISMISSED       // User clicked "Not relevant"
  JOURNEY_SCOPE_CHANGED   // User clicked "Change asset" — links old journey to replacement
  JOURNEY_ISSUE_CHANGED   // User clicked "Different issue" — issue type updated
}
```

---

### 1.4 New Fields on `GuidanceJourney`

Add the following fields to the `GuidanceJourney` model. All are nullable or have defaults so existing rows are unaffected before the backfill migration runs.

```prisma
model GuidanceJourney {
  // ... existing fields unchanged ...

  // -------------------------------------------------------------------------
  // Phase 1: User-first scope model
  // -------------------------------------------------------------------------

  // Top-level scope category. Set at journey creation; determines ITEM vs SERVICE routing.
  // Nullable during migration window; backfill sets ITEM for all existing journeys.
  // After backfill is confirmed clean, this column should be made NOT NULL.
  scopeCategory GuidanceScopeCategory?

  // Denormalized scope identifier. For ITEM journeys: inventoryItemId if available,
  // else homeAssetId. For SERVICE journeys: serviceKey. Stored for API simplicity —
  // consumers should not need to check both inventoryItemId and homeAssetId.
  // Nullable during migration window; backfill derives from COALESCE(inventoryItemId, homeAssetId).
  scopeId String?

  // User-selected issue label. Free-text or a value from the suggested issue type list.
  // Null for system-generated journeys (signal-driven); populated for user-initiated journeys.
  issueType String?

  // -------------------------------------------------------------------------
  // Phase 1: SERVICE scope support
  // -------------------------------------------------------------------------

  // Service key for SERVICE-scoped journeys not tied to an inventory item or home asset.
  // Examples: "warranty_purchase", "insurance_purchase", "general_inspection", "cleaning".
  // Null for ITEM-scoped journeys.
  serviceKey String?

  // -------------------------------------------------------------------------
  // Phase 1: User override — dismiss
  // -------------------------------------------------------------------------

  // Free-text reason recorded when the user dismisses the journey ("Not relevant").
  dismissedReason String?

  // Timestamp when status was set to DISMISSED.
  dismissedAt DateTime?

  // -------------------------------------------------------------------------
  // Phase 1: User-initiated journey origin tracking
  // -------------------------------------------------------------------------

  // Distinguishes user-initiated journeys from system-generated ones.
  // true  = created by the user via "start journey" flow
  // false = created by signal ingestion (existing default behaviour)
  isUserInitiated Boolean @default(false)

  // ... rest of existing fields unchanged ...
}
```

**Field-by-field rationale:**

| Field | Type | Nullable | Rationale |
|---|---|---|---|
| `scopeCategory` | `GuidanceScopeCategory?` | Yes (backfill) | Required for ITEM/SERVICE routing; nullable until backfill completes |
| `scopeId` | `String?` | Yes (backfill) | Denormalized scope ref for API simplicity; avoids dual-FK checks |
| `issueType` | `String?` | Yes | Null for system journeys; set for user-initiated journeys |
| `serviceKey` | `String?` | Yes | Only populated for SERVICE-scoped journeys |
| `dismissedReason` | `String?` | Yes | Optional, recorded at dismissal |
| `dismissedAt` | `DateTime?` | Yes | Parallel to `completedAt`, `abortedAt`, `archivedAt` |
| `isUserInitiated` | `Boolean` | No (default false) | Preserves existing signal-driven behaviour without schema breakage |

---

### 1.5 New Indexes on `GuidanceJourney`

Add indexes to support the new query patterns Phase 2 will introduce.

```prisma
// Add to GuidanceJourney @@index list:
@@index([propertyId, scopeCategory, status, updatedAt(sort: Desc)])  // query by scope category
@@index([propertyId, scopeId, status])                               // user-selected scope lookup
@@index([propertyId, scopeCategory, scopeId, status])                // combined scope filter
@@index([propertyId, isUserInitiated, status])                       // list user-initiated journeys
@@index([serviceKey])                                                // SERVICE journey lookups
```

---

### 1.6 Backfill Migration

After the schema migration is applied, a **data backfill migration** must run to populate `scopeCategory` and `scopeId` for all existing journey rows.

**SQL logic (to be implemented as a Prisma migration `Up` script):**

```sql
-- Step 1: Set scopeCategory = 'ITEM' for all existing journeys.
-- All existing journeys were created by signal ingestion and are asset-scoped.
UPDATE guidance_journeys
SET scope_category = 'ITEM'
WHERE scope_category IS NULL;

-- Step 2: Derive scopeId from inventoryItemId (preferred) then homeAssetId.
-- For journeys where neither is set, scopeId remains NULL (edge case: signal-only journeys).
UPDATE guidance_journeys
SET scope_id = COALESCE(inventory_item_id, home_asset_id)
WHERE scope_id IS NULL
  AND (inventory_item_id IS NOT NULL OR home_asset_id IS NOT NULL);

-- Step 3: Set isUserInitiated = false for all existing rows (matches the default, explicit for clarity).
UPDATE guidance_journeys
SET is_user_initiated = false
WHERE is_user_initiated IS NULL;
```

**Validation queries to run after backfill:**

```sql
-- Confirm no NULL scopeCategory rows remain on journeys with a known asset scope
SELECT COUNT(*) FROM guidance_journeys
WHERE scope_category IS NULL
  AND (inventory_item_id IS NOT NULL OR home_asset_id IS NOT NULL);
-- Expected: 0

-- Confirm scopeId was populated wherever an asset FK exists
SELECT COUNT(*) FROM guidance_journeys
WHERE scope_id IS NULL
  AND (inventory_item_id IS NOT NULL OR home_asset_id IS NOT NULL);
-- Expected: 0

-- Count of journeys with no asset FK (signal-only edge cases)
SELECT COUNT(*) FROM guidance_journeys
WHERE scope_id IS NULL AND scope_category IS NULL;
-- Review and decide: these may be invalid legacy rows
```

---

### 1.7 `GuidanceSignal` — No Changes Required

The `GuidanceSignal` model does not need changes in Phase 1. Signal ingestion remains unchanged. The new `scopeCategory` and `scopeId` fields live on `GuidanceJourney`, not on `GuidanceSignal`.

---

### 1.8 `GuidanceJourneyStep` — No Changes Required

`GuidanceJourneyStep` does not need changes in Phase 1. The step model is already FRD-aligned (`stepKey`, `label`, `status`, `isRequired`, `skipPolicy`).

---

### 1.9 `GuidanceJourneyEvent` — No Changes Required Beyond Enum

The model itself needs no new columns. The three new `GuidanceJourneyEventType` values added in §1.3 are sufficient.

---

### 1.10 `GuidanceStepEvidence` — No Changes Required

No changes in Phase 1.

---

### 1.11 Complete Schema Change Summary

| Change | Type | Affected Model / Enum | Breaking? |
|---|---|---|---|
| Add `GuidanceScopeCategory` enum | New enum | — | No |
| Add `NOT_STARTED` to `GuidanceJourneyStatus` | Enum addition | `GuidanceJourney` | No |
| Add `DISMISSED` to `GuidanceJourneyStatus` | Enum addition | `GuidanceJourney` | No |
| Add `JOURNEY_DISMISSED` to `GuidanceJourneyEventType` | Enum addition | `GuidanceJourneyEvent` | No |
| Add `JOURNEY_SCOPE_CHANGED` to `GuidanceJourneyEventType` | Enum addition | `GuidanceJourneyEvent` | No |
| Add `JOURNEY_ISSUE_CHANGED` to `GuidanceJourneyEventType` | Enum addition | `GuidanceJourneyEvent` | No |
| Add `scopeCategory GuidanceScopeCategory?` to `GuidanceJourney` | New column (nullable) | `GuidanceJourney` | No |
| Add `scopeId String?` to `GuidanceJourney` | New column (nullable) | `GuidanceJourney` | No |
| Add `issueType String?` to `GuidanceJourney` | New column (nullable) | `GuidanceJourney` | No |
| Add `serviceKey String?` to `GuidanceJourney` | New column (nullable) | `GuidanceJourney` | No |
| Add `dismissedReason String?` to `GuidanceJourney` | New column (nullable) | `GuidanceJourney` | No |
| Add `dismissedAt DateTime?` to `GuidanceJourney` | New column (nullable) | `GuidanceJourney` | No |
| Add `isUserInitiated Boolean @default(false)` to `GuidanceJourney` | New column (default) | `GuidanceJourney` | No |
| Add 5 new indexes to `GuidanceJourney` | New indexes | `GuidanceJourney` | No |
| Backfill `scopeCategory`, `scopeId`, `isUserInitiated` | Data migration | `GuidanceJourney` | No |

**All changes are additive. No existing columns are altered or removed. No existing constraints are changed.**

---

### 1.12 Phase 1 Execution Steps

1. **Pre-migration audit:** Search codebase for exhaustive `switch` on `GuidanceJourneyStatus` — add `NOT_STARTED` and `DISMISSED` case handling before migration runs (return early / no-op is acceptable)
2. **Generate migration:** `cd apps/backend && npx prisma migrate dev --name guidance-engine-phase1-user-first-model`
3. **Review generated SQL:** Confirm all `ALTER TABLE` statements are non-locking nullable additions
4. **Apply migration to staging**
5. **Run backfill script** (§1.6 SQL) against staging database
6. **Run validation queries** (§1.6) to confirm zero NULL `scopeCategory` rows on asset-scoped journeys
7. **Regenerate Prisma client:** `npx prisma generate`
8. **Run existing guidance unit tests** to confirm no regressions
9. **Apply migration to production**
10. **Run backfill script** against production database
11. **Run validation queries** against production database

---

## Phase 2 — Backend Service and API Layer

> **Prerequisite:** Phase 1 migration applied and backfill confirmed clean.

### Goal

Add the service methods, routes, and logic required by the new user-first flow. The existing signal-driven path is preserved untouched.

### 2.1 New `ScopeCategory` Type in `guidanceTypes.ts`

```typescript
export type ScopeCategory = 'ITEM' | 'SERVICE';

export interface UserInitiatedJourneyInput {
  scopeCategory: ScopeCategory;
  scopeId: string;         // inventoryItemId, homeAssetId, or serviceKey
  issueType: string;
  // Optional hint fields for journey routing
  inventoryItemId?: string;
  homeAssetId?: string;
  serviceKey?: string;
}
```

### 2.2 New Service Methods in `guidanceJourney.service.ts`

| Method | Description |
|---|---|
| `createUserInitiatedJourney(propertyId, input: UserInitiatedJourneyInput)` | Creates a `GuidanceJourney` with `isUserInitiated = true`, `status = NOT_STARTED`, sets `scopeCategory`, `scopeId`, `issueType`; resolves template from `issueType` + `scopeCategory`; hydrates steps from template; returns the new journey |
| `dismissJourney(journeyId, userId, reason?)` | Sets `status = DISMISSED`, `dismissedAt = now()`, `dismissedReason`; writes `JOURNEY_DISMISSED` event with `actorType = USER` |
| `changeIssueForJourney(journeyId, userId, newIssueType)` | Updates `issueType`; resets `currentStepOrder = 1`, `currentStepKey` to template first step; marks all steps PENDING; writes `JOURNEY_ISSUE_CHANGED` event |

### 2.3 Updated `getPropertyGuidance()` Signature

Add optional `userSelectedScopeId` parameter to pass through to the suppression pipeline:

```typescript
getPropertyGuidance(propertyId: string, options?: {
  limit?: number;
  userSelectedScopeId?: string;  // when set, suppression is bypassed for matching journey
})
```

### 2.4 Suppression Bypass in `guidanceSuppression.service.ts`

When `userSelectedScopeId` is provided, the journey matching that scope must be exempted from:
- Weak signal suppression
- Conflict resolution / ranking-based removal

Global ranking may still determine sort order in the overview, but the matching journey must be included in the response regardless of its priority score.

### 2.5 SERVICE Journey Templates in `guidanceTemplateRegistry.ts`

Add four Phase 1 SERVICE templates:

| Template Key | Steps |
|---|---|
| `warranty_purchase_journey` | Review options → Compare plans → Select and purchase → Confirm coverage |
| `insurance_purchase_journey` | Assess coverage need → Compare policies → Select provider → Bind policy |
| `general_inspection_journey` | Schedule inspection → Prepare access → Review report → Act on findings |
| `cleaning_service_journey` | Select service type → Get quotes → Book provider → Confirm completion |

### 2.6 New API Routes in `guidance.routes.ts`

| Method | Path | Description |
|---|---|---|
| `POST` | `/properties/:propertyId/guidance/journeys/start` | Create user-initiated journey |
| `POST` | `/properties/:propertyId/guidance/journeys/:journeyId/dismiss` | Dismiss journey ("Not relevant") |
| `POST` | `/properties/:propertyId/guidance/journeys/:journeyId/change-issue` | Change issue type |
| `GET` | `/properties/:propertyId/guidance/issue-types` | Return suggested issue types for a given `scopeCategory` + `scopeId` |
| `GET` | `/properties/:propertyId/guidance/service-categories` | Return available SERVICE scope options |

### 2.7 Updated `guidanceMapper.ts` and `guidanceApi.ts`

- Expose `scopeCategory`, `scopeId`, `issueType`, `isUserInitiated`, `dismissedAt`, `dismissedReason` in the `GuidanceJourneyDTO`
- Add `NOT_STARTED` and `DISMISSED` to the frontend `GuidanceJourneyStatus` enum in `guidanceApi.ts`
- Add new mutation functions: `startGuidanceJourney()`, `dismissGuidanceJourney()`, `changeGuidanceJourneyIssue()`

---

## Phase 3 — Frontend UX Correctness Fixes (Phase 1A)

> **Prerequisite:** Phase 2 endpoints deployed.

### Goal

Fix the confirmed violations in `GuidanceOverviewClient.tsx` without adding new UX structure. These are the smallest changes that make the existing screen trustworthy.

### 3.1 Remove Asset Picker Truncation

**File:** `GuidanceOverviewClient.tsx` line 277

Remove `deduped.slice(0, 6)`. Replace with a search/filter input so users can find assets in a long list:
- Add a text filter input above the asset list
- Filter `deduped` by `assetName` match client-side
- Remove the hard cap entirely

### 3.2 Remove `limit: 10` from Guidance Fetch

**File:** `GuidanceOverviewClient.tsx` line 203

Remove the `limit: 10` option from `useGuidance()`. Pass `userSelectedScopeId` when a scope is active so the backend bypasses suppression for the selected journey.

### 3.3 Replace Risk Assessment as Asset Source

**File:** `GuidanceOverviewClient.tsx` lines 205–214

Replace `api.getRiskReportSummary()` with a Status Board / inventory endpoint. The asset picker must show all items from the homeowner's inventory, not only items that have existing risk signals.

- Use the existing inventory API (already available in `api` client)
- Map inventory items to `AssetScopeOption` shape
- Preserve `riskLevel` display where a risk signal exists for the item; show neutral state for items with no signals

### 3.4 Fix `selectedAssetOption` Lookup

**File:** `GuidanceOverviewClient.tsx` lines 280–291

Move `selectedAssetOption` to look up from the full unsliced inventory list, not from `assetScopeOptions` (which was the sliced display list). This prevents silent null resolution for assets navigated via URL params outside the former top 6.

### 3.5 Fix Copy — Remove System Language

**File:** `GuidanceOverviewClient.tsx`

| Line | Current copy | Replacement |
|---|---|---|
| 453 | `"No backend-generated journey exists yet"` | `"No active guidance found for this item yet. Use the steps below to investigate."` |
| 393 | `"ID linking pending"` shown as asset picker meta | Remove entirely or replace with `"Available for general guidance"` |

### 3.6 Add Visual Progress Bar

**File:** `GuidanceOverviewClient.tsx` lines 524–526

- Import `GuidanceJourneyStrip` and render it above the primary action block
- Show `Step {currentStep} of {totalSteps}` label alongside the strip
- Remove or demote the `text-xs` paragraph progress label

### 3.7 Add Skip Button

**File:** `GuidanceOverviewClient.tsx`

Add a Skip button below each active step CTA. The `skipGuidanceStep` mutation already exists in `guidanceApi.ts` — this is a UI-only addition.

### 3.8 Add `DISMISSED` and `NOT_STARTED` to Frontend Enum

**File:** `src/lib/api/guidanceApi.ts`

Add `NOT_STARTED = 'NOT_STARTED'` and `DISMISSED = 'DISMISSED'` to the `GuidanceJourneyStatus` enum. Filter `DISMISSED` journeys from the scoped actions list by default.

---

## Phase 4 — Frontend Entry Flow Completion (Phase 1B)

> **Prerequisite:** Phase 3 screen is stable.

### Goal

Complete the FRD entry flow: scope category selector → target picker → issue selector → user-initiated journey creation → journey steps view with full override controls.

### 4.1 Scope Category Selector

Add a `GuidanceScopeCategorySelector` as the first section of `GuidanceOverviewClient.tsx` above the asset picker.

Two options rendered as cards:
- **"Get guidance for a home item"** → sets `scopeCategory = ITEM`, shows the asset/inventory picker
- **"Find a service"** → sets `scopeCategory = SERVICE`, shows the service category picker

Store the selection in component state and as a `?scopeCategory=` URL param.

### 4.2 Issue Selector Step

After the user selects an asset or service target, show an `IssueSelector` step before loading any journey:

**Suggested issue types for ITEM scope:**
- Not working / not cooling / not heating
- Leaking or water damage
- Aging / past expected life
- Broken or damaged
- Inspection or maintenance needed
- Coverage or warranty question
- Cost estimate needed

**Suggested issue types for SERVICE scope:**
- Purchase or find a new service
- Schedule an inspection or visit
- Get quotes and compare options
- Other

Allow free-text entry for issues not on the list.

Store `issueType` in component state and as `?issueType=` URL param.

### 4.3 Replace Hardcoded Fallback Journey

**File:** `GuidanceOverviewClient.tsx` lines 305–338

Remove the `fallbackJourneySteps` array entirely. When a user has selected a scope and issue but no backend journey exists, call `POST /journeys/start` to create a real journey record:

```typescript
const startMutation = useStartGuidanceJourney(propertyId);

// On issue confirmation:
startMutation.mutate({ scopeCategory, scopeId, issueType, inventoryItemId, homeAssetId });
// Then navigate to the new journey using useJourney(propertyId, newJourneyId)
```

While the journey is being created, show a loading state. On creation, display the real backend steps.

### 4.4 Fix "Journey Steps" to Show Steps of One Journey

**File:** `GuidanceOverviewClient.tsx` lines 299–300, 533–574

Replace the `remainingActions` (other journeys by asset scope) with the ordered steps of the primary journey:

```typescript
const journeyDetail = useJourney(propertyId, primaryAction?.journeyId);
const journeySteps = journeyDetail.data?.steps ?? [];
```

Render `journeySteps` ordered by `stepOrder`. The current step gets the full primary CTA button. Future steps are shown with a muted/locked visual style — no active CTA button until the previous step is complete.

### 4.5 Add All Override Controls

Add the four mandatory FRD controls to the journey view:

| Control | Location | Action |
|---|---|---|
| **Skip** | Below each active step CTA | Calls `skipGuidanceStep(stepId)`; advances to next step |
| **Not relevant** | In the primary action block header | Calls `dismissGuidanceJourney(journeyId, reason?)`; returns to unpaged overview |
| **Change asset** | Replace "Clear asset focus" label; keep same behaviour | Removes scope URL params; returns to asset picker |
| **Different issue** | In the primary action block header | Resets `issueType` state; returns to issue selector with asset pre-selected |

### 4.6 SERVICE Scope Picker

When `scopeCategory = SERVICE` is selected, show a service category list instead of the inventory item picker:

- Warranty purchase
- Insurance purchase
- General inspection
- Cleaning service

Each selection sets `scopeId = serviceKey` and proceeds to the issue selector step.

---

## Cross-Phase Dependencies

```
Phase 1 (DB)
  └─► Phase 2 (Backend) — new columns and enums must exist before service code runs
        └─► Phase 3 (Frontend fixes) — suppression bypass endpoint must be live
              └─► Phase 4 (Entry flow) — POST /journeys/start must be available
```

Each phase can be deployed independently once its prerequisite is merged and deployed. Phases 1 and 2 are backend-only and have zero frontend surface risk.

---

## Acceptance Criteria by Phase

### Phase 1 (DB)
- [ ] Migration generates with no errors: `npx prisma migrate dev`
- [ ] All new columns are nullable or have defaults — no `NOT NULL` without a default
- [ ] Backfill validation queries all return `0` for expected-null rows
- [ ] Prisma client regenerates without type errors: `npx prisma generate`
- [ ] Existing guidance unit tests pass without modification

### Phase 2 (Backend)
- [ ] `POST /journeys/start` creates a journey with `isUserInitiated = true`, `status = NOT_STARTED`, correct `scopeCategory`, `scopeId`, `issueType`
- [ ] Journey steps are hydrated from template at creation time
- [ ] `POST /journeys/:id/dismiss` sets `status = DISMISSED`, records `JOURNEY_DISMISSED` event with `actorType = USER`
- [ ] `getPropertyGuidance()` with `userSelectedScopeId` returns the matching journey regardless of suppression score
- [ ] DTOs include `scopeCategory`, `scopeId`, `issueType`, `isUserInitiated`
- [ ] `GET /guidance/issue-types` returns appropriate suggestions for `scopeCategory + scopeId`

### Phase 3 (Frontend fixes)
- [ ] Asset picker shows all inventory items, not capped to 6
- [ ] Guidance fetch has no `limit: 10` pre-scope
- [ ] Asset picker sources from inventory, not Risk Assessment
- [ ] Navigating via URL param to any asset (regardless of rank) resolves `selectedAssetOption` correctly
- [ ] No system-language copy visible to users
- [ ] `GuidanceJourneyStrip` renders above the primary action block
- [ ] Skip button is rendered per active step

### Phase 4 (Entry flow)
- [ ] User can select ITEM or SERVICE as the first step
- [ ] User can select an issue type (or enter custom) before a journey is started
- [ ] Selecting an asset + issue with no existing journey calls `POST /journeys/start` and shows real backend steps
- [ ] "Journey Steps" shows steps from one journey in order, not multiple journeys
- [ ] Skip, Not relevant, Change asset, Different issue controls are all present and functional
- [ ] SERVICE scope picker shows 4 service categories and creates SERVICE-scoped journeys
- [ ] A selected scope always produces a usable next action in ≤ 2 clicks after scope selection (FRD primary success metric)

---

## Risk and Mitigation per Phase

| Phase | Risk | Mitigation |
|---|---|---|
| 1 | Exhaustive `switch` on `GuidanceJourneyStatus` will fail to compile after enum addition | Audit before migration; add `NOT_STARTED`/`DISMISSED` as no-op cases first |
| 1 | Backfill on large tables causes lock contention | Use batched UPDATE with `LIMIT 1000` and loop |
| 1 | Legacy journeys with neither `inventoryItemId` nor `homeAssetId` left with `scopeId = NULL` | Accept NULL for these edge cases; add `scope_category` index as partial to exclude NULLs if needed |
| 2 | `createUserInitiatedJourney()` must choose the right template from only `issueType` + `scopeCategory` | Add a `resolveTemplateFromIssueType()` function; map issue types to `GuidanceSignalIntentFamily` equivalents for routing |
| 2 | SERVICE templates have no signal data source to populate step context | For v1 SERVICE journeys, all step context is user-confirmed only; no tool integration required |
| 3 | Replacing Risk Assessment source with inventory may show assets with no guidance context | Show "No issues detected — start a journey" state rather than the old fallback |
| 4 | Removing hardcoded fallback requires `POST /journeys/start` to be fast and reliable | Add optimistic UI: show a skeleton step list immediately; replace with real steps on response |
| 4 | `useJourney()` adds a second API call on the page | Prefetch on asset hover; accept the latency tradeoff for correctness |

---

*Implementation plan derived from `guidance-engine-gap-analysis.md` and full review of `GuidanceOverviewClient.tsx` and `prisma/schema.prisma`.*
