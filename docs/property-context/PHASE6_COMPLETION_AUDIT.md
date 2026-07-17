# Property Context Phase 6 Completion Audit

Date: 2026-07-17 (revised after independent review remediation)

Scope: Seller Prep, Home Buyer workflows, Moving Plan, Neighborhood Change
Radar, Community/Local Updates, Home Digital Will, Home Digital Twin, Home
Timeline, Reports, and Document/Vault sharing (FRD §21.8).

## Remediation history

The initial Phase 6 implementation was independently reviewed and nine
findings were raised (six confirmed as stated, two partially valid, one
overstated — see conversation record for the full triage). All confirmed and
partially-valid findings were remediated in a second pass and are folded into
this document. The findings and fixes:

1. **Local Updates received no location/dwelling context.**
   `propertyAuthMiddleware` only attaches `{ id }` to `req.property`, so the
   controller's `city`/`state`/`zipCode`/`dwellingType` reads had always been
   `undefined` — the targeting query's `OR: []` matched nothing. Fixed: the
   controller now loads the property's canonical facts directly and evaluates
   `localUpdatesTargeting` before querying. This was pre-existing and made the
   feature functionally dead; Phase 6 inherited rather than caused it, but it
   is in scope and now fixed.
2. **VIEWER role could perform Phase 6 mutations.** No minimum-role check
   existed on Vault password/share-link creation, Digital Will creation, or
   Digital Twin init/refresh/scenario mutations. Added
   `requireHouseholdRole(minimumRole)` middleware (CONTRIBUTOR floor for twin
   and will mutations, OWNER floor for vault password and share-link
   creation); scenario reads remain open to VIEWER.
   The remaining mutation surfaces are now covered as well: Home Timeline
   create/update/delete and document attachment require CONTRIBUTOR,
   Neighborhood Radar recompute requires OWNER, report creation requires
   CONTRIBUTOR, and report share/regenerate/delete operations re-resolve the
   report property and enforce a CONTRIBUTOR floor.
3. **Four policy decisions were defined but never evaluated.**
   `movingPlanning` is now asserted in `generateMovingPlan` before generation;
   `saleReadiness` is attached to the seller readiness report; `sharedReportProjection`
   is evaluated in `prepareShareArtifacts` before a share is created;
   `localUpdatesTargeting` gates the Local Updates response (see #1).
4. **Neighborhood impacts were owned by event, not by property-event link.**
   `NeighborhoodImpact`/`DemographicImpact` were keyed by `eventId` alone and
   deleted/recreated per property inside the matching loop — the last matched
   property's impacts silently overwrote every other property's. Fixed with a
   schema change: both models now carry `propertyNeighborhoodEventId` (cascade
   delete), and `PropertyNeighborhoodEvent` has `@@unique([propertyId, eventId])`.
   The match loop upserts via that key, deletes/recreates only the link's own
   impacts, and removes links that are no longer geographically eligible on
   rerun. Link ownership is now required in the schema and the radar query
   service reads only link-owned impacts; the ambiguous event-owned fallback
   has been removed. Property location edits asynchronously trigger a
   reconciliation that considers both the new area and already-linked events,
   so relocation removes stale old-area links.
5. **Shared reports never expired when context changed.** A redacted share
   link remained downloadable indefinitely regardless of property changes.
   Fixed: the share-token download route now rechecks the current REPORTS
   context version against the version stored at generation and returns 410
   (with an `EXPIRED` event logged) when they differ or no version was
   recorded, rather than serving a stale artifact.
6. **Vault password/token access returned the unredacted payload.** The vault
   is a deliberate owner-configured emergency-access channel (not a public
   report), so its projection has a separately named, explicit allowlist. It
   retains the exact emergency location and approved item/service descriptors,
   but strips model numbers, serial numbers, and service pricing from every
   password- and token-authenticated response. The projection is constructed
   field-by-field so newly added model fields cannot leak by default;
   owner-authenticated views are unaffected.
7. **Digital Twin staleness was computed but never surfaced.** The backend
   serialized `contextVersion` but no endpoint attached a decision envelope,
   and the frontend DTO didn't carry the field. Fixed: `getTwin` now attaches
   a `DIGITAL_TWIN` envelope (current vs. generated context version), the
   frontend `HomeDigitalTwinDTO` gained `contextVersion`/`context`, and the
   twin client renders `PropertyContextNotice`.
8. **Report-generation policy on UNKNOWN and reconciliation scope** were
   reviewed and found to be working as designed: UNKNOWN correctly does not
   block report generation (FRD principle 5 — unknown is a recorded state, not
   suppression), and owner-facing `REVIEW_REQUIRED` reconciliation matches the
   Phase 3/5 precedent. The one real gap in this area was the unbounded shared
   artifact, covered by #5.
9. **Behavioral test coverage** was added for every fix above — see the
   remediation exit gate below — rather than left as a follow-up.

The final remediation pass also connected policy decisions that existed but
were not yet consumed by all Phase 6 surfaces: Home Buyer tasks use the shared
segment rule; Home Timeline, Community Events, and Neighborhood Radar return
decision envelopes; Daily Pulse gates Local Updates through the shared policy;
and the neighborhood notification worker evaluates the same authoritative
Neighborhood Radar decision before sending.

## Architecture

Phase 6 follows the established family-module pattern:

- `src/services/planningContext/applicabilityPolicy.ts` — one deterministic
  policy for planning/seller/neighborhood/continuity decisions
  (`sellerPrepPlanning`, `saleReadiness`, `homeBuyerWorkflow`, `movingPlanning`,
  `neighborhoodRelevance`, `localUpdatesTargeting`, `digitalWillComposition`,
  `digitalTwinProjection`, `timelineComposition`, `reportGeneration`,
  `sharedReportProjection`).
- `src/services/planningContext/context.ts` — per-feature scope maps and
  fact-key-scoped context versions, decision envelopes, and the standard
  reconciliation/assert helpers (mirrors `financialContext`).
- `src/services/planningContext/reconciliation.ts` — CURRENT/REVIEW_REQUIRED
  reconciliation for persisted planning outputs.
- `src/services/planningContext/redaction.ts` — the approved redacted share
  projection (allowlist-based, deny by default) plus the forbidden-field list.
- `src/services/planningContext/reportSnapshot.ts` — the single authoritative
  report snapshot builder used by backend and workers, plus the worker context
  recheck (owner-resolution pattern shared with Phase 4 permits).

## FRD §21.8 tuning evidence

| Tuning goal | Implementation |
|---|---|
| Property use and future-state relevance | Seller Prep generates from `core.propertyUse`/`core.dwellingType`/location context (with `SALE_INTENT_RECORDED` when FOR_SALE); Moving Plan requires use/occupancy/location; Home Buyer follows the product segment only. |
| Open condition/project/permit/coverage context | `saleReadiness` requires open findings, permits, unpermitted flags, active projects, and coverage sources before a readiness judgment. |
| Neighborhood and location relevance | Event↔property matching now uses real geocoded distance within the event-type radius (city/state co-location only as fallback); the notification worker rechecks location relevance before sending and fails closed on missing location. |
| Redacted sharing projections | Public report links serve only a separately rendered redacted PDF built from `buildRedactedReportSnapshot` and fail closed (409) when no redacted artifact exists. Emergency Vault links use a distinct allowlist projection that intentionally retains the location needed by the trusted recipient while excluding model/serial numbers and prices. |
| Digital twin as projection | Schema comment corrected; twin stamps the Property Context version it was computed from on init and refresh and serializes it; `occupantsCount` (household-consent fact) removed from the twin build. |

## Canonical-context corrections in Phase 6 surfaces

- Seller Prep: legacy `propertyType` reads replaced by canonical
  `dwellingType` via Property Context; plan rows stamp `contextVersion`; the
  overview API returns the standard decision envelope.
- Neighborhood match: legacy `ownershipType`/`propertyType` replaced by
  `propertyUse`/`dwellingType`; drainage read moved to the canonical
  `PropertyExteriorProfile`.
- Local Updates: `LocalUpdate.propertyTypes PropertyType[]` replaced by
  `dwellingTypes DwellingType[]`; unknown dwelling matches only broadly
  targeted updates (unknown is never treated as a typed match). Consumers
  (`localUpdates.controller`, `dailyHomePulse`) updated.
- Reports: the worker's duplicated snapshot builder was deleted; both paths use
  `buildAuthoritativeReportSnapshot`, which sources the property block from
  CORE/LOCATION facts, records `meta.contextVersion` and the report decision,
  and fixed a latent bug where insurance provider/premium/coverage fields were
  silently blank (wrong field names behind `any` casts).
- Home Buyer checklist remains user-scoped; its server-side segment check now
  calls the same exported segment evaluator used by `homeBuyerWorkflow`.
- Home Timeline serves canonical `HomeEvent` records and attaches the
  `timelineComposition` decision envelope to list/detail responses.
- Community Events and Neighborhood Radar attach their Phase 6 envelopes;
  Daily Pulse and neighborhood notifications evaluate those same policies
  before surfacing data or sending a notification.
- Digital Will API returns the continuity decision envelope; the trusted-contact
  scoped view remains owner-authenticated and access-level scoped.

## Schema changes (no migration scripts; owner applies)

- `SellerPrepPlan.contextVersion String?`
- `MovingPlan.contextVersion String?`
- `HomeDigitalTwin.contextVersion String?` (+ projection comment)
- `HomeReportExport.contextVersion String?`, `redactedSnapshot Json?`,
  `shareStorageBucket String?`, `shareStorageKey String? @unique`
- `HomeReportExportEventType.SHARE_ARTIFACTS_PREPARED`
- `LocalUpdate.dwellingTypes DwellingType[]` (replaces `propertyTypes`)
- `PropertyNeighborhoodEvent.@@unique([propertyId, eventId])` (remediation #4)
- `NeighborhoodImpact.propertyNeighborhoodEventId String` + cascade relation
  (remediation #4)
- `DemographicImpact.propertyNeighborhoodEventId String` + cascade relation
  (remediation #4)

## Workers

- `generateHomeReportExport.job` uses the shared builder and
  `checkReportWorkerContext` (blocks generation when the owner cannot be
  resolved or reports are NOT_APPLICABLE); stamps `contextVersion`.
- `neighborhoodChangeNotification.job` evaluates the authoritative
  Neighborhood Radar policy and rechecks geocoded/location relevance before
  every send.
- Workers Dockerfile copies `services/planningContext/*` (curated list
  updated); workers `@prisma/client` resynced from backend after the schema
  change.

## Exit gate

- Planning/report outputs read current authoritative context: report property
  block from CORE/LOCATION facts, seller checklist from canonical dwelling,
  twin from canonical records with a stamped generation context version.
- Shared reports expose only the approved redacted projection:
  `phase6RedactionExitGate.test.js` deep-scans the projection for forbidden
  fields and values, verifies the share route serves only the redacted
  artifact and fails closed, and verifies single-builder parity.
- `phase6PlanningContextPolicy.test.js` covers applicable/not-applicable/
  unknown behavior for every Phase 6 decision, reconciliation, representative
  condo/rental/vacant archetypes, and conflict/staleness preservation.
- `phase6RemediationExitGate.test.js` covers the nine remediation items
  behaviorally where the module boundary allows (vault redaction is invoked
  and asserted against a fixture; the role-floor middleware is invoked with
  VIEWER/CONTRIBUTOR/OWNER and asserted to allow/block) and via source
  verification for route/service wiring that requires the full Express app to
  exercise end-to-end (role floors present on every mutation route; policy
  decisions evaluated in each generation/notification path; share downloads
  recheck context version; neighborhood impacts are strictly link-scoped; and
  relocation reconciliation includes already-linked old-area events).
- Targeted Phase 6/neighborhood regression: 109/109 tests pass; Prisma schema
  validates; backend and workers type-check clean. Frontend Phase 6 changes
  type-check; the repository-wide frontend check remains blocked only by the
  pre-existing missing `@playwright/test` dependency/types in the CTA E2E test.

## Frontend

- Seller Prep, Home Digital Will, Home Timeline, Community Events, and
  Neighborhood Radar render `PropertyContextNotice` with their Phase 6
  envelopes; Moving Plan returns its envelope; Digital Twin renders the notice
  from the new `context` field on `HomeDigitalTwinDTO`.

## Known residual validation item (not an implementation gap)

- The backend test stack does not currently include Supertest or an equivalent
  authenticated Express/Prisma harness. The remediation suite therefore
  invokes the authorization and redaction units behaviorally and verifies
  their route wiring at source level. A deployed-environment API acceptance
  run remains release validation, not unfinished Phase 6 product behavior.

No database migration scripts are included. Schema changes must be applied by
the repository owner (`npx prisma db push`), followed by the workers
`@prisma/client` resync. Because the two link-ownership columns are now
required, any existing null legacy rows must be removed or backfilled before
the schema push if the target database is not reset.
