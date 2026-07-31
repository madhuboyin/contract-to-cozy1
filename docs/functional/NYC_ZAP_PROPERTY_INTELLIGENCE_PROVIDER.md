# NYC ZAP Property Intelligence Provider

## Source contract

The provider reads the New York City Department of City Planning
[Zoning Application Portal project dataset](https://data.cityofnewyork.us/City-Government/Zoning-Application-Portal-ZAP-Project-Data/hgx4-8ukb)
through its public Socrata API (`hgx4-8ukb`).

NYC describes the dataset as project tracking and description data for land-use
applications from filing/noticing through completion. The dataset metadata
identifies the Department of City Planning as the source, a monthly update
frequency, and public project lifecycle fields. NYC Open Data states that
submitting City agencies are the authoritative source, that records may be
updated or corrected, and that public datasets do not carry a completeness or
fitness warranty.

## Reviewed pilot boundary

| Contract | Value |
| --- | --- |
| Canonical source key | `nyc-dcp-zap-projects` |
| Family | `PLANNING` |
| Observation type | `NYC_ZONING_APPLICATION` |
| Environment | `production` |
| Launch stage | `PILOT` |
| Geography | Manhattan / `NEW YORK COUNTY` |
| Geographic precision | `COUNTY` |
| Provider cadence | Monthly |
| Worker cadence | Daily at 03:35 America/New_York |
| Staleness threshold | 32 days |
| Operational response | 24 hours |

The adapter intentionally does not invent a project point, radius, or property
distance. A Manhattan record can match a property whose canonical county is
New York County, and the homeowner sees that actual county-level precision.

Only records marked `General Public` (or records where the source omits the
visibility field) are accepted. Applicant identity is not copied into the
homeowner-facing factual payload.

## Lifecycle normalization

- withdrawn, terminated, disapproved, or cancelled → `CANCELLED`
- completed application processing → `COMPLETED`
- an explicit approval date/status → `APPROVED`
- certification, referral, or active public review → `ACTIVE`
- filed/noticed/active pre-review application → `PROPOSED`
- otherwise → `UNKNOWN`

These states describe the application-review lifecycle. They do not claim that
construction began, finished, or affected a property.

## Activation and audit

The worker requires:

```text
NYC_ZAP_PILOT_ENABLED=true
NYC_ZAP_PILOT_COUNTIES=NEW YORK COUNTY
NYC_ZAP_PILOT_REVIEWED_BY=<review owner>
NYC_ZAP_PILOT_REVIEW_REFERENCE=<durable review reference>
WORKER_JOB_NYC_ZAP_PLANNING_INGEST_ENABLED=true
```

`NYC_OPEN_DATA_APP_TOKEN` is optional and should be supplied as a secret when a
higher Socrata request limit is needed.

On first live execution, activation creates or reviews the source, creates
QA-reviewed county coverage, records the Planning-family `PILOT` gate, and
writes a queryable admin audit event. Existing source or family pauses stop the
job; startup configuration cannot silently clear a kill switch.

## Failure and recovery

- A network, timeout, HTTP, or response-shape failure fails the worker run.
- Governance rejects records outside the reviewed county or with an unsupported
  observation type.
- The common ingestion layer records partial/failure health and does not turn a
  failed check into an all-clear.
- Identical source content refreshes `lastVerifiedAt` without emitting another
  Property Change.
- A material source revision produces one new canonical observation revision
  and at most one Property Change per matched property.
- Operators can pause or roll back the source through the common governance
  controls without deleting prior observations.

## Acceptance

Run:

```bash
cd apps/workers
node --require ts-node/register --require tsconfig-paths/register --test \
  tests/unit/nycZapProvider.test.js \
  tests/unit/nycZapPlanningIngestJob.test.js

cd ../frontend
npm run test:property-intelligence:e2e
```

The browser suite verifies reviewed-source disclosure, county precision, no
fabricated distance, follow state, a one-item Home Briefing, canonical-owner
navigation, degraded coverage language, mobile layout, and automated WCAG
checks.
