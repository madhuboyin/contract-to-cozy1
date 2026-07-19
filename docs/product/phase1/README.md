# Product Framework Phase 1 — Trigger-First Activation

Status: Code implementation complete; human launch approvals deferred during internal beta and enforced before real-user launch

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
- Added an entry-context operating-mode policy and adopted it in orchestration, risk-task, seasonal-care, provider, checklist, planning-context, and dashboard paths. There is no permanent homeowner-segment fallback.
- Replaced the acquisition copy and trigger-first form in the active onboarding path.
- Added a dedicated first-value screen.
- Added a manual-address continuation path so unavailable public records no longer block activation.
- Redirected the obsolete speculative reveal route into the evidence-bounded confirmation flow.
- Replaced the missing generic guidance destination with existing specialized workspaces for repair, replacement, quote, maintenance, coverage, project, anticipated-cost, inspection, warranty, claim, and transfer triggers.
- Rendered the canonical correction/add-context action on the first-value screen.
- Added homeowner-consented free-text, conversation, document, quote, invoice, photo, and email/PDF trigger evidence intake using the existing property document store.
- Persisted up to 20 evidence references with the active trigger and incorporated them into confidence, supported facts, and canonical `HomeAction` evidence.
- Selected the canonical maintenance, coverage, incident, project, system, or guidance adapter from trigger context and carried stable trigger identifiers into the destination workflow.
- Added a dashboard-wide activation handoff banner so specialized destinations load the active action, evidence count, and confidence with a route back to evidence intake.
- Expanded the 12-month response with a bounded context-completion action only when explicit unknowns remain; unsupported plan buckets remain visibly empty.
- Removed `HomeownerSegment`, its profile field, signup choice, API payloads, frontend hooks, and direct backend/frontend eligibility checks. Purchase and ownership behavior now use property entry context.
- Added explicit useful/new, useful-reminder, and not-useful first-value feedback.
- Added an MFA/capability-protected Phase 1 pilot report and admin scorecard for minimum setup, useful/new recommendation identification, and 30-day action resolution, including exact denominators and targets.

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

- Add API integration tests against an owner-applied Phase 1 database schema.
- Internal testing is not blocked by missing human attestations. Complete product/domain/trust/legal approval before enabling material first-value recommendations for real users by setting `ENFORCE_HUMAN_POLICY_APPROVALS=true`; see [governance modes](../governance-modes.md).
- Run a real pilot and evaluate the 60% setup, 50% useful/new recommendation, and 30% 30-day resolution targets. There are currently no real users, so the reporting contract is implemented but target attainment cannot yet be measured.
