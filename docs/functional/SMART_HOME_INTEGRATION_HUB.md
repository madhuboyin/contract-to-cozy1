# Smart Home Integration Hub

## Overview

Smart Home Integration Hub connects a homeowner's existing IoT devices and utility accounts to the Contract to Cozy platform. Rather than relying on manual data entry, the hub pulls real readings — energy consumption, temperature, leak events, utility bills — from connected devices and normalises them into platform-native events, alerts, and time-series data.

This data feeds directly into existing features:
- Energy Auditor receives actual kWh readings instead of rough estimates
- Home Events are created automatically when a device reports a critical condition (leak, HVAC anomaly)
- Incidents can be auto-opened for critical device alerts
- Risk Assessment is enriched with live device health signals

The hub is intentionally non-invasive: homeowners connect on their own schedule, each integration is per-property, tokens are stored encrypted, and every connected device can be disconnected at any time with full data purge on request.

---

## Feature Goals

- Allow homeowners to connect smart home devices via OAuth without leaving the platform
- Ingest real device readings on a recurring background schedule
- Surface device status, energy trends, and anomaly alerts in a dedicated dashboard
- Automatically propagate critical device conditions into Home Events and Incidents
- Feed live energy data into the Energy Auditor to replace manual estimates
- Keep all provider complexity behind the normalization layer so the frontend contract stays stable

---

## Supported Integrations (Phase 1)

| Provider | Key Data | Auth Method | API Cost |
|---|---|---|---|
| **Ecobee** | Thermostat runtime, temperature, energy usage | OAuth 2.0 | Free |
| **SmartThings** | Leak sensors, motion, temperature, humidity | OAuth 2.0 | Free |
| **Google Nest SDM** | Thermostat temperature, HVAC mode, camera/doorbell status | OAuth 2.0 + Google Cloud | Free within GCP free tier |
| **Green Button Connect** | Utility electricity and gas bills, interval usage data | OAuth 2.0 | Free (utility-provided) |
| **Emporia Energy** | Panel-level and circuit-level kWh data | API key | Free |

---

## Database

### Enums

```prisma
enum SmartHomeProvider {
  ECOBEE
  SMARTTHINGS
  GOOGLE_NEST
  GREEN_BUTTON
  EMPORIA
}

enum SmartHomeIntegrationStatus {
  PENDING_AUTH      // OAuth initiated, callback not yet received
  ACTIVE            // Tokens valid, polling active
  TOKEN_EXPIRED     // Refresh token has expired or was revoked
  ERROR             // Last sync attempt failed
  DISCONNECTED      // Manually disconnected by user
}

enum SmartHomeDeviceType {
  THERMOSTAT
  LEAK_SENSOR
  ENERGY_MONITOR
  SMART_PANEL
  UTILITY_METER
  CAMERA
  DOORBELL
  HUMIDITY_SENSOR
  TEMPERATURE_SENSOR
  MOTION_SENSOR
  OTHER
}

enum SmartHomeDeviceStatus {
  ONLINE
  OFFLINE
  UNKNOWN
  ERROR
}

enum SmartHomeReadingType {
  TEMPERATURE_F
  HUMIDITY_PCT
  ENERGY_KWH
  ENERGY_WATTS
  WATER_LEAK_DETECTED
  HVAC_RUNTIME_MINUTES
  THERMOSTAT_MODE
  UTILITY_BILL_KWH
  UTILITY_BILL_USD
  CIRCUIT_KWH
  MOTION_DETECTED
}

enum SmartHomeAlertType {
  LEAK_DETECTED
  TEMPERATURE_ANOMALY
  HIGH_ENERGY_USAGE
  UNUSUAL_HVAC_RUNTIME
  UTILITY_SPIKE
  DEVICE_OFFLINE
  TOKEN_EXPIRY_WARNING
  SYNC_FAILURE
}

enum SmartHomeAlertSeverity {
  INFO
  WARNING
  CRITICAL
}

enum SmartHomeAlertStatus {
  NEW
  ACKNOWLEDGED
  RESOLVED
  DISMISSED
}

enum SmartHomeSyncTrigger {
  SCHEDULED
  MANUAL
  WEBHOOK
  POST_CONNECT
}
```

---

### Models

#### `SmartHomeIntegration` — OAuth Connection Per Property + Provider

One row per (property, provider) pair. A single user can connect the same provider to multiple properties independently.

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `propertyId` | String | FK → Property |
| `userId` | String | FK → User (the user who authorised the connection) |
| `provider` | `SmartHomeProvider` | Which provider this connection is for |
| `status` | `SmartHomeIntegrationStatus` | Connection lifecycle state |
| `accessToken` | String? | Encrypted OAuth access token |
| `refreshToken` | String? | Encrypted OAuth refresh token |
| `tokenExpiresAt` | DateTime? | Access token expiry (used to schedule proactive refresh) |
| `providerAccountId` | String? | Provider-side account/user ID for this connection |
| `providerAccountLabel` | String? | Human-readable label from the provider (e.g. Ecobee username) |
| `scopes` | String[] | OAuth scopes granted at auth time |
| `lastSyncAt` | DateTime? | Timestamp of last successful poll |
| `lastSyncError` | String? | Error message from last failed poll (cleared on success) |
| `syncFailureCount` | Int | Rolling count of consecutive sync failures |
| `metaJson` | Json? | Provider-specific metadata (e.g. Nest project ID, Green Button service point IDs) |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

**Unique constraint:** `propertyId + provider`
**Indexes:** `propertyId`, `userId`, `status`, `provider`, `tokenExpiresAt`

---

#### `SmartHomeDevice` — Discovered Device from an Integration

Populated by the first sync after connection. Updated on each sync. One row per physical or logical device.

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `integrationId` | String | FK → SmartHomeIntegration |
| `propertyId` | String | FK → Property (denormalised for efficient property-scoped queries) |
| `providerDeviceId` | String | Provider-assigned device ID |
| `name` | String | Human-readable device name (from provider, user can override) |
| `displayName` | String? | User-set override for the provider name |
| `deviceType` | `SmartHomeDeviceType` | Normalised device type |
| `status` | `SmartHomeDeviceStatus` | Latest observed device status |
| `locationLabel` | String? | Room or zone label from provider (e.g. "Upstairs", "Kitchen") |
| `inventoryItemId` | String? | Optional FK → InventoryItem (link to inventory if matched) |
| `lastReadingAt` | DateTime? | Timestamp of most recent reading |
| `lastReadingJson` | Json? | Snapshot of the latest reading payload (for dashboard display without a reading query) |
| `metaJson` | Json? | Provider-specific device attributes (firmware version, model, etc.) |
| `isActive` | Boolean | False when device is removed from provider or integration is disconnected |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

**Unique constraint:** `integrationId + providerDeviceId`
**Indexes:** `integrationId`, `propertyId`, `deviceType`, `status`, `isActive`

---

#### `SmartHomeReading` — Time-Series Reading from a Device

Append-only. Never mutated after insert. Queried for trend charts, Energy Auditor data, and anomaly detection.

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `deviceId` | String | FK → SmartHomeDevice |
| `propertyId` | String | FK → Property (denormalised) |
| `integrationId` | String | FK → SmartHomeIntegration (denormalised) |
| `readingType` | `SmartHomeReadingType` | What this reading measures |
| `value` | Decimal(12,4) | Numeric reading value (temperature, kWh, runtime minutes, etc.) |
| `unit` | String | Display unit (°F, kWh, %, min, W, USD) |
| `recordedAt` | DateTime | When the reading was taken at the device (provider-reported time) |
| `ingestedAt` | DateTime | When we wrote this row (for audit / lag tracking) |
| `providerReadingId` | String? | Provider-side ID for deduplication |
| `dedupeKey` | String (unique) | Prevents duplicate ingest: `deviceId:readingType:recordedAt` |
| `metaJson` | Json? | Raw provider payload slice |

**Indexes:** `deviceId + readingType + recordedAt`, `propertyId + readingType + recordedAt`, `integrationId`, `dedupeKey`

> **Note on volume:** Thermostat readings arrive every 5 minutes; energy monitors every 15 minutes. Readings are retained for 24 months. Older readings are summarised into daily aggregates and purged at the raw level by a maintenance worker.

---

#### `SmartHomeReadingAggregate` — Daily Summary for Long-Term Trend Data

Pre-computed daily rollup per device per reading type. Populated by the maintenance worker. Replaces raw rows older than 60 days for trend queries.

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `deviceId` | String | FK → SmartHomeDevice |
| `propertyId` | String | FK → Property |
| `readingType` | `SmartHomeReadingType` | |
| `date` | DateTime | UTC midnight for the aggregation day |
| `minValue` | Decimal(12,4) | Min reading value that day |
| `maxValue` | Decimal(12,4) | Max reading value that day |
| `avgValue` | Decimal(12,4) | Average reading value |
| `sumValue` | Decimal(12,4) | Sum (meaningful for energy kWh, HVAC runtime) |
| `readingCount` | Int | Number of raw readings aggregated |
| `unit` | String | |

**Unique constraint:** `deviceId + readingType + date`
**Indexes:** `propertyId + readingType + date`, `deviceId + date`

---

#### `SmartHomeAlert` — Anomaly or Condition Alert

Created by the anomaly detection pass in the sync worker. Lifecycle-managed by the homeowner.

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `propertyId` | String | FK → Property |
| `deviceId` | String? | FK → SmartHomeDevice (null for integration-level alerts like token expiry) |
| `integrationId` | String | FK → SmartHomeIntegration |
| `alertType` | `SmartHomeAlertType` | Category of anomaly |
| `severity` | `SmartHomeAlertSeverity` | INFO / WARNING / CRITICAL |
| `status` | `SmartHomeAlertStatus` | NEW / ACKNOWLEDGED / RESOLVED / DISMISSED |
| `title` | String | Short display title |
| `summary` | String | Human-readable explanation |
| `triggerReadingId` | String? | FK → SmartHomeReading (the reading that triggered this alert) |
| `homeEventId` | String? | FK → HomeEvent (set when this alert auto-created a HomeEvent) |
| `incidentId` | String? | FK → Incident (set when this alert auto-opened an Incident) |
| `resolvedAt` | DateTime? | When status transitioned to RESOLVED or DISMISSED |
| `resolvedByUserId` | String? | FK → User |
| `dedupeKey` | String (unique) | Prevents duplicate alerts: `deviceId:alertType:window` (e.g. per-day window) |
| `metaJson` | Json? | Alert-specific context (threshold value, baseline, delta) |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

**Indexes:** `propertyId + status`, `propertyId + severity + status`, `deviceId`, `integrationId`, `homeEventId`, `createdAt`

---

#### `SmartHomeSyncLog` — Sync Attempt Audit Trail

Append-only log of every sync attempt per integration. Used for observability, debugging, and retry logic.

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `integrationId` | String | FK → SmartHomeIntegration |
| `trigger` | `SmartHomeSyncTrigger` | What initiated the sync |
| `startedAt` | DateTime | |
| `completedAt` | DateTime? | Null if still in progress or failed hard |
| `devicesFound` | Int | Number of devices discovered/updated |
| `readingsInserted` | Int | New reading rows written |
| `alertsCreated` | Int | New alerts created |
| `errorMessage` | String? | Error detail if sync failed |
| `durationMs` | Int? | Wall-clock duration in milliseconds |

**Indexes:** `integrationId + startedAt`, `startedAt`

---

## Backend

### Files

| File | Purpose |
|---|---|
| `backend/src/routes/smartHome.routes.ts` | Express route definitions and middleware chains |
| `backend/src/controllers/smartHome.controller.ts` | Request/response handling |
| `backend/src/services/smartHome.service.ts` | Integration lifecycle, device CRUD, alert management |
| `backend/src/services/smartHomeSync.service.ts` | Orchestrates polling across providers; calls provider clients |
| `backend/src/services/smartHomeAnomaly.service.ts` | Anomaly detection on incoming readings; creates alerts |
| `backend/src/services/smartHomeOAuth.service.ts` | OAuth state generation, callback handling, token encryption/refresh |
| `backend/src/services/providers/ecobee.client.ts` | Ecobee API client |
| `backend/src/services/providers/smartThings.client.ts` | SmartThings API client |
| `backend/src/services/providers/googleNestSdm.client.ts` | Google Nest SDM API client |
| `backend/src/services/providers/greenButton.client.ts` | Green Button Connect client |
| `backend/src/services/providers/emporia.client.ts` | Emporia Energy client |
| `backend/src/services/providers/smartHomeNormalizer.ts` | Maps provider-specific payloads → canonical `SmartHomeReading` shape |
| `backend/src/validators/smartHome.validators.ts` | Zod v4 input validation schemas |
| `backend/src/index.ts` | Route mounting |

---

### API Endpoints

All endpoints require `Authorization: Bearer <token>`. Property-scoped endpoints additionally apply `propertyAuth.middleware`.

#### OAuth / Connection Management

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/properties/:propertyId/smart-home/integrations/initiate` | Generate OAuth state, return provider authorisation URL |
| `GET` | `/api/properties/:propertyId/smart-home/integrations/callback` | Handle OAuth callback, exchange code for tokens, create integration row |
| `GET` | `/api/properties/:propertyId/smart-home/integrations` | List all integrations for a property (status, provider, last sync) |
| `GET` | `/api/properties/:propertyId/smart-home/integrations/:integrationId` | Get single integration detail |
| `POST` | `/api/properties/:propertyId/smart-home/integrations/:integrationId/sync` | Manually trigger a sync for one integration |
| `DELETE` | `/api/properties/:propertyId/smart-home/integrations/:integrationId` | Disconnect; optionally purge readings (`?purgeData=true`) |

#### Devices

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/properties/:propertyId/smart-home/devices` | List all devices for a property |
| `GET` | `/api/properties/:propertyId/smart-home/devices/:deviceId` | Get device detail with latest reading snapshot |
| `PATCH` | `/api/properties/:propertyId/smart-home/devices/:deviceId` | Update display name or link to inventory item |
| `GET` | `/api/properties/:propertyId/smart-home/devices/:deviceId/readings` | Paginated time-series readings |

#### Readings (aggregated)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/properties/:propertyId/smart-home/energy` | Energy summary across all energy-type devices (for Energy Auditor integration) |
| `GET` | `/api/properties/:propertyId/smart-home/energy/chart` | Daily kWh data for the last N days (used by the energy trend chart) |

#### Alerts

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/properties/:propertyId/smart-home/alerts` | Paginated alert feed (filterable by status, severity, type) |
| `GET` | `/api/properties/:propertyId/smart-home/alerts/:alertId` | Alert detail |
| `PATCH` | `/api/properties/:propertyId/smart-home/alerts/:alertId/status` | Acknowledge, resolve, or dismiss an alert |

#### Summary (dashboard widget)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/properties/:propertyId/smart-home/summary` | At-a-glance summary: connected provider count, active device count, new alert count, today's energy kWh |

#### Readings query parameters (`GET /devices/:deviceId/readings`)

| Param | Type | Default | Notes |
|---|---|---|---|
| `readingType` | string | — | Filter to one reading type |
| `from` | ISO datetime | 30 days ago | Range start |
| `to` | ISO datetime | now | Range end |
| `resolution` | `raw` \| `daily` | `daily` | raw = individual rows, daily = aggregate |
| `limit` | number | 100 | Max rows (raw mode only) |
| `cursor` | string | — | Pagination cursor (raw mode only) |

#### Alert query parameters (`GET /alerts`)

| Param | Type | Default | Notes |
|---|---|---|---|
| `status` | string[] | `NEW,ACKNOWLEDGED` | Filter by status |
| `severity` | string[] | — | Filter by severity |
| `limit` | number | 40 | |
| `cursor` | string | — | Pagination cursor |

---

### Service Layer

#### `SmartHomeService` (`smartHome.service.ts`)

Core CRUD and lifecycle logic.

- **`initiateOAuth(propertyId, userId, provider)`** — Generates a PKCE code verifier, stores an encrypted OAuth state in Redis (TTL 10 min), returns the provider authorisation URL.
- **`handleOAuthCallback(propertyId, userId, code, state)`** — Validates state, exchanges code for tokens, encrypts access/refresh tokens, upserts a `SmartHomeIntegration` row, enqueues a `POST_CONNECT` sync.
- **`listIntegrations(propertyId)`** — Returns integration rows with last sync metadata; strips encrypted token fields.
- **`disconnectIntegration(integrationId, propertyId, purgeData)`** — Sets status to `DISCONNECTED`; if `purgeData=true`, deletes all `SmartHomeReading`, `SmartHomeReadingAggregate`, `SmartHomeAlert`, and `SmartHomeDevice` rows under this integration.
- **`listDevices(propertyId, filters?)`** — Returns devices with `lastReadingJson` populated for dashboard cards.
- **`updateDevice(deviceId, propertyId, patch)`** — Allows updating `displayName` and `inventoryItemId`.
- **`getReadings(deviceId, params)`** — Switches between raw `SmartHomeReading` query (cursor paginated) and `SmartHomeReadingAggregate` query based on `resolution`.
- **`getEnergySummary(propertyId)`** — Aggregates kWh across all `ENERGY_KWH` and `UTILITY_BILL_KWH` readings for the last 30 days; returns total, daily average, and comparison to the prior 30-day window.
- **`getEnergyChartData(propertyId, days?)`** — Returns daily `sumValue` for `ENERGY_KWH` readings in the requested window, suitable for a frontend chart.
- **`listAlerts(propertyId, params)`** — Cursor-paginated alert feed; joins device name for display.
- **`updateAlertStatus(alertId, propertyId, status, userId)`** — Updates alert status; sets `resolvedAt` and `resolvedByUserId` for RESOLVED / DISMISSED transitions.
- **`getPropertySummary(propertyId)`** — Returns summary counts for the dashboard widget.

---

#### `SmartHomeOAuthService` (`smartHomeOAuth.service.ts`)

Handles token lifecycle across providers.

- **`refreshTokenIfNeeded(integration)`** — If `tokenExpiresAt` is within 5 minutes, calls the provider token refresh endpoint and updates the integration row.
- **`encryptToken(raw)`** — AES-256-GCM encryption using `SMART_HOME_TOKEN_SECRET` env variable.
- **`decryptToken(encrypted)`** — Decrypts for use in provider API calls.
- **`buildAuthUrl(provider, state, redirectUri)`** — Constructs provider-specific OAuth authorisation URLs with correct scopes.
- **`exchangeCode(provider, code, codeVerifier, redirectUri)`** — POST to provider token endpoint; returns normalised `{ accessToken, refreshToken, expiresIn }`.

---

#### `SmartHomeSyncService` (`smartHomeSync.service.ts`)

Polling orchestrator. Called by the background worker and the manual sync endpoint.

- **`syncIntegration(integrationId, trigger)`** — Full sync lifecycle for one integration:
  1. Load integration, decrypt tokens, refresh if needed
  2. Call the appropriate provider client to discover devices
  3. Upsert `SmartHomeDevice` rows
  4. Fetch readings since `lastSyncAt`
  5. Normalise via `SmartHomeNormalizer`
  6. Bulk insert new `SmartHomeReading` rows (skip on `dedupeKey` conflict)
  7. Update `lastReadingJson` on each device
  8. Run anomaly detection via `SmartHomeAnomalyService`
  9. Update `lastSyncAt`, clear `lastSyncError`, reset `syncFailureCount`
  10. Write `SmartHomeSyncLog` row
- **`syncAllActiveIntegrations()`** — Queries all `ACTIVE` integrations, fans out to `syncIntegration` calls via BullMQ jobs.
- **`handleSyncFailure(integrationId, error)`** — Increments `syncFailureCount`; if count ≥ 5, transitions status to `ERROR` and creates a `SYNC_FAILURE` alert; writes `SmartHomeSyncLog` with error.

---

#### `SmartHomeAnomalyService` (`smartHomeAnomaly.service.ts`)

Rules-based anomaly detection. Runs after each sync batch. Each rule produces at most one alert per deduplication window.

**Anomaly Rules:**

| Rule | Trigger Condition | Alert Type | Severity | Dedupe Window |
|---|---|---|---|---|
| Leak detected | Any `WATER_LEAK_DETECTED` reading with value > 0 | `LEAK_DETECTED` | CRITICAL | 1 hour |
| Temperature anomaly | Indoor temp < 40°F or > 95°F | `TEMPERATURE_ANOMALY` | CRITICAL | 6 hours |
| High energy usage | Daily kWh > 3× rolling 30-day average | `HIGH_ENERGY_USAGE` | WARNING | 1 day |
| Unusual HVAC runtime | Daily runtime > 2× rolling 30-day average | `UNUSUAL_HVAC_RUNTIME` | WARNING | 1 day |
| Utility spike | Monthly utility bill > 1.5× prior 3-month average | `UTILITY_SPIKE` | INFO | 1 month |
| Device offline | Device status `OFFLINE` persists across 2 consecutive syncs | `DEVICE_OFFLINE` | WARNING | 24 hours |
| Token expiry | Integration `tokenExpiresAt` < 3 days from now | `TOKEN_EXPIRY_WARNING` | INFO | 1 day |

**After alert creation:**
- `CRITICAL` alerts call `HomeEventService.createFromSmartHomeAlert()` to write a `HomeEvent` (eventType = `MAINTENANCE` or `CLAIM` based on alert type)
- `LEAK_DETECTED` alerts call `IncidentService.createFromSmartHomeAlert()` to auto-open an Incident

---

### Provider Clients

All clients implement the same internal interface:

```typescript
interface SmartHomeProviderClient {
  discoverDevices(integration: SmartHomeIntegration): Promise<RawDevice[]>
  fetchReadings(integration: SmartHomeIntegration, device: SmartHomeDevice, since: Date): Promise<RawReading[]>
}
```

#### `EcobeeClient` (`ecobee.client.ts`)
- Device discovery: `GET /1/thermostat?json={selection:{...}}` — returns thermostat list
- Readings: Runtime reports via `GET /1/runtimeReport` — returns 5-minute intervals of runtime, temperature, humidity

#### `SmartThingsClient` (`smartThings.client.ts`)
- Device discovery: `GET /v1/devices` — filtered by `capability` (temperatureMeasurement, waterSensor, humiditySensor)
- Readings: `GET /v1/devices/:deviceId/components/main/capabilities/:capability/status`

#### `GoogleNestSdmClient` (`googleNestSdm.client.ts`)
- Device discovery: `GET /v1/enterprises/:projectId/devices`
- Readings: Trait-based polling — `sdm.devices.traits.Temperature`, `sdm.devices.traits.ThermostatHvac`, `sdm.devices.traits.Fan`

#### `GreenButtonClient` (`greenButton.client.ts`)
- Uses the ESPI (Energy Services Provider Interface) standard
- Endpoint discovery via service document at the utility's Green Button endpoint
- Interval block reading: `GET /espi/1_1/resource/Subscription/:id/UsagePoint/:id/MeterReading`

#### `EmporiaClient` (`emporia.client.ts`)
- Auth via API key (stored in `metaJson` on the integration)
- Device list: `GET /customers/devices`
- Readings: `GET /AppAPI?apiCall=getChartUsage&deviceGid=:id&instant=:ts&scale=1MIN&energyUnit=KilowattHours`

---

### Normalizer (`smartHomeNormalizer.ts`)

Maps each provider's raw payload into canonical `SmartHomeReading` insert shapes:

```typescript
interface NormalizedReading {
  deviceId: string
  propertyId: string
  integrationId: string
  readingType: SmartHomeReadingType
  value: number
  unit: string
  recordedAt: Date
  providerReadingId?: string
  dedupeKey: string  // `${deviceId}:${readingType}:${recordedAt.toISOString()}`
  metaJson?: Record<string, unknown>
}
```

Each provider module exports a `normalize(rawReadings: RawReading[], context: SyncContext): NormalizedReading[]` function. The normalizer is the only place that knows about provider data shapes.

---

### Validators (`smartHome.validators.ts`)

| Schema | Used By |
|---|---|
| `InitiateOAuthSchema` | `POST .../integrations/initiate` |
| `OAuthCallbackSchema` | `GET .../integrations/callback` |
| `UpdateDeviceSchema` | `PATCH .../devices/:deviceId` |
| `GetReadingsSchema` | `GET .../readings` (query params) |
| `GetEnergyChartSchema` | `GET .../energy/chart` |
| `ListAlertsSchema` | `GET .../alerts` |
| `UpdateAlertStatusSchema` | `PATCH .../alerts/:alertId/status` |

---

## OAuth Flow

```
User taps "Connect Ecobee"
        │
        ▼
POST /api/properties/:propertyId/smart-home/integrations/initiate
  └─ Generates PKCE code verifier + challenge
  └─ Stores { propertyId, userId, provider, codeVerifier } in Redis key
     `smarthome:oauth:state:<state>` (TTL 600s)
  └─ Returns { authUrl: "https://api.ecobee.com/authorize?..." }
        │
        ▼
Frontend redirects browser to provider authorization URL
        │
        ▼
User grants permission in provider's UI
        │
        ▼
Provider redirects to callback URL with ?code=...&state=...
        │
        ▼
GET /api/properties/:propertyId/smart-home/integrations/callback
  └─ Validates state exists in Redis and belongs to this propertyId + userId
  └─ Exchanges code + codeVerifier for access + refresh tokens
  └─ Encrypts tokens with AES-256-GCM
  └─ Upserts SmartHomeIntegration row (status: ACTIVE)
  └─ Deletes Redis state key
  └─ Enqueues POST_CONNECT sync job (immediate)
  └─ Returns { integrationId, provider, status: 'ACTIVE' }
        │
        ▼
Background worker runs POST_CONNECT sync
  └─ Discovers devices → upserts SmartHomeDevice rows
  └─ Fetches initial readings batch
  └─ Runs anomaly detection
  └─ Updates lastSyncAt
```

---

## Frontend

### Files

| File | Purpose |
|---|---|
| `frontend/src/app/(dashboard)/dashboard/smart-home/page.tsx` | Main hub page — device overview, energy summary, alert feed |
| `frontend/src/app/(dashboard)/dashboard/smart-home/connect/page.tsx` | Integration selection and OAuth initiation page |
| `frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/smart-home/page.tsx` | Property-scoped tool entry (redirects to main page with `propertyId`) |
| `frontend/src/components/features/smartHome/IntegrationCard.tsx` | Provider connection status card |
| `frontend/src/components/features/smartHome/DeviceCard.tsx` | Individual device status with latest reading |
| `frontend/src/components/features/smartHome/ConnectProviderSheet.tsx` | Bottom sheet for selecting a provider and starting OAuth |
| `frontend/src/components/features/smartHome/SmartHomeAlertFeed.tsx` | Scrollable alert feed with acknowledge/dismiss actions |
| `frontend/src/components/features/smartHome/EnergyTrendChart.tsx` | Bar chart of daily kWh over the last 30 days |
| `frontend/src/components/features/smartHome/DeviceReadingsSheet.tsx` | Bottom sheet for device reading history |
| `frontend/src/components/features/smartHome/SmartHomeUtils.ts` | Icons, label maps, color helpers |
| `frontend/src/lib/api/client.ts` | API client methods (additions) |
| `frontend/src/types/index.ts` | TypeScript interfaces |

---

### Main Hub Page (`smart-home/page.tsx`)

**Route:** `/dashboard/smart-home?propertyId=<id>`

**Layout sections (mobile-first, top to bottom):**

1. **Header** — Feature title, "Add Integration" CTA button
2. **Summary strip** — Three stat chips: connected providers, active devices, new alerts count
3. **Connected Integrations** — Horizontal scroll row of `IntegrationCard` components; "Connect a device" placeholder if none
4. **Energy This Month** — `EnergyTrendChart` (30-day daily kWh bar chart); "No energy data yet" state if no energy-type devices are connected
5. **Devices** — Grid of `DeviceCard` components (online devices first, then offline); tapping opens `DeviceReadingsSheet`
6. **Alerts** — `SmartHomeAlertFeed` showing NEW and ACKNOWLEDGED alerts; "All clear" state if no active alerts

**State management:**
- React Query v5 for all server state
- Optimistic status updates for alert acknowledge/dismiss (state updates immediately, reverts on server error)
- 5-minute stale time; manual refetch button in header

---

### Connect Page (`connect/page.tsx`)

**Route:** `/dashboard/smart-home/connect?propertyId=<id>`

Displays a grid of supported provider tiles. Each tile shows:
- Provider logo / icon
- Provider name and short description of what data it provides
- "Already connected" badge if integration row exists for this property
- "Connect" button

On "Connect" tap:
1. Call `POST .../integrations/initiate` to get `authUrl`
2. Redirect browser to `authUrl` (full-page redirect, not iframe)
3. After provider callback, page redirects back to `/dashboard/smart-home?propertyId=<id>&connected=true`
4. Main page shows a success toast and auto-refreshes integrations

---

### `IntegrationCard.tsx`

Displays per-provider connection state:
- Provider icon and name
- Status badge: Active (green) / Error (red) / Token Expired (amber) / Disconnected (grey)
- Last synced relative time
- Sync failure message if `lastSyncError` is set
- "Sync Now" button (triggers manual sync)
- "Disconnect" button (opens confirm dialog)

---

### `DeviceCard.tsx`

Displays a single smart home device:
- Device type icon
- Display name (provider name or user override)
- Location label (room/zone from provider)
- Status indicator dot (Online = green, Offline = red, Unknown = grey)
- Latest reading value and unit (e.g. "68°F", "1.2 kWh today", "No leak")
- Tap to open `DeviceReadingsSheet`

---

### `SmartHomeAlertFeed.tsx`

Scrollable list of alerts. Each alert item shows:
- Alert type icon
- Title and summary (2 lines, clamped)
- Severity chip (CRITICAL = red, WARNING = amber, INFO = blue)
- Relative time
- "Acknowledge" and "Dismiss" action buttons inline

---

### `EnergyTrendChart.tsx`

Bar chart using the `/smart-home/energy/chart` endpoint:
- X axis: last 30 days
- Y axis: kWh
- Bars coloured by quartile (green → amber → red for high usage days)
- Tap a bar to see date + exact kWh value
- Caption: "30-day total: X kWh · Daily average: Y kWh"

---

### API Client Methods

```typescript
// Initiate OAuth for a provider
initiateSmartHomeOAuth(
  propertyId: string,
  provider: SmartHomeProvider
): Promise<{ authUrl: string }>

// List integrations for a property
listSmartHomeIntegrations(
  propertyId: string
): Promise<SmartHomeIntegrationSummary[]>

// Manually trigger sync
triggerSmartHomeSync(
  propertyId: string,
  integrationId: string
): Promise<void>

// Disconnect an integration
disconnectSmartHomeIntegration(
  propertyId: string,
  integrationId: string,
  purgeData?: boolean
): Promise<void>

// List devices
listSmartHomeDevices(
  propertyId: string
): Promise<SmartHomeDeviceSummary[]>

// Update device display name or inventory link
updateSmartHomeDevice(
  propertyId: string,
  deviceId: string,
  patch: { displayName?: string; inventoryItemId?: string | null }
): Promise<SmartHomeDeviceSummary>

// Get device readings (chart or raw)
getSmartHomeReadings(
  propertyId: string,
  deviceId: string,
  params: SmartHomeReadingsParams
): Promise<SmartHomeReadingsResponse>

// Get energy summary
getSmartHomeEnergySummary(
  propertyId: string
): Promise<SmartHomeEnergySummary>

// Get energy chart data
getSmartHomeEnergyChart(
  propertyId: string,
  days?: number
): Promise<SmartHomeEnergyChartPoint[]>

// List alerts
listSmartHomeAlerts(
  propertyId: string,
  params?: SmartHomeAlertParams
): Promise<{ items: SmartHomeAlertItem[]; nextCursor?: string }>

// Update alert status
updateSmartHomeAlertStatus(
  propertyId: string,
  alertId: string,
  status: 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED'
): Promise<void>

// Get dashboard summary
getSmartHomeSummary(
  propertyId: string
): Promise<SmartHomeSummary>
```

---

### TypeScript Interfaces

```typescript
type SmartHomeProvider = 'ECOBEE' | 'SMARTTHINGS' | 'GOOGLE_NEST' | 'GREEN_BUTTON' | 'EMPORIA'
type SmartHomeIntegrationStatus = 'PENDING_AUTH' | 'ACTIVE' | 'TOKEN_EXPIRED' | 'ERROR' | 'DISCONNECTED'
type SmartHomeDeviceType = 'THERMOSTAT' | 'LEAK_SENSOR' | 'ENERGY_MONITOR' | 'SMART_PANEL' | 'UTILITY_METER' | 'CAMERA' | 'DOORBELL' | 'HUMIDITY_SENSOR' | 'TEMPERATURE_SENSOR' | 'MOTION_SENSOR' | 'OTHER'
type SmartHomeDeviceStatus = 'ONLINE' | 'OFFLINE' | 'UNKNOWN' | 'ERROR'
type SmartHomeReadingType = 'TEMPERATURE_F' | 'HUMIDITY_PCT' | 'ENERGY_KWH' | 'ENERGY_WATTS' | 'WATER_LEAK_DETECTED' | 'HVAC_RUNTIME_MINUTES' | 'THERMOSTAT_MODE' | 'UTILITY_BILL_KWH' | 'UTILITY_BILL_USD' | 'CIRCUIT_KWH' | 'MOTION_DETECTED'
type SmartHomeAlertType = 'LEAK_DETECTED' | 'TEMPERATURE_ANOMALY' | 'HIGH_ENERGY_USAGE' | 'UNUSUAL_HVAC_RUNTIME' | 'UTILITY_SPIKE' | 'DEVICE_OFFLINE' | 'TOKEN_EXPIRY_WARNING' | 'SYNC_FAILURE'
type SmartHomeAlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL'
type SmartHomeAlertStatus = 'NEW' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED'

interface SmartHomeIntegrationSummary {
  id: string
  provider: SmartHomeProvider
  status: SmartHomeIntegrationStatus
  providerAccountLabel?: string
  lastSyncAt?: string
  lastSyncError?: string
  syncFailureCount: number
  deviceCount: number
  createdAt: string
}

interface SmartHomeDeviceSummary {
  id: string
  integrationId: string
  providerDeviceId: string
  name: string
  displayName?: string
  deviceType: SmartHomeDeviceType
  status: SmartHomeDeviceStatus
  locationLabel?: string
  inventoryItemId?: string
  lastReadingAt?: string
  lastReadingJson?: Record<string, unknown>
}

interface SmartHomeReadingsParams {
  readingType?: SmartHomeReadingType
  from?: string
  to?: string
  resolution?: 'raw' | 'daily'
  limit?: number
  cursor?: string
}

interface SmartHomeReadingPoint {
  recordedAt: string
  value: number
  unit: string
}

interface SmartHomeReadingDailyAggregate {
  date: string
  minValue: number
  maxValue: number
  avgValue: number
  sumValue: number
  unit: string
}

interface SmartHomeReadingsResponse {
  deviceId: string
  readingType: SmartHomeReadingType
  resolution: 'raw' | 'daily'
  items: SmartHomeReadingPoint[] | SmartHomeReadingDailyAggregate[]
  nextCursor?: string
}

interface SmartHomeEnergySummary {
  thirtyDayKwh: number
  dailyAvgKwh: number
  priorThirtyDayKwh: number
  changePercent: number
  hasData: boolean
}

interface SmartHomeEnergyChartPoint {
  date: string
  kWh: number
}

interface SmartHomeAlertItem {
  id: string
  alertType: SmartHomeAlertType
  severity: SmartHomeAlertSeverity
  status: SmartHomeAlertStatus
  title: string
  summary: string
  deviceId?: string
  deviceName?: string
  homeEventId?: string
  incidentId?: string
  createdAt: string
  resolvedAt?: string
}

interface SmartHomeSummary {
  connectedProviderCount: number
  activeDeviceCount: number
  newAlertCount: number
  criticalAlertCount: number
  todayKwh?: number
  hasEnergyData: boolean
}
```

---

## Workers / Background Jobs

### Files

| File | Purpose |
|---|---|
| `workers/src/jobs/syncSmartHome.job.ts` | Scheduled sync runner — polls all active integrations |
| `workers/src/jobs/smartHomeReadingRollup.job.ts` | Daily aggregation — rolls up raw readings older than 60 days |
| `workers/src/jobs/smartHomeAlertNotify.job.ts` | Sends notifications for new CRITICAL alerts |
| `workers/src/worker.ts` | Cron registration |

### `syncSmartHome.job.ts`

Triggered on cron schedule (default `0 * * * *` — top of every hour).

Steps:
1. Query all `SmartHomeIntegration` where `status = ACTIVE`
2. For each integration, check if `lastSyncAt` is more than `syncIntervalMinutes` ago (per-provider configurable; default 60 min)
3. Enqueue one BullMQ job per eligible integration: `{ queue: 'smart-home-sync', data: { integrationId } }`
4. BullMQ workers pick up jobs concurrently (concurrency 5 to avoid rate limit collisions)
5. Each job calls `SmartHomeSyncService.syncIntegration(integrationId, 'SCHEDULED')`

### `smartHomeReadingRollup.job.ts`

Triggered on cron schedule (default `0 3 * * *` — 3 AM daily).

Steps:
1. Query all `SmartHomeReading` rows where `recordedAt < now - 60 days`
2. For each `(deviceId, readingType, date)` group, compute min / max / avg / sum
3. Upsert into `SmartHomeReadingAggregate`
4. Delete the raw rows after successful aggregate upsert (batch deletes of 1000 rows)

### `smartHomeAlertNotify.job.ts`

Triggered immediately after `syncSmartHome.job.ts` creates new `SmartHomeAlert` rows with severity `CRITICAL`.

Steps:
1. Fetch alert with device name and property address
2. Build notification payload (title, body, deep link to `/dashboard/smart-home?propertyId=...&alertId=...`)
3. Call `NotificationService.send()` for push and in-app notification channels

### Worker Environment Variables

| Env var | Purpose | Default |
|---|---|---|
| `SMART_HOME_SYNC_CRON` | Schedule for sync job | `0 * * * *` |
| `SMART_HOME_ROLLUP_CRON` | Schedule for rollup job | `0 3 * * *` |
| `SMART_HOME_SYNC_CONCURRENCY` | BullMQ worker concurrency for sync jobs | `5` |
| `SMART_HOME_TOKEN_SECRET` | AES-256-GCM key for token encryption | Required |
| `ECOBEE_CLIENT_ID` | Ecobee OAuth client ID | Required if Ecobee enabled |
| `ECOBEE_CLIENT_SECRET` | Ecobee OAuth client secret | Required if Ecobee enabled |
| `SMARTTHINGS_CLIENT_ID` | SmartThings OAuth client ID | Required if SmartThings enabled |
| `SMARTTHINGS_CLIENT_SECRET` | SmartThings OAuth client secret | Required if SmartThings enabled |
| `GOOGLE_NEST_CLIENT_ID` | Google OAuth client ID | Required if Nest enabled |
| `GOOGLE_NEST_CLIENT_SECRET` | Google OAuth client secret | Required if Nest enabled |
| `GOOGLE_NEST_PROJECT_ID` | Google Device Access project ID | Required if Nest enabled |
| `EMPORIA_API_KEY` | Emporia API key | Required if Emporia enabled |
| `SMART_HOME_ENABLED_PROVIDERS` | Comma-separated list of enabled providers | `ECOBEE,SMARTTHINGS,GREEN_BUTTON` |

---

## Integration Points with Existing Features

### Energy Auditor

The Energy Auditor currently uses manually entered home data to estimate energy usage. When a property has one or more `ENERGY_KWH` or `UTILITY_BILL_KWH` devices connected:

- `GET /api/properties/:propertyId/smart-home/energy` is called from the Energy Auditor page to pre-populate the "actual usage" field
- A "Powered by [Provider Name]" data source badge is shown alongside the populated value
- If no smart home data exists, the existing manual input flow is unchanged

### Home Events

`SmartHomeAnomalyService` calls `HomeEventService.createFromSmartHomeAlert()` for all `CRITICAL` alerts. This creates a `HomeEvent` with:
- `eventType`: `MAINTENANCE` for temperature/HVAC/energy anomalies; `CLAIM` for leak detection
- `title`: Alert title
- `description`: Alert summary
- `importance`: `HIGH`
- `sourceRef`: Smart Home Alert ID (for bidirectional linking)

The Home Events timeline shows these auto-created events with a "Smart Home" source badge.

### Incidents

For `LEAK_DETECTED` alerts only, `IncidentService.createFromSmartHomeAlert()` is called to auto-open an Incident:
- `title`: "Water leak detected — [Device Name]"
- `category`: `WATER`
- `severity`: `HIGH`
- `sourceRef`: Smart Home Alert ID

The homeowner receives a push notification immediately and sees the incident in the Incident tracker.

### Risk Assessment

The Risk Assessment service reads `SmartHomeDevice` rows for a property to supplement its scoring inputs:
- Presence of a leak sensor on record reduces the water damage risk score
- Presence of a connected thermostat (and its HVAC runtime data) supplements HVAC system health signals
- Offline devices (status = `OFFLINE` for > 24 hours) are surfaced as a risk signal

### Dashboard Widget (Mobile Dashboard)

`MobileDashboardHome.tsx` calls `GET /api/properties/:propertyId/smart-home/summary` and renders a Smart Home strip:
- Shows new alert count with severity indicator
- Links to the Smart Home Hub page
- Hidden entirely if no integrations are connected for the property

---

## Mobile Navigation

Smart Home Integration Hub is registered in the mobile tool catalog under **Home Tools**:

```typescript
{
  key: 'smart-home',
  name: 'Smart Home Hub',
  description: 'Live readings from your connected devices',
  hrefSuffix: 'tools/smart-home',
  navTarget: 'tool:smart-home',
  icon: resolveToolIcon('home', 'smart-home'),
  isActive: (pathname) =>
    /^\/dashboard\/(properties\/[^/]+\/tools\/smart-home|smart-home)(\/|$)/.test(pathname),
}
```

**Source file:** `frontend/src/components/mobile/dashboard/mobileToolCatalog.ts`

---

## Security Considerations

- **Token encryption:** OAuth access and refresh tokens are encrypted with AES-256-GCM before storage. The encryption key is an env secret (`SMART_HOME_TOKEN_SECRET`), never in code.
- **OAuth state CSRF protection:** State parameter is a 32-byte random hex string stored in Redis with a 10-minute TTL. Requests with unknown or expired state values are rejected with 400.
- **PKCE:** All OAuth flows use PKCE (Proof Key for Code Exchange) to prevent authorisation code interception.
- **Property-level auth:** All device, reading, and alert endpoints are guarded by `propertyAuth.middleware`; a homeowner can only access data for properties they own.
- **Data purge on disconnect:** When `purgeData=true`, all readings, aggregates, alerts, devices, and the integration row itself are hard-deleted in a transaction. When `purgeData=false`, data is retained but the integration moves to `DISCONNECTED` status and polling stops.
- **Rate limiting:** The manual sync endpoint (`POST .../integrations/:id/sync`) is rate-limited to 1 call per integration per 5 minutes to prevent API quota exhaustion against provider APIs.
- **Scope minimisation:** OAuth scopes are requested at the minimum level required. No write scopes are requested from any provider. Contract to Cozy only reads.

---

## Data Flow

```
Background worker (hourly cron)
        │
        ▼
syncSmartHome.job.ts
  └─ Query all ACTIVE SmartHomeIntegration rows
  └─ Enqueue one BullMQ sync job per integration
        │
        ▼ (per integration, concurrent)
SmartHomeSyncService.syncIntegration()
  ├─ SmartHomeOAuthService.refreshTokenIfNeeded()
  ├─ ProviderClient.discoverDevices()
  │     └─ Upsert SmartHomeDevice rows
  ├─ ProviderClient.fetchReadings(since: lastSyncAt)
  ├─ SmartHomeNormalizer.normalize()
  ├─ Bulk insert SmartHomeReading rows (skip on dedupeKey conflict)
  ├─ Update device.lastReadingJson, integration.lastSyncAt
  └─ SmartHomeAnomalyService.detectAnomalies()
        ├─ Create SmartHomeAlert rows for triggered rules
        ├─ CRITICAL alerts → HomeEventService.createFromSmartHomeAlert()
        └─ LEAK_DETECTED → IncidentService.createFromSmartHomeAlert()
              │
              ▼
        smartHomeAlertNotify.job.ts
          └─ Push + in-app notification to homeowner
        │
        ▼
User opens /dashboard/smart-home?propertyId=<id>
  ├─ GET /api/properties/:id/smart-home/summary (stats strip)
  ├─ GET /api/properties/:id/smart-home/integrations (integration cards)
  ├─ GET /api/properties/:id/smart-home/devices (device grid)
  ├─ GET /api/properties/:id/smart-home/energy/chart (energy trend chart)
  └─ GET /api/properties/:id/smart-home/alerts (alert feed)
        │
        ▼
User taps a device card
  └─ GET /api/properties/:id/smart-home/devices/:deviceId/readings
        │
        ▼
User taps "Acknowledge" on an alert
  └─ PATCH /api/properties/:id/smart-home/alerts/:alertId/status { status: 'ACKNOWLEDGED' }
        │
        ▼
User opens Energy Auditor
  └─ GET /api/properties/:id/smart-home/energy → pre-populates actual usage field
```

---

## Current Limitations

- No webhook/push support from providers (all data arrives via polling). Ecobee and SmartThings offer webhooks; this is a Phase 2 improvement to reduce latency for critical events like leak detection.
- `county` and `polygon` geographic features used by Home Event Radar are not applicable here but the same spatial expansion would be needed if provider data is geographically scoped.
- Green Button Connect requires a per-utility OAuth registration; not all US utilities expose a Green Button endpoint. Users without a supported utility must rely on Emporia or manual input.
- Emporia uses an API key rather than OAuth, which means the key is stored server-side per the same encryption mechanism as OAuth tokens.
- The energy trend chart is a simple daily aggregate bar chart. No ML-based usage prediction is included in Phase 1.
- Inventory item linking (`inventoryItemId` on `SmartHomeDevice`) is manual. Automatic matching by device name/type against inventory is a Phase 2 improvement.
- Multi-user household support (multiple homeowners on one property each getting their own notification) is not scoped for Phase 1 — only the user who authorised the integration receives alerts.

---

## Phase 2 Roadmap

| Item | Description |
|---|---|
| Provider webhooks | Subscribe to Ecobee and SmartThings push events for sub-minute latency on critical conditions |
| Automatic inventory matching | Match `SmartHomeDevice` names/types against `InventoryItem` rows on first sync |
| ML usage baseline | Replace rolling-average anomaly thresholds with a per-property ML baseline for energy and HVAC runtime |
| Multi-user notifications | Notify all co-owners on a property when a critical alert fires |
| County/polygon matching | Not applicable to smart home but needed if weather-event anomaly correlation is added |
| Additional providers | Flo by Moen (water monitoring), Span smart panel, Sense energy monitor, Ring |
| Device control (future) | Write back thermostat setpoints or shut off water valves from within the app (requires write OAuth scopes) |

---

## File Index

### Backend

| Path | Role |
|---|---|
| `apps/backend/src/routes/smartHome.routes.ts` | Route definitions + middleware |
| `apps/backend/src/controllers/smartHome.controller.ts` | Request handlers |
| `apps/backend/src/services/smartHome.service.ts` | Core business logic |
| `apps/backend/src/services/smartHomeSync.service.ts` | Polling orchestrator |
| `apps/backend/src/services/smartHomeAnomaly.service.ts` | Anomaly detection and alert creation |
| `apps/backend/src/services/smartHomeOAuth.service.ts` | OAuth flow, token encryption/refresh |
| `apps/backend/src/services/providers/ecobee.client.ts` | Ecobee API client |
| `apps/backend/src/services/providers/smartThings.client.ts` | SmartThings API client |
| `apps/backend/src/services/providers/googleNestSdm.client.ts` | Google Nest SDM client |
| `apps/backend/src/services/providers/greenButton.client.ts` | Green Button Connect client |
| `apps/backend/src/services/providers/emporia.client.ts` | Emporia Energy client |
| `apps/backend/src/services/providers/smartHomeNormalizer.ts` | Provider payload → canonical reading shape |
| `apps/backend/src/validators/smartHome.validators.ts` | Zod v4 input schemas |
| `apps/backend/prisma/schema.prisma` | DB models and enums |

### Frontend

| Path | Role |
|---|---|
| `apps/frontend/src/app/(dashboard)/dashboard/smart-home/page.tsx` | Main hub page |
| `apps/frontend/src/app/(dashboard)/dashboard/smart-home/connect/page.tsx` | Provider selection + OAuth initiation |
| `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/smart-home/page.tsx` | Property-scoped entry point |
| `apps/frontend/src/components/features/smartHome/IntegrationCard.tsx` | Provider status card |
| `apps/frontend/src/components/features/smartHome/DeviceCard.tsx` | Device status + latest reading card |
| `apps/frontend/src/components/features/smartHome/ConnectProviderSheet.tsx` | Provider selection bottom sheet |
| `apps/frontend/src/components/features/smartHome/SmartHomeAlertFeed.tsx` | Alert list with inline actions |
| `apps/frontend/src/components/features/smartHome/EnergyTrendChart.tsx` | 30-day daily kWh bar chart |
| `apps/frontend/src/components/features/smartHome/DeviceReadingsSheet.tsx` | Device reading history sheet |
| `apps/frontend/src/components/features/smartHome/SmartHomeUtils.ts` | UI helpers, icons, label maps |
| `apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts` | Mobile nav registration |
| `apps/frontend/src/app/(dashboard)/dashboard/components/MobileDashboardHome.tsx` | Dashboard summary strip |
| `apps/frontend/src/lib/api/client.ts` | Typed API client methods |
| `apps/frontend/src/types/index.ts` | TypeScript interfaces |

### Workers

| Path | Role |
|---|---|
| `apps/workers/src/jobs/syncSmartHome.job.ts` | Hourly polling runner |
| `apps/workers/src/jobs/smartHomeReadingRollup.job.ts` | Daily raw→aggregate rollup |
| `apps/workers/src/jobs/smartHomeAlertNotify.job.ts` | Critical alert push notifications |
| `apps/workers/src/worker.ts` | Cron/startup registration |
| `apps/workers/prisma/schema.prisma` | Synced mirror of backend Prisma schema |
