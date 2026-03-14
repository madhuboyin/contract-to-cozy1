# Home Risk Replay

## Overview

Home Risk Replay is a property-scoped Home Tool that helps a homeowner answer:

- What has this home already been through?
- Which historical environmental events may have affected this property?
- Which home systems may have been stressed by those events?

It is intentionally distinct from Home Event Radar:

- Home Event Radar = current and recent signals
- Home Risk Replay = historical stress timeline

The feature is implemented as a full stack flow:

1. user opens the replay tool for a property
2. user selects a replay window
3. backend generates or reuses a replay run
4. canonical `HomeRiskEvent` records are matched to the property
5. explainable impact summaries are returned
6. the frontend renders a mobile-first summary, timeline, detail sheet, and replay history

## Product Scope

Home Risk Replay is currently an MVP with deterministic rules and no live provider ingest.

Current behavior:

- uses canonical `HomeRiskEvent` records already in the database
- supports worker-based dummy canonical event ingest for QA and end-to-end testing
- matches events to a property using pragmatic location rules
- computes explainable, property-aware impact heuristics
- persists replay runs and matched events
- exposes list, detail, generation, and analytics endpoints
- supports property-aware launch from Home Tools and contextual surfaces

Not included in the current implementation:

- live external risk provider integrations
- background jobs or async replay generation workers for replay execution itself
- geospatial infrastructure beyond location-key matching
- export/share flows
- warehouse/reporting dashboards

## Database Design

Home Risk Replay uses three primary Prisma models in [schema.prisma](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/prisma/schema.prisma).

### `HomeRiskEvent`

Canonical environmental or stress event that may affect one or many properties.

Table:

- `home_risk_events`

Purpose:

- stores normalized historical events that the replay engine can reuse across properties

Key fields:

- `id`
- `eventType`
- `eventSubType`
- `title`
- `summary`
- `severity`
- `startAt`
- `endAt`
- `locationType`
- `locationKey`
- `geoJson`
- `payloadJson`
- `dedupeKey`
- `createdAt`
- `updatedAt`

Indexes:

- `@@index([eventType, startAt])`
- `@@index([severity])`
- `@@index([locationType, locationKey])`

Relationships:

- one `HomeRiskEvent` can be linked to many `HomeRiskReplayEventMatch` rows

Important distinction:

- `HomeRiskEvent` is the canonical shared historical signal layer
- `HomeRiskReplayRun` and `HomeRiskReplayEventMatch` are generated property-specific replay artifacts
- the replay UI and replay generation endpoint do not create canonical `HomeRiskEvent` rows directly

### `HomeRiskReplayRun`

Snapshot of one generated replay for one property and one replay window.

Table:

- `home_risk_replay_runs`

Purpose:

- stores the generated replay summary, explainability payloads, property snapshot, and status

Key fields:

- `id`
- `propertyId`
- `windowType`
- `windowStart`
- `windowEnd`
- `status`
- `totalEvents`
- `highImpactEvents`
- `moderateImpactEvents`
- `summaryText`
- `summaryJson`
- `propertySnapshotJson`
- `engineVersion`
- `createdAt`
- `updatedAt`

Indexes:

- `@@index([propertyId, createdAt])`
- `@@index([status])`

Relationships:

- belongs to `Property`
- has many `HomeRiskReplayEventMatch` rows

### `HomeRiskReplayEventMatch`

Join row connecting one canonical event to one property within one replay run.

Table:

- `home_risk_replay_event_matches`

Purpose:

- persists property-specific scoring and explainability for each matched event

Key fields:

- `id`
- `homeRiskReplayRunId`
- `homeRiskEventId`
- `propertyId`
- `matchScore`
- `impactLevel`
- `impactSummary`
- `impactFactorsJson`
- `recommendedActionsJson`
- `matchedSystemsJson`
- `createdAt`
- `updatedAt`

Indexes and constraints:

- `@@unique([propertyId, homeRiskEventId, homeRiskReplayRunId])`
- `@@index([propertyId])`
- `@@index([homeRiskReplayRunId])`
- `@@index([homeRiskEventId])`
- `@@index([impactLevel])`

Relationships:

- belongs to `HomeRiskReplayRun`
- belongs to `HomeRiskEvent`
- belongs to `Property`

## Enums

The current replay-related enums live in [schema.prisma](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/prisma/schema.prisma).

### `HomeRiskEventType`

- `hail`
- `freeze`
- `heavy_rain`
- `flood_risk`
- `wind`
- `heat_wave`
- `wildfire_smoke`
- `air_quality`
- `power_outage`
- `power_surge_risk`
- `drought`
- `extreme_weather`
- `other`

### `HomeRiskEventSeverity`

- `info`
- `low`
- `moderate`
- `high`
- `severe`

This enum is used for both canonical event severity and replay match impact levels.

### `HomeRiskReplayStatus`

- `pending`
- `completed`
- `failed`

### `HomeRiskReplayWindowType`

- `since_built`
- `last_5_years`
- `custom_range`

## Backend Architecture

The backend implementation follows the existing CtC Express + service-layer pattern.

### Route Registration

Main route registration:

- [apps/backend/src/index.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/index.ts)

Mounted route group:

- `app.use('/api', homeRiskReplayRoutes);`

### Routes

Defined in:

- [apps/backend/src/routes/homeRiskReplay.routes.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/routes/homeRiskReplay.routes.ts)

Middleware pattern:

- `apiRateLimiter`
- `authenticate`
- `propertyAuthMiddleware`
- request validation via `validate` / `validateBody`

Endpoints:

- `POST /api/properties/:propertyId/risk-replay/runs`
- `GET /api/properties/:propertyId/risk-replay/runs`
- `GET /api/properties/:propertyId/risk-replay/runs/:replayRunId`
- `POST /api/properties/:propertyId/risk-replay/events`

### Controllers

Defined in:

- [apps/backend/src/controllers/homeRiskReplay.controller.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/controllers/homeRiskReplay.controller.ts)

Controller functions:

- `generateHomeRiskReplay`
- `listHomeRiskReplayRuns`
- `getHomeRiskReplayDetail`
- `trackHomeRiskReplayEvent`

Responsibilities:

- enforce authenticated access
- read `propertyId` and `replayRunId` params
- delegate to service layer
- normalize HTTP status codes and response shapes

### Validators

Defined in:

- [apps/backend/src/validators/homeRiskReplay.validators.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/validators/homeRiskReplay.validators.ts)

Important schemas:

- `generateHomeRiskReplayBodySchema`
- `listHomeRiskReplayRunsQuerySchema`
- `trackHomeRiskReplayEventBodySchema`
- `homeRiskReplayPropertyParamsSchema`
- `homeRiskReplayRunParamsSchema`

Validation rules:

- `windowType` must be one of `since_built`, `last_5_years`, `custom_range`
- `custom_range` requires both `windowStart` and `windowEnd`
- `windowStart` must be less than or equal to `windowEnd`
- `limit` is constrained to `1-50`
- analytics payload fields are length-limited and optional where appropriate

### Service Layer

Defined in:

- [apps/backend/src/services/homeRiskReplay.service.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/homeRiskReplay.service.ts)

Responsibilities:

- load and validate property context
- load canonical `HomeRiskEvent` candidates for the resolved replay window
- generate replay runs
- reuse prior completed runs when allowed
- list replay history
- fetch replay detail
- serialize DTOs for the frontend
- store analytics events in the standard CtC audit-log pattern

Primary service methods:

- `generateRun(...)`
- `listRuns(...)`
- `getRunDetail(...)`
- `trackEvent(...)`

Returned DTO families:

- compact run summaries for history views
- replay detail payload with `timelineEvents`
- explainability fields like `summaryJson`, `propertySnapshotJson`, `matchedSystems`, and `recommendedActions`

### Replay Engine

Defined in:

- [apps/backend/src/services/homeRiskReplay.engine.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/homeRiskReplay.engine.ts)

Current engine version:

- `home-risk-replay-mvp-v1`

Responsibilities:

- resolve replay windows
- build property context
- score event/property matching
- compute impact levels
- generate explainability payloads
- produce calm homeowner-facing summaries

Current matching and scoring behavior:

- supports `since_built`, `last_5_years`, and `custom_range`
- falls back safely when `yearBuilt` is missing
- uses current property fields and system context where available
- matches events by pragmatic location basis such as property, ZIP, city, county, state, and limited geo payload hints
- derives property-aware impact using deterministic heuristics

Current location matching details:

- `property` -> exact property ID
- `zip` -> exact ZIP match
- `city` -> city and city/state normalized variants
- `state` -> exact state match
- `county` -> currently limited because replay property context does not persist county for reliable matching
- `polygon` -> lightweight payload-based fallback using `payloadJson.zipCodes`, `payloadJson.zips`, or `payloadJson.states`

Example heuristics already encoded:

- hail -> roof sensitivity
- freeze -> plumbing and water-system sensitivity
- heavy rain / flood risk -> basement, drainage, and water exposure context
- heat wave -> HVAC sensitivity
- wind -> roof and exterior envelope context
- wildfire smoke / air quality -> calmer, lower structural-impact messaging
- power outage / surge -> electrical dependency and resilience context

### Backend Response Shape

The frontend currently consumes these replay-level fields:

- `id`
- `propertyId`
- `windowType`
- `windowStart`
- `windowEnd`
- `status`
- `totalEvents`
- `highImpactEvents`
- `moderateImpactEvents`
- `summaryText`
- `summaryJson`
- `propertySnapshotJson`
- `engineVersion`
- `timelineEvents`

Each timeline event currently includes:

- `id`
- `homeRiskEventId`
- `eventType`
- `eventSubType`
- `title`
- `summary`
- `severity`
- `startAt`
- `endAt`
- `matchScore`
- `impactLevel`
- `impactSummary`
- `impactFactorsJson`
- `recommendedActionsJson`
- `matchedSystemsJson`

## Frontend Architecture

The frontend implementation follows the existing Next.js app-router + React Query + shared component approach.

### Main Screen Route

Property-scoped route:

- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-risk-replay/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-risk-replay/page.tsx)

Rendered client:

- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-risk-replay/HomeRiskReplayClient.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-risk-replay/HomeRiskReplayClient.tsx)

Route shape:

- `/dashboard/properties/:propertyId/tools/home-risk-replay`

Supported query params:

- `runId`
- `windowType`
- `launchSurface`

### Frontend API Integration

Defined in:

- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-risk-replay/homeRiskReplayApi.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-risk-replay/homeRiskReplayApi.ts)

Primary functions:

- `listHomeRiskReplayRuns(propertyId, limit)`
- `getHomeRiskReplayDetail(propertyId, replayRunId)`
- `generateHomeRiskReplay(propertyId, input)`
- `trackHomeRiskReplayEvent(propertyId, payload)`

Launch surface values currently supported in the frontend type:

- `home_tools`
- `property_hub`
- `property_summary`
- `roof_page`
- `plumbing_page`
- `electrical_page`
- `insights_strip`
- `system_detail`
- `unknown`

### Frontend Types

Defined in:

- [apps/frontend/src/components/features/homeRiskReplay/types.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/features/homeRiskReplay/types.ts)

Important type groups:

- replay window, severity, and status types
- replay summary JSON types
- property snapshot JSON types
- timeline event types
- impact driver, matched system, and recommended action types
- replay detail and run summary types

### Shared UI Components

Home Risk Replay feature components:

- [apps/frontend/src/components/features/homeRiskReplay/ReplayUtils.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/features/homeRiskReplay/ReplayUtils.tsx)
- [apps/frontend/src/components/features/homeRiskReplay/ReplayTimelineItem.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/features/homeRiskReplay/ReplayTimelineItem.tsx)
- [apps/frontend/src/components/features/homeRiskReplay/ReplayDetailSheet.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/features/homeRiskReplay/ReplayDetailSheet.tsx)

Responsibilities:

- timeline rendering
- status/severity formatting
- matched system and recommended-action display
- bottom-sheet style event detail rendering
- mobile-friendly fallbacks for sparse data

### UI Guardrails and Robustness Helpers

Defined in:

- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-risk-replay/homeRiskReplayUi.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-risk-replay/homeRiskReplayUi.ts)

Responsibilities:

- replay form validation
- user-friendly error mapping
- trust and certainty guardrail messaging
- location-match note formatting

Tests:

- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-risk-replay/__tests__/homeRiskReplayUi.test.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-risk-replay/__tests__/homeRiskReplayUi.test.ts)

### Screen Composition

The main replay screen currently includes:

1. compact intro block
2. property context strip
3. replay controls
4. replay summary card
5. historical timeline
6. prior replay runs section
7. loading, empty, and error states

The current detail experience uses a mobile-friendly event detail sheet rather than a separate standalone page.

## Workers and Canonical Event Ingest

Home Risk Replay now has a worker-based canonical event ingest path for QA and future provider-style ingestion.

This follows the same short-term CtC workers pattern used elsewhere:

- worker uses Prisma directly against the shared database
- worker writes canonical events into `home_risk_events`
- replay generation remains an on-demand backend flow when the user opens the feature

Important current-state clarification:

- the worker does **not** generate replay runs
- the worker only creates or updates canonical `HomeRiskEvent` records
- replay runs are still created only when a user generates a replay

### Worker Files

- [apps/workers/src/jobs/ingestHomeRiskEvents.job.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/workers/src/jobs/ingestHomeRiskEvents.job.ts)
- [apps/workers/src/homeRiskReplay/dummyHomeRiskEvent.client.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/workers/src/homeRiskReplay/dummyHomeRiskEvent.client.ts)
- [apps/workers/src/homeRiskReplay/normalize.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/workers/src/homeRiskReplay/normalize.ts)
- [apps/workers/src/homeRiskReplay/homeRiskReplay.types.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/workers/src/homeRiskReplay/homeRiskReplay.types.ts)
- [apps/workers/src/homeRiskReplay/fixtures/propertyScopedEvents.json](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/workers/src/homeRiskReplay/fixtures/propertyScopedEvents.json)
- [apps/workers/src/homeRiskReplay/fixtures/zipScopedEvents.json](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/workers/src/homeRiskReplay/fixtures/zipScopedEvents.json)
- [apps/workers/src/worker.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/workers/src/worker.ts)
- [infrastructure/kubernetes/apps/workers/deployment.yaml](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/infrastructure/kubernetes/apps/workers/deployment.yaml)

### Worker Data Flow

```text
provider-like fixture JSON
        ↓
dummyHomeRiskEvent.client.ts
        ↓
DummyHomeRiskRawSignal
        ↓
normalize.ts
        ↓
CanonicalHomeRiskEventSignal
        ↓
upsert into home_risk_events
        ↓
user generates replay
        ↓
home_risk_replay_runs + home_risk_replay_event_matches
```

### Fixture Modes

Two fixture sets are currently supported:

- `property_scoped`
  - one canonical historical event per target property
  - best for isolated single-property QA

- `zip_scoped`
  - one canonical historical event per ZIP + event type
  - best for realistic end-to-end testing across several properties in the same area

Current default QA ZIPs:

- `08536`
- `10019`

### Worker Environment Variables

| Env var | Purpose | Current default |
|---|---|---|
| `HOME_RISK_REPLAY_DUMMY_INGEST_ENABLED` | Enables worker-based canonical event ingest | `false` |
| `HOME_RISK_REPLAY_DUMMY_INGEST_CRON` | Cron schedule for ingest | `15 */6 * * *` |
| `HOME_RISK_REPLAY_DUMMY_INGEST_RUN_ON_STARTUP` | Runs one ingest pass when worker starts | `false` |
| `HOME_RISK_REPLAY_DUMMY_FIXTURE_SET` | `property_scoped` or `zip_scoped` | `zip_scoped` |
| `HOME_RISK_REPLAY_DUMMY_TARGET_ZIPS` | ZIP allowlist for ZIP-mode seeding | `08536,10019` |
| `HOME_RISK_REPLAY_DUMMY_TARGET_PROPERTY_IDS` | Explicit property allowlist | unset |
| `HOME_RISK_REPLAY_DUMMY_MAX_PROPERTIES` | Optional target-property cap | unset |

## Future-Proof E2E Testing

Home Risk Replay now supports a future-proof E2E path similar to Home Event Radar, with one important difference:

- Radar seeds canonical events and property matches
- Replay seeds canonical events only, then the user-generated replay step creates the property-specific snapshot

### Recommended E2E Flow

1. enable worker dummy ingest
2. ingest canonical `HomeRiskEvent` records into `home_risk_events`
3. open the property-scoped Home Risk Replay screen
4. generate a replay for that property and window
5. verify replay run + event matches in DB
6. verify summary, timeline, detail sheet, and replay history in the UI

### Best QA Configuration

Recommended settings:

- `HOME_RISK_REPLAY_DUMMY_INGEST_ENABLED=true`
- `HOME_RISK_REPLAY_DUMMY_INGEST_RUN_ON_STARTUP=true`
- `HOME_RISK_REPLAY_DUMMY_FIXTURE_SET=zip_scoped`
- `HOME_RISK_REPLAY_DUMMY_TARGET_ZIPS=08536,10019`

For retesting after new seeds:

- generate with `forceRegenerate=true`

This matters because the replay service may reuse a prior completed replay for the same property/window if regeneration is not forced.

### Best Canonical Event Scopes for QA

Most reliable scopes:

- `property`
- `zip`
- `city`
- `state`
- `polygon` only when using payload-based ZIP/state hints

Least reliable today:

- `county`

because replay property context does not currently store county in a way the MVP engine can consistently use.

### DB Tables To Check

Before generating replay:

- `home_risk_events`

After generating replay:

- `home_risk_replay_runs`
- `home_risk_replay_event_matches`

### Why This Is Future-Proof

This setup exercises the same conceptual production flow we want long term:

- provider-style raw signals
- worker/cron ingest
- normalization into canonical shared history
- on-demand user replay generation
- property-specific replay outputs

That means the fixture-based ingest can later be swapped for real providers without rewriting the replay UI contract.

## What Changes When We Integrate External Providers

This section describes the intended production evolution from dummy historical signals to real provider-backed ingest.

### Target production flow

The target production flow remains:

```text
provider / feeds
        ↓
worker / cron ingest
        ↓
normalize to canonical HomeRiskEvent
        ↓
upsert into home_risk_events
        ↓
user generates replay
        ↓
home_risk_replay_runs + home_risk_replay_event_matches
```

The important principle is:

- providers feed the canonical `home_risk_events` layer
- replay generation remains on-demand and property-scoped
- the UI should not fetch historical providers directly

### 1. Replace dummy fixture clients with provider clients

Current worker input:

- JSON fixtures rendered by `dummyHomeRiskEvent.client.ts`

Future worker input:

- provider clients for weather, air quality, outage history, flood/rain history, smoke history, or other historical datasets

Likely future worker file layout:

- `apps/workers/src/homeRiskReplay/providers/weatherArchive.client.ts`
- `apps/workers/src/homeRiskReplay/providers/airQualityArchive.client.ts`
- `apps/workers/src/homeRiskReplay/providers/utilityHistory.client.ts`
- `apps/workers/src/homeRiskReplay/providers/floodHistory.client.ts`

Each provider client should be responsible for:

- provider authentication
- pagination and checkpointing
- rate-limit handling
- retries and backoff
- returning provider-specific raw payloads

### 2. Introduce provider-specific raw signal types

Current worker types:

- `DummyHomeRiskRawSignal`
- `CanonicalHomeRiskEventSignal`

When integrating real providers, we should keep the canonical signal type but add provider-specific raw types such as:

- `ProviderWeatherArchiveSignal`
- `ProviderAirQualitySignal`
- `ProviderUtilityHistorySignal`
- `ProviderFloodHistorySignal`

Then normalize each provider-specific type into a shared internal replay raw signal shape before converting to canonical `HomeRiskEvent`.

This keeps provider quirks isolated from replay generation and frontend contracts.

### 3. Keep normalization as the contract boundary

Today, `normalize.ts` maps fixture-driven raw signals into canonical `HomeRiskEvent` fields:

- `eventType`
- `eventSubType`
- `title`
- `summary`
- `severity`
- `startAt`
- `endAt`
- `locationType`
- `locationKey`
- `geoJson`
- `payloadJson`
- `dedupeKey`

That normalization layer should remain the main contract boundary even after real providers are added.

Why this matters:

- the replay engine only needs canonical `HomeRiskEvent` rows
- frontend DTOs do not need to change
- provider migrations stay behind the worker ingest layer

### 4. Strengthen dedupe rules

Current dummy ingest uses deterministic QA-oriented `dedupeKey` values based on:

- provider-like source
- geography
- event type
- event start date

Real providers will need stricter dedupe rules, typically based on one of:

- `provider + providerEventId`
- `provider + normalized event family + normalized geography + normalized time window`

This is important so that:

- repeated ingest updates mutate the same canonical event
- replay history remains stable
- reprocessing doesn’t create event explosions

### 5. Improve provenance inside payloadJson

Current dummy payloads are seed-oriented.

Real provider payloads should preserve provenance such as:

- provider name
- provider event ID
- provider publish/update timestamp
- source confidence or quality flags if available
- raw region identifiers
- ingest batch or sync run ID

Recommended approach:

- keep raw provider metadata in `payloadJson`
- keep canonical UI fields small and stable
- avoid exposing raw provider blobs directly to the UI

### 6. Expand geography support

Current replay matching supports:

- property
- zip
- city
- state
- limited polygon payload hints

Current weak area:

- county is not reliable because property context does not currently persist county in a durable MVP-friendly way

Future provider integrations will likely require:

- first-class county support once property data includes county cleanly
- better polygon support using actual spatial libraries instead of payload hints
- stronger location provenance so the UI can distinguish:
  - exact property-level history
  - ZIP/city/state inferred history
  - polygon-based historical exposure

### 7. Decide whether workers stay DB-direct or move to backend ingest APIs

Current short-term pattern:

- workers write directly with Prisma into `home_risk_events`

This matches the existing CtC worker style and is acceptable while the feature is evolving.

Longer-term options:

- Keep DB-direct worker ingest
  - Pros: simple, fewer moving parts
  - Cons: backend and worker business rules can drift over time

- Move to backend-owned ingest APIs
  - Worker would call an internal replay-event ingest endpoint
  - Backend would own validation, normalization guardrails, and canonical upsert rules
  - Pros: one source of truth for ingest policy
  - Cons: requires service auth and backend URL wiring

Recommendation:

- short term: keep DB-direct worker ingest
- longer term: consider backend-owned ingest endpoints once real providers are stable

### 8. Add internal auth if worker-to-backend APIs are introduced

If we later move from direct Prisma writes to internal backend APIs, we will need:

- internal backend base URL envs
- machine/service credentials
- internal authorization policy for replay-event ingest

This is not needed in the current implementation because workers write directly to the shared database.

### 9. Add provider scheduling and checkpoints

Current scheduling is simple cron plus optional startup execution.

Real provider integration will need more robust scheduling concerns:

- per-provider cron cadence
- last successful sync checkpoint
- replay/backfill windows
- partial retry behavior
- manual re-run support for bad sync windows

Recommended future additions:

- provider-specific env vars or config rows
- checkpoint persistence
- batch-level logging and metrics

### 10. Add ingest observability

Current dummy ingest logs are sufficient for QA.

Real providers need stronger observability:

- ingest success/failure counts
- rows upserted
- rows skipped
- dedupe hit rates
- provider error counts
- last successful sync timestamps
- alerting when historical feeds fail repeatedly

This should be added at the worker/job level, not in the user-facing replay screen.

### 11. Preserve the frontend and replay-generation contract

The goal of provider integration should be:

- no major change to Home Risk Replay UI contracts
- no major change to replay generation API shapes
- no provider-specific branches in the frontend

The canonical `HomeRiskEvent` layer is what makes this possible.

As long as provider ingest continues to normalize into canonical events correctly:

- the replay engine can stay focused on matching/scoring
- the frontend can stay focused on summary/timeline/detail rendering
- QA can continue using the same end-to-end flow

### 12. Keep future E2E testing aligned with production

Even after real providers are introduced, fixture-driven worker ingest should remain available for QA.

Why:

- deterministic tests
- no external dependency flakiness
- easier staging validation
- safer regression testing for replay generation and timeline rendering

So the long-term expectation is:

- real providers for production/staging data
- retained fixture-based ingest path for deterministic E2E testing

## Mobile Navigation and Entry Points

Home Risk Replay is wired into the shared Home Tools catalog and property-scoped launch flows.

### Shared Home Tool Catalog

Defined in:

- [apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts)

Current catalog entry:

- `key`: `home-risk-replay`
- `name`: `Home Risk Replay`
- `description`: `See what your home has already been through`
- `hrefSuffix`: `tools/home-risk-replay?launchSurface=home_tools`
- `navTarget`: `tool:home-risk-replay`

This shared catalog entry feeds both desktop and mobile tool access points.

### Home Tools Screen

Defined in:

- [apps/frontend/src/app/(dashboard)/dashboard/home-tools/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/home-tools/page.tsx)

Placement:

- group: `History + Replay`
- group summary: `See what your home has already been through`

Behavior:

- if a property is already selected, the tool opens directly on that property
- if no property is selected, the user is sent through the standard property selection flow

### Property Selection Hand-off

Defined in:

- [apps/frontend/src/app/(dashboard)/dashboard/properties/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/page.tsx)

Behavior:

- property selection supports `navTarget`
- `tool:home-risk-replay` resolves through `MOBILE_HOME_TOOL_LINKS`
- the selected property then opens `/dashboard/properties/:id/tools/home-risk-replay`
- the tool-specific `hrefSuffix` is preserved, including query params like `launchSurface=home_tools`

### Dashboard Layout Navigation

Defined in:

- [apps/frontend/src/app/(dashboard)/layout.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/layout.tsx)

Behavior:

- the dashboard shell reuses `MOBILE_HOME_TOOL_LINKS`
- this keeps Home Risk Replay in the shared nav ecosystem instead of a one-off route

### Property Page Home Tools Rail

Defined in:

- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/HomeToolsRail.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/HomeToolsRail.tsx)

Behavior:

- desktop shows Home Tools as pill buttons
- mobile shows Home Tools inside a bottom sheet
- both variants include the Home Risk Replay entry using the shared tool config

### Property Hub Entry Point

Defined in:

- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/page.tsx)

Behavior:

- property hub shows a compact Home Risk Replay card
- CTA text:
  - `Replay home history` when no prior run exists
  - `View replay` when a prior run exists
- if a replay exists, the latest replay summary is surfaced with event counts and summary text
- launches pass:
  - `propertyId`
  - `runId` when available
  - `launchSurface=property_hub`

### System Detail Entry Point

Defined in:

- [apps/frontend/src/app/(dashboard)/dashboard/components/inventory/InventoryItemDrawer.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/components/inventory/InventoryItemDrawer.tsx)

Behavior:

- system detail drawer includes a contextual `Replay history` CTA
- CTA launches Home Risk Replay using:
  - `propertyId`
  - inferred `windowType`
  - `launchSurface=system_detail`
- analytics also record `linked_system_type` for the contextual launch

This is currently the main contextual system-level launch surface for the feature.

### Route Builder Helper

Defined in:

- [apps/frontend/src/lib/routes/homeRiskReplay.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/lib/routes/homeRiskReplay.ts)

Helper:

- `buildHomeRiskReplayHref(...)`

Supported params:

- `propertyId`
- `runId`
- `windowType`
- `launchSurface`

## Replay Generation Flow

Current backend and frontend flow:

1. frontend opens the property-scoped replay page
2. frontend loads property context and replay history
3. user chooses:
   - `since_built`
   - `last_5_years`
   - `custom_range`
4. frontend validates custom range input
5. frontend calls `POST /api/properties/:propertyId/risk-replay/runs`
6. backend resolves the replay window
7. backend loads candidate `HomeRiskEvent` rows
8. backend runs deterministic matching and impact scoring
9. backend persists:
   - `HomeRiskReplayRun`
   - `HomeRiskReplayEventMatch`
10. backend returns structured replay detail
11. frontend updates the summary, timeline, and replay history

## Explainability Payloads

The MVP intentionally stores explainability as JSON instead of over-modeling it.

Replay-level explainability:

- `summaryJson`
- `propertySnapshotJson`
- `engineVersion`

Event-level explainability:

- `impactFactorsJson`
- `recommendedActionsJson`
- `matchedSystemsJson`

These are persisted for display, history reopening, and future engine evolution.

## Analytics Events

Home Risk Replay follows the standard CtC pattern:

- frontend sends a small `{ event, section, metadata }` payload
- backend records the normalized action in `auditLog`
- stored action names are prefixed with `HOME_RISK_REPLAY_`

Current events instrumented:

- `OPENED`
  - fired once when the replay screen opens
  - key metadata: `launch_surface`, `has_property_context`, `prefilled_window_type`, `device_context`
- `GENERATION_STARTED`
  - fired when the user starts a replay run
  - key metadata: `window_type`, `custom_range_used`
- `VIEWED`
  - fired once per replay run when results render
  - key metadata: `replay_run_id`, `window_type`, `total_events_bucket`, `high_impact_events_bucket`, `moderate_impact_events_bucket`, `has_events`
- `EMPTY_VIEWED`
  - fired once per replay run when a replay renders with no matched events
  - key metadata: `replay_run_id`, `window_type`
- `EVENT_OPENED`
  - fired when a timeline event detail is opened
  - key metadata: `replay_run_id`, `replay_event_match_id`, `risk_event_id`, `event_type`, `severity`, `impact_level`, `event_position`
- `HISTORY_ITEM_OPENED`
  - fired when a prior replay run is opened from history
  - key metadata: `replay_run_id`, `window_type`, `total_events_bucket`, `high_impact_events_bucket`, `source_list_position`
- `CONTEXTUAL_ENTRY_CLICKED`
  - fired from contextual launch surfaces such as the property hub and system detail drawer
  - key metadata: `launch_surface`, `linked_system_type`, `suggested_focus_type`
- `ERROR`
  - fired for user-visible failures during open, history, detail, or generate stages
  - key metadata: `stage`, `error_type`, `window_type`, `replay_run_id`

Common metadata added on tool-screen events:

- `tool_name`
- `property_id`
- `launch_surface`
- `contextual_focus_present`

## Guardrails and UX Notes

The current UI and backend copy intentionally avoid overstating certainty.

Current guardrails:

- replay output is framed as historical matching, not proof of direct damage
- regional event severity is distinct from likely impact on the home
- no-event windows are presented as useful findings, not failures
- broader location-based matching is surfaced with calmer context when useful
- recommended actions are framed as practical follow-up checks, not urgent warnings

## Key Files At A Glance

### Backend

- [apps/backend/prisma/schema.prisma](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/prisma/schema.prisma)
- [apps/backend/src/index.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/index.ts)
- [apps/backend/src/routes/homeRiskReplay.routes.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/routes/homeRiskReplay.routes.ts)
- [apps/backend/src/controllers/homeRiskReplay.controller.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/controllers/homeRiskReplay.controller.ts)
- [apps/backend/src/validators/homeRiskReplay.validators.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/validators/homeRiskReplay.validators.ts)
- [apps/backend/src/services/homeRiskReplay.service.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/homeRiskReplay.service.ts)
- [apps/backend/src/services/homeRiskReplay.engine.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/backend/src/services/homeRiskReplay.engine.ts)

### Frontend Feature Screen

- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-risk-replay/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-risk-replay/page.tsx)
- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-risk-replay/HomeRiskReplayClient.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-risk-replay/HomeRiskReplayClient.tsx)
- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-risk-replay/homeRiskReplayApi.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-risk-replay/homeRiskReplayApi.ts)
- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-risk-replay/homeRiskReplayUi.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-risk-replay/homeRiskReplayUi.ts)
- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-risk-replay/__tests__/homeRiskReplayUi.test.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-risk-replay/__tests__/homeRiskReplayUi.test.ts)

### Frontend Shared Components and Wiring

- [apps/frontend/src/components/features/homeRiskReplay/types.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/features/homeRiskReplay/types.ts)
- [apps/frontend/src/components/features/homeRiskReplay/ReplayUtils.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/features/homeRiskReplay/ReplayUtils.tsx)
- [apps/frontend/src/components/features/homeRiskReplay/ReplayTimelineItem.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/features/homeRiskReplay/ReplayTimelineItem.tsx)
- [apps/frontend/src/components/features/homeRiskReplay/ReplayDetailSheet.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/features/homeRiskReplay/ReplayDetailSheet.tsx)
- [apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts)
- [apps/frontend/src/lib/routes/homeRiskReplay.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/lib/routes/homeRiskReplay.ts)
- [apps/frontend/src/app/(dashboard)/dashboard/home-tools/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/home-tools/page.tsx)
- [apps/frontend/src/app/(dashboard)/dashboard/properties/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/page.tsx)
- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/HomeToolsRail.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/HomeToolsRail.tsx)
- [apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/page.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/page.tsx)
- [apps/frontend/src/app/(dashboard)/dashboard/components/inventory/InventoryItemDrawer.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/dashboard/components/inventory/InventoryItemDrawer.tsx)
- [apps/frontend/src/app/(dashboard)/layout.tsx](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/frontend/src/app/(dashboard)/layout.tsx)

### Workers

- [apps/workers/src/jobs/ingestHomeRiskEvents.job.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/workers/src/jobs/ingestHomeRiskEvents.job.ts)
- [apps/workers/src/homeRiskReplay/dummyHomeRiskEvent.client.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/workers/src/homeRiskReplay/dummyHomeRiskEvent.client.ts)
- [apps/workers/src/homeRiskReplay/normalize.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/workers/src/homeRiskReplay/normalize.ts)
- [apps/workers/src/homeRiskReplay/homeRiskReplay.types.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/workers/src/homeRiskReplay/homeRiskReplay.types.ts)
- [apps/workers/src/homeRiskReplay/fixtures/propertyScopedEvents.json](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/workers/src/homeRiskReplay/fixtures/propertyScopedEvents.json)
- [apps/workers/src/homeRiskReplay/fixtures/zipScopedEvents.json](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/workers/src/homeRiskReplay/fixtures/zipScopedEvents.json)
- [apps/workers/src/worker.ts](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/apps/workers/src/worker.ts)
- [infrastructure/kubernetes/apps/workers/deployment.yaml](/Users/madhuboyina/Desktop/madhu/contract-to-cozy/infrastructure/kubernetes/apps/workers/deployment.yaml)
