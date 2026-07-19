# Product Framework Phase 3 — Complete Major Repair / System Replacement

Status: Increments 1–3 and the operational acceptance harness are implemented; target-environment execution remains gated by explicit credentials

Human policy attestations do not gate Phase 3 testing. Database credentials, object-storage opt-in, provider compliance, durable proof, and verified closure remain mandatory in both governance modes; see [governance modes](../governance-modes.md).

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

## Increment 3 — Provider outcomes, proof upload, and follow-up health

Implemented:

- Added a property-scoped execution-readiness endpoint that presents service-category eligibility, jurisdiction requirements, approved credential types, verification dates, expiry dates, and missing requirements without exposing credential numbers or private documents.
- Presented readiness details before a guided platform-provider project is created and retained server-side eligibility enforcement.
- Linked moderated provider reviews to booking, project, guidance journey, scope, timeliness variance, price variance, and verified outcome.
- Exposed verified-outcome context on approved public provider reviews.
- Replaced manual completion proof URL fields with a reusable multi-kind uploader backed by the shared document vault.
- Linked existing uploaded documents into the completion transaction using property-scoped validation and stable proof keys.
- Added follow-up health states for healthy, needs-attention, and failed outcomes.
- Added follow-up health capture to the maintenance task drawer, project history, and analytics.
- Created an urgent/high-priority remediation action when a follow-up reports a concern or failure.
- Added a database acceptance test that validates owner-applied Phase 3 columns, verified closure write-back integrity, and proof-key uniqueness.

## Operational acceptance harness

Implemented:

- Added an opt-in, self-cleaning database pilot gated by `PHASE3_ACCEPTANCE_DATABASE_URL`; it never falls back to the ordinary development database URL.
- Creates isolated acceptance-only homeowner, property, inventory, provider, eligibility, service, booking, signal, journey, and project records.
- Exercises the full 14-step asset-lifecycle journey from trigger through provider execution and verified closure.
- Verifies HomeEvent, expense, warranty, inventory, material-spec, proof-document, provider-review, future-care, and audit write-backs against the real database.
- Replays the same closure payload and proves that no write-back counts increase.
- Verifies that an unsafe exception remains paused, high-importance, unverified, and free of success-only expense/write-back state.
- Completes the scheduled follow-up as needs-attention and verifies project health plus remediation-task creation.
- Removes the exact acceptance records after success or failure; no migration or seed script is created.
- Added an independent, opt-in real object-storage smoke gated by `PHASE3_ACCEPTANCE_STORAGE=true`; it uploads, verifies, and deletes a uniquely named proof object.
- Added `npm -C apps/backend run acceptance:phase3` as the canonical command.

## Remaining Phase 3 implementation

### Remaining target-environment execution

- Point `PHASE3_ACCEPTANCE_DATABASE_URL` at the database where the updated schema was applied, then run the acceptance command. The test intentionally skips database mutation when this dedicated variable is absent.
- Set the deployed storage credentials and `PHASE3_ACCEPTANCE_STORAGE=true` to exercise the real proof-object lifecycle. The storage smoke intentionally skips otherwise.
- The repository's current local `.env` database at `127.0.0.1:5433` is not treated as the acceptance target unless explicitly supplied through `PHASE3_ACCEPTANCE_DATABASE_URL`.

## Validation

```bash
npx prisma validate --schema apps/backend/prisma/schema.prisma
npm -C apps/backend run build
npx tsc --noEmit -p apps/frontend/tsconfig.json
node --test apps/backend/tests/unit/phase3MajorMoment.test.js
npm -C apps/frontend run qa:product-framework:routes
PHASE3_ACCEPTANCE_DATABASE_URL=postgresql://... npm -C apps/backend run acceptance:phase3
PHASE3_ACCEPTANCE_STORAGE=true S3_BUCKET=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... npm -C apps/backend run acceptance:phase3
```
