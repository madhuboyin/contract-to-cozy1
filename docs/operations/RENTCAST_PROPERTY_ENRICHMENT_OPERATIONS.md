# RentCast Property Enrichment Operations

## Data and credential boundary

Only the workers deployment receives `RENTCAST_API_KEY`. The frontend and backend
web deployments must not reference it. The secret reference is optional: without
the key, the worker makes no provider request, records `NOT_CONFIGURED`, and leaves
Property creation and address updates successful.

RentCast requests contain the complete residential address, including unit when
present, and always use `suppressLogging=true`. Application logs and metric labels
must not contain the address, API key, Property ID, RentCast record ID, owner data,
or raw response.

`RENTCAST_WORKER_CONCURRENCY` defaults to `4`. Only integer values from `1` through
`10` are accepted; invalid values fall back to `4`. HTTP requests use the code-owned
five-second timeout.

## Match and mapping contract recovery

The version-2 match correction treats only an allowlisted civil municipality designator
as representational. For example, `Plainsboro Township`, `Township of Plainsboro`,
and `Plainsboro` normalize to the same municipality. Street, unit, state, ZIP, and
the exactly-one-candidate rule remain strict; fuzzy locality matching is not used.

Current contract version 3 keeps those identity rules and expands the accepted
property-record facts to heating, cooling, roof, foundation, bounded exterior
material, fireplace presence, and private-property pool/spa presence. Enum values
use explicit mappings. Unsupported values, contradictory presence flags, and mixed
`/`-separated values remain unknown. Positive pool values require a non-shared
pool type and are omitted for attached/shared dwellings because the record may
describe a community amenity.

Negative outcomes retain a bounded reason code:

- `NO_PROVIDER_RESULTS`: RentCast returned no property record.
- `ADDRESS_COMPONENT_MISMATCH`: one or more records were returned, but none passed
  the complete normalized identity check.
- `MULTIPLE_EXACT_MATCHES`: more than one record passed, so no record was selected.

On each worker-process startup, one scan selects at most 250 prior-contract RentCast
identities in `MATCHED`, `NO_MATCH`, or `AMBIGUOUS` state. It enqueues the Property's
current address version under the version-3 job ID. Replaying prior matches is
required because raw version-2 provider responses were deliberately not retained.
Individual enqueue failures do not stop the remainder of the batch; successful
processing stores contract version 3, naturally removing that row from later startup
scans. This remains a bounded contract repair, not a public/manual refresh mechanism
or an unbounded historical enrichment backfill.

## Worker image delivery

The Raspberry Pi overlay deploys `ghcr.io/madhuboyin/contract-to-cozy/workers:latest-arm64`. On a push to `main`, `.github/workflows/workers-quality-gates.yml` builds the production worker Dockerfile and publishes both `latest-arm64` and an immutable `${GITHUB_SHA}-arm64` tag. A successful local/CI Docker build alone does not update the cluster image.

If setup remains `PENDING` or records `NOT_CONFIGURED`, verify all three boundaries independently: the workflow published a current ARM64 image, the workers Deployment pulled that tag, and `production/app-secrets` contains `RENTCAST_API_KEY`. The backend Deployment should not receive that key.

## Bounded metrics

- `property_enrichment_enqueues_total{outcome}`: enqueue, deduplication, and failure.
- `property_enrichment_jobs_total{outcome}`: terminal job result.
- `property_enrichment_retries_total{error_class}`: retry classifications.
- `property_enrichment_match_outcomes_total{outcome}`: persisted match state.
- `property_enrichment_cache_suppressions_total{match_status}`: provider calls avoided.
- `property_enrichment_facts_total{disposition}`: accepted and protected facts.
- `rentcast_requests_total{classification}` and `rentcast_request_duration_seconds{classification}`:
  safe provider transport/HTTP outcomes and duration.
- `rentcast_result_count_total{band}`: bounded zero/one/multiple result bands.
- `rentcast_estimated_billable_requests_total`: successful HTTP responses estimated as billable.

The Prometheus rules in `property-enrichment-alert-rules.yaml` warn on sustained
authentication failures, abnormal rate limiting, and material provider failures.
They intentionally describe degraded enrichment rather than a Property creation
outage. Investigate the worker credential/restrictions, concurrency, provider status,
and account usage; do not relax exact address or unit matching to improve match rate.

## Vendor inventory

| Vendor | Data sent | Purpose | Stored by ContractToCozy | Excluded from ingestion |
| --- | --- | --- | --- | --- |
| RentCast | Residential street address, optional unit, city, state, and ZIP | Retrieve public property records after Property create/address change | Provider-neutral match state; allowlisted core/location/structure/HVAC/exterior/fireplace facts; public-record evidence; bounded freshness metadata | Raw response, owner/name and mailing data, sale history, valuations/AVM, rent, tax, HOA, history, garage, and listings |

RentCast is a third-party property-data provider. Provider-side handling remains
subject to the applicable RentCast agreement and privacy/security terms. Review
those terms, endpoint restrictions, usage, and key rotation before real-user use.
