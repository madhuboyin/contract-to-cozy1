# Home Briefing

## Current contract

Home Briefing is the canonical delta-delivery capability. It consumes eligible `PropertyChange`
records and their canonical Home Action or Timeline owners. It does not collect raw domain signals,
create a second priority score, or require a minimum number of stories.

The earlier Home Gazette editions, stories, candidates, rankings, selection traces, editorial jobs,
and share links are retained only as a historical delivery archive. The canonical route is:

`/dashboard/properties/:propertyId/tools/home-briefing`

The legacy `/tools/home-gazette` route redirects there.

## Delivery rules

- A delivery contains zero to many items.
- Every item references exactly one eligible, non-superseded `PropertyChange`.
- The Property Change materiality and briefing policy remain authoritative.
- A change already delivered to a user is not repeated.
- A new material source revision creates a new Property Change and can therefore be delivered.
- `IMPORTANT_ONLY` includes only `IMPORTANT` and `URGENT` changes.
- Topic preferences filter after canonical eligibility; they never change upstream truth.
- Delivery buckets make hourly scheduler execution idempotent:
  - immediate: hourly bucket with a 24-hour lookback
  - weekly: current UTC-week delivery key with a rolling seven-day lookback
  - monthly: current UTC-month delivery key with a rolling 31-day lookback
  - important-only: daily bucket with a 30-day lookback
- In-app delivery is durable. Email and push selections are routed through the existing notification
  policy and transport pipeline.
- A zero-item delivery creates no outbound notification.

The retained scheduler key is `home-gazette-generation` for deployment compatibility, but the job
now calls `generateDueHomeBriefings()` rather than the Gazette signal collector, ranking engine, or
AI editorial pipeline.

The legacy signal collector, candidate factory, ranking engine, edition assembler, publisher, and
AI editorial implementation have been removed. Admin generation and regeneration URLs remain
authenticated `410 Gone` compatibility boundaries. Existing editions, candidates, selection
traces, generation jobs, stories, and share links remain archive data; operators can inspect those
records, and owners can revoke an existing share token, but no new Gazette record is generated or
shared.

## Deterministic baseline

`home-briefing-deterministic-v1` is the trusted editorial baseline.

Copy is derived in this order:

1. canonical Home Action title and homeowner reason;
2. canonical Timeline title and summary;
3. allowlisted title and summary fields from the exact reviewed intelligence observation revision;
4. a bounded source/change template.

Every item stores source lineage containing:

- Property Change ID;
- source type and source entity ID;
- source revision and ordinal;
- change type and detection time;
- confidence and materiality reason codes;
- exact provider, URL, verification time, lifecycle, and geography when the source is a reviewed
  intelligence observation.

Generative editing may be added later only as a constrained rewrite of these validated facts. It
must fall back to the deterministic baseline and cannot introduce new facts, priorities, or actions.

## Source-health and quiet statements

Every delivery snapshots the applicable reviewed Property Intelligence coverage. Coverage is always
marked non-comprehensive. The snapshot explicitly states that canonical domains without a
source-health contract are not treated as verified quiet.

A zero-item delivery distinguishes:

- `NO_MATERIAL_CHANGES_IN_WINDOW`;
- `SOURCE_COVERAGE_NOT_CONFIGURED`; and
- `NO_MATERIAL_CHANGES_WITH_DEGRADED_COVERAGE`.

A delivery with items records `PARTIAL_SOURCE_COVERAGE` when any source is degraded, stale,
unavailable, or not configured. “Quiet” never means a universal all-clear.

## Preferences

Preferences are per property and user:

- enabled/disabled;
- cadence: immediate, weekly, monthly, or important-only;
- topics: Home Actions, Home History, local changes, hazards, property facts, source health, and
  other; and
- channels: in-app, email, and push.

An empty topic list means all eligible topics.

## Outcome tracking

Home Briefing records:

- delivered;
- opened;
- seen;
- acted;
- dismissed; and
- not useful.

Item outcomes also update the corresponding per-user `PropertyChangeAudienceState`. `ACTED` is
accepted only when the item has a canonical Home Action or Timeline owner.

## Canonical deep links

Deep links route to:

- Home Operations for canonical Home Actions;
- Timeline for canonical events;
- Around Your Home for reviewed local-change observations;
- Past Hazard Exposure for hazard observations; or
- Status Board as the bounded fallback owner.

The briefing archive is not property history and does not replace these owners.

## Selected sharing

Whole-Gazette public sharing is retired. Its create and public access routes return `410 Gone`.
Existing owner revocation remains available.

Home Briefing sharing:

- requires explicit selection of one to ten items;
- accepts only items marked share-eligible by the backend;
- stores a hash of the raw token;
- expires after one to thirty days;
- can be revoked by its creator;
- returns only the selected items;
- excludes the property street address and canonical action URLs; and
- displays a clear limitation that it is not a property report, inspection, appraisal, or complete
  disclosure.

## Home-card rule

The property Home card renders only when the latest delivery has unread material items. It is
suppressed for setup states, zero-item deliveries, fully seen deliveries, dismissed items, and
not-useful items.

## APIs

Homeowner:

- `GET /api/properties/:propertyId/home-briefing`
- `POST /api/properties/:propertyId/home-briefing/generate`
- `PUT /api/properties/:propertyId/home-briefing/preferences`
- `POST /api/properties/:propertyId/home-briefing/deliveries/:deliveryId/open`
- `POST /api/properties/:propertyId/home-briefing/items/:itemId/outcome`
- `POST /api/properties/:propertyId/home-briefing/deliveries/:deliveryId/share`
- `POST /api/properties/:propertyId/home-briefing/shares/:shareId/revoke`

Public selected-item read:

- `GET /api/home-briefing/share/:token`

## Database application

This implementation updates the Prisma contract but intentionally does not add or apply a database
migration. Deployment must generate and review the migration separately under the repository’s
database-change process.
