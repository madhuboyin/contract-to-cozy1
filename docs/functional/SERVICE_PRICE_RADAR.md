# Service Price Radar

## Overview

Service Price Radar is a property-scoped Home Tool that helps a homeowner answer one core question:

- Is this service quote fair for this specific home?

The feature is intentionally:

- property-aware rather than generic
- explainable rather than opaque
- mobile-first in layout and interaction
- cautious when confidence is weak

At a high level, the flow is:

1. Open the tool from a property-aware entry point
2. Prefill property context and any launch context that is available
3. Submit a quote check
4. Load property facts and any linked entity facts
5. Match an active benchmark if possible
6. Run the rules-based estimator
7. Persist the check, links, explainability payloads, and result
8. Render the result and recent history
9. Track lightweight analytics events

---

## Database Schema

### Source of truth

- `apps/backend/prisma/schema.prisma`
- `apps/workers/prisma/schema.prisma`

The backend and worker Prisma schemas are kept aligned for Service Price Radar.

### Enums

#### `ServiceCategory`

Radar uses the shared `ServiceCategory` enum instead of inventing a Radar-only category enum.

Current values relevant to Radar:

- `INSPECTION`
- `HANDYMAN`
- `GENERAL_HANDYMAN`
- `PLUMBING`
- `ELECTRICAL`
- `HVAC`
- `ROOFING`
- `WATER_HEATER`
- `FOUNDATION`
- `WINDOWS_DOORS`
- `INSULATION`
- `LANDSCAPING`
- `LANDSCAPING_DRAINAGE`
- `GUTTERS`
- `SOLAR`
- `FLOORING`
- `PAINTING`
- `SIDING`
- `MOLD_REMEDIATION`
- `APPLIANCE_REPAIR`
- `APPLIANCE_REPLACEMENT`
- `SECURITY_SAFETY`
- `CLEANING`
- `MOVING`
- `PEST_CONTROL`
- `LOCKSMITH`
- `INSURANCE`
- `ATTORNEY`
- `FINANCE`
- `WARRANTY`
- `ADMIN`
- `OTHER`

#### `ServiceRadarQuoteSource`

- `MANUAL`
- `PASTED_TEXT`
- `UPLOADED_QUOTE`
- `SYSTEM_LINKED`

#### `ServiceRadarStatus`

- `PENDING`
- `COMPLETED`
- `FAILED`

#### `ServiceRadarVerdict`

- `UNDERPRICED`
- `FAIR`
- `HIGH`
- `VERY_HIGH`
- `INSUFFICIENT_DATA`

#### `ServiceRadarLinkedEntityType`

- `SYSTEM`
- `APPLIANCE`
- `DOCUMENT`
- `INCIDENT`
- `ROOM`
- `OTHER`

#### `ServiceRadarActionType`

- `VIEW_RESULT`
- `EXPAND_FACTORS`
- `RETRY_CATEGORY`
- `SAVE_CHECK`
- `OPEN_NEGOTIATION_SHIELD`
- `MARK_QUOTE_ACCEPTED`
- `MARK_QUOTE_REJECTED`
- `SHARE`
- `DISMISS`

#### `ServiceBenchmarkRegionType`

- `COUNTRY`
- `STATE`
- `METRO`
- `ZIP_PREFIX`
- `COUNTY`

### Tables / Prisma models

#### `ServiceRadarCheck`

Primary persisted record for one quote evaluation.

Key fields:

- `id`
- `propertyId`
- `serviceCategory`
- `serviceSubcategory`
- `serviceLabelRaw`
- `quoteAmount`
- `quoteCurrency`
- `quoteVendorName`
- `quoteSource`
- `status`
- `verdict`
- `expectedLow`
- `expectedHigh`
- `expectedMedian`
- `confidenceScore`
- `explanationShort`
- `explanationJson`
- `propertySnapshotJson`
- `pricingFactorsJson`
- `engineVersion`
- `createdAt`
- `updatedAt`

Relations:

- belongs to `Property`
- has many `ServiceRadarCheckSystemLink`
- has many `ServiceRadarUserAction`

Indexes:

- `[propertyId, createdAt desc]`
- `[serviceCategory, createdAt desc]`
- `[status]`
- `[verdict]`

DB table name:

- `service_radar_checks`

#### `ServiceRadarCheckSystemLink`

Stores entity links attached to a check.

Key fields:

- `id`
- `serviceRadarCheckId`
- `linkedEntityType`
- `linkedEntityId`
- `relevanceScore`
- `createdAt`

Indexes:

- `[serviceRadarCheckId]`
- `[linkedEntityType, linkedEntityId]`

DB table name:

- `service_radar_check_system_links`

#### `ServicePriceBenchmark`

Stores normalized benchmark rows used by the estimator when active data is available.

Key fields:

- `id`
- `serviceCategory`
- `serviceSubcategory`
- `regionType`
- `regionKey`
- `homeType`
- `sizeBand`
- `baseLow`
- `baseHigh`
- `baseMedian`
- `laborFactor`
- `materialFactor`
- `complexityFactorJson`
- `effectiveFrom`
- `effectiveTo`
- `sourceLabel`
- `isActive`
- `createdAt`
- `updatedAt`

Indexes:

- `[serviceCategory, regionType, regionKey]`
- `[isActive]`
- `[effectiveFrom]`
- `[effectiveTo]`

DB table name:

- `service_price_benchmarks`

How this table is intended to be used:

- It is a normalized reference dataset, not a user-generated result table.
- One benchmark row represents a pricing baseline for a category and region, with optional extra specificity.
- The estimator uses this table opportunistically. If no usable benchmark matches, the tool still works through deterministic fallback heuristics.
- In production, this table is a good fit for imported market-price reference data, derived internal pricing aggregates, or future provider-backed benchmark feeds.

Field-level intent:

- `serviceCategory`
  - required primary category match
- `serviceSubcategory`
  - optional finer-grained service match such as `tune_up`, `panel_upgrade`, or `roof_repair`
- `regionType`
  - controls how specific the benchmark geography is
- `regionKey`
  - normalized lookup key for the selected region type
- `homeType`
  - optional housing-style filter such as single-family, condo, or townhouse
- `sizeBand`
  - optional coarse property size filter used by the estimator
- `baseLow`, `baseHigh`, `baseMedian`
  - the benchmark baseline before estimator adjustments
- `laborFactor`, `materialFactor`
  - optional multipliers that further shape the expected range
- `complexityFactorJson`
  - optional flexible JSON for future complexity modeling or source-specific metadata
- `effectiveFrom`, `effectiveTo`
  - active-date window used during benchmark lookup
- `sourceLabel`
  - human-readable provenance label surfaced in explainability payloads
- `isActive`
  - allows rows to stay in the table without remaining eligible for matching

#### `ServiceRadarUserAction`

Reserved persistence model for user actions taken after a result exists.

Key fields:

- `id`
- `serviceRadarCheckId`
- `actionType`
- `actionMetaJson`
- `createdAt`

Indexes:

- `[serviceRadarCheckId]`
- `[actionType]`
- `[createdAt desc]`

DB table name:

- `service_radar_user_actions`

### Explainability JSON fields

These payloads are intentionally flexible JSON, not heavily normalized tables:

- `ServiceRadarCheck.explanationJson`
- `ServiceRadarCheck.propertySnapshotJson`
- `ServiceRadarCheck.pricingFactorsJson`
- `ServicePriceBenchmark.complexityFactorJson`
- `ServiceRadarUserAction.actionMetaJson`

Current explainability usage includes:

- human-readable summary
- reason codes
- pricing notes
- benchmark match metadata
- confidence band
- estimation mode
- property snapshot used during evaluation
- linked entity summaries
- limitations when the estimate is broad or fallback-based

---

## `service_price_benchmarks` in Practice

### What counts as a benchmark

`service_price_benchmarks` is the canonical benchmark/reference table for Service Price Radar.

It is different from:

- `service_radar_checks`
  - saved user quote evaluations
- `service_radar_check_system_links`
  - linked entities for one saved check
- `service_radar_user_actions`
  - post-result interaction tracking

The benchmark table exists to answer:

- what pricing baseline should the estimator start from for this service
- how region-specific is that baseline
- how much extra confidence should we give the result

### Region types and key formats

Current supported benchmark region types:

- `COUNTRY`
  - broadest fallback, typically values like `US`
- `STATE`
  - normalized state key such as `NJ` or `NY`
- `METRO`
  - city/state combination normalized as either `CITY_STATE` or `CITYSTATE`
- `ZIP_PREFIX`
  - first 3 digits of the property ZIP code
- `COUNTY`
  - supported in the enum and scorer, but only useful if property county context is available to the matcher

### How benchmark matching works today

Service Price Radar does not require a benchmark, but it will use the best active match when one exists.

Current matching flow:

1. filter benchmarks to:
   - matching `serviceCategory`
   - `isActive = true`
   - `effectiveFrom <= now`
   - `effectiveTo is null` or `effectiveTo >= now`
2. score each candidate by:
   - region specificity
   - subcategory match
   - home type match
   - size band match
3. choose the highest-scoring candidate
4. if no candidate matches geography, fall back to heuristic pricing

Current region weight priority:

- `ZIP_PREFIX` = most specific
- `METRO`
- `COUNTY`
- `STATE`
- `COUNTRY` = broadest fallback

Current scoring behavior matters for seed data:

- an exact subcategory match helps a lot
- a blank subcategory is treated as a more generic benchmark, not a failure
- matching `homeType` and `sizeBand` improve benchmark quality but are optional
- benchmarks outside the active date window are ignored

### How the estimator uses a matched benchmark

When a benchmark is found:

- `baseLow`, `baseHigh`, and optional `baseMedian` become the starting range
- `laborFactor` and `materialFactor` influence the range through benchmark adjustments
- confidence increases
- explainability JSON records:
  - `benchmark.matched`
  - `benchmarkId`
  - `regionType`
  - `regionKey`
  - `sourceLabel`
  - `estimationMode = benchmark`

When no benchmark is found:

- category heuristics become the starting range
- region/home/system adjustments still apply
- explainability records `estimationMode = fallback`
- trust messaging explicitly says direct benchmark data was unavailable

This means benchmark seeding is not required for the feature to work, but it is the best way to exercise the strongest and most realistic result path.

---

## Backend Implementation

### Main backend files

- `apps/backend/src/routes/servicePriceRadar.routes.ts`
  - Express routes for create, list, detail, and event tracking
- `apps/backend/src/controllers/servicePriceRadar.controller.ts`
  - Thin request handlers that require auth context and delegate to the service
- `apps/backend/src/validators/servicePriceRadar.validators.ts`
  - Zod body/query validation
- `apps/backend/src/services/servicePriceRadar.types.ts`
  - Shared constants and DTOs for categories, verdicts, linked entity types, benchmark types, and response shapes
- `apps/backend/src/services/servicePriceRadar.service.ts`
  - Property auth checks, linked entity loading, benchmark lookup, persistence, DTO mapping, and analytics event storage
- `apps/backend/src/services/servicePriceRadar.engine.ts`
  - Rules-based estimator and explainability builder
- `apps/backend/src/index.ts`
  - Registers the Radar routes under `/api`

### API endpoints

#### `POST /api/properties/:propertyId/service-price-radar/checks`

Creates a new Radar check and returns the full saved detail DTO.

Responsibilities:

- validate request body
- enforce property ownership
- normalize subcategory and optional strings
- resolve linked entity context
- find best active benchmark if any
- run the estimator
- persist `ServiceRadarCheck`
- persist `ServiceRadarCheckSystemLink`
- return the saved detail response

#### `GET /api/properties/:propertyId/service-price-radar/checks`

Returns recent check summaries for the property.

Used for:

- mobile history list
- property-level recent Radar activity
- post-submit refresh

#### `GET /api/properties/:propertyId/service-price-radar/checks/:checkId`

Returns a single full detail payload.

Used for:

- opening prior history items
- hydrating the right-hand result panel on desktop
- restoring a recent result when the page loads

#### `POST /api/properties/:propertyId/service-price-radar/events`

Stores analytics events in `auditLog`.

Used for:

- open
- start
- submit
- result viewed
- explanation expanded
- history opened
- negotiation handoff
- errors

### Validation rules

Current backend validation includes:

- `serviceCategory` must normalize to an allowed enum value
- `quoteAmount` must be positive
- `quoteAmount` must be less than or equal to `250000`
- `quoteCurrency` must be a 3-letter code
- `serviceSubcategory`, `serviceLabelRaw`, and `quoteVendorName` are trimmed and length-limited
- `linkedEntities` are capped and each entity is minimally validated
- list `limit` is normalized and capped

### Backend service responsibilities

`ServicePriceRadarService` handles:

- property ownership enforcement with `assertPropertyForUser`
- property-context snapshot building
- linked entity loading from:
  - `homeAsset`
  - `inventoryItem`
  - `document`
  - `incident`
  - `inventoryRoom`
- benchmark selection by:
  - category
  - optional subcategory
  - region specificity
  - home type
  - size band
- record persistence
- summary/detail DTO mapping
- analytics event storage to `auditLog`

### Benchmark lookup details

Benchmark lookup currently lives inside `ServicePriceRadarService.findBestBenchmark(...)`.

Important implementation details:

- benchmark lookup is best-match, not first-match
- lookup is wrapped in a try/catch and safely falls back if benchmark access fails
- region candidates are derived from current property context:
  - `COUNTRY` currently uses `US`
  - `STATE` uses normalized property state
  - `METRO` uses normalized city/state combinations
  - `ZIP_PREFIX` uses the first 3 digits of the property ZIP code
- benchmark rows are selected with a small, focused field set and then scored in memory

This design keeps benchmark behavior deterministic and makes it easy to enhance without changing the external API.

### Estimation engine

`ServicePriceRadarEngine` is a deterministic MVP estimator.

Inputs:

- property facts
- linked entity facts
- category heuristic baseline
- optional benchmark match
- quote amount and quote currency

Core adjustments:

- service scope hints
- property size band
- region multiplier
- home age / system age
- linked context
- benchmark labor/material factors

Core outputs:

- `expectedLow`
- `expectedHigh`
- `expectedMedian`
- `confidenceScore`
- `verdict`
- `explanationShort`
- `explanationJson`
- `propertySnapshotJson`
- `pricingFactorsJson`
- `engineVersion`

Current trust guardrails in the engine:

- returns `INSUFFICIENT_DATA` when range data is unusable or confidence is extremely weak
- explanation copy softens fallback estimates
- explanation JSON includes limitations for sparse or fallback-driven outputs
- pricing factors store `confidence.band` and `estimationMode`

---

## Frontend Implementation

### Main frontend files

#### Core Radar screen

- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/service-price-radar/page.tsx`
  - page-level route wrapper
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/service-price-radar/ServicePriceRadarClient.tsx`
  - main client UI, state orchestration, property load, create flow, history open, result rendering, explainability accordion, analytics triggers
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/service-price-radar/servicePriceRadarApi.ts`
  - typed frontend DTOs and API functions
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/service-price-radar/servicePriceRadarUi.ts`
  - shared frontend helper logic for validation, user-facing error copy, and trust guardrails
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/service-price-radar/__tests__/servicePriceRadarUi.test.ts`
  - lightweight tests for UI helper behavior

#### Shared frontend integration files

- `apps/frontend/src/lib/api/client.ts`
  - shared API client including Radar analytics event call
- `apps/frontend/src/lib/routes/servicePriceRadar.ts`
  - route builder and contextual prefill mapping helpers

#### Home Tools integration files

- `apps/frontend/src/app/(dashboard)/dashboard/home-tools/page.tsx`
  - includes Radar in the Home Tools catalog
- `apps/frontend/src/app/(dashboard)/layout.tsx`
  - property-scoped tool link config shared by the dashboard shell
- `apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts`
  - mobile Home Tools catalog entry
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/HomeToolsRail.tsx`
  - property-level Home Tools rail entry

#### Contextual launch surfaces

- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/page.tsx`
  - property hub CTA, recent Radar summary, maintenance and system launch points
- `apps/frontend/src/app/(dashboard)/dashboard/components/inventory/InventoryItemDrawer.tsx`
  - inventory/system detail launch
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/incidents/[incidentId]/IncidentDetailClient.tsx`
  - incident detail launch

### Frontend route

Primary route:

- `/dashboard/properties/[id]/tools/service-price-radar`

This route is intentionally property-scoped and expects a property id in the path.

### Supported launch query params

The route builder supports these optional query params:

- `launchSurface`
- `category`
- `subcategory`
- `label`
- `quoteAmount`
- `vendor`
- `linkedEntityType`
- `linkedEntityId`

These prefills are generated by `buildServicePriceRadarHref`.

### Frontend launch surfaces

Current supported `launchSurface` values:

- `home_tools`
- `property_hub`
- `system_detail`
- `incident_card`
- `maintenance_card`
- `unknown`

### Frontend screen structure

The main screen currently renders:

1. compact intro / hero
2. quote input card
3. result card
4. explainability accordion
5. recent checks list

Key UI behaviors:

- loads property context and recent checks on entry
- restores latest saved check when history exists
- supports optional linked context
- shows trust guardrails for fallback and low-confidence results
- handles retryable error states without surfacing raw backend errors
- tracks analytics through the shared event endpoint

---

## Mobile Navigation

### Mobile Home Tools catalog

Source:

- `apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts`

Radar mobile catalog entry:

- key: `service-price-radar`
- name: `Service Price Radar`
- description: `Know if a quote is fair for your home`
- href suffix: `tools/service-price-radar?launchSurface=home_tools`
- nav target: `tool:service-price-radar`
- icon: resolved through shared home tool icon config

### Shared property tool rail

Sources:

- `apps/frontend/src/app/(dashboard)/layout.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/HomeToolsRail.tsx`

This keeps Radar visible in the property-scoped Home Tools rail on desktop and mobile-aware dashboard layouts.

### Mobile-first launch behavior

Radar is designed to open with property context already known.

That means the mobile flow is:

1. enter from a property-scoped tool surface
2. land on `/dashboard/properties/[id]/tools/service-price-radar`
3. see property context immediately
4. submit the quote on the same screen
5. review result and recent history without leaving the page

---

## Deep Entry Points and Context Prefill

### Property hub

Property detail page surfaces Radar via:

- direct `Check quote` CTA
- quick category links for common system categories
- latest Radar activity summary
- maintenance-related contextual CTA

Primary source:

- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/page.tsx`

### Inventory / system detail

Inventory item drawer can launch Radar with:

- `propertyId`
- inferred category from inventory item
- linked entity context
- `launchSurface=system_detail`

Source:

- `apps/frontend/src/app/(dashboard)/dashboard/components/inventory/InventoryItemDrawer.tsx`

### Incident detail

Incident detail can launch Radar with:

- `propertyId`
- inferred category from incident text
- linked incident id
- `launchSurface=incident_card`

Source:

- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/incidents/[incidentId]/IncidentDetailClient.tsx`

### Route helper responsibilities

`apps/frontend/src/lib/routes/servicePriceRadar.ts` provides:

- canonical Radar URL building
- category inference from inventory items
- category inference from incidents
- query-param population for optional prefills

---

## Data Contracts

### Create request

Frontend payload shape:

- `serviceCategory`
- `serviceSubcategory`
- `serviceLabelRaw`
- `quoteAmount`
- `quoteCurrency`
- `quoteVendorName`
- `quoteSource`
- `linkedEntities[]`

### List response

Summary payload fields:

- `id`
- `propertyId`
- `createdAt`
- `status`
- `serviceCategory`
- `serviceSubcategory`
- `serviceLabelRaw`
- `quoteAmount`
- `quoteCurrency`
- `quoteVendorName`
- `quoteSource`
- `expectedLow`
- `expectedHigh`
- `expectedMedian`
- `verdict`
- `confidenceScore`
- `explanationShort`

### Detail response

Detail adds:

- `explanationJson`
- `propertySnapshotJson`
- `pricingFactorsJson`
- `engineVersion`
- `linkedEntities[]`

---

## Analytics

Radar analytics use the same property-scoped event pattern used by other Home Tools.

Frontend event submission:

- `apps/frontend/src/lib/api/client.ts`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/service-price-radar/servicePriceRadarApi.ts`

Backend event sink:

- `POST /api/properties/:propertyId/service-price-radar/events`
- handled by `trackServicePriceRadarEvent`
- persisted through `ServicePriceRadarService.trackEvent`
- stored in `auditLog` using `SERVICE_PRICE_RADAR_*` action names

Tracked event families include:

- opened
- started
- submitted
- result viewed
- explanation expanded
- history item opened
- negotiation handoff clicked
- error

---

## Trust, QA, and Guardrails

Current production-hardening points:

- property access is enforced on every API call
- frontend uses calm, normalized error messaging instead of raw backend errors
- stale linked entities are handled as recoverable user errors
- low-confidence or fallback estimates get explicit trust messaging
- insufficient-data states render as limited estimates, not normal verdict cards
- history refresh failures do not make a successful quote check look like a failed submission
- form fields have stronger validation and basic accessibility wiring
- explainability sections render safe fallbacks when payloads are sparse

---

## Seeding `service_price_benchmarks`

This section is intentionally detailed because benchmark seeding is the main enhancement path for stronger Service Price Radar QA and future data integrations.

### Why seed benchmarks at all

Service Price Radar already supports end-to-end testing without seeded benchmarks:

1. open the property-scoped tool
2. submit a quote
3. backend creates `service_radar_checks`
4. UI renders the result

That path exercises the fallback estimator.

Seeding `service_price_benchmarks` is useful when you want to test:

- benchmark-backed confidence
- region-specific pricing
- stronger explainability
- benchmark-vs-fallback behavior
- realistic verdict swings for NJ/NY or other test regions

### Recommended seed dimensions

For deterministic testing, seed benchmarks with at least:

- `serviceCategory`
- `regionType`
- `regionKey`
- `baseLow`
- `baseHigh`
- `effectiveFrom`
- `isActive`

Better seeds also include:

- `serviceSubcategory`
- `homeType`
- `sizeBand`
- `baseMedian`
- `laborFactor`
- `materialFactor`
- `sourceLabel`

### Practical seed options

#### Option 1: Direct DB seed for QA or staging

This is the fastest current path.

Approach:

- insert rows directly into `service_price_benchmarks`
- use active date windows
- target states or ZIP prefixes that match known QA properties

Best for:

- quick manual testing
- staging smoke tests
- deterministic benchmark-vs-fallback comparisons

Tradeoffs:

- very fast
- no new infrastructure required
- but it bypasses any future ingest normalization layer

Recommended initial regions:

- `STATE = NJ`
- `STATE = NY`

Recommended starting categories:

- `HVAC`
- `PLUMBING`
- `ROOFING`
- `ELECTRICAL`

#### Option 2: SQL or script-based seed utilities

This is a cleaner step up from ad hoc inserts.

Approach:

- create a repeatable SQL seed file or Prisma/script seed utility
- keep benchmark rows in versioned test fixtures
- rerun the same seed set across local, staging, and QA environments

Best for:

- team-shared QA data
- repeatable demo environments
- regression testing after pricing logic changes

Tradeoffs:

- still relatively simple
- easier to maintain than one-off SQL
- but still not a true provider-like ingest pipeline

#### Option 3: Internal import pipeline

This is a good medium-term enhancement.

Approach:

- define a normalized CSV or JSON import contract
- add an internal/admin import script or endpoint
- map source rows into `service_price_benchmarks`

Best for:

- curated market data loads
- bulk refreshes
- controlled benchmark provenance

Tradeoffs:

- introduces light ingestion logic
- still simpler than full worker/provider integration

#### Option 4: Worker-based dummy benchmark ingest

This is the closest equivalent to the future-proof Radar and Replay QA pattern.

Approach:

- add fixture JSON in `apps/workers`
- add a worker job that loads raw benchmark-like data
- normalize the data into `service_price_benchmarks`
- schedule it through startup or cron for deterministic environments

Best for:

- future-proof E2E testing
- shared QA flows
- validating a realistic ingest path before real providers exist

Tradeoffs:

- requires worker implementation work that does not exist yet
- more setup than direct DB seeding
- but it most closely mirrors the long-term architecture

#### Option 5: External provider or partner ingest

This is the most production-oriented option.

Approach:

- fetch market pricing or quote reference data from partners or licensed feeds
- normalize categories, geographies, and date windows
- upsert canonical benchmark rows

Best for:

- production benchmark freshness
- broader regional coverage
- reducing dependence on heuristics

Tradeoffs:

- provider contracts are rarely clean or universal
- usually requires normalization, licensing, and provenance handling
- benchmark rows are often derived rather than copied 1:1 from a source

#### Option 6: Derived internal benchmarks

This is the strongest long-term product path if CtC accumulates enough quote outcome data.

Approach:

- aggregate accepted quotes, rejected quotes, and completed jobs
- derive benchmark bands by category, region, and home context
- publish normalized rows into `service_price_benchmarks`

Best for:

- product-native benchmark quality
- better alignment with actual CtC homeowners and jobs
- continuous benchmark improvement over time

Tradeoffs:

- requires enough volume and data quality
- needs aggregation, outlier handling, and data governance

### Recommended enhancement path

If the goal is staged maturity, the clean path is:

1. use direct DB or script-based seeds now
2. add repeatable fixture-based imports next
3. add worker-based dummy ingest for deterministic E2E
4. later replace or enrich dummy ingest with real provider or internal derived feeds

### Suggested benchmark seed matrix

For strong QA coverage, seed rows that intentionally exercise:

- state-level generic benchmark
- subcategory-specific benchmark
- home-type-specific benchmark
- size-band-specific benchmark
- expired benchmark that should not match
- inactive benchmark that should not match

Example seed ideas:

- `HVAC`, `tune_up`, `STATE`, `NJ`
- `PLUMBING`, `water_heater_replace`, `STATE`, `NJ`
- `ROOFING`, `roof_repair`, `ZIP_PREFIX`, `085`
- `ELECTRICAL`, `panel_upgrade`, `STATE`, `NY`
- `HVAC`, generic category-only fallback, `COUNTRY`, `US`

This makes it easy to test:

- exact benchmark match
- broader fallback benchmark match
- heuristic-only fallback when no benchmark should match

### What should change when this enhancement is implemented

If we add a real benchmark ingest pipeline later, documentation and implementation should cover:

- raw source contracts
- normalization rules for:
  - category
  - subcategory
  - region type/key
  - currency
  - effective dates
- provenance handling in `sourceLabel` and optional metadata JSON
- dedupe/upsert strategy
- cron or scheduled refresh behavior
- QA fixture support that remains available even after real providers exist

Important product note:

Unlike Home Event Radar or Home Risk Replay, Service Price Radar does not need benchmark ingest to function. Benchmarks are an enhancement path that improves confidence, realism, and explainability rather than a hard dependency for the core tool.

---

## File Map Summary

### Database / schema

- `apps/backend/prisma/schema.prisma`
- `apps/workers/prisma/schema.prisma`

### Backend

- `apps/backend/src/routes/servicePriceRadar.routes.ts`
- `apps/backend/src/controllers/servicePriceRadar.controller.ts`
- `apps/backend/src/validators/servicePriceRadar.validators.ts`
- `apps/backend/src/services/servicePriceRadar.types.ts`
- `apps/backend/src/services/servicePriceRadar.service.ts`
- `apps/backend/src/services/servicePriceRadar.engine.ts`

### Frontend

- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/service-price-radar/page.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/service-price-radar/ServicePriceRadarClient.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/service-price-radar/servicePriceRadarApi.ts`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/service-price-radar/servicePriceRadarUi.ts`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/service-price-radar/__tests__/servicePriceRadarUi.test.ts`
- `apps/frontend/src/lib/routes/servicePriceRadar.ts`
- `apps/frontend/src/lib/api/client.ts`

### Navigation / launch integration

- `apps/frontend/src/app/(dashboard)/layout.tsx`
- `apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts`
- `apps/frontend/src/app/(dashboard)/dashboard/home-tools/page.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/HomeToolsRail.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/page.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/components/inventory/InventoryItemDrawer.tsx`
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/incidents/[incidentId]/IncidentDetailClient.tsx`

---

## Notes

- Radar is property-scoped by design. There is no global, property-less version of the tool.
- Manual database migration handling is still the expected workflow when schema changes are introduced.
- The estimator is intentionally MVP-grade and deterministic. It is designed to be improved without changing the API surface or the primary frontend route.
