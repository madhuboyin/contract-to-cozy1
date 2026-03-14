# Home Event Radar

## Overview

Home Event Radar is a real-time event monitoring and property-matching feature that surfaces external events — weather, insurance market shifts, utility outages, tax changes, air quality alerts — and evaluates how each event specifically impacts a homeowner's property. The system ingests canonical event records, runs a deterministic rules-based matching engine against property characteristics, and delivers a personalized, prioritized feed with actionable recommendations.

---

## Feature Goals

- Notify homeowners of events that materially affect their property before they self-discover the issue.
- Score impact severity based on actual property characteristics (roof age, HVAC type, foundation, location).
- Surface recommended actions per event with priority levels.
- Track user engagement state (new → seen → saved → dismissed → acted on).
- Provide an analytics audit trail for all interactions.

---

## Database

### Enums

```prisma
enum RadarEventType {
  weather
  insurance_market
  utility_outage
  utility_rate_change
  tax_reassessment
  tax_rate_change
  air_quality
  wildfire_smoke
  flood_risk
  heat_wave
  freeze
  hail
  heavy_rain
  wind
  power_surge_risk
  nearby_construction
  other
}

enum RadarSourceType {
  weather_provider
  insurance_market_feed
  utility_feed
  tax_assessor_feed
  internal_derived
  manual_import
}

enum RadarSeverity {
  info
  low
  medium
  high
  critical
}

enum RadarLocationType {
  property
  zip
  city
  county
  state
  polygon
}

enum RadarEventStatus {
  active
  resolved
  archived
}

enum RadarUserState {
  new
  seen
  saved
  dismissed
  acted_on
}

enum RadarImpactLevel {
  none
  watch
  moderate
  high
}

enum RadarActionType {
  open_event
  expand_details
  view_recommendation
  save_event
  dismiss_event
  mark_checked
  open_related_system
  open_related_tool
  share
}
```

### Models

#### `RadarEvent` — Canonical External Event

The master record for each unique external event. Events are deduplicated via `dedupeKey` to prevent ingesting the same event twice from different sources.

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `eventType` | `RadarEventType` | Category of event |
| `eventSubType` | String? | Optional subcategory |
| `title` | String | Short display title |
| `summary` | String | Detailed description |
| `sourceType` | `RadarSourceType` | Origin of the data |
| `sourceRef` | String? | External ID or URL |
| `severity` | `RadarSeverity` | info / low / medium / high / critical |
| `startAt` | DateTime | Event effective start |
| `endAt` | DateTime? | Event effective end (nullable for open-ended events) |
| `locationType` | `RadarLocationType` | Scoping strategy for matching |
| `locationKey` | String? | Value for the location scope (zip code, city name, state code, etc.) |
| `geoJson` | Json? | Optional GeoJSON polygon for geographic matching |
| `payloadJson` | Json? | Raw source payload |
| `dedupeKey` | String (unique) | Prevents duplicate ingest |
| `status` | `RadarEventStatus` | active / resolved / archived |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

**Indexes:** `eventType + startAt`, `sourceType`, `severity`, `status`, `locationType + locationKey`

---

#### `PropertyRadarMatch` — Property-Specific Match Record

Created by the matching engine for each (property, event) pair that meets the location and relevance criteria.

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `propertyId` | String | FK → Property |
| `radarEventId` | String | FK → RadarEvent |
| `matchScore` | Decimal(5,4) | 0.0000–1.0000, 4 decimal precision |
| `impactLevel` | `RadarImpactLevel` | none / watch / moderate / high |
| `impactSummary` | String | Human-readable impact summary |
| `impactFactorsJson` | Json | Array of `{ code, effect, description }` |
| `recommendedActionsJson` | Json | Array of `{ code, label, priority }` |
| `matchedSystemsJson` | Json | Array of `{ type, relevance }` |
| `isVisible` | Boolean | Controls feed visibility |
| `visibleFrom` | DateTime? | Earliest display time |
| `visibleUntil` | DateTime? | Latest display time |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

**Unique constraint:** `propertyId + radarEventId`
**Indexes:** `propertyId`, `radarEventId`, `impactLevel`, `isVisible + visibleFrom`, `createdAt`

---

#### `PropertyRadarState` — Per-User Interaction State

Tracks each user's lifecycle state for a given match (supports multi-user households).

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `propertyRadarMatchId` | String | FK → PropertyRadarMatch |
| `userId` | String | FK → User |
| `state` | `RadarUserState` | new / seen / saved / dismissed / acted_on |
| `stateMetaJson` | Json? | Arbitrary metadata per state transition |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

**Unique constraint:** `propertyRadarMatchId + userId`
**Indexes:** `propertyRadarMatchId`, `state`, `updatedAt`

---

#### `PropertyRadarAction` — Post-Open Action Log

Append-only log of every UI interaction a user takes on a match. Used for analytics and future personalization.

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `propertyRadarMatchId` | String | FK → PropertyRadarMatch |
| `actionType` | `RadarActionType` | Type of interaction |
| `actionMetaJson` | Json? | Contextual metadata |
| `createdAt` | DateTime | |

**Indexes:** `propertyRadarMatchId`, `actionType`, `createdAt`

---

### Related Model: `HomeEvent` (Property Timeline — Separate Feature)

The `HomeEvent` model serves the property maintenance timeline and is a distinct concept from Event Radar. Both share the `/api/home-events` route prefix but serve different purposes.

| Key Fields | Notes |
|---|---|
| `eventType` | PURCHASE, DOCUMENT, REPAIR, MAINTENANCE, CLAIM, IMPROVEMENT, VALUE_UPDATE, INSPECTION, NOTE, MILESTONE, OTHER |
| `importance` | LOW, NORMAL, HIGH, HIGHLIGHT |
| `visibility` | PRIVATE, HOUSEHOLD, SHARE_LINK, RESALE_PACK |
| Links | InventoryRoom, InventoryItem, Claim, Expense, Document |

---

## Backend

### Files

| File | Purpose |
|---|---|
| `backend/src/routes/homeEventRadar.routes.ts` | Express route definitions, middleware chains |
| `backend/src/controllers/homeEventRadar.controller.ts` | Request/response handling |
| `backend/src/services/homeEventRadar.service.ts` | Business logic, Prisma queries |
| `backend/src/services/homeEventRadarMatcher.service.ts` | Matching engine + impact computation |
| `backend/src/validators/homeEventRadar.validators.ts` | Zod v4 input validation schemas |

---

### API Endpoints

All endpoints require `Authorization: Bearer <token>` JWT. Property-scoped endpoints additionally require property-level authorization via `propertyAuth.middleware`.

#### Admin / Ingestion

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/radar/events` | Create or upsert a canonical radar event by `dedupeKey` |
| `POST` | `/api/radar/events/:eventId/match` | Manually re-trigger property matching for an event |
| `GET` | `/api/radar/events/:eventId` | Fetch a canonical radar event by ID |

#### Property Feed (User-Facing)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/properties/:propertyId/radar/feed` | Paginated event feed for a property |
| `GET` | `/api/properties/:propertyId/radar/matches/:matchId` | Full match detail (auto-marks as `seen`) |
| `PATCH` | `/api/properties/:propertyId/radar/matches/:matchId/state` | Update user interaction state |
| `POST` | `/api/properties/:propertyId/radar/analytics-events` | Log analytics/usage event to audit log |

#### Feed Query Parameters (`GET /feed`)

| Param | Type | Default | Notes |
|---|---|---|---|
| `limit` | number | 40 | 1–100 |
| `cursor` | string | — | Cursor for next page |
| `severity` | string[] | — | Filter by one or more severity levels |
| `includeResolved` | boolean | false | Include events where `status = resolved` |

---

### Service Layer

#### `HomeEventRadarService` (`homeEventRadar.service.ts`)

Core business logic class:

- **`upsertRadarEvent(data)`** — Creates or updates a `RadarEvent` using `dedupeKey` as the idempotency key. Preserves the original title/summary if the event already exists (does not overwrite core identity fields).
- **`triggerMatching(eventId)`** — Delegates to `HomeEventRadarMatcherService` to create/update `PropertyRadarMatch` records for all eligible properties.
- **`listFeedForProperty(propertyId, userId, params)`** — Returns a cursor-paginated feed of `RadarFeedItem` objects. Joins match data with the requesting user's state. Applies visibility window filtering.
- **`getMatchDetail(propertyId, matchId, userId)`** — Returns the full `RadarMatchDetail` including impact factors, recommended actions, matched systems, and the canonical event record. Automatically transitions state from `new` → `seen` on fetch.
- **`updateMatchState(propertyId, matchId, userId, state, meta?)`** — Updates `PropertyRadarState`. Logs a `PropertyRadarAction` record for the transition.
- **`trackEvent(propertyId, userId, payload)`** — Appends an audit log entry for analytics instrumentation.

#### `HomeEventRadarMatcherService` (`homeEventRadarMatcher.service.ts`)

Rules-based matching and impact computation engine:

**Location Matching Strategies:**
- `property` — Exact property ID match
- `zip` — Zip code match against property address
- `city` — Case-insensitive city name match
- `state` — Case-insensitive state code match
- `county` / `polygon` — Not yet implemented

**Score Calculation:**

Base scores by severity:

| Severity | Base Score |
|---|---|
| info | 0.15 |
| low | 0.25 |
| medium | 0.45 |
| high | 0.65 |
| critical | 0.85 |

Scores are adjusted up/down based on property characteristics. Final score is clamped to [0, 1] at 4 decimal places.

**Impact Level Thresholds:**

| Score | Impact Level |
|---|---|
| < 0.25 | none |
| < 0.45 | watch |
| < 0.65 | moderate |
| ≥ 0.65 | high |

**Per-Event-Type Impact Computers:**

| Function | Event Type | Key Property Signals |
|---|---|---|
| `computeWeatherHail()` | hail | Roof age, roof material |
| `computeWeatherFreeze()` | freeze | Pipe insulation, irrigation type, HVAC type |
| `computeWeatherHeatWave()` | heat_wave | AC presence, HVAC age |
| `computeWeatherWind()` | wind | Roof age, structural vulnerability |
| `computeWeatherFloodRain()` | heavy_rain / flood_risk | Drainage, foundation type |
| `computeAirQualitySmoke()` | air_quality / wildfire_smoke | HVAC filter age, air purifier presence |
| `computePowerSurgeRisk()` | power_surge_risk | Surge protector presence, electrical panel age |
| `computeInsuranceMarket()` | insurance_market | Coverage type, premium history |
| `computeUtilityOutage()` | utility_outage | Heating fuel type, backup generator presence |
| `computeUtilityRateChange()` | utility_rate_change | Utility providers, usage patterns |
| `computeTaxEvent()` | tax_reassessment / tax_rate_change | Assessment history |
| `computeGeneric()` | other / fallback | Severity-only scoring |

**Match Output Fields:**
- `matchScore` — Float, 4 decimal places
- `impactLevel` — none / watch / moderate / high
- `impactSummary` — Human-readable one-liner
- `impactFactorsJson` — Array of `{ code: string, effect: 'increase' | 'decrease' | 'neutral', description: string }`
- `recommendedActionsJson` — Array of `{ code: string, label: string, priority: 'high' | 'medium' | 'low' }`
- `matchedSystemsJson` — Array of `{ type: string, relevance: 'high' | 'medium' | 'low' }`

---

### Validators (`homeEventRadar.validators.ts`)

Zod v4 schemas applied as Express middleware via `validateBody()`:

| Schema | Used By |
|---|---|
| `UpsertRadarEventSchema` | `POST /radar/events` |
| `TriggerMatchingSchema` | `POST /radar/events/:eventId/match` |
| `ListRadarFeedSchema` | `GET /feed` (query params) |
| `UpdateRadarMatchStateSchema` | `PATCH .../state` |
| `TrackHomeEventRadarEventSchema` | `POST .../analytics-events` |

---

## Frontend

### Files

| File | Purpose |
|---|---|
| `frontend/src/app/(dashboard)/dashboard/home-event-radar/page.tsx` | Main feature page |
| `frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-event-radar/page.tsx` | Property-scoped tool entry (redirects to main page with `propertyId`) |
| `frontend/src/components/features/homeEventRadar/RadarDetailSheet.tsx` | Bottom sheet for full match detail |
| `frontend/src/components/features/homeEventRadar/RadarFeedItem.tsx` | Individual feed card component |
| `frontend/src/components/features/homeEventRadar/RadarFeedSkeleton.tsx` | Animated skeleton loading states |
| `frontend/src/components/features/homeEventRadar/RadarUtils.ts` | Pure UI helper functions and label/color maps |
| `frontend/src/lib/api/client.ts` | API client methods (`getRadarFeed`, `getRadarMatchDetail`, `updateRadarMatchState`, `trackHomeEventRadarEvent`) |
| `frontend/src/types/index.ts` | TypeScript interfaces (lines ~2200–2278) |

---

### Main Page (`home-event-radar/page.tsx`)

**Route:** `/dashboard/home-event-radar?propertyId=<id>`

**Layout (mobile-first):**
1. Hero section with feature title and description
2. Horizontal filter chip row: All / Weather / Insurance / Utility / Tax
3. Scrollable event feed with cursor-based pagination
4. "Dismissed events" collapsible banner
5. `RadarDetailSheet` — opens on card tap

**Filter → Event Type Mapping:**

| Filter | Event Types |
|---|---|
| Weather | hail, freeze, heat_wave, wind, heavy_rain, flood_risk, air_quality, wildfire_smoke, power_surge_risk, nearby_construction, weather |
| Insurance | insurance_market |
| Utility | utility_outage, utility_rate_change |
| Tax | tax_reassessment, tax_rate_change |

**State Management:**
- TanStack React Query v5 for server state (5min stale, 10min cache)
- Optimistic UI via local state overrides for instant state transitions before server confirmation

**Analytics Events (Page-level):**

| Event | Trigger |
|---|---|
| `OPENED` | Page load (once per session) |
| `FEED_VIEWED` | On data fetch success (includes event count bucket) |
| `FEED_ERROR` | On network error |
| `FILTER_APPLIED` | On filter chip selection change |

---

### Detail Sheet (`RadarDetailSheet.tsx`)

Bottom sheet UI displaying full match detail:

**Sections:**
1. Event icon, title, date range (startAt – endAt)
2. Severity / event type / impact level badges
3. Impact summary box (color-coded by impact level)
4. **Why it matters** — impact drivers from `impactFactorsJson`
5. **Affected home systems** — from `matchedSystemsJson`, color-coded by relevance
6. **Recommended actions** — from `recommendedActionsJson`, with priority labels
7. State action buttons: **Save**, **Mark Done**, **Dismiss**

**Analytics Events (Detail-level):**

| Event | Trigger |
|---|---|
| `EVENT_OPENED` | On detail load (once per unique match) |
| `ACTIONS_VIEWED` | When actions are present in detail |
| `STATE_CHANGED` | On save / dismiss / mark done |
| `ERROR` | On mutation failure |

---

### Feed Item (`RadarFeedItem.tsx`)

Card component displaying per-event summary:

- Event icon (emoji)
- Title (line-clamped to 2 lines)
- Date and chevron
- Chips: event type, severity, impact level
- State badges: **New** (if `state === 'new'`), **Saved** (if `state === 'saved'`)
- Impact summary preview (2 lines)

---

### Utility Helpers (`RadarUtils.ts`)

| Export | Purpose |
|---|---|
| `SEVERITY_LABELS` | Display labels for each severity |
| `SEVERITY_COLOR` | Tailwind CSS class map for severity chips |
| `SEVERITY_DOT` | Dot indicator colors |
| `IMPACT_LABELS` | Display labels for each impact level |
| `IMPACT_COLOR` | Tailwind CSS class map for impact level badges |
| `formatEventType(type)` | Human-readable event type label |
| `eventTypeIcon(type)` | Emoji icon per event type |
| `formatSystemType(type)` | Human-readable home system name |
| `ACTION_PRIORITY_COLOR` | Color per action priority |
| `ACTION_PRIORITY_LABEL` | Label per action priority |
| `formatRadarDate(isoString)` | ISO date → locale date string |

**Event Type → Emoji:**

| Event Type | Icon |
|---|---|
| hail / freeze / heat_wave / wind / heavy_rain / flood_risk / weather | 🌤 |
| insurance_market | 🛡 |
| utility_outage / utility_rate_change | ⚡ |
| air_quality / wildfire_smoke | 💨 |
| tax_reassessment / tax_rate_change | 🏛 |
| power_surge_risk | ⚡ |
| nearby_construction | 🏗 |
| other | 📡 |

---

### API Client Methods (`client.ts`)

```typescript
// Get paginated event feed for a property
getRadarFeed(propertyId: string, params?: {
  limit?: number;
  cursor?: string;
  severity?: string[];
  includeResolved?: boolean;
}): Promise<{ items: RadarFeedItem[]; nextCursor?: string }>

// Get full match detail (auto-marks as seen)
getRadarMatchDetail(propertyId: string, matchId: string): Promise<RadarMatchDetail>

// Update user interaction state
updateRadarMatchState(
  propertyId: string,
  matchId: string,
  state: RadarUserState,
  stateMetaJson?: Record<string, unknown>
): Promise<void>

// Log an analytics event
trackHomeEventRadarEvent(
  propertyId: string,
  payload: { eventName: string; meta?: Record<string, unknown> }
): Promise<void>
```

---

### TypeScript Interfaces (`types/index.ts`)

```typescript
type RadarUserState = 'new' | 'seen' | 'saved' | 'dismissed' | 'acted_on'
type RadarSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical'
type RadarImpactLevel = 'none' | 'watch' | 'moderate' | 'high'

interface RadarFeedItem {
  propertyRadarMatchId: string
  radarEventId: string
  propertyId: string
  eventType: string
  eventSubType?: string
  title: string
  summary: string
  severity: RadarSeverity
  startAt: string
  endAt?: string
  impactLevel: RadarImpactLevel
  impactSummary: string
  isVisible: boolean
  state: RadarUserState
  createdAt: string
}

interface RadarRecommendedAction {
  code: string
  label: string
  priority: 'high' | 'medium' | 'low'
}

interface RadarImpactDriver {
  code: string
  effect: 'increase' | 'decrease' | 'neutral'
  description: string
}

interface RadarMatchedSystem {
  type: string
  relevance: 'high' | 'medium' | 'low'
}

interface RadarMatchDetail {
  propertyRadarMatchId: string
  radarEventId: string
  propertyId: string
  matchScore: number
  impactLevel: RadarImpactLevel
  impactSummary: string
  impactFactorsJson: RadarImpactDriver[]
  recommendedActionsJson: RadarRecommendedAction[]
  matchedSystemsJson: RadarMatchedSystem[]
  isVisible: boolean
  visibleFrom?: string
  visibleUntil?: string
  event: {
    id: string
    eventType: string
    eventSubType?: string
    title: string
    summary: string
    sourceType: string
    severity: RadarSeverity
    startAt: string
    endAt?: string
    locationType: string
    locationKey?: string
    status: string
  }
  state: RadarUserState
  stateMetaJson?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}
```

---

## Mobile Navigation

Home Event Radar is surfaced in the mobile navigation via the **Home Tools** panel. It appears as the **first entry** in `MOBILE_HOME_TOOL_LINKS`:

```typescript
{
  key: 'home-event-radar',
  name: 'Home Event Radar',
  description: 'Track current signals affecting your home',
  hrefSuffix: 'tools/home-event-radar',
  navTarget: 'tool:home-event-radar',
  icon: resolveToolIcon('home', 'home-event-radar'),
  isActive: (pathname) =>
    /^\/dashboard\/(properties\/[^/]+\/tools\/home-event-radar|home-event-radar)(\/|$)/.test(pathname),
}
```

**Source file:** `frontend/src/components/mobile/dashboard/mobileToolCatalog.ts`

**Nav group:** Listed under `MOBILE_HOME_TOOL_LINKS` (not the AI tool catalog `MOBILE_AI_TOOL_CATALOG`). These are property-centric operational tools distinct from the AI intelligence tools.

**Active state detection:** Matches both the property-scoped path (`/dashboard/properties/:id/tools/home-event-radar`) and the standalone main page path (`/dashboard/home-event-radar`).

**Dashboard widget (`MobileDashboardHome.tsx`):** The Mobile Dashboard Home page also queries the radar feed and surfaces a summary card linking to the radar page, showing new event count and active event count to drive discoverability from the home screen.

---

## Data Flow

```
External Feed / Manual Import
        │
        ▼
POST /api/radar/events (upsert by dedupeKey)
        │
        ▼
RadarEvent created/updated in DB
        │
        ▼
POST /api/radar/events/:id/match (async or triggered inline)
        │
        ▼
HomeEventRadarMatcherService.triggerMatching()
  ├─ Queries all eligible properties (by locationType + locationKey)
  ├─ Runs per-event-type impact computer for each property
  ├─ Computes matchScore, impactLevel, impactSummary, impactFactors,
  │   recommendedActions, matchedSystems
  └─ Upserts PropertyRadarMatch records
        │
        ▼
User opens /dashboard/home-event-radar?propertyId=<id>
        │
        ▼
GET /api/properties/:id/radar/feed (paginated, with severity/resolved filters)
        │
        ▼
RadarFeedItem[] rendered as cards (RadarFeedItem components)
        │
        ▼
User taps card → GET /api/properties/:id/radar/matches/:matchId
  └─ Auto-transitions state: new → seen
        │
        ▼
RadarDetailSheet opens with full detail
        │
        ▼
User interacts: Save / Mark Done / Dismiss
  └─ PATCH /api/properties/:id/radar/matches/:matchId/state
        │
        ▼
PropertyRadarState updated + PropertyRadarAction logged
```

---

## Integration Points

| Integration | Details |
|---|---|
| **Route mounting** | Both `homeEventRadar.routes` and `homeEvents.routes` are registered in `backend/src/index.ts` |
| **Auth** | All endpoints behind JWT middleware + `propertyAuth.middleware` for property-scoped routes |
| **Rate limiting** | `apiRateLimiter` applied to all endpoints |
| **Background workers** | No dedicated worker job at this time; matching is triggered inline on event upsert |
| **Audit log** | Analytics events written to platform audit log via `AuditLog` model |
| **Dashboard widget** | `MobileDashboardHome.tsx` queries radar feed to show new/active event counts on the home screen |

---

## File Index

### Backend

| Path | Role |
|---|---|
| `apps/backend/src/routes/homeEventRadar.routes.ts` | Route definitions + middleware |
| `apps/backend/src/controllers/homeEventRadar.controller.ts` | Request handlers |
| `apps/backend/src/services/homeEventRadar.service.ts` | Business logic + Prisma queries |
| `apps/backend/src/services/homeEventRadarMatcher.service.ts` | Matching engine + impact computers |
| `apps/backend/src/validators/homeEventRadar.validators.ts` | Zod v4 input schemas |
| `apps/backend/prisma/schema.prisma` | DB models and enums |

### Frontend

| Path | Role |
|---|---|
| `apps/frontend/src/app/(dashboard)/dashboard/home-event-radar/page.tsx` | Main feature page |
| `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-event-radar/page.tsx` | Property-scoped entry point |
| `apps/frontend/src/components/features/homeEventRadar/RadarDetailSheet.tsx` | Match detail bottom sheet |
| `apps/frontend/src/components/features/homeEventRadar/RadarFeedItem.tsx` | Feed card component |
| `apps/frontend/src/components/features/homeEventRadar/RadarFeedSkeleton.tsx` | Loading skeleton |
| `apps/frontend/src/components/features/homeEventRadar/RadarUtils.ts` | UI helpers, label/color maps |
| `apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts` | Mobile nav registration |
| `apps/frontend/src/app/(dashboard)/dashboard/components/MobileDashboardHome.tsx` | Dashboard widget |
| `apps/frontend/src/lib/api/client.ts` | Typed API client methods |
| `apps/frontend/src/types/index.ts` | TypeScript interfaces |
