# Product Framework Phase 3 — Complete Major Repair / System Replacement

Status: Increments 1–2 implemented; provider-review enrichment and database-backed acceptance remain

Contract version: `phase3-v1`

Date started: July 18, 2026

## Objective

Deliver the first complete recognize–decide–act–learn major moment by extending the canonical asset-lifecycle journey from diagnosis and booking through execution, verified closure, Living Home Record updates, and future care.

## Increment 1 — Canonical execution handoff

Implemented:

- Extended `asset_lifecycle_resolution` from eight steps to fourteen and bumped its template version to `3.0.0`.
- Added required stages for scope/provider confirmation, work tracking, outcome verification, proof capture, Home Record update, and future care.
- Added orthogonal project context for repair versus replacement, provider versus DIY, self-paid versus covered/mixed funding, and minor versus major complexity.
- Added typed `ProjectRecord` relationships to the originating `GuidanceJourney` and `InventoryItem`.
- Preserved the journey template/recommendation version on the project.
- Allowed guidance to be a first-class project source.
- Required provider identity for provider-led projects while allowing DIY execution without a synthetic contractor.
- Validated journey, inventory, price-finalization, and booking identifiers against the property before project persistence.
- Prevented a journey from linking to multiple active projects and rejected journey/item mismatches.
- Completed the `confirm_scope_and_provider` guidance step when a linked project is created.
- Added a guided project-creation surface that captures the four adaptive execution dimensions.
- Kept linked project actions on the canonical Home feed and preserved their journey lineage.

## Database policy

Phase 3 changes the Prisma schema but does not include a migration script. The repository owner must apply the schema changes to the target database and may reset/reseed development data because there are no real users or migration requirements.

## Increment 2 — Verified closure and Living Home Record write-back

Implemented:

- Replaced placeholder completion audits with one serializable, idempotent transaction.
- Added explicit verified-success, incomplete, failed, disputed, delayed, and unsafe outcome states.
- Required commissioning, functional, safety, and inspection results and prevented blocking exceptions from being labeled verified closure.
- Made provider ratings conditional on provider-led verified work; DIY closure no longer requires synthetic ratings.
- Added durable proof documents and before/after, invoice, warranty, permit, and completion-record classifications.
- Created or updated the linked HomeEvent, expense, inventory identity/service history, warranty, material specifications, and inspection-finding state.
- Added maintenance, inspection, warranty, replacement-horizon, and outcome follow-up tasks using stable action keys.
- Advanced stages 10–14 from durable closure evidence and returned the journey to its updated Home context.
- Added a lightweight minor-work endpoint and UI path that completes the journey without creating a `ProjectRecord`.
- Captured provider-fit rationale, commercial relationship disclosure, selection criteria, and non-commercial alternatives before guided provider work.
- Rechecked platform-provider status, license, insurance, and category eligibility when guided project execution begins.
- Emitted price variance, elapsed/blocked days, recommendation override, provider result, write-back volume, and follow-up-plan measurements.

## Remaining Phase 3 implementation

### Remaining completion work

- Surface category/jurisdiction credential detail from the provider directory, rather than only enforcing its eligibility result at project creation.
- Join the public provider review aggregate to scope, journey, timeliness, cost variance, and verified outcome while retaining the project-level review evidence now captured.
- Add follow-up health measurement when the scheduled outcome check is completed.
- Add database-backed trigger-to-verified-closure acceptance coverage after the owner applies the schema.
- Replace proof URL/key entry with the shared uploader when that component supports multi-kind completion evidence.

## Validation

```bash
npx prisma validate --schema apps/backend/prisma/schema.prisma
npm -C apps/backend run build
npx tsc --noEmit -p apps/frontend/tsconfig.json
node --test apps/backend/tests/unit/phase3MajorMoment.test.js
npm -C apps/frontend run qa:product-framework:routes
```
