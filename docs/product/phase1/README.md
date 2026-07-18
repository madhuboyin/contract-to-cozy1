# Product Framework Phase 1 — Trigger-First Activation

Status: Increment 1 implemented

Contract version: `phase1-v1`

Date: July 18, 2026

## Increment 1 outcome

The onboarding path now begins with the homeowner's active situation instead of an inspection requirement or generic Digital Twin promise. A successful address lookup creates the property, persists orthogonal entry context, and opens an evidence-bounded first action.

## Implemented

- Extended `PropertyOnboarding` with schema-only entry path, ownership state, property origin, trigger, source, first-value, consent, and resolution fields.
- Added authenticated property-scoped APIs to capture/read entry context, generate first value, and record the first action resolution.
- Added deterministic first-value guidance using the canonical `HomeAction` contract.
- Added supported-fact, unknown-fact, confidence, assumption, correction, and timing output.
- Added Now/Soon/Plan/Consider response buckets without inventing unsupported additional recommendations.
- Added complete, seven-day defer, not-relevant, and begin-action controls.
- Linked entry, trigger, identified action, surfaced action, resolution, verification, and outcome analytics.
- Added a context-first operating-mode policy and adopted it in orchestration, risk-task, and seasonal-care paths. `HomeownerSegment` remains a fallback only when entry context is absent.
- Replaced the acquisition copy and trigger-first form in the active onboarding path.
- Added a dedicated first-value screen.

## Database policy

`apps/backend/prisma/schema.prisma` changed. No Prisma or SQL migration script was created.

- There are no real users and no backfill is required.
- The repository owner generates and applies the database migration.
- Development/test databases may be reset and reseeded.

## Validation

```bash
npm -C apps/backend run prisma:generate
npm -C apps/backend run build
node --test apps/backend/tests/unit/phase1TriggerActivation.test.js apps/backend/tests/unit/productFrameworkContracts.test.js
npx tsc --noEmit -p apps/frontend/tsconfig.json
npm -C apps/frontend run qa:product-framework:routes
```

## Remaining Phase 1 scope

- Add manual address creation when public lookup returns no usable record.
- Add document, quote, invoice, photo, conversation, and free-text trigger ingestion beyond the initial selection/detail capture.
- Route each trigger to the strongest existing specialized adapter rather than the general guidance destination.
- Expand the deterministic baseline and 12-month plan beyond the first supported action while preserving evidence thresholds.
- Replace remaining direct segment checks across non-activation modules, then remove `HomeownerSegment` and its profile field.
- Add API integration tests against an owner-applied Phase 1 database schema.
- Complete product/domain/trust/legal approval before enabling material first-value recommendations for a launch cohort.
- Add pilot reporting for setup completion, useful/new recommendation identification, and 30-day action resolution.
