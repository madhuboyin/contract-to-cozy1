# 10 — Testing Strategy

## Quality model

Test the current three-definition, property-owned runtime. Optional household
answers are a separate consented boundary. Tests must not assume percentage
enrollment, a shadow path, migrations, inferred household traits, background
workers or a configurable learning model.

## Required layers

| Layer | Current release gate |
|---|---|
| Rule/trait unit | AST bounds, `TRUE`/`FALSE`/`UNKNOWN`, the three property definitions and stable priority bands |
| Catalog lifecycle | DRAFT is inactive; active reviewed rule/content versions match; safety author/reviewer differ |
| Application | materialize/expire/suppress; max-three read; content gate; idempotent feedback/action/profile events |
| Authorization | wrong property denied; VIEWER read-only; CONTRIBUTOR feedback/action; OWNER optional profile/context; ADMIN+MFA lifecycle/quality |
| Optional profile | consent before answer; schema validation; skip/snooze cooldown; reset/account erasure cascades only profile data |
| Cross-module | Dashboard, Maintenance and Health receive the same property recommendation DTO; task conversion is idempotent |
| Privacy | non-owner evidence redaction; context map excludes IDs/raw nested data; aggregate quality excludes answers/comments/identifiers |
| Operational controls | global and definition pause stop new evaluation and hide stored output; reset remains available |
| Frontend | loading/error/empty/disabled states, 44px actions, keyboard and accessible labels |
| Schema | Prisma validates and the current client compiles; seed SQL/TS reference only current fields |

## Golden scenarios

Every active definition needs synthetic fixtures for:

- a known eligible property;
- a known ineligible property;
- missing/unknown source data;
- inactive or missing reviewed content;
- active and expired suppression;
- reevaluation that expires and later revives the same property/definition
  recommendation.

No fixture copies production profile data. Optional-profile tests use broad
synthetic shapes matching the five question schemas.

## Authorization matrix

For every property endpoint cover unauthenticated, wrong property, OWNER,
CONTRIBUTOR and VIEWER. For profile/context endpoints verify OWNER-only access.
For catalog/quality endpoints verify ADMIN plus MFA. Item-ID operations must
resolve the item back to the authorized property rather than trust a request
body household or property ID.

## Database tests

Use real disposable PostgreSQL where constraint/cascade/transaction behavior is
under test. Verify:

- one recommendation and one suppression per property/definition;
- unique feedback/profile idempotency keys;
- deleting an optional `Household` cascades its property links and profile
  answers but not property guidance;
- active catalog version selection and transactional activation;
- concurrent retries resolve as idempotent outcomes.

Mock-backed unit tests remain appropriate for deterministic repository query
shapes and orchestration.

## Schema deployment and migration rehearsal

While the greenfield database contains no data that must survive schema evolution,
validate the desired Prisma schema and recreate a disposable database. Do not
maintain migration-rehearsal machinery or speculative backfills.

When a deployed database first contains data that must survive a change, add a
conventional migration test for that actual change: apply it to an anonymized
production-shaped snapshot, compare counts/uniques/orphans, exercise old and
new required reads, and verify the operational rollback. Never infer optional
household facts during a data transform.

## Performance and reliability

During internal validation, measure the selected-property read/materialization path, shared
module read and aggregate admin-quality query using a realistic internal data
set. Reject unbounded JSON scans and N+1 queries. Queue bursts, cache
invalidation, notification delivery and large-scale definition matrices are
future gates only if those systems are introduced.

## Accessibility and visual QA

Exercise profile, recommendation, explanation, feedback, reset and admin
controls at 320, 375, 768 and desktop widths; keyboard-only; 200% zoom;
reduced-motion and high-contrast settings; long text; and status/error
announcements. Confidence/priority must not rely on color alone.

## Quality measurement before learning

Review aggregate accepted, acted, dismissed and not-relevant outcomes by
definition only after the declared minimum decision sample. The threshold
permits human review, never automatic tuning. Do not implement or test learning
behavior until a separate evidence-backed design defines its outcome, safety
floor, privacy approval and rollback.

## Current verification commands

```bash
cd apps/backend
npx prisma validate --schema=prisma/schema.prisma
npx prisma generate --schema=prisma/schema.prisma
npx tsc --noEmit
node --test tests/unit/personalization*.test.js

cd ../frontend
npm run build
```
