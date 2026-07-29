# Service Price Benchmark Source Operations Runbook

## Purpose

This runbook governs the qualified evidence and evidence incidents used by the
Service Quote Decision journey. Service Price Radar is the homeowner entry
surface. A category heuristic is always planning guidance. A homeowner-facing
price verdict is allowed only when a benchmark observation belongs to a
reviewed, active, current release from an approved and healthy source.

This runbook does not authorize an operator to inspect raw quote text, final
prices, or change-order values. Outcome reporting is aggregate-only and final
cost signals are captured only under explicit workspace consent.

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

### Separation of duties

- the importer may create an import run and review candidate validation;
- a reviewer approves or rejects the release;
- an authorized activator changes the active release;
- the incident commander may degrade health or deactivate a release;
- no source, import, or derived cohort may approve or activate itself.

For the current no-user implementation, these roles may be held by the same
engineer in development, but the actions and reasons must remain separately
recorded.

### Activation checklist

Before activation, record and verify:

- contract or license permits the intended display and aggregation;
- source URL and owner are current;
- checksum matches the reviewed artifact;
- accepted and rejected row counts reconcile with the input;
- normalization version and scope keys are expected;
- geography, unit, currency, and percentile semantics are documented;
- sample sizes and distributions pass validation;
- observation and expiration dates are correct;
- source health is current and healthy;
- a second-person review decision and notes exist;
- a fail-closed test passes before activation;
- a qualified sample check displays the correct visible provenance after
  activation.

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

The admin analytics route
`GET /api/admin/analytics/service-quote-decisions` provides aggregate evidence
coverage and degraded-source counts. It must not be used as a substitute for
the source-health report because it intentionally omits release-level detail.

### Alert severity

| Severity | Condition | Initial response |
|---|---|---|
| SEV-1 | Unsupported or unqualified evidence produced a categorical verdict | Deactivate the affected release or source immediately and open an incident |
| SEV-2 | Active source unhealthy, stale, expired, rights-revoked, or materially incorrect | Mark unhealthy/deactivate and confirm fail-closed behavior |
| SEV-3 | Import variance, reduced coverage, ambiguous matching, or reporting anomaly without an unsafe verdict | Quarantine the candidate release and investigate before activation |
| SEV-4 | Documentation, dashboard, or non-production fixture drift | Correct during the next controlled release |

## Degradation and incident response

When a source is degraded or unavailable:

1. Set source health to `DEGRADED` or `UNHEALTHY`.
2. Confirm new checks return planning guidance without a categorical verdict.
3. Preserve entered quotes and existing immutable evidence snapshots.
4. Investigate the source or import without extending expiry timestamps.
5. Restore `HEALTHY` only after a successful verification check.

For SEV-1 or SEV-2:

1. Record incident start time, affected source/release/category/geography, and
   the operator making the change.
2. Prefer source-health degradation when the source is broadly suspect. Use
   release deactivation when the defect is isolated to one release.
3. Verify both API and UI behavior:
   - no new categorical verdict;
   - `INSUFFICIENT_DATA`;
   - planning-only language;
   - preserved quote and decision controls;
   - no low-price booking urgency.
4. Determine the first and last potentially affected check.
5. Preserve audit logs and immutable evidence snapshots. Do not rewrite
   historical checks.
6. Fix or replace the source artifact, create a new import run, and repeat
   independent review. Never patch active benchmark rows in place.
7. Document root cause, detection gap, affected scope, and prevention action.
8. Close only after the health report and acceptance suite pass.

If homeowner notification ever becomes necessary, legal/support approval is
required before outreach. This repository does not currently implement an
automatic benchmark-incident notification.

## Deactivation and rollback

- Use `deactivateServicePriceBenchmarkRelease` to stop a release immediately.
- Use `rollbackServicePriceBenchmarkRelease` to retire the current release and
  restore a previously reviewed release that still satisfies every current
  health and freshness gate.
- Never reactivate an expired, unhealthy, unreviewed, or quarantined release.
- Confirm the health report and a no-verdict degraded-state check after rollback.

Every ingestion, activation, deactivation, and rollback must retain its audit
record and operator reason.

### Rollback verification

After a rollback:

```bash
cd apps/backend
npm run report:service-price-benchmarks
npm run test:service-price-radar:acceptance
npm run build
```

Confirm the restored release is still current. A historically approved release
that is now expired or belongs to an unhealthy source is not a valid rollback
target.

## Controlled learning

Consented completed-work outcomes are inputs to an operator review queue, not
benchmarks. The `service-quote-decision-v1` policy requires at least 20
verified final-price observations across at least 10 distinct properties.

Passing those thresholds means only “eligible for review.” Before any derived
cohort becomes a benchmark source:

- remove duplicates and verify completion lineage;
- define and apply an outlier policy;
- confirm geography, category, scope, and unit comparability;
- perform privacy and rights review;
- document cohort and percentile methodology;
- create a normal source, import run, and release;
- complete independent review and activation.

Unverified estimates, quote text, incomplete proposals, and non-consented
final prices are prohibited from derived cohorts.

## Schema reconciliation

The repository intentionally contains no Prisma migration for this capability.
There are no production users or Radar records requiring compatibility.
After pulling schema changes, reconcile the database separately. This includes
benchmark lifecycle models, the canonical Service Quote Decision workspace,
and the outcome-measurement consent fields. Then run:

```bash
npm run prisma:generate
npx prisma validate --schema=./prisma/schema.prisma
npm run build
```

Do not add migration scripts, backfills, dual-write behavior, or obsolete Radar
compatibility tables for this capability.
