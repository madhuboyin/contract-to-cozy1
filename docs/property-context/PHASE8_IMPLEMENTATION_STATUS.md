# Property Context Phase 8 Implementation Status

Date: 2026-07-17

Scope: FRD §21.10 — final audit and cleanup.

## Slice 1 — canonical cleanup and exit-gate foundation

Implemented:

- Removed the Personalization Engine's direct Prisma property-fact loader.
  Authenticated and standalone evaluations now use the same bounded
  `PERSONALIZED_GUIDANCE` Property Context snapshot; standalone evaluation
  resolves the property's owner only to establish the authorized actor.
- Removed obsolete Personalization rule paths (`property.propertyType`,
  `property.yearBuilt`, `property.zipCode`, and Property purchase/appraisal
  paths). The allowlist now names canonical Property Context and financing
  paths.
- Removed stale documentation claiming that removed `HomeAsset` records are
  still combined with canonical inventory.
- Added one ten-archetype cross-feature exit-gate matrix covering maintenance,
  protection, finance, planning, aggregation, responsibility variation,
  absent inventory, inspections, warranties, rentals, vacancy/renovation, and
  storm/drainage exposure.
- Added an explicit unit-test Property Context fixture rather than restoring a
  production compatibility loader for older Personalization tests.

No Prisma schema changes or migration scripts are included in this slice.

## Audit inventory

The first repository scan found 60 backend/frontend/worker source files using
the tokens `propertyType` or `ownershipType`, and five Prisma schema
occurrences. These are not all the same concept:

1. `Property.propertyType` and `Property.ownershipType` are legacy property
   classification columns. Twenty-six source files contain direct-looking
   property reads and require conversion to `dwellingType`, `propertyUse`,
   `occupancyStatus`, or a bounded context fact before the columns can be
   removed.
2. Benchmark, tax-bill, seller-intake, and provider payloads use
   `propertyType` as an external or feature-specific dimension. Those fields
   require boundary naming/mapping review; they must not be mechanically
   deleted with the legacy Property columns.
3. `ServicePriceBenchmark.homeType` is a benchmark segmentation dimension,
   not canonical property truth.
4. Personalization `HouseholdProperty.occupancyType` describes the optional
   household-to-property relationship. It is not a substitute for canonical
   `Property.occupancyStatus` and is retained pending a relationship-model
   review.

## Slice 2 — legacy Property classification removal

Implemented:

- Converted direct backend, frontend, and worker reads of
  `Property.propertyType` to canonical `dwellingType` or a feature-boundary
  mapping derived from it.
- Replaced `Property.ownershipType` decisions with the non-conflated
  `propertyUse`, `occupancyStatus`, and `ownershipForm` classifications.
- Updated property create/update validation, API client contracts, onboarding,
  property cards, workspace headers, health scoring, reports, assistant
  context, event matching, and worker calculations to use canonical fields.
- Preserved feature-specific and external `propertyType` dimensions for tax
  bills, seller intake, benchmark records, and compatibility snapshot output;
  these no longer read a legacy Property column.
- Added an explicit canonical-to-benchmark mapping where the older benchmark
  catalog still uses the `PropertyType` segmentation enum.
- Removed `Property.propertyType`, `Property.ownershipType`, and the now-unused
  `OwnershipType` enum from Prisma. No migration script was created.
- Added a cleanup guard that fails on restored Prisma fields or direct source
  readers.

The legacy Property classification removal is implemented. The user must apply
the schema change through the normal database schema workflow.

## Slice 3 — assistant and compatibility-response cleanup

Implemented:

- Removed the unused generic-assistant property formatter and the duplicate
  `getPropertyContextForAI` relational loader. Search Assistant now has one
  bounded source: the `SEARCH_ASSISTANT` aggregation context.
- Kept the assistant response contract explicit by typing its returned
  Property Context envelope in the frontend client.
- Replaced persisted/output snapshot aliases with canonical names across
  Property Insight, narrative planning, Home Risk Replay, Service Price Radar,
  HomeScore report metadata, Home Event Radar, and report rendering.
- Migrated active frontend consumers from `propertyType`, `homeType`, and
  `squareFootage` aliases to `dwellingType` and `propertySize`.
- Retained `propertyType`, `homeType`, and `squareFootage` only where they are
  owned by an external payload, user-entered feature input, legacy targeting
  rule, or benchmark catalog—not as aliases for Property response truth.
- Extended the Phase 8 cleanup guard to reject restoration of the assistant
  loader/formatter or canonical snapshot aliases.

No Prisma schema changes or migration scripts are included in this slice.

## Slice 4 — financial, item, and snapshot ownership cleanup

Implemented:

- Added a typed optional `CoverageAnalysis.inventoryItemId` relation and
  recency index. Item analysis ownership and lookup no longer parse identity
  from `inputsSnapshot`; the snapshot is retained only as calculation evidence.
- Separated property-level and item-level coverage queries, staleness updates,
  scenario attachment, resolution insights, signals, orchestration, and shared
  data backfill with explicit relation predicates.
- Removed the unused `/home-management/home-assets` endpoint and mapper.
- Replaced active Property setup and warranty HomeAsset adapters with
  InventoryItem-backed `majorAppliances`/`inventoryItemId` contracts.
- Renamed active finance-snapshot UI/service adapters to canonical financing
  profile projections and corrected user-facing copy.
- Reclassified retained snapshot/run/scenario models by lifecycle and owner in
  `PHASE8_OWNERSHIP_AUDIT.md` rather than deleting valid historical artifacts.

This slice changes the Prisma schema but includes no migration script. The
repository owner must apply the schema through the normal database workflow.

## Slice 5 — canonical item and final forbidden-field cleanup

Implemented:

- Removed remaining frontend `homeAssetId`, `linkedHomeAssetId`, `HOME_ASSET`,
  `HomeAsset`, and `homeAsset` compatibility contracts and navigation branches.
  Guidance, bookings, providers, notifications, status board, coverage,
  warranties, quote comparison, and price finalization now carry canonical
  `inventoryItemId` ownership only.
- Removed legacy asset fallbacks from the active Property setup, guidance,
  verification, and repair-versus-replace UI models.
- Re-ran active backend, frontend, and worker source scans with zero legacy item
  ownership findings.
- Added a permanent cleanup guard that fails if a legacy item identity or model
  token is restored in production TypeScript source.

No Prisma schema changes or migration scripts are included in this slice.

## Slice 6 — executable archetype acceptance and operations evidence

Implemented:

- Expanded the deterministic ten-archetype gate to execute API/shared feature
  policy decisions, frontend canonical route generation, and worker-owned
  seasonal/habit context transformations.
- Added `npm run acceptance:phase8` as a live API/UI/worker release gate. It
  authenticates normally, validates canonical context facts for exactly ten
  UI-created properties, opens each property's Guidance UI in Playwright,
  checks worker process/BullMQ/cron metrics, and writes machine-readable JSON
  evidence.
- Added a credential-free ten-archetype manifest example and
  `PHASE8_RUNTIME_ACCEPTANCE_RUNBOOK.md`, including prerequisites, execution,
  failure handling, and evidence-retention rules.
- Remediation follow-up added an authenticated cross-phase decision-matrix API,
  five representative UI surface checks per archetype, meaningful worker metric
  validation, and explicit balcony/mixed-responsibility assertions.
- Property create/edit now captures every responsibility scope independently and
  preserves typed outdoor spaces instead of flattening them to one party/yard.
- Test-only HomeAsset vocabulary was removed. Frost dates, county/polygon Radar
  matching, and climate-shock attribution are now formally deferred with source
  evidence and revisit triggers rather than left as undocumented placeholders.
- Updated the Phase 8 FRD evidence references and cleanup guards.

The live gate requires a running database-backed API, frontend, worker metrics
service, and operator-created demo properties. It is intentionally not marked
as executed in this repository-only implementation environment. Each release
must retain the generated evidence as an operational artifact.

## Current status

Phase 8 implementation is complete. Slices 1 through 6 are implemented, the
final active-source scan is clean, and the runtime gate is executable and
evidence-producing. Running that gate against the ten UI-created properties is
a release-validation activity described in the runbook, not a remaining code
implementation item.
