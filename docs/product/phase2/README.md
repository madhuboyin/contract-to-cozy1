# Product Framework Phase 2 — Unified Home and Action System

Status: Increment 1 implemented; unified Home surface and navigation cutover remain in progress

Contract version: `phase2-v1`

Date started: July 18, 2026

## Objective

Make ContractToCozy feel like one calm home operating system rather than a catalog of independent tools. Phase 2 introduces one property-scoped action contract, one lifecycle command surface, and one responsive Home hierarchy.

## Increment 1 — Canonical action-system cutover

Implemented:

- Added `GET /api/properties/:propertyId/home-actions` as the canonical property action feed.
- Reused the existing canonical `HomeAction` source adapters instead of creating a parallel recommendation model.
- Combined active orchestration actions with unresolved trigger-first activation actions.
- Added deterministic ranking across consequence, urgency, confidence, household relevance, actionability, and missing-context penalties.
- Added deterministic cross-source deduplication with winner selection and merge diagnostics.
- Returned Now, Soon, Plan, and Consider buckets from the same ranked contract.
- Returned candidate, surfaced, duplicate, suppressed, and snoozed diagnostics.
- Added `POST /api/properties/:propertyId/home-actions/:actionId/commands` for complete, defer, snooze, dismiss, already-done, not-relevant, and correct-fact commands.
- Required a future trigger for defer/snooze and explicit consequence acknowledgement for defer/dismiss/not-relevant.
- Prevented safety/emergency actions from being deferred or dismissed from the default feed.
- Made user dismissal an authoritative suppression source so dismissed actions do not immediately reappear.
- Preserved idempotent command writes and stable resolution lineage.
- Applied property authorization to reads and contributor-or-owner authorization to mutations.
- Extended property entry-context access to authorized household members rather than only the original profile owner.
- Added frontend DTOs and API client methods for the feed and command contract.

## Database policy

Increment 1 does not require a Prisma schema change or migration script. It reuses existing orchestration event, snooze, completion, onboarding, and analytics storage.

## Remaining Phase 2 implementation

### Unified Home contract and surface

- Build one backend Home response containing ranked attention, active decisions, active major moment, home-at-a-glance context, and grounded Ask prompts.
- Replace the current desktop/mobile dashboard divergence with one responsive component hierarchy.
- Limit the default attention surface while preserving access to the complete action plan.
- Render canonical lifecycle controls and priority explanations directly on Home action cards.

### Navigation and route cutover

- Consolidate homeowner navigation to Home, Plan & Projects, Home Record, Ask, and Profile & Settings.
- Move specialized tools behind contextual actions, journeys, Home Record objects, Ask, and command search.
- Update internal links, notification URLs, analytics route names, tests, and guidance template paths before redirecting duplicate routes.
- Extend route-contract checks to every canonical CTA and journey step.

### Action-system completion

- Add explicit opened, acted, superseded, and verified event semantics alongside existing shown/resolved lineage.
- Expand adapters beyond the currently active trigger-first, maintenance, and risk sources as each source is promoted into the default feed.
- Add database-backed integration coverage after the repository owner applies any later Phase 2 schema changes.

## Increment 1 acceptance evidence

- One authenticated, property-scoped endpoint returns canonical ranked actions.
- Ranking exposes its components and missing-context penalty.
- Exact duplicate signals appear once and retain merge diagnostics.
- Default lifecycle commands share one validation and authorization policy.
- Safety actions cannot be silently deferred or dismissed.
- Desktop and mobile clients can consume the same feed DTO when the unified Home surface is cut over.

## Validation

```bash
npm -C apps/backend run build
node --test apps/backend/tests/unit/phase2HomeActions.test.js
npx tsc --noEmit -p apps/frontend/tsconfig.json
```
