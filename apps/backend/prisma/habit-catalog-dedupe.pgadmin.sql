-- Contract-to-Cozy: Home Habit Coach duplicate clean-up, for pgAdmin.
--
-- DATA CLEAN-UP ONLY. Not a schema migration; run after `prisma db push`. Idempotent: safe to run again.
--
-- Why: two template catalogs with differently-keyed twins were seeded into the same database (the TypeScript seed and
-- reference-data-bootstrap.pgadmin.sql), so the generator -- which de-duplicates by template id only -- created the
-- same habit twice ("Test Smoke and CO Detectors" next to "Test Smoke Detectors" / "Test Carbon Monoxide Detectors",
-- "Monthly Home Walk-Through" next to "Do a Monthly Home Walk-Through", two gutter inspections).
--
-- What it does, in order (nothing is deleted; every change is a status change with an audit row):
--   1. Retires the three twin templates that only the older bootstrap carried.
--   2. For each property, a live habit from a retired twin is
--        - dismissed if the property already has a live habit from the canonical template(s) for the same concept, or
--        - moved onto the canonical template if it does not (so the homeowner keeps it, once).
--      Habits already adopted into the maintenance routine (linked to a task) are never touched; they are reported at the end.
--   3. If a property still has the same canonical template live twice (a concurrent generate), keeps the oldest and dismisses the rest.
--
-- Run the whole file. The final SELECTs are the verification summary; "remaining_duplicates" should be 0.

BEGIN;

-- Twin -> canonical mapping. A twin may stand for more than one canonical template (smoke + CO).
CREATE TEMP TABLE _habit_twin_map ("retiredKey" text, "canonicalKey" text, "isMoveTarget" boolean) ON COMMIT DROP;
INSERT INTO _habit_twin_map VALUES
  ('safety_smoke_co_test',             'safety_smoke_detector_test', true),
  ('safety_smoke_co_test',             'safety_co_detector_test',    false),
  ('exterior_gutter_visual_check',     'exterior_gutter_inspection', true),
  ('general_monthly_home_walkthrough', 'general_monthly_walkthrough', true);

-- 1. Retire the twins (rows stay: property habits reference them).
UPDATE "habit_templates"
   SET "isActive" = false, "updatedAt" = now()
 WHERE "key" IN (SELECT DISTINCT "retiredKey" FROM _habit_twin_map)
   AND "isActive" = true;

-- 2a. Dismiss a live twin habit when the property already has a live habit from a canonical template for that concept.
CREATE TEMP TABLE _habit_dismissed (id text PRIMARY KEY, "propertyId" text) ON COMMIT DROP;
WITH twin AS (
  SELECT ph."id", ph."propertyId", m."retiredKey"
    FROM "property_habits" ph
    JOIN "habit_templates" t ON t."id" = ph."habitTemplateId"
    JOIN (SELECT DISTINCT "retiredKey" FROM _habit_twin_map) m ON m."retiredKey" = t."key"
   WHERE ph."status" IN ('ACTIVE', 'SNOOZED')
     AND ph."linkedMaintenanceTaskId" IS NULL
), dup AS (
  SELECT twin."id", twin."propertyId"
    FROM twin
   WHERE EXISTS (
     SELECT 1
       FROM "property_habits" other
       JOIN "habit_templates" ot ON ot."id" = other."habitTemplateId"
       JOIN _habit_twin_map m ON m."canonicalKey" = ot."key" AND m."retiredKey" = twin."retiredKey"
      WHERE other."propertyId" = twin."propertyId"
        AND other."status" IN ('ACTIVE', 'SNOOZED')
   )
), done AS (
  UPDATE "property_habits" ph
     SET "status" = 'DISMISSED', "lastActionAt" = now(), "snoozedUntil" = NULL, "updatedAt" = now()
    FROM dup
   WHERE ph."id" = dup."id"
  RETURNING ph."id", ph."propertyId"
)
INSERT INTO _habit_dismissed SELECT "id", "propertyId" FROM done;

-- 2b. A live twin habit with no canonical counterpart moves onto the canonical template, so the homeowner keeps exactly one.
UPDATE "property_habits" ph
   SET "habitTemplateId" = canonical."id", "updatedAt" = now()
  FROM "habit_templates" retired
  JOIN _habit_twin_map m ON m."retiredKey" = retired."key" AND m."isMoveTarget"
  JOIN "habit_templates" canonical ON canonical."key" = m."canonicalKey" AND canonical."isActive"
 WHERE ph."habitTemplateId" = retired."id"
   AND ph."status" IN ('ACTIVE', 'SNOOZED')
   AND ph."linkedMaintenanceTaskId" IS NULL;

-- 3. The same canonical template live twice for one property: keep the oldest, dismiss the rest.
WITH ranked AS (
  SELECT ph."id", ph."propertyId",
         row_number() OVER (PARTITION BY ph."propertyId", ph."habitTemplateId" ORDER BY ph."createdAt", ph."id") AS rn
    FROM "property_habits" ph
   WHERE ph."status" IN ('ACTIVE', 'SNOOZED')
     AND ph."linkedMaintenanceTaskId" IS NULL
), extra AS (
  SELECT "id", "propertyId" FROM ranked WHERE rn > 1
), done AS (
  UPDATE "property_habits" ph
     SET "status" = 'DISMISSED', "lastActionAt" = now(), "snoozedUntil" = NULL, "updatedAt" = now()
    FROM extra
   WHERE ph."id" = extra."id"
  RETURNING ph."id", ph."propertyId"
)
INSERT INTO _habit_dismissed SELECT "id", "propertyId" FROM done ON CONFLICT DO NOTHING;

-- Audit trail: one DISMISSED action per habit dismissed above, with a note saying why.
INSERT INTO "property_habit_actions" ("id", "propertyHabitId", "propertyId", "userId", "actionType", "note", "createdAt")
SELECT gen_random_uuid()::text, d."id", d."propertyId", NULL, 'DISMISSED'::"HabitActionType",
       'Duplicate habit removed by the habit catalog clean-up.', now()
  FROM _habit_dismissed d;

COMMIT;

-- Verification summary returned by pgAdmin.
SELECT 'habits dismissed as duplicates (in the last 5 minutes)' AS check_name, count(*) AS value FROM (SELECT 1 FROM "property_habit_actions" WHERE "note" = 'Duplicate habit removed by the habit catalog clean-up.' AND "createdAt" > now() - interval '5 minutes') x
UNION ALL
SELECT 'active templates', count(*) FROM "habit_templates" WHERE "isActive"
UNION ALL
SELECT 'remaining_duplicates (same template live twice, not adopted)', count(*) FROM (
  SELECT "propertyId", "habitTemplateId" FROM "property_habits"
   WHERE "status" IN ('ACTIVE', 'SNOOZED') AND "linkedMaintenanceTaskId" IS NULL
   GROUP BY "propertyId", "habitTemplateId" HAVING count(*) > 1
) y
UNION ALL
SELECT 'live habits still on a retired twin (adopted into routines; review by hand)', count(*)
  FROM "property_habits" ph JOIN "habit_templates" t ON t."id" = ph."habitTemplateId"
 WHERE t."isActive" = false AND ph."status" IN ('ACTIVE', 'SNOOZED');

