-- Contract-to-Cozy admin capability bootstrap for pgAdmin
--
-- DATA SEED ONLY. This is not a schema migration.
-- Run this after `prisma db push` has created the "admin_capability_grants"
-- table (see AdminCapabilityGrant in prisma/schema.prisma).
--
-- WHY THIS EXISTS: Phase 0 of docs/functional/ADMIN_MODULE_FRD.md added
-- requireCapability() checks on top of the existing ADMIN role check for
-- every admin route. AdminCapabilityGrant starts out empty on any fresh
-- `db push`, and requireCapability fails CLOSED — so without this script,
-- the moment that table exists, every ADMIN-role user is locked out of every
-- admin workspace they could reach yesterday.
--
-- This grants every registered capability (apps/backend/src/config/
-- adminCapabilities.ts is the source of truth for this list — keep the two
-- in sync if that file changes) to every existing ADMIN-role user.
--
-- SQL equivalent of apps/backend/scripts/adminCapabilityBootstrap.ts, for
-- when you'd rather run this in pgAdmin than via `npx ts-node`. Same
-- behavior, same safety properties:
--   - Only ever touches users with role = 'ADMIN'.
--   - Idempotent: skips any capability a user already actively holds
--     (WHERE NOT EXISTS ... revokedAt IS NULL), so re-running is harmless.
--   - Never revokes or overwrites an existing grant.
--   - grantedBy / audit actor is recorded as the literal string
--     'SYSTEM_BOOTSTRAP' — that column is a plain audit-trail string, not a
--     foreign key, so this does not require or create a real user row.
--   - Not meant to be a routine access-management tool going forward — use
--     POST /api/admin/capabilities/users/:userId/grant (gated by
--     ADMIN_ROLE_MANAGE) for day-to-day grants/revokes after this first run.

BEGIN;

WITH admins AS (
  SELECT "id", "email" FROM "users" WHERE "role" = 'ADMIN'::"UserRole"
),
capabilities(capability) AS (
  VALUES
    ('ADMIN_DASHBOARD_VIEW'),
    ('ADMIN_ROLE_MANAGE'),
    ('USER_VIEW'),
    ('USER_STATUS_CHANGE'),
    ('USER_SESSION_REVOKE'),
    ('PROPERTY_SUPPORT_VIEW'),
    ('SUPPORT_CASE_MANAGE'),
    ('PRIVACY_REQUEST_MANAGE'),
    ('PROVIDER_VIEW'),
    ('PROVIDER_COMPLIANCE_REVIEW'),
    ('PROVIDER_SUSPEND'),
    ('BOOKING_VIEW'),
    ('BOOKING_OPERATE'),
    ('PAYMENT_VIEW'),
    ('REFUND_REQUEST'),
    ('REFUND_APPROVE'),
    ('DISPUTE_MANAGE'),
    ('FINANCING_CONFIG'),
    ('REVIEW_MODERATE'),
    ('SAFETY_INCIDENT_MANAGE'),
    ('CONTENT_AUTHOR'),
    ('CONTENT_REVIEW'),
    ('CONTENT_PUBLISH'),
    ('CATALOG_AUTHOR'),
    ('CATALOG_REVIEW'),
    ('CATALOG_PUBLISH'),
    ('PERSONALIZATION_OPERATE'),
    ('WORKER_JOB_VIEW'),
    ('WORKER_JOB_TRIGGER'),
    ('SHARED_DATA_OPERATE'),
    ('INTEGRATION_MANAGE'),
    ('RELEASE_GATE_VIEW'),
    ('SYSTEM_SETTINGS_MANAGE'),
    ('ANALYTICS_VIEW'),
    ('AUDIT_VIEW'),
    ('BREAK_GLASS')
),
to_grant AS (
  SELECT a."id" AS "userId", c."capability"
  FROM admins a
  CROSS JOIN capabilities c
  WHERE NOT EXISTS (
    SELECT 1 FROM "admin_capability_grants" g
    WHERE g."userId" = a."id"
      AND g."capability" = c."capability"
      AND g."revokedAt" IS NULL
  )
),
inserted_grants AS (
  INSERT INTO "admin_capability_grants"
    ("id", "userId", "capability", "bundleName", "reason", "grantedBy", "grantedAt")
  SELECT
    gen_random_uuid()::text,
    "userId",
    "capability",
    'BOOTSTRAP',
    'Initial admin capability bootstrap — see prisma/admin-capability-bootstrap.pgadmin.sql',
    'SYSTEM_BOOTSTRAP',
    now()
  FROM to_grant
  RETURNING "id", "userId", "capability"
)
INSERT INTO "audit_logs"
  ("id", "userId", "action", "entityType", "entityId", "metadata", "createdAt")
SELECT
  gen_random_uuid()::text,
  'SYSTEM_BOOTSTRAP',
  'GRANT_CAPABILITY',
  'ADMIN_CAPABILITY_GRANT',
  ig."id",
  jsonb_build_object(
    'capability', ig."capability",
    'reason', 'bootstrap',
    'relatedRefs', jsonb_build_object('targetUserId', ig."userId")
  ),
  now()
FROM inserted_grants ig;

COMMIT;

-- Verification summary returned by pgAdmin: active capability count per
-- ADMIN-role user after this run (36 means fully bootstrapped).
SELECT
  u."email",
  u."id" AS "userId",
  count(g."id") AS "activeCapabilityCount"
FROM "users" u
LEFT JOIN "admin_capability_grants" g
  ON g."userId" = u."id" AND g."revokedAt" IS NULL
WHERE u."role" = 'ADMIN'::"UserRole"
GROUP BY u."email", u."id"
ORDER BY u."email";
