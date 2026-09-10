# RentCast Property Setup Integration — Functional Requirements Document

**Version:** 1.2
**Status:** Implemented
**Date:** 2026-09-09
**Product area:** Property setup, Property Details, and Property Context
**Delivery scope:** Phase B — post-create public-record enrichment
**Implementation plan:** [`RENTCAST_PROPERTY_SETUP_INTEGRATION_IMPLEMENTATION_PLAN.md`](./RENTCAST_PROPERTY_SETUP_INTEGRATION_IMPLEMENTATION_PLAN.md)
**Predecessor:** [`PROPERTY_SETUP_SIMPLIFICATION_MINIMAL_CHANGE_FRD.md`](./PROPERTY_SETUP_SIMPLIFICATION_MINIMAL_CHANGE_FRD.md)
**Current-state audit:** [`PROPERTY_SETUP_CURRENT_STATE_AUDIT.md`](../audits/PROPERTY_SETUP_CURRENT_STATE_AUDIT.md)

---

## 1. Executive Summary

ContractToCozy shall use RentCast property records to enrich a newly created Property with a small, source-qualified set of public-record facts. Enrichment shall happen after the core Property has committed, shall never block setup or first value, and shall never turn provider data into a homeowner assertion.

This phase keeps Google Places as the address-entry and normalization provider. RentCast is not an autocomplete provider and is not part of the Property creation transaction. A durable, idempotent background job shall query RentCast using the complete structured address, reject ambiguous property or unit matches, and write only allowlisted facts with `PUBLIC_RECORD` evidence.

The integration shall preserve the progressive setup contract established in Phase A:

1. A homeowner can create a Property from the minimum normalized address tuple.
2. Provider availability, latency, quota, or match quality cannot change that create outcome.
3. A homeowner answer always outranks a public record.
4. Unknown remains unknown when RentCast has no reliable value.
5. Public-record facts are visibly labeled and correctable in Property Details.
6. RentCast last-sale, valuation, owner, and mailing-address data are not imported in this release.

Version 1.1 streamlines the visible setup journey without changing the provider boundary. The address action now commits the minimal Property (the event that queues enrichment), the confirmation surface performs a bounded read of first-party enrichment status and Property data, and matched facts are shown for correction before the user enters the relevant workspace. The browser still never calls RentCast directly and setup never waits indefinitely for it.

Version 1.2 corrects a production-discovered locality representation gap. Civil municipality labels such as `Plainsboro Township` and postal locality labels such as `Plainsboro` may identify the same municipality. The exact matcher now removes only an allowlisted leading or trailing civil designator while preserving strict street, unit, state, ZIP, and single-candidate requirements. Version-1 negative decisions are replayed in a bounded worker startup scan, and the safe status contract distinguishes an empty provider response from a returned record that failed identity checks.

Version 1.3 hardens the post-confirmation dashboard handoff after production revealed that a changing authentication-object identity could repeatedly restart the root dashboard bootstrap. The dashboard now keys automatic loading by stable user and selected-property IDs, permits only one automatic bootstrap per key, suppresses state from superseded requests, and reserves another same-key request for an explicit retry. Buyer presentation-mode resolution remains server-derived and failures remain recoverable rather than falling through to homeowner mode.

## 2. Problem Statement

The current repository contains an `ExternalPropertyDataService` seam and an authenticated `/api/properties/lookup` route, but the RentCast adapter is a stub. Completing only that stub would be unsafe and incomplete:

- established-owner onboarding intentionally discards pre-create lookup facts;
- buyer and new-home payload construction can map provider `lastSalePrice` and `lastSaleDate` into the homeowner's financing profile;
- Property creation labels asserted fields as verified `USER_REPORTED` evidence;
- the stored address has no separate unit/subpremise field or durable provider match identity;
- the ordinary Add Property route does not call the lookup endpoint;
- provider credentials are not wired into worker deployment configuration; and
- the current minimal-change FRD explicitly excludes external enrichment.

The product needs a provider-neutral enrichment boundary rather than a synchronous lookup added to one frontend route.

## 3. Product Outcomes

### 3.1 Goals

- Improve sparse Property profiles without increasing setup questions.
- Apply enrichment consistently to every successful Property creation route.
- Preserve exact property and unit identity before accepting provider facts.
- Store provider identity, match status, freshness, and source evidence durably.
- Allow homeowner corrections without a later refresh reverting them.
- Keep provider failures and quota exhaustion outside the Property create success boundary.
- Bound paid API usage through idempotency, caching, and explicit retry rules.
- Give downstream Property Context consumers truthful provenance and freshness.

### 3.2 Success measures

The release is successful when:

- 100% of successful Property creates attempt to enqueue at most one current-version RentCast enrichment job.
- 100% of Property creates return their committed result independently of enqueue or provider failure.
- No imported RentCast fact is labeled `USER_REPORTED`, homeowner-verified, or inspection-derived.
- No imported last-sale value is written to `PropertyFinancingProfile`.
- No ambiguous or unit-mismatched result changes canonical Property facts.
- Reprocessing the same Property, provider, address version, and payload produces no duplicate identity or active evidence rows.
- A homeowner correction is not overwritten by a later RentCast refresh.
- Logs and metrics contain no API key, full address, owner name, or raw provider response.
- The ordinary Add Property and trigger-first routes exhibit the same enrichment behavior because orchestration is backend-owned.

Quantitative enrichment-match targets shall be established after baseline metrics exist. A low match rate must not be improved by relaxing exact-match requirements.

## 4. Scope

### 4.1 In scope

- Existing-owner, buyer, new-home, and ordinary Add Property creation routes.
- Optional unit/subpremise capture and storage.
- A provider-neutral Property external-identity/enrichment-state model.
- An event-driven, idempotent RentCast property-record job.
- RentCast authentication, timeout, response validation, matching, mapping, and error classification.
- Allowlisted core and location facts.
- `PUBLIC_RECORD` Property Fact Evidence with provider lineage and freshness.
- Source/freshness presentation in Property Details.
- A read-only property-scoped enrichment-status API.
- Kubernetes secret and worker environment wiring.
- Metrics, structured redacted logs, usage counters, and focused automated tests.
- Removal of RentCast from the pre-create onboarding lookup path.
- A bounded, non-blocking enrichment review immediately after the address-backed Property commits.
- Optional trigger selection for users who only want to establish their home record.
- Direct navigation from confirmation into the selected property workflow, without a duplicate first-action interstitial.

### 4.2 Out of scope

- RentCast AVM/value estimates, estimate ranges, or comparable sales.
- Owner names, ownership records, or owner mailing addresses.
- Mapping public last sale into purchase price or purchase date.
- Rent estimates, listings, market statistics, or neighborhood data.
- Automatic creation of financial, insurance, tax, maintenance, risk, or valuation decisions directly from a provider response.
- Provider-driven replacement of homeowner-, document-, or inspection-supported facts.
- Fuzzy address selection, parcel guessing, or cross-unit fallback.
- A blocking lookup step, setup spinner that waits for RentCast, or new required profile questions.
- A manual homeowner refresh control that can create unbounded paid requests.
- A new general-purpose job platform; the existing BullMQ/worker infrastructure shall be reused.
- Database migration scripts or a general-purpose existing-user enrichment backfill. The user will create and apply migrations. A bounded replay of stale negative decisions after a match-contract correction is part of operational recovery.
- Additional external property-data providers. The data model and service contract shall remain provider-neutral.

## 5. Product Decisions

### PD-1 — Enrichment begins after Property commit

The core `Property` transaction is the success boundary. The backend shall enqueue enrichment only after the Property is committed. Enqueue failure shall be logged and observable but shall not change a successful create response.

### PD-2 — Google Places and RentCast have separate responsibilities

Google Places remains responsible for address suggestions and structured address resolution. RentCast receives a completed address to find a public property record. RentCast shall not replace manual entry or Google Places autocomplete.

### PD-3 — The backend owns orchestration

Frontend routes shall not decide whether to call RentCast. Every Property creation entry point shall receive the same behavior through the shared backend create service.

### PD-4 — Exact identity precedes enrichment

Canonical facts may be updated only after one RentCast result matches the normalized street, municipality, state, ZIP, and unit rules. Municipality normalization may remove only an allowlisted civil designator at the name boundary (for example, `Township of Plainsboro` or `Plainsboro Township` to `Plainsboro`). Zero results, multiple plausible results, missing required unit identity, or conflicting location components produce no enrichment.

### PD-5 — Public record is evidence, not confirmation

RentCast facts shall use `PropertyFactSourceType.PUBLIC_RECORD`, `sourceEntityType = RENTCAST_PROPERTY_RECORD`, the RentCast property ID as `sourceEntityId`, `verifiedAt = null`, and a bounded freshness date. The integration shall not manufacture a numeric fact-confidence value when the provider does not supply one.

### PD-6 — Homeowner evidence wins

Provider facts may fill an unknown canonical value or refresh a value whose active evidence belongs to the same provider. They shall not overwrite an active homeowner, document, or inspection assertion. A non-null value with missing or unrecognized evidence shall be treated as protected.

### PD-7 — No raw provider payload retention

The system shall persist the normalized external identity, accepted facts, a response fingerprint, match outcome, and operational metadata. It shall not persist the full RentCast response.

### PD-8 — Credential presence is configuration, not a product gate

No feature flag or rollout cohort is required. The backend shall enqueue without possessing the provider credential. When `RENTCAST_API_KEY` is absent, the worker shall make no network request, record `NOT_CONFIGURED` plus a bounded configuration metric, and preserve normal Property setup. Separate environment keys shall be used where environments exist.

## 6. User Journeys

### 6.1 Create and review a Property

1. The homeowner selects or manually enters a complete address, including unit when applicable.
2. The homeowner may select an immediate goal; no goal is required for basic setup.
3. The address CTA clearly states that it adds the home and initiates a secure public-record lookup.
4. ContractToCozy commits the minimal Property and returns success.
5. The backend attempts to enqueue a RentCast enrichment job after commit.
6. The review surface polls only the first-party status and Property endpoints for a bounded period (approximately five seconds). It never calls RentCast and remains actionable throughout.
7. Matched home type, year built, square footage, bedrooms, and bathrooms are prefilled and labeled as public-record suggestions. Ambiguous, missing, failed, and unconfigured outcomes remain unknown and are explained without guessing.
8. The homeowner confirms or corrects the available facts and proceeds directly to the buyer plan, selected trigger workflow, or Property dashboard.
9. If the destination is the root Property dashboard, its bootstrap shall run automatically at most once for the stable authenticated-user and selected-property pair. A property change or explicit retry may start a new bootstrap; a React context identity change alone shall not.
10. A superseded dashboard bootstrap shall not commit loading, presentation-mode, property, or error state after a newer user/property bootstrap starts.

### 6.1.1 Immediate value rules

- When year built is available, setup may show the approximate age of the home and explain that age-relevant systems and maintenance will be prioritized.
- When year built is unavailable but square footage is available, setup may explain that size can now inform project scope and maintenance planning.
- These statements are bounded uses of accepted canonical facts, not new provider-derived risk, valuation, tax, insurance, or maintenance decisions.
- A repair selection should invite optional symptom, affected-system, and immediate-safety detail, then route directly to the repair workflow after confirmation.
- The existing `NONE_EXPLORING` trigger value is retained as the storage/API compatibility value for “Set up my home” on any non-buyer entry path. Its name is legacy taxonomy, not a restriction to the Exploring journey.

### 6.2 Successful enrichment

1. The worker retrieves the Property and current enrichment state.
2. The worker builds a full US address and requests RentCast property records.
3. One exact property/unit result is accepted.
4. Provider identity and allowlisted facts are written transactionally.
5. Property Details shows that selected fields came from a RentCast public record and when they were retrieved.
6. Relevant downstream calculations are requested once after canonical changes commit.

### 6.3 No match or ambiguous match

1. The worker records `NO_MATCH` or `AMBIGUOUS` without changing Property facts.
2. Setup remains successful.
3. Property Details continues to show unknown fields normally and permits manual completion.
4. The negative result is cached until its retry date or until the address changes.

### 6.4 Homeowner correction

1. The homeowner edits a provider-filled fact in Property Details.
2. The canonical value is updated using existing authorization and validation.
3. The public-record evidence is superseded and new `USER_REPORTED` evidence becomes authoritative.
4. Future RentCast refreshes retain the homeowner value and may record that the provider disagrees, but shall not restore the provider value.

## 7. Functional Requirements

### 7.1 Address capture and identity

**FR-ADDR-01**
All Property create and edit contracts shall support an optional unit/subpremise field distinct from street address.

**FR-ADDR-02**
Google Places resolution shall preserve `subpremise` when provided. Manual entry shall allow the same optional field.

**FR-ADDR-03**
The RentCast request address shall be assembled server-side from trimmed street, optional unit, city, uppercase state, and five-digit ZIP. The frontend shall not send a provider query.

**FR-ADDR-04**
An address change shall increment or replace the address identity version, mark prior RentCast linkage stale, and enqueue a new-version enrichment attempt after the address update commits.

**FR-ADDR-05**
Changing non-address Property facts shall not enqueue a RentCast request.

### 7.2 Job orchestration and idempotency

**FR-JOB-01**
Each successful Property create shall attempt one background job keyed by provider, Property ID, address version, and enrichment contract version.

**FR-JOB-02**
Duplicate enqueue attempts with the same key shall coalesce into one logical job.

**FR-JOB-03**
An enqueue exception or unavailable Redis connection shall not cause Property creation or address update to report failure after commit.

**FR-JOB-04**
A completed exact match shall not be queried again before `nextRefreshAt` unless the stored address identity changes.

**FR-JOB-05**
The initial policy shall use these refresh windows:

- exact match: 90 days;
- no match or ambiguous match: 7 days;
- exhausted transient failure: 24 hours; and
- address change: immediately eligible regardless of the prior window.

**FR-JOB-06**
The worker shall support at most three attempts. Network timeout, HTTP `429`, `500`, and `504` are retryable. HTTP `400`, `401`, `403`, and terminal no-result outcomes are not retryable within the same job.

**FR-JOB-07**
Provider concurrency shall default to four requests and remain below RentCast's documented account limit. The HTTP timeout shall default to five seconds. Both values may be changed through bounded configuration.

### 7.3 Provider request and response handling

**FR-API-01**
The adapter shall call `GET https://api.rentcast.io/v1/properties` using the full `address` query and `suppressLogging=true`.

**FR-API-02**
The API key shall be sent only from the worker using the `X-Api-Key` header. It shall never be serialized into frontend code, a job payload, a database row, a log, or an analytics event.

**FR-API-03**
Every response shall be runtime-validated before matching or persistence. Unknown response fields shall be ignored.

**FR-API-04**
The adapter shall distinguish success, no match, ambiguous match, invalid request, authentication/configuration failure, rate limit, timeout, and provider failure.

**FR-API-05**
Logs shall use Property ID, provider, job ID, HTTP classification, duration, result count, and final outcome. Logs shall not include a full address, raw query string, response body, owner fields, or credential.

### 7.4 Match policy

**FR-MATCH-01**
Matching shall compare normalized street number/name, municipality, state, ZIP, and unit. Punctuation, case, common street suffix abbreviations, whitespace, and an allowlisted leading or trailing civil municipality designator (`Township`, `Twp`, `Borough`, `Boro`, `City`, or `Village`) may be normalized. No other semantic component may be discarded, and fuzzy or substring city matching is prohibited.

**FR-MATCH-02**
A unit-bearing Property requires the same normalized unit in the accepted RentCast record.

**FR-MATCH-03**
A unitless Property shall not accept a unit-specific record when multiple units or unit results are present.

**FR-MATCH-04**
Exactly one qualifying result is required. The integration shall not select the first response item when multiple plausible matches remain.

**FR-MATCH-05**
Coordinates, assessor ID, owner name, sale data, or a nearby ZIP shall not compensate for a street or unit mismatch.

**FR-MATCH-06**
The stored match outcome shall be one of `PENDING`, `MATCHED`, `NO_MATCH`, `AMBIGUOUS`, `FAILED`, `STALE`, or `NOT_CONFIGURED`.

### 7.5 Allowlisted fact mapping

**FR-MAP-01**
Only these RentCast property-record fields may update canonical Property data in this phase:

| RentCast field | Canonical destination | Rule |
| --- | --- | --- |
| `propertyType` | `dwellingType` | Map only recognized values per FR-MAP-02 |
| `yearBuilt` | `yearBuilt` | Integer `1700..current year + 1` |
| `squareFootage` | `propertySize` | Positive integer |
| `bedrooms` | `bedrooms` | Integer `>= 0`; zero is valid for a studio |
| `bathrooms` | `bathrooms` | Number `>= 0` |
| `lotSize` | `PropertyExteriorProfile.lotSizeSqFt` | Positive number; apply existing attached-home applicability rules |
| `county` | `county` | Non-empty normalized text |
| `countyFips` | `countyFips` | Valid five-digit county FIPS |
| `latitude` | `latitude` | Valid latitude; accepted only with valid longitude |
| `longitude` | `longitude` | Valid longitude; accepted only with valid latitude |

**FR-MAP-02**
Property type mapping shall be explicit:

| RentCast value | ContractToCozy value |
| --- | --- |
| `Single Family` | `DETACHED_SINGLE_FAMILY` |
| `Townhouse` | `TOWNHOUSE` |
| `Condo` | `CONDO_UNIT` |
| `Apartment` | `APARTMENT_UNIT` |
| `Multi-Family` | `MULTI_FAMILY` |
| `Manufactured` | `MANUFACTURED_HOME` |
| `Land`, missing, or unknown value | no canonical update / `UNKNOWN` remains |

The adapter shall not infer `ATTACHED_SINGLE_FAMILY`, `DUPLEX`, or another classification not directly represented by the provider value.

**FR-MAP-03**
Missing, malformed, out-of-range, or unsupported values shall be omitted individually without failing an otherwise valid match.

**FR-MAP-04**
`lastSalePrice`, `lastSaleDate`, estimated value, rent, owner, listing, and tax fields shall not be returned through the setup contract or written to Property, financing, or evidence records in this phase.

**FR-MAP-05**
Accepted coordinates may replace an existing ZIP-centroid geocode but shall not replace more authoritative exact-address coordinates without an explicit source-priority rule. The geocoding provider and timestamp shall identify RentCast when RentCast coordinates become canonical.

### 7.6 Canonical write and evidence semantics

**FR-WRITE-01**
External identity, enrichment status, canonical updates, evidence supersession, and new evidence shall commit in one database transaction.

**FR-WRITE-02**
A provider value may fill a null/`UNKNOWN` canonical fact when there is no active higher-priority evidence.

**FR-WRITE-03**
A provider refresh may update a canonical fact only when the active evidence for that fact is the same RentCast external record or the canonical fact is still unknown.

**FR-WRITE-04**
Active `USER_REPORTED`, `DOCUMENT`, or `INSPECTION` evidence shall prevent provider overwrite. A canonical value with no active recognizable evidence shall also prevent provider overwrite.

**FR-WRITE-05**
Each accepted fact shall create active evidence with:

- `sourceType = PUBLIC_RECORD`;
- `sourceEntityType = RENTCAST_PROPERTY_RECORD`;
- `sourceEntityId = <RentCast property id>`;
- `observationState = KNOWN`;
- `observedAt = <retrieval completion timestamp>`;
- `validUntil = <nextRefreshAt>`;
- `verifiedAt = null`; and
- `confidence = null` unless RentCast later supplies an applicable field-level confidence contract.

**FR-WRITE-06**
A refresh that changes an eligible provider-owned fact shall supersede the prior provider evidence and create one new active evidence row. Unchanged accepted facts shall not accumulate duplicate active evidence.

**FR-WRITE-07**
After canonical facts change, downstream Property Context and intelligence recomputation shall be requested once using existing idempotent mechanisms. No recomputation shall be requested for a no-op refresh.

**FR-WRITE-08**
Every mapped destination shall use a registered Property Context fact key. This phase shall add `location.county` and `location.countyFips` to the location catalog/assembler and shall use existing `location.geocoded` and `exterior.lotSizeSqFt` keys for coordinates and lot size. Provider code shall not create uncataloged evidence keys.

### 7.7 User experience and API

**FR-UX-01**
Property setup shall not display a RentCast progress step or wait for enrichment before navigating.

**FR-UX-02**
Property Details shall label active provider-supported facts as “Public record · RentCast” and show the retrieval date. The label shall not say “verified by RentCast.”

**FR-UX-03**
The existing edit control shall be the correction path. A homeowner correction shall display as homeowner-provided after save.

**FR-UX-04**
No match, ambiguity, failure, or missing configuration shall produce an alarming homeowner notification. Unknown fields remain ordinary opportunities to add details.

**FR-UX-05**
An authorized property member may read a compact enrichment status containing provider, status, a bounded reason, last attempted date, last successful date, next refresh date, and accepted fact keys. Allowed negative reasons are `NO_PROVIDER_RESULTS`, `ADDRESS_COMPONENT_MISMATCH`, and `MULTIPLE_EXACT_MATCHES`. The response shall not expose raw provider data, address components, owner information, operational error text, or credentials.

**FR-UX-06**
No public endpoint shall accept an arbitrary address for paid RentCast lookup. Any enrichment-status endpoint shall be property-scoped and use existing Property authorization.

## 8. Data Requirements

### 8.1 Property changes

The target schema shall add:

- `unit String?` to `Property`;
- an address identity version, defaulting to `1`; and
- a relation to provider-neutral external enrichment records.

### 8.2 Provider-neutral enrichment record

The implementation shall add one provider-neutral model, provisionally named `PropertyExternalIdentity`, with at least:

| Field | Purpose |
| --- | --- |
| `id` | Internal immutable identifier |
| `propertyId` | Owning Property |
| `provider` | Provider key, initially `RENTCAST` |
| `externalId` | Provider property ID when matched |
| `assessorId` | Optional provider assessor identifier |
| `matchStatus` | Current normalized outcome |
| `matchMethod` | Initially `EXACT_NORMALIZED_ADDRESS` |
| `matchedAddress`, `matchedUnit`, `matchedCity`, `matchedState`, `matchedZipCode` | Auditable accepted identity components |
| `addressVersion` | Property address identity used for the request |
| `contractVersion` | Adapter/mapping contract version |
| `responseFingerprint` | Hash used for idempotency; not a raw response |
| `acceptedFactKeys` | Facts written or retained from the result |
| `lastAttemptedAt`, `lastSucceededAt`, `nextRefreshAt` | Freshness and cache state |
| `failureCode` | Bounded classification without provider body or address |
| timestamps | Audit lifecycle |

Required constraints:

- unique `(propertyId, provider)`;
- unique `(provider, externalId)` when `externalId` is present;
- index `(provider, matchStatus, nextRefreshAt)`; and
- cascade deletion with Property.

No migration script is part of this work. Prisma Client generation is required after the schema is changed.

## 9. Security and Privacy Requirements

- Existing authentication and property authorization remain mandatory.
- The RentCast key shall exist only in the worker secret environment.
- `suppressLogging=true` shall be included in every provider request.
- The product's third-party data/privacy disclosure and vendor inventory shall identify that a residential address is sent to RentCast for public-record enrichment before this integration serves users.
- Full residential addresses are sensitive operational data and shall not appear in provider-call logs or metrics labels.
- Raw provider responses and owner records shall not be stored.
- Provider response parsing shall use a strict runtime schema and bounded response size.
- URLs shall use a fixed HTTPS origin; no caller-controlled host or path is allowed.
- Error messages returned to a homeowner shall not disclose provider account, quota, or credential details.
- Manual or admin reprocessing, if added later, must be property-scoped, capability-gated, audited, and independently rate-limited. It is not part of this MVP.

## 10. Reliability, Cost, and Observability

Required counters and histograms shall include:

- jobs enqueued, deduplicated, completed, failed, and skipped-not-configured;
- provider requests by safe outcome classification;
- response duration;
- result-count bands: zero, one, multiple;
- match outcomes;
- accepted fact count and protected-fact count;
- cache hit/suppression count;
- retry count; and
- estimated billable successful request count.

Metrics labels shall be bounded and shall not include Property ID, address, provider property ID, or error message.

Operational alerts shall cover sustained authentication/authorization failure, abnormal rate limiting, and a material sustained provider-failure rate. A provider outage shall not page as a Property creation outage.

## 11. API Contract Summary

### 11.1 Internal job payload

```ts
interface PropertyEnrichmentJobPayload {
  propertyId: string;
  provider: 'RENTCAST';
  addressVersion: number;
  contractVersion: 2;
}
```

The payload deliberately excludes address and credentials. The worker reloads the authorized canonical Property state.

### 11.2 Read-only status

```http
GET /api/properties/:id/enrichment
```

```json
{
  "success": true,
  "data": {
    "provider": "RENTCAST",
    "status": "MATCHED",
    "lastAttemptedAt": "2026-09-09T12:00:00.000Z",
    "lastSucceededAt": "2026-09-09T12:00:00.000Z",
    "nextRefreshAt": "2026-12-08T12:00:00.000Z",
    "acceptedFactKeys": ["core.yearBuilt", "core.propertySizeSqFt"],
    "reason": null
  }
}
```

The API shall return an empty/not-started representation when no state exists; it shall not trigger a lookup.

## 12. Acceptance Criteria

### Property setup

- Creating a Property succeeds and navigates when RentCast is slow, unavailable, unconfigured, or returns no result.
- Every create entry route reaches one shared enqueue boundary.
- Unit entry survives autocomplete/manual capture, confirmation, creation, and editing.
- The onboarding frontend no longer performs a paid pre-create RentCast lookup.

### Matching and mapping

- A single exact address/unit result imports only allowlisted valid values.
- Postal/civil locality variants that differ only by an allowlisted municipality designator match without weakening other identity checks.
- Zero results, multiple plausible results, unit mismatch, and location conflict write no canonical facts.
- A contract-version upgrade boundedly requeues stale negative decisions and bypasses their old cache entry.
- Bedroom value `0` is retained.
- Unknown property types and `Land` leave dwelling type unknown.
- Last sale, AVM, rent, owner, and listing values never enter canonical or financing records.

### Provenance and correction

- Every imported fact has active `PUBLIC_RECORD` evidence linked to the RentCast property ID and no `verifiedAt` value.
- A homeowner edit supersedes provider evidence and is not overwritten on refresh.
- Same-payload replay produces no duplicate active evidence.
- A changed provider-owned value supersedes the old provider evidence exactly once.

### Operations and privacy

- Provider calls use `X-Api-Key`, a fixed HTTPS origin, a five-second timeout, and `suppressLogging=true`.
- Retry/non-retry behavior matches FR-JOB-06.
- Job concurrency and deduplication bound API usage.
- Logs, metrics, job payloads, and database rows contain no API key or raw response.
- Worker deployment receives the secret; frontend and backend web deployment do not require the RentCast key.

## 13. Dependencies and Assumptions

- RentCast Property Records remains available through `GET /v1/properties` and supports full-address search.
- RentCast continues to authenticate server-side requests with `X-Api-Key`.
- The existing Redis/BullMQ worker infrastructure is available in deployed environments.
- The existing Property Context evidence priority remains homeowner/inspection/document above public record.
- The user will create and run the database migration after Prisma schema changes.
- Property-record coverage and sale-data availability vary by jurisdiction; absence is an expected product state, not an exception.

## 14. Provider References

- [RentCast Property Records API](https://developers.rentcast.io/reference/property-records)
- [RentCast property search guidance](https://developers.rentcast.io/reference/search-queries)
- [RentCast property data schema](https://developers.rentcast.io/reference/property-data-schema)
- [RentCast property types](https://developers.rentcast.io/reference/property-types)
- [RentCast security guidance](https://developers.rentcast.io/reference/security)
- [RentCast response codes](https://developers.rentcast.io/reference/response-codes)
- [RentCast rate limits](https://developers.rentcast.io/reference/rate-limits)
- [RentCast property-data coverage](https://developers.rentcast.io/reference/property-data)
- [RentCast pricing](https://www.rentcast.io/api)

These external contracts and prices must be rechecked immediately before implementation because provider behavior and commercial terms can change.
