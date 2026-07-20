# Product Framework Phase 2 — Unified Home and Action System

Status: Increments 1–3 and post-cutover Home experience hardening implemented

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

## Post-cutover Home experience hardening

Implemented July 20, 2026:

- Added a property-scoped Prioritized Action Plan at `/dashboard/properties/:propertyId/action-plan` so the Home summary links to the complete ranked list and its supporting timing, consequence, confidence, evidence, and next-action details.
- Kept the Prioritized Action Plan broader than the Resolution Center. The plan includes every eligible canonical Home Action; the Resolution Center remains the execution surface for repair, incident, provider, and related resolution cases.
- Removed internal contract/version labels from homeowner-facing Home presentation.
- Deduplicated equivalent low-confidence context actions and replaced raw enum/system identifiers with homeowner-readable names.
- Added context-specific service titles and CTAs, including the affected home system or item.
- Added one grouped seasonal-maintenance Home Action for the active or nearest checklist, including task count, critical-task count, progress, timing, and a checklist destination.
- Added distinct critical-weather Home presentation with urgent priority, NWS source and instructions, expiry context, and restricted lifecycle controls.
- Suppressed lower-value incident-derived weather guidance when the canonical severe-weather action represents the same event.
- Kept notifications as the delivery and awareness channel while making unresolved seasonal and critical-weather work persistently discoverable on Home.
- Aligned the Home-at-a-glance prioritized-action count with the same canonical ranked feed opened by its link.

## Increment 3 — Source promotion and route-contract hardening

Implemented:

- Promoted active guidance journeys, incidents, recall matches, material coverage analyses, and projects into the canonical property action feed.
- Kept maintenance and system/risk actions on the existing orchestration adapter and activation actions on the entry-context adapter, so all currently actionable production source families now converge in one feed.
- Added source-specific evidence, confidence, timing, consequence, CTA, correction, and governance mapping.
- Preserved conservative escalation and restricted lifecycle controls for critical incidents and recalls.
- Required verified property jurisdiction context and a professional boundary before regulated coverage actions validate.
- Applied terminal-event and active-snooze suppression to promoted sources so completed, dismissed, or snoozed actions do not reappear.
- Added a promoted-source diagnostic count to the shared Home feed contract.
- Extended the route audit from page classification to canonical CTA, guidance-template, and statically generated notification destination contracts; later phases add their guidance destinations to the same living contract set.
- Replaced dead `/inventory/coverage` guidance destinations with the property inventory coverage filter.
- Replaced duplicate global inspection-report guidance destinations with the property-scoped inspection hub.
- Added service-level integration coverage for all five promoted source families and lifecycle suppression.

## Remaining Phase 2 operational acceptance

The target Prisma schema has been applied. This beta has no separate test, development, or staging database, so schema migration is not a Phase 2 documentation or implementation gap. Continue to use deterministic service tests, frontend builds, the executable route audit, and narrowly scoped authenticated smoke checks against beta data. Before a real-user launch, execute production-readiness acceptance for representative guidance, incident, recall, coverage, project, maintenance, seasonal, weather, and activation records.

### Future source eligibility

- `PERSONALIZATION` retains a canonical adapter and requires an active definition plus evidence and governance metadata. Missing human attestations are advisory during internal beta and blocking when `ENFORCE_HUMAN_POLICY_APPROVALS=true`; technical safety validation is never bypassed. See [governance modes](../governance-modes.md).

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
