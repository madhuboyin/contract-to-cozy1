-- Clear legacy Home Buyer checklist and task data before applying the
-- property-scoped Phase 5 Prisma schema.
--
-- DATA CLEANUP ONLY: this is not a schema migration. Run it manually in
-- pgAdmin against the intended pilot/test database, then run:
--
--   npx prisma db push
--
-- This permanently deletes every row in home_buyer_tasks and
-- home_buyer_checklists. It preserves bookings by removing their optional
-- link to a Home Buyer task before deleting the task rows. No other product
-- data is deleted.
--
-- The script is transactional and idempotent. If any unexpected foreign-key
-- dependency prevents deletion, PostgreSQL rolls the transaction back.

BEGIN;

-- Preserve booking records while detaching references to tasks being removed.
UPDATE "bookings"
SET "homeBuyerTaskId" = NULL
WHERE "homeBuyerTaskId" IS NOT NULL;

-- Delete children before parents without using TRUNCATE ... CASCADE.
DELETE FROM "home_buyer_tasks";
DELETE FROM "home_buyer_checklists";

COMMIT;

-- Verification: both values should be zero.
SELECT
  (SELECT count(*) FROM "home_buyer_tasks") AS "remainingHomeBuyerTasks",
  (SELECT count(*) FROM "home_buyer_checklists") AS "remainingHomeBuyerChecklists";
