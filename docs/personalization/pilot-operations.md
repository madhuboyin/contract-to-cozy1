# Personalization pilot operations

The pilot is disabled by default and does not create or run database migration scripts.

## Database ownership

The user applies `apps/backend/prisma/schema.prisma` to the pilot database. After the schema is available, the single optional catalog command is:

```bash
cd apps/backend
npx ts-node prisma/seedPersonalizationPilot.ts
```

This idempotently seeds three definitions, three rules, three versioned content records and five profile questions as `DRAFT`. It does not create households, backfill properties, activate content or alter existing definition/rule/content/question status.

For pgAdmin, run `apps/backend/prisma/seedPersonalizationPilot.sql` instead.
It is the SQL equivalent of the TypeScript seed; run one or the other, not both
(although both are idempotent).

## Review and activation

- Review the HVAC rule/copy before setting its definition, rule and content version to `ACTIVE`.
- The smoke/CO and dryer-vent rules are `SAFETY_SENSITIVE`. Each active rule must have different non-empty `authoredBy` and `reviewedBy` values or the evaluator treats it as inactive.
- Activate only the profile questions approved for the pilot. The UI requests only `ACTIVE` questions in the `PILOT` placement.
- Materialization requires matching ACTIVE rule and ACTIVE `en-US` content. Missing/DRAFT content is a safe no-op even when the definition and rule are ACTIVE.

## Exposure and rollback

Set `TOOL_ROLLOUT_PERSONALIZATION_PILOT` to the desired pilot percentage. The default is `0`. The database-backed personalization kill switch remains the immediate system-wide stop.

There is no nightly personalization sweep. Recommendations recompute for the selected opted-in property on opt-in and read. Disabling the rollout flag or engaging the kill switch stops exposure without changing property data.

Admins can also emergency-pause one definition through `POST /api/admin/personalization/definitions/:code/pause` and resume it through the matching `/resume` endpoint. These operations require authenticated ADMIN role plus MFA and write personalization audit events.

## Phase 2 Maintenance placement

The first cross-module placement reuses the same pilot exposure flag and ACTIVE definition/rule/content gates:

- `GET /api/properties/:propertyId/personalization/modules/maintenance/recommendations?limit=3`
- `POST /api/properties/:propertyId/personalization/recommendations/:recommendationId/actions/convert-to-task`

The conversion body is `{ "idempotencyKey": "<uuid>" }`. It calls the existing maintenance task service with a recommendation-scoped action key, so retries return the existing task. No Phase 2 SQL or schema change is required for this slice.

Dashboard and Property Health use the same module endpoint with `dashboard` and `health` in place of `maintenance`. They render reviewed summaries and route action to Maintenance rather than copying rules.

## Catalog approval UI

Admins with MFA can open `/dashboard/admin/personalization`. The page lists existing seeded definition, rule, content and profile-question versions. Activation requires an active ADMIN author user ID; safety-sensitive rules reject activation when that author is the current reviewer. The workflow activates the selected bundle, retires older active versions and writes personalization audit events. It does not author new rules or create database migrations.

## Phase 3 pilot quality

The same admin page includes a 30-day aggregate quality snapshot backed by:

- `GET /api/admin/personalization/quality?windowDays=30`
- opted-in household count
- recommendation counts by status and definition
- accepted and explicit-negative feedback totals
- bounded feedback-reason counts
- profile answer/skip/snooze totals

The endpoint requires ADMIN plus MFA and never returns household answers, comments, property/user identifiers or recommendation evidence. Fewer than 20 accepted/negative decision events is explicitly insufficient for review. Reaching 20 permits manual quality review only; online tuning remains disabled.

Pilot users can explain why a suggestion was not useful. `BAD_TIMING` is treated as the existing time-bounded dismissal; other irrelevance reasons use definition suppression. This distinction collects better evidence without introducing behavioral inference.
