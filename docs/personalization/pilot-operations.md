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
