# Product Framework Phase 4 — Trust, Cadence, Grounded Ask, and Recurring Care

Status: Increment 1 implementation started

Contract version: `phase4-v1`

Date started: July 18, 2026

## Objective

Make recurring engagement useful, explainable, and governable. Phase 4 builds on the canonical Home Action and recommendation governance contracts established in Phase 0 instead of introducing a parallel trust system.

## Increment 1 — Persisted trust tiers and recommendation review queue

Implemented:

- Added typed `LOW_CONSEQUENCE`, `MATERIAL_FINANCIAL`, `REGULATED_COVERAGE`, and `SAFETY_EMERGENCY` tiers to persisted recommendation definitions.
- Added a versioned governance policy identity to every reviewed definition.
- Classified the five implemented personalization definitions and attached schema-validated professional boundaries, conservative fallbacks, and emergency escalation language.
- Added role-specific Product, Domain, Trust, Legal/Compliance, and Commercial Integrity review attestations.
- Made review decisions idempotent per definition, role, and policy version while retaining each change in the append-only personalization audit ledger.
- Blocked catalog activation until the exact tier-required roles approve the current policy version.
- Blocked activation when persisted trust metadata disagrees with the code-owned reviewed catalog.
- Added an MFA-protected admin trust queue with readiness, required roles, approvals, rejections, and activation gating.
- Added safety tier and governance boundaries to generated personalization responses and homeowner recommendation surfaces.
- Updated the idempotent pgAdmin bootstrap to synchronize definition trust metadata while leaving rules and content in `DRAFT`.
- Added focused Phase 4 contract coverage.

## Database policy

Phase 4 Increment 1 changes the Prisma schema but does not include a migration script. There are no real users or data-migration requirements. The repository owner applies the updated schema and reruns the canonical personalization bootstrap as appropriate.

## Remaining Phase 4 increments

### Trust completion

- Add safety tiers to guidance templates and persisted journey steps.
- Add safe low-confidence, unavailable-data, and upstream-failure response contracts across recommendation producers.
- Add recommendation incident intake, triage, resolution, and calibration/reversal/complaint/override reporting.
- Extend tier validation beyond the initial reviewed personalization catalog to every material recommendation producer.

### Canonical notification policy

- Consolidate category, urgency, channel, cadence, quiet hours, digest, property, and member scope behind one preference service.
- Route low-priority recurring items to the weekly Home Brief and reserve immediate delivery for material urgency.
- Add mute-type, not-relevant, and already-handled controls plus usefulness/noise outcome metrics.

### Grounded Ask

- Require a property or explicitly label general answers.
- Return Living Home Record evidence, known facts, assumptions, missing facts, confidence, safety boundaries, and a next action.
- Permit only schema-validated proposals and require confirmation before material state changes.
- Persist confirmed facts, decisions, actions, or notes rather than raw chat by default.

## Validation

```bash
npx prisma validate --schema apps/backend/prisma/schema.prisma
npm -C apps/backend run build
npx tsc --noEmit -p apps/frontend/tsconfig.json
node --test apps/backend/tests/unit/phase4TrustGovernance.test.js
node --test apps/backend/tests/unit/personalizationCatalogAdmin.test.js
```
