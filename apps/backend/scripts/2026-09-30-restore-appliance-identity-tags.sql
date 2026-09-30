-- One-off data repair, NOT a Prisma migration file. Run it in pgAdmin's Query Tool.
-- SQL twin of scripts/restore-appliance-identity-tags.ts (same rules, FRD v1.174/v1.175).
--
-- WHAT IT FIXES
-- A major appliance is classified in two places: the canonical source hash `property_appliance::<TYPE>` (the durable
-- record) and two derived tags, `PROPERTY_APPLIANCE` and `APPLIANCE_TYPE:<TYPE>`. Until the fix in
-- InventoryService.updateItem, every save from the Inventory drawer sent `tags: []`, which overwrote the tags while
-- the hash survived. Anything that reads the tag (the risk assessment's appliance-type inference is one) then falls
-- back to guessing from the item name.
--
-- WHAT IT DOES (and never does)
--   * Only touches rows with category = APPLIANCE and a canonical hash `property_appliance::<TYPE>` (non-empty TYPE).
--   * Only ADDS the two tags when missing. It never removes a tag and never changes the name, hash, category, room or
--     any other column except "updatedAt".
--   * A row that already carries an `APPLIANCE_TYPE:` tag naming a DIFFERENT type than its hash is a CONFLICT: it is
--     listed in section 1c and is NOT modified. Which of the two is right is the homeowner's decision.
--   * Idempotent: running it again finds nothing left to change.
--
-- HOW TO RUN
--   NOTE: pgAdmin's Query Tool shows only the LAST statement's result grid when several run together. Select ONE
--   query at a time (highlight it, press F5) to see its result.
--   1. Run the three queries in SECTION 1, one at a time. They only read: the summary counts, the rows that would
--      change, and the conflicts.
--   2. Run SECTION 2 (highlight everything from BEGIN through ROLLBACK, F5). As shipped it ends in ROLLBACK, so it
--      applies the change, shows how many appliances would still be missing a tag, and undoes it: a dry run of the
--      write. (The rows it changes are the ones query 1b listed; the RETURNING grid is replaced by the final count.)
--   3. When the output is what you expect, change the last line of SECTION 2 from ROLLBACK to COMMIT and run it again.
--   4. Run SECTION 3 to verify. Only the conflicts listed in 1c should remain.
--
-- KNOWN LIMITS OF DOING THIS IN SQL (the TypeScript script does not have them)
--   * Raw SQL does not emit the application's property-change signal, so derived data (risk assessment, coverage
--     analyses, the home projection) is not recomputed by this script. It picks the corrected tags up the next time
--     it is recomputed on its own; the TypeScript script (--apply) emits that signal per item.
--   * "updatedAt" is set to now(), as Prisma does on any update. That also makes an Ask confirmation that was open on
--     an affected item report that the item changed, which is the correct behaviour.
--   * Not run by the author against any database. Read the SECTION 1 output before trusting SECTION 2.
--
-- Constants used below: 'property_appliance::' is 20 characters (hence left(...,20) and substring(... from 21)),
-- and 'APPLIANCE_TYPE:' is 15 characters. left() is used instead of LIKE because '_' is a LIKE wildcard.

-- =====================================================================================================================
-- SECTION 1 — READ ONLY
-- =====================================================================================================================

-- 1a. Summary
WITH classified AS (
  SELECT
    i.id,
    i."propertyId",
    i.name,
    substring(i."sourceHash" from 21) AS type,
    COALESCE(i.tags, ARRAY[]::text[]) AS tags
  FROM inventory_items i
  WHERE i.category = 'APPLIANCE'
    AND left(i."sourceHash", 20) = 'property_appliance::'
    AND length(i."sourceHash") > 20
), graded AS (
  SELECT
    c.*,
    EXISTS (
      SELECT 1 FROM unnest(c.tags) t
      WHERE left(t, 15) = 'APPLIANCE_TYPE:' AND t <> 'APPLIANCE_TYPE:' || c.type
    ) AS has_conflict,
    ('PROPERTY_APPLIANCE' = ANY(c.tags)) AS has_marker,
    (('APPLIANCE_TYPE:' || c.type) = ANY(c.tags)) AS has_type_tag
  FROM classified c
)
SELECT
  count(*)                                                                                      AS classified_appliances,
  count(*) FILTER (WHERE NOT has_conflict AND has_marker AND has_type_tag)                      AS already_correct,
  count(*) FILTER (WHERE NOT has_conflict AND NOT (has_marker AND has_type_tag))                AS to_restore,
  count(DISTINCT "propertyId") FILTER (WHERE NOT has_conflict AND NOT (has_marker AND has_type_tag)) AS properties_affected,
  count(*) FILTER (WHERE has_conflict)                                                          AS conflicts_left_alone
FROM graded;

-- 1b. The rows that section 2 would change
SELECT
  i.id,
  i."propertyId",
  i.name,
  substring(i."sourceHash" from 21) AS hash_type,
  COALESCE(i.tags, ARRAY[]::text[]) AS current_tags,
  CASE WHEN 'PROPERTY_APPLIANCE' = ANY(COALESCE(i.tags, ARRAY[]::text[])) THEN NULL ELSE 'PROPERTY_APPLIANCE' END AS will_add_marker,
  CASE WHEN ('APPLIANCE_TYPE:' || substring(i."sourceHash" from 21)) = ANY(COALESCE(i.tags, ARRAY[]::text[])) THEN NULL
       ELSE 'APPLIANCE_TYPE:' || substring(i."sourceHash" from 21) END AS will_add_type_tag
FROM inventory_items i
WHERE i.category = 'APPLIANCE'
  AND left(i."sourceHash", 20) = 'property_appliance::'
  AND length(i."sourceHash") > 20
  AND NOT (
    'PROPERTY_APPLIANCE' = ANY(COALESCE(i.tags, ARRAY[]::text[]))
    AND ('APPLIANCE_TYPE:' || substring(i."sourceHash" from 21)) = ANY(COALESCE(i.tags, ARRAY[]::text[]))
  )
  AND NOT EXISTS (
    SELECT 1 FROM unnest(COALESCE(i.tags, ARRAY[]::text[])) t
    WHERE left(t, 15) = 'APPLIANCE_TYPE:' AND t <> 'APPLIANCE_TYPE:' || substring(i."sourceHash" from 21)
  )
ORDER BY i."propertyId", i.id;

-- 1c. CONFLICTS: a type tag that names a different type than the canonical hash. Not modified by section 2.
SELECT
  i.id,
  i."propertyId",
  i.name,
  substring(i."sourceHash" from 21) AS hash_type,
  ARRAY(
    SELECT t FROM unnest(COALESCE(i.tags, ARRAY[]::text[])) t
    WHERE left(t, 15) = 'APPLIANCE_TYPE:' AND t <> 'APPLIANCE_TYPE:' || substring(i."sourceHash" from 21)
  ) AS conflicting_type_tags
FROM inventory_items i
WHERE i.category = 'APPLIANCE'
  AND left(i."sourceHash", 20) = 'property_appliance::'
  AND length(i."sourceHash") > 20
  AND EXISTS (
    SELECT 1 FROM unnest(COALESCE(i.tags, ARRAY[]::text[])) t
    WHERE left(t, 15) = 'APPLIANCE_TYPE:' AND t <> 'APPLIANCE_TYPE:' || substring(i."sourceHash" from 21)
  )
ORDER BY i."propertyId", i.id;

-- =====================================================================================================================
-- SECTION 2 — THE WRITE (ends in ROLLBACK: change the last line to COMMIT once the output is what you expect)
-- =====================================================================================================================

BEGIN;

UPDATE inventory_items i
SET
  tags = COALESCE(i.tags, ARRAY[]::text[])
    || CASE WHEN 'PROPERTY_APPLIANCE' = ANY(COALESCE(i.tags, ARRAY[]::text[]))
            THEN ARRAY[]::text[] ELSE ARRAY['PROPERTY_APPLIANCE'] END
    || CASE WHEN ('APPLIANCE_TYPE:' || substring(i."sourceHash" from 21)) = ANY(COALESCE(i.tags, ARRAY[]::text[]))
            THEN ARRAY[]::text[] ELSE ARRAY['APPLIANCE_TYPE:' || substring(i."sourceHash" from 21)] END,
  "updatedAt" = now()
WHERE i.category = 'APPLIANCE'
  AND left(i."sourceHash", 20) = 'property_appliance::'
  AND length(i."sourceHash") > 20
  AND NOT (
    'PROPERTY_APPLIANCE' = ANY(COALESCE(i.tags, ARRAY[]::text[]))
    AND ('APPLIANCE_TYPE:' || substring(i."sourceHash" from 21)) = ANY(COALESCE(i.tags, ARRAY[]::text[]))
  )
  AND NOT EXISTS (
    SELECT 1 FROM unnest(COALESCE(i.tags, ARRAY[]::text[])) t
    WHERE left(t, 15) = 'APPLIANCE_TYPE:' AND t <> 'APPLIANCE_TYPE:' || substring(i."sourceHash" from 21)
  )
RETURNING i.id, i."propertyId", i.name, substring(i."sourceHash" from 21) AS hash_type, i.tags AS tags_after;

-- Inside the transaction, before it ends: how many appliances are still missing a tag (expect only the conflicts).
SELECT count(*) AS still_missing_including_conflicts
FROM inventory_items i
WHERE i.category = 'APPLIANCE'
  AND left(i."sourceHash", 20) = 'property_appliance::'
  AND length(i."sourceHash") > 20
  AND NOT (
    'PROPERTY_APPLIANCE' = ANY(COALESCE(i.tags, ARRAY[]::text[]))
    AND ('APPLIANCE_TYPE:' || substring(i."sourceHash" from 21)) = ANY(COALESCE(i.tags, ARRAY[]::text[]))
  );

ROLLBACK;  -- change to COMMIT; to keep the changes

-- =====================================================================================================================
-- SECTION 3 — VERIFY (run after a COMMIT). Expect a count equal to the number of conflicts listed in 1c.
-- =====================================================================================================================

SELECT count(*) AS still_missing_including_conflicts
FROM inventory_items i
WHERE i.category = 'APPLIANCE'
  AND left(i."sourceHash", 20) = 'property_appliance::'
  AND length(i."sourceHash") > 20
  AND NOT (
    'PROPERTY_APPLIANCE' = ANY(COALESCE(i.tags, ARRAY[]::text[]))
    AND ('APPLIANCE_TYPE:' || substring(i."sourceHash" from 21)) = ANY(COALESCE(i.tags, ARRAY[]::text[]))
  );
