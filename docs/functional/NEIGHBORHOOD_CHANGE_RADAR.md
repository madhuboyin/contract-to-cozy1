# Around Your Home

## Current contract

Around Your Home is the homeowner-facing local-change intelligence capability. It reports factual
planning, infrastructure, land-use, flood-map, and school updates that come through the shared
Property Intelligence source, coverage, ingestion, revision, matching, and assessment foundation.

The earlier “Neighborhood Change Radar” event model and its property-value, rental-demand,
sentiment, demographic, and composite-score interpretations are legacy compatibility reads. The
homeowner experience and all new writes no longer use that model.

## Trust boundary

- A provider is not visible until an administrator approves its source contract, terms version,
  supported record types, and enabled environment.
- A geography is not visible until its coverage definition receives a QA review.
- Coverage is always limited to the providers, record types, dates, and geographies shown.
- No configured or stale source is treated as an all-clear.
- A source fact and lifecycle state are displayed separately from bounded possible relevance.
- A geographic match does not establish household impact.
- The capability does not predict property value, buyer or renter demand, insurance cost, or
  neighborhood sentiment.
- Synthetic source coverage is prohibited.

Operational pilot activation therefore requires an actual authoritative provider contract and an
explicit reviewed geography. The repository does not pre-approve a provider or invent a pilot
record. Administrators use the shared `/api/admin/property-intelligence/sources` review, coverage,
and ingest endpoints; `/api/admin/around-your-home/quality` provides the filtered pilot-family
quality view.

## Source and revision flow

1. An administrator registers a provider under one of the allowed source families: `PLANNING`,
   `INFRASTRUCTURE`, `LAND_USE`, `FLOOD_MAP`, or `SCHOOL`.
2. Source and coverage reviews must pass before ingestion is accepted.
3. The shared ingestion service normalizes records, validates supported observation types,
   deduplicates identical content, and creates a revision only for new or materially changed
   content.
4. Matching records preserve their actual geographic precision. Point distances are calculated
   only when the source provides coordinates; ZIP, county, state, and polygon records never receive
   a fabricated point distance.
5. A canonical Property Change is emitted for a new record, material revision, or lifecycle change.
   Rechecking unchanged content does not create a homeowner change.

## Lifecycle

The source lifecycle is retained verbatim:

- `PROPOSED`
- `APPROVED`
- `ACTIVE`
- `COMPLETED`
- `CANCELLED`
- `STALE`
- `UNKNOWN` when the provider does not establish one

The list hierarchy is:

1. followed records with a newer material revision
2. other followed records
3. unseen records
4. proposed, approved, or active records
5. completed records
6. cancelled, stale, dismissed, or not-relevant records

## Homeowner API

- `GET /api/properties/:propertyId/around-your-home`
- `POST /api/properties/:propertyId/around-your-home/:propertyMatchId/interaction`

Interaction actions are `FOLLOW`, `DISMISS`, `NOT_RELEVANT`, and `MARK_SEEN`. State is scoped to
the authenticated user and property observation match. `lastSeenRevision` makes a material source
revision visible again to someone following the record.

The read response includes:

- reviewed coverage and its checked-through state
- factual source fields and exact source URL, when provided
- source lifecycle and effective dates
- the real match geography and precision
- coordinates and distance only when supported by source data
- a separate bounded relevance assessment
- per-user interaction state

The map is deliberately precision-aware: source-provided points can be plotted; area-level records
remain in the list with their true geography instead of being assigned a false marker.

## Retired writes

These legacy write paths return `410 Gone`:

- `POST /api/properties/:propertyId/neighborhood-radar/recompute`
- `POST /api/neighborhood-intelligence/ingest`
- `POST /api/neighborhood-intelligence/events/:eventId/recompute`

They are replaced by reviewed common-source ingestion and automatic revision-aware matching.

## Admin quality

`GET /api/admin/around-your-home/quality` requires administrator role, MFA, and
`INTEGRATION_MANAGE`. It reports only the five allowed source families and includes source
activation decisions, coverage health, recent runs, rejection counts, observation counts, and the
explicit rule that synthetic coverage is not allowed.
