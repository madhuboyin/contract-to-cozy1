# Property Context JIT — Slice 4 planning adoption

Date: 2026-07-17

## Release boundary

This tranche adopts the interactive Neighborhood Change Radar as the first planning surface. It replaces the feature's compatibility notice with a shared entry boundary while preserving event ingestion, property matching, impact generation, trends, guidance continuity, and source attribution.

## Minimum contract

`NEIGHBORHOOD_RADAR / VIEW_RADAR` requires only `location.zipCode` as `REQUIRED_APPLICABILITY`. ZIP is the mandatory geographic key used by the existing planning policy. The shared scalar definition validates a five-digit ZIP and persists it canonically to the explicit property.

Geocoding remains a nonblocking precision signal. It is not exposed as an inline question because latitude/longitude are derived, non-writable facts and must not be guessed by the homeowner.

## Interactive boundary

The frontend evaluates readiness before starting summary, events, detail, or trend queries. A missing ZIP is captured on the radar page; successful capture resumes the existing queries in place without a reload. The legacy `PropertyContextNotice` is removed from this feature.

The corresponding backend handlers enforce the same contract before their canonical query services. Direct callers receive `409 PROPERTY_CONTEXT_INCOMPLETE` with the evaluation envelope when ZIP is absent.

## Background and cross-tool behavior

The shared prompt is intentionally not applied to cross-tool compact signals, ingestion, worker refresh, admin event recompute, or property recompute. Those paths remain noninteractive and must not manufacture prompt loops or fail unrelated tools merely because location is incomplete. Users are routed to the interactive radar when correction is appropriate.

## Persistence

The existing neighborhood event, match, impact, and signal models remain canonical. Shared capture writes only the missing Property ZIP. No Prisma schema change or migration is required.
