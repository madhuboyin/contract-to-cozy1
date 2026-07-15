# Personalization internal-validation operations

Reviewed property personalization is available by default and does not create or run database migration scripts. Optional household-profile collection remains disabled until an owner explicitly enables it.

## Database ownership

The user applies `apps/backend/prisma/schema.prisma` to the greenfield database. After the schema is available, the only personalization catalog bootstrap is `apps/backend/prisma/seedPersonalization.sql`, run manually in pgAdmin.

The SQL inserts missing rows for five definitions, five rules, five versioned content records and five profile questions as `DRAFT`. Existing rows are left unchanged, so rerunning it cannot overwrite reviewed rules or copy. It does not create households, backfill properties, activate content or change lifecycle status.

## Review and activation

- Review the HVAC rule/copy before setting its definition, rule and content version to `ACTIVE`.
- The smoke/CO and dryer-vent rules are `SAFETY_SENSITIVE`. Each active rule must have different non-empty `authoredBy` and `reviewedBy` values or the evaluator treats it as inactive.
- Activate only the profile questions approved for optional collection. The UI
  requests the ranked `ACTIVE` question catalog; placement metadata was removed
  because there is only one profile surface.
- Materialization requires matching ACTIVE rule and ACTIVE `en-US` content. Missing/DRAFT content is a safe no-op even when the definition and rule are ACTIVE.

## Exposure and rollback

There is no personalization percentage enrollment or per-user rollout flag. Authenticated property users can read reviewed property guidance when matching definition, rule and content versions are `ACTIVE`. The database-backed personalization kill switch remains the immediate system-wide stop.

There is no nightly personalization sweep. Recommendations recompute for the selected property on read or explicit refresh. Engaging the kill switch stops evaluation without changing property or optional profile data.

Admins can also emergency-pause one definition through `POST /api/admin/personalization/definitions/:code/pause` and resume it through the matching `/resume` endpoint. These operations require authenticated ADMIN role plus MFA and write personalization audit events.

The read path treats controls as authoritative even when an `ACTIVE` recommendation row was materialized earlier. A global pause returns no guidance. A definition/rule that becomes inactive or invalid expires its stored recommendation before results are returned. Reset remains available during a pause.

## Optional household profile

Property guidance does not require consent. An owner may separately enable additional household-profile collection through:

- `POST /api/properties/:propertyId/personalization/profile/enable`
- consent version `personalization-household-profile-v1`
- `DELETE /api/properties/:propertyId/personalization/profile` to remove the optional profile

Profile questions and household fact nodes remain consent-gated. The context map shows property signals and property-only guidance without consent, then adds optional household facts after profile enablement. Removing the profile does not disable or delete property-only guidance or transparency.

## Phase 2 Maintenance placement

The first cross-module placement uses the same ACTIVE definition/rule/content gates:

- `GET /api/properties/:propertyId/personalization/modules/maintenance/recommendations?limit=3`
- `POST /api/properties/:propertyId/personalization/recommendations/:recommendationId/actions/convert-to-task`

The conversion body is `{ "idempotencyKey": "<uuid>" }`. It calls the existing maintenance task service with a recommendation-scoped action key, so retries return the existing task. No Phase 2 SQL or schema change is required for this slice.

Dashboard and Property Health use the same module endpoint with `dashboard` and `health` in place of `maintenance`. They render reviewed summaries and route action to Maintenance rather than copying rules.

## Catalog approval UI

Admins with MFA can open `/dashboard/admin/personalization`. The operational catalog lists only definitions backed by code-owned behavior. Database rows that exist only as future planning records appear in a collapsed, read-only **Plan-only records** section and cannot be activated, paused or resumed.

Implemented definitions missing a rule or `en-US` content version are marked **Incomplete** and direct the admin to the canonical catalog bootstrap. Complete DRAFT bundles are marked **Ready for review**. The author is selected from active ADMIN users instead of entering a raw user ID; safety-sensitive definitions exclude the signed-in reviewer from the author choices. Pause and resume controls are available only for active or paused definitions, never for DRAFT or plan-only records.

The workflow activates the selected bundle, retires older active versions and writes personalization audit events. It does not author new rules, delete legacy planning rows, alter the database schema or create database migrations.

## Phase 3 quality measurement

The same admin page includes a 30-day aggregate quality snapshot backed by:

- `GET /api/admin/personalization/quality?windowDays=30`
- distinct property count receiving default property guidance
- optional household profiles enabled, labeled separately from default feature availability
- recommendation counts by status and definition
- accepted and explicit-negative feedback totals
- bounded feedback-reason counts
- profile answer/skip/snooze totals

The endpoint requires ADMIN plus MFA and never returns household answers, comments, property/user identifiers or recommendation evidence. Fewer than 20 accepted/negative decision events is explicitly insufficient for review. Reaching 20 permits manual quality review only; online tuning remains disabled.

Future users can explain why a suggestion was not useful. `BAD_TIMING` is treated as the existing time-bounded dismissal; other irrelevance reasons use definition suppression. This distinction collects better evidence without introducing behavioral inference.

## Phase 4 context transparency

An owner can inspect current property personalization context without enabling the optional household profile through:

- `GET /api/properties/:propertyId/personalization/context-map`
- `/dashboard/personalization` under **What personalization knows**

The endpoint requires the owner-only `canViewSensitiveEvidence` capability. It
always returns semantic property, current-signal and active-recommendation
nodes. When an optional profile is enabled, it additionally returns the active
household/property link and bounded facts decoded from answered
`ProfileAnswer.answerJson` events. It does not return database IDs, owner IDs,
raw trait evidence, arbitrary nested JSON or profile data to
contributors/viewers.

This is a current-state transparency view, not the existing Home Digital Twin, a household timeline or a simulation engine. It reuses existing tables and requires no SQL, schema application, seed rerun, migration or backfill.
