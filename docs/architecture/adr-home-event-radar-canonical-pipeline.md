# ADR — Home Event Radar Canonical Signal Pipeline

## Status

Accepted for implementation baseline.

## Date

July 26, 2026

## Context

Home Event Radar currently exposes a property feed backed by `RadarEvent` and
`PropertyRadarMatch`, while live NWS and freeze signals are created through a separate Incident
path. The UI describes weather, insurance, utility, and tax monitoring even when no verified
provider is configured for those source families. Temporary event write and matching endpoints
also existed on the public API surface.

This split makes an empty Radar feed ambiguous: it can mean that there are no relevant signals,
that no source covers the property, that a source failed, or that a signal was projected only to
Incidents. Those states must not be presented as equivalent.

The product is pre-launch and has no production users. A direct cutover is therefore safer than
maintaining two canonical models or adding migration compatibility code.

## Decision

1. Home Event Radar is the canonical store and lifecycle owner for external property signals.
2. Incident is the actionable projection for signals that require homeowner attention. Providers
   do not write directly to Incident after the canonical pipeline is introduced.
3. Every provider response is normalized into a versioned canonical observation before matching.
   Provider payloads remain immutable evidence; derived event and match records are reproducible.
4. Source definitions explicitly declare geography, schedule, freshness, event families, and
   enabled environments. Source health and property coverage are first-class states.
5. A source failure, stale run, unsupported geography, or disabled connector is `unknown` or
   `unavailable`, never evidence that no hazard exists.
6. Matching produces an explainable, versioned property match. Severity describes the external
   signal; property impact describes the likely effect on the selected home.
7. Lifecycle states support active, updated, resolved, expired, and retracted observations.
   Repeated observations are deduplicated by source, provider event ID, revision, and normalized
   geography.
8. PostgreSQL with PostGIS is the target geospatial implementation. Canonical coordinates use
   WGS84 (`SRID 4326`), stored as spatially indexed points/polygons. GeoJSON is the transport
   format, not the database query model.
9. Temporary ingestion and matching operations live only on an authenticated admin surface,
   require verified administrative access plus `INTEGRATION_MANAGE`, and emit audit records.
10. The pre-launch cutover is clean: no dual-write, compatibility layer, or data migration is
    required. Existing development data may be discarded when the canonical schema lands.

## API and Product Semantics

- Feed and overview responses include source coverage and freshness, not only event counts.
- Empty states distinguish:
  - verified quiet: covered sources completed successfully and found no relevant signals;
  - partial coverage: some relevant source families are unavailable;
  - unavailable: no verified source covers the property; and
  - error/stale: the last verified run is outside its freshness objective.
- Each event detail includes source attribution, observation time, affected geography, match
  explanation, confidence, lifecycle, and recommended actions.
- Weather alerts currently projected directly to Incidents remain labeled as such until their
  providers are moved behind the canonical pipeline.

## Consequences

### Positive

- The Radar feed and Incidents can no longer silently disagree about source truth.
- “Zero events” becomes a defensible product state instead of a generic absence of rows.
- Provider additions share one contract, lifecycle, deduplication, and observability model.
- Property matches can be explained, replayed, and evaluated independently of provider adapters.

### Costs

- The next phase requires source-definition, source-run, observation, event, match-explanation,
  and action-projection schema changes.
- PostGIS must be enabled and exercised in development and deployment environments.
- Existing NWS and freeze workers must be adapted to emit observations before Incident
  projection.
- Coverage and health UI states add response and frontend complexity.

### Rejected alternatives

- **Keep Incidents and Radar as parallel authorities:** preserves divergent lifecycle and empty
  state semantics.
- **Let providers write domain tables directly:** prevents replay, consistent deduplication, and
  source-level health reporting.
- **Use ZIP-only matching:** fails near ZIP boundaries and cannot support polygons or radius
  events accurately.
- **Treat failed or absent fetches as no events:** creates false reassurance.
- **Maintain compatibility because data exists:** no real users exist, so it adds risk without
  customer benefit.

## Verification

- Public routes cannot create arbitrary events, trigger matching, or read raw event records.
- Temporary operations require authentication, MFA policy, admin role, capability authorization,
  rate limiting, and audit logging.
- Canonical contracts reject malformed time, geography, source-health, coverage, and match data.
- UI copy does not claim unsupported monitoring and links users to the current Incident weather
  experience.
- Provider lifecycle tests prove that failed fetches cannot resolve active signals and that dummy
  ingestion cannot run in production.
