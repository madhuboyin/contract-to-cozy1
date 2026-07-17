# Property Context Phase 6 Completion Audit

Date: 2026-07-17

Scope: Seller Prep, Home Buyer workflows, Moving Plan, Neighborhood Change
Radar, Community/Local Updates, Home Digital Will, Home Digital Twin, Home
Timeline, Reports, and Document/Vault sharing (FRD §21.8).

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
| Redacted sharing projections | Share-token report downloads serve only a separately rendered redacted PDF built from `buildRedactedReportSnapshot`; the unauthenticated route fails closed (409) when no redacted artifact exists. Forbidden everywhere in shares: address, zip, coordinates, policy/serial/model numbers, costs, premiums, coverage amounts, document links, record IDs, nickname. |
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
- Home Buyer checklist remains user-scoped; its server-side segment check is
  the same product-segment rule the policy's `homeBuyerWorkflow` encodes for
  property-scoped surfaces.
- Home Timeline serves canonical `HomeEvent` records directly; the
  `timelineComposition` decision exists for aggregators.
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

## Workers

- `generateHomeReportExport.job` uses the shared builder and
  `checkReportWorkerContext` (blocks generation when the owner cannot be
  resolved or reports are NOT_APPLICABLE); stamps `contextVersion`.
- `neighborhoodChangeNotification.job` rechecks geocoded/location relevance
  before every send.
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
  unknown behavior for every Phase 6 decision, plus reconciliation.
- Full regression: 153/153 property-context tests pass; backend, workers, and
  frontend type-check clean.

## Frontend

- Seller Prep page and Home Digital Will client render `PropertyContextNotice`
  with the Phase 6 envelopes; Moving Plan API returns the envelope for its
  client; twin serializes `contextVersion` for staleness display.

No database migration scripts are included. Schema changes must be applied by
the repository owner (`npx prisma db push`), followed by the workers
`@prisma/client` resync.
