# Permit History & Unpermitted Work Tracker

## Overview

Permit History & Unpermitted Work Tracker gives homeowners a complete picture of the legal permit record for their property — what was filed, whether work was inspected and closed, what appears to lack a permit, and a disclosure-ready export for resale.

The feature operates across three time horizons:

1. **Historical** — Pull or manually enter permits filed before the current owner acquired the property. Surfaces unpermitted prior work the homeowner may be inheriting liability for.
2. **Present** — Cross-reference current home assets (HVAC, roof, additions, electrical panels) against the permit record to flag gaps where significant work appears to have been done without a permit.
3. **Active** — For permits the homeowner pulls now or in the future, track required inspection milestones through to final close-out and retain the permit documents.

---

## Scope Boundary vs Home Renovation Advisor

The existing Home Renovation Advisor answers: *"If I want to do this renovation, what permits would I need?"* — a forward-looking compliance analysis for planned work.

This feature answers: *"What permits have actually been filed for this property, and is there work here that was never permitted?"* — an historical and factual record of what was actually done.

| Dimension | Permit History Tracker | Home Renovation Advisor |
|---|---|---|
| Orientation | Historical + active record | Forward-looking advisory |
| Data source | Municipal open data APIs + manual entry | Rules-based advisor engine |
| Key model | `PropertyPermitRecord` (actual filings) | `HomeRenovationPermitOutput` (required permits for planned work) |
| Permit type model | `PermitRecordCategory` (new enum) | `RenovationPermitType` (existing enum) |
| Cross-reference | Compares actual permits against installed assets | Assesses compliance risk for a scenario |

The two features link at one point: when the Renovation Advisor determines a permit is `REQUIRED`, a CTA in its output can open the Permit Tracker to start an active permit tracking record for that project.

---

## Feature Components

### 1. Open Data Pull

Automatically query known municipal permit databases for the property's address. Supported via a Socrata-adapter pattern that handles most major US cities. Returns historical permit records with permit numbers, issue dates, work types, and status.

### 2. Manual Permit Entry

Universal fallback for jurisdictions without open data. Homeowners can enter permit details manually and attach permit documents from their records. Manual entries carry the same model structure as API-sourced records.

### 3. Unpermitted Work Detection Engine

Rules-based cross-reference between:
- `HomeAsset` records (HVAC, roof, water heater, electrical panel, additions) with installation/replacement dates
- `InventoryItem` records where the category implies major work (structural, mechanical, electrical)
- `PropertyPermitRecord` rows for the property

When a major installed system has no permit in the right date window and work type, a `PermitUnpermittedFlag` is created for investigation. Flags are explicitly non-definitive — the homeowner investigates and marks each as confirmed, resolved, or dismissed.

### 4. Active Permit Tracker

For permits the homeowner pulls going forward: log the permit, generate inspection milestone checkpoints by permit type, track each inspection result, upload final documents, and close out the permit. Inspection reminders fire via the existing notification system.

### 5. Disclosure Pack Export

On demand, generate a PDF summary of all permits and unresolved flags for resale disclosure, broker review, or personal records. Export includes permit list with statuses, flagged unpermitted items with investigation state, and a disclaimer.

---

## Database

### Enums

```prisma
enum PermitRecordCategory {
  BUILDING
  ELECTRICAL
  PLUMBING
  MECHANICAL
  STRUCTURAL
  ROOFING
  ZONING
  DEMOLITION
  GRADING
  FIRE
  OTHER
}

enum PermitWorkType {
  HVAC_NEW
  HVAC_REPLACEMENT
  ELECTRICAL_PANEL
  ELECTRICAL_WIRING
  PLUMBING_NEW
  PLUMBING_REPAIR
  ROOF_REPLACEMENT
  ROOF_REPAIR
  ROOM_ADDITION
  GARAGE_CONVERSION
  ADU
  BASEMENT_FINISH
  DECK_PATIO
  FENCE
  SWIMMING_POOL
  SOLAR
  WINDOWS_DOORS
  FIREPLACE
  SEWER_WATER_LINE
  STRUCTURAL_REPAIR
  INTERIOR_REMODEL
  EXTERIOR_REMODEL
  DEMOLITION
  GRADING_DRAINAGE
  OTHER
}

enum PermitRecordStatus {
  APPLIED          // Application submitted, not yet issued
  ISSUED           // Permit issued, work may be in progress
  INSPECTION_PENDING // Permit issued, awaiting required inspections
  INSPECTION_FAILED  // At least one inspection did not pass
  FINALED          // All inspections passed, permit closed
  EXPIRED          // Permit expired without being finaled
  VOIDED           // Cancelled
  UNKNOWN          // Status not available from source
}

enum PermitRecordSource {
  OPEN_DATA_API    // Fetched from a municipal open data endpoint
  MANUAL_ENTRY     // Homeowner entered by hand
  DOCUMENT_UPLOAD  // Extracted from uploaded permit document
}

enum PermitInspectionStatus {
  NOT_SCHEDULED
  SCHEDULED
  PASSED
  FAILED
  PARTIAL          // Inspector approved some items, flagged others
  CANCELLED
}

enum PermitUnpermittedFlagStatus {
  FLAGGED          // Detected, not yet reviewed
  INVESTIGATING    // Homeowner is looking into it
  CONFIRMED_PERMITTED   // A permit was found (linked or discovered externally)
  CONFIRMED_UNPERMITTED // Confirmed no permit was pulled
  WILL_REMEDIATE   // Homeowner plans to pull a retroactive or new permit
  REMEDIATED       // Retroactive or new permit obtained
  DISMISSED        // Homeowner has reviewed and dismissed (risk accepted or evidence found outside platform)
}

enum PermitUnpermittedFlagTrigger {
  ASSET_CROSS_REFERENCE     // HomeAsset with installation date and no matching permit
  INVENTORY_CROSS_REFERENCE // InventoryItem category implies permitted work
  INSPECTION_REPORT_FINDING // Issue from inspection report upload implies unpermitted work
  MANUAL                    // Homeowner manually flagged an item
}

enum PermitDisclosureRisk {
  LOW     // Common, easily remediated (e.g., deck without permit)
  MEDIUM  // Worth disclosing but may not block a sale
  HIGH    // Likely to surface in buyer inspection; may affect sale or financing
}

enum PermitDataSourceAdapter {
  SOCRATA   // Covers most major US cities (Chicago, NYC, LA, Seattle, Austin, SF, etc.)
  ACCELA    // Accela Civic Platform API
  CUSTOM    // Municipality-specific bespoke adapter
}

enum PermitDataSourceCoverageType {
  CITY
  COUNTY
  STATE
}

enum PermitDataSourceStatus {
  ACTIVE
  INACTIVE
  ERROR
  RATE_LIMITED
}

enum PermitFetchTrigger {
  PROPERTY_ONBOARDING  // Auto-triggered when property is added
  USER_REQUEST         // Homeowner tapped "Refresh Permit Data"
  SCHEDULED            // Periodic re-check (monthly)
}

enum PermitFetchJobStatus {
  QUEUED
  RUNNING
  COMPLETED
  FAILED
  NO_DATA_SOURCE      // No open data available for this municipality
}

enum PermitDisclosureExportStatus {
  PENDING
  GENERATING
  COMPLETED
  FAILED
}
```

---

### Models

#### `PermitDataSource` — Admin-Managed Municipal Open Data Config

One row per municipality with a supported open data permit feed. Managed by admins. Not visible to homeowners directly.

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `name` | String | Human name: "City of Chicago" |
| `slug` | String (unique) | URL-safe key: `chicago-il` |
| `status` | `PermitDataSourceStatus` | |
| `adapterType` | `PermitDataSourceAdapter` | Determines which client class handles this source |
| `baseUrl` | String | API base URL |
| `datasetId` | String? | Socrata dataset ID (e.g. `ydr8-5enu`) |
| `apiKeyEnvVar` | String? | Name of the env var holding the API key — never the key value itself |
| `coverageType` | `PermitDataSourceCoverageType` | CITY / COUNTY / STATE |
| `normalizedCoverageKey` | String (unique) | Normalised key for address matching: `US-IL-chicago` |
| `fieldMappingJson` | Json | Maps source field names to canonical fields: `{ "permit_number": "permitNumber", "issue_date": "issueDate", ... }` |
| `queryFilterJson` | Json? | Additional Socrata `$where` filters to narrow to permit-type records |
| `lastFetchAt` | DateTime? | Last successful API call |
| `lastFetchError` | String? | Error from last failed call |
| `totalPermitsFetched` | Int | Running total |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

---

#### `PropertyPermitRecord` — An Actual Filed Permit

One row per permit record, regardless of whether it came from open data or manual entry. This is the central model of the feature.

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `propertyId` | String | FK → Property |
| `permitNumber` | String? | Official permit number from the jurisdiction |
| `category` | `PermitRecordCategory` | Primary permit category (BUILDING, ELECTRICAL, PLUMBING, etc.) |
| `workTypes` | `PermitWorkType[]` | What work this permit covers (can be multiple) |
| `description` | String? | Permit description from the source or homeowner |
| `status` | `PermitRecordStatus` | |
| `applicantName` | String? | Permit applicant name from source |
| `contractorName` | String? | Licensed contractor on the permit |
| `contractorLicense` | String? | Contractor license number |
| `workLocation` | String? | Specific location on property (e.g. "Kitchen", "Rear structure") |
| `applicationDate` | DateTime? | When permit was applied for |
| `issueDate` | DateTime? | When permit was issued |
| `expirationDate` | DateTime? | When permit expires if not finaled |
| `finaledDate` | DateTime? | When permit was closed/finaled |
| `estimatedCostCents` | Int? | Declared estimated project value |
| `finalCostCents` | Int? | Final assessed value (if available from source) |
| `source` | `PermitRecordSource` | OPEN_DATA_API / MANUAL_ENTRY / DOCUMENT_UPLOAD |
| `dataSourceId` | String? | FK → PermitDataSource (null for manual entries) |
| `externalId` | String? | Provider-side permit ID for deduplication |
| `dedupeKey` | String? (unique) | `propertyId:dataSourceId:externalId` for API-sourced permits |
| `rawDataJson` | Json? | Raw API payload preserved for debugging and re-processing |
| `documentIds` | String[] | IDs referencing the existing `Document` model |
| `notes` | String? | Homeowner-added notes |
| `isVerified` | Boolean | True once homeowner has confirmed the record is accurate |
| `isActive` | Boolean | False = soft-deleted |
| `renovationAdvisorSessionId` | String? | FK → HomeRenovationAdvisorSession (links advisor-recommended permits that materialised) |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

**Indexes:** `propertyId`, `category`, `status`, `source`, `issueDate`, `dedupeKey`

---

#### `PermitInspectionMilestone` — Required Inspection Checkpoints

Used only for permits tracked by the homeowner (ISSUED or INSPECTION_PENDING status). Generated from a template based on permit category; homeowners can add or remove milestones.

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `permitRecordId` | String | FK → PropertyPermitRecord |
| `propertyId` | String | FK → Property (denormalised) |
| `stageName` | String | e.g. "Rough-In Inspection", "Framing", "Final" |
| `stageType` | `RenovationInspectionStageType` | Reuses existing enum from Renovation Advisor |
| `status` | `PermitInspectionStatus` | |
| `scheduledDate` | DateTime? | |
| `inspectedDate` | DateTime? | When inspection actually occurred |
| `inspectorNotes` | String? | Result notes from the inspector |
| `isRequired` | Boolean | Some inspections are optional depending on scope |
| `sortOrder` | Int | Display order |
| `notificationSentAt` | DateTime? | When the upcoming-inspection reminder was sent |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

**Index:** `permitRecordId`, `propertyId + status`

---

#### `PermitUnpermittedFlag` — Detected or Declared Gap in Permit Coverage

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `propertyId` | String | FK → Property |
| `workType` | `PermitWorkType` | The type of work flagged as potentially unpermitted |
| `triggerType` | `PermitUnpermittedFlagTrigger` | What generated this flag |
| `flagReason` | String | Human-readable: "HVAC replaced ~2018 per inventory; no mechanical permit found for 2016–2020" |
| `status` | `PermitUnpermittedFlagStatus` | |
| `disclosureRisk` | `PermitDisclosureRisk` | LOW / MEDIUM / HIGH — set by detection rules, adjustable by homeowner |
| `homeAssetId` | String? | FK → HomeAsset (if triggered by asset) |
| `inventoryItemId` | String? | FK → InventoryItem (if triggered by inventory) |
| `resolvedByPermitId` | String? | FK → PropertyPermitRecord (set when user links an existing permit record) |
| `resolutionNotes` | String? | |
| `dedupeKey` | String (unique) | `propertyId:workType:triggerSource` prevents duplicate flags for same gap |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

**Indexes:** `propertyId + status`, `propertyId + disclosureRisk`, `homeAssetId`, `inventoryItemId`

---

#### `PermitFetchJob` — Audit Log of Open Data Fetch Attempts

Append-only. One row per fetch attempt per property. Used for observability and to prevent redundant re-fetches.

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `propertyId` | String | FK → Property |
| `dataSourceId` | String? | FK → PermitDataSource (null if no source found for this property's jurisdiction) |
| `trigger` | `PermitFetchTrigger` | What initiated the fetch |
| `status` | `PermitFetchJobStatus` | |
| `permitsFound` | Int? | Records returned from the API |
| `permitsInserted` | Int? | Net new records written (after dedup) |
| `errorMessage` | String? | |
| `durationMs` | Int? | |
| `startedAt` | DateTime | |
| `completedAt` | DateTime? | |

**Indexes:** `propertyId + startedAt`, `dataSourceId`

---

#### `PermitDisclosureExport` — Generated Disclosure Pack

| Column | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `propertyId` | String | FK → Property |
| `requestedByUserId` | String | FK → User |
| `status` | `PermitDisclosureExportStatus` | |
| `totalPermits` | Int? | Count of permits included |
| `openFlags` | Int? | Count of unresolved flags at export time |
| `fileUrl` | String? | S3 pre-signed URL for the generated PDF |
| `fileKey` | String? | S3 object key (for re-signing) |
| `expiresAt` | DateTime? | Pre-signed URL expiry (72 hours from generation) |
| `snapshotJson` | Json? | Frozen snapshot of permit and flag data used for this export |
| `errorMessage` | String? | |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

**Indexes:** `propertyId + createdAt`

---

## Backend

### Files

| File | Purpose |
|---|---|
| `backend/src/routes/permitTracker.routes.ts` | Express route definitions and middleware chains |
| `backend/src/controllers/permitTracker.controller.ts` | Request/response handling |
| `backend/src/services/permitTracker.service.ts` | Permit record CRUD, inspection management, disclosure export |
| `backend/src/services/permitFetch.service.ts` | Open data fetch orchestration; calls adapter, normalises, deduplicates |
| `backend/src/services/permitDetection.service.ts` | Unpermitted work detection engine |
| `backend/src/services/permitAdapters/socrata.adapter.ts` | Socrata open data API client |
| `backend/src/services/permitAdapters/accela.adapter.ts` | Accela Civic Platform API client |
| `backend/src/services/permitAdapters/permitNormalizer.ts` | Maps raw adapter payload → canonical `PropertyPermitRecord` shape |
| `backend/src/validators/permitTracker.validators.ts` | Zod v4 input validation schemas |
| `backend/src/index.ts` | Route mounting |

---

### API Endpoints

All endpoints require `Authorization: Bearer <token>`. Property-scoped endpoints additionally apply `propertyAuth.middleware`.

#### Open Data Fetch

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/properties/:propertyId/permits/fetch` | Trigger a fresh open data pull for the property's jurisdiction |
| `GET` | `/api/properties/:propertyId/permits/fetch/status` | Latest fetch job status (for polling after trigger) |

#### Permit Records

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/properties/:propertyId/permits` | Paginated list of all permit records |
| `POST` | `/api/properties/:propertyId/permits` | Manually add a permit record |
| `GET` | `/api/properties/:propertyId/permits/:permitId` | Full permit detail with inspections |
| `PATCH` | `/api/properties/:propertyId/permits/:permitId` | Update a permit record (manual/uploaded only) |
| `DELETE` | `/api/properties/:propertyId/permits/:permitId` | Soft-delete a manually entered record (`isActive = false`) |
| `GET` | `/api/properties/:propertyId/permits/summary` | Counts by status and category (for dashboard widget) |

#### Inspection Milestones

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/properties/:propertyId/permits/:permitId/inspections` | List inspection milestones for a permit |
| `POST` | `/api/properties/:propertyId/permits/:permitId/inspections` | Add an inspection milestone |
| `PATCH` | `/api/properties/:propertyId/permits/:permitId/inspections/:milestoneId` | Update inspection status, date, notes |
| `DELETE` | `/api/properties/:propertyId/permits/:permitId/inspections/:milestoneId` | Remove a milestone |

#### Unpermitted Flags

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/properties/:propertyId/permits/flags` | List all flags (filterable by status, risk) |
| `GET` | `/api/properties/:propertyId/permits/flags/:flagId` | Flag detail |
| `PATCH` | `/api/properties/:propertyId/permits/flags/:flagId` | Update flag status, link a permit record, add resolution notes |
| `POST` | `/api/properties/:propertyId/permits/flags/scan` | Re-run detection engine for this property |
| `POST` | `/api/properties/:propertyId/permits/flags` | Manually create a flag |

#### Disclosure Export

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/properties/:propertyId/permits/disclosure` | Request a new disclosure pack (async; returns exportId) |
| `GET` | `/api/properties/:propertyId/permits/disclosure/:exportId` | Get export status and download URL |
| `GET` | `/api/properties/:propertyId/permits/disclosure` | List past exports |

#### Admin — Data Source Management

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/permits/data-sources` | List all configured municipal data sources |
| `POST` | `/api/admin/permits/data-sources` | Add a new data source |
| `PUT` | `/api/admin/permits/data-sources/:id` | Update a data source (field mappings, status, etc.) |
| `PATCH` | `/api/admin/permits/data-sources/:id/status` | Enable, disable, or mark error |
| `POST` | `/api/admin/permits/data-sources/:id/test` | Run a test fetch for a given sample address |

#### Permit List Query Parameters

| Param | Type | Default | Notes |
|---|---|---|---|
| `category` | string[] | — | Filter by permit category |
| `status` | string[] | — | Filter by permit status |
| `source` | string[] | — | OPEN_DATA_API / MANUAL_ENTRY / DOCUMENT_UPLOAD |
| `workType` | string[] | — | Filter by work type |
| `from` | ISO date | — | `issueDate` range start |
| `to` | ISO date | — | `issueDate` range end |
| `limit` | number | 30 | |
| `cursor` | string | — | Pagination cursor |

#### Flag List Query Parameters

| Param | Type | Default | Notes |
|---|---|---|---|
| `status` | string[] | `FLAGGED,INVESTIGATING` | Default shows open flags only |
| `risk` | string[] | — | Filter by disclosure risk |
| `limit` | number | 30 | |
| `cursor` | string | — | |

---

### Service Layer

#### `PermitTrackerService` (`permitTracker.service.ts`)

- **`listPermits(propertyId, params)`** — Cursor-paginated permit list with filters.
- **`createManualPermit(propertyId, payload)`** — Creates a `PropertyPermitRecord` with `source = MANUAL_ENTRY`. If `status` indicates active inspections are needed (`ISSUED`, `INSPECTION_PENDING`), auto-generates inspection milestones via `generateInspectionMilestones(permit)`.
- **`getPermitDetail(permitId, propertyId)`** — Returns permit with all inspection milestones sorted by `sortOrder`.
- **`updatePermit(permitId, propertyId, patch)`** — Updates permitted fields on manually-entered records (API-sourced records are read-only except `notes`, `isVerified`, and `documentIds`).
- **`softDeletePermit(permitId, propertyId)`** — Sets `isActive = false`; cascades flag unlinking.
- **`getPermitSummary(propertyId)`** — Returns counts grouped by status (for dashboard widget).
- **`addInspectionMilestone(permitId, propertyId, payload)`** — Adds a milestone; sets `sortOrder` to max + 1.
- **`updateInspectionMilestone(milestoneId, permitId, propertyId, patch)`** — Updates status, date, notes. If transitioning to `PASSED` and all required milestones are now `PASSED`, prompts caller to auto-update permit status to `FINALED`.
- **`listFlags(propertyId, params)`** — Cursor-paginated flag list.
- **`updateFlag(flagId, propertyId, patch)`** — Updates status, links a permit record, adds resolution notes.
- **`createManualFlag(propertyId, payload)`** — Creates a flag with `triggerType = MANUAL`.
- **`requestDisclosureExport(propertyId, userId)`** — Creates a `PermitDisclosureExport` row and enqueues a generation job.
- **`getDisclosureExport(exportId, propertyId)`** — Returns export status and fresh pre-signed download URL if `status = COMPLETED` and URL not expired.
- **`listDisclosureExports(propertyId)`** — Returns past exports, most recent first.
- **`generateInspectionMilestones(permit)`** — Private. Generates standard inspection milestones by permit category:

| Permit Category | Default Milestones |
|---|---|
| BUILDING | Foundation (if applicable), Framing, Rough-In, Insulation, Final |
| ELECTRICAL | Rough-In, Final |
| PLUMBING | Rough-In, Final |
| MECHANICAL | Rough-In, Final |
| STRUCTURAL | Pre-Construction, Framing, Final |
| ROOFING | Mid-Point, Final |
| OTHER | Final |

---

#### `PermitFetchService` (`permitFetch.service.ts`)

Orchestrates open data pulls. Called by the background worker and by the manual trigger endpoint.

- **`triggerFetch(propertyId, trigger)`**
  1. Resolves the property's `normalizedJurisdictionKey` from address (city + state → `US-{state}-{city}`)
  2. Looks up `PermitDataSource` where `normalizedCoverageKey = normalizedJurisdictionKey` and `status = ACTIVE`
  3. If no source found: creates a `PermitFetchJob` with `status = NO_DATA_SOURCE`, returns early
  4. Creates a `PermitFetchJob` row and enqueues a BullMQ job

- **`runFetch(fetchJobId)`** — Called by the worker:
  1. Mark job `RUNNING`
  2. Load `PermitDataSource` config and property address
  3. Call `SocrataAdapter.fetchPermits()` or `AccelaAdapter.fetchPermits()` based on `adapterType`
  4. For each raw result, call `PermitNormalizer.normalize(raw, dataSource, propertyId)`
  5. Bulk upsert via `dedupeKey` (skip existing records)
  6. Mark job `COMPLETED` with counts
  7. Enqueue `detectUnpermittedWork` job for this property
  8. On error: mark job `FAILED` with error message

- **`getLatestFetchStatus(propertyId)`** — Returns the most recent `PermitFetchJob` for display.

---

#### `PermitDetectionService` (`permitDetection.service.ts`)

Cross-references installed assets against the permit record to identify coverage gaps.

**`detectUnpermittedWork(propertyId)`**

Runs after each permit fetch and on manual scan request.

**Step 1 — Build the installed-work inventory:**

Collects all evidence of significant work performed at the property:
- All `HomeAsset` rows where `lastMaintenanceDate` or `installDate` is known (HVAC, roof, water heater, electrical panel, solar)
- All `InventoryItem` rows where category is `HVAC`, `ELECTRICAL`, or `PLUMBING` and `installYear` is populated
- The property's known `yearBuilt` and structural attributes (additions, basement type) from the `Property` model

**Step 2 — Build the permit coverage map:**

For each `PropertyPermitRecord` on this property:
- Extract `workTypes[]` and the `issueDate` year
- Build a coverage lookup: `{ workType → Set<issueYear> }`

**Step 3 — Cross-reference:**

For each installed-work item from Step 1:
- Map it to a `PermitWorkType` (e.g., `HomeAsset.type = HVAC` → `PermitWorkType.HVAC_REPLACEMENT`)
- Look for a permit covering that work type within a ±2 year window of the install/replacement date
- If no permit found → candidate for flagging

**Step 4 — Flag creation:**

For each gap from Step 3:
- Check if a `PermitUnpermittedFlag` already exists for this `(propertyId, workType, dedupeKey)` — if so, skip
- Assess `disclosureRisk` by work type:

| Work Type | Disclosure Risk |
|---|---|
| ELECTRICAL_PANEL, STRUCTURAL_REPAIR, ADU, ROOM_ADDITION | HIGH |
| HVAC_NEW, HVAC_REPLACEMENT, PLUMBING_NEW, BASEMENT_FINISH | MEDIUM |
| ROOF_REPAIR, DECK_PATIO, FENCE, WINDOWS_DOORS | LOW |

- Create `PermitUnpermittedFlag` with a descriptive `flagReason`

**`getFlagSummary(propertyId)`** — Returns open flag count grouped by disclosure risk (used by seller prep and dashboard widget).

---

### Open Data Adapters

All adapters implement the same interface:

```typescript
interface PermitDataAdapter {
  fetchPermits(
    dataSource: PermitDataSource,
    address: PropertyAddress
  ): Promise<RawPermitRecord[]>
}
```

#### `SocrataAdapter` (`socrata.adapter.ts`)

Handles all Socrata-based open data portals (Chicago, NYC, LA, Seattle, Austin, San Francisco, Denver, Portland, Phoenix, and others).

The adapter:
1. Builds a Socrata SODA query (`$where`) from the property address using the data source's `queryFilterJson` and `fieldMappingJson`
2. Paginates via `$offset` and `$limit` (1,000 rows per page)
3. Handles 429 rate limits with exponential backoff
4. Maps Socrata column names to canonical fields using `fieldMappingJson` (each city uses different column names for the same concepts)
5. Returns `RawPermitRecord[]`

**Sample `fieldMappingJson` for City of Chicago:**

```json
{
  "id": "externalId",
  "permit_": "permitNumber",
  "permit_type": "categoryRaw",
  "work_description": "description",
  "application_start_date": "applicationDate",
  "issue_date": "issueDate",
  "reported_cost": "estimatedCostCents",
  "contractor_1_trade": "contractorTrade",
  "contractor_1_license_number": "contractorLicense",
  "contact_1_name": "applicantName"
}
```

**Address matching:** Socrata address search uses `$where=address like '%123 MAIN ST%'` combined with city/ZIP filters from `queryFilterJson`.

#### `AccelaAdapter` (`accela.adapter.ts`)

Handles Accela Civic Platform endpoints for municipalities that use Accela (common for medium-sized US cities).

- Auth via OAuth 2.0 client credentials (API key stored as env var referenced by `apiKeyEnvVar`)
- Endpoint: `GET /v4/records?address={address}&type=Building`
- Pagination via `offset` / `limit` params
- Maps Accela record fields using `fieldMappingJson`

#### `PermitNormalizer` (`permitNormalizer.ts`)

Maps each adapter's `RawPermitRecord` to a canonical `PropertyPermitRecord` insert shape:

```typescript
interface NormalizedPermitRecord {
  propertyId: string
  permitNumber?: string
  category: PermitRecordCategory
  workTypes: PermitWorkType[]
  description?: string
  status: PermitRecordStatus
  applicantName?: string
  contractorName?: string
  contractorLicense?: string
  applicationDate?: Date
  issueDate?: Date
  expirationDate?: Date
  finaledDate?: Date
  estimatedCostCents?: number
  source: PermitRecordSource
  dataSourceId: string
  externalId: string
  dedupeKey: string  // `${propertyId}:${dataSourceId}:${externalId}`
  rawDataJson: Record<string, unknown>
}
```

The normalizer:
- Infers `category` from raw permit type strings using a keyword mapping table (`"ELEC" → ELECTRICAL`, `"PLUMBING" → PLUMBING`, etc.)
- Infers `workTypes[]` from the permit description using keyword matching
- Normalises date strings (various municipal date formats) to ISO DateTime
- Normalises cost values (some sources provide strings like `"$12,500.00"`)
- Generates a stable `dedupeKey`

---

### Validators (`permitTracker.validators.ts`)

| Schema | Used By |
|---|---|
| `TriggerFetchSchema` | `POST .../permits/fetch` |
| `CreateManualPermitSchema` | `POST .../permits` |
| `UpdatePermitSchema` | `PATCH .../permits/:permitId` |
| `AddInspectionMilestoneSchema` | `POST .../inspections` |
| `UpdateInspectionMilestoneSchema` | `PATCH .../inspections/:milestoneId` |
| `UpdateFlagSchema` | `PATCH .../flags/:flagId` |
| `CreateManualFlagSchema` | `POST .../flags` |
| `ListPermitsSchema` | `GET .../permits` (query params) |
| `ListFlagsSchema` | `GET .../flags` (query params) |
| `AdminCreateDataSourceSchema` | `POST /admin/permits/data-sources` |
| `AdminUpdateDataSourceSchema` | `PUT /admin/permits/data-sources/:id` |

---

## Frontend

### Files

| File | Purpose |
|---|---|
| `frontend/src/app/(dashboard)/dashboard/permits/page.tsx` | Main permit hub — records, flags, fetch status |
| `frontend/src/app/(dashboard)/dashboard/permits/add/page.tsx` | Manual permit entry form |
| `frontend/src/app/(dashboard)/dashboard/permits/[id]/page.tsx` | Permit detail + inspection milestone tracker |
| `frontend/src/app/(dashboard)/dashboard/permits/flags/page.tsx` | Full flags list with investigation workflow |
| `frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/permits/page.tsx` | Property-scoped entry (redirects with `propertyId`) |
| `frontend/src/components/features/permits/PermitCard.tsx` | Permit record summary card |
| `frontend/src/components/features/permits/PermitStatusBadge.tsx` | Status chip with color and icon |
| `frontend/src/components/features/permits/InspectionMilestoneList.tsx` | Timeline of inspection checkpoints with status controls |
| `frontend/src/components/features/permits/UnpermittedFlagCard.tsx` | Flag card with risk level and investigation actions |
| `frontend/src/components/features/permits/FetchStatusBanner.tsx` | Shows open data fetch result (found N permits / no data available for area) |
| `frontend/src/components/features/permits/JurisdictionCoverageBadge.tsx` | Shows whether open data is available for the property's city |
| `frontend/src/components/features/permits/DisclosureExportButton.tsx` | Generates and downloads the disclosure PDF |
| `frontend/src/components/features/permits/AddPermitForm.tsx` | Manual permit entry form component |
| `frontend/src/components/features/permits/PermitUtils.ts` | Label maps, color helpers, work type icons |
| `frontend/src/lib/api/client.ts` | API client method additions |
| `frontend/src/types/index.ts` | TypeScript interface additions |

---

### Main Hub Page (`permits/page.tsx`)

**Route:** `/dashboard/permits?propertyId=<id>`

**Layout (mobile-first, top to bottom):**

1. **Fetch Status Banner** — `FetchStatusBanner`:
   - If `NO_DATA_SOURCE`: "Open permit data is not available for [City]. Add your permits manually."
   - If `COMPLETED`: "Last updated [relative time] — found [N] permits. [Refresh] button."
   - If `RUNNING`: "Fetching permit records from [City] open data..."
   - If no fetch ever run: "Check if public permit records are available for [City]" + "Look Up Permits" CTA → triggers fetch

2. **Flags Strip** — Shown only if `openFlags > 0`. Amber banner: "X items may be unpermitted — [Review Flags →]"

3. **Permit Records** — Filterable list of `PermitCard` components, grouped by status (Active first: ISSUED, INSPECTION_PENDING; then historical: FINALED, EXPIRED).

4. **"Add Permit Manually"** FAB button at bottom.

---

### Permit Detail Page (`permits/[id]/page.tsx`)

**Route:** `/dashboard/permits/:id?propertyId=<id>`

Sections:
1. Permit number, category badge, status badge, source label
2. Work types chip row
3. Date row: Applied → Issued → Expires / Finaled
4. Contractor info (name, license) — shown if present
5. Description
6. Estimated / final cost
7. **Inspection Milestones** (`InspectionMilestoneList`) — visible only when status is `ISSUED` or `INSPECTION_PENDING`
   - Timeline view of each milestone
   - Per-milestone: status chip, scheduled date, inspector notes
   - Inline status update (Passed / Failed / Partial) with date picker
   - "Add milestone" link
8. **Documents** — List of attached permit documents with upload CTA
9. Notes textarea (editable inline)
10. Verified toggle: "I've confirmed this record is correct"
11. Edit / Delete buttons (manual records only)

---

### Flags Page (`permits/flags/page.tsx`)

**Route:** `/dashboard/permits/flags?propertyId=<id>`

- Filter chip row: All / Open (FLAGGED + INVESTIGATING) / Resolved / Dismissed
- Risk filter: All / High / Medium / Low
- List of `UnpermittedFlagCard` components
- "Re-run Detection" button (triggers fresh detection scan)

Each flag card shows:
- Work type icon and label
- Flag reason (human-readable explanation)
- Disclosure risk chip (HIGH = red, MEDIUM = amber, LOW = grey)
- Current status
- Action buttons:
  - **Link a Permit** — Opens permit selector to link an existing record (sets `resolvedByPermitId`)
  - **Mark Investigating** / **Mark Confirmed** / **Dismiss** — Status transitions
  - **Add Note** — Resolution notes field

---

### `InspectionMilestoneList.tsx`

Vertical timeline of inspection checkpoints:
- Each milestone shows: stage name, scheduled date (editable), status icon, inspected date, notes
- Inline status change via dropdown (Not Scheduled → Scheduled → Passed / Failed / Partial)
- Overdue indicator: if `scheduledDate` is in the past and status is not `PASSED`
- "Add Inspection" button appends a new milestone at the bottom

---

### `FetchStatusBanner.tsx`

Contextual banner at the top of the hub page. States:

| Fetch State | Banner Content | Action |
|---|---|---|
| Never fetched | Neutral — "We may be able to pull permit records from [City]'s open data." | "Look Up Permits" button |
| `NO_DATA_SOURCE` | Neutral — "Open permit data not available for [City]. Add permits manually." | "Add Permit" button |
| `RUNNING` | Blue — "Fetching permit records from [City]..." | Spinner, no action |
| `COMPLETED` + permits found | Green — "Found [N] permits. Last updated [time]." | "Refresh" button |
| `COMPLETED` + 0 new | Neutral — "No permit records found in [City] open data. Add permits manually if you have records." | "Add Permit" + "Refresh" buttons |
| `FAILED` | Red — "Could not reach [City] open data. Try again later." | "Retry" button |

---

### API Client Methods

```typescript
// Open data fetch
triggerPermitFetch(propertyId: string): Promise<{ fetchJobId: string }>
getPermitFetchStatus(propertyId: string): Promise<PermitFetchJobSummary>

// Permit records
listPermits(propertyId: string, params?: PermitListParams): Promise<{ items: PermitSummary[]; nextCursor?: string }>
createManualPermit(propertyId: string, payload: CreatePermitPayload): Promise<PermitDetail>
getPermitDetail(propertyId: string, permitId: string): Promise<PermitDetail>
updatePermit(propertyId: string, permitId: string, patch: UpdatePermitPayload): Promise<PermitDetail>
deletePermit(propertyId: string, permitId: string): Promise<void>
getPermitSummary(propertyId: string): Promise<PermitSummary>

// Inspections
listInspectionMilestones(propertyId: string, permitId: string): Promise<InspectionMilestone[]>
addInspectionMilestone(propertyId: string, permitId: string, payload: AddMilestonePayload): Promise<InspectionMilestone>
updateInspectionMilestone(propertyId: string, permitId: string, milestoneId: string, patch: UpdateMilestonePayload): Promise<InspectionMilestone>
deleteInspectionMilestone(propertyId: string, permitId: string, milestoneId: string): Promise<void>

// Flags
listPermitFlags(propertyId: string, params?: FlagListParams): Promise<{ items: PermitFlagItem[]; nextCursor?: string }>
getPermitFlag(propertyId: string, flagId: string): Promise<PermitFlagItem>
updatePermitFlag(propertyId: string, flagId: string, patch: UpdateFlagPayload): Promise<PermitFlagItem>
createManualFlag(propertyId: string, payload: CreateFlagPayload): Promise<PermitFlagItem>
runPermitDetectionScan(propertyId: string): Promise<{ flagsCreated: number }>

// Disclosure export
requestDisclosureExport(propertyId: string): Promise<{ exportId: string }>
getDisclosureExport(propertyId: string, exportId: string): Promise<PermitDisclosureExportStatus>
listDisclosureExports(propertyId: string): Promise<PermitDisclosureExportSummary[]>
```

---

### TypeScript Interfaces

```typescript
type PermitRecordCategory = 'BUILDING' | 'ELECTRICAL' | 'PLUMBING' | 'MECHANICAL' | 'STRUCTURAL' | 'ROOFING' | 'ZONING' | 'DEMOLITION' | 'GRADING' | 'FIRE' | 'OTHER'
type PermitWorkType = 'HVAC_NEW' | 'HVAC_REPLACEMENT' | 'ELECTRICAL_PANEL' | 'ELECTRICAL_WIRING' | 'PLUMBING_NEW' | 'PLUMBING_REPAIR' | 'ROOF_REPLACEMENT' | 'ROOF_REPAIR' | 'ROOM_ADDITION' | 'GARAGE_CONVERSION' | 'ADU' | 'BASEMENT_FINISH' | 'DECK_PATIO' | 'FENCE' | 'SWIMMING_POOL' | 'SOLAR' | 'WINDOWS_DOORS' | 'FIREPLACE' | 'SEWER_WATER_LINE' | 'STRUCTURAL_REPAIR' | 'INTERIOR_REMODEL' | 'EXTERIOR_REMODEL' | 'DEMOLITION' | 'GRADING_DRAINAGE' | 'OTHER'
type PermitRecordStatus = 'APPLIED' | 'ISSUED' | 'INSPECTION_PENDING' | 'INSPECTION_FAILED' | 'FINALED' | 'EXPIRED' | 'VOIDED' | 'UNKNOWN'
type PermitRecordSource = 'OPEN_DATA_API' | 'MANUAL_ENTRY' | 'DOCUMENT_UPLOAD'
type PermitInspectionStatus = 'NOT_SCHEDULED' | 'SCHEDULED' | 'PASSED' | 'FAILED' | 'PARTIAL' | 'CANCELLED'
type PermitUnpermittedFlagStatus = 'FLAGGED' | 'INVESTIGATING' | 'CONFIRMED_PERMITTED' | 'CONFIRMED_UNPERMITTED' | 'WILL_REMEDIATE' | 'REMEDIATED' | 'DISMISSED'
type PermitDisclosureRisk = 'LOW' | 'MEDIUM' | 'HIGH'
type PermitFetchJobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'NO_DATA_SOURCE'

interface PermitFetchJobSummary {
  id: string
  status: PermitFetchJobStatus
  dataSourceName?: string
  permitsFound?: number
  permitsInserted?: number
  errorMessage?: string
  startedAt: string
  completedAt?: string
}

interface PermitSummary {
  id: string
  permitNumber?: string
  category: PermitRecordCategory
  workTypes: PermitWorkType[]
  description?: string
  status: PermitRecordStatus
  source: PermitRecordSource
  issueDate?: string
  finaledDate?: string
  expirationDate?: string
  contractorName?: string
  isVerified: boolean
  hasOpenInspections: boolean
}

interface InspectionMilestone {
  id: string
  stageName: string
  stageType: string
  status: PermitInspectionStatus
  scheduledDate?: string
  inspectedDate?: string
  inspectorNotes?: string
  isRequired: boolean
  sortOrder: number
  isOverdue: boolean
}

interface PermitDetail extends PermitSummary {
  applicantName?: string
  contractorLicense?: string
  workLocation?: string
  applicationDate?: string
  estimatedCostCents?: number
  finalCostCents?: number
  notes?: string
  documentIds: string[]
  inspectionMilestones: InspectionMilestone[]
  renovationAdvisorSessionId?: string
}

interface PermitFlagItem {
  id: string
  workType: PermitWorkType
  triggerType: string
  flagReason: string
  status: PermitUnpermittedFlagStatus
  disclosureRisk: PermitDisclosureRisk
  homeAssetId?: string
  inventoryItemId?: string
  resolvedByPermitId?: string
  resolvedByPermitNumber?: string
  resolutionNotes?: string
  createdAt: string
  updatedAt: string
}

interface PermitHubSummary {
  totalPermits: number
  activePermits: number      // ISSUED + INSPECTION_PENDING
  finaledPermits: number
  openFlags: number
  highRiskFlags: number
  hasFetchData: boolean
  jurisdictionHasOpenData: boolean
  lastFetchAt?: string
}

interface PermitDisclosureExportStatus {
  id: string
  status: PermitDisclosureExportStatus
  totalPermits?: number
  openFlags?: number
  fileUrl?: string
  expiresAt?: string
  errorMessage?: string
  createdAt: string
}
```

---

## Workers / Background Jobs

### Files

| File | Purpose |
|---|---|
| `workers/src/jobs/fetchPermitHistory.job.ts` | Runs the open data pull for a property |
| `workers/src/jobs/detectUnpermittedWork.job.ts` | Runs the cross-reference detection engine after a fetch or manual scan |
| `workers/src/jobs/generatePermitDisclosure.job.ts` | Generates the disclosure PDF and uploads to S3 |
| `workers/src/jobs/permitInspectionReminder.job.ts` | Daily scan for upcoming inspections; sends notifications |
| `workers/src/worker.ts` | Queue registration + cron setup |

---

### `fetchPermitHistory.job.ts`

Triggered by:
- `POST /permits/fetch` (user-requested)
- `PROPERTY_ONBOARDING` event (auto-triggered when a property is added)
- Monthly cron (`0 6 1 * *` — first of each month at 6 AM)

Steps:
1. Load `PermitFetchJob` by ID
2. Call `PermitFetchService.runFetch(fetchJobId)`
3. On completion: enqueue `detectUnpermittedWork` for the property

BullMQ concurrency: 3 (to avoid hammering municipal APIs).

---

### `detectUnpermittedWork.job.ts`

Triggered after each successful permit fetch and on manual scan request. Also runs when a new `HomeAsset` is created or updated with an `installDate`.

Steps:
1. Call `PermitDetectionService.detectUnpermittedWork(propertyId)`
2. Collect newly created flag IDs
3. If any `HIGH` risk flags were created, create a `HomeEvent` with type `NOTE` and importance `HIGH` ("Potential unpermitted work detected — review permit flags")

---

### `generatePermitDisclosure.job.ts`

Triggered by `POST /permits/disclosure`. Generates a structured PDF using an existing PDF generation library (pdf-lib, already in the backend stack).

PDF contents:
1. Cover page: property address, generation date, disclaimer
2. Permit Summary table (all active records with number, type, status, date)
3. Finaled Permits list
4. Expired / Unknown permits
5. Unpermitted Work Flags — one section per flag with risk level, reason, investigation status
6. Footer disclaimer: "This report is based on available open data and homeowner-entered records. It does not constitute a legal disclosure document. Consult an attorney for resale disclosure requirements in your jurisdiction."

Steps:
1. Fetch all `PropertyPermitRecord` and `PermitUnpermittedFlag` rows for the property
2. Snapshot data into `PermitDisclosureExport.snapshotJson`
3. Generate PDF using pdf-lib
4. Upload to S3 (`permit-disclosures/{propertyId}/{exportId}.pdf`)
5. Store pre-signed URL (72-hour expiry) and update export status to `COMPLETED`

---

### `permitInspectionReminder.job.ts`

Cron: `0 8 * * *` — daily at 8 AM.

Steps:
1. Query all `PermitInspectionMilestone` where `status = SCHEDULED` AND `scheduledDate` is within 3 days AND `notificationSentAt` is null
2. For each result, send a push + in-app notification: "Inspection scheduled for [date] — [stageName] for permit #[number]"
3. Set `notificationSentAt = now()`

---

## Integration Points with Existing Features

### Home Renovation Advisor

When the Renovation Advisor's `HomeRenovationPermitOutput` sets `requirementStatus = REQUIRED` or `LIKELY_REQUIRED`, the advisor output page shows a secondary CTA: **"Track this permit →"**. This opens the manual permit entry form pre-filled with the permit category derived from the renovation type, linking `PropertyPermitRecord.renovationAdvisorSessionId` back to the advisor session. This gives homeowners a straight line from "I need a permit" to "I'm tracking my permit."

### DIY Project Center

When a DIY project template has `permitRequirement = REQUIRED` or `LIKELY_REQUIRED`, the template detail page shows: **"This project may require a permit. [View your permit tracker →]"** with a link to the Permit Hub. On project completion, if the project category maps to a permit-relevant work type, a completion prompt asks: "Did you pull a permit for this project?" with Yes → open permit add form, No → create a `MANUAL` unpermitted flag.

### Seller Prep

The Seller Prep checklist pulls from the Permit Tracker:
- If `openFlags > 0` and any flag has `disclosureRisk = HIGH` → adds a high-priority seller prep checklist item: "Review unpermitted work flags before listing"
- The Disclosure Pack export is surfaced directly in the Seller Prep document section

### Home Events

Two points of HomeEvent creation:
1. When `detectUnpermittedWork` creates a new `HIGH` risk flag → HomeEvent (type `NOTE`, importance `HIGH`)
2. When a permit milestone transitions to `PASSED` or the permit reaches `FINALED` → HomeEvent (type `MAINTENANCE`, importance `NORMAL`): "Permit #[number] finaled"

### Inventory / Home Assets

The detection engine reads `HomeAsset` and `InventoryItem` records. Conversely, after detection runs, any `HIGH` risk flag that is linked to a `HomeAsset` via `homeAssetId` causes the Asset's risk score to be supplemented with an "unpermitted work" risk signal in the Risk Assessment service.

---

## Mobile Navigation

Permit History & Unpermitted Work Tracker is registered in the mobile tool catalog under **Home Tools**:

```typescript
{
  key: 'permits',
  name: 'Permit Tracker',
  description: 'Permit history, active tracking, and disclosure export',
  hrefSuffix: 'tools/permits',
  navTarget: 'tool:permits',
  icon: resolveToolIcon('home', 'permits'),
  isActive: (pathname) =>
    /^\/dashboard\/(properties\/[^/]+\/tools\/permits|permits)(\/|$)/.test(pathname),
}
```

**Source file:** `frontend/src/components/mobile/dashboard/mobileToolCatalog.ts`

**Dashboard widget:** Properties with open `HIGH` risk flags show a permit alert strip in `MobileDashboardHome.tsx`, linking to the flags page. Properties with `INSPECTION_PENDING` active permits show an inspection reminder chip.

---

## Data Flow

```
Property added to platform
        │
        ▼
PROPERTY_ONBOARDING event → fetchPermitHistory.job.ts
        ├─ Resolve normalizedJurisdictionKey from property city/state
        ├─ Look up PermitDataSource where normalizedCoverageKey matches
        │    ├─ Source found → SocrataAdapter.fetchPermits() or AccelaAdapter.fetchPermits()
        │    │    └─ PermitNormalizer.normalize() per record
        │    │    └─ Bulk upsert PropertyPermitRecord (skip on dedupeKey conflict)
        │    │    └─ Update PermitFetchJob COMPLETED
        │    └─ No source → PermitFetchJob NO_DATA_SOURCE
        │
        ▼
detectUnpermittedWork.job.ts (enqueued after fetch)
        ├─ Load HomeAsset + InventoryItem install dates
        ├─ Build permit coverage map from PropertyPermitRecord rows
        ├─ Cross-reference → find gaps
        └─ Create PermitUnpermittedFlag rows
             └─ HIGH risk flags → HomeEvent created
        │
        ▼
User opens /dashboard/permits?propertyId=<id>
        ├─ GET /permits/fetch/status → FetchStatusBanner
        ├─ GET /permits → permit list (PermitCard components)
        └─ Flags strip if openFlags > 0
        │
        ▼
User taps a permit card → /permits/:id
        ├─ GET /permits/:id → full detail
        ├─ User marks inspection milestones as they pass
        └─ Permit reaches FINALED → HomeEvent created
        │
        ▼
User reviews unpermitted flags → /permits/flags
        └─ Update status: Link permit / Confirm / Dismiss
        │
        ▼
User requests disclosure export
        └─ POST /permits/disclosure → generatePermitDisclosure.job.ts
             └─ PDF generated → S3 upload → pre-signed URL returned
        │
        ▼
Daily cron: permitInspectionReminder.job.ts
        └─ Checks for SCHEDULED milestones within 3 days
        └─ Sends push + in-app notification

---

Manual permit entry (jurisdictions without open data or for older records):
User taps "Add Permit" → AddPermitForm
        └─ POST /permits { source: MANUAL_ENTRY, ... }
        └─ If ISSUED or INSPECTION_PENDING → inspection milestones auto-generated
        └─ User attaches permit documents via document upload
```

---

## Open Data Coverage

Tier 1 — Supported at launch via Socrata adapter (all use the same adapter class, different `fieldMappingJson`):

| City | Data Portal | Dataset Note |
|---|---|---|
| Chicago, IL | data.cityofchicago.org | Building permits dataset |
| New York City, NY | data.cityofnewyork.us | DOB permit issuances |
| Los Angeles, CA | data.lacity.org | Building and safety permits |
| Seattle, WA | data.seattle.gov | Seattle building permits |
| Austin, TX | data.austintexas.gov | Issued construction permits |
| San Francisco, CA | data.sfgov.org | Building permits |
| Denver, CO | denvergov.org | Building permits |
| Portland, OR | data.portland.gov | Bureau of development services permits |
| Phoenix, AZ | data.phoenix.gov | Building permits |

Tier 2 — Planned via Accela adapter (medium-sized cities common in the US):
- Jurisdictions using Accela Civic Platform; added per-city by admin as `PermitDataSource` rows.

Tier 3 — Not supported (manual entry only):
- Rural municipalities, counties without public APIs, and cities with non-standard portals. `FetchStatusBanner` surfaces the manual entry path clearly in these cases.

---

## Current Limitations

- Open data coverage is limited to major US cities. Approximately 40% of the US population lives in jurisdictions with available open data; the remaining 60% use manual entry.
- Address matching against Socrata endpoints is fuzzy (string-based). Unit numbers, street name abbreviations, and address formatting differences can cause missed matches. The UI surfaces a "We searched for [formatted address] — add any permits we missed" note after every fetch.
- The detection engine uses ±2 year windows for permit date matching, which can produce false positives for properties with multiple renovation cycles in a short period.
- Disclosure Pack PDF is not a legally executed disclosure document. A footer disclaimer makes this clear. Jurisdictions have specific disclosure form requirements; the export is supplementary evidence, not a substitute.
- Permit status from open data may lag reality by weeks or months (many municipalities update their portals infrequently). The `lastFetchAt` timestamp and a freshness notice on the hub page communicate this to users.
- The Accela adapter requires per-municipality onboarding by admins (API credentials, endpoint URL, field mapping). This is a manual step; no auto-discovery of Accela instances exists.
- No integration with county assessor or title company records to pull historical permit data pre-dating open data portal coverage (pre-2010 records are often unavailable).

---

## Phase 2 Roadmap

| Item | Description |
|---|---|
| ATTOM / third-party permit data | License a commercial permit data provider for broader geographic coverage |
| OCR permit extraction | Use existing Tesseract.js OCR to extract permit number, date, and type from uploaded permit PDFs (reduces manual entry friction) |
| Automated retroactive permit pull on asset add | When homeowner adds a HomeAsset with an install year, auto-trigger detection without waiting for next scheduled scan |
| Contractor license verification | Cross-reference `contractorLicense` on permits against state contractor license lookup APIs |
| Permit expiry alerts | Notify homeowner when an `ISSUED` permit approaches its `expirationDate` without being finaled |
| Polygon-based address matching | Replace fuzzy string matching with GeoJSON parcel boundary matching for higher-accuracy permit lookup |
| In-app permit application portal links | Surface municipality permit portal URLs pre-populated with the property address for homeowners about to pull permits |

---

## File Index

### Backend

| Path | Role |
|---|---|
| `apps/backend/src/routes/permitTracker.routes.ts` | Route definitions + middleware |
| `apps/backend/src/controllers/permitTracker.controller.ts` | Request handlers |
| `apps/backend/src/services/permitTracker.service.ts` | Core business logic |
| `apps/backend/src/services/permitFetch.service.ts` | Open data fetch orchestration |
| `apps/backend/src/services/permitDetection.service.ts` | Unpermitted work detection engine |
| `apps/backend/src/services/permitAdapters/socrata.adapter.ts` | Socrata API client |
| `apps/backend/src/services/permitAdapters/accela.adapter.ts` | Accela API client |
| `apps/backend/src/services/permitAdapters/permitNormalizer.ts` | Raw → canonical record mapper |
| `apps/backend/src/validators/permitTracker.validators.ts` | Zod v4 input schemas |
| `apps/backend/prisma/schema.prisma` | DB models and enums |

### Frontend

| Path | Role |
|---|---|
| `apps/frontend/src/app/(dashboard)/dashboard/permits/page.tsx` | Main permit hub |
| `apps/frontend/src/app/(dashboard)/dashboard/permits/add/page.tsx` | Manual entry form |
| `apps/frontend/src/app/(dashboard)/dashboard/permits/[id]/page.tsx` | Permit detail + inspection tracker |
| `apps/frontend/src/app/(dashboard)/dashboard/permits/flags/page.tsx` | Flags investigation workflow |
| `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/permits/page.tsx` | Property-scoped entry |
| `apps/frontend/src/components/features/permits/PermitCard.tsx` | Permit summary card |
| `apps/frontend/src/components/features/permits/PermitStatusBadge.tsx` | Status chip |
| `apps/frontend/src/components/features/permits/InspectionMilestoneList.tsx` | Inspection timeline |
| `apps/frontend/src/components/features/permits/UnpermittedFlagCard.tsx` | Flag card with investigation actions |
| `apps/frontend/src/components/features/permits/FetchStatusBanner.tsx` | Open data fetch status banner |
| `apps/frontend/src/components/features/permits/JurisdictionCoverageBadge.tsx` | Coverage availability indicator |
| `apps/frontend/src/components/features/permits/DisclosureExportButton.tsx` | PDF export trigger + download |
| `apps/frontend/src/components/features/permits/AddPermitForm.tsx` | Manual entry form component |
| `apps/frontend/src/components/features/permits/PermitUtils.ts` | UI helpers, label maps, icons |
| `apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts` | Mobile nav registration |
| `apps/frontend/src/lib/api/client.ts` | Typed API client methods |
| `apps/frontend/src/types/index.ts` | TypeScript interfaces |

### Workers

| Path | Role |
|---|---|
| `apps/workers/src/jobs/fetchPermitHistory.job.ts` | Open data pull runner |
| `apps/workers/src/jobs/detectUnpermittedWork.job.ts` | Cross-reference detection runner |
| `apps/workers/src/jobs/generatePermitDisclosure.job.ts` | PDF disclosure generation |
| `apps/workers/src/jobs/permitInspectionReminder.job.ts` | Daily inspection reminder scanner |
| `apps/workers/src/worker.ts` | Queue registration + cron setup |
| `apps/workers/prisma/schema.prisma` | Synced mirror of backend Prisma schema |
