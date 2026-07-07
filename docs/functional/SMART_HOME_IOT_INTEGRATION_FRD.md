# Smart Home / IoT Sensor Integration — Functional Requirements Document

> Supersedes `SMART_HOME_INTEGRATION_HUB.md`. That draft was written without reference to the
> Incident scoring pipeline, the Guidance Engine signal system, or the Risk Premium Optimizer's
> mitigation-verification model, all of which already exist in this codebase. It proposed a
> parallel `SmartHomeAlert` → `IncidentService.createFromSmartHomeAlert()` shortcut that would
> fork incident handling into two disconnected systems. This FRD keeps the parts of that draft
> that were sound (OAuth flow, provider clients, reading storage, rollup jobs) and rewires the
> anomaly/alerting path to feed the platform's real signal pipelines instead of inventing new
> ones.

## Table of Contents

1. [Overview](#1-overview)
2. [Relationship to Existing Systems](#2-relationship-to-existing-systems)
3. [Architecture](#3-architecture)
4. [Database Schema](#4-database-schema)
5. [Sync Pipeline](#5-sync-pipeline)
6. [Anomaly Detection → Signal Emission](#6-anomaly-detection--signal-emission)
7. [Incident Pipeline Integration](#7-incident-pipeline-integration)
8. [Guidance Engine Integration](#8-guidance-engine-integration)
9. [Risk Premium Optimizer Integration](#9-risk-premium-optimizer-integration)
10. [Other Integration Points](#10-other-integration-points)
11. [API Reference](#11-api-reference)
12. [Frontend](#12-frontend)
13. [Workers / Background Jobs](#13-workers--background-jobs)
14. [Security & Privacy](#14-security--privacy)
15. [Rollout Phases](#15-rollout-phases)
16. [Open Questions / Risks](#16-open-questions--risks)
17. [File Index](#17-file-index)

---

## 1. Overview

Smart Home / IoT Sensor Integration connects a homeowner's existing connected devices (leak
sensors, smart thermostats, water shutoff valves, energy monitors, smoke/CO detectors) to
Contract to Cozy via each provider's cloud API. Instead of a homeowner manually noting "I
installed a leak sensor under the kitchen sink," the platform polls the device's real state and
readings, and those readings become first-class inputs to systems that already exist:

- The **Incident pipeline** (`src/services/incidents/`) scores and dedupes safety-relevant
  conditions (a leak, a freeze) exactly the way it already scores weather- and inspection-sourced
  incidents — this proposal adds a new `IncidentSourceType.IOT` producer, not a new incident
  system.
- The **Guidance Engine** (`src/services/guidanceEngine/`) turns a detected condition into a
  stepwise resolution journey (diagnose → decide → act) — this proposal adds a new signal intent
  family and journey template, following the same registry pattern as `weather_risk_resolution`.
- The **Risk Premium Optimizer** (`riskPremiumOptimizer.service.ts`) already recommends
  `LEAK_SENSORS`, `AUTO_SHUTOFF_VALVE`, and `SMOKE_CO_DETECTORS` as mitigation actions homeowners
  can take to lower insurance premiums — but today the only way to mark one of those
  `RiskMitigationPlanItem` rows as verified-installed is an uploaded photo
  (`evidenceDocumentId`). This proposal lets a connected device auto-verify that its own
  mitigation category is installed and actively reporting, which is materially stronger evidence
  than a photo for an insurer or for the platform's own confidence scoring.
- **Energy Auditor** gets real kWh data instead of a manual estimate (this was the original
  draft's only integration point, and it's still correct, just incomplete).

### 1.1 Design Principles

- **Feed the existing pipelines, don't fork them.** Any condition worth surfacing to a homeowner
  as an incident or guided journey goes through `IncidentSignal` → `incident.evaluator.ts` and
  `guidanceSignalResolverService.resolveAndPersistSignal()`, the same entry points weather and
  inspection signals already use. Device-only housekeeping (sync failures, token expiry, device
  offline) stays in a lightweight device-health table that never touches those pipelines.
- **Read-only in Phase 1.** No OAuth write scopes are requested from any provider. Device control
  (e.g., closing a smart shutoff valve from within the app) is explicitly out of scope until a
  dedicated safety/liability review — see [Section 15](#15-rollout-phases).
- **Opt-in, per-property, fully revocable.** A homeowner connects on their own schedule; each
  integration is scoped to one property; disconnecting stops polling immediately and data purge is
  available on request.
- **Provider complexity stays behind a normalization layer.** The frontend, Incident pipeline, and
  Guidance Engine only ever see canonical `SmartHomeReading` rows and standard signal payloads —
  never a provider-specific shape.

### 1.2 Scope

**In scope (Phase 1):**
- OAuth-based polling integrations with Ecobee, SmartThings, Google Nest SDM, Green Button
  Connect (utility data), and Emporia Energy (API-key based).
- Device discovery, reading ingestion, daily rollups.
- Rules-based anomaly detection for leak, freeze/temperature, and device-health conditions.
- Wiring anomalies into the Incident pipeline and Guidance Engine as new signal producers.
- Wiring leak-sensor / shutoff-valve / smoke-CO device presence into Risk Premium Optimizer
  mitigation verification.
- Real kWh data into Energy Auditor.
- A dedicated Smart Home Hub page plus a summary widget on the main dashboard.

**Out of scope (Phase 1):**
- Device control / write actions (shutting a valve, changing a thermostat setpoint) — requires
  separate safety review given the platform would be taking a physical action in someone's home.
- Provider webhooks (Phase 1 is polling-only; see [Section 16](#16-open-questions--risks)).
- ML-based anomaly baselines (Phase 1 uses fixed and rolling-average thresholds).
- Multi-user (household) notification fan-out — Phase 1 notifies only the connecting user.
- Automatic `InventoryItem` matching — Phase 1 requires the homeowner to manually link a device to
  an inventory item.

---

## 2. Relationship to Existing Systems

This is the section the original draft was missing. Three subsystems already do work that a naive
"smart home alert" implementation would silently duplicate:

| Existing system | What it already does | What this FRD adds |
|---|---|---|
| Incident pipeline (`Incident`, `IncidentSignal`, `incident.evaluator.ts`, `incident.scoring.ts`) | Ingests signals (`SignalType` enum already includes `SENSOR_READING`), dedupes by `fingerprint`, scores severity, and manages lifecycle (`DETECTED` → `ACTIVE` → `RESOLVED`) | A new `IncidentSourceType.IOT` producer that emits `IncidentSignal` rows with `signalType: SENSOR_READING` for leak and freeze conditions |
| Guidance Engine (`GuidanceSignal`, `GuidanceJourney`, `guidanceTemplateRegistry.ts`) | Turns a signal into a stepwise resolution journey with tool deep-links (e.g. `weather_risk_resolution` walks a homeowner from `home-event-radar` → `coverage-intelligence` → `maintenance` → `booking`) | A new `sensor_incident_resolution` journey template, and reuse of the existing `freeze_risk` intent family when a sensor (not a forecast) detects the cold |
| Risk Premium Optimizer (`RiskMitigationPlanItem`, `MitigationActionType.LEAK_SENSORS` / `AUTO_SHUTOFF_VALVE` / `SMOKE_CO_DETECTORS`) | Recommends mitigation actions and accepts photo evidence (`evidenceDocumentId`) that one was completed | Auto-verification: an active `SmartHomeDevice` of a matching type marks the corresponding plan item's evidence as device-attested rather than photo-attested |

The practical effect: a leak sensor going off doesn't create a bespoke "Smart Home Alert" the
homeowner has to learn to read in a new place. It shows up exactly where a plumber-reported leak
or a weather-driven freeze warning already shows up — the Incident tracker and the Guidance
journey feed — with a device icon instead of a weather icon as the source.

---

## 3. Architecture

### 3.1 High-Level Data Flow

```
Background worker (hourly cron)
        │
        ▼
syncSmartHome.job.ts
  └─ Query ACTIVE SmartHomeIntegration rows, enqueue one BullMQ job per integration
        │
        ▼ (per integration, concurrency 5)
SmartHomeSyncService.syncIntegration()
  ├─ Refresh OAuth token if needed
  ├─ ProviderClient.discoverDevices() → upsert SmartHomeDevice rows
  ├─ ProviderClient.fetchReadings(since: lastSyncAt)
  ├─ SmartHomeNormalizer.normalize() → canonical SmartHomeReading rows
  ├─ Bulk insert readings (skip on dedupeKey conflict)
  └─ SmartHomeAnomalyService.detectAnomalies()
        │
        ├─ Device-health conditions (offline, token expiry, sync failure)
        │     → SmartHomeDeviceAlert row only (no Incident, no Guidance signal)
        │
        └─ Safety/risk conditions (leak, freeze/temp anomaly)
              → SmartHomeIncidentBridge.emit()
                  ├─ IncidentSignal (signalType: SENSOR_READING, sourceType: IOT)
                  │     → incident.evaluator.ts → Incident (existing scoring/dedup)
                  └─ guidanceSignalResolverService.resolveAndPersistSignal()
                        → GuidanceSignal → GuidanceJourney (sensor_incident_resolution
                          or freeze_risk, depending on condition)
```

### 3.2 Service Responsibilities

| Service | Responsibility |
|---|---|
| `smartHome.service.ts` | Integration lifecycle, device CRUD, device-health alert management |
| `smartHomeSync.service.ts` | Polling orchestration per integration |
| `smartHomeOAuth.service.ts` | OAuth state, PKCE, token encryption/refresh |
| `smartHomeAnomaly.service.ts` | Rules evaluation on new readings; separates device-health from safety/risk conditions |
| `smartHomeIncidentBridge.service.ts` **(new)** | The only place that talks to the Incident pipeline and Guidance Engine on behalf of smart home data — mirrors the existing adapter pattern in `src/services/incidents/integrations/maintenanceTask.adapter.ts` |
| `smartHomeMitigationVerification.service.ts` **(new)** | Reconciles active `SmartHomeDevice` rows against open `RiskMitigationPlanItem` rows for the same property; called on sync completion and read by `riskPremiumOptimizer.service.ts` |
| `providers/*.client.ts` | Per-provider API clients (Ecobee, SmartThings, Google Nest SDM, Green Button, Emporia) |
| `providers/smartHomeNormalizer.ts` | Provider payload → canonical reading shape |

---

## 4. Database Schema

### 4.1 Enums

```prisma
enum SmartHomeProvider {
  ECOBEE
  SMARTTHINGS
  GOOGLE_NEST
  GREEN_BUTTON
  EMPORIA
}

enum SmartHomeIntegrationStatus {
  PENDING_AUTH
  ACTIVE
  TOKEN_EXPIRED
  ERROR
  DISCONNECTED
}

enum SmartHomeDeviceType {
  THERMOSTAT
  LEAK_SENSOR
  SHUTOFF_VALVE
  ENERGY_MONITOR
  SMART_PANEL
  UTILITY_METER
  SMOKE_CO_DETECTOR
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
  SMOKE_DETECTED
  CO_DETECTED
}

// Device-health only. Safety/risk conditions do NOT use this enum —
// they go through the existing IncidentSourceType / SignalType enums instead.
enum SmartHomeDeviceAlertType {
  HIGH_ENERGY_USAGE
  UNUSUAL_HVAC_RUNTIME
  UTILITY_SPIKE
  DEVICE_OFFLINE
  TOKEN_EXPIRY_WARNING
  SYNC_FAILURE
}

enum SmartHomeDeviceAlertSeverity {
  INFO
  WARNING
}

enum SmartHomeDeviceAlertStatus {
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

`IncidentSourceType` gains one new value (it already has `WEATHER | COVERAGE | MODEL | IOT |
MANUAL | SYSTEM` — **`IOT` already exists in the schema today**, unused). No migration needed
there; this feature is the first producer to populate it.

### 4.2 Models

#### `SmartHomeIntegration` — OAuth connection per property + provider

One row per `(propertyId, provider)`. A user can connect the same provider to multiple
properties independently.

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `propertyId` | String | FK → Property |
| `userId` | String | FK → User (who authorized the connection) |
| `provider` | `SmartHomeProvider` | |
| `status` | `SmartHomeIntegrationStatus` | |
| `accessToken` / `refreshToken` | String? | AES-256-GCM encrypted |
| `tokenExpiresAt` | DateTime? | Drives proactive refresh |
| `providerAccountId` / `providerAccountLabel` | String? | |
| `scopes` | String[] | Granted OAuth scopes (read-only in Phase 1) |
| `lastSyncAt` / `lastSyncError` | DateTime? / String? | |
| `syncFailureCount` | Int | |
| `metaJson` | Json? | Provider-specific metadata |
| `createdAt` / `updatedAt` | DateTime | |

**Unique:** `propertyId + provider`. **Indexes:** `propertyId`, `userId`, `status`, `provider`,
`tokenExpiresAt`.

#### `SmartHomeDevice` — discovered device

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `integrationId` / `propertyId` | String | FK, `propertyId` denormalized for scoped queries |
| `providerDeviceId` | String | |
| `name` / `displayName` | String / String? | Provider name / user override |
| `deviceType` | `SmartHomeDeviceType` | |
| `status` | `SmartHomeDeviceStatus` | |
| `locationLabel` | String? | Room/zone from provider |
| `inventoryItemId` | String? | FK → InventoryItem (manual link, Phase 1) |
| `mitigationPlanItemId` | String? | **New** — FK → RiskMitigationPlanItem, set when this device auto-verifies a mitigation (see [Section 9](#9-risk-premium-optimizer-integration)) |
| `lastReadingAt` / `lastReadingJson` | DateTime? / Json? | |
| `metaJson` | Json? | |
| `isActive` | Boolean | False when removed from provider or integration disconnected |
| `createdAt` / `updatedAt` | DateTime | |

**Unique:** `integrationId + providerDeviceId`. **Indexes:** `integrationId`, `propertyId`,
`deviceType`, `status`, `isActive`, `mitigationPlanItemId`.

#### `SmartHomeReading` — append-only time series

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `deviceId` / `propertyId` / `integrationId` | String | FKs, latter two denormalized |
| `readingType` | `SmartHomeReadingType` | |
| `value` | Decimal(12,4) | |
| `unit` | String | |
| `recordedAt` | DateTime | Provider-reported time |
| `ingestedAt` | DateTime | For lag/audit tracking |
| `providerReadingId` | String? | |
| `dedupeKey` | String (unique) | `deviceId:readingType:recordedAt` |
| `metaJson` | Json? | Raw payload slice |

**Indexes:** `deviceId + readingType + recordedAt`, `propertyId + readingType + recordedAt`,
`integrationId`, `dedupeKey`.

> Volume note: thermostat readings arrive ~every 5 min, energy monitors ~every 15 min. Raw
> readings are retained 60 days, then rolled up (below) and purged.

#### `SmartHomeReadingAggregate` — daily rollup

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `deviceId` / `propertyId` | String | |
| `readingType` | `SmartHomeReadingType` | |
| `date` | DateTime | UTC midnight |
| `minValue` / `maxValue` / `avgValue` / `sumValue` | Decimal(12,4) | |
| `readingCount` | Int | |
| `unit` | String | |

**Unique:** `deviceId + readingType + date`. **Indexes:** `propertyId + readingType + date`,
`deviceId + date`.

#### `SmartHomeDeviceAlert` — device-health alert only

Deliberately narrow scope — anything safety/risk-relevant does **not** live here (see
[Section 6](#6-anomaly-detection--signal-emission)).

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `propertyId` / `deviceId` / `integrationId` | String | `deviceId` nullable for integration-level alerts |
| `alertType` | `SmartHomeDeviceAlertType` | |
| `severity` | `SmartHomeDeviceAlertSeverity` | INFO / WARNING only — no CRITICAL here by design |
| `status` | `SmartHomeDeviceAlertStatus` | |
| `title` / `summary` | String | |
| `dedupeKey` | String (unique) | `deviceId:alertType:window` |
| `resolvedAt` / `resolvedByUserId` | DateTime? / String? | |
| `metaJson` | Json? | |
| `createdAt` / `updatedAt` | DateTime | |

**Indexes:** `propertyId + status`, `deviceId`, `integrationId`, `createdAt`.

#### `SmartHomeSyncLog` — sync audit trail

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `integrationId` | String | |
| `trigger` | `SmartHomeSyncTrigger` | |
| `startedAt` / `completedAt` | DateTime / DateTime? | |
| `devicesFound` / `readingsInserted` | Int | |
| `incidentSignalsEmitted` / `guidanceSignalsEmitted` | Int | **New** — observability into how much of this integration's traffic reaches the real pipelines, separate from `readingsInserted` |
| `errorMessage` | String? | |
| `durationMs` | Int? | |

**Indexes:** `integrationId + startedAt`, `startedAt`.

---

## 5. Sync Pipeline

`SmartHomeSyncService.syncIntegration(integrationId, trigger)`:

1. Load integration, decrypt tokens, refresh via `SmartHomeOAuthService.refreshTokenIfNeeded()` if
   `tokenExpiresAt` is within 5 minutes.
2. `ProviderClient.discoverDevices()` → upsert `SmartHomeDevice` rows.
3. `ProviderClient.fetchReadings(since: lastSyncAt)` for each device.
4. `SmartHomeNormalizer.normalize()` → canonical `NormalizedReading[]`.
5. Bulk insert as `SmartHomeReading` (skip on `dedupeKey` conflict).
6. Update `device.lastReadingJson`.
7. `SmartHomeAnomalyService.detectAnomalies(propertyId, newReadings)` — see Section 6.
8. `SmartHomeMitigationVerificationService.reconcile(propertyId)` — see Section 9.
9. Update `integration.lastSyncAt`, clear `lastSyncError`, reset `syncFailureCount`.
10. Write `SmartHomeSyncLog` row including signal-emission counts.

Provider clients implement a shared interface (unchanged from the original draft, this part was
correct):

```typescript
interface SmartHomeProviderClient {
  discoverDevices(integration: SmartHomeIntegration): Promise<RawDevice[]>
  fetchReadings(integration: SmartHomeIntegration, device: SmartHomeDevice, since: Date): Promise<RawReading[]>
}
```

Phase 1 providers: **Ecobee** (thermostat runtime/temp/humidity, OAuth 2.0), **SmartThings**
(leak/motion/temp/humidity sensors, OAuth 2.0), **Google Nest SDM** (thermostat + camera/doorbell
status, OAuth 2.0 + GCP), **Green Button Connect** (utility interval/bill data, OAuth 2.0, ESPI
standard), **Emporia Energy** (panel/circuit kWh, API key).

OAuth flow (PKCE, Redis-backed state with 10-minute TTL, AES-256-GCM token encryption) is
unchanged from the original draft — see that document's OAuth Flow diagram for the full sequence;
it did not need correction.

---

## 6. Anomaly Detection → Signal Emission

`SmartHomeAnomalyService` runs after every sync batch. Each rule fires at most once per dedupe
window. **The critical design change from the original draft is the right-hand column**: safety
conditions do not create a `SmartHomeAlert` and stop there — they call the incident bridge.

| Rule | Trigger | Reading type | Where it goes |
|---|---|---|---|
| Leak detected | Any `WATER_LEAK_DETECTED` value > 0 | `WATER_LEAK_DETECTED` | **Incident bridge** → `IncidentSignal(signalType: SENSOR_READING)` + Guidance signal (`sensor_incident_resolution`, family `water_leak_detected`) |
| Freeze / temperature anomaly | Indoor temp < 40°F or > 95°F | `TEMPERATURE_F` | **Incident bridge**, reusing the existing `freeze_risk` Guidance family so a sensor-detected freeze surfaces in the same journey as a forecast-detected one |
| Smoke/CO detected | `SMOKE_DETECTED` or `CO_DETECTED` value > 0 | `SMOKE_DETECTED` / `CO_DETECTED` | **Incident bridge**, family `smoke_co_alert`, `severity: CRITICAL` |
| Device offline | Status `OFFLINE` across 2 consecutive syncs | — | `SmartHomeDeviceAlert` only (`DEVICE_OFFLINE`, WARNING) — **exception:** if the offline device is currently backing a verified `RiskMitigationPlanItem` (Section 9), also flags that plan item as `verificationStale` |
| High energy usage | Daily kWh > 3× rolling 30-day avg | `ENERGY_KWH` | `SmartHomeDeviceAlert` only (INFO) |
| Unusual HVAC runtime | Daily runtime > 2× rolling 30-day avg | `HVAC_RUNTIME_MINUTES` | `SmartHomeDeviceAlert` only (WARNING) |
| Utility spike | Monthly bill > 1.5× prior 3-month avg | `UTILITY_BILL_USD` | `SmartHomeDeviceAlert` only (INFO) |
| Token expiry | `tokenExpiresAt` < 3 days out | — | `SmartHomeDeviceAlert` only (INFO) |

Device-health alerts (`SmartHomeDeviceAlert`) are surfaced only inside the Smart Home Hub itself —
they are intentionally not visible in the property-wide Incident tracker, because a homeowner
should not have to parse "your thermostat's cloud token expires in 3 days" as if it were a home
risk. Safety conditions, by contrast, are indistinguishable in the Incident tracker and Guidance
feed from any other source — which is the point.

---

## 7. Incident Pipeline Integration

`SmartHomeIncidentBridge.emit()` (new, in `src/services/incidents/integrations/`, alongside the
existing `maintenanceTask.adapter.ts`) is the only writer into `IncidentSignal` on behalf of smart
home data:

```typescript
await prisma.incidentSignal.create({
  data: {
    incidentId: /* resolved via existing fingerprint-based upsert, same as other producers */,
    signalType: 'SENSOR_READING',
    externalRef: reading.id,
    observedAt: reading.recordedAt,
    payload: {
      deviceId: device.id,
      deviceType: device.deviceType,
      readingType: reading.readingType,
      value: reading.value,
      provider: integration.provider,
    },
    scoreHint: ruleConfig.scoreHint, // e.g. leak = high, freeze = medium
    confidence: 95, // device telemetry is treated as high-confidence vs. inferred signals
  },
});
```

The `Incident.sourceType` for any incident whose *first* signal came from this bridge is set to
`IOT` (existing enum value, previously unused). `incident.evaluator.ts` and `incident.scoring.ts`
are otherwise untouched — dedup by `fingerprint`, severity scoring, and lifecycle transitions
(`DETECTED → EVALUATED → ACTIVE → ...`) all run exactly as they do for weather- or
inspection-sourced incidents. This is the whole point of routing through the existing pipeline:
zero new dedup/scoring logic to maintain.

`fingerprint` construction for sensor-sourced incidents follows the same convention as other
producers: `propertyId + typeKey + roomId` (e.g. a leak sensor under the kitchen sink and a
homeowner-reported kitchen leak should collapse into the same incident, not two).

---

## 8. Guidance Engine Integration

Two paths, depending on condition type:

**Freeze/temperature anomaly** reuses the existing `weather_risk_resolution` journey template and
its `freeze_risk` signal intent family — a sensor is just another `sourceEntityType` alongside a
weather forecast. Call shape:

```typescript
await guidanceSignalResolverService.resolveAndPersistSignal({
  propertyId,
  signalIntentFamily: 'freeze_risk',
  sourceEntityType: 'SMART_HOME_DEVICE',
  sourceEntityId: device.id,
  sourceToolKey: 'smart-home',
  sourceFeatureKey: 'temperature-anomaly',
  payloadJson: { deviceId: device.id, value: reading.value, unit: reading.unit },
});
```

**Leak and smoke/CO detection** need a **new journey template**, `sensor_incident_resolution`,
registered in `guidanceTemplateRegistry.ts` following the exact shape of
`weather_risk_resolution`:

```typescript
sensor_incident_resolution: {
  journeyTypeKey: 'sensor_incident_resolution',
  journeyKey: 'journey_sensor_incident_resolution',
  version: '1.0.0',
  signalIntentFamilies: ['water_leak_detected', 'smoke_co_alert'],
  issueDomain: 'SAFETY',
  defaultDecisionStage: 'AWARENESS',
  defaultReadiness: 'NEEDS_CONTEXT',
  canonicalFirstStepKey: 'sensor_safety_check',
  steps: [ /* diagnosis → containment (booking an emergency plumber/electrician) →
              coverage check → claim intake if damage already occurred → resolution log */ ],
}
```

Step → tool routing table addition:

```typescript
sensor_incident_resolution: {
  emergency: 'sensor_safety_check',              // pre-fills the Emergency chatbot with device context
  'coverage-intelligence': 'check_sensor_coverage',
  booking: 'route_emergency_technician',
  claims: 'file_claim_if_damage_occurred',        // only reached if the journey records damage
  'guidance-overview': 'track_resolution',
}
```

The `ISSUE_DOMAIN_BY_FAMILY` map in `guidanceSignalResolver.service.ts` gains two entries:
`water_leak_detected: 'SAFETY'`, `smoke_co_alert: 'SAFETY'`.

Because `emergency.routes.ts` today only accepts a user-typed chat message, a `CRITICAL`
sensor-sourced incident should be able to **pre-fill** that first message (device name, location,
reading value, time) rather than requiring the homeowner to describe a problem their own sensor
already fully described. This is a small addition to `emergencyTroubleshooter.service.ts` — accept
an optional `contextPayload` alongside the chat message — not a new endpoint.

---

## 9. Risk Premium Optimizer Integration

This is the most concrete monetizable hook and did not exist in the original draft at all.

`RiskMitigationPlanItem.actionType` already includes `LEAK_SENSORS`, `AUTO_SHUTOFF_VALVE`, and
`SMOKE_CO_DETECTORS` as recommendations the optimizer surfaces to reduce a homeowner's insurance
exposure. Today, `status` moves to `COMPLETED` only via manual `evidenceDocumentId` (a photo
upload). A connected device is stronger evidence than a photo — it proves the mitigation is not
just installed but *currently functioning*.

`SmartHomeMitigationVerificationService.reconcile(propertyId)` runs at the end of every sync:

1. Load open (`RECOMMENDED` or `IN_PROGRESS`) `RiskMitigationPlanItem` rows for the property.
2. Map `actionType` → matching `SmartHomeDeviceType`:
   - `LEAK_SENSORS` → `LEAK_SENSOR`
   - `AUTO_SHUTOFF_VALVE` → `SHUTOFF_VALVE`
   - `SMOKE_CO_DETECTORS` → `SMOKE_CO_DETECTOR`
3. If an `ONLINE` device of the matching type exists for the property (and has reported at least
   one reading in the last 48 hours), mark the plan item `COMPLETED`, set
   `SmartHomeDevice.mitigationPlanItemId`, and write `mitigationVerification` into the analysis's
   `inputsSnapshot` with `observedDirection` reflecting device-attested evidence (reusing the
   existing `mitigationVerification` shape already read by `riskPremiumOptimizer.service.ts` —
   see `parseMitigationVerificationFromSnapshot`) rather than introducing a new evidence type.
4. If a previously verifying device goes `OFFLINE` for more than 48 hours (or its integration is
   disconnected), flag the plan item's verification as `verificationStale` — a device that stopped
   reporting is not proof the mitigation was removed, but it's no longer live proof it's working,
   so the optimizer should show a "verify still installed" nudge rather than silently keeping
   `COMPLETED` status indefinitely.

This closes a loop the platform already half-built: it already tells homeowners "install a leak
sensor to lower your risk profile," it just had no way to confirm they actually did — or that it's
still working six months later.

---

## 10. Other Integration Points

### Energy Auditor
`GET /api/properties/:propertyId/smart-home/energy` pre-populates the "actual usage" field when
`ENERGY_KWH` / `UTILITY_BILL_KWH` devices are connected, with a "Powered by [Provider]" badge. Flow
is unchanged from the original draft. Falls back to manual input when no energy data exists.

### Claims Assistance
When a `sensor_incident_resolution` journey reaches the claim-intake step
(`src/services/claims/claims.service.ts`), the triggering device's reading history (e.g., the
temperature trend leading up to a pipe freeze, or the leak sensor's detection timestamp) is
attached as supporting documentation on the claim draft — timestamped device evidence is
materially more useful to an adjuster than a homeowner's after-the-fact description.

### Home Events
Any incident whose `sourceType` is `IOT` and reaches `RESOLVED` status creates a `HomeEvent` via
the same path other resolved incidents already use (`eventType: MAINTENANCE` or `REPAIR`,
`importance: HIGH`), so it appears in the property's timeline and resale-facing Gazette exactly
like any other maintenance event.

### Mobile dashboard
`GET /api/properties/:propertyId/smart-home/summary` powers a dashboard strip (connected provider
count, active device count, new device-health alert count, today's kWh). Hidden entirely if no
integrations exist for the property. Separately, an **open** `IOT`-sourced Incident already shows
up wherever the Incident summary widget already renders — no new widget needed there.

---

## 11. API Reference

All endpoints require `Authorization: Bearer <token>`; property-scoped endpoints apply
`propertyAuth.middleware`.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/properties/:propertyId/smart-home/integrations/initiate` | Generate OAuth state + PKCE challenge, return provider auth URL |
| `GET` | `/api/properties/:propertyId/smart-home/integrations/callback` | Exchange code for tokens, create integration, enqueue `POST_CONNECT` sync |
| `GET` | `/api/properties/:propertyId/smart-home/integrations` | List integrations (status, provider, last sync) |
| `POST` | `/api/properties/:propertyId/smart-home/integrations/:id/sync` | Manual sync (rate-limited: 1 per integration per 5 min) |
| `DELETE` | `/api/properties/:propertyId/smart-home/integrations/:id` | Disconnect; `?purgeData=true` hard-deletes readings/devices |
| `GET` | `/api/properties/:propertyId/smart-home/devices` | List devices |
| `GET` | `/api/properties/:propertyId/smart-home/devices/:id` | Device detail + latest reading |
| `PATCH` | `/api/properties/:propertyId/smart-home/devices/:id` | Update `displayName` / `inventoryItemId` |
| `GET` | `/api/properties/:propertyId/smart-home/devices/:id/readings` | Paginated time series (`raw` or `daily` resolution) |
| `GET` | `/api/properties/:propertyId/smart-home/energy` | 30-day energy summary (for Energy Auditor) |
| `GET` | `/api/properties/:propertyId/smart-home/energy/chart` | Daily kWh, last N days |
| `GET` | `/api/properties/:propertyId/smart-home/device-alerts` | Device-health alerts only (paginated, filterable) |
| `PATCH` | `/api/properties/:propertyId/smart-home/device-alerts/:id/status` | Acknowledge / resolve / dismiss |
| `GET` | `/api/properties/:propertyId/smart-home/summary` | Dashboard widget summary |
| `GET` | `/api/properties/:propertyId/smart-home/mitigation-status` | **New** — per-device mitigation verification status, consumed by the Risk Premium Optimizer UI |

Safety conditions (leak, freeze, smoke/CO) are deliberately **not** exposed through a
`smart-home/alerts` endpoint — they are read through the existing `GET
/api/incidents` and Guidance journey endpoints, so the frontend has exactly one place to look for
"something is wrong," regardless of source.

---

## 12. Frontend

| File | Purpose |
|---|---|
| `app/(dashboard)/dashboard/smart-home/page.tsx` | Hub — integrations, devices, energy trend, device-health alerts |
| `app/(dashboard)/dashboard/smart-home/connect/page.tsx` | Provider selection + OAuth initiation |
| `app/(dashboard)/dashboard/properties/[id]/tools/smart-home/page.tsx` | Property-scoped entry point |
| `components/features/smartHome/IntegrationCard.tsx` | Connection status, last sync, sync/disconnect actions |
| `components/features/smartHome/DeviceCard.tsx` | Device status + latest reading; shows a "Verifying [mitigation]" badge when `mitigationPlanItemId` is set |
| `components/features/smartHome/DeviceHealthAlertFeed.tsx` | Device-health alerts only (renamed from the original draft's `SmartHomeAlertFeed` to make the scope explicit) |
| `components/features/smartHome/EnergyTrendChart.tsx` | 30-day daily kWh bar chart |
| `components/features/riskPremiumOptimizer/MitigationVerificationBadge.tsx` **(new)** | Rendered on the existing Risk Premium Optimizer mitigation plan list; shows "Verified by [Device]" vs. "Photo evidence" vs. "Needs verification" |

Safety conditions render through the **existing** Incident and Guidance UI components
(`guidance` feature slice) — no new "smart home incident card" component is built. The only
smart-home-specific visual marker on an incident/journey card is a device-source icon instead of a
weather/inspection icon, driven off `Incident.sourceType === 'IOT'`.

---

## 13. Workers / Background Jobs

| File | Purpose | Schedule |
|---|---|---|
| `workers/src/jobs/syncSmartHome.job.ts` | Poll all `ACTIVE` integrations, fan out via BullMQ | `SMART_HOME_SYNC_CRON`, default `0 * * * *` |
| `workers/src/jobs/smartHomeReadingRollup.job.ts` | Roll raw readings > 60 days into `SmartHomeReadingAggregate`, then purge raw rows | `SMART_HOME_ROLLUP_CRON`, default `0 3 * * *` |
| `workers/src/jobs/smartHomeDeviceHealthNotify.job.ts` | Push/in-app notification for new device-health WARNING alerts | Triggered post-sync |

Safety-condition notifications are **not** a separate job — they ride the existing incident/
guidance notification paths that already fire when an `Incident` reaches `ACTIVE` or a
`GuidanceJourney` is created, so a leak alert and a plumber-reported leak notify the homeowner
identically.

### Environment Variables

| Var | Purpose | Default |
|---|---|---|
| `SMART_HOME_SYNC_CRON` | Sync schedule | `0 * * * *` |
| `SMART_HOME_ROLLUP_CRON` | Rollup schedule | `0 3 * * *` |
| `SMART_HOME_SYNC_CONCURRENCY` | BullMQ concurrency | `5` |
| `SMART_HOME_TOKEN_SECRET` | AES-256-GCM key for token encryption | Required |
| `SMART_HOME_ENABLED_PROVIDERS` | Comma-separated enabled providers | `ECOBEE,SMARTTHINGS,GREEN_BUTTON` |
| `ECOBEE_CLIENT_ID` / `ECOBEE_CLIENT_SECRET` | | Required if Ecobee enabled |
| `SMARTTHINGS_CLIENT_ID` / `SMARTTHINGS_CLIENT_SECRET` | | Required if SmartThings enabled |
| `GOOGLE_NEST_CLIENT_ID` / `GOOGLE_NEST_CLIENT_SECRET` / `GOOGLE_NEST_PROJECT_ID` | | Required if Nest enabled |
| `EMPORIA_API_KEY` | | Required if Emporia enabled |

---

## 14. Security & Privacy

- **Token encryption:** AES-256-GCM, key from `SMART_HOME_TOKEN_SECRET`, never in code.
- **PKCE + CSRF state:** 32-byte random state in Redis, 10-minute TTL, rejected if unknown/expired.
- **Property-level auth:** all endpoints guarded by `propertyAuth.middleware`.
- **No write scopes requested from any provider in Phase 1.**
- **Data purge on disconnect:** `purgeData=true` hard-deletes readings, aggregates, device-health
  alerts, and devices in a transaction. `purgeData=false` stops polling but retains history.
- **Manual sync rate limit:** 1 call per integration per 5 minutes.
- **Incident/Guidance data retention:** sensor-sourced incidents and journeys follow the exact
  retention/visibility rules already governing every other incident source — no special-casing.

---

## 15. Rollout Phases

| Phase | Scope |
|---|---|
| **1 (this FRD)** | Ecobee, SmartThings, Google Nest SDM, Green Button, Emporia. Read-only. Incident/Guidance/Risk-Premium-Optimizer integration as specified above. |
| **2** | Provider webhooks (Ecobee, SmartThings support them) to cut leak-detection latency from up to 1 hour (polling) to under a minute. Automatic `InventoryItem` matching. ML-based anomaly baselines replacing fixed/rolling-average thresholds. Multi-user household notification fan-out. |
| **3 (requires separate safety/liability review)** | Device *control* — closing a smart shutoff valve automatically on `CRITICAL` leak detection, or on user-confirmed one-tap action from the Emergency flow. This is the highest-value and highest-risk extension (actual water-damage prevention, not just faster detection) and should not be scoped further until legal/insurance-partnership review happens; flagged here only so it isn't silently forgotten. |
| **Future providers** | Flo by Moen (purpose-built water monitoring/shutoff), Span smart panel, Sense energy monitor, Ring. |

---

## 16. Open Questions / Risks

1. **Exact weather→Incident/Guidance dual-emission wiring.** `weather.service.ts` populates
   `SignalType.WEATHER_FORECAST_MIN_TEMP` for the Incident side and the `freeze_risk` Guidance
   family is fed independently; the precise call path connecting a single weather event to *both*
   pipelines was not fully traced during this FRD's research. Before implementing
   `smartHomeIncidentBridge.service.ts`, confirm with whoever owns `weather.service.ts` /
   `incident.orchestrator.ts` whether there's a shared "dual-emit" helper to reuse rather than
   duplicating the two calls independently.
2. **Green Button coverage gaps.** Not all US utilities expose a Green Button endpoint; those
   homeowners fall back to Emporia or manual entry. No workaround planned for Phase 1.
2a. **Emporia auth model.** API-key (not OAuth) — stored server-side under the same encryption
   scheme; confirm this satisfies the same security bar as OAuth tokens before enabling in
   production.
3. **Mitigation verification false confidence.** A device reporting "online" proves connectivity,
   not correct installation (e.g., a leak sensor placed somewhere useless still reports "online, no
   leak"). The verification language in the UI and any insurer-facing export must be careful to say
   "device present and reporting" rather than implying professional installation was verified.
4. **Rate limits across providers vary widely** (Ecobee and SmartThings are generous; Emporia and
   Green Button are less documented) — `SMART_HOME_SYNC_CONCURRENCY` and per-provider backoff need
   load testing against real accounts before raising the default sync frequency.
5. **Guidance template versioning.** `weather_risk_resolution` is already at `version: '1.3.0'`
   with prior P0/P1 issues logged in `GUIDANCE_ENGINE_FRD.md` Section 10. The new
   `sensor_incident_resolution` template should be reviewed against those same gap categories
   (wrong tool for a step, missing execution step, step differentiation) before launch rather than
   repeating them.

---

## 17. File Index

### Backend

| Path | Role |
|---|---|
| `apps/backend/src/routes/smartHome.routes.ts` | Routes + middleware |
| `apps/backend/src/controllers/smartHome.controller.ts` | Request handlers |
| `apps/backend/src/services/smartHome.service.ts` | Integration/device CRUD, device-health alerts |
| `apps/backend/src/services/smartHomeSync.service.ts` | Polling orchestrator |
| `apps/backend/src/services/smartHomeAnomaly.service.ts` | Rule evaluation, routes to device-health vs. incident bridge |
| `apps/backend/src/services/smartHomeOAuth.service.ts` | OAuth/PKCE/token encryption |
| `apps/backend/src/services/smartHomeMitigationVerification.service.ts` **(new)** | Risk Premium Optimizer reconciliation |
| `apps/backend/src/services/incidents/integrations/smartHomeIncidentBridge.service.ts` **(new)** | Only writer into `IncidentSignal` + Guidance signals on behalf of smart home data |
| `apps/backend/src/services/providers/{ecobee,smartThings,googleNestSdm,greenButton,emporia}.client.ts` | Provider clients |
| `apps/backend/src/services/providers/smartHomeNormalizer.ts` | Payload normalization |
| `apps/backend/src/validators/smartHome.validators.ts` | Zod v4 schemas |
| `apps/backend/prisma/schema.prisma` | New models/enums; `IncidentSourceType.IOT` (existing, now used); two new `ISSUE_DOMAIN_BY_FAMILY` entries |
| `apps/backend/src/services/guidanceEngine/guidanceTemplateRegistry.ts` | New `sensor_incident_resolution` template |
| `apps/backend/src/services/emergencyTroubleshooter.service.ts` | Accept optional `contextPayload` for pre-filled sensor context |
| `apps/backend/src/services/riskPremiumOptimizer.service.ts` | Read device-attested `mitigationVerification` (existing shape, new source) |
| `apps/backend/src/services/claims/claims.service.ts` | Attach device reading history to claim drafts |

### Frontend

| Path | Role |
|---|---|
| `apps/frontend/src/app/(dashboard)/dashboard/smart-home/page.tsx` | Hub page |
| `apps/frontend/src/app/(dashboard)/dashboard/smart-home/connect/page.tsx` | Provider selection |
| `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/smart-home/page.tsx` | Property-scoped entry |
| `apps/frontend/src/components/features/smartHome/*` | Hub components (see Section 12) |
| `apps/frontend/src/components/features/riskPremiumOptimizer/MitigationVerificationBadge.tsx` | New badge on existing optimizer UI |
| `apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts` | Mobile nav registration |
| `apps/frontend/src/lib/api/client.ts` | Typed API client methods |
| `apps/frontend/src/types/index.ts` | TypeScript interfaces |

### Workers

| Path | Role |
|---|---|
| `apps/workers/src/jobs/syncSmartHome.job.ts` | Hourly polling |
| `apps/workers/src/jobs/smartHomeReadingRollup.job.ts` | Daily rollup/purge |
| `apps/workers/src/jobs/smartHomeDeviceHealthNotify.job.ts` | Device-health notifications only |
| `apps/workers/src/worker.ts` | Cron registration |
| `apps/workers/prisma/schema.prisma` | Synced mirror of backend schema |
