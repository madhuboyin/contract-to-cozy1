# Home Event Radar Test Fixtures

## Purpose and safety boundary

The Home Event Radar fixture provider exercises the same source registration, source-run,
canonical observation, immutable revision, and match-enqueue path used by reviewed providers.
It is test infrastructure, not a fallback data source.

- Every source name begins with `Test data —`.
- Every event title begins with `[Test data]`.
- Raw evidence and source/run metadata carry `testData: true` and `testDataLabel: "Test data"`.
- Sources use `manual_import` so they cannot be mistaken for a live external provider.
- Both worker startup and the job itself reject `production`.
- Property selection is bounded to explicit property IDs or reviewed postal-code allowlists.

## Enable and scope

Use only in development, test, or staging:

```text
RADAR_DUMMY_INGEST_ENABLED=true
RADAR_DUMMY_INGEST_RUN_ON_STARTUP=true
RADAR_DUMMY_TARGET_PROPERTY_IDS=<comma-separated-property-ids>
RADAR_DUMMY_FIXTURE_SET=property_scoped
```

Alternatively, set `RADAR_DUMMY_TARGET_ZIPS` for a bounded postal-code test. If neither IDs nor
postal codes are provided, only the reviewed default ZIPs `08536` and `10019` are eligible. A run
is capped at 25 properties by default and 100 properties at the hard maximum.

The scheduled job defaults to every 30 minutes. Fixture observations use the same 30-minute
revision window, so retries within a window are idempotent while the next window creates a
material test revision with the same provider event identity.

## Verify a run

Confirm all of the following:

1. A `test-home-event-radar-fixtures-<family>` source exists for each emitted family.
2. Its latest source run is `success`, or explicitly `partial`/`failed` with rejected counts.
3. Canonical events reference the test source and have an immutable revision.
4. A `MATCH_RADAR_EVENT_REVISION` job exists using the deterministic revision-scoped job ID.
5. UI-visible event titles and source attribution say `Test data`.

## Reset

There are no real users and no migration compatibility requirement. Reset only the fixture-owned
records; do not truncate shared Radar tables.

In a transaction, use Prisma or an equivalent database administration client to:

1. Find `RadarSourceDefinition` records whose key starts with
   `test-home-event-radar-fixtures-`.
2. Delete `RadarEvent` records referencing those source IDs. Cascades remove fixture revisions,
   property matches, states, actions, and feedback.
3. Delete the fixture source definitions. Cascades remove their health, coverage, and source-run
   records.

Inspect any fixture-derived `Incident` projection before reset. Deleting its fixture match sets
`Incident.propertyRadarMatchId` to null; it does not delete the Incident. Remove any orphaned
fixture Incident only after confirming its source and property lineage. Never delete unrelated
Incidents by broad source-type filters.

## Reseed

After reset:

1. Apply the current Prisma schema using the repository owner's normal schema job.
2. Set an explicit property-ID or postal-code allowlist.
3. Enable one startup run or trigger the scheduled job in a non-production environment.
4. Disable `RADAR_DUMMY_INGEST_RUN_ON_STARTUP` after the seed if recurring revisions are not
   required.
5. Verify source health, revision lineage, queued matching, and visible `Test data` labels.
