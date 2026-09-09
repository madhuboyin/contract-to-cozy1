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
| RentCast | Residential street address, optional unit, city, state, and ZIP | Retrieve public property records after Property create/address change | Provider-neutral match state, selected canonical facts, public-record evidence, and bounded freshness metadata | Raw response, owner/name and mailing data, sale history, valuations/AVM, rent, tax, and listings |

RentCast is a third-party property-data provider. Provider-side handling remains
subject to the applicable RentCast agreement and privacy/security terms. Review
those terms, endpoint restrictions, usage, and key rotation before real-user use.
