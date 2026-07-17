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

## Remaining Phase 7 slices

1. Home Gazette and Knowledge Hub targeting: replace local targeting checks
   with authoritative feature decisions and render the standard explanation.
2. Notification consistency: require the originating feature policy decision
   immediately before every send, with shared lifecycle suppression.
3. Search and assistant entry points: pass bounded property context and expose
   used/missing fact explanations without optional household data.
4. Report-summary aggregation: consume report feature envelopes instead of
   recomputing eligibility in summary composers.
5. Worker batch context: add a scoped batch loader and update aggregation jobs
   to avoid per-feature unbounded property reads.
6. Cross-surface lifecycle reconciliation: use one identity for active,
   completed, snoozed, suppressed, expired, and duplicate results across
   Dashboard, Action Center, Guidance, Gazette, and notifications.
7. Archetype and API/UI/worker parity tests covering the full Phase 7 exit
   gate.

## Slice 1 exit checks

- Every aggregation feature requests a bounded set of scopes.
- No Phase 7 aggregation scope requests optional household context.
- Missing, stale, or conflicted aggregation inputs remain `UNKNOWN`.
- Today, Action Center, and Personalized Guidance expose the standard context
  envelope and their UIs render `PropertyContextNotice`.
- Mutation role floors preserve the collaborator authorization boundary.
