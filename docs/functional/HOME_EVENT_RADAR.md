# Home Event Radar

> **Specification status:** This document records the current implementation and its history.
> The proposed target product requirements are defined in
> [Home Event Radar — Functional Requirements Document](./HOME_EVENT_RADAR_FRD.md), with delivery
> work packages and launch gates in
> [Home Event Radar — Comprehensive Implementation Plan](./HOME_EVENT_RADAR_IMPLEMENTATION_PLAN.md).

## Overview

Home Event Radar is the unified live-signal ingestion layer for events that may matter to a homeowner's property — weather, insurance market shifts, utility outages, tax reassessments, air quality alerts, and similar signals. The system stores canonical radar events, runs a deterministic rules-based matching engine against property characteristics, and delivers a personalized feed with actionable recommendations.

**Architecture (updated 2026-07-10):** `RadarEvent` is the raw ingestion layer — every provider, once integrated, writes into it. High-impact matches are **promoted into `Incident`**, which owns the actionable lifecycle (severity scoring, acknowledgment, auto-resolution, archival, guidance-journey creation) rather than duplicating that machinery on `RadarEvent`. See [RadarEvent → Incident Promotion Bridge](#radarevent--incident-promotion-bridge) below. This decision was made because `Incident` already had a mature lifecycle and was the only thing that automatically created `GuidanceJourney` records; `RadarEvent`/`PropertyRadarMatch` had neither.

Important current-state clarification:
- The user-facing Home Event Radar page does not call external providers directly.
- The frontend reads property-scoped matches from CtC backend APIs.
- Canonical `RadarEvent` rows must already exist in the database before the feature can show anything.
- As of this update, canonical events come from: (1) the manual/internal ingest API, (2) the worker-based fixture flow (QA/E2E only, **disabled in production**, see [Incident History](#incident-history-dummy-data-in-production-2026-07-10)), (3) the real tax-reassessment provider integration, and (4) real NWS alert and Open-Meteo freeze-forecast adapters.
- NWS alerts and property-scoped freeze forecasts now enter the canonical `RadarEvent` pipeline. They no longer write directly to `Incident` or `GuidanceJourney`; those projections belong to downstream matching and promotion.

---

## Feature Goals

- Notify homeowners of events that materially affect their property before they self-discover the issue.
- Score impact severity based on actual property characteristics (roof age, HVAC type, foundation, location).
- Surface recommended actions per event with priority levels.
- Track user engagement state (new → seen → saved → dismissed → acted on).
- Provide an analytics audit trail for all interactions.
- **Promote high-impact signals into the actionable `Incident` + `GuidanceJourney` lifecycle** so users are proactively routed to resolution, not just shown a feed.

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

The master record for each unique radar signal. A `RadarEvent` is not inherently property-scoped. It can represent:
- one exact property (`locationType = property`)
- a ZIP-level signal
- a city-level signal
- a state-level signal

Events are deduplicated via `dedupeKey` to prevent ingesting the same signal twice from the same source/identity.

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

Created by the matching engine for each `(property, radar event)` pair that meets the location and relevance criteria. This is the record the UI actually renders in the homeowner feed and the canonical idempotency authority used by `RadarIncidentPromotionService`.

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

#### `TaxAssessorDataSource` — Tax Assessor Jurisdiction Config (new)

Admin-managed per-county/municipal open-data config, mirroring `PermitDataSource`'s shape (same reused `PermitDataSourceStatus`/`PermitDataSourceAdapter`/`PermitDataSourceCoverageType` enums) but kept as a separate table so permit and tax-assessor jurisdiction coverage can be configured independently.

| Column | Type | Notes |
|---|---|---|
| `id` | String (uuid) | PK |
| `name` | String | Display name |
| `slug` | String (unique) | |
| `status` | `PermitDataSourceStatus` | ACTIVE / INACTIVE / ERROR / RATE_LIMITED |
| `adapterType` | `PermitDataSourceAdapter` | SOCRATA / ACCELA / CUSTOM (only SOCRATA implemented so far) |
| `baseUrl` | String | |
| `datasetId` | String? | |
| `apiKeyEnvVar` | String? | Env var name holding the API key, if required |
| `coverageType` | `PermitDataSourceCoverageType` | CITY / COUNTY / STATE |
| `normalizedCoverageKey` | String (unique) | e.g. `US-NJ-princeton` — same normalization scheme as the permit pipeline |
| `fieldMappingJson` | Json | Source field → canonical field mapping |
| `queryFilterJson` | Json? | Optional extra SoQL filter |
| `lastFetchAt` / `lastFetchError` / `totalAssessmentsFetched` | | Fetch bookkeeping |

**No rows are seeded by default.** At least one real pilot jurisdiction must be configured before `ingestTaxAssessmentEventsJob` will fetch anything — see [Real Provider Ingestion](#real-provider-ingestion).

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

### Related Model: `Incident` (Promotion Target — Separate Feature)

`Incident` is documented in full elsewhere (`apps/backend/src/services/incidents/incident.service.ts`), but the fields relevant to the promotion bridge:

| Column | Type | Notes |
|---|---|---|
| `sourceType` | `IncidentSourceType` | Now includes `RADAR_EVENT` (added this update) — set when an incident originates from a promoted `RadarEvent` match |
| `typeKey` | String | For radar-promoted incidents: `` `RADAR_${eventType.toUpperCase()}` ``, e.g. `RADAR_TAX_REASSESSMENT` |
| `propertyRadarMatchId` | String? | Unique canonical bridge identity; exactly one Incident may be linked to a property match |
| `fingerprint` | String | For Radar promotion: `` `property:${propertyId}\|RADAR_MATCH:${propertyRadarMatchId}` `` |
| `severity` | `IncidentSeverity` | Eligible `moderate` → `WARNING`; eligible `high` → `CRITICAL`; explicit low-confidence matches remain awareness-only |

`Incident` has the full actionable lifecycle (severity scoring, acknowledgment, auto-resolution, archival, dedup) and is the *only* model that automatically creates a `GuidanceJourney` (via `bridgeIncidentToGuidance`). `RadarEvent`/`PropertyRadarMatch` do not.

---

## Canonical Event Model vs Property Feed Model

This distinction is important for implementation, QA, and future provider integrations.

### Canonical layer

Table:
- `radar_events`

Purpose:
- Store one shared radar signal once.
- Represent the source event independent of any single property.
- Preserve source metadata, dedupe identity, and scope.

Examples:
- One `zip`-scoped hail event for `08536` (QA fixture)
- One `property`-scoped real tax reassessment record for a specific home

### Property-scoped layer

Table:
- `property_radar_matches`

Purpose:
- Materialize how one canonical signal applies to one specific property.
- Store property-aware impact assessment, recommended actions, and matched systems.
- Drive the actual homeowner feed and detail view.

Implication:
- Creating a canonical `RadarEvent` is necessary, but not sufficient.
- A usable homeowner experience requires the matching step to create `PropertyRadarMatch` rows.

### Per-user interaction layer

Tables:
- `property_radar_states`
- `property_radar_actions`

Purpose:
- Track what a specific user has done with a match.
- These tables do not determine whether an event exists. They only track engagement after matching.

### Promoted/actionable layer (new)

Table:
- `incidents` (see [RadarEvent → Incident Promotion Bridge](#radarevent--incident-promotion-bridge))

Purpose:
- For `moderate`/`high` impact matches only, materialize an `Incident` with full lifecycle tracking and automatically bridge to a `GuidanceJourney`.
- `none`/`watch` impact matches stay visible only in the raw Home Event Radar feed — they are never promoted.

---

## RadarEvent → Incident Promotion Bridge

Implemented in `apps/backend/src/modules/homeEventRadar/services/radarIncidentPromotion.service.ts`;
the matcher delegates to it after every property-match evaluation.

### Why

Before this change, `RadarEvent` matching only wrote `PropertyRadarMatch` and published `Signal` rows (`RISK_SPIKE`/`COST_ANOMALY` via `signalService.publishRadarEventSignals`) — it never created a `GuidanceJourney`. Only `Incident` (via `IncidentService.upsertIncident` → `bridgeIncidentToGuidance`) could do that. Rather than rebuild `Incident`'s dedup/severity/lifecycle machinery on top of `RadarEvent`, high-impact matches are now promoted into `Incident`, reusing that machinery as-is.

### How it works

In `runMatchingForEvent()`, immediately after impact is computed and `PropertyRadarMatch` is
upserted, the matcher delegates the event, match, and durable revision context:

```ts
await radarIncidentPromotionService.project({
  propertyId: property.id,
  event,
  match,
  revision,
});
```

The dedicated service:

- looks up the unique `propertyRadarMatchId` linkage before projecting;
- calls `IncidentService.upsertIncident(...)` for eligible moderate/high active matches;
- updates the linked open Incident instead of creating another identity;
- calls `IncidentService.setStatus` for resolution, retraction, expiration, or impact downgrade;
- refuses to reopen terminal Incidents from delayed queue work;
- preserves event, revision, source, provider, match, and correlation provenance;
- propagates failures so BullMQ retries the isolated property scope.

Promotion writes:

- `sourceType: 'RADAR_EVENT'`
- `typeKey`: `` `RADAR_${eventType.toUpperCase()}` ``
- `category`: the uppercased `eventType`
- `propertyRadarMatchId`: the unique canonical bridge link
- `severity`: impact plus explicit confidence
- `fingerprint`: `` `property:${propertyId}|RADAR_MATCH:${propertyRadarMatchId}` ``
- bounded normalized provenance in `details` and `scoreBreakdown`

`mapIncidentTypeToGuidance()` (`incident.service.ts`) was extended with a branch matching `typeKey.includes('TAX_REASSESSMENT')` → `signalIntentFamily: 'tax_reassessment'`, `issueDomain: 'FINANCIAL'`, `sourceToolKey: 'incidents'`. A generic `RADAR_`-prefix convention is used so future domains (utility, insurance) can add their own branches the same way.

Guidance remains Incident-owned. `IncidentService` uses one explicit `incident:<incidentId>` signal
dedupe key; Radar matching and provider jobs do not call Guidance. Resolution through
`IncidentService.setStatus` archives that signal and its active journey.

---

## Real Provider Ingestion

### Tax Reassessment (first real integration — added this update)

Property tax reassessment data, fetched from county Socrata open-data portals — the first non-dummy data source for Home Event Radar. Mirrors the existing permit-adapter pipeline's jurisdiction-config pattern.

**Data flow:**
```text
TaxAssessorDataSource (jurisdiction config, per county)
        ↓
socrataTaxAdapter.fetchAssessments()  — HTTP + pagination + 429 backoff
        ↓
RawTaxAssessmentRecord[]
        ↓
normalizeTaxAssessmentRecord()  — assessed-value change % drives severity tiering
        ↓
CanonicalRadarSignal (eventType: 'tax_reassessment', sourceType: 'tax_assessor_feed')
        ↓
upsertCanonicalRadarEvent()  — shared helper, also used by the dummy job
        ↓
radar_events
        ↓
runMatchingForEvent(...)
        ↓
property_radar_matches  (+ Incident promotion if moderate/high impact)
```

**Files:**

| File | Purpose |
|---|---|
| `apps/backend/src/services/taxAssessorAdapters/taxAssessmentTypes.ts` | Shared types (`TaxAssessorDataSourceConfig`, `PropertyAddress`, `RawTaxAssessmentRecord`) |
| `apps/backend/src/services/taxAssessorAdapters/socrataTaxAdapter.ts` | Socrata HTTP client — address-filtered SoQL query, pagination, 429 backoff/retry |
| `apps/backend/src/services/taxAssessmentFetch.service.ts` | Per-property jurisdiction routing (`normalizedCoverageKey` lookup); skips properties with no configured jurisdiction; logs and skips (does not abort the batch) on a single jurisdiction's fetch failure |
| `apps/workers/src/radar/normalizeTaxAssessment.ts` | Raw Socrata row → `CanonicalRadarSignal`; severity tiers by assessed-value change % (`≥15%` → high, `≥5%` → medium, else low) |
| `apps/workers/src/radar/upsertCanonicalRadarEvent.ts` | Shared `RadarEvent` upsert helper (extracted from the dummy job so both paths share one implementation) |
| `apps/workers/src/jobs/ingestTaxAssessmentEvents.job.ts` | Cron job: paginates all properties (`iterateAllProperties`), fetches + normalizes + upserts + triggers matching per jurisdiction-matched property |

**Cron registration:** `tax-assessment-ingest` in `workerJobRegistry.ts` (category `RISK_SAFETY`), wired into `CRON_HANDLERS` in `worker.ts`. Weekly, Mondays 6:00 AM (county tax rolls update infrequently). Override via `TAX_ASSESSMENT_INGEST_CRON` env var, following the same `CRON_ENV_OVERRIDES` pattern as other adjustable jobs.

**Guidance journey:** new `tax_reassessment_resolution` journey template — see [Guidance Journey Integration](#guidance-journey-integration).

**Setup required before this fetches anything:** at least one real `TaxAssessorDataSource` row must be configured (real Socrata `baseUrl`/`datasetId`/`fieldMappingJson` for a specific county). No rows are seeded by default. This is a rollout prerequisite, not a code gap.

**Tests:** `apps/workers/tests/unit/normalizeTaxAssessment.test.js` (pure-function coverage of severity tiering, dedupe key, summary formatting — run via `node --test`).

---

### Dummy Ingest (QA/E2E only)

Home Event Radar has a worker-based dummy ingest path for QA and end-to-end testing.

**⚠️ Must never be enabled in production** — see [Incident History](#incident-history-dummy-data-in-production-2026-07-10). A startup guardrail now enforces this (see below).

Relevant files:

| File | Purpose |
|---|---|
| `apps/workers/src/jobs/ingestRadarSignals.job.ts` | Selects target properties, generates dummy raw signals, upserts canonical events, triggers matching |
| `apps/workers/src/radar/dummyRadar.client.ts` | Loads JSON fixtures and renders provider-like raw signals |
| `apps/workers/src/radar/normalize.ts` | Maps raw dummy signals into canonical `RadarEvent` shape |
| `apps/workers/src/radar/upsertCanonicalRadarEvent.ts` | Shared upsert helper (also used by the real tax job) |
| `apps/workers/src/radar/radar.types.ts` | Raw/canonical/dummy fixture types |
| `apps/workers/src/radar/fixtures/propertyScopedSignals.json` | Property-scoped QA fixtures |
| `apps/workers/src/radar/fixtures/zipScopedSignals.json` | ZIP-scoped QA fixtures |
| `apps/workers/src/worker.ts` | Cron registration, optional startup run, **production guardrail** |
| `infrastructure/kubernetes/apps/workers/deployment.yaml` | Worker env defaults for dummy ingest — **all three dummy-ingest flags now `"false"`** |

### Worker data flow (dummy)

```text
ZIP or property fixture JSON
        ↓
dummyRadar.client.ts
        ↓
DummyRadarRawSignal
        ↓
normalize.ts
        ↓
CanonicalRadarSignal
        ↓
upsertCanonicalRadarEvent()  (shared helper)
        ↓
radar_events
        ↓
runMatchingForEvent(...)
        ↓
property_radar_matches  (+ Incident promotion if moderate/high impact)
        ↓
frontend feed
```

### Production guardrail (new)

`apps/workers/src/worker.ts` now fails fast at startup if `NODE_ENV=production` and any of `RADAR_DUMMY_INGEST_ENABLED` / `HOME_RISK_REPLAY_DUMMY_INGEST_ENABLED` / `NEIGHBORHOOD_DUMMY_INGEST_ENABLED` is `"true"` — logs a clear error and throws before scheduling any cron jobs, rather than relying solely on manifest review. See [Incident History](#incident-history-dummy-data-in-production-2026-07-10) for why this was added.

### Fixture sets

Two fixture modes exist:

- `property_scoped` — one canonical dummy event per target property; safest for isolated single-home QA.
- `zip_scoped` — one canonical dummy event per ZIP + fixture type; best for realistic E2E testing across multiple homes in the same ZIP.

### Worker environment variables

| Env var | Purpose | Current behavior |
|---|---|---|
| `RADAR_DUMMY_INGEST_ENABLED` | Enables scheduled dummy ingest | **`"false"` in prod manifest** (was accidentally `"true"` — see Incident History) |
| `RADAR_DUMMY_INGEST_CRON` | Cron schedule | Default `*/30 * * * *` |
| `RADAR_DUMMY_INGEST_RUN_ON_STARTUP` | Runs one ingest on worker startup | `"false"` in prod manifest |
| `RADAR_DUMMY_FIXTURE_SET` | `property_scoped` or `zip_scoped` | Default `zip_scoped` |
| `RADAR_DUMMY_TARGET_ZIPS` | ZIP list for ZIP-mode targeting | Default `08536,10019` |
| `RADAR_DUMMY_TARGET_PROPERTY_IDS` | Explicit property allowlist | Overrides ZIP discovery when set |
| `RADAR_DUMMY_MAX_PROPERTIES` | Optional cap for selected properties | Unset = no cap |
| `TAX_ASSESSMENT_INGEST_CRON` | Override for the real tax job's cron schedule | Default `0 6 * * 1` (weekly, Mon 6am) |

### E2E testing notes

For reliable E2E on a **non-production** environment:
- prefer `zip_scoped` fixtures
- point `RADAR_DUMMY_TARGET_ZIPS` at shared QA ZIPs
- leave `RADAR_DUMMY_MAX_PROPERTIES` unset unless you intentionally want a sample
- verify both `radar_events` and `property_radar_matches`
- **verify `zipCode` on any QA/seed property actually matches its displayed address** — a mismatch here was the proximate cause of the production incident (a property displaying a Peoria, IL address had a `zipCode` matching the QA target ZIP list, causing it to receive fixture data). Check with a query like:
  ```sql
  SELECT id, address, city, state, "zipCode" FROM properties
  WHERE "zipCode" IN ('08536', '10019');
  ```

---

## Incident History: Dummy Data in Production (2026-07-10)

**What happened:** `RADAR_DUMMY_INGEST_ENABLED`, `HOME_RISK_REPLAY_DUMMY_INGEST_ENABLED`, and `NEIGHBORHOOD_DUMMY_INGEST_ENABLED` were all set to `"true"` in the production Kubernetes deployment manifest (`infrastructure/kubernetes/apps/workers/deployment.yaml`), with `RUN_ON_STARTUP` also `"true"`. This meant the QA/E2E dummy ingest job ran every 30 minutes in production, seeding synthetic fixture events (`"Test hail activity near ZIP 08536"`, etc.) into `radar_events`, `home_risk_events`, and `neighborhood_events`, which were then surfaced to real users as if they were live signals — 952 fake radar events, 19,128 property matches, 1,428 fake home-risk events, and 12 fake neighborhood events had accumulated by the time this was caught.

A contributing data-quality factor: at least one real property had a `zipCode` column value matching the QA target ZIP list (`08536`/`10019`) despite displaying a different address, causing it to be incidentally matched into the dummy job's target set.

**Root cause of the underlying UX bug:** the `flood_risk` (and sibling weather-family) guidance journey step was mapped to `toolKey: 'home-event-radar'` in `guidanceTemplateRegistry.ts`, but Home Event Radar had (and still has, aside from tax reassessment) no real data source — the guidance CTA was showing dummy data instead of the real NWS-based flood alert, which was actually tracked via `Incident` (a completely separate, disconnected pipeline).

**Fixes applied:**
1. All three dummy-ingest flags set to `"false"` in the production manifest; `RUN_ON_STARTUP` flags also `"false"`.
2. All seeded fixture data deleted from production (`radar_events`, `property_radar_matches`, `signals`, `home_risk_events`, `home_risk_replay_event_matches`, `neighborhood_events` and its child tables).
3. Weather-family guidance journeys (`freeze_risk`, `flood_risk`, `hurricane_risk`, `wind_risk`, `heat_risk`, `wildfire_risk`) repointed from `home-event-radar` to `incidents`, since `Incident` has the real data. Existing (already-created) journeys were backfilled via a targeted SQL `UPDATE`.
4. A startup guardrail was added (see [Production guardrail](#production-guardrail-new)) so this class of misconfiguration fails fast instead of silently redeploying.
5. As a longer-term fix (this update), the architecture was changed so `RadarEvent` promotes into `Incident` for high-impact matches, and a real data source (tax reassessment) was built — see [RadarEvent → Incident Promotion Bridge](#radarevent--incident-promotion-bridge) and [Real Provider Ingestion](#real-provider-ingestion).

`energy_inefficiency_detected`/`high_utility_cost` guidance families still point at `home-event-radar` and were **not** fixed in this pass — no verified real data source exists for them yet (candidate: repoint to `home-savings`, which has genuinely real, live account-tracking data, but the fit for `energy_inefficiency_detected` specifically is weaker than for `high_utility_cost`). This remains open.

---

## Guidance Journey Integration

### `tax_reassessment_resolution` (new)

Signal family `tax_reassessment` (`issueDomain: FINANCIAL`), created automatically when a tax-reassessment `RadarEvent` match is promoted to `Incident` (see above). Three steps, reusing existing tool keys — no new tools were built:

| Step | Tool | Route |
|---|---|---|
| 1. `review_assessment` | `incidents` | `/dashboard/properties/:propertyId?tab=incidents` |
| 2. `prepare_appeal` | `true-cost` | `/dashboard/properties/:propertyId/tools/true-cost` |
| 3. `update_budget` | `guidance-overview` | `/dashboard/properties/:propertyId/tools/guidance-overview` |

Registered in `guidanceTemplateRegistry.ts` (`journeyTypeKey: 'tax_reassessment_resolution'`) with matching entries added to `guidanceSignalResolver.service.ts`'s five lookup maps and to `TOOL_DEFAULT_STEP_KEY`/`JOURNEY_TOOL_STEP_KEY` (the `'incidents'` and `'true-cost'` tool keys are shared with other journeys under different step keys, so journey-scoped overrides were required to disambiguate).

### `weather_risk_resolution` (routing corrected this update)

Existing journey (`freeze_risk`, `flood_risk`, `hurricane_risk`, `wind_risk`, `heat_risk`, `wildfire_risk`) — step 1 (`weather_safety_check`) now routes to `toolKey: 'incidents'` instead of `'home-event-radar'`, since the real NWS weather data lives in `Incident`, not `RadarEvent`. See [Incident History](#incident-history-dummy-data-in-production-2026-07-10) for why.

### `energy_efficiency_resolution` (unchanged, known gap)

Still routes step 1 to `toolKey: 'home-event-radar'`. This is a known, currently-unfixed gap — Home Event Radar has no real utility/energy data source (see [Pending Phases](#pending-phases)).

---

## Backend

### Files

| File | Purpose |
|---|---|
| `backend/src/routes/homeEventRadar.routes.ts` | Express route definitions, middleware chains |
| `backend/src/controllers/homeEventRadar.controller.ts` | Request/response handling |
| `backend/src/services/homeEventRadar.service.ts` | Business logic, Prisma queries |
| `backend/src/services/homeEventRadarMatcher.service.ts` | Matching engine + impact computation + dedicated bridge delegation |
| `backend/src/modules/homeEventRadar/services/radarIncidentPromotion.service.ts` | Unique match-linked Incident create/update/close projection |
| `backend/src/services/incidents/incident.service.ts` | `IncidentService.upsertIncident` (promotion target), `mapIncidentTypeToGuidance` (extended for `RADAR_`-prefixed typeKeys) |
| `backend/src/services/taxAssessorAdapters/` | Real tax-assessor provider adapter (new) |
| `backend/src/services/taxAssessmentFetch.service.ts` | Jurisdiction routing for tax ingestion (new) |
| `backend/src/validators/homeEventRadar.validators.ts` | Zod v4 input validation schemas |
| `backend/src/index.ts` | Route mounting |

---

### API Endpoints

All endpoints require `Authorization: Bearer <token>` JWT. Property-scoped endpoints additionally require property-level authorization via `propertyAuth.middleware`.

#### Admin / Ingestion

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/radar/events` | Create or upsert a canonical `RadarEvent` by `dedupeKey` |
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
- **`listFeedForProperty(propertyId, userId, params)`** — Returns a cursor-paginated feed of `RadarFeedItem` objects. Joins match data with the requesting user's state.
- **`getMatchDetail(propertyId, matchId, userId)`** — Returns the full `RadarMatchDetail` including impact factors, recommended actions, matched systems, and the canonical event record. Automatically transitions state from `new` → `seen` on fetch.
- **`updateMatchState(propertyId, matchId, userId, state, meta?)`** — Updates `PropertyRadarState`. Logs a `PropertyRadarAction` record for the transition.
- **`trackEvent(propertyId, userId, payload)`** — Appends an audit log entry for analytics instrumentation.

#### `HomeEventRadarMatcherService` (`homeEventRadarMatcher.service.ts`)

Rules-based matching and impact computation engine, **now also the Incident promotion trigger point**:

**Location Matching Strategies:**
- `property` — Exact property ID match
- `zip` — Zip code match against property address
- `city` — Case-insensitive city name match
- `state` — Case-insensitive state code match
- `county` / `polygon` — Placeholder only, not implemented in the current matcher

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

| Score | Impact Level | Promoted to Incident? |
|---|---|---|
| < 0.25 | none | No |
| < 0.45 | watch | No |
| < 0.65 | moderate | **Yes** |
| ≥ 0.65 | high | **Yes** |

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
| `computeTaxEvent()` | tax_reassessment / tax_rate_change | Assessment history — **its 3 recommended actions (`REVIEW_ASSESSMENT`/`PREPARE_APPEAL`/`UPDATE_BUDGET`) are what the new `tax_reassessment_resolution` guidance journey's 3 steps mirror** |
| `computeGeneric()` | other / fallback | Severity-only scoring |

**Match Output Fields:**
- `matchScore` — Float, 4 decimal places
- `impactLevel` — none / watch / moderate / high
- `impactSummary` — Human-readable one-liner
- `impactFactorsJson` — Array of `{ code: string, effect: 'increase' | 'decrease' | 'neutral', description: string }`
- `recommendedActionsJson` — Array of `{ code: string, label: string, priority: 'high' | 'medium' | 'low' }`
- `matchedSystemsJson` — Array of `{ type: string, relevance: 'high' | 'medium' | 'low' }`

**Promotion service:** `RadarIncidentPromotionService.project(...)` — see [RadarEvent → Incident Promotion Bridge](#radarevent--incident-promotion-bridge).

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

No frontend changes were needed for the promotion bridge or tax integration — by design, new signal sources flow through the existing canonical `RadarEvent` + `PropertyRadarMatch` contract, so `RadarFeedItem`/`RadarMatchDetail` stayed stable. The only frontend changes this update were in the **guidance** layer (`guidanceDisplay.ts`, `GuidanceStepPageClient.tsx`, `ScopedWorkspaceGuidanceStep.tsx`) to add the `'incidents'` tool key — see [Guidance Journey Integration](#guidance-journey-integration).

---

### Main Page (`home-event-radar/page.tsx`)

**Route:** `/dashboard/home-event-radar?propertyId=<id>`

Property resolution:
- The page expects a property context.
- The explicit `propertyId` query param is the safest way to open the screen for testing and deep links.
- The property-scoped tool route redirects into the main page with `propertyId` in the URL.

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
Manual import / backend ingest API / dummy worker ingest (QA only) / real tax-assessment job
        │
        ▼
Canonical RadarEvent created or updated
        │
        ▼
Matching triggered
        │
        ▼
HomeEventRadarMatcherService.triggerMatching()
  ├─ Queries all eligible properties (by locationType + locationKey)
  ├─ Runs per-event-type impact computer for each property
  ├─ Computes matchScore, impactLevel, impactSummary, impactFactors,
  │   recommendedActions, matchedSystems
  ├─ Upserts PropertyRadarMatch records
  └─ Projects through the unique match-linked Incident bridge
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
| **Background workers** | QA/E2E fixture ingestion is disabled in production; real tax-assessment, NWS alert, and Open-Meteo freeze-forecast adapters exist; utility and insurance sources do not |
| **Incident lifecycle** | Eligible `moderate`/`high` matches project through `RadarIncidentPromotionService`; terminal events and impact downgrades reconcile via `IncidentService.setStatus` |
| **Guidance engine** | `tax_reassessment_resolution` journey auto-created on promotion; weather-family journeys route to `Incidents`, not Home Event Radar |
| **Audit log** | Analytics events written to platform audit log via `AuditLog` model |
| **Dashboard widget** | `MobileDashboardHome.tsx` queries radar feed to show new/active event counts on the home screen |

---

## Current Limitations

- Three real external source paths exist: tax reassessment (requires configured jurisdictions), NWS alerts, and Open-Meteo freeze forecasts.
- Durable canonical ingestion and revision-driven matching are implemented for NWS, freeze, and test fixtures. Exact property, normalized ZIP, city/state, county FIPS, state, point/radius, and Polygon/MultiPolygon scopes are matched through resumable pages with independently retryable property jobs. Spatial matching uses the canonical property point and indexed PostGIS queries.
- No utility outage or insurance market real data source exists (insurance: not even a viable candidate provider identified yet — see Pending Phases).
- `county` and `polygon` matching are not implemented.
- The dummy ingest path is QA/E2E only, now disabled in production and guardrailed against re-enabling.
- Real-time guarantees do not exist in the current architecture; freshness depends on when canonical events are ingested (tax reassessment: weekly cron).
- `energy_inefficiency_detected`/`high_utility_cost` guidance families still point at the (mostly dataless) Home Event Radar tool — known gap, not yet fixed.

---

## Pending Phases

Tracked from the "unified live-signal surface" initiative (2026-07-10). Phase 1 (promotion bridge + tax reassessment) is **done** — everything below is what's left.

### Phase 2 — Weather convergence (provider adapters and durable processing complete)

`severeWeatherAlertsJob` and `freezeRiskIncidentsJob` now enqueue only canonical radar observations
through the durable ingest consumer.
NWS preserves CAP identity and polygon evidence; freeze forecasts use stable property-scoped identity
and resolve only after a successful warm forecast. The durable match consumer validates each
event revision, scans candidates in bounded resumable pages, and retries each property scope
independently. Property-scoped freeze events and NWS Polygon/MultiPolygon alerts can now populate
the Radar feed through exact property or indexed spatial matching. HER-205 now resolves or retracts referenced
NWS identities, expires authoritative end times, gates stale cleanup behind a fully successful
fetch, and retains terminal matches in a 72-hour Recently Ended feed group. Provider failures never
imply resolution. HER-206 now supplies an exact-count weather acceptance matrix covering provider
updates, replay, supersession, resolution, empty/failure semantics, and the complete freeze
lifecycle. The Incident bridge now carries authoritative revision-scoped weather signals so the
existing Incident evaluator can activate eligible notifications. HER-300 indexed geospatial
matching is complete; HER-301's pure impact-rule refactor is the next delivery slice.

### Phase 3 — Utility outage integration (blocked on a provider/budget decision)

No single national utility outage API exists. Real options: a paid aggregator (e.g. PowerOutage.us) or per-utility-territory scraping scoped to wherever the actual user base lives. Needs a business decision before any code gets written — not just an engineering task.

### Insurance market integration (deferred indefinitely)

No real data source exists today. "Insurance Trend" (a separate, already-shipped tool) is a heuristic/computed estimate, not live market data — its own DTO is explicitly labeled `EDUCATIONAL_ESTIMATE` and disclaims that it's *"not derived from live DOI rate filings, FEMA/NOAA actuarial data, or your actual policy records."* There's a dead adapter stub (`insuranceRateFiling.adapter.ts`) that explicitly doesn't call any real API yet — building it out would mean per-state DOI bulletin ingestion (inconsistent formats, mostly PDF filings, no uniform API), the least reliable of any candidate integration. Not scheduled.

### `energy_inefficiency_detected` / `high_utility_cost` tool mapping (open, small)

Both still point at `home-event-radar`. `high_utility_cost` has a clear better fit (`home-savings` — genuinely real, live account-tracking data). `energy_inefficiency_detected`'s fit there is weaker (system/appliance inefficiency vs. bill tracking) — needs its own decision, not a forced repoint.

### Reusable pattern for future providers

The tax-reassessment integration establishes the template for anything that follows:
1. New `<Domain>DataSource`-style Prisma model if jurisdiction/provider config is needed (mirror `TaxAssessorDataSource`/`PermitDataSource`).
2. Adapter(s) under `apps/backend/src/services/<domain>Adapters/` — reuse the Socrata HTTP/pagination/backoff shape if applicable.
3. Fetch/routing service under `apps/backend/src/services/`.
4. Normalizer under `apps/workers/src/radar/normalize<Domain>.ts` → `CanonicalRadarSignal` (check `RadarEventType`/`RadarSourceType` enums first — several domains' values already exist unused).
5. Job under `apps/workers/src/jobs/ingest<Domain>Events.job.ts`, reusing `upsertCanonicalRadarEvent` + `runMatchingForEvent`.
6. Register via `workerJobRegistry.ts` + `CRON_HANDLERS` in `worker.ts` (**not** the ad-hoc `cron.schedule()` block style the dummy jobs use).
7. **Add matching `COPY`/`sed` entries in `infrastructure/docker/workers/Dockerfile`** — the workers image build uses a manually curated backend-file copy list; new backend imports silently fail the Docker build (not local `tsc`) if this step is skipped. Bitten by this twice in this project already.
8. If the impact should be user-actionable, add a `mapIncidentTypeToGuidance` branch (`RADAR_`-prefixed typeKey convention already established) and a guidance journey template reusing existing tool keys where possible.

---

## File Index

### Backend

| Path | Role |
|---|---|
| `apps/backend/src/routes/homeEventRadar.routes.ts` | Route definitions + middleware |
| `apps/backend/src/controllers/homeEventRadar.controller.ts` | Request handlers |
| `apps/backend/src/services/homeEventRadar.service.ts` | Business logic + Prisma queries |
| `apps/backend/src/services/homeEventRadarMatcher.service.ts` | Matching engine + impact computers + Incident bridge delegation |
| `apps/backend/src/modules/homeEventRadar/services/radarIncidentPromotion.service.ts` | Unique match-linked Incident projection and lifecycle reconciliation |
| `apps/backend/src/services/incidents/incident.service.ts` | `IncidentService.upsertIncident`, `mapIncidentTypeToGuidance` (promotion target) |
| `apps/backend/src/services/taxAssessorAdapters/taxAssessmentTypes.ts` | Shared tax-ingestion types |
| `apps/backend/src/services/taxAssessorAdapters/socrataTaxAdapter.ts` | Socrata tax-assessor HTTP client |
| `apps/backend/src/services/taxAssessmentFetch.service.ts` | Per-property jurisdiction routing |
| `apps/backend/src/services/guidanceEngine/guidanceSignalResolver.service.ts` | Signal family → tool/step lookup maps (`tax_reassessment` added) |
| `apps/backend/src/services/guidanceEngine/guidanceTemplateRegistry.ts` | Journey templates (`tax_reassessment_resolution` added; `weather_risk_resolution` step 1 repointed) |
| `apps/backend/src/config/workerJobRegistry.ts` | `tax-assessment-ingest` cron entry |
| `apps/backend/src/validators/homeEventRadar.validators.ts` | Zod v4 input schemas |
| `apps/backend/prisma/schema.prisma` | DB models and enums (`TaxAssessorDataSource`, `IncidentSourceType.RADAR_EVENT` added) |

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
| `apps/frontend/src/features/guidance/utils/guidanceDisplay.ts` | `'incidents'` tool key route + guided-flow set (added) |
| `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/guidance/step/GuidanceStepPageClient.tsx` | `'incidents'` in `LIVE_WORKSPACE_BRIDGE_TOOL_KEYS` (added) |
| `apps/frontend/src/components/guidance/ScopedWorkspaceGuidanceStep.tsx` | `'incidents'` workspace-bridge copy (added) |

### Workers

| Path | Role |
|---|---|
| `apps/workers/src/jobs/ingestRadarSignals.job.ts` | Dummy radar ingest runner (QA/E2E only, disabled in prod) |
| `apps/workers/src/jobs/ingestTaxAssessmentEvents.job.ts` | Real tax-reassessment ingest runner (new) |
| `apps/workers/src/radar/dummyRadar.client.ts` | JSON fixture loader and raw signal generator |
| `apps/workers/src/radar/normalize.ts` | Dummy raw signal → canonical radar event mapper |
| `apps/workers/src/radar/normalizeTaxAssessment.ts` | Real tax record → canonical radar event mapper (new) |
| `apps/workers/src/radar/upsertCanonicalRadarEvent.ts` | Shared `RadarEvent` upsert helper (extracted, used by both jobs) |
| `apps/workers/src/radar/radar.types.ts` | Worker radar types |
| `apps/workers/src/radar/fixtures/propertyScopedSignals.json` | Property-scoped QA fixtures |
| `apps/workers/src/radar/fixtures/zipScopedSignals.json` | ZIP-scoped QA fixtures |
| `apps/workers/src/lib/paginateProperties.ts` | Cursor-paginated all-properties iterator (extended with `address` field for tax job) |
| `apps/workers/src/worker.ts` | Cron/startup registration + **production dummy-ingest guardrail** |
| `apps/workers/tests/unit/normalizeTaxAssessment.test.js` | Unit tests for the tax normalizer (new) |
| `apps/workers/prisma/schema.prisma` | Synced mirror of backend Prisma schema |
| `infrastructure/docker/workers/Dockerfile` | Worker image wiring — curated backend-file copy list, extended for tax-assessment files |
| `infrastructure/kubernetes/apps/workers/deployment.yaml` | Worker runtime env configuration — dummy-ingest flags now `"false"` |
