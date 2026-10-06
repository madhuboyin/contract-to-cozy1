-- Contract-to-Cozy: seasonal template catalog clean-up, for pgAdmin.
--
-- DATA CLEAN-UP ONLY. Not a schema migration; run after `prisma db push` and after reference-data-bootstrap.pgadmin.sql (or
-- seasonalTaskTemplates.pgadmin.seed.sql), which carry the canonical templates. Idempotent: safe to run again.
--
-- Why: an older reference-data bootstrap created six differently-keyed twins of templates in the canonical catalog
-- (src/data/seasonalTaskTemplates.json), so a database seeded from both generated near-duplicate checklist tasks. WINTER_SMOKE_CO_TEST had no
-- canonical counterpart and is now a canonical template (it keeps its key). The other five are retired:
--
--   FALL_WINTERIZE_OUTDOOR_FAUCETS   -> FALL_DRAIN_OUTDOOR_FAUCETS   DIRECT: same task, same climates, same priority, no asset gate.
--   SUMMER_HVAC_FILTER_CHECK         -> SUMMER_AC_FILTER_CHANGE      CONDITIONAL: the canonical one needs a cooling system, skips VERY_COLD, is CRITICAL.
--   FALL_HEATING_SYSTEM_SERVICE      -> FALL_FURNACE_INSPECTION      CONDITIONAL: the canonical one needs a furnace on record.
--   SUMMER_EXTERIOR_DRAINAGE_CHECK   (no counterpart)                retired only.
--   WINTER_FREEZE_READINESS          (no counterpart)                retired only.
--
-- A CONDITIONAL mapping depends on Property Context, which SQL cannot evaluate. So for those the script never moves an item onto the
-- canonical template. It only dismisses an open twin item when the same checklist ALREADY has the canonical item (the generator only
-- adds it when it applies). Otherwise the item stays on the retired template and is reported for review.
--
-- What it does, in order (nothing is deleted; completed history is never touched):
--   1. Retires the five twin templates (rows stay: checklist items reference them).
--   2. For each OPEN twin item (RECOMMENDED / ADDED / SNOOZED) of a mapped twin:
--        - the checklist already has the canonical item  -> the twin item becomes DISMISSED (dismissed_at set) and its linked maintenance
--          task, if still PENDING, becomes CANCELLED -- exactly what SeasonalChecklistService.dismissTask does. CRITICAL twin items
--          cannot be dismissed in the UI; this is the one place they can. A task already IN_PROGRESS / NEEDS_REVIEW / COMPLETED is kept
--          and the item is reported instead.
--        - DIRECT mapping, no canonical item, canonical applies to the checklist's climate -> the item moves onto the canonical template
--          (template id, task key, title, description) and an open linked task gets the same title and description, so the homeowner
--          keeps one task with current wording. Priority, due date and service category are identical for the faucet pair.
--        - anything else -> kept as is and reported.
--   3. Recomputes total_tasks / tasks_added and the COMPLETED / IN_PROGRESS status of every checklist it touched.
--   4. Property exclusions (property_climate_settings.excluded_task_keys): a twin key is supplemented with its canonical key, so a task a
--      property deliberately excluded does not reappear. Twin keys stay in the list (harmless).
--
-- NOT done here: a cancelled task's Home Operations work item is not closed (that is a state-machine transition the application owns); it
-- is listed so it can be closed from the app. Repointed tasks' work items pick up the new wording on the task's next sync.
--
-- Run the whole file. The final result is the report; every count is also available per row in the _sc_* temp tables for this session.

BEGIN;

DO $$
BEGIN
  IF (SELECT count(*) FROM "seasonal_task_templates"
       WHERE "task_key" IN ('FALL_DRAIN_OUTDOOR_FAUCETS', 'FALL_FURNACE_INSPECTION', 'SUMMER_AC_FILTER_CHANGE', 'WINTER_SMOKE_CO_TEST')
         AND "is_active") < 4 THEN
    RAISE EXCEPTION 'Canonical seasonal templates are missing or inactive. Run reference-data-bootstrap.pgadmin.sql first.';
  END IF;
END $$;

DROP TABLE IF EXISTS _sc_map, _sc_items, _sc_cancelled, _sc_exclusions, _sc_retired;

-- Twin -> canonical mapping. A NULL canonical key means "retire only".
CREATE TEMP TABLE _sc_map ("retiredKey" text, "canonicalKey" text, "kind" text);
INSERT INTO _sc_map VALUES
  ('FALL_WINTERIZE_OUTDOOR_FAUCETS', 'FALL_DRAIN_OUTDOOR_FAUCETS', 'DIRECT'),
  ('SUMMER_HVAC_FILTER_CHECK',       'SUMMER_AC_FILTER_CHANGE',    'CONDITIONAL'),
  ('FALL_HEATING_SYSTEM_SERVICE',    'FALL_FURNACE_INSPECTION',    'CONDITIONAL'),
  ('SUMMER_EXTERIOR_DRAINAGE_CHECK', NULL,                         'RETIRE_ONLY'),
  ('WINTER_FREEZE_READINESS',        NULL,                         'RETIRE_ONLY');

-- 1. Retire the twins.
CREATE TEMP TABLE _sc_retired AS
SELECT "task_key" FROM "seasonal_task_templates"
 WHERE "task_key" IN (SELECT "retiredKey" FROM _sc_map) AND "is_active";
UPDATE "seasonal_task_templates"
   SET "is_active" = false, "updated_at" = now()
 WHERE "task_key" IN (SELECT "retiredKey" FROM _sc_map) AND "is_active";

-- 2. Classify every open item that still sits on a mapped twin.
CREATE TEMP TABLE _sc_items AS
SELECT i."id" AS item_id, i."seasonal_checklist_id" AS checklist_id, i."property_id", m."retiredKey", m."canonicalKey", m."kind",
       i."status"::text AS item_status, t."id" AS task_id, t."status"::text AS task_status,
       ci."id" AS canonical_item_id, ct."id" AS canonical_template_id,
       CASE
         WHEN t."status" = 'COMPLETED'                                              THEN 'KEEP_TASK_COMPLETED'
         WHEN ci."id" IS NOT NULL AND t."status" IN ('IN_PROGRESS', 'NEEDS_REVIEW') THEN 'KEEP_TASK_IN_PROGRESS'
         WHEN ci."id" IS NOT NULL                                                   THEN 'DISMISS_DUPLICATE'
         WHEN m."kind" = 'CONDITIONAL'                                              THEN 'KEEP_CANONICAL_NOT_VERIFIED'
         WHEN ct."id" IS NULL OR NOT ct."is_active"
              OR NOT (c."climate_region" = ANY (ct."climate_regions"))              THEN 'KEEP_CANONICAL_NOT_FOR_CLIMATE'
         ELSE 'REPOINT'
       END AS action
  FROM "seasonal_checklist_items" i
  JOIN "seasonal_task_templates" rt ON rt."id" = i."seasonal_task_template_id"
  JOIN _sc_map m ON m."retiredKey" = rt."task_key" AND m."canonicalKey" IS NOT NULL
  JOIN "seasonal_checklists" c ON c."id" = i."seasonal_checklist_id"
  LEFT JOIN "seasonal_task_templates" ct ON ct."task_key" = m."canonicalKey"
  LEFT JOIN "property_maintenance_tasks" t ON t."seasonalChecklistItemId" = i."id"
  LEFT JOIN "seasonal_checklist_items" ci
         ON ci."seasonal_checklist_id" = i."seasonal_checklist_id" AND ci."seasonal_task_template_id" = ct."id"
 WHERE i."status" IN ('RECOMMENDED', 'ADDED', 'SNOOZED');

-- 2a. Duplicates: cancel a still-pending linked task, then dismiss the item.
CREATE TEMP TABLE _sc_cancelled (task_id text, item_id text, property_id text);
WITH done AS (
  UPDATE "property_maintenance_tasks" t
     SET "status" = 'CANCELLED', "updatedAt" = now()
    FROM _sc_items x
   WHERE x.action = 'DISMISS_DUPLICATE' AND x.task_id = t."id" AND t."status" = 'PENDING'
  RETURNING t."id" AS task_id, t."seasonalChecklistItemId" AS item_id, t."propertyId" AS property_id
)
INSERT INTO _sc_cancelled SELECT * FROM done;

UPDATE "seasonal_checklist_items" i
   SET "status" = 'DISMISSED', "dismissed_at" = now(), "updated_at" = now()
  FROM _sc_items x
 WHERE x.action = 'DISMISS_DUPLICATE' AND x.item_id = i."id";

-- 2b. Direct mapping with no canonical item: move the item (and an open task's wording) onto the canonical template.
UPDATE "seasonal_checklist_items" i
   SET "seasonal_task_template_id" = ct."id", "task_key" = ct."task_key", "title" = ct."title",
       "description" = ct."description", "updated_at" = now()
  FROM _sc_items x
  JOIN "seasonal_task_templates" ct ON ct."id" = x.canonical_template_id
 WHERE x.action = 'REPOINT' AND x.item_id = i."id";

UPDATE "property_maintenance_tasks" t
   SET "title" = ct."title", "description" = ct."description", "updatedAt" = now()
  FROM _sc_items x
  JOIN "seasonal_task_templates" ct ON ct."id" = x.canonical_template_id
 WHERE x.action = 'REPOINT' AND x.task_id = t."id" AND t."status" IN ('PENDING', 'IN_PROGRESS', 'NEEDS_REVIEW');

-- 3. Recompute counters and COMPLETED / IN_PROGRESS status for every touched checklist (the generator's and syncSeasonalChecklistStatus's rules).
UPDATE "seasonal_checklists" c
   SET "total_tasks" = n.total, "tasks_added" = n.added, "updated_at" = now()
  FROM (
    SELECT ci."seasonal_checklist_id" AS id, count(*)::int AS total, count(t."id")::int AS added
      FROM "seasonal_checklist_items" ci
      LEFT JOIN "property_maintenance_tasks" t ON t."seasonalChecklistItemId" = ci."id"
     WHERE ci."seasonal_checklist_id" IN (SELECT checklist_id FROM _sc_items WHERE action IN ('DISMISS_DUPLICATE', 'REPOINT'))
     GROUP BY ci."seasonal_checklist_id"
  ) n
 WHERE c."id" = n.id AND (c."total_tasks", c."tasks_added") IS DISTINCT FROM (n.total, n.added);

WITH progress AS (
  SELECT ci."seasonal_checklist_id" AS id,
         count(*) FILTER (WHERE ci."status" <> 'DISMISSED') AS active,
         count(*) FILTER (WHERE ci."status" = 'COMPLETED')  AS completed
    FROM "seasonal_checklist_items" ci
   WHERE ci."seasonal_checklist_id" IN (SELECT checklist_id FROM _sc_items WHERE action IN ('DISMISS_DUPLICATE', 'REPOINT'))
   GROUP BY ci."seasonal_checklist_id"
)
UPDATE "seasonal_checklists" c
   SET "status" = CASE WHEN p.active > 0 AND p.completed = p.active THEN 'COMPLETED' ELSE 'IN_PROGRESS' END::"SeasonalChecklistStatus",
       "updated_at" = now()
  FROM progress p
 WHERE c."id" = p.id AND c."status" <> 'DISMISSED'
   AND (  (p.active > 0 AND p.completed = p.active AND c."status" <> 'COMPLETED')
       OR (NOT (p.active > 0 AND p.completed = p.active) AND c."status" = 'COMPLETED'));

-- 4. Exclusions: supplement a retired twin key with its canonical key (mapped twins only).
CREATE TEMP TABLE _sc_exclusions (property_id text, added_keys text[]);
WITH wanted AS (
  SELECT s."property_id", array_agg(DISTINCT m."canonicalKey") AS add_keys
    FROM "property_climate_settings" s
    JOIN _sc_map m ON m."canonicalKey" IS NOT NULL AND m."retiredKey" = ANY (s."excluded_task_keys")
   WHERE NOT (m."canonicalKey" = ANY (s."excluded_task_keys"))
   GROUP BY s."property_id"
), done AS (
  UPDATE "property_climate_settings" s
     SET "excluded_task_keys" = s."excluded_task_keys" || w.add_keys, "updated_at" = now()
    FROM wanted w
   WHERE s."property_id" = w."property_id"
  RETURNING s."property_id", w.add_keys
)
INSERT INTO _sc_exclusions SELECT * FROM done;

COMMIT;

-- Report returned by pgAdmin.
SELECT 'retired templates (this run)' AS check_name, count(*)::text AS value FROM _sc_retired
UNION ALL SELECT 'active templates with a retired key (expect 0)', count(*)::text FROM "seasonal_task_templates"
  WHERE "task_key" IN (SELECT "retiredKey" FROM _sc_map) AND "is_active"
UNION ALL SELECT 'items moved onto the canonical template', count(*)::text FROM _sc_items WHERE action = 'REPOINT'
UNION ALL SELECT 'duplicate items dismissed', count(*)::text FROM _sc_items WHERE action = 'DISMISS_DUPLICATE'
UNION ALL SELECT 'maintenance tasks cancelled (close their work items from the app)', count(*)::text FROM _sc_cancelled
UNION ALL SELECT 'properties with exclusions migrated', count(*)::text FROM _sc_exclusions
UNION ALL SELECT 'kept: canonical template inapplicable to the climate', count(*)::text FROM _sc_items WHERE action = 'KEEP_CANONICAL_NOT_FOR_CLIMATE'
UNION ALL SELECT 'kept: canonical needs Property Context to judge (review)', count(*)::text FROM _sc_items WHERE action = 'KEEP_CANONICAL_NOT_VERIFIED'
UNION ALL SELECT 'kept: duplicate but task in progress / needs review', count(*)::text FROM _sc_items WHERE action = 'KEEP_TASK_IN_PROGRESS'
UNION ALL SELECT 'kept: task already completed', count(*)::text FROM _sc_items WHERE action = 'KEEP_TASK_COMPLETED'
UNION ALL SELECT 'open items still on a retired twin, no canonical item (review by hand)', count(*)::text
  FROM "seasonal_checklist_items" i JOIN "seasonal_task_templates" t ON t."id" = i."seasonal_task_template_id"
 WHERE t."task_key" IN (SELECT "retiredKey" FROM _sc_map) AND i."status" IN ('RECOMMENDED', 'ADDED', 'SNOOZED')
UNION ALL SELECT 'remaining duplicates (open twin item next to its canonical item; expect 0 except in-progress)', count(*)::text
  FROM "seasonal_checklist_items" i
  JOIN "seasonal_task_templates" t ON t."id" = i."seasonal_task_template_id"
  JOIN _sc_map m ON m."retiredKey" = t."task_key" AND m."canonicalKey" IS NOT NULL
  JOIN "seasonal_task_templates" ct ON ct."task_key" = m."canonicalKey"
 WHERE i."status" IN ('RECOMMENDED', 'ADDED', 'SNOOZED')
   AND EXISTS (SELECT 1 FROM "seasonal_checklist_items" o WHERE o."seasonal_checklist_id" = i."seasonal_checklist_id" AND o."seasonal_task_template_id" = ct."id")
UNION ALL SELECT 'excluded keys still naming a retired twin with no canonical key (unresolved)', count(*)::text
  FROM "property_climate_settings" s
 WHERE s."excluded_task_keys" && ARRAY(SELECT "retiredKey" FROM _sc_map WHERE "canonicalKey" IS NULL);
