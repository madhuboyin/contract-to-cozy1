# Hidden Asset Finder

## Overview

Hidden Asset Finder is a property-scoped Home Tool that helps a homeowner answer:

- Are there tax exemptions, rebates, or credits my home may qualify for?
- What utility programs, insurance discounts, or local grants could reduce my costs?
- How confident is the platform that I may be eligible for each benefit?

It is intentionally distinct from standard financial tools in the platform:

- Financial tools = spending efficiency, cost tracking, budgeting
- Hidden Asset Finder = potential inbound benefits tied to the property itself

The feature is implemented as a full stack flow:

1. user opens the Hidden Asset Finder for a property
2. backend evaluates all active programs against property attributes
3. a rule engine computes confidence, match reasons, and estimated value ranges
4. matched programs are persisted as property-level match records
5. the frontend renders a mobile-first summary, filter strip, match cards, and a detail sheet
6. the user can mark matches as Pursuing or dismiss irrelevant ones
7. background workers re-scan all properties on a weekly schedule

## Product Scope

Hidden Asset Finder is currently an MVP with a deterministic rule engine and no live government or utility data feed integration.

Current behavior:

- evaluates programs stored in the `hidden_asset_programs` admin table
- matches programs to properties using geography (country, state, city, ZIP) and property attribute rules
- computes explainable confidence levels using a three-stage pipeline
- persists match rows with match reasons, estimated value ranges, and match status
- exposes list, refresh, program detail, and match status update endpoints
- supports filter by category and confidence level in the UI
- auto-marks matches as VIEWED when a user opens the detail sheet
- preserves user-set terminal statuses (DISMISSED, CLAIMED) across re-scans
- triggers on property create and update events via the shared job queue
- runs a weekly batch refresh job on Sunday mornings

Not included in the current implementation:

- live external feed integrations (IRS, state energy offices, utility APIs)
- admin UI for managing programs and rules
- property owner application or claim verification flows
- email or push notifications for new matches
- export or share flows

## Database Design

Hidden Asset Finder uses four Prisma models in [schema.prisma](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/prisma/schema.prisma).

### `HiddenAssetProgram`

Master registry of incentive and benefit programs.

Table:

- `hidden_asset_programs`

Purpose:

- stores normalized program definitions that the rule engine evaluates against any matching property in the system

Key fields:

- `id`
- `name`
- `category`
- `description`
- `regionType`
- `regionValue`
- `benefitType`
- `benefitEstimateMin`
- `benefitEstimateMax`
- `currency`
- `sourceUrl`
- `sourceLabel`
- `eligibilityNotes`
- `confidenceWeight`
- `expiresAt`
- `lastVerifiedAt`
- `isActive`
- `createdAt`
- `updatedAt`

Indexes:

- `@@index([category])`
- `@@index([regionType])`
- `@@index([regionValue])`
- `@@index([isActive])`
- `@@index([expiresAt])`
- `@@index([regionType, regionValue, isActive])`

Relationships:

- one `HiddenAssetProgram` has many `HiddenAssetProgramRule` rows
- one `HiddenAssetProgram` has many `PropertyHiddenAssetMatch` rows

Important distinction:

- `HiddenAssetProgram` is the shared canonical program registry
- `PropertyHiddenAssetMatch` is the property-scoped detection output
- the rule engine never writes directly to the program table; it only reads from it

### `HiddenAssetProgramRule`

Individual eligibility rules attached to a program.

Table:

- `hidden_asset_program_rules`

Purpose:

- each rule specifies one condition that the rule engine evaluates against a normalized property attribute map
- programs may have multiple rules; match confidence is derived from the match ratio

Key fields:

- `id`
- `programId`
- `attribute`
- `operator`
- `value`
- `sortOrder`
- `groupKey`
- `createdAt`
- `updatedAt`

The `attribute` field is a string key such as `state`, `yearBuilt`, `roofAge`, or `hvacType`. The rule engine maps these to fields in `PropertyAttributeMap` using an internal alias table with approximately 145 known aliases.

The `value` field is always stored as a string. The rule engine casts it to the appropriate type (number, boolean, array) based on the operator at evaluation time.

The `groupKey` field is reserved for future grouped or OR-based rule logic. It is not evaluated in the current implementation.

Indexes and constraints:

- `@@index([programId])`
- `@@index([programId, sortOrder])`

Relationships:

- belongs to `HiddenAssetProgram` with cascade delete

### `PropertyHiddenAssetMatch`

Property-scoped detection result linking one property to one matched program.

Table:

- `property_hidden_asset_matches`

Purpose:

- persists the match result for one program against one property, including confidence level, estimated value range, match reasons, and user-facing status

Key fields:

- `id`
- `propertyId`
- `programId`
- `confidenceLevel`
- `estimatedValue`
- `estimatedValueMin`
- `estimatedValueMax`
- `status`
- `matchedRuleCount`
- `totalRuleCount`
- `matchReasons`
- `lastEvaluatedAt`
- `firstDetectedAt`
- `dismissedAt`
- `claimedAt`
- `createdAt`
- `updatedAt`

The `matchReasons` field is a `Json` column storing an array of human-readable strings that explain which property attributes matched which rules. These are surfaced directly in the detail sheet UI.

Indexes and constraints:

- `@@unique([propertyId, programId])`
- `@@index([propertyId])`
- `@@index([programId])`
- `@@index([confidenceLevel])`
- `@@index([status])`
- `@@index([lastEvaluatedAt])`
- `@@index([propertyId, status, confidenceLevel])`

Relationships:

- belongs to `Property`
- belongs to `HiddenAssetProgram`

### `PropertyHiddenAssetScanRun`

Tracks each scan execution for a property.

Table:

- `property_hidden_asset_scan_runs`

Purpose:

- enables freshness monitoring, the concurrent-scan guard, and job troubleshooting for scheduled re-evaluation

Key fields:

- `id`
- `propertyId`
- `status`
- `startedAt`
- `completedAt`
- `programsEvaluated`
- `matchesFound`
- `notes`
- `createdAt`
- `updatedAt`

The concurrent scan guard queries this table for a `RUNNING` row within the last 5 minutes before beginning a new scan. If one exists the scan throws `SCAN_IN_PROGRESS`, which the controller maps to HTTP 409.

Indexes:

- `@@index([propertyId])`
- `@@index([propertyId, status])`
- `@@index([startedAt])`

Relationships:

- belongs to `Property`

## Enums

The Hidden Asset enums live in [schema.prisma](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/prisma/schema.prisma).

### `HiddenAssetCategory`

The eight program categories currently supported:

- `TAX_EXEMPTION`
- `REBATE`
- `UTILITY_INCENTIVE`
- `INSURANCE_DISCOUNT`
- `ENERGY_CREDIT`
- `LOCAL_GRANT`
- `HISTORIC_BENEFIT`
- `STORM_RESILIENCE`

Each category has a distinct confidence policy (attribute-presence gates) and a category-specific safety caveat surfaced in the UI.

### `HiddenAssetRegionType`

Defines the geography scope of a program:

- `COUNTRY`
- `STATE`
- `COUNTY`
- `CITY`
- `ZIP`
- `UTILITY`
- `HAZARD_ZONE`
- `HISTORIC_DISTRICT`

The rule engine matches programs to a property by deriving region pairs from the property's address fields. The current implementation resolves: `COUNTRY` → `USA`, `STATE` → state abbreviation, `CITY` → city name, `ZIP` → zip code. `COUNTY`, `UTILITY`, `HAZARD_ZONE`, and `HISTORIC_DISTRICT` are supported schema values but depend on property data fields that are not yet fully populated in the MVP.

### `HiddenAssetBenefitType`

Classifies the economic nature of the benefit:

- `TAX_SAVINGS`
- `TAX_CREDIT`
- `REBATE`
- `DISCOUNT`
- `GRANT`
- `CREDIT`
- `OTHER`

### `HiddenAssetRuleOperator`

The full set of operators the rule engine supports:

- `EQUALS`
- `NOT_EQUALS`
- `IN`
- `NOT_IN`
- `GREATER_THAN`
- `GREATER_THAN_OR_EQUAL`
- `LESS_THAN`
- `LESS_THAN_OR_EQUAL`
- `EXISTS`
- `NOT_EXISTS`
- `CONTAINS`
- `BOOLEAN_IS`

### `HiddenAssetConfidenceLevel`

The three confidence tiers assigned to a match:

- `HIGH` — 90%+ of rules matched
- `MEDIUM` — 60%+ of rules matched
- `LOW` — below 60% match ratio, or confidence capped by category policy or data staleness

### `PropertyHiddenAssetMatchStatus`

The full match lifecycle:

- `DETECTED` — initial state; program matched but not yet seen by the user
- `VIEWED` — user opened the detail sheet for this match (auto-set, fire-and-forget)
- `DISMISSED` — user explicitly dismissed the match as not relevant
- `CLAIMED` — user marked the match as pursuing
- `EXPIRED` — program has expired (`expiresAt` in the past) and was inactivated during re-scan
- `INACTIVE` — program was deactivated (`isActive = false`) during re-scan

User-set terminal statuses (`DISMISSED`, `CLAIMED`) are preserved across re-scans.

### `PropertyHiddenAssetScanRunStatus`

Tracks the execution lifecycle of a scan run:

- `PENDING`
- `RUNNING`
- `COMPLETED`
- `FAILED`

## Backend Architecture

The backend follows the existing CtC Express + service-layer pattern.

### Route Registration

Main route registration:

- [apps/backend/src/index.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/index.ts)

Mounted route group:

- `app.use('/api', hiddenAssetsRoutes);`

### Routes

Defined in:

- [apps/backend/src/routes/hiddenAssets.routes.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/routes/hiddenAssets.routes.ts)

Middleware pattern:

- `apiRateLimiter` — applied at the router level to all routes
- `authenticate` — applied at the router level to all routes
- `propertyAuthMiddleware` — applied only to property-scoped routes
- `validateBody` — applied to the status update route using an inline Zod schema

Endpoints:

- `GET /api/properties/:propertyId/hidden-assets`
- `POST /api/properties/:propertyId/hidden-assets/refresh`
- `GET /api/hidden-asset-programs/:programId`
- `PATCH /api/property-hidden-asset-matches/:matchId`

Query params supported on the list endpoint (all optional):

- `confidenceLevel` — `HIGH | MEDIUM | LOW`
- `category` — any `HiddenAssetCategory` value
- `status` — any `PropertyHiddenAssetMatchStatus` value
- `includeDismissed` — `true` to include dismissed matches
- `includeExpired` — `true` to include expired matches

Status values allowed on the PATCH endpoint:

- `VIEWED | DISMISSED | CLAIMED`

### Controllers

Defined in:

- [apps/backend/src/controllers/hiddenAssets.controller.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/controllers/hiddenAssets.controller.ts)

Controller functions:

- `getHiddenAssetsForProperty`
- `refreshHiddenAssetsForProperty`
- `getHiddenAssetProgramDetail`
- `updateHiddenAssetMatchStatus`

Responsibilities:

- enforce authenticated access via `requireUserId` helper
- read `propertyId`, `programId`, and `matchId` params
- parse optional query filters for the list endpoint
- map `SCAN_IN_PROGRESS` errors to HTTP 409 with a user-friendly message
- delegate to the service layer
- normalize HTTP status codes and response shapes

Error code mapping in `refreshHiddenAssetsForProperty`:

- `Authentication required.` → 401
- `SCAN_IN_PROGRESS` → 409 with message: "A scan is already in progress for this property. Please wait a moment and try again."
- any other error → 500

### Service Layer

Defined in:

- [apps/backend/src/services/hiddenAssets.service.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/hiddenAssets.service.ts)

Primary service methods:

- `getMatchesForProperty(propertyId, userId, filters)` — returns visible matches with summary; calls `assertPropertyForUser` to verify ownership
- `refreshMatchesForProperty(propertyId, userId)` — user-facing scan; verifies ownership then delegates to `executePropertyScan`
- `refreshMatchesInternal(propertyId)` — system/worker scan; skips ownership check; calls `fetchPropertyForScan` then `executePropertyScan`
- `getProgramDetail(programId)` — returns program master data; throws `Program not found.` if not found
- `updateMatchStatus(matchId, input, userId)` — updates match status; verifies property ownership via the match's `propertyId`

Core internal methods:

- `assertPropertyForUser(propertyId, userId)` — loads property with all attribute fields required by the rule engine; throws if not found or not owned by the user
- `fetchPropertyForScan(propertyId)` — same field selection as `assertPropertyForUser` but without userId ownership check; used by internal/worker paths
- `executePropertyScan(propertyId, property)` — extracted scan body containing the concurrent-scan guard, program candidate fetch, rule engine evaluation, match upsert, and expiry/inactivation pass
- `fetchCandidatePrograms(regions)` — loads active programs scoped to the property's derived region pairs
- `fetchMatchesForProperty(propertyId, filters)` — loads match rows with program relation; applies status, confidence, category, includeDismissed, and includeExpired filters; excluded statuses by default are EXPIRED and INACTIVE unless explicitly requested
- `serializeMatch(match)` — converts a Prisma match row (with joined program) to `HiddenAssetMatchDTO`
- `buildSummary(matches, lastScanAt)` — computes `HiddenAssetMatchSummaryDTO` from the current match list

Scan execution steps inside `executePropertyScan`:

1. concurrent scan guard (throw `SCAN_IN_PROGRESS` if RUNNING scan exists within last 5 minutes)
2. create `PropertyHiddenAssetScanRun` with status `RUNNING`
3. build `PropertyAttributeMap` from property record
4. derive region pairs from property location fields
5. fetch candidate programs for those regions
6. evaluate each program through the rule engine
7. upsert `PropertyHiddenAssetMatch` rows for matched programs (preserve DISMISSED/CLAIMED status)
8. transition EXPIRED/INACTIVE for programs no longer active or matched
9. update scan run to `COMPLETED` with stats
10. return `RefreshResultDTO`

### Rule Engine

Defined in:

- [apps/backend/src/services/hiddenAssets/ruleEngine.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/hiddenAssets/ruleEngine.ts)

Responsibilities:

- normalize property data into `PropertyAttributeMap`
- evaluate each rule of a program against the attribute map
- compute base confidence from match ratio
- apply category-specific attribute-presence confidence caps
- apply freshness penalty for stale program data
- generate human-readable match reasons

Key functions:

- `buildPropertyAttributeMap(property)` — constructs the full attribute map from a Prisma property record; derives `roofAge`, `heatPumpInstalled`, `heatPumpWaterHeaterInstalled`, `sumpPumpInstalled`, and `fireAlarm` from raw fields; includes US state full-name lookup
- `evaluateRule(rule, attrMap)` — evaluates one rule against the attribute map; returns `{ matched, attributeMissing }`
- `computeBaseConfidence(matchedCount, totalCount)` — 90%+ matched → HIGH, 60%+ → MEDIUM, else LOW
- `generateMatchReason(rule, attrMap)` — produces a human-readable reason string for a matched rule (e.g. "Property is in TX")
- `evaluateProgram(program, attrMap, context)` — three-stage confidence pipeline: base → category caps → freshness penalty; returns `ProgramEvalResult`
- `getEligibilityLabel(level)` — maps HIGH → "Likely eligible", MEDIUM → "Possibly eligible", LOW → "Worth verifying"
- `getFreshnessNote(lastVerifiedAt)` — returns a UI-safe amber warning string when program data is stale; null when fresh

Confidence computation pipeline:

1. base confidence from rule match ratio (≥90% HIGH, ≥60% MEDIUM, else LOW)
2. category-specific attribute-presence gates — caps confidence if key attributes for that category are missing from the property record (defined in `categoryConfig.ts`)
3. freshness penalty — programs not verified in over 2 years are capped to LOW; programs 1–2 years stale have HIGH capped to MEDIUM

### Category Configuration

Defined in:

- [apps/backend/src/services/hiddenAssets/categoryConfig.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/hiddenAssets/categoryConfig.ts)

Responsibilities:

- define category-specific confidence policies for each of the 8 categories
- apply attribute-presence caps through `applyConfidenceCaps()`
- apply freshness penalty through `applyFreshnessPenalty()`
- export `getFreshnessNote()` and `getEligibilityLabel()` for use in the service layer

### Service Types

Defined in:

- [apps/backend/src/services/hiddenAssets/types.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/hiddenAssets/types.ts)

Key interfaces:

- `PropertyAttributeMap` — normalized map of ~50 property attribute fields used by the rule engine; all fields are nullable; missing data causes lower confidence, not crashes
- `EvalContext` — evaluation context with `category` and `lastVerifiedAt` for confidence caps and freshness checking
- `SingleRuleEvalResult` — `{ matched, attributeMissing }`
- `ProgramEvalResult` — full program evaluation output including `programId`, `matched`, `confidenceLevel`, `matchedRuleCount`, `totalRuleCount`, `matchReasons`, and estimated value range
- `RuleEngineProgramInput` — the minimal program shape the rule engine receives
- `RegionPair` — `{ regionType, regionValue }` helper for geography targeting
- `HiddenAssetMatchFilters` — query filter options for `getMatchesForProperty`
- `UpdateMatchStatusInput` — status update payload
- `HiddenAssetMatchDTO` — full serialized match for the frontend
- `HiddenAssetMatchSummaryDTO` — aggregate summary counts and last scan timestamp
- `HiddenAssetMatchListDTO` — list response wrapping matches and summary
- `HiddenAssetProgramDetailDTO` — program master data response
- `RefreshResultDTO` — scan run result with counts and updated match list

### Backend Response Shape

The frontend consumes these fields from `HiddenAssetMatchDTO`:

- `id`
- `propertyId`
- `programId`
- `programName`
- `category`
- `description`
- `benefitType`
- `estimatedValue`
- `estimatedValueMin`
- `estimatedValueMax`
- `currency`
- `confidenceLevel`
- `eligibilityLabel`
- `status`
- `matchedRuleCount`
- `totalRuleCount`
- `matchReasons`
- `sourceUrl`
- `sourceLabel`
- `eligibilityNotes`
- `lastVerifiedAt`
- `expiresAt`
- `isProgramActive`
- `freshnessNote`
- `lastEvaluatedAt`
- `firstDetectedAt`
- `dismissedAt`
- `claimedAt`

The summary included in `HiddenAssetMatchListDTO`:

- `totalMatches`
- `highConfidenceCount`
- `mediumConfidenceCount`
- `lowConfidenceCount`
- `categoryCounts`
- `lastScanAt`

## Frontend Architecture

The frontend follows the existing Next.js app-router + React Query + shared component approach used across all CtC Home Tools.

### Main Screen Route

Property-scoped route:

- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/hidden-asset-finder/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/hidden-asset-finder/page.tsx)

Rendered client component:

- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/hidden-asset-finder/HiddenAssetFinderClient.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/hidden-asset-finder/HiddenAssetFinderClient.tsx)

Route shape:

- `/dashboard/properties/:propertyId/tools/hidden-asset-finder`

The `page.tsx` is a thin three-line server wrapper. All state, queries, and UI logic live in `HiddenAssetFinderClient.tsx`.

### Frontend API Integration

Defined in:

- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/hidden-asset-finder/hiddenAssetApi.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/hidden-asset-finder/hiddenAssetApi.ts)

Primary functions:

- `getHiddenAssetMatches(propertyId, params?)` — wraps `api.getHiddenAssetMatches`; returns `HiddenAssetMatchListDTO | null`
- `refreshHiddenAssetMatches(propertyId)` — wraps `api.refreshHiddenAssetMatches`; throws on null result
- `updateHiddenAssetMatchStatus(matchId, status)` — wraps `api.updateHiddenAssetMatchStatus`; throws on null result

### API Client Methods

Defined in:

- [apps/frontend/src/lib/api/client.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/lib/api/client.ts)

Methods:

- `getHiddenAssetMatches(propertyId, params?)` → `HiddenAssetMatchListDTO | null`
  - query params: `category`, `confidenceLevel`, `includeDismissed`
- `refreshHiddenAssetMatches(propertyId)` → `HiddenAssetRefreshResultDTO | null`
- `getHiddenAssetProgramDetail(programId)` → `HiddenAssetProgramDetailDTO | null`
- `updateHiddenAssetMatchStatus(matchId, status)` → `HiddenAssetMatchDTO | null`

Note: `getHiddenAssetProgramDetail` is wired in the client but not called from the current UI because all required detail data is already embedded in the `HiddenAssetMatchDTO` returned by the list endpoint.

### Frontend Types

Defined in:

- [apps/frontend/src/types/index.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/types/index.ts)

Key type definitions:

- `HiddenAssetCategory` — union type of all 8 category strings
- `HiddenAssetConfidenceLevel` — `'HIGH' | 'MEDIUM' | 'LOW'`
- `HiddenAssetBenefitType` — union type of all 7 benefit type strings
- `HiddenAssetMatchStatus` — union type of all 6 status strings
- `HiddenAssetMatchDTO` — full match shape consumed by the UI
- `HiddenAssetMatchSummaryDTO` — aggregate summary counts and last scan timestamp
- `HiddenAssetMatchListDTO` — list response with `propertyId`, `matches`, and `summary`
- `HiddenAssetProgramDetailDTO` — program master data shape
- `HiddenAssetRefreshResultDTO` — scan result with counts and updated matches

### Screen Composition

The main screen currently includes:

1. back button linking to the property hub
2. page intro block (eyebrow, title, subtitle)
3. category filter chip strip (8 categories + All)
4. confidence filter chip strip (HIGH, MEDIUM, LOW + All)
5. summary card (total matches, likely high-confidence count, last scanned date, rescan button)
6. match card list (one card per detected program)
7. detail sheet (right-side drawer with full program info and action buttons)
8. loading skeleton, pre-scan empty state, post-scan empty state, and error state

### React Query State

Main data query:

```typescript
useQuery({
  queryKey: ['hidden-assets', propertyId, categoryFilter, confidenceFilter],
  queryFn: () => getHiddenAssetMatches(propertyId, { category, confidenceLevel }),
  enabled: !!propertyId,
})
```

Refresh mutation:

```typescript
useMutation({
  mutationFn: () => refreshHiddenAssetMatches(propertyId),
  onSuccess: () => {
    closeDetail();
    queryClient.invalidateQueries({ queryKey: ['hidden-assets', propertyId] });
    toast({ title: 'Scan complete', description: 'Benefits updated for this property.' });
  },
  onError: (error) => toast({ title: 'Scan failed', variant: 'destructive', description: error.message }),
})
```

Status update mutation:

```typescript
useMutation({
  mutationFn: ({ matchId, status }) => updateHiddenAssetMatchStatus(matchId, status),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hidden-assets', propertyId] }),
})
```

### Detail Sheet State Pattern

The component stores `selectedMatchId: string | null` rather than the full match object. `selectedMatch` is derived:

```typescript
const selectedMatch = data?.matches.find((m) => m.id === selectedMatchId) ?? null;
```

A `useEffect` guard auto-closes the sheet if the selected match disappears from the list (e.g. after a refresh that removes a dismissed match):

```typescript
useEffect(() => {
  if (detailOpen && selectedMatchId && !selectedMatch) {
    setDetailOpen(false);
  }
}, [detailOpen, selectedMatchId, selectedMatch]);
```

This means the detail sheet always reflects the freshest query data without stale state.

### Match Card Display

Each `HiddenAssetMatchCard` renders:

- category chip (colored by `CATEGORY_TONE` map)
- confidence chip using `eligibilityLabel` from the DTO
- program name (semibold)
- first match reason or description (clamped to 2 lines)
- estimated value range prefixed with "Est." (if present)
- last verified date and source label (if present)
- amber freshness warning (if `freshnessNote` is non-null)

Confidence tone map used for chip coloring:

- `HIGH` → `'good'`
- `MEDIUM` → `'elevated'`
- `LOW` → `'info'`

### Detail Sheet

The right-side sheet (`side="right" sm:max-w-md`) renders when a match card is tapped:

- header: program name and close button
- category chip and confidence badge
- description
- "Why this may apply" section: match reasons as a bullet list
- estimated value range
- last verified date and expiration date (if present)
- official source link (if `sourceUrl` is present)
- eligibility notes (if present)
- freshness note as an amber alert (if present)
- category-specific safety caveat from `CATEGORY_CAVEAT` map

Footer action buttons:

- "Not relevant" — sets status to `DISMISSED`; closes sheet on success
- "Mark as Pursuing" — sets status to `CLAIMED`; closes sheet on success; adds a verification reminder beneath the button on claimed confirmation

When the detail sheet opens, a fire-and-forget `VIEWED` status update is sent automatically with no toast.

### Category Safety Caveats

The frontend maintains a `CATEGORY_CAVEAT` map with category-specific notes shown in the detail sheet to avoid overstating certainty. Examples:

- `TAX_EXEMPTION` — reminds users that eligibility is verified at the county assessor or tax office
- `ENERGY_CREDIT` — notes that credits require qualifying equipment purchase and federal or state filing
- `INSURANCE_DISCOUNT` — notes that discounts are applied at insurer discretion and may require inspection
- `LOCAL_GRANT` — notes that local grants often have funding caps and application windows
- `HISTORIC_BENEFIT` — notes that historic preservation benefits require formal registry participation
- `STORM_RESILIENCE` — notes that resilience incentives typically require certified installation documentation

### Filter Chips

Both category and confidence filter strips use toggle pill buttons:

- active: `border border-slate-900 bg-slate-900 text-white`
- inactive: `border border-[hsl(var(--mobile-border-subtle))] text-slate-600`
- tapping the active chip clears the filter
- each group has `role="group"` and `aria-label` for accessibility
- each chip has `aria-pressed={active}`

### Empty States

Two distinct empty states based on `hasBeenScanned = Boolean(summary?.lastScanAt)`:

- pre-scan: title "No benefits detected yet", description prompts the user to run a scan, CTA is the refresh button
- post-scan (no matches after filtering): title "No matches for this filter", description suggests adjusting filters or running a new scan

### Accessibility

- filter chip groups: `role="group"` + `aria-label`
- filter chips: `aria-pressed={active}`
- match list: `role="list"` and `role="listitem"`
- error state: `role="alert"` with `aria-label` on retry button

## Job Queue Integration

Hidden Asset Finder is wired into the shared `property-intelligence-queue` used by risk reports and financial efficiency scores.

### Job Type

Defined in:

- [apps/backend/src/config/risk-job-types.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/config/risk-job-types.ts)

Job type:

- `PropertyIntelligenceJobType.CALCULATE_HIDDEN_ASSETS`

### Enqueue Trigger

Defined in:

- [apps/backend/src/services/JobQueue.service.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/JobQueue.service.ts)

The `enqueuePropertyIntelligenceJobs(propertyId)` method enqueues `CALCULATE_HIDDEN_ASSETS` alongside `CALCULATE_RISK_REPORT` and `CALCULATE_FES` whenever a property is created or updated. Job ID uses the pattern `${propertyId}-HIDDEN-ASSETS` for deduplication.

The `processPropertyJob(job)` switch includes:

```typescript
case PropertyIntelligenceJobType.CALCULATE_HIDDEN_ASSETS:
  await hiddenAssetService.refreshMatchesInternal(propertyId);
  break;
```

## Workers and Background Jobs

### Worker Files

- [apps/workers/src/jobs/hiddenAssetRefresh.job.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/workers/src/jobs/hiddenAssetRefresh.job.ts)
- [apps/workers/src/worker.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/workers/src/worker.ts)

### Batch Refresh Job

Defined in:

- [apps/workers/src/jobs/hiddenAssetRefresh.job.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/workers/src/jobs/hiddenAssetRefresh.job.ts)

The `runHiddenAssetRefreshJob()` function:

1. loads all property IDs from the database
2. iterates every property and calls `hiddenAssetService.refreshMatchesInternal(property.id)`
3. tracks `successCount` and `failureCount` with per-property error isolation
4. logs final counts on completion

### Cron Schedule

Registered in `apps/workers/src/worker.ts`:

- cron expression: `0 3 * * 0`
- runs every Sunday at 3:00 AM UTC
- calls `runHiddenAssetRefreshJob()`

### Worker BullMQ Handler

The worker's `PropertyIntelligenceJobType` enum mirrors the backend enum and includes `CALCULATE_HIDDEN_ASSETS`. The BullMQ job processor calls `processHiddenAssetScan(job.data)` which calls `hiddenAssetService.refreshMatchesInternal(propertyId)` and logs detailed scan result counts on success.

### Docker Build Wiring

The workers Dockerfile at [infrastructure/docker/workers/Dockerfile](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/infrastructure/docker/workers/Dockerfile) copies backend source files into `src/shared/backend/` and rewrites import paths before TypeScript compilation.

Files copied for Hidden Asset Finder:

- `apps/backend/src/services/hiddenAssets.service.ts` → `src/shared/backend/services/`
- `apps/backend/src/services/hiddenAssets/ruleEngine.ts` → `src/shared/backend/services/hiddenAssets/`
- `apps/backend/src/services/hiddenAssets/categoryConfig.ts` → `src/shared/backend/services/hiddenAssets/`
- `apps/backend/src/services/hiddenAssets/types.ts` → `src/shared/backend/services/hiddenAssets/`

`sed` rewrite rules applied:

- `worker.ts`: `../../backend/src/services/hiddenAssets.service` → `./shared/backend/services/hiddenAssets.service`
- `hiddenAssetRefresh.job.ts`: `../../../backend/src/services/hiddenAssets.service` → `../shared/backend/services/hiddenAssets.service`

## Mobile Navigation and Entry Points

Hidden Asset Finder is wired into the shared Home Tools catalog and the property-scoped launch flows.

### Shared Home Tool Catalog

Defined in:

- [apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts)

Current catalog entry (positioned after Home Digital Will):

- `key`: `hidden-asset-finder`
- `name`: `Hidden Asset Finder`
- `description`: `Find potential rebates, credits, and benefits for your home`
- `hrefSuffix`: `tools/hidden-asset-finder`
- `navTarget`: `tool:hidden-asset-finder`
- `icon`: `resolveToolIcon('home', 'hidden-asset-finder')` → resolves to the `Sparkles` icon
- `isActive`: regex matching `/dashboard/properties/:id/tools/hidden-asset-finder`

### Tool Icon Registration

Defined in:

- [apps/frontend/src/lib/icons/toolIcons.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/lib/icons/toolIcons.ts)

Entry in the `home` section:

```typescript
'hidden-asset-finder': { concept: 'recommendations', icon: 'sparkles', category: 'home' }
```

### Home Tools Screen

Defined in:

- [apps/frontend/src/app/(dashboard)/dashboard/home-tools/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/home-tools/page.tsx)

Behavior:

- if a property is already selected, the tool opens directly on that property
- if no property is selected, the user is sent through the standard property selection flow

### Property Selection Hand-off

Defined in:

- [apps/frontend/src/app/(dashboard)/dashboard/properties/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/page.tsx)

Behavior:

- property selection supports `navTarget`
- `tool:hidden-asset-finder` resolves through `MOBILE_HOME_TOOL_LINKS`
- the selected property then opens `/dashboard/properties/:id/tools/hidden-asset-finder`

### Property Page Home Tools Rail

Defined in:

- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/HomeToolsRail.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/HomeToolsRail.tsx)

Behavior:

- desktop shows Home Tools as pill buttons; mobile shows them inside a bottom sheet
- both variants include the Hidden Asset Finder entry using the shared tool config
- the rail appears on every other property-scoped tool page so users can navigate between tools without going back to the property hub

## Scan Execution Flow

Current backend and frontend flow:

1. user opens the property-scoped Hidden Asset Finder page
2. React Query loads existing matches (`GET /api/properties/:propertyId/hidden-assets`)
3. if no matches exist, the empty state prompts the user to run a scan
4. user taps Rescan (or scan is triggered automatically by property create/update job)
5. frontend calls `POST /api/properties/:propertyId/hidden-assets/refresh`
6. backend checks for a RUNNING scan in the last 5 minutes (concurrent guard)
7. backend creates a scan run with status `RUNNING`
8. backend builds `PropertyAttributeMap` from the property record
9. backend derives region pairs from the property's address fields
10. backend loads candidate programs for those regions
11. backend evaluates each program through the three-stage confidence pipeline
12. backend upserts `PropertyHiddenAssetMatch` rows (preserving DISMISSED/CLAIMED)
13. backend transitions expired or inactive programs to `EXPIRED` / `INACTIVE`
14. backend marks scan run `COMPLETED` with stats
15. backend returns `RefreshResultDTO` with the updated match list
16. frontend invalidates the React Query cache and re-renders the summary and match list
17. toast confirms scan completion

## Confidence Pipeline Detail

The three-stage confidence computation inside `evaluateProgram`:

### Stage 1: Base confidence

- count matched rules vs. total rules for the program
- ≥90% → `HIGH`
- ≥60% → `MEDIUM`
- <60% → `LOW`

### Stage 2: Category-specific attribute-presence caps

Each category defines which property attributes are key signals for that program type. If those attributes are absent from the property record (`null`), confidence cannot be `HIGH` or in some cases `MEDIUM`. This prevents overconfident matches when a property is missing relevant data.

### Stage 3: Freshness penalty

- `lastVerifiedAt` > 2 years ago → cap to `LOW`
- `lastVerifiedAt` 1–2 years ago → `HIGH` capped to `MEDIUM`; `MEDIUM` and `LOW` unchanged
- `lastVerifiedAt` ≤ 1 year ago → no penalty

`freshnessNote` is set to a non-null UI string whenever a penalty applies. The frontend surfaces this as an amber callout on the match card and in the detail sheet.

## Guardrails and UX Notes

The current UI and backend copy intentionally avoid guaranteeing eligibility.

Current guardrails:

- all matches are framed as "potential" benefits, not confirmed savings
- `eligibilityLabel` values use hedged language: "Likely eligible", "Possibly eligible", "Worth verifying"
- category-specific `CATEGORY_CAVEAT` notes in the detail sheet remind users that final eligibility is determined externally (county assessor, insurer, utility provider, etc.)
- the summary card uses "Likely matches (high confidence)" rather than "Confirmed savings"
- estimated value ranges use "Est." prefix on match cards
- `freshnessNote` is surfaced prominently when program data is stale
- the feature is named "Hidden Asset Finder" and not "Savings Guarantee" or "Confirmed Benefits"

## What Changes When Programs Are Seeded from External Sources

This section describes the intended evolution from manually-curated program records to automated feed-based ingestion.

### Target production flow

```text
government / utility / insurer feeds
        ↓
worker / cron ingest
        ↓
normalize to HiddenAssetProgram + HiddenAssetProgramRule
        ↓
upsert into hidden_asset_programs + hidden_asset_program_rules
        ↓
property create/update → CALCULATE_HIDDEN_ASSETS job
        ↓
weekly batch re-scan
        ↓
property_hidden_asset_matches
```

The important principle is:

- feeds populate the program registry
- the rule engine and match persistence stay unchanged
- the frontend contract does not need to change

### 1. Build provider ingest workers

Current state: programs are admin-seeded directly into the database.

Future worker file layout:

- `apps/workers/src/hiddenAssets/providers/stateEnergyOffice.client.ts`
- `apps/workers/src/hiddenAssets/providers/utilityRebate.client.ts`
- `apps/workers/src/hiddenAssets/providers/localGrant.client.ts`

Each provider client should handle:

- provider authentication and pagination
- rate-limit handling and retries
- returning provider-specific raw program payloads

### 2. Normalize provider programs into the shared schema

Each provider client output should be normalized into:

- `HiddenAssetProgram` fields (name, category, region, benefit type, estimates, source, dates)
- `HiddenAssetProgramRule` rows (one per eligibility condition)

Normalization should be the contract boundary. The rule engine only reads canonical rows.

### 3. Strengthen deduplication rules

Current programs use manual UUIDs. Automated ingest will need:

- `provider + providerProgramId` deduplication keys
- rules for merging vs. replacing on re-ingest
- handling for programs that change eligibility criteria across ingest runs

### 4. Preserve the frontend and rule-engine contract

The goal of provider integration should be:

- no change to the rule engine evaluation logic
- no change to the `PropertyHiddenAssetMatch` lifecycle
- no provider-specific branches in the frontend

As long as ingest normalizes correctly into `HiddenAssetProgram` and `HiddenAssetProgramRule`, the entire detection and display stack stays unchanged.

### 5. Expand `PropertyAttributeMap` coverage

Several fields in `PropertyAttributeMap` are marked "not yet in Property schema":

- `county` — needed for `COUNTY`-scoped programs
- `hasSolarInstalled`, `hasEvCharger`, `hasLeakSensors`, `sprinklerSystem` — needed for energy and insurance programs
- `impactWindows`, `shutters`, `roofStraps` — needed for storm resilience programs
- `inHistoricDistrict`, `historicRegistryStatus` — needed for historic benefit programs
- `inHurricaneZone`, `inFloodZone`, `inWildfireZone` — needed for hazard-zone programs
- `utilityProvider`, `gasProvider` — needed for utility-scoped programs

As the `Property` schema grows to include these fields, the rule engine will automatically use them without further changes because the attribute map is nullable-safe by design.

## Key Files At A Glance

### Backend

- [apps/backend/prisma/schema.prisma](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/prisma/schema.prisma)
- [apps/backend/src/index.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/index.ts)
- [apps/backend/src/config/risk-job-types.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/config/risk-job-types.ts)
- [apps/backend/src/routes/hiddenAssets.routes.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/routes/hiddenAssets.routes.ts)
- [apps/backend/src/controllers/hiddenAssets.controller.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/controllers/hiddenAssets.controller.ts)
- [apps/backend/src/services/hiddenAssets.service.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/hiddenAssets.service.ts)
- [apps/backend/src/services/hiddenAssets/ruleEngine.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/hiddenAssets/ruleEngine.ts)
- [apps/backend/src/services/hiddenAssets/categoryConfig.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/hiddenAssets/categoryConfig.ts)
- [apps/backend/src/services/hiddenAssets/types.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/hiddenAssets/types.ts)
- [apps/backend/src/services/JobQueue.service.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/JobQueue.service.ts)

### Frontend Feature Screen

- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/hidden-asset-finder/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/hidden-asset-finder/page.tsx)
- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/hidden-asset-finder/HiddenAssetFinderClient.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/hidden-asset-finder/HiddenAssetFinderClient.tsx)
- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/hidden-asset-finder/hiddenAssetApi.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/hidden-asset-finder/hiddenAssetApi.ts)

### Frontend Shared Wiring

- [apps/frontend/src/types/index.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/types/index.ts)
- [apps/frontend/src/lib/api/client.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/lib/api/client.ts)
- [apps/frontend/src/lib/icons/toolIcons.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/lib/icons/toolIcons.ts)
- [apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts)
- [apps/frontend/src/app/(dashboard)/dashboard/home-tools/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/home-tools/page.tsx)
- [apps/frontend/src/app/(dashboard)/dashboard/properties/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/page.tsx)
- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/HomeToolsRail.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/HomeToolsRail.tsx)
- [apps/frontend/src/app/(dashboard)/layout.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/layout.tsx)

### Workers

- [apps/workers/src/jobs/hiddenAssetRefresh.job.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/workers/src/jobs/hiddenAssetRefresh.job.ts)
- [apps/workers/src/worker.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/workers/src/worker.ts)
- [infrastructure/docker/workers/Dockerfile](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/infrastructure/docker/workers/Dockerfile)
