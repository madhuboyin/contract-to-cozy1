# Property Context Phase 7 Implementation Status

Date: 2026-07-17

Scope: FRD §21.9 — aggregation and cross-feature personalization.

## Slice 1 — aggregation contract and primary entry points

Implemented:

- Added `aggregationContext/applicabilityPolicy.ts`, which returns explainable
  Property Context decisions for Dashboard/Today, Action Center, Personalized
  Guidance, Home Gazette, Knowledge targeting, notifications,
  search/assistant, report summaries, and scoped worker batches.
- Added bounded Phase 7 scope maps and one standard aggregation envelope.
- All aggregation scopes explicitly exclude `OPTIONAL_HOUSEHOLD`; property
  eligibility remains available without household-profile consent.
- Dashboard/Today (`daily-snapshot`) returns and renders the Phase 7 envelope.
- Action Center (`orchestration summary`) returns and renders the same standard
  envelope while keeping feature ranking and calculations in their existing
  authoritative modules.
- The existing Personalization Engine returns and renders the Property Context
  envelope for both its main and module-recommendation APIs. Optional household
  answers may adjust ranking only after consent; they do not determine basic
  property eligibility.
- Daily action and Action Center completion/snooze/photo mutations now require
  CONTRIBUTOR or OWNER access; VIEWER remains read-only.

No Prisma schema changes or migration scripts are included in this slice.

## Completion slice — cross-surface consumers

Implemented:

1. Home Gazette generation and reads use `HOME_GAZETTE`; location-unknown
   properties are skipped instead of receiving fabricated local targeting.
   The Gazette UI renders the standard explanation.
2. The authenticated Knowledge Hub property endpoint uses
   `KNOWLEDGE_TARGETING`, falls back safely when targeting is unavailable, and
   the property-linked Knowledge UI renders the explanation.
3. Property-bound notifications run `NOTIFICATIONS` at creation and workers
   recheck the same policy immediately before email, push, or SMS delivery.
4. Generic assistant sessions now receive only `SEARCH_ASSISTANT` facts plus
   explicit used/missing fact lists; optional household, inventory, finance,
   claim, and document data are no longer loaded by the generic entry point.
5. Report APIs and authoritative report snapshots include the
   `REPORT_SUMMARIES` envelope.
6. Added a bounded-concurrency aggregation batch loader. Gazette and
   notification workers use it rather than unbounded feature-owned reads.
7. Added canonical lifecycle identity and deterministic duplicate precedence.
   Action Center reconciles active, completed, snoozed, suppressed, and
   expired maintenance/guidance states before ranking.
8. Personalization production entry points now compute traits from the
   authorized `PERSONALIZED_GUIDANCE` snapshot. The direct repository loader
   remains only as a standalone evaluation/test compatibility seam.
9. Added archetype, lifecycle, optional-consent-boundary, and API/UI/worker
   source-parity coverage.

## Phase 7 status

Complete for FRD §21.9. No Prisma schema changes and no migration scripts were
required.

## Slice 1 exit checks

- Every aggregation feature requests a bounded set of scopes.
- No Phase 7 aggregation scope requests optional household context.
- Missing, stale, or conflicted aggregation inputs remain `UNKNOWN`.
- Today, Action Center, and Personalized Guidance expose the standard context
  envelope and their UIs render `PropertyContextNotice`.
- Mutation role floors preserve the collaborator authorization boundary.
