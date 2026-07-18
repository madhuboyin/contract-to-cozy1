# Product Framework Phase 2 — Unified Home and Action System

Status: Increments 1–3 implemented; database-backed runtime integration remains pending owner schema application

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

Increment 1 did not require a schema change. Increment 2 extends `ProductAnalyticsEventType` with opened, acted, and superseded action-lineage events. No migration script was created. The repository owner must apply the enum change to the database.

## Increment 2 — Unified Home and navigation cutover

Implemented:

- Added `GET /api/properties/:propertyId/home` as the shared desktop/mobile Home contract.
- Added one responsive Home surface with What needs attention, Decisions to make, Active major moment, Home at a glance, and Ask ContractToCozy.
- Limited default attention to five ranked actions while preserving a link to the complete plan.
- Connected complete, seven-day defer/snooze, not-relevant, correction, and primary-action controls to the canonical command API.
- Added property-grounded Ask suggestions and a dedicated `/dashboard/ask` surface.
- Added active project/guidance stage, blocker, and next-milestone projection.
- Added Home Record completeness, systems, verification, coverage-gap, open-work, and recent-change summaries.
- Replaced separate desktop/mobile dashboard presentation with the same responsive component hierarchy.
- Consolidated desktop and mobile homeowner navigation to Home, Plan & Projects, Home Record, Ask, and Profile & Settings.
- Reclassified the full action plan under Plan & Projects and kept specialized tools contextual.
- Added stable shown, opened, acted, resolved, superseded, and verified action-lineage taxonomy and interaction capture.

## Increment 3 — Source promotion and route-contract hardening

Implemented:

- Promoted active guidance journeys, incidents, recall matches, material coverage analyses, and projects into the canonical property action feed.
- Kept maintenance and system/risk actions on the existing orchestration adapter and activation actions on the entry-context adapter, so all currently actionable production source families now converge in one feed.
- Added source-specific evidence, confidence, timing, consequence, CTA, correction, and governance mapping.
- Preserved conservative escalation and restricted lifecycle controls for critical incidents and recalls.
- Required verified property jurisdiction context and a professional boundary before regulated coverage actions validate.
- Applied terminal-event and active-snooze suppression to promoted sources so completed, dismissed, or snoozed actions do not reappear.
- Added a promoted-source diagnostic count to the shared Home feed contract.
- Extended the route audit from page classification to 101 canonical CTA, guidance-template, and statically generated notification destination contracts.
- Replaced dead `/inventory/coverage` guidance destinations with the property inventory coverage filter.
- Replaced duplicate global inspection-report guidance destinations with the property-scoped inspection hub.
- Added service-level integration coverage for all five promoted source families and lifecycle suppression.

## Remaining Phase 2 implementation

### Database-backed runtime acceptance

- Apply the Phase 2 `ProductAnalyticsEventType` enum change to the target database. No migration script is included by design.
- Run authenticated database-backed acceptance against a property containing guidance, incident, recall, coverage, project, maintenance, and activation records.
- Confirm notification deep links produced by live jobs against the route-contract audit before duplicate-route redirects are enabled.

### Future source eligibility

- `PERSONALIZATION` retains a canonical adapter but is not loaded into the default feed until recommendations have explicit review status, evidence, and governance eligibility. This is an intentional safety gate rather than unfinished wiring.

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
node --test apps/backend/tests/unit/phase2SourcePromotion.test.js
npx tsc --noEmit -p apps/frontend/tsconfig.json
npm -C apps/frontend run qa:product-framework:routes
```
