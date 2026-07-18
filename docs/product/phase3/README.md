# Product Framework Phase 3 — Complete Major Repair / System Replacement

Status: Increment 1 implemented; execution verification, proof write-back, future care, commercial integrity, and outcome analytics remain in progress

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

Increment 1 changes the Prisma schema but does not include a migration script. The repository owner must apply the schema changes to the target database and may reset/reseed development data because there are no real users or migration requirements.

## Remaining Phase 3 implementation

### Execution and closure

- Resolve a guidance-linked project directly from stages 10–14 and advance each stage from durable project evidence.
- Add adaptive minor-work execution that does not require a `ProjectRecord`.
- Capture commissioning, functional verification, safety checks, inspection results, and unresolved exceptions.
- Capture invoice, warranty, model/serial, permits, photos, actual cost, work date, and provider outcome.

### Transactional write-back

- Replace placeholder project write-back audit rows with idempotent transactional writes to HomeEvent, inventory history, documents, expenses, warranties, and material specifications.
- Reset maintenance and create inspection, warranty, replacement-horizon, and follow-up actions.
- Preserve before/after evidence and explicit failed, disputed, delayed, incomplete, and unsafe outcome states.

### Provider and measurement completion

- Add provider ranking rationale, category/jurisdiction credential presentation, commercial relationship disclosure, and non-commercial alternatives at selection time.
- Join provider review to scope, journey, timeliness, cost variance, and verified outcome.
- Add completion, blocked-time, price-variance, override, provider-result, and follow-up-health analytics.
- Add database-backed trigger-to-verified-closure acceptance coverage after the schema is applied.

## Validation

```bash
npx prisma validate --schema apps/backend/prisma/schema.prisma
npm -C apps/backend run build
npx tsc --noEmit -p apps/frontend/tsconfig.json
node --test apps/backend/tests/unit/phase3MajorMoment.test.js
npm -C apps/frontend run qa:product-framework:routes
```
