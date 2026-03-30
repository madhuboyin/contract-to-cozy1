# Guidance Engine — Gap Analysis
**Date:** 2026-03-29
**FRD Version:** Guidance Engine (User-First End-to-End Resolution Journeys)
**Scope:** Backend, Frontend, Database

---

## 1. Executive Summary

The existing Guidance Engine is a sophisticated, signal-driven recommendation pipeline built around system-first prioritization, multi-dimensional ranking, and suppression logic. The `guidance-overview` screen does implement a partial user-first entry flow — a user can pick an asset and land on scoped guidance — but the implementation falls short of the FRD in several critical ways.

**What the screen does implement:**
- An asset picker sourced from the Risk Assessment report
- URL-based scope filtering via `itemId`, `inventoryItemId`, `homeAssetId`, `assetName` query params
- A primary action display with a "Why now" explanation block
- A fallback 6-step journey (hardcoded links) when no backend journey exists for the selected asset
- A "Clear asset focus" control (partial equivalent of "Change asset")
- Progress rendered as a text label (`0/4 steps (25%)`)

**What is structurally missing:**
- The asset picker is capped to **top 6** (`slice(0, 6)` at line 277) sourced from **Risk Assessment**, not the Status Board
- There is **no `ITEM` vs `SERVICE` scope category selector** — the first step of the FRD entry flow is absent
- There is **no issue selection step** — users jump from asset selection straight to existing system journeys
- The fallback journey is **hardcoded frontend links** that create no backend record, so nothing is tracked
- **No override controls**: Skip, Not relevant, Different issue are absent; Change asset is only a "clear filter" link
- Progress is a **text string**, not a visual progress bar
- The "Journey Steps" section renders **other journeys filtered by asset**, not steps within one journey
- **SERVICE scope** (non-item services) is entirely absent

**Overall Assessment:** The gap is not purely cosmetic. The data model, entry flow completeness, fallback journey persistence, and override controls all require targeted changes. The step/journey execution machinery, templates, and backend scoring services are reusable and do not need to be replaced.

---

## 2. File Inventory

### Backend

| File | Purpose |
|---|---|
| `src/routes/guidance.routes.ts` | 8 Express endpoints with Zod validation |
| `src/controllers/guidance.controller.ts` | Request handlers, service orchestration |
| `src/services/guidanceEngine/guidanceJourney.service.ts` | Main journey orchestrator |
| `src/services/guidanceEngine/guidanceSignalResolver.service.ts` | Signal normalization, family → domain/stage/readiness mapping |
| `src/services/guidanceEngine/guidanceStepResolver.service.ts` | Step lifecycle and state transitions |
| `src/services/guidanceEngine/guidanceTemplateRegistry.ts` | 8+ journey templates with ordered steps |
| `src/services/guidanceEngine/guidanceConfidence.service.ts` | Confidence score calculation (0.0–1.0) |
| `src/services/guidanceEngine/guidancePriority.service.ts` | Priority score calculation (0–100), buckets, groups |
| `src/services/guidanceEngine/guidanceFinancialContext.service.ts` | Financial impact scoring |
| `src/services/guidanceEngine/guidanceSuppression.service.ts` | Global deduplication, weak signal filtering, ranking |
| `src/services/guidanceEngine/guidanceBookingGuard.service.ts` | Execution prerequisite enforcement |
| `src/services/guidanceEngine/guidanceValidation.service.ts` | Data quality, staleness assessment |
| `src/services/guidanceEngine/guidanceCopy.service.ts` | Human-readable message generation |
| `src/services/guidanceEngine/guidanceDerivedData.service.ts` | Tool output normalization to context keys |
| `src/services/guidanceEngine/guidanceMapper.ts` | DB models → API DTOs |
| `src/services/guidanceEngine/guidanceTypes.ts` | Enums, constants, shared types |

### Database (Prisma Models)

| Model | Purpose |
|---|---|
| `GuidanceSignal` | Detected issue/opportunity from system tools |
| `GuidanceJourney` | Multi-step action plan triggered by a signal |
| `GuidanceJourneyStep` | Individual steps within a journey |
| `GuidanceJourneyEvent` | Audit log of all state transitions |
| `GuidanceStepEvidence` | Proof of completion records |

### Frontend

| File | Purpose |
|---|---|
| `src/lib/api/guidanceApi.ts` | Typed API client with all DTOs and mutations |
| `src/features/guidance/hooks/useGuidance.ts` | Property-level guidance data hook |
| `src/features/guidance/hooks/useJourney.ts` | Single journey detail hook |
| `src/features/guidance/hooks/useExecutionGuard.ts` | Execution readiness check hook |
| `src/features/guidance/utils/guidanceMappers.ts` | Journey → frontend action model conversion |
| `src/features/guidance/utils/guidanceDisplay.ts` | Formatting, URL resolution, copy building |
| `src/features/guidance/utils/guidanceContinuity.ts` | Journey continuity helpers |
| `src/components/guidance/GuidanceDrawer.tsx` | Sheet modal for journey details |
| `src/components/guidance/GuidanceStepList.tsx` | Step list with status badges |
| `src/components/guidance/GuidanceActionCard.tsx` | Single action card display |
| `src/components/guidance/GuidanceInlinePanel.tsx` | Dashboard inline guidance |
| `src/components/guidance/GuidancePrimaryCta.tsx` | Primary CTA button |
| `src/components/guidance/GuidanceStepCompletionCard.tsx` | Step completion card |
| `src/components/guidance/GuidanceJourneyStrip.tsx` | Horizontal journey progress strip |
| `src/components/guidance/GuidanceStatusBadge.tsx` | Step/journey status badge |
| `src/components/orchestration/guidanceActionLinking.ts` | Risk action → journey semantic linking |
| `src/app/(dashboard)/dashboard/properties/[id]/tools/guidance-overview/GuidanceOverviewClient.tsx` | Primary user-facing guidance page |

---

## 3. GuidanceOverviewClient Screen Audit

### 3.1 What the Screen Currently Does

The `GuidanceOverviewClient.tsx` screen (`/tools/guidance-overview`) is the primary user-facing guidance experience. Here is what it implements today:

**Asset Picker (lines 246–278)**
An `assetScopeOptions` array is built from `riskReportQuery.data?.details` (the Risk Assessment report). Each asset is rendered as a link that appends `itemId`, `homeAssetId`, and `assetName` as URL query params to the same page, triggering scope filtering.

**Scope Filtering (lines 192–244)**
When URL params are present (`hasScopeFilter = true`), `filteredActions` is derived by matching `inventoryItemId`, `homeAssetId`, or `assetName` against the property's guidance actions returned by `useGuidance`. A "Clear asset focus" button resets all params.

**Primary Action Block (lines 504–531)**
When a scoped backend journey exists, `actions[0]` is rendered as the primary action with a "Why now" explanation, delay cost, and progress label. This is the closest current implementation of the FRD's "one primary next action + one reason" requirement.

**Fallback Journey (lines 475–501)**
When no backend journey exists for the selected asset, a hardcoded 6-step path is rendered with direct links to: Coverage Intelligence, Replace/Repair, Service Price Radar, Providers, Negotiation Shield, Price Finalization.

**Journey Steps List (lines 533–574)**
`remainingActions` (i.e., `actions.slice(1)`) is rendered as "Journey Steps". These are the second and subsequent backend journeys filtered by asset scope — not the individual steps within a single journey.

**Progress Label (line 524–526)**
Progress is rendered inline as `<p className="text-xs">Progress: 0/4 steps (25%)</p>`. No visual progress bar component is used; `GuidanceJourneyStrip.tsx` is not rendered here.

---

### 3.2 Confirmed Issues in the Screen

| Line(s) | Issue | FRD Violation |
|---|---|---|
| 277 | `deduped.slice(0, 6)` — asset picker capped to 6 | FRD §9.2, §10.3: no slice(0,6) |
| 203–204 | `useGuidance(propertyId, { limit: 10 })` — guidance fetch capped before scope selection | FRD §10.3: no limit before scope filtering |
| 205–214 | Asset source is `api.getRiskReportSummary()` (Risk Assessment) not Status Board | FRD §9.2, §10.3: asset source must be Status Board |
| 283 | `selectedAssetOption` lookup is within the already-sliced `assetScopeOptions` — assets outside top 6 resolve to null even when navigated via URL | FRD §9.8: user-selected scope must not be suppressed |
| 305–338 | Fallback journey is 6 hardcoded frontend links — no backend journey record created | FRD §9.12: system must produce a persisted, trackable journey |
| Screen-wide | No `ITEM` vs `SERVICE` scope category selector | FRD §5, §9.1: first step of entry flow |
| Screen-wide | No issue selection step after asset selection | FRD §9.3: user must select or enter issueType |
| Screen-wide | No "Not relevant" or "Skip" or "Different issue" control | FRD §9.7: mandatory override controls |
| 417–419 | "Clear asset focus" partially serves "Change asset" but is not labeled as such and exists outside journey context | FRD §9.7: "Change asset" must be present within the journey view |
| 299–300 + 543 | "Journey Steps" section renders other journeys by asset scope, not steps of one journey | FRD §9.4: one linear journey with ordered steps |
| 524–526 | Progress is a `text-xs` paragraph — no visual progress bar | FRD §9.6: progress bar or equivalent |
| 234 | `signalIntentFamily` used directly in filter logic exposed to UI | FRD §9.9: no backend/system language in UI |
| 453 | Copy: "No backend-generated journey exists yet" | FRD §9.9: homeowner-friendly language required |
| 393 | Copy: "ID linking pending" shown to users | FRD §9.9: homeowner-friendly language required |
| Screen-wide | `GuidanceJourneyStrip.tsx` exists but is not imported or used in this screen | FRD §9.6: journey strip should be the canonical progress component |

---

## 4. Gap Analysis by FRD Section

### 4.1 User-First Entry Flow — Scope Category Selection (FRD §5, §9.1, §10.1)

**FRD Requirement:**
The first step of the entry flow is selecting a scope category: **ITEM** or **SERVICE**. This is a mandatory top-level choice before picking a target.

**Current State:**
The screen has no scope category selector. It renders an asset picker directly, which only supports the `ITEM` concept (assets from risk report). There is no concept of `SERVICE` journeys in the UI at any point.

**Gap:** CRITICAL — Missing first step of FRD entry flow
**Impacted File:** `GuidanceOverviewClient.tsx` (entire screen, no category selector)

**Required Changes:**
- Add a `GuidanceScopeCategorySelector` as the first visible section: two cards/buttons — "Get help with a home item" (ITEM) and "Find a service" (SERVICE)
- Gate the asset picker behind ITEM selection; show service category list behind SERVICE selection
- Record the chosen `scopeCategory` in component state and as a URL param

---

### 4.2 User-First Entry Flow — Issue Selection (FRD §9.3, §10.1)

**FRD Requirement:**
After the user selects a scope target (item or service), they must be able to choose from suggested issue types or enter a custom issue. `issueType` must be captured before the journey is generated.

**Current State:**
The screen has no issue selection step. After an asset is selected via URL params, the screen immediately queries `useGuidance` for existing backend journeys. The user has no way to express what the problem is. If no backend journey exists, a hardcoded fallback is rendered regardless of the actual issue.

**Gap:** HIGH — Missing second step of FRD entry flow
**Impacted Files:**
- `GuidanceOverviewClient.tsx` — no issue selector between asset selection and journey display
- `prisma/schema.prisma` — `GuidanceJourney` has no `issueType` field
- `guidanceApi.ts` — DTOs have no `issueType`

**Required Changes:**
- After asset/service target selection, show an `IssueSelector` step with suggested issues (not cooling, leak, past life, broken, inspection needed, coverage purchase needed, quote comparison)
- Allow free-text entry for custom issues
- Pass `issueType` to the journey creation API call
- Add `issueType String?` to `GuidanceJourney` Prisma model

---

### 4.3 Scope Category Model in Data Layer (FRD §9.1, §9.10, §11.2)

**FRD Requirement:**
`scopeCategory` (ITEM | SERVICE) must be a first-class field on the journey record. The model must be extensible for future categories.

**Current State:**
No `scopeCategory` field exists in the `GuidanceJourney` Prisma model or any DTO. Scope is implicitly encoded via nullable `homeAssetId` / `inventoryItemId` FK presence. There is no concept of a `SERVICE` scope for non-item journeys.

**Gap:** HIGH — Data Model
**Impacted Files:**
- `prisma/schema.prisma` — `GuidanceJourney` lacks `scopeCategory` and `scopeId`
- `guidanceTypes.ts` — no `ScopeCategory` enum
- `guidanceJourney.service.ts` — no routing logic for ITEM vs SERVICE
- `guidanceApi.ts` — DTOs lack both fields

**Required Changes:**
- Add `ScopeCategory` enum to `guidanceTypes.ts`: `ITEM | SERVICE`
- Add `scopeCategory ScopeCategory` and `scopeId String` to `GuidanceJourney` Prisma model
- Run Prisma migration; backfill `scopeCategory = ITEM` for existing records
- Update journey service, mapper, and API DTOs to include these fields
- Add SERVICE journey templates to `guidanceTemplateRegistry.ts`

---

### 4.4 Asset Picker — Source and Truncation (FRD §9.2, §10.3, §16 Phase 1A)

**FRD Requirement:**
- Asset source must be the **Status Board** (inventory)
- No `slice(0, 6)` on asset options
- No `limit: 10` in guidance data fetch before scope filtering
- Display limits only after scope selection, for presentational reasons only

**Current State — Confirmed in Code:**

`GuidanceOverviewClient.tsx`:
- **Line 277:** `deduped.slice(0, 6)` — hard cap of 6 assets in picker
- **Line 203–204:** `useGuidance(propertyId, { limit: 10 })` — guidance fetch capped to 10 before any scope is applied
- **Lines 205–214:** Asset picker sources from `api.getRiskReportSummary()` (Risk Assessment), not the Status Board. Assets that exist in inventory but have no risk signals are invisible to the user.
- **Line 283:** `selectedAssetOption` is looked up within the already-sliced `assetScopeOptions` array. If a user navigates directly to the page with a URL param pointing to an asset outside the top 6, `selectedAssetOption` will be `null` and `fallbackJourneySteps` will not build correctly.

**Gap:** HIGH — Frontend Logic (confirmed with line numbers)
**Impacted Files:**
- `GuidanceOverviewClient.tsx` lines 246–291 — `assetScopeOptions` build logic
- `GuidanceOverviewClient.tsx` line 203 — `useGuidance` call with `limit: 10`
- `src/features/guidance/hooks/useGuidance.ts` — `limit` parameter forwarded to API

**Required Changes:**
- Replace `api.getRiskReportSummary()` as the asset source with the Status Board / inventory endpoint
- Remove `deduped.slice(0, 6)` — show all available items, add search/filter UI instead
- Remove `limit: 10` from the `useGuidance` call in `GuidanceOverviewClient.tsx`
- Move `selectedAssetOption` lookup to work against the full unsliced list, not the display subset

---

### 4.5 Fallback Journey — Hardcoded, Non-Persisted (FRD §9.5, §9.12, §15)

**FRD Requirement:**
A valid selected scope must consistently return a usable next action. Step completions, skips, and dismissals must be trackable. The FRD success metric requires a usable next action in ≤2 clicks after scope selection.

**Current State — Confirmed in Code:**

`GuidanceOverviewClient.tsx` lines 305–338: When no backend journey exists for the selected asset, `fallbackJourneySteps` is constructed as a static array of 6 hardcoded `{ title, description, href, cta }` objects. These are:
1. Check Coverage → `/tools/coverage-intelligence`
2. Decide Repair vs Replace → `/inventory/items/:id/replace-repair`
3. Estimate Service Pricing → `/tools/service-price-radar`
4. Get Providers and Quotes → `/dashboard/providers`
5. Negotiate Price → `/tools/negotiation-shield`
6. Finalize Terms → `/tools/price-finalization`

These are rendered as plain links with no backend state. No `GuidanceJourney` record is created. No step can be completed, skipped, or dismissed. Progress cannot be tracked. When the user returns to the page, the same fallback renders again from scratch — there is no continuity.

Additionally, `fallbackJourneySteps` depends on `selectedAssetOption` (line 305) which is looked up within the already-sliced 6-item list, meaning it may be `null` for assets outside the top 6 and the fallback steps will generate with empty href parameters.

**Gap:** HIGH — Missing Backend Integration
**Impacted Files:**
- `GuidanceOverviewClient.tsx` lines 305–338 — entire `fallbackJourneySteps` block
- `guidance.routes.ts` — no `POST /journeys/start` endpoint for user-initiated creation
- `guidanceJourney.service.ts` — no `createUserInitiatedJourney()` method

**Required Changes:**
- Remove the hardcoded `fallbackJourneySteps` array
- When a user selects an asset + issue and no backend journey exists, call `POST /journeys/start` to create a real journey record
- The backend must return a journey with steps that can be completed/skipped/tracked
- Add `createUserInitiatedJourney(propertyId, scopeCategory, scopeId, issueType)` to `guidanceJourney.service.ts`
- Add `POST /api/properties/:propertyId/guidance/journeys/start` route

---

### 4.6 "Journey Steps" Section — Shows Journeys, Not Steps (FRD §9.4)

**FRD Requirement:**
One linear journey with no more than 5–6 ordered steps. The user sees a single sequential path, not multiple competing journeys.

**Current State — Confirmed in Code:**

`GuidanceOverviewClient.tsx` lines 533–574: The "Journey Steps" section renders `remainingActions` which is `actions.slice(1)` (line 300). `actions` is the list of all backend journeys filtered by the selected asset scope. Each item in `remainingActions` is a **separate `GuidanceJourney`** record rendered as a step row.

This means:
- If there are 3 separate backend journeys for the same asset (e.g., coverage gap, lifecycle, financial), they all appear as "steps 2, 3, 4" — but they are actually different journeys with different templates
- There is no single linear step sequence shown
- The user cannot tell they are looking at independent journeys rather than steps of one journey

**Gap:** HIGH — UX Architecture Mismatch
**Impacted Files:**
- `GuidanceOverviewClient.tsx` lines 299–300, 533–574 — the `remainingActions` rendering logic

**Required Changes:**
- The primary journey view must show the ordered **steps** of the selected journey (from `GuidanceJourneyStep`), not a list of other journeys
- Use `useJourney(propertyId, journeyId)` to fetch the full step list for the selected journey
- Render steps from `journey.steps` ordered by `stepOrder`, not from `remainingActions`
- Other journeys for the same asset can be shown in a separate "Other issues for this asset" section if needed

---

### 4.7 One Primary Next Action — Per-Journey Enforcement (FRD §9.5, §6.3)

**FRD Requirement:**
Every journey state must produce exactly one primary next action, one reason, and one visible progress indicator.

**Current State:**
Within a scoped view, the screen does enforce `primaryAction = actions[0]` and renders the rest as secondary (lines 299–300). The "Why now" block (lines 510–527) provides one reason.

However, the enforcement breaks when `hasScopeFilter` is false — the screen renders nothing but a prompt to "Select an asset to begin" which is correct. The issue is that the `remainingActions` section renders additional action CTAs below the primary, each with its own "Open: [step]" button. These are rendered with equal visual weight as `rounded-xl border bg-white` buttons — the same style — creating competing CTAs.

**Gap:** MEDIUM — Visual Hierarchy
**Impacted Files:**
- `GuidanceOverviewClient.tsx` lines 553–568 — `remainingActions` CTA button styling

**Required Changes:**
- Once this section is corrected to show journey steps (per gap 4.6), steps after the current one should be rendered as upcoming/inactive — not as fully active CTA buttons
- Only the current active step should have a primary CTA; subsequent steps should show as locked or dimmed
- Secondary steps should use a muted visual style, not the same button as the primary action

---

### 4.8 User Override Controls (FRD §9.7, §10.2)

**FRD Requirement:**
At any point the user must be able to: **Skip**, **Not relevant**, **Change asset**, **Different issue**. Mandatory UX controls.

**Current State — Confirmed in Screen:**
- **Skip** — `skipGuidanceStep` exists in `guidanceApi.ts` but no Skip button is rendered anywhere in `GuidanceOverviewClient.tsx`
- **Not relevant** — No dismiss control exists in the screen. The journey `ABORTED` status exists in the DB but has no user trigger
- **Change asset** — "Clear asset focus" (line 417–419) removes the URL filter and returns the user to the full unscoped view. This is a partial functional equivalent but is not labeled "Change asset" and is not co-located with the journey view
- **Different issue** — No mechanism exists anywhere in the screen or backend

**Gap:** HIGH — Missing Controls
**Impacted Files:**
- `GuidanceOverviewClient.tsx` — no skip, dismiss, or different-issue buttons
- `guidance.routes.ts` — missing `POST /journeys/:id/dismiss` and `POST /journeys/:id/change-issue`
- `guidanceJourney.service.ts` — no `dismissJourney()` or `changeIssueForJourney()` methods
- `guidanceApi.ts` — missing mutation functions

**Required Changes:**
- Add a skip button per active step in the journey step list
- Add "Not relevant" button in the journey header or primary action block → calls `POST /journeys/:id/dismiss`
- Rename or supplement "Clear asset focus" to "Change asset" within the journey view
- Add "Different issue" control → resets to issue selector with the same asset pre-selected
- Implement backend: `dismissJourney()` service method, corresponding route and mutation

---

### 4.9 Status Model (FRD §9.11)

**FRD Requirement:**
Journey status: `NOT_STARTED | IN_PROGRESS | BLOCKED | COMPLETED | DISMISSED`

**Current State:**
`GuidanceJourney` status enum: `ACTIVE | COMPLETED | ABORTED | ARCHIVED`

Mapping differences:
- `NOT_STARTED` — absent; needed for user-initiated journeys before first step is taken
- `DISMISSED` — absent; `ABORTED` is used for system-cancelled journeys and is semantically different
- `IN_PROGRESS` maps to `ACTIVE` but differs in name
- `BLOCKED` exists at step level but not at journey level
- `ARCHIVED` has no FRD equivalent

**Gap:** MEDIUM — Data Model
**Impacted Files:**
- `prisma/schema.prisma` — `GuidanceJourneyStatus` enum
- `guidanceTypes.ts` — `JourneyStatus` type
- `guidanceJourney.service.ts` — status transitions
- `guidanceMapper.ts`, `guidanceApi.ts` — serialization and frontend enum

**Required Changes:**
- Add `NOT_STARTED` to the enum for user-created journeys prior to first step action
- Add `DISMISSED` as a distinct status triggered by the user "Not relevant" control
- Keep `ABORTED` and `ARCHIVED` as internal system statuses, not exposed in user-facing copy
- Create Prisma migration; update mapper, DTOs, and frontend enum

---

### 4.10 Suppression of User-Selected Scope (FRD §9.8)

**FRD Requirement:**
A user-selected scope must never be suppressed by global ranking or suppression rules.

**Current State:**
`guidanceSuppression.service.ts` applies portfolio-wide suppression including weak signal filtering, deduplication, and conflict resolution. The `GuidanceOverviewClient` passes the filtered result of `useGuidance` into `filteredActions`. If the user selects an asset that has a weak or low-priority signal, that journey may have been filtered out by suppression before the frontend receives it, resulting in `filteredActions.length === 0` and the hardcoded fallback being shown.

This is a direct violation of FRD §9.8: the selected scope falls back to a non-persisted journey because backend suppression removed the signal before the user even selected it.

**Gap:** HIGH — Business Logic
**Impacted Files:**
- `guidanceSuppression.service.ts` — global suppression has no bypass for user-selected scope
- `guidanceJourney.service.ts` — calls suppression before returning guidance
- `GuidanceOverviewClient.tsx` line 203–204 — `useGuidance` receives the suppressed result with no scope hint

**Required Changes:**
- Add `userSelectedScopeId?: string` to `getPropertyGuidance()` and the suppression pipeline
- When `userSelectedScopeId` is set, bypass weak-signal suppression and conflict resolution for the matching journey
- Frontend: pass the selected `inventoryItemId` or `homeAssetId` as a scope hint to `useGuidance`

---

### 4.11 SERVICE Scope — Non-Item Services (FRD §9.2)

**FRD Requirement:**
SERVICE journeys must support non-item services (buy warranty, buy insurance, cleaning, inspection). SERVICE must use the same journey model as ITEM.

**Current State:**
The asset picker exclusively renders items from the Risk Assessment report. There is no service category picker, no service journey templates, no service-type scope in the data model. Non-item services are entirely absent from the system.

**Gap:** HIGH — Data Model + Templates + UI
**Impacted Files:**
- `GuidanceOverviewClient.tsx` — no service category section
- `prisma/schema.prisma` — no `serviceKey` or service-typed scope on `GuidanceJourney`
- `guidanceTemplateRegistry.ts` — no SERVICE journey templates
- `guidanceTypes.ts` — no service scope types

**Required Changes:**
- Add a SERVICE section to the scope picker in `GuidanceOverviewClient.tsx`
- Add `serviceKey String?` to `GuidanceJourney` for non-item service journeys
- Add service journey templates: `warranty_purchase_journey`, `insurance_purchase_journey`, `general_inspection_journey`, `cleaning_service_journey`
- Update journey routing to handle `scopeCategory = SERVICE` with `scopeId = serviceKey`

---

### 4.12 Progress Indicator (FRD §9.6, §10.2)

**FRD Requirement:**
The journey screen must prominently display a visual progress indicator: current step, total steps, progress bar or equivalent.

**Current State — Confirmed in Screen:**
`GuidanceOverviewClient.tsx` line 524–526:
```jsx
<p className="mb-0 text-xs text-[hsl(var(--mobile-text-muted))]">
  Progress: {resolveProgressLabel(primaryAction)}
</p>
```
This renders as a small muted `text-xs` paragraph inside the "Why now" context box — not a visual progress bar. `GuidanceJourneyStrip.tsx` exists in the components directory but is not imported or used anywhere in `GuidanceOverviewClient.tsx`.

**Gap:** MEDIUM — Visual Prominence
**Impacted Files:**
- `GuidanceOverviewClient.tsx` lines 524–526 — progress is `text-xs` paragraph
- `GuidanceJourneyStrip.tsx` — exists but not used in main journey screen

**Required Changes:**
- Import and render `GuidanceJourneyStrip` above the primary action block
- Display step count (`Step X of Y`) alongside the strip
- Demote the text-only progress label or remove it in favour of the visual strip

---

### 4.13 Required Fields Contract (FRD §9.10)

**FRD Requirement:**
Minimum required journey fields: `scopeCategory`, `scopeId`, `issueType`, `status`, `currentStep`

**Current State:**

| FRD Field | Current Model | Status |
|---|---|---|
| `scopeCategory` | Not present in `GuidanceJourney` | **MISSING** |
| `scopeId` | Not present; uses `homeAssetId`/`inventoryItemId` FKs separately | **MISSING** |
| `issueType` | Not present; implicit via `signalIntentFamily` + `issueDomain` | **MISSING** |
| `status` | Present as `GuidanceJourneyStatus` enum | Present (values differ — see §4.9) |
| `currentStep` | Present as `currentStepKey` + `currentStepOrder` | Present |

**Gap:** HIGH — Data Model
**Required Changes:**
- Add `scopeCategory ScopeCategory` to `GuidanceJourney`
- Add `scopeId String` (denormalized for API simplicity)
- Add `issueType String?`
- Update Prisma schema, run migration with backfill
- Update `guidanceMapper.ts` and `guidanceApi.ts` DTOs

---

### 4.14 Journey Model — Steps vs Stage Labels (FRD §9.4)

**FRD Requirement:**
Canonical v1 journey stages: `Identify → Evaluate options → Decide → Execute`. UI renders up to 5–6 steps. Steps must be linear, concise, understandable.

**Current State:**
The backend has 6 decision stages (`AWARENESS, DIAGNOSIS, DECISION, EXECUTION, VALIDATION, TRACKING`) and 8+ journey templates. The step count per template (3–6 steps) is within the FRD's 5–6 limit. The issue is stage labeling: `DIAGNOSIS`, `EXECUTION`, `VALIDATION` are technical terms that should not be visible to users. The copy service exists but does not always produce FRD-aligned stage labels.

**Gap:** MEDIUM — Display Layer Alignment
**Impacted Files:**
- `guidanceTypes.ts` — `DecisionStage` enum values are technical
- `guidanceDisplay.ts` — stage formatting not fully FRD-aligned
- `GuidanceStepList.tsx` — may render raw `decisionStage` values

**Required Changes:**
- Add a display-layer mapping in `guidanceDisplay.ts`: `AWARENESS → Identify`, `DIAGNOSIS → Evaluate`, `DECISION → Decide`, `EXECUTION → Execute` (no DB change required)
- Ensure `GuidanceStepList` uses the mapped label, not the raw enum value
- Steps may show their concrete label (e.g., "Compare Repair vs Replace") without the stage label if the stage label adds no user value

---

### 4.15 User Language / Copy (FRD §9.9, §6.4)

**FRD Requirement:**
All user-facing copy must use homeowner-friendly language. No backend/system terms in the UI.

**Current State — Confirmed in Screen:**
- **Line 453:** `"No backend-generated journey exists yet"` — explicit backend terminology shown to users
- **Line 393:** `"ID linking pending"` shown as a `meta` prop in the asset picker
- **Line 234:** `signalIntentFamily` accessed directly in `filteredActions` filter logic and may leak into display
- `DOMAIN_FOCUS_LABELS` (lines 27–37) and `SIGNAL_SUBTITLE_LABELS` (lines 39–48) show good intent but the fallback copy is generic

**Gap:** MEDIUM — Copy
**Impacted Files:**
- `GuidanceOverviewClient.tsx` lines 393, 453 — explicit system language
- `guidanceDisplay.ts` — some formatting functions return technical labels
- `GuidanceStepList.tsx` — may render raw `stepKey` values

**Required Changes:**
- Replace "No backend-generated journey exists yet" with homeowner-friendly phrasing: "We haven't detected any active issues for this item yet. Use the steps below to investigate."
- Replace "ID linking pending" with user-appropriate text or remove it from the visible UI
- Audit all `text-xs`, `text-sm` copy strings in the screen for any technical language
- Ensure no raw enum values appear in rendered output

---

### 4.16 Guidance Fetch Limit Before Scope (FRD §10.3)

**FRD Requirement:**
`getPropertyGuidance()` must not apply a global limit before scope filtering.

**Current State — Confirmed in Code:**
`GuidanceOverviewClient.tsx` line 203: `useGuidance(propertyId, { limit: 10 })`. The hook passes `limit: 10` to the API query, which is applied at the backend `getPropertyGuidance()` level before any user-scope filtering. If a property has more than 10 journeys, the user-selected asset's journey may not be in the returned set.

**Gap:** MEDIUM — Query Logic
**Impacted Files:**
- `GuidanceOverviewClient.tsx` line 203 — `limit: 10` passed to hook
- `src/features/guidance/hooks/useGuidance.ts` — `limit` param forwarded to API
- `guidanceJourney.service.ts` — `getPropertyGuidance()` applies limit pre-scope

**Required Changes:**
- Remove `limit: 10` from the `useGuidance` call in `GuidanceOverviewClient.tsx`
- In `guidanceJourney.service.ts`: when a `scopeId` is provided, bypass any pagination limit for the matching journey
- Apply display limits only after scope selection in the frontend rendering layer

---

## 5. Summary Gap Table

| # | FRD Requirement | Gap Severity | Status | Key Files |
|---|---|---|---|---|
| 4.1 | Scope category selector (ITEM vs SERVICE) as first step | CRITICAL | Missing | `GuidanceOverviewClient.tsx` |
| 4.2 | Issue selection step after asset/service selection | HIGH | Missing | `GuidanceOverviewClient.tsx`, `schema.prisma` |
| 4.3 | `scopeCategory`/`scopeId` fields in data model | HIGH | Missing | `schema.prisma`, `guidanceTypes.ts`, `guidanceApi.ts` |
| 4.4 | Full item picker from Status Board, no `slice(0,6)`, no `limit:10` | HIGH | Partial (confirmed violations) | `GuidanceOverviewClient.tsx` lines 203, 277 |
| 4.5 | Fallback journey must be persisted backend journey, not hardcoded links | HIGH | Missing (fallback is non-persisted) | `GuidanceOverviewClient.tsx` lines 305–338 |
| 4.6 | "Journey Steps" must show steps of one journey, not multiple journeys | HIGH | Wrong (shows journeys, not steps) | `GuidanceOverviewClient.tsx` lines 299–300, 533–574 |
| 4.7 | One primary CTA; subsequent steps dimmed/inactive | MEDIUM | Partial | `GuidanceOverviewClient.tsx` lines 553–568 |
| 4.8 | Override controls: Skip, Not relevant, Change asset, Different issue | HIGH | Missing (only partial "Clear filter") | `GuidanceOverviewClient.tsx`, `guidance.routes.ts` |
| 4.9 | Status model: `NOT_STARTED`, `DISMISSED` | MEDIUM | Partial (enum values differ) | `schema.prisma`, `guidanceTypes.ts` |
| 4.10 | Suppression bypass for user-selected scope | HIGH | Missing | `guidanceSuppression.service.ts`, `guidanceJourney.service.ts` |
| 4.11 | SERVICE scope with non-item journeys | HIGH | Missing | `schema.prisma`, `guidanceTemplateRegistry.ts`, screen |
| 4.12 | Visual progress bar (not text-only) | MEDIUM | Partial (`text-xs` only, strip unused) | `GuidanceOverviewClient.tsx` line 524 |
| 4.13 | Required fields: `scopeCategory`, `scopeId`, `issueType` | HIGH | Missing | `schema.prisma`, `guidanceMapper.ts` |
| 4.14 | FRD canonical stage labels in UI | MEDIUM | Partial | `guidanceDisplay.ts`, `GuidanceStepList.tsx` |
| 4.15 | Homeowner-friendly copy, no system language | MEDIUM | Partial (confirmed violations) | `GuidanceOverviewClient.tsx` lines 393, 453 |
| 4.16 | No `limit:10` before scope filtering | MEDIUM | Confirmed violation | `GuidanceOverviewClient.tsx` line 203 |

---

## 6. What Does Not Need to Change

| Component | Reason to Keep |
|---|---|
| `GuidanceJourneyStep` DB model | Step structure (stepKey, label, status, isRequired, skipPolicy) matches FRD |
| `GuidanceJourneyEvent` DB model | Audit trail supports recording user overrides per FRD §9.7 |
| `GuidanceStepEvidence` DB model | Evidence tracking supports step completion verification |
| `guidanceStepResolver.service.ts` | Step lifecycle transitions (PENDING → COMPLETED/SKIPPED/BLOCKED) are FRD-aligned |
| `guidanceBookingGuard.service.ts` | Execution prerequisite enforcement aligns with FRD journey gating |
| `guidanceTemplateRegistry.ts` | Template-driven step architecture is correct; content needs SERVICE additions |
| `resolveNextStepWithIntelligence()` | Returns one next step per journey — matches FRD §9.5 |
| `GuidancePrimaryCta.tsx` | Correct component; needs integration in journey step list |
| `GuidanceJourneyStrip.tsx` | Correct component; needs to be imported and rendered in `GuidanceOverviewClient.tsx` |
| Skip step mutation (`skipGuidanceStep`) | Already implemented; needs a UI button rendered |
| `DOMAIN_FOCUS_LABELS` / `SIGNAL_SUBTITLE_LABELS` | Good homeowner-friendly copy patterns; extend rather than replace |
| Primary action + "Why now" block | Well-structured; matches FRD "one reason" requirement |
| `guidanceDerivedData.service.ts` | Tool output normalization supports step context for coverage/price/repair steps |
| `guidanceConfidence.service.ts` | Confidence scoring supports "one reason" display |
| Asset scope URL param approach | Pattern is correct; extend to include `scopeCategory` and `issueType` params |

---

## 7. Recommended Phase 1A Delivery (UX Correctness Fixes)

The smallest changes that move the screen toward FRD compliance without a full rebuild:

1. **Remove `deduped.slice(0, 6)`** in `GuidanceOverviewClient.tsx` line 277 — show all assets; add filter/search UI
2. **Remove `limit: 10`** from `useGuidance` call at line 203
3. **Replace Risk Assessment as asset source** with Status Board / inventory endpoint
4. **Fix `selectedAssetOption` lookup** to work against full unsliced list, not the display-capped `assetScopeOptions`
5. **Replace "No backend-generated journey exists yet"** with homeowner copy
6. **Replace "ID linking pending"** with either no text or user-appropriate label
7. **Import and render `GuidanceJourneyStrip`** above the primary action block; remove `text-xs` progress label
8. **Render skip button** per step (API mutation already exists)
9. **Add `DISMISSED` and `NOT_STARTED`** to Prisma enum and frontend enum (additive migration)

---

## 8. Recommended Phase 1B Delivery (Journey Model Completion)

These changes complete the user-first journey creation flow:

1. **Add Prisma fields:** `scopeCategory`, `scopeId`, `issueType` to `GuidanceJourney`; run migration with backfill
2. **Add `createUserInitiatedJourney()` service method** and `POST /journeys/start` route
3. **Replace hardcoded `fallbackJourneySteps`** with a call to `POST /journeys/start`; render the returned journey's real steps
4. **Fix "Journey Steps" section** to show `journey.steps` ordered by `stepOrder` using `useJourney()`, not `remainingActions`
5. **Add scope category selector** as the first section in `GuidanceOverviewClient.tsx`
6. **Add issue selector** as a step between asset selection and journey display
7. **Add suppression bypass** for user-selected scope in `guidanceSuppression.service.ts`
8. **Add "Not relevant" dismiss button** and `POST /journeys/:id/dismiss` endpoint
9. **Add "Different issue" control** → resets to issue selector keeping asset selected
10. **Relabel "Clear asset focus" to "Change asset"** and move it into the journey header
11. **Add SERVICE scope picker** and service journey templates

---

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Replacing `slice(0,6)` with full list may degrade performance on properties with many assets | MEDIUM | LOW | Add frontend search/filter; lazy load asset list |
| `selectedAssetOption` null-lookup bug (assets outside top 6) may already be causing silent failures in production | HIGH | MEDIUM | Fix lookup to use full unsliced list in Phase 1A |
| Replacing Risk Assessment as asset source with Status Board may show assets with no guidance context | MEDIUM | MEDIUM | Show a "no issues detected" state rather than the fallback; trigger on-demand signal generation |
| Suppression bypass may surface low-quality journeys for user-selected scope | MEDIUM | LOW | Only bypass weak-signal filter; keep deduplication for same-family signals |
| Removing hardcoded fallback requires reliable `POST /journeys/start` — users see nothing if this call fails | HIGH | HIGH | Add optimistic fallback: show static step list while journey creates, then replace with live steps |
| SERVICE journey templates may grow scope in Phase 1B | HIGH | MEDIUM | Cap to 4 service types; gate others behind feature flag |
| `scopeCategory` + `scopeId` backfill migration needs to run cleanly on existing journey records | MEDIUM | MEDIUM | Default `ITEM` + derive `scopeId` from `COALESCE(inventoryItemId, homeAssetId)` |
| Adding `DISMISSED` to enum may cause type errors in exhaustive switch statements | LOW | LOW | Audit switch statements in journey service and mapper; add `DISMISSED` case |

---

*Document generated from codebase audit of `/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/` and detailed review of `GuidanceOverviewClient.tsx` against the Guidance Engine FRD (User-First End-to-End Resolution Journeys).*
