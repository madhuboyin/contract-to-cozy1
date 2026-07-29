# Service Price Benchmark Source Operations Runbook

## Purpose

This runbook governs the qualified evidence used by Service Price Radar. A
category heuristic is always planning guidance. A homeowner-facing price
verdict is allowed only when a benchmark observation belongs to a reviewed,
active, current release from an approved and healthy source.

## Qualification contract

A benchmark is fail-closed unless all of the following are true:

- source rights and domain review are `APPROVED`;
- the source is active;
- source health is `HEALTHY` and was checked within 48 hours;
- the import run is `VALIDATED` and has a SHA-256 checksum;
- the release is `ACTIVE`, quality is `PASSED`, and review and activation
  timestamps are present;
- the observation period is valid and does not extend into the future;
- the release is currently effective and not expired;
- source name, URL, license summary, release version, methodology, geography,
  cohort, percentile, scope, unit, and sample information are present;
- the benchmark uses USD, contains at least five observations, and has a valid
  price distribution.

If any condition fails, Radar preserves the quote and provides scope review and
a rough planning range without `FAIR`, `HIGH`, `VERY_HIGH`, or `UNDERPRICED`.

## Ingestion and review

1. Confirm source usage rights and record the license summary and source URL.
2. Prepare a release with a unique source version and import-run key.
3. Compute and record the SHA-256 checksum of the input artifact.
4. Validate observation dates, geography, normalized scope, units, currency,
   sample size, percentiles, and price bounds.
5. Call `ingestServicePriceBenchmarkRelease`. Successful ingestion creates a
   validated import run and an `IN_REVIEW` release; it does not activate data.
6. A separate reviewer calls `reviewServicePriceBenchmarkRelease` with an
   approval or rejection and durable review notes.
7. Record source health with `recordServicePriceBenchmarkSourceHealth`.
8. Call `activateServicePriceBenchmarkRelease`. Activation fails unless all
   source, health, import, review, quality, and freshness gates pass.

Ingestion, review, and activation actions must use authenticated operator
surfaces when exposed outside internal tooling.

## Health report

After the database schema has been reconciled, run:

```bash
npm run report:service-price-benchmarks
```

The command returns JSON with source approval, health freshness, active release,
expiry, observation date, benchmark count, and overall eligibility.

Investigate immediately when:

- an expected source is not eligible;
- health is missing, degraded, unhealthy, or older than 48 hours;
- no active release exists;
- an active release is expired or quality is not `PASSED`;
- benchmark counts change unexpectedly.

## Degradation and incident response

When a source is degraded or unavailable:

1. Set source health to `DEGRADED` or `UNHEALTHY`.
2. Confirm new checks return planning guidance without a categorical verdict.
3. Preserve entered quotes and existing immutable evidence snapshots.
4. Investigate the source or import without extending expiry timestamps.
5. Restore `HEALTHY` only after a successful verification check.

## Deactivation and rollback

- Use `deactivateServicePriceBenchmarkRelease` to stop a release immediately.
- Use `rollbackServicePriceBenchmarkRelease` to retire the current release and
  restore a previously reviewed release that still satisfies every current
  health and freshness gate.
- Never reactivate an expired, unhealthy, unreviewed, or quarantined release.
- Confirm the health report and a no-verdict degraded-state check after rollback.

Every ingestion, activation, deactivation, and rollback must retain its audit
record and operator reason.

## Schema reconciliation

The repository intentionally contains no Prisma migration for this capability.
There are no production users or Radar records requiring compatibility.
After pulling the schema change, reconcile the database separately, then run:

```bash
npm run prisma:generate
npx prisma validate
```
