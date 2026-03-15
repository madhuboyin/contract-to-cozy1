# Neighborhood Change Radar

## Overview

Neighborhood Change Radar is a property-scoped Home Tool that helps a homeowner understand what is happening in their neighborhood and how it may affect their property.

It answers:

- What development, infrastructure, or zoning changes are happening nearby?
- Which of those changes are likely to affect my property's value, livability, or costs?
- Are the signals fresh and trustworthy, or old and uncertain?
- What is the overall sentiment of the neighborhood — is it improving, declining, or mixed?

It is intentionally distinct from adjacent features:

- Home Event Radar = current and recent weather/insurance/utility signals
- Home Risk Replay = historical environmental stress timeline
- Neighborhood Change Radar = nearby development and planning changes with property-level impact scoring

The feature is implemented as a full-stack flow:

1. Canonical `NeighborhoodEvent` records are ingested (via admin API or worker dummy ingest)
2. Properties are matched to events by city+state proximity (MVP)
3. An impact engine scores each event against the property using deterministic rules
4. Confidence and freshness scoring further qualifies each signal
5. A composite rank orders events for the homeowner feed
6. The frontend renders a summary strip, event list, event detail, and trend summary

---

## Product Scope

Neighborhood Change Radar is currently an MVP with deterministic rules and no live external provider ingest.

Current behavior:

- uses canonical `NeighborhoodEvent` records already in the database
- supports worker-based dummy event ingest for QA and end-to-end testing
- matches events to properties using city+state co-location (MVP proxy for proximity)
- computes property-aware impact scoring with distance decay
- scores event freshness and confidence, combines into a compositeRank
- exposes summary, event list, event detail, trend summary, and signal endpoints
- serves a notification job (daily) and a full radar refresh job (weekly)
- mobile-first UI with desktop two-column layout

Not included in the current implementation:

- live external provider integrations
- real lat/lng-based property proximity (city+state is the MVP proxy)
- geospatial polygon or county matching
- user interaction state tracking (no save/dismiss/seen lifecycle like Home Event Radar)
- export or share flows

---

## Database

### Enums

```prisma
enum NeighborhoodEventType {
  TRANSIT_PROJECT
  HIGHWAY_PROJECT
  COMMERCIAL_DEVELOPMENT
  RESIDENTIAL_DEVELOPMENT
  INDUSTRIAL_PROJECT
  WAREHOUSE_PROJECT
  ZONING_CHANGE
  SCHOOL_RATING_CHANGE
  SCHOOL_BOUNDARY_CHANGE
  FLOOD_MAP_UPDATE
  UTILITY_INFRASTRUCTURE
  PARK_DEVELOPMENT
  LARGE_CONSTRUCTION
}

enum ImpactDirection {
  POSITIVE
  NEGATIVE
  NEUTRAL
}

enum ImpactCategory {
  PROPERTY_VALUE
  RENTAL_DEMAND
  TRAFFIC
  NOISE
  AMENITIES
  INSURANCE_RISK
  DEVELOPMENT_PRESSURE
  LIVING_EXPERIENCE
}

enum DemographicSegment {
  YOUNG_PROFESSIONALS
  FAMILIES_WITH_CHILDREN
  AFFLUENT_BUYERS
  RETIREES
  STUDENTS
  RENTERS
}
```

### Models

#### `NeighborhoodEvent` — Canonical Neighborhood Signal

The master record for each unique neighborhood development or planning event. A `NeighborhoodEvent` is not property-scoped — it represents a real-world change in a city that may affect many properties.

Events are deduplicated during ingestion using a two-strategy approach (see Ingestion Service below).

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `eventType` | `NeighborhoodEventType` | Category of development |
| `title` | String | Short display title |
| `description` | String? | Longer narrative; optional |
| `latitude` | Float | Event location latitude |
| `longitude` | Float | Event location longitude |
| `city` | String | City for matching |
| `state` | String | State for matching |
| `country` | String | Country (default: US) |
| `sourceName` | String | Name of the data source |
| `sourceUrl` | String? | Link to source material |
| `announcedDate` | DateTime? | When the event was announced |
| `expectedStartDate` | DateTime? | Projected start |
| `expectedEndDate` | DateTime? | Projected end; null = open-ended |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

**Indexes:** `eventType`, `(latitude, longitude)`

**Relations:** `impacts` (NeighborhoodImpact[]), `propertyMatches` (PropertyNeighborhoodEvent[]), `demographics` (DemographicImpact[])

---

#### `PropertyNeighborhoodEvent` — Property-Event Link

Created by the matching engine for each `(property, neighborhood event)` pair that co-exists in the same city+state. This is the record the UI reads and the notification job scans.

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `propertyId` | String | FK → Property |
| `eventId` | String | FK → NeighborhoodEvent |
| `distanceMiles` | Float | Estimated distance (intra-city default: 0.5 mi) |
| `impactScore` | Int? | 0–100, computed by impact engine with distance decay |
| `createdAt` | DateTime | |

**Indexes:** `propertyId`, `eventId`

**Relations:** belongs to `Property`, belongs to `NeighborhoodEvent`

---

#### `NeighborhoodImpact` — Per-Event Impact Dimension

Stores each individual impact axis for a `NeighborhoodEvent` (e.g. TRAFFIC: NEGATIVE, PROPERTY_VALUE: POSITIVE). Created/replaced by `NeighborhoodPropertyMatchService` when processing an event.

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `eventId` | String | FK → NeighborhoodEvent |
| `category` | `ImpactCategory` | Impact axis |
| `direction` | `ImpactDirection` | POSITIVE / NEGATIVE / NEUTRAL |
| `description` | String | Human-readable impact summary |
| `confidence` | Float? | 0.0–1.0, decayed by distance at computation time |
| `createdAt` | DateTime | |

**Index:** `eventId`

---

#### `DemographicImpact` — Per-Event Demographic Signal

Stores demographic buyer/renter signals for events that carry them (TRANSIT_PROJECT, COMMERCIAL_DEVELOPMENT, RESIDENTIAL_DEVELOPMENT, ZONING_CHANGE, SCHOOL_RATING_CHANGE, SCHOOL_BOUNDARY_CHANGE, PARK_DEVELOPMENT).

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `eventId` | String | FK → NeighborhoodEvent |
| `segment` | `DemographicSegment` | Target demographic group |
| `description` | String | Human-readable impact on that segment |
| `confidence` | Float? | 0.0–1.0, decayed by distance at computation time |
| `createdAt` | DateTime | |

**Index:** `eventId`

---

### Table Summary

| Table | Purpose |
|---|---|
| `neighborhood_events` | Canonical events (shared across properties) |
| `property_neighborhood_events` | Property-event links with impact score and distance |
| `neighborhood_impacts` | Per-event impact dimensions (replaced on recompute) |
| `demographic_impacts` | Per-event demographic signals (replaced on recompute) |

---

## Scoring System

Understanding the four scoring layers is important for reasoning about what appears in the UI, what triggers notifications, and what changes when providers are integrated.

### 1. Impact Score (0–100)

Computed by `NeighborhoodImpactEngine.computeImpactScore()`.

- Each event type has a `baseScore` (48–82) defined in `impactRules.ts`
- Each event type has a `radiusMiles` (1.5–3.0 mi) that defines the relevance radius
- Score decays linearly with distance: `baseScore × max(0, 1 - (distance / radius) × 0.8)`
- At distance=0, full base score; at distance=radius, approximately 20% of base

**Base scores by event type:**

| Event Type | Base Score | Radius |
|---|---|---|
| TRANSIT_PROJECT | 82 | 2.0 mi |
| SCHOOL_RATING_CHANGE | 75 | 3.0 mi |
| FLOOD_MAP_UPDATE | 78 | 2.5 mi |
| ZONING_CHANGE | 72 | 2.0 mi |
| INDUSTRIAL_PROJECT | 70 | 2.0 mi |
| WAREHOUSE_PROJECT | 68 | 2.0 mi |
| COMMERCIAL_DEVELOPMENT | 65 | 1.5 mi |
| PARK_DEVELOPMENT | 65 | 1.5 mi |
| RESIDENTIAL_DEVELOPMENT | 60 | 1.5 mi |
| HIGHWAY_PROJECT | 58 | 2.0 mi |
| LARGE_CONSTRUCTION | 55 | 1.5 mi |
| SCHOOL_BOUNDARY_CHANGE | 62 | 3.0 mi |
| UTILITY_INFRASTRUCTURE | 48 | 1.5 mi |

### 2. Confidence Score (0–1)

Computed by `eventConfidence.ts` / `computeEventConfidence()`.

- Baseline: 0.50
- Bonuses: description ≥20 chars (+0.10), source name present (+0.10), source URL present (+0.08), announced date (+0.07), start/end date (+0.05), fresh <6 months (+0.05)
- Penalties: event aged 12–24 months (−0.10), stale >24 months (−0.20), ended 6–12 months ago (−0.08), ended >12 months ago (−0.15)

**Confidence bands:**

| Band | Threshold | UI Label |
|---|---|---|
| HIGH | ≥ 0.72 | (no label shown) |
| MEDIUM | ≥ 0.48 | "Medium confidence" |
| PRELIMINARY | < 0.48 | "Preliminary signal" |

### 3. Freshness Score (0–1)

Computed by `computeFreshnessScore()` in `eventConfidence.ts`.

For events with no end date or future end date, recency drives freshness:

| Age of event | Freshness |
|---|---|
| < 3 months | 1.00 |
| < 6 months | 0.90 |
| < 12 months | 0.80 |
| < 18 months | 0.65 |
| < 24 months | 0.50 |
| < 36 months | 0.35 |
| ≥ 36 months | 0.20 |

For events whose `expectedEndDate` has passed, age from end date drives freshness (range: 0.20–0.65).

**Staleness threshold:** freshness ≤ 0.35

### 4. Composite Rank (0–100)

Combines all three scores for feed ordering:

```
compositeRank = impactScore × 0.55 + confidence × 25 + freshnessScore × 20
```

### Key Thresholds

| Threshold | Value | Used By |
|---|---|---|
| Meaningful impact | 40 | Summary card, signal visibility |
| Summary composite | 20 | Meaningful change count |
| Notification trigger | 60 (impactScore) + freshness > 0.50 | Notification job |
| Staleness cutoff | freshness ≤ 0.35 | isStaleEvent(), UI notes, notification suppression |

---

## Backend

### Files

| File | Purpose |
|---|---|
| `backend/src/neighborhoodIntelligence/neighborhoodIntelligence.routes.ts` | Express route definitions and middleware chains |
| `backend/src/neighborhoodIntelligence/neighborhoodIntelligence.controller.ts` | Request handling and response delegation |
| `backend/src/neighborhoodIntelligence/neighborhoodIntelligenceService.ts` | Orchestration: ingest → match → impact |
| `backend/src/neighborhoodIntelligence/neighborhoodEventIngestionService.ts` | Event deduplication, validation, upsert |
| `backend/src/neighborhoodIntelligence/neighborhoodPropertyMatchService.ts` | Property matching and impact persistence |
| `backend/src/neighborhoodIntelligence/neighborhoodImpactEngine.ts` | Distance-decayed impact scoring |
| `backend/src/neighborhoodIntelligence/impactRules.ts` | Per-event-type base scores, radii, impact dimensions |
| `backend/src/neighborhoodIntelligence/neighborhoodRadarQueryService.ts` | Feed queries: summary, event list, detail, trends |
| `backend/src/neighborhoodIntelligence/neighborhoodSignalService.ts` | Compact signal codes for cross-tool signal exposure |
| `backend/src/neighborhoodIntelligence/eventConfidence.ts` | Confidence, freshness, composite rank, staleness |
| `backend/src/neighborhoodIntelligence/geoUtils.ts` | Haversine distance, lat/lng validation |
| `backend/src/neighborhoodIntelligence/types.ts` | Internal service types and DTO shapes |
| `backend/src/neighborhoodIntelligence/neighborhoodIntelligence.validators.ts` | Zod v4 input schemas |
| `backend/src/neighborhoodIntelligence/neighborhoodIntelligence.seed.ts` | Dev seed script with 5 Atlanta sample events |
| `backend/src/index.ts` | Route mounting: `app.use('/api', neighborhoodIntelligenceRoutes)` |

---

### API Endpoints

All endpoints require `Authorization: Bearer <token>` JWT. Property-scoped endpoints require property-level authorization via `propertyAuth.middleware`.

#### Admin / Ingestion

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/neighborhood-intelligence/ingest` | ADMIN | Ingest a normalized neighborhood event and trigger property matching |
| `POST` | `/api/neighborhood-intelligence/events/:eventId/recompute` | ADMIN | Re-run property matching for an existing event |

#### Property Feed (User-Facing)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/properties/:propertyId/neighborhood-radar/summary` | Interpreted summary card for the property |
| `GET` | `/api/properties/:propertyId/neighborhood-radar/events` | Paginated event list with filtering |
| `GET` | `/api/properties/:propertyId/neighborhood-radar/events/:eventId` | Full detail for a single event |
| `GET` | `/api/properties/:propertyId/neighborhood-radar/trends` | Neighborhood trend summary (pressure signals, counts) |
| `GET` | `/api/properties/:propertyId/neighborhood-radar/signals` | Compact signal codes for active high-impact events |
| `POST` | `/api/properties/:propertyId/neighborhood-radar/recompute` | Re-run property matching for this property (HOMEOWNER) |

#### Event List Query Parameters (`GET /events`)

| Param | Type | Default | Notes |
|---|---|---|---|
| `sortBy` | `'impact'` \| `'date'` | `'impact'` | Sort order for returned events |
| `filterType` | `NeighborhoodEventType` | — | Filter by event type |
| `filterEffect` | `'POSITIVE'` \| `'NEGATIVE'` \| `'MIXED'` | — | Filter by overall effect direction |
| `limit` | number | 20 | 1–100 |
| `offset` | number | 0 | Pagination offset |

---

### Service Layer

#### `NeighborhoodIntelligenceService` — Orchestration

Top-level orchestrator. Called by the ingest and recompute controller handlers.

- **`ingestAndProcessEvent(input)`** — Full pipeline: validates input via `NeighborhoodEventIngestionService` → upserts canonical event → triggers `NeighborhoodPropertyMatchService.matchPropertiesForEvent()`. Returns `{ eventId, created: boolean, matchedProperties: number }`.
- **`recomputeEventMatches(eventId)`** — Re-runs property matching for an existing canonical event.
- **`recomputePropertyNeighborhoodRadar(propertyId)`** — Recomputes all event matches for a specific property (e.g. after property details change).

#### `NeighborhoodEventIngestionService` — Dedup and Upsert

Handles event validation, deduplication, and canonical upsert.

**Deduplication strategies (in order):**

1. Match on `sourceName + eventType + normalized title` (case-insensitive)
2. Match on `eventType + normalized title + approximate location` (±0.015 degrees ≈ 1 mile)

**Validation guardrails:**

- Event type must exist in `NEIGHBORHOOD_IMPACT_RULES`
- Lat/lng must be valid (non-null-island, within range)
- Title must be at least 5 characters and not a low-signal placeholder (permit, inspection, misc, other, unknown, n/a)

#### `NeighborhoodPropertyMatchService` — Matching and Impact Persistence

Finds eligible properties and generates impact records.

**Current matching strategy (MVP):** city+state co-location. Properties with the same city+state as the event are considered eligible. This is a deliberate simplification — the property schema does not currently store lat/lng for the matching step.

**Process per property:**

1. Compute distance using `haversineDistanceMiles()` when property lat/lng is available; otherwise default to 0.5 miles (intra-city proxy)
2. Call `NeighborhoodImpactEngine.generate()` with `PropertyContext` and distance
3. Upsert `PropertyNeighborhoodEvent` with computed `impactScore`
4. Replace `NeighborhoodImpact` records for the event (delete + re-insert)
5. Replace `DemographicImpact` records for qualifying event types

**Recompute path:** `recomputePropertyNeighborhoodRadar()` loads all events in the same city+state and re-runs impact generation for each.

#### `NeighborhoodImpactEngine` — Distance-Decayed Scoring

Applies distance decay to base scores and impact confidences.

- `generate(eventType, distanceMiles, propertyContext)` → `GeneratedImpacts`
- Impact score formula: `baseScore × max(0, 1 − (distance / radius) × 0.8)`
- Confidence decay: `max(0.3, 1 − (distance / radius) × 0.5)`
- `OverallEffect` computed from weighted confidence sums: thresholds at ±1.5 (HIGHLY), ±0.5 (MODERATELY), MIXED, NEUTRAL

**Demographic events** (only these types generate `DemographicImpact`):
`TRANSIT_PROJECT`, `COMMERCIAL_DEVELOPMENT`, `RESIDENTIAL_DEVELOPMENT`, `ZONING_CHANGE`, `SCHOOL_RATING_CHANGE`, `SCHOOL_BOUNDARY_CHANGE`, `PARK_DEVELOPMENT`

#### `NeighborhoodRadarQueryService` — Feed Queries

Reads and ranks `PropertyNeighborhoodEvent` links for the UI.

- `getSummary()` — Filters links with `impactScore ≥ 40`, sorts by `compositeRank`, counts meaningful events (compositeRank ≥ 20), extracts top positive/negative themes, returns headline and `overallSentiment`
- `getEventList()` — Applies type/effect filters, sorts by impact or date, paginates
- `getEventDetail()` — Returns full card + allImpacts, allDemographics, whyThisMatters, confidenceNote
- `getTrends()` — Aggregates event counts by type and direction, derives `pressureSignals`, builds narrative, surfaces top 3 developments

#### `NeighborhoodSignalService` — Cross-Tool Signal Codes

Produces compact signal codes for surfacing neighborhood status in other tools (e.g. the tool rail or a property hub card).

**13 Signal Codes:**

| Code | Direction | Event Type |
|---|---|---|
| TRANSIT_UPSIDE_PRESENT | POSITIVE | TRANSIT_PROJECT |
| FLOOD_RISK_PRESSURE | NEGATIVE | FLOOD_MAP_UPDATE |
| SCHOOL_QUALITY_IMPROVING | POSITIVE | SCHOOL_RATING_CHANGE |
| SCHOOL_QUALITY_DECLINING | NEGATIVE | SCHOOL_RATING_CHANGE |
| COMMERCIAL_GROWTH_SIGNAL | POSITIVE | COMMERCIAL_DEVELOPMENT |
| INDUSTRIAL_NOISE_RISK | NEGATIVE | INDUSTRIAL_PROJECT |
| WAREHOUSE_TRAFFIC_RISK | NEGATIVE | WAREHOUSE_PROJECT |
| ZONING_RISK | NEGATIVE | ZONING_CHANGE |
| HIGHWAY_DISRUPTION_RISK | NEGATIVE | HIGHWAY_PROJECT |
| PARK_AMENITY_UPSIDE | POSITIVE | PARK_DEVELOPMENT |
| RESIDENTIAL_DENSITY_INCREASING | MIXED | RESIDENTIAL_DEVELOPMENT |
| LARGE_CONSTRUCTION_DISRUPTION | NEGATIVE | LARGE_CONSTRUCTION |
| UTILITY_INFRASTRUCTURE_CHANGE | MIXED | UTILITY_INFRASTRUCTURE |

Signals require `impactScore ≥ 40`. Deduplicated by code (highest score wins).

---

### Validators (`neighborhoodIntelligence.validators.ts`)

| Schema | Used By |
|---|---|
| `ingestEventBodySchema` | `POST /neighborhood-intelligence/ingest` |
| `eventListQuerySchema` | `GET /neighborhood-radar/events` (query params) |

**`ingestEventBodySchema` key fields:**
- `externalSourceId` — optional string
- `eventType` — required, must match `NeighborhoodEventType`
- `title` — required, 5–500 chars
- `description` — optional, max 2000 chars
- `latitude` / `longitude` — required, valid coordinates
- `city` / `state` / `country` — optional strings
- `sourceName` / `sourceUrl` — optional strings
- `announcedDate` / `expectedStartDate` / `expectedEndDate` — optional ISO dates
- `rawCategory` / `projectSize` — optional metadata
- `distanceRadiusMiles` — optional, max 50 miles
- `metadata` — optional free-form record

---

## Frontend

### Files

| File | Purpose |
|---|---|
| `frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/neighborhood-change-radar/page.tsx` | Server-side page wrapper |
| `frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/neighborhood-change-radar/NeighborhoodChangeRadarClient.tsx` | Main client component (data fetching, rendering) |
| `frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/neighborhood-change-radar/neighborhoodRadarApi.ts` | Typed API wrapper functions |
| `frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/neighborhood-change-radar/neighborhoodChangeRadarUi.ts` | Pure UI helpers (error messages, guardrails, labels, formatting) |
| `frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/neighborhood-change-radar/__tests__/neighborhoodChangeRadarUi.test.ts` | Unit tests for UI helpers (34 tests) |
| `frontend/src/components/mobile/dashboard/mobileToolCatalog.ts` | Mobile nav registration |
| `frontend/src/lib/api/client.ts` | Centralized API client methods |
| `frontend/src/types/index.ts` | TypeScript interfaces (lines ~2561–2713) |

---

### Route and Layout

**Route:** `/dashboard/properties/:propertyId/tools/neighborhood-change-radar`

**Layout:** Mobile-first with desktop override:
- `MobilePageContainer` uses `lg:max-w-7xl lg:px-8 lg:pb-10` to override the default 414px mobile constraint
- Desktop: two-column grid `lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6`
  - Left column (320px): `MobilePageIntro` + summary strip + trend strip
  - Right column: event list
- Mobile: single column, standard scroll

---

### API Layer (`neighborhoodRadarApi.ts`)

Five typed async wrappers, each returning `null` on 404/error:

```typescript
// Interpreted summary card
getNeighborhoodRadarSummary(propertyId: string): Promise<NeighborhoodRadarSummaryDTO | null>

// Paginated event list
getNeighborhoodRadarEvents(propertyId: string, params?: {
  sortBy?: 'impact' | 'date';
  filterType?: NeighborhoodEventType;
  filterEffect?: 'POSITIVE' | 'NEGATIVE' | 'MIXED';
  limit?: number;
  offset?: number;
}): Promise<NeighborhoodEventListDTO | null>

// Full event detail
getNeighborhoodRadarEventDetail(propertyId: string, eventId: string): Promise<NeighborhoodEventDetailDTO | null>

// Trend summary
getNeighborhoodRadarTrends(propertyId: string): Promise<NeighborhoodTrendSummaryDTO | null>

// Compact signal codes
getNeighborhoodSignals(propertyId: string): Promise<NeighborhoodSignal[]>
```

---

### UI Helpers (`neighborhoodChangeRadarUi.ts`)

Pure functions with no React imports, fully unit-tested.

| Export | Purpose |
|---|---|
| `getNeighborhoodEventUserMessage(error, stage)` | Stage-aware, user-friendly error messages for 404/401/network failures |
| `buildNeighborhoodRadarGuardrail(summary)` | Returns a guardrail card when no events exist, data is awaiting, or signals are mostly preliminary; returns null when healthy |
| `getConfidenceBandLabel(band, isStale)` | Label for confidence indicator chip: null (HIGH fresh), "Older signal" (stale), "Medium confidence" (MEDIUM), "Preliminary signal" (PRELIMINARY) |
| `buildStaleEventNote(event)` | Caveat note string for stale events; null for fresh events |
| `formatNeighborhoodDistance(miles)` | "Very close" (<0.1 mi), "{n} mi away" otherwise |
| `getEffectSentimentLabel(effect)` | Maps `OverallEffect` to display phrases (e.g. "Mostly positive", "Mixed signals") |

**Unit tests:** `__tests__/neighborhoodChangeRadarUi.test.ts` — 34 tests across 6 describe blocks covering all exported functions and edge cases.

---

### Client Component (`NeighborhoodChangeRadarClient.tsx`)

**Display constant maps (inline in component):**

| Constant | Contents |
|---|---|
| `EVENT_TYPE_LABEL` | Human-readable labels for all 13 event types |
| `IMPACT_CATEGORY_LABEL` | Labels for all 8 impact categories |
| `DEMOGRAPHIC_SEGMENT_LABEL` | Labels for all 6 demographic segments |
| `EFFECT_TONE` | Maps `NeighborhoodOverallEffect` to UI tone (positive/negative/mixed/neutral) |

**Screen sections:**

1. `MobilePageIntro` — Feature title and description (desktop: `lg:col-span-2`)
2. Summary strip — Headline sentiment, meaningful change count, top positive/negative themes, last scan timestamp
3. Trend strip — Pressure signals, narrative, counts by type/direction
4. Event list — Scrollable cards with type chip, effect badge, distance, confidence label
5. Event detail modal — Full card + impact axes, demographic signals, whyThisMatters, confidence note, source link
6. Guardrail card — Shown when no events, awaiting data, or mostly preliminary signals
7. `RelatedTools` — Desktop only (`hidden lg:col-span-2 lg:block`)
8. `HomeToolsRail` — Mobile only (`lg:hidden`)

**State management:** TanStack React Query v5 (5min stale, 10min cache)

---

### TypeScript Interfaces (`types/index.ts`)

```typescript
// Enums (type aliases)
type NeighborhoodEventType =
  | 'TRANSIT_PROJECT' | 'HIGHWAY_PROJECT' | 'COMMERCIAL_DEVELOPMENT'
  | 'RESIDENTIAL_DEVELOPMENT' | 'INDUSTRIAL_PROJECT' | 'WAREHOUSE_PROJECT'
  | 'ZONING_CHANGE' | 'SCHOOL_RATING_CHANGE' | 'SCHOOL_BOUNDARY_CHANGE'
  | 'FLOOD_MAP_UPDATE' | 'UTILITY_INFRASTRUCTURE' | 'PARK_DEVELOPMENT'
  | 'LARGE_CONSTRUCTION'

type NeighborhoodImpactDirection = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'

type NeighborhoodImpactCategory =
  | 'PROPERTY_VALUE' | 'RENTAL_DEMAND' | 'TRAFFIC' | 'NOISE'
  | 'AMENITIES' | 'INSURANCE_RISK' | 'DEVELOPMENT_PRESSURE' | 'LIVING_EXPERIENCE'

type NeighborhoodDemographicSegment =
  | 'YOUNG_PROFESSIONALS' | 'FAMILIES_WITH_CHILDREN' | 'AFFLUENT_BUYERS'
  | 'RETIREES' | 'STUDENTS' | 'RENTERS'

type NeighborhoodOverallEffect =
  | 'HIGHLY_POSITIVE' | 'MODERATELY_POSITIVE' | 'MIXED'
  | 'NEUTRAL' | 'MODERATELY_NEGATIVE' | 'HIGHLY_NEGATIVE'

type NeighborhoodConfidenceBand = 'HIGH' | 'MEDIUM' | 'PRELIMINARY'

type NeighborhoodSignalCode =
  | 'TRANSIT_UPSIDE_PRESENT' | 'FLOOD_RISK_PRESSURE' | 'SCHOOL_QUALITY_IMPROVING'
  | 'SCHOOL_QUALITY_DECLINING' | 'COMMERCIAL_GROWTH_SIGNAL' | 'INDUSTRIAL_NOISE_RISK'
  | 'WAREHOUSE_TRAFFIC_RISK' | 'ZONING_RISK' | 'HIGHWAY_DISRUPTION_RISK'
  | 'PARK_AMENITY_UPSIDE' | 'RESIDENTIAL_DENSITY_INCREASING'
  | 'LARGE_CONSTRUCTION_DISRUPTION' | 'UTILITY_INFRASTRUCTURE_CHANGE'

// Core interfaces
interface NeighborhoodImpactSnippet {
  category: NeighborhoodImpactCategory
  direction: NeighborhoodImpactDirection
  description: string
  confidence: number | null
}

interface NeighborhoodDemographicSnippet {
  segment: NeighborhoodDemographicSegment
  description: string
  confidence: number | null
}

interface NeighborhoodEventCard {
  id: string                          // PropertyNeighborhoodEvent id
  eventId: string                     // NeighborhoodEvent id
  eventType: NeighborhoodEventType
  title: string
  shortExplanation: string
  distanceMiles: number
  impactScore: number | null
  compositeRank: number
  overallEffect: NeighborhoodOverallEffect
  topPositives: NeighborhoodImpactSnippet[]
  topNegatives: NeighborhoodImpactSnippet[]
  demographicSignals: NeighborhoodDemographicSnippet[]
  announcedDate: string | null
  expectedStartDate: string | null
  expectedEndDate: string | null
  sourceName: string
  city: string
  state: string
  overallConfidence: number
  confidenceBand: NeighborhoodConfidenceBand
  freshnessScore: number
  isStale: boolean
  createdAt: string
}

interface NeighborhoodEventDetailDTO extends NeighborhoodEventCard {
  description: string | null
  sourceUrl: string | null
  country: string
  latitude: number
  longitude: number
  allImpacts: NeighborhoodImpactSnippet[]
  allDemographics: NeighborhoodDemographicSnippet[]
  whyThisMatters: string[]
  confidenceNote: string
}

interface NeighborhoodRadarSummaryDTO {
  propertyId: string
  meaningfulChangeCount: number
  topHeadline: string
  overallSentiment: NeighborhoodOverallEffect
  topPositiveThemes: string[]
  topNegativeThemes: string[]
  mostImportantEvent: NeighborhoodEventCard | null
  lastScanAt: string
}

interface NeighborhoodEventListDTO {
  events: NeighborhoodEventCard[]
  total: number
}

interface NeighborhoodTrendSummaryDTO {
  propertyId: string
  totalEvents: number
  narrative: string
  pressureSignals: string[]
  countByEventType: Record<string, number>
  countByDirection: Record<string, number>
  topDevelopments: NeighborhoodEventCard[]
}

interface NeighborhoodSignal {
  code: NeighborhoodSignalCode
  direction: 'POSITIVE' | 'NEGATIVE' | 'MIXED'
  label: string
  score: number          // 0–100
  eventId: string
}
```

---

## Mobile Navigation

Neighborhood Change Radar is wired into the shared Home Tools catalog.

**Source file:** `frontend/src/components/mobile/dashboard/mobileToolCatalog.ts`

**Catalog entry (in `MOBILE_HOME_TOOL_LINKS`):**

```typescript
{
  key: 'neighborhood-change-radar',
  name: 'Neighborhood Change Radar',
  description: 'See what\'s changing in your neighborhood',
  hrefSuffix: 'tools/neighborhood-change-radar',
  navTarget: 'tool:neighborhood-change-radar',
  icon: resolveToolIcon('home', 'neighborhood-change-radar'),
  isActive: (pathname) =>
    /\/tools\/neighborhood-change-radar(\/|$)/.test(pathname),
}
```

**Nav group:** Listed under `MOBILE_HOME_TOOL_LINKS` — property-centric operational tools (same group as Home Event Radar, Home Risk Replay, Home Digital Twin).

**Active state detection:** Matches `/dashboard/properties/:id/tools/neighborhood-change-radar`.

### Home Tools Screen

**File:** `frontend/src/app/(dashboard)/dashboard/home-tools/page.tsx`

- Tool is listed in the Home Tools catalog page
- If a property is already selected, the tool opens directly on that property
- If no property is selected, the user is sent through the property selection flow

### Property Page Home Tools Rail

**File:** `frontend/src/app/(dashboard)/dashboard/properties/[id]/components/HomeToolsRail.tsx`

- Desktop: pill buttons linking directly to the tool
- Mobile: bottom sheet listing all Home Tools
- Both variants include the Neighborhood Change Radar entry via the shared catalog config

### Navigation Update Checklist

When the feature is enhanced or renamed, update these locations:

| Location | What to update |
|---|---|
| `mobileToolCatalog.ts` | `key`, `name`, `description`, `hrefSuffix`, `navTarget`, `isActive` |
| `HomeToolsRail.tsx` | Inherits from catalog — no direct change needed |
| `home-tools/page.tsx` | Tool group placement / description |
| `properties/page.tsx` | `navTarget` resolution map |
| `layout.tsx` | Uses shared `MOBILE_HOME_TOOL_LINKS` — no direct change needed |

---

## Workers

### Jobs

| Job | File | Purpose | Schedule |
|---|---|---|---|
| Dummy Ingest | `jobs/ingestNeighborhoodDummyEvents.job.ts` | QA/E2E event seeding | Every 6h (`45 */6 * * *`) — if enabled |
| Radar Refresh | `jobs/refreshNeighborhoodEvents.job.ts` | Batch recompute all property radars | Weekly Sunday 5:00 AM EST (`0 5 * * 0`) |
| Notification | `jobs/neighborhoodChangeNotificationJob.ts` | Daily scan and notify for new high-impact events | Daily 6:00 AM EST (`0 6 * * *`) |

All cron schedules use `America/New_York` timezone.

### Worker Data Flow (Dummy Ingest)

```text
ZIP-scoped fixture JSON (zipScopedEvents.json)
        ↓
dummyNeighborhoodEvent.client.ts
        ↓
DummyNeighborhoodRawEvent[]
        ↓
ingestNeighborhoodDummyEvents.job.ts
  upsert neighborhood_events (dedup on sourceName + eventType + title)
        ↓
NeighborhoodPropertyMatchService.matchPropertiesForEvent()
        ↓
property_neighborhood_events + neighborhood_impacts + demographic_impacts
        ↓
neighborhoodRadarQueryService reads and ranks for the frontend
```

### Notification Job (`neighborhoodChangeNotificationJob.ts`)

The notification job runs daily at 6:00 AM EST and scans for new high-impact events:

**Thresholds:**
- `NOTIFICATION_THRESHOLD = 60` — minimum impactScore
- `LOOKBACK_MS = 25 hours` — catch recent links plus jitter
- `FRESHNESS_THRESHOLD = 0.50` — suppress stale events from notifications

**Process:**
1. Find `PropertyNeighborhoodEvent` links with `impactScore ≥ 60` and `createdAt` within the last 25 hours
2. Compute freshness for the linked event; skip if freshness ≤ 0.50
3. Skip if a notification already exists for this link (idempotency)
4. Build title and message (context-aware by event type)
5. Create `IN_APP` notification and `EMAIL` delivery if email is enabled

**Notification fields:**
- `type`: `NEIGHBORHOOD_CHANGE_DETECTED`
- `actionUrl`: `/dashboard/properties/{propertyId}/tools/neighborhood-change-radar`
- `entityType`: `PROPERTY`
- `metadata`: `{ eventId, impactScore, eventType }`

### Refresh Job (`refreshNeighborhoodEventsJob.ts`)

Weekly full recompute of all property neighborhood radars. Processes all properties in batches:

- `BATCH_SIZE = 20` properties per batch
- `BATCH_DELAY_MS = 300` ms delay between batches (rate limiting)
- Calls `NeighborhoodPropertyMatchService.recomputePropertyNeighborhoodRadar()` per property

Controlled by `NEIGHBORHOOD_REFRESH_ENABLED` (default: `true`).

### Dummy Event Client (`dummyNeighborhoodEvent.client.ts`)

Generates realistic test events from JSON fixture files.

**Fixture sets:**

- `property_scoped` — unique events per target property (distinct neighborhoods; best for isolated single-property QA)
- `zip_scoped` — shared events per ZIP code (same pattern as Home Event Radar and Home Risk Replay; best for realistic E2E testing)

**Template variables available in fixture JSON:**

| Token | Replaced With |
|---|---|
| `{{address}}` | property.address |
| `{{city}}` | property.city |
| `{{state}}` | property.state |
| `{{zipCode}}` | property.zipCode |
| `{{propertyId}}` | property.id |

### Worker Files

| File | Purpose |
|---|---|
| `apps/workers/src/jobs/ingestNeighborhoodDummyEvents.job.ts` | Dummy ingest job (ZIP-scoped targeting) |
| `apps/workers/src/jobs/refreshNeighborhoodEvents.job.ts` | Weekly batch recompute job |
| `apps/workers/src/jobs/neighborhoodChangeNotificationJob.ts` | Daily notification scan job |
| `apps/workers/src/neighborhoodIntelligence/dummyNeighborhoodEvent.client.ts` | Fixture loader and raw event generator |
| `apps/workers/src/neighborhoodIntelligence/neighborhoodIntelligence.types.ts` | Worker-level types (no Prisma imports) |
| `apps/workers/src/neighborhoodIntelligence/fixtures/propertyScopedEvents.json` | Property-scoped QA fixtures (8 events) |
| `apps/workers/src/neighborhoodIntelligence/fixtures/zipScopedEvents.json` | ZIP-scoped QA fixtures (6 events) |
| `apps/workers/src/worker.ts` | Cron registration and optional startup run |

### Worker Environment Variables

| Env Var | Purpose | Default (deployment.yaml) |
|---|---|---|
| `NEIGHBORHOOD_DUMMY_INGEST_ENABLED` | Enable dummy event ingest | `true` |
| `NEIGHBORHOOD_DUMMY_INGEST_CRON` | Cron schedule for dummy ingest | `45 */6 * * *` |
| `NEIGHBORHOOD_DUMMY_INGEST_RUN_ON_STARTUP` | Run one ingest pass on worker start | `true` |
| `NEIGHBORHOOD_DUMMY_FIXTURE_SET` | `property_scoped` or `zip_scoped` | `zip_scoped` |
| `NEIGHBORHOOD_DUMMY_TARGET_ZIPS` | ZIP allowlist for ZIP-mode seeding | `08536,10019` |
| `NEIGHBORHOOD_DUMMY_TARGET_PROPERTY_IDS` | Explicit property allowlist (overrides ZIP filter) | unset |
| `NEIGHBORHOOD_DUMMY_MAX_PROPERTIES` | Optional cap on target properties | unset |
| `NEIGHBORHOOD_REFRESH_ENABLED` | Enable weekly refresh job | `true` |

---

## Docker and Kubernetes

### Dockerfile (`infrastructure/docker/workers/Dockerfile`)

Because workers cannot directly import backend source files at runtime, the Dockerfile copies six backend neighborhood intelligence files into `src/shared/backend/neighborhoodIntelligence/` during the build stage:

```dockerfile
# Directory creation
RUN mkdir -p src/shared/backend/neighborhoodIntelligence

# File copies
COPY apps/backend/src/neighborhoodIntelligence/neighborhoodPropertyMatchService.ts
COPY apps/backend/src/neighborhoodIntelligence/neighborhoodImpactEngine.ts
COPY apps/backend/src/neighborhoodIntelligence/impactRules.ts
COPY apps/backend/src/neighborhoodIntelligence/geoUtils.ts
COPY apps/backend/src/neighborhoodIntelligence/types.ts
COPY apps/backend/src/neighborhoodIntelligence/eventConfidence.ts
```

**Import path rewriting (sed):**

Both `refreshNeighborhoodEvents.job.ts` and `ingestNeighborhoodDummyEvents.job.ts` import from `../../../backend/src/neighborhoodIntelligence/neighborhoodPropertyMatchService`. The Dockerfile rewrites these paths to `../shared/backend/neighborhoodIntelligence/neighborhoodPropertyMatchService` before compilation.

**What to update when adding new backend imports to worker jobs:**

1. Add a `COPY` line for the new backend file to the Dockerfile
2. Add a `sed` rewrite for the import path in the relevant job file
3. Ensure the new file has no transitive imports that would fail in the worker build (no `express`, `multer`, `APIError`, etc.)

### Kubernetes (`infrastructure/kubernetes/apps/workers/deployment.yaml`)

All 8 neighborhood env vars are configured in the deployment. See the Worker Environment Variables table above for current values.

---

## E2E Testing

### Recommended Flow

1. Set `NEIGHBORHOOD_DUMMY_INGEST_ENABLED=true` and `NEIGHBORHOOD_DUMMY_INGEST_RUN_ON_STARTUP=true`
2. Worker ingests canonical `NeighborhoodEvent` records and creates `PropertyNeighborhoodEvent` links
3. Open the property-scoped Neighborhood Change Radar screen
4. Verify summary, event list, event detail, and trend summary in the UI
5. Verify notification rows in DB if `impactScore ≥ 60`

### DB Tables to Check

| Table | When to check |
|---|---|
| `neighborhood_events` | After ingest — canonical events |
| `property_neighborhood_events` | After ingest — property-event links with impact scores |
| `neighborhood_impacts` | After ingest — per-event impact axes |
| `demographic_impacts` | After ingest — demographic signals for qualifying event types |
| `notifications` | After notification job — should have `NEIGHBORHOOD_CHANGE_DETECTED` rows |

### Best QA Configuration

```
NEIGHBORHOOD_DUMMY_INGEST_ENABLED=true
NEIGHBORHOOD_DUMMY_INGEST_RUN_ON_STARTUP=true
NEIGHBORHOOD_DUMMY_FIXTURE_SET=zip_scoped
NEIGHBORHOOD_DUMMY_TARGET_ZIPS=08536,10019
```

### Fixture Coverage

**ZIP-scoped fixtures (`zipScopedEvents.json`) — 6 events per ZIP:**
- Covers normal, medium, and low-confidence scenarios
- Includes one stale `UTILITY_INFRASTRUCTURE` event (announcedOffsetDays: -800) to test freshness suppression and the "Older signal" label

**Property-scoped fixtures (`propertyScopedEvents.json`) — 8 events per property:**
- Covers all confidence/freshness scenarios
- Includes a completed WAREHOUSE_PROJECT (end date in the past) to test staleness
- Includes a ZONING_CHANGE with no source or description to test PRELIMINARY band

---

## Data Flow

```
Admin POST /api/neighborhood-intelligence/ingest
  OR worker ingestNeighborhoodDummyEventsJob
        │
        ▼
NeighborhoodEventIngestionService.upsertNormalizedEvent()
  ├─ Validate: event type, coordinates, title
  ├─ Dedup: strategy 1 (sourceName + eventType + title)
  │         strategy 2 (eventType + title + location ±1 mile)
  └─ Create or update neighborhood_events
        │
        ▼
NeighborhoodPropertyMatchService.matchPropertiesForEvent()
  ├─ Find properties in same city+state as event
  ├─ Compute distance (haversine if coords available; else 0.5 mi default)
  ├─ NeighborhoodImpactEngine.generate() → impactScore, impacts, demographics
  ├─ Upsert property_neighborhood_events
  └─ Replace neighborhood_impacts + demographic_impacts
        │
        ▼
User opens /dashboard/properties/:id/tools/neighborhood-change-radar
        │
        ▼
GET /api/properties/:id/neighborhood-radar/summary
  ├─ Filter links: impactScore ≥ 40
  ├─ Score: compositeRank = 0.55×impact + 0.25×confidence + 0.20×freshness
  └─ Return headline, sentiment, themes, most important event
        │
        ▼
NeighborhoodChangeRadarClient renders:
  ├─ Summary strip (headline, meaningful change count, themes)
  ├─ Trend strip (pressure signals, narrative)
  └─ Event list (sorted by compositeRank or date)
        │
        ▼
User taps event → GET /api/properties/:id/neighborhood-radar/events/:eventId
  └─ Full card + allImpacts + allDemographics + whyThisMatters + confidenceNote
        │
        ▼
Daily neighborhoodChangeNotificationJob:
  ├─ Scan links: impactScore ≥ 60, createdAt within 25h
  ├─ Suppress: freshness ≤ 0.50 (stale events)
  ├─ Idempotency check: skip if notification already exists
  └─ Create IN_APP + EMAIL notification
```

---

## What Changes When We Integrate External Providers

This is the main integration checklist when we move from dummy ingest to real data feeds.

### 1. Add provider clients in workers

Current worker input: JSON fixtures rendered by `dummyNeighborhoodEvent.client.ts`

Future worker input: real provider APIs for city planning, zoning, FEMA flood maps, school ratings, DOT infrastructure, etc.

Likely future file layout:
```
apps/workers/src/neighborhoodIntelligence/providers/
  cityPlanningFeed.client.ts
  femaFloodMap.client.ts
  schoolDistrictFeed.client.ts
  stateDotFeed.client.ts
  utilityPlanning.client.ts
```

Each provider client should handle:
- Provider authentication and credential management
- Pagination and checkpointing (last sync state)
- Rate limit handling and backoff
- Returning provider-specific raw payloads

### 2. Introduce provider-specific raw signal types

Current worker types: `DummyNeighborhoodRawEvent`, `DummyNeighborhoodEventFixture`

When integrating real providers, keep the canonical `NormalizedNeighborhoodEventInput` shape but add provider-specific raw types:

```typescript
// Worker-level per-provider raw types (new)
type CityPlanningRawSignal    = { ... }
type FemaFloodMapRawSignal    = { ... }
type SchoolDistrictRawSignal  = { ... }
type StateDotRawSignal        = { ... }

// Shared normalization target (keep existing)
type NormalizedNeighborhoodEventInput = { ... }
```

This isolates provider quirks from the ingestion service and keeps the backend contract stable.

### 3. Add a normalization layer per provider

Today, `dummyNeighborhoodEvent.client.ts` produces objects that already match `NormalizedNeighborhoodEventInput`.

For real providers, add a `normalize.ts` per provider (or a shared normalizer):
- Map provider-specific fields to canonical `eventType`, `title`, `latitude`, `longitude`, `announcedDate`, etc.
- Derive `externalSourceId` from provider-native IDs
- Set `sourceName` and `sourceUrl` from the provider's data

The `NeighborhoodEventIngestionService` is the right contract boundary — it should continue to receive `NormalizedNeighborhoodEventInput` regardless of the upstream provider.

### 4. Strengthen the deduplication strategy

Current dummy ingest deduplicates on `sourceName + eventType + normalized title`.

Real providers will need a stricter strategy based on provider-native event IDs:
- Strategy 1 (preferred): `externalSourceId` — use the provider's event ID directly
- Strategy 2 (fallback): `provider + eventType + normalized geography + normalized time window`

This ensures repeated ingest passes update the same canonical event rather than creating duplicates.

**What to update:**
- `NeighborhoodEventIngestionService.findExistingEvent()` — add `externalSourceId` as strategy 0
- `NeighborhoodEvent` Prisma model — add `externalSourceId` as a unique-indexed field (or add a `dedupeKey` field matching the Home Event Radar pattern)

### 5. Improve property matching geography

**Current MVP limitation:** City+state co-location is the only matching strategy. This works for dense city environments but will produce false positives for large cities and false negatives for edge cases.

**What to improve for production:**
- Use real lat/lng on properties for haversine distance matching (requires property schema migration and geocoding)
- Replace the 0.5-mile intra-city default with an actual computed distance
- Consider county-level matching once property data includes county
- For FEMA flood map updates: polygon/GeoJSON matching will be more accurate than city-level

**Files to update:**
- `neighborhoodPropertyMatchService.ts` — replace city+state query with geo-radius query
- `NeighborhoodPropertyMatchService.getDistanceMiles()` — remove the 0.5-mile fallback
- `backend/prisma/schema.prisma` — add `latitude`/`longitude` to `Property` if not already present

### 6. Calibrate impact rules for real data quality

Current `impactRules.ts` base scores are designed for the MVP. Real provider data will expose calibration needs:

- Base scores may need adjustment when real events with known outcomes are available
- Radius values should be validated against actual property impact distances
- New event sub-types may require additional rules or rule specializations

**What to update:**
- `backend/src/neighborhoodIntelligence/impactRules.ts` — adjust `baseScore` and `radiusMiles` per event type
- Add new event types to `NeighborhoodEventType` enum if providers surface them (schema migration + frontend update required)
- Consider property-characteristic modifiers (e.g. flood risk higher for basement properties) following the Home Event Radar pattern

### 7. Decide: DB-direct workers vs. backend ingest API

**Current pattern:** Workers write canonical events directly with Prisma and call `NeighborhoodPropertyMatchService`.

**Options:**

Keep DB-direct ingest:
- Pros: simple, matches current CtC worker pattern, no internal auth needed
- Cons: business rules can drift between backend and worker over time

Move to backend ingest API (`POST /api/neighborhood-intelligence/ingest`):
- Worker calls the existing admin endpoint
- Pros: one canonical validation path, backend owns all business rules
- Cons: requires `BACKEND_INTERNAL_BASE_URL` and machine/service auth

**Recommendation:** Keep DB-direct for now. Move to backend ingest API once provider volume and data quality requirements stabilize.

### 8. Add worker-to-backend auth if moving to API-based ingest

Not needed today. If we move to API-based ingest we will need:
- `BACKEND_INTERNAL_BASE_URL` env var in workers
- Machine/service credential strategy (e.g. shared secret or internal JWT)
- Internal-only access control on `POST /api/neighborhood-intelligence/ingest`

### 9. Add provider scheduling and checkpointing

Current scheduling is simple cron plus optional startup execution.

Real providers will need:
- Per-provider cron cadences (e.g. FEMA flood maps monthly, school ratings annually, DOT feeds weekly)
- Last-successful-sync checkpoint (prevents re-ingesting the full dataset every run)
- Backfill / replay windows for historical seeding
- Manual re-run support for failed sync windows

**Recommended additions:**
- Provider config rows or per-provider env vars with checkpoint fields
- Checkpoint persistence (e.g. last synced event ID or timestamp stored in DB or Redis)
- Batch-level logging for audit

### 10. Add ingest observability

Current dummy ingest logs are sufficient for QA.

Real providers need structured observability:
- Events fetched / upserted / skipped (duplicate) / failed per run
- Properties matched per event
- Dedupe hit rates (existing vs. created)
- Provider error counts and last-successful-sync timestamps
- Alerting when a feed fails repeatedly

Add at the worker/job level — not in the user-facing UI.

### 11. Tune notification thresholds with real data

Current thresholds (`NOTIFICATION_THRESHOLD = 60`, `FRESHNESS_THRESHOLD = 0.50`) are designed for dummy data. With real provider data:
- Monitor notification volumes per property/day in the first weeks
- Adjust `NOTIFICATION_THRESHOLD` if homeowners receive too many or too few notifications
- Consider per-event-type notification policies (e.g. FLOOD_MAP_UPDATE always notifies, LARGE_CONSTRUCTION only if impactScore ≥ 70)

**Files to update:** `neighborhoodChangeNotificationJob.ts` — thresholds and per-type policies

### 12. Preserve the frontend and API contract

The goal of provider integration should be:
- no major changes to `NeighborhoodEventCard` or `NeighborhoodEventDetailDTO` shapes
- no provider-specific branches in the frontend
- `NeighborhoodRadarSummaryDTO` and `NeighborhoodTrendSummaryDTO` remain stable

The canonical `NeighborhoodEvent` layer and the fixed `NormalizedNeighborhoodEventInput` contract are what make this possible. As long as provider ingest continues to normalize into this shape correctly, the radar query service, notification job, and frontend can all remain unchanged.

### 13. Keep fixture-based E2E testing alongside real providers

Even after real providers are integrated, the fixture-based dummy ingest path should remain:
- deterministic tests without external dependency flakiness
- easier staging and PR-level validation
- regression testing for impact scoring, confidence, and ranking changes

Real providers for production/staging; fixtures for deterministic E2E.

---

## Current Limitations

- No live external provider integrations. All events come from the admin ingest API or the worker dummy ingest path.
- Property matching uses city+state co-location as an MVP proxy — not actual lat/lng radius queries. This can over-match in large cities and under-match at city boundaries.
- The 0.5-mile intra-city distance default is a placeholder. Real distance-based scoring requires property lat/lng.
- County and polygon matching are not implemented.
- No user interaction state tracking (no save/dismiss/acted-on lifecycle). Events appear or disappear based solely on impact score and freshness.
- The notification job does not yet support per-type notification policies or per-user notification preferences.
- `NeighborhoodEvent` does not have a dedicated `dedupeKey` field — current deduplication relies on multi-field matching in `findExistingEvent()`.

---

## File Index

### Backend

| Path | Role |
|---|---|
| `apps/backend/prisma/schema.prisma` | DB models and enums |
| `apps/backend/src/index.ts` | Route mounting |
| `apps/backend/src/neighborhoodIntelligence/neighborhoodIntelligence.routes.ts` | Route definitions + middleware |
| `apps/backend/src/neighborhoodIntelligence/neighborhoodIntelligence.controller.ts` | Request handlers |
| `apps/backend/src/neighborhoodIntelligence/neighborhoodIntelligence.validators.ts` | Zod v4 input schemas |
| `apps/backend/src/neighborhoodIntelligence/neighborhoodIntelligenceService.ts` | Orchestration service |
| `apps/backend/src/neighborhoodIntelligence/neighborhoodEventIngestionService.ts` | Dedup + upsert |
| `apps/backend/src/neighborhoodIntelligence/neighborhoodPropertyMatchService.ts` | Property matching + impact persistence |
| `apps/backend/src/neighborhoodIntelligence/neighborhoodImpactEngine.ts` | Distance-decayed scoring |
| `apps/backend/src/neighborhoodIntelligence/impactRules.ts` | Per-event-type base scores, radii, dimensions |
| `apps/backend/src/neighborhoodIntelligence/neighborhoodRadarQueryService.ts` | Feed queries: summary, list, detail, trends |
| `apps/backend/src/neighborhoodIntelligence/neighborhoodSignalService.ts` | Compact signal codes |
| `apps/backend/src/neighborhoodIntelligence/eventConfidence.ts` | Confidence, freshness, composite rank |
| `apps/backend/src/neighborhoodIntelligence/geoUtils.ts` | Haversine distance, lat/lng validation |
| `apps/backend/src/neighborhoodIntelligence/types.ts` | Internal service and DTO types |
| `apps/backend/src/neighborhoodIntelligence/neighborhoodIntelligence.seed.ts` | Dev seed script (5 Atlanta events) |

### Frontend — Feature Screen

| Path | Role |
|---|---|
| `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/neighborhood-change-radar/page.tsx` | Server-side page wrapper |
| `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/neighborhood-change-radar/NeighborhoodChangeRadarClient.tsx` | Main client component |
| `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/neighborhood-change-radar/neighborhoodRadarApi.ts` | Typed API wrappers |
| `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/neighborhood-change-radar/neighborhoodChangeRadarUi.ts` | Pure UI helpers |
| `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/neighborhood-change-radar/__tests__/neighborhoodChangeRadarUi.test.ts` | UI helper unit tests |

### Frontend — Shared Wiring

| Path | Role |
|---|---|
| `apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts` | Mobile nav registration |
| `apps/frontend/src/app/(dashboard)/dashboard/home-tools/page.tsx` | Home Tools catalog page |
| `apps/frontend/src/app/(dashboard)/dashboard/properties/page.tsx` | Property selection + navTarget routing |
| `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/HomeToolsRail.tsx` | Property page tool rail |
| `apps/frontend/src/app/(dashboard)/layout.tsx` | Dashboard shell nav |
| `apps/frontend/src/lib/api/client.ts` | Centralized API client methods |
| `apps/frontend/src/types/index.ts` | TypeScript interfaces |

### Workers

| Path | Role |
|---|---|
| `apps/workers/src/jobs/ingestNeighborhoodDummyEvents.job.ts` | Dummy ingest runner (ZIP-scoped) |
| `apps/workers/src/jobs/refreshNeighborhoodEvents.job.ts` | Weekly batch recompute |
| `apps/workers/src/jobs/neighborhoodChangeNotificationJob.ts` | Daily notification scan |
| `apps/workers/src/neighborhoodIntelligence/dummyNeighborhoodEvent.client.ts` | Fixture loader + event generator |
| `apps/workers/src/neighborhoodIntelligence/neighborhoodIntelligence.types.ts` | Worker-only types (no Prisma imports) |
| `apps/workers/src/neighborhoodIntelligence/fixtures/propertyScopedEvents.json` | Property-scoped QA fixtures |
| `apps/workers/src/neighborhoodIntelligence/fixtures/zipScopedEvents.json` | ZIP-scoped QA fixtures |
| `apps/workers/src/worker.ts` | Cron/startup registration |

### Infrastructure

| Path | Role |
|---|---|
| `infrastructure/docker/workers/Dockerfile` | Worker image + shared-copy pattern for neighborhood files |
| `infrastructure/kubernetes/apps/workers/deployment.yaml` | Worker runtime env configuration |
