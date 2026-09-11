# RentCast Property Setup Integration — Implementation Plan

**Version:** 1.4
**Status:** Implemented — RC-0 through RC-10 complete
**Date:** 2026-09-10
**Governing requirements:** [`RENTCAST_PROPERTY_SETUP_INTEGRATION_FRD.md`](./RENTCAST_PROPERTY_SETUP_INTEGRATION_FRD.md)
**Predecessor:** [`PROPERTY_SETUP_SIMPLIFICATION_MINIMAL_CHANGE_FRD.md`](./PROPERTY_SETUP_SIMPLIFICATION_MINIMAL_CHANGE_FRD.md)
**Delivery posture:** Incremental Phase B integration using existing Property Context and BullMQ infrastructure
**Database migration:** Not included; the user will create and apply it

---

## 1. Outcome

Implement one provider-neutral, background enrichment pipeline that runs after every successful Property create, safely maps an exact RentCast property-record match into sparse canonical facts, records public-record evidence, and exposes source/freshness information in Property Details.

The implementation is complete only when provider unavailability cannot block setup, unit ambiguity cannot mutate a Property, homeowner corrections remain authoritative, and all Property creation entry routes share the same backend orchestration.

RC-7 closes the onboarding presentation and deployment gaps discovered during production review: the address CTA commits the minimal Property, the next surface polls first-party enrichment status for a bounded period and prefills matched facts, an immediate goal is optional, confirmation routes directly to an actionable workspace, new empty accounts skip the standalone welcome modal, and the production ARM64 worker image is published to the tag consumed by Kubernetes.

RC-8 closes the false-negative municipality gap found with `Plainsboro Township` versus RentCast's `Plainsboro`: it adds allowlisted civil-designator normalization, bumps the job/match contract to version 2, safely distinguishes provider-empty and address-mismatch outcomes, and boundedly requeues stale version-1 negative decisions at worker startup.

RC-9 closes the post-confirmation root-dashboard request loop found during production review: automatic bootstrap is keyed by stable user/property identifiers, duplicate same-key loads are refused, explicit retries supersede prior work, stale responses cannot commit state, and authentication initialization no longer follows callback identity changes.

RC-10 makes fuller use of the existing property-record request without retaining the raw response. It accepts seven additional durable features through conservative mappings, writes them through the existing canonical/evidence boundary, exposes them as an optional correction section during setup, advances the job contract to version 3, and boundedly re-enriches prior matched records whose version-2 raw responses were intentionally discarded.

## 2. Current Repository Baseline

| Area | Current state | Required change |
| --- | --- | --- |
| Address autocomplete | Google Places returns street/city/state/ZIP; subpremise and Place ID are discarded | Preserve optional unit; keep Places separate from RentCast |
| Pre-create lookup | `/api/properties/lookup` calls a stub `ExternalPropertyDataService` | Remove it from onboarding and retire the stub as the RentCast seam |
| Property create | Shared backend service commits Property and runs auxiliary work | Add one non-fatal post-commit enrichment enqueue |
| Ordinary Add Property | Address-first create; does not call lookup | No route-specific provider call required |
| Evidence | `PropertyFactEvidence` supports `PUBLIC_RECORD`; create assertions use `USER_REPORTED` | Add provider-owned evidence write path |
| Source priority | Property Context already prioritizes homeowner/document/inspection over public record | Preserve and test this rule during canonical merge |
| Provider identity | No durable RentCast identity or current match state | Add provider-neutral model |
| Jobs | BullMQ and a worker process already exist | Add a dedicated event-driven enrichment queue/consumer |
| Deployment | RentCast key is not wired | Add worker-only secret reference |
| UI | Property Details identifies RentCast, but initial setup previously advanced before enrichment was visible | Add a bounded post-commit review with public-record-prefilled facts and direct workflow handoff |
| Worker delivery | Kubernetes consumes `workers:latest-arm64`, but the worker quality workflow only built an ephemeral image | Publish `latest-arm64` and immutable SHA ARM64 tags after a successful production Docker build |

## 3. Target Architecture

```text
Google Places or manual entry
          |
          v
Address CTA -> POST /api/properties
          |
          +-- transaction: Property + homeowner evidence + ACL
          |
          +-- committed Property returned to caller
          |
          `-- best-effort enqueue
                    |
                    v
       property-enrichment-queue
                    |
                    v
          RentCast worker adapter
          - reload Property/address version
          - cache/idempotency check
          - GET /v1/properties
          - validate response
          - exact address/unit match with bounded municipality normalization
          - allowlist map
                    |
                    v
          one database transaction
          - external identity/state
          - canonical sparse update
          - PUBLIC_RECORD evidence
          - old evidence supersession
                    |
                    v
       idempotent downstream recompute
                    |
                    v
       bounded frontend status + Property polling
       -> review/correct accepted facts
       -> direct property-scoped workflow
```

### 3.1 Ownership boundaries

- **Frontend:** captures address/unit and renders source/freshness; never calls RentCast.
- **Backend API:** owns Property create/update contracts, authorization, enqueue, and read-only status projection.
- **Worker:** owns credentials, provider HTTP, runtime validation, match policy, mapping, and transactional enrichment.
- **Database:** owns durable provider identity, cache/freshness state, canonical Property values, and evidence lineage.

## 4. Proposed File Map

Names may be adjusted to existing naming conventions during implementation, but responsibilities shall remain separated.

### Backend

| File | Change |
| --- | --- |
| `apps/backend/prisma/schema.prisma` | Add `Property.unit`, address version, external identity/state model, status enum, and relations |
| `apps/backend/src/utils/validators.ts` | Validate unit and correctable extended property facts |
| `apps/backend/src/services/addressAutocomplete.service.ts` | Resolve Google `subpremise` into unit |
| `apps/backend/src/services/property.service.ts` | Increment address version on identity changes; enqueue after commit without changing success |
| `apps/backend/src/services/JobQueue.service.ts` | Add lazy enrichment queue and deduplicated enqueue method |
| `apps/backend/src/config/workerJobRegistry.ts` | Register event-driven external property enrichment |
| `apps/backend/src/controllers/property.controller.ts` | Add read-only enrichment status handler; retire arbitrary pre-create provider lookup |
| `apps/backend/src/routes/property.routes.ts` | Add property-scoped authorized status route; remove onboarding dependency on `/lookup` |
| `apps/backend/src/services/propertyEnrichmentStatus.service.ts` | Produce safe status DTO with the complete accepted-fact allowlist and no raw provider data |
| `apps/backend/src/modules/propertyContext/catalog/factCatalog.ts` | Register county/FIPS destinations; reuse existing geocoded and exterior lot-size facts |
| `apps/backend/src/modules/propertyContext/infrastructure/prismaAssemblers.ts` | Assemble county/FIPS with their evidence metadata |

### Worker

| File | Change |
| --- | --- |
| `apps/workers/src/propertyEnrichment/contracts.ts` | Versioned job, provider response, normalized result, and outcome contracts |
| `apps/workers/src/propertyEnrichment/rentCastClient.ts` | Fixed-origin authenticated HTTP client, timeout, validation, error classification |
| `apps/workers/src/propertyEnrichment/addressMatcher.ts` | Deterministic street/unit/municipality normalization and exact-match selection |
| `apps/workers/src/propertyEnrichment/requeueStaleContracts.ts` | Bounded recovery replay for prior-contract matches and negative decisions |
| `apps/workers/src/propertyEnrichment/rentCastMapper.ts` | Allowlisted type and fact mapping |
| `apps/workers/src/propertyEnrichment/propertyEnrichment.service.ts` | Cache check, conflict protection, transaction, evidence, and recompute orchestration |
| `apps/workers/src/jobs/propertyEnrichment.job.ts` | Injectable job handler suitable for environment-independent unit tests |
| `apps/workers/src/worker.ts` | Register dedicated queue consumer, concurrency, metrics, failure handlers, and shutdown |
| `apps/workers/src/lib/metrics.ts` | Add bounded enrichment/provider metrics |

### Frontend

| File | Change |
| --- | --- |
| `apps/frontend/src/components/property/AddressAutocomplete.tsx` | Carry optional unit from resolution and manual entry |
| `apps/frontend/src/app/onboarding/address/page.tsx` | Commit the minimal Property from an explicit CTA, which queues backend-owned enrichment; make immediate goal optional |
| `apps/frontend/src/app/onboarding/confirm/page.tsx` | Boundedly poll status/Property, prefill accepted public-record facts, save only homeowner corrections, and route directly to the relevant workspace |
| `apps/frontend/src/app/(dashboard)/dashboard/page.tsx` | Send empty new accounts directly to address setup instead of rendering a standalone welcome modal |
| `apps/frontend/src/app/(dashboard)/dashboard/properties/new/page.tsx` | Capture and submit optional unit |
| `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/edit/page.tsx` | Edit unit and display public-record source/freshness for supported facts |
| `apps/frontend/src/lib/onboarding/propertySetupPayload.ts` | Remove provider last-sale-to-purchase mapping and include unit |
| `apps/frontend/src/lib/api/client.ts` | Type unit and read-only enrichment status; remove onboarding lookup use |

### Deployment and documentation

| File | Change |
| --- | --- |
| `infrastructure/kubernetes/base/secrets.yaml.template` | Add placeholder `RENTCAST_API_KEY` |
| `infrastructure/kubernetes/apps/workers/deployment.yaml` | Inject `RENTCAST_API_KEY` into workers only |
| `.github/workflows/workers-quality-gates.yml` | Publish the ARM64 worker image tags consumed by the Raspberry Pi overlay |
| Environment example files, if present | Document worker-only key and bounded timeout/concurrency options |
| Property setup/product docs | Link Phase A to this Phase B contract and update delivered status |

## 5. Schema Design

### 5.1 Property additions

Proposed fields:

```prisma
unit                   String?
addressIdentityVersion Int      @default(1)
externalIdentities     PropertyExternalIdentity[]
```

`addressIdentityVersion` increments only when street, unit, city, state, or ZIP changes after normalization. It provides an explicit stale-job guard and avoids inferring identity change from `updatedAt`.

### 5.2 Enrichment status

Proposed enum:

```prisma
enum PropertyExternalMatchStatus {
  PENDING
  MATCHED
  NO_MATCH
  AMBIGUOUS
  FAILED
  STALE
  NOT_CONFIGURED
}
```

### 5.3 Provider-neutral identity/state

Proposed model shape:

```prisma
model PropertyExternalIdentity {
  id                  String                      @id @default(uuid())
  propertyId          String
  provider            String
  externalId          String?
  assessorId          String?
  matchStatus         PropertyExternalMatchStatus @default(PENDING)
  matchMethod         String?
  matchedAddress      String?
  matchedUnit         String?
  matchedCity         String?
  matchedState        String?
  matchedZipCode      String?
  addressVersion      Int
  contractVersion     Int
  responseFingerprint String?
  acceptedFactKeys    String[]
  lastAttemptedAt     DateTime?
  lastSucceededAt     DateTime?
  nextRefreshAt       DateTime?
  failureCode         String?
  createdAt           DateTime                    @default(now())
  updatedAt           DateTime                    @updatedAt
  property            Property                    @relation(fields: [propertyId], references: [id], onDelete: Cascade)

  @@unique([propertyId, provider])
  @@unique([provider, externalId])
  @@index([provider, matchStatus, nextRefreshAt])
  @@map("property_external_identities")
}
```

Before implementation, verify Prisma/PostgreSQL behavior for the nullable composite uniqueness constraint. If it does not enforce the intended non-null uniqueness safely, use a database-supported partial unique index documented for the user-created migration or make matched identity a separate child row. Do not weaken external-ID uniqueness silently.

No migration file shall be created by implementation. Run `npm run prisma:generate` from `apps/backend` when dependencies are already available.

## 6. Contract and Algorithm Design

### 6.1 Address normalization

Create one pure normalizer used by matching and idempotency tests:

- trim and collapse whitespace;
- uppercase comparison values;
- normalize punctuation;
- normalize an allowlist of common street suffixes and directionals;
- normalize unit prefixes such as `APT`, `UNIT`, and `#` without dropping the unit value;
- preserve street number suffixes and fractional addresses;
- require exact city, state, and five-digit ZIP after normalization.

Do not add geospatial-nearest fallback in this phase.

### 6.2 Provider client

The client shall:

1. read `RENTCAST_API_KEY` at request time or through injected configuration;
2. construct a fixed `https://api.rentcast.io/v1/properties` URL;
3. set `address=<full structured address>` and `suppressLogging=true`;
4. send `X-Api-Key`;
5. abort after five seconds by default;
6. cap response body processing;
7. validate JSON with a narrow schema; and
8. return a typed outcome rather than throwing raw provider errors.

Suggested typed outcomes:

```ts
type RentCastFetchOutcome =
  | { kind: 'SUCCESS'; records: RentCastPropertyRecord[]; requestCompletedAt: Date }
  | { kind: 'NO_RESULT'; requestCompletedAt: Date }
  | { kind: 'RETRYABLE'; code: 'TIMEOUT' | 'RATE_LIMIT' | 'PROVIDER_500' | 'PROVIDER_504' }
  | { kind: 'TERMINAL'; code: 'INVALID_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_RESPONSE' };
```

### 6.3 Match selection

The pure matcher shall return exactly one of:

```ts
type MatchOutcome =
  | { kind: 'MATCHED'; record: RentCastPropertyRecord }
  | { kind: 'NO_MATCH' }
  | { kind: 'AMBIGUOUS'; candidateCount: number };
```

Only records passing every required street/city/state/ZIP/unit comparison enter the candidate set. One candidate matches; zero does not; more than one is ambiguous.

### 6.4 Mapping

The mapper returns canonical fact keys and values, not a `CreatePropertyInput`. This prevents financing fields and user-evidence semantics from entering the integration accidentally.

```ts
interface MappedPublicRecordFact {
  factKey: string;
  propertyField: string;
  value: string | number;
}
```

The mapper shall implement the FRD allowlist and explicit dwelling mapping. Tests must prove that extra RentCast response properties do not appear in the mapped output.

RentCast exposes a two-digit `stateFips` and a three-digit `countyFips`. The mapper shall concatenate them only when both components are valid, producing the canonical five-digit county FIPS; an inconsistent or malformed component is omitted independently.

### 6.5 Protected-fact merge

For each mapped fact:

1. Load the canonical value/profile value and active evidence in the same transaction.
2. If canonical is null/`UNKNOWN` and no higher-priority evidence exists, accept it.
3. If active evidence is the same RentCast record, update only when the value or freshness changed.
4. If active evidence is `USER_REPORTED`, `DOCUMENT`, or `INSPECTION`, retain canonical value and count it as protected.
5. If canonical is non-null without recognized active evidence, retain it as protected.
6. Supersede only the provider evidence being replaced.
7. Create one new active provider evidence row for each accepted changed fact.

Lot size writes to `PropertyExteriorProfile.lotSizeSqFt`, not the legacy `Property.lotSize` field. County/FIPS use newly registered location fact keys; coordinates use `location.geocoded`. The transaction updates `PropertyExternalIdentity` even when all facts are protected, so successful matching and cache state remain observable.

### 6.6 Address-change race

Before the provider call and again before persistence, compare the job's `addressVersion` to the current Property value. A stale job shall finish as stale/no-op and shall not overwrite the current external identity or facts.

## 7. Work Packages

### Slice RC-0 — Contract guardrails

**Purpose:** Prevent known semantic regressions before provider code exists.

Tasks:

- Add versioned internal job and provider result contracts.
- Remove `lastSalePrice`/`lastSaleDate` from onboarding-to-create mapping.
- Add a regression test proving public sale data cannot write financing fields.
- Add source-priority regression tests covering public record versus homeowner evidence.
- Mark the old pre-create `/lookup` path deprecated in code and API comments.

Exit criteria:

- Buyer/new-home create payloads contain only explicit user purchase inputs.
- Tests fail if a provider response is accepted as `USER_REPORTED` or financing history.

### Slice RC-1 — Address and identity schema

**Purpose:** Make unit-aware, versioned matching possible.

Tasks:

- Add Property unit and address identity version.
- Add enrichment status enum and provider-neutral identity/state model.
- Add relations and indexes.
- Extend create/update validation and typed API contracts.
- Register and assemble `location.county` and `location.countyFips`; reuse `location.geocoded` and `exterior.lotSizeSqFt` rather than inventing evidence keys.
- Increment address version atomically on normalized identity change.
- Preserve Google `subpremise` and manual unit entry across all setup/edit routes.
- Generate Prisma Client; do not create a migration.

Exit criteria:

- Unit survives address selection/manual entry through stored Property.
- Non-address edits do not change the address identity version.
- Old-version jobs can be identified deterministically.

### Slice RC-2 — RentCast client and pure mapping

**Purpose:** Establish a testable external boundary without database writes.

Tasks:

- Implement fixed-origin HTTP client with injected fetch/configuration.
- Add five-second abort, safe error classification, `X-Api-Key`, and `suppressLogging=true`.
- Define narrow runtime schemas for only required response fields.
- Implement pure address/unit normalizer and exact matcher.
- Implement explicit property-type and allowlisted fact mapper.
- Compute a stable response fingerprint from accepted identity and allowlisted facts.

Exit criteria:

- Fixture tests cover all response/error/match/type cases.
- Owner, sale, AVM, rent, listing, and unknown fields are absent from output.
- Logs in tests contain neither request address nor credential.

### Slice RC-3 — Transactional enrichment service

**Purpose:** Safely connect a matched response to canonical Property Context.

Tasks:

- Implement cache/freshness decision logic.
- Implement stale-address guard before and after provider I/O.
- Upsert provider identity/status.
- Merge only unknown or same-provider-owned canonical facts.
- Write and supersede `PUBLIC_RECORD` evidence transactionally.
- Update geocoding source only under the defined location priority.
- Enqueue downstream recomputation once only when canonical facts changed.

Exit criteria:

- Replays are idempotent.
- Higher-priority facts are retained.
- Partial valid mappings commit without malformed fields.
- A persistence failure leaves no partial identity/fact/evidence state.

### Slice RC-4 — Queue and create integration

**Purpose:** Apply enrichment consistently without changing setup success.

Tasks:

- Add `property-enrichment-queue` and a versioned payload with no address/key.
- Add a stable BullMQ job identity for provider, Property, address version, and contract version. The repository's BullMQ 5.65 runtime rejects the originally proposed four-segment colon form; the current version-3 ID is `rentcast-<propertyId>-<addressVersion>-v3`.
- Add at most three attempts with exponential backoff for retryable outcomes.
- Register a worker with default concurrency four, metrics, failure handling, and graceful shutdown.
- Add a post-commit non-fatal enqueue in the shared Property create service.
- Enqueue on committed address identity changes.
- When the worker credential is absent, perform no network request and persist/measure `NOT_CONFIGURED`; the backend remains credential-blind.

Exit criteria:

- Trigger-first and ordinary Add Property each enqueue exactly once through the same backend seam.
- Provider/queue failure never changes a successful create/update outcome.
- Same key deduplicates concurrent enqueue attempts.

### Slice RC-5 — Frontend flow and transparency

**Purpose:** Remove synchronous lookup coupling and make accepted provenance understandable.

Tasks:

- Remove the onboarding address-page call to `lookupProperty`.
- Keep situation-specific user-entered facts for buyer/new-home flows.
- Pass address/unit only for established-owner sparse setup.
- Remove unused frontend lookup response types/helpers after references reach zero.
- Add the authorized read-only enrichment-status client.
- Show “Public record · RentCast” and retrieval date beside active provider-supported facts in Property Details.
- Ensure homeowner edits use the current correction path and refresh relevant queries.

Exit criteria:

- Setup does not wait for or mention provider progress.
- Provider source wording never implies verification.
- Unknown/no-match/failure states remain calm and non-blocking.

### Slice RC-6 — Deployment and operational readiness

**Purpose:** Configure the provider safely and make cost/reliability visible.

Tasks:

- Add `RENTCAST_API_KEY` to the secret template.
- Inject the key into workers only.
- Document optional bounded timeout/concurrency settings if introduced.
- Add metrics for job, request, match, cache, accepted/protected facts, retry, and estimated billable success.
- Add safe alerts for sustained authentication, rate-limit, and provider failures.
- Update the third-party data/privacy disclosure and vendor inventory for address transmission to RentCast.
- Remove the obsolete backend RentCast stub when no references remain.

Exit criteria:

- Static manifest inspection confirms the frontend/backend web container does not receive the key.
- Worker startup is healthy with and without the key.
- No metric label is unbounded or contains Property/address/provider-record identity.

### Slice RC-8 — Municipality match correction and stale-negative recovery

**Purpose:** Correct false negatives caused only by civil-versus-postal locality naming without weakening property identity.

Tasks:

- Normalize only the allowlisted municipality designators at a city-name boundary.
- Keep street, unit, state, ZIP, and exactly-one-candidate checks strict.
- Persist bounded reason codes that distinguish provider-empty responses, address-component mismatch, and multiple exact candidates.
- Expose only those safe reason codes through the authorized status projection and show accurate non-alarming onboarding copy.
- Bump the queue payload/job identity to contract version 2 so version-1 negative caches cannot suppress corrected matching.
- On worker startup, select at most 250 stale version-1 `NO_MATCH`/`AMBIGUOUS` identities and enqueue their current address version. Continue after an individual enqueue failure and rely on contract-version persistence to remove successful rows from later scans.

Exit criteria:

- `Plainsboro Township` and `Plainsboro` match for an otherwise identical property.
- A genuinely different city, unit, street, state, or ZIP still produces no match.
- Existing stale negative decisions are retried without an unbounded scan or public refresh endpoint.
- Status consumers can distinguish “provider returned nothing” from “a returned record failed identity checks” without receiving raw provider or address data.

### Slice RC-9 — Stable post-confirmation dashboard bootstrap

**Purpose:** Ensure the direct onboarding handoff cannot create an unbounded root-dashboard request loop.

Tasks:

- Key dashboard bootstrap work by stable authenticated-user ID and selected Property ID rather than the complete authentication object.
- Admit one automatic bootstrap per stable key and require an explicit retry to repeat the same key.
- Supersede earlier work when the selected Property changes and prevent its late responses from committing UI state.
- Initialize authentication once per provider mount and memoize the context value.
- Preserve server-derived buyer presentation mode; surface a recoverable error when it cannot be resolved.

Exit criteria:

- Rerendering with an equivalent authenticated user does not issue another dashboard request set.
- A selected-Property change issues one new request set and invalidates the old response.
- An explicit retry issues one new request set and invalidates the old response.
- A failed presentation-mode request leaves a retryable error instead of an infinite loading state or homeowner fallthrough.

### Slice RC-10 — Extended property-record facts

**Purpose:** Reuse the existing RentCast request for durable home features that immediately improve setup and downstream guidance.

Tasks:

- Extend the strict provider schema with only the approved `features` members; continue stripping garage, owner, sale, tax, HOA, history, and other unapproved response fields.
- Map heating, cooling, roof, and foundation through explicit same-semantic allowlists; omit unknown and conflicting `/`-separated values.
- Map bounded exterior material text, fireplace presence, and pool/spa presence. Limit pool mapping to detached single-family and manufactured homes, and require a non-shared provider pool type for positive values, so a shared or unclassified amenity is not represented as private property.
- Persist all seven facts through registered canonical destinations with the existing public-record precedence and evidence lifecycle.
- Prefill a secondary, correctable setup section without making any new fact required.
- Advance the queue payload, job name, cache identity, and worker registry to contract version 3.
- At worker startup, re-enrich at most 250 prior-contract matched or negative identities per scan; successful v3 persistence removes a row from later scans.

Exit criteria:

- The supplied 5500 Grand Lake Drive fixture maps Forced Air, Central cooling, Asphalt roof, Slab foundation, Siding exterior, fireplace, and private pool into the expected canonical facts.
- Unsupported or mixed provider enum strings remain unknown rather than being guessed.
- Homeowner/document/inspection evidence continues to protect every extended fact.
- Owner, sale, tax, HOA, history, garage, and raw provider fields remain outside the accepted response boundary.
- Existing matched v2 identities can receive the new facts through a bounded v3 replay.

## 8. Test Plan

### 8.1 Backend and contract tests

- Minimum Property create remains valid with optional unit absent.
- Unit validation trims and bounds input.
- Address identity version changes only for canonical address/unit changes.
- Post-commit enqueue exceptions do not reject Property create/update.
- Enrichment status authorization rejects users without Property access.
- Status DTO excludes external raw data, assessor ID, operational error text, and non-allowlisted failure detail.
- Public last sale never maps to `purchasePriceCents` or `purchaseDate`.

### 8.2 Provider client tests

- Correct endpoint, encoded full address, `suppressLogging=true`, and `X-Api-Key`.
- Missing key produces `NOT_CONFIGURED` without network access.
- Abort timeout classification.
- `400`, `401`, `403`, `404`, `429`, `500`, `504`, invalid JSON, oversized response, and schema mismatch.
- Secret/address redaction in success and failure logs.

### 8.3 Matcher tests

- Case, punctuation, whitespace, suffix, directional, and unit-prefix normalization.
- Leading/trailing allowlisted municipality-designator normalization.
- Exact single-family match.
- Exact condo/apartment unit match.
- Missing, wrong, or conflicting unit rejection.
- Zero qualifying results.
- Multiple qualifying results produce ambiguity rather than first-result selection.
- State, ZIP, city, or street conflict rejection.
- Non-designator city conflicts remain rejected.

### 8.4 Mapper tests

- Every supported RentCast property type.
- `Land` and unknown property types leave dwelling type unchanged.
- Bedroom `0`, bathroom `0`, and fractional bathrooms.
- Range rejection for year, size, lot, coordinates, and county FIPS.
- Field-by-field null handling.
- Conservative feature mappings, contradictory presence flags, mixed `/` values, and attached-property pool exclusion.
- Explicit exclusion of sale, valuation, rent, owner, tax, and listing fields.
- Dollars/cents regression: no provider financial value reaches financing.

### 8.5 Persistence and idempotency tests

- Unknown canonical facts accept valid provider values.
- Homeowner/document/inspection facts are protected.
- Non-null facts with missing evidence are protected.
- Same-provider changed fact supersedes prior evidence once.
- Same payload replay creates no duplicate identity or active evidence.
- No-op refresh does not request downstream recomputation.
- Stale address-version job performs no canonical write.
- Transaction failure rolls back identity, Property, and evidence together.
- Match, no-match, ambiguity, failure, and cache timestamps follow the FRD windows.

### 8.6 Worker and flow tests

- Stable job ID and retry options.
- Retryable errors retry; terminal errors do not.
- Worker concurrency defaults to four.
- Trigger-first creation and ordinary Add Property creation each enqueue once.
- Address update enqueues a new version; unrelated update does not.
- Missing credential and queue outage preserve create success.
- Worker shutdown closes the consumer.
- Prior-contract matches and negative decisions are selected in a bounded batch and enqueued with the current address version and version-3 job identity.

### 8.7 Frontend tests

- Autocomplete and manual unit capture.
- Confirmation retains and submits unit.
- Established-owner onboarding performs no `/api/properties/lookup` request.
- Buyer/new-home explicit user facts remain intact.
- Public-record label and retrieval date render only for provider-supported active evidence.
- Editing a provider-filled fact updates its displayed source after query invalidation.
- Dashboard load coordination rejects duplicate automatic loads for the same user/Property key.
- Property changes and explicit retries supersede stale dashboard loads.

## 9. Validation Sequence

Follow repository policy: no environment, database, Docker, or browser setup is required.

For each slice:

1. Trace the changed requirements and complete affected code paths.
2. Run targeted existing environment-independent unit tests.
3. Run TypeScript checks for changed applications when dependencies are available.
4. Run `npm run prisma:generate` from `apps/backend` after schema changes when dependencies are already present.
5. Run `git diff --check`.
6. Review generated/changed contracts for secret or PII leakage.
7. Run `graphify update .` as the final repository-maintenance step after code changes and corrections.

Do not claim live provider, database, queue, or browser execution unless it was actually performed.

## 10. Implementation Completion Checklist

- [x] FRD requirements have traceable tests or inspection evidence.
- [x] Provider terms and current API contract were rechecked immediately before coding.
- [x] Schema supports unit, address version, external identity, status, freshness, and uniqueness.
- [x] Prisma Client was regenerated; no migration file was committed.
- [x] RentCast client is worker-only, fixed-origin, timed out, runtime-validated, and redacted.
- [x] Exact address/unit matching is deterministic and rejects ambiguity.
- [x] Civil/postal municipality variants normalize through a narrow allowlist while true locality conflicts remain rejected.
- [x] Mapper includes only the approved property-record allowlist.
- [x] Provider facts use unverified `PUBLIC_RECORD` evidence.
- [x] Homeowner/document/inspection facts cannot be overwritten.
- [x] Last sale and AVM cannot enter financing or Property setup payloads.
- [x] Property create/update success is independent of enqueue/provider success.
- [x] Cache, idempotency, retry, and stale-job behavior are covered.
- [x] Contract-version upgrades boundedly replay stale negative decisions and expose only safe diagnostic reasons.
- [x] Both Property creation routes share the backend enqueue boundary.
- [x] Property Details exposes source/freshness and the existing correction path.
- [x] Worker-only secret wiring and bounded metrics are present.
- [x] Relevant documentation is updated.
- [x] Post-confirmation dashboard bootstrap is keyed, deduplicated, and stale-response safe.
- [x] Extended RentCast structure, systems, exterior-material, fireplace, and private-pool facts use the v3 evidence boundary.
- [x] Lightweight validation and final Graphify update are complete.

## 11. Recommended Delivery Order

Implement in this order:

1. **RC-0** to close the financing/provenance hazards before external I/O.
2. **RC-1** to establish durable address and provider identity.
3. **RC-2** to complete the isolated, fixture-tested RentCast boundary.
4. **RC-3** to add transactional protected-fact persistence.
5. **RC-4** to connect the safe service to every create/update route.
6. **RC-5** to remove pre-create lookup coupling and add transparency.
7. **RC-6** to finish worker deployment, cost visibility, and operational evidence.
8. **RC-7** to streamline onboarding review and direct workflow handoff.
9. **RC-8** to correct municipality variants and recover stale negative contracts.
10. **RC-9** to stabilize the root-dashboard bootstrap reached by direct onboarding handoff.
11. **RC-10** to accept and review the additional durable property-record features under contract v3.

Each slice must be independently reviewable and must leave Property creation functional when RentCast is absent.
