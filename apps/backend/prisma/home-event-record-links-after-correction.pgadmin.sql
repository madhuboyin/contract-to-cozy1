-- Home Record evidence on corrected Timeline events (Findings Implementation Plan, Phase 6, F6-1; owner decision OD-6.1: links move on a correction).
--
-- BACKGROUND. Correcting an event creates a new revision and marks the old one non-current. Before the fix, the Home Record links
-- (property_record_links with entityType HOME_EVENT) stayed on the OLD revision, so the current event showed no Home Record evidence. New corrections
-- now move their links; this script repairs the corrections that already happened.
--
-- HOW TO RUN (pgAdmin Query Tool).
--   1. Run STEP 1 on its own. It only reads. It tells you how many links sit on superseded events and how many can be repaired.
--   2. If "repairable" is above zero, run STEP 2. It changes data inside one transaction and is safe to run again: a second run moves nothing.
--   3. Run STEP 1 again. "repairable" should now be 0.
--
-- WHAT STEP 2 DOES. For each link on a superseded event it finds that event's current revision (following supersedesEventId forward) and points the
-- link there. If the current revision already has a link for the same record and purpose, the stale link is a duplicate and is deleted instead. Where an
-- event has no current revision (it was deleted), the link is left alone. Nothing else is touched, and no row is created.
--
-- Not executed against production by the author. It was tested only on a scratch PostgreSQL 15 database with this schema subset.

-- ============================== STEP 1: read-only diagnostic ==============================
WITH RECURSIVE chain AS (
  SELECT e.id AS start_id, e.id AS cur_id, 0 AS depth
  FROM home_events e
  WHERE e."isCurrent" = false
  UNION ALL
  SELECT c.start_id, n.id, c.depth + 1
  FROM chain c
  JOIN home_events n ON n."supersedesEventId" = c.cur_id
  WHERE c.depth < 100
),
heads AS (
  SELECT DISTINCT ON (c.start_id) c.start_id, c.cur_id AS head_id
  FROM chain c
  JOIN home_events h ON h.id = c.cur_id
  WHERE h."isCurrent" = true AND h."deletedAt" IS NULL
  ORDER BY c.start_id, c.depth DESC
)
SELECT
  count(*)                    AS links_on_superseded_events,
  count(h.head_id)            AS repairable,
  count(*) - count(h.head_id) AS no_current_revision_left_alone
FROM property_record_links l
JOIN home_events e ON e.id = l."entityId" AND e."isCurrent" = false
LEFT JOIN heads h ON h.start_id = l."entityId"
WHERE l."entityType" = 'HOME_EVENT';

-- ============================== STEP 2: repair (one transaction) ==============================
BEGIN;

WITH RECURSIVE chain AS (
  SELECT e.id AS start_id, e.id AS cur_id, 0 AS depth
  FROM home_events e
  WHERE e."isCurrent" = false
  UNION ALL
  SELECT c.start_id, n.id, c.depth + 1
  FROM chain c
  JOIN home_events n ON n."supersedesEventId" = c.cur_id
  WHERE c.depth < 100
),
heads AS (
  SELECT DISTINCT ON (c.start_id) c.start_id, c.cur_id AS head_id
  FROM chain c
  JOIN home_events h ON h.id = c.cur_id
  WHERE h."isCurrent" = true AND h."deletedAt" IS NULL
  ORDER BY c.start_id, c.depth DESC
),
stale AS (
  SELECT l.id AS link_id, l."recordId", l."purpose", h.head_id
  FROM property_record_links l
  JOIN heads h ON h.start_id = l."entityId"
  WHERE l."entityType" = 'HOME_EVENT'
),
redundant AS (
  -- Already linked on the current revision, or another stale link for the same record and purpose is moving there first.
  SELECT s.link_id
  FROM stale s
  WHERE EXISTS (
          SELECT 1 FROM property_record_links x
          WHERE x."recordId" = s."recordId" AND x."entityType" = 'HOME_EVENT'
            AND x."entityId" = s.head_id AND x."purpose" = s."purpose"
        )
     OR EXISTS (
          SELECT 1 FROM stale t
          WHERE t."recordId" = s."recordId" AND t."purpose" = s."purpose"
            AND t.head_id = s.head_id AND t.link_id < s.link_id
        )
),
removed AS (
  DELETE FROM property_record_links WHERE id IN (SELECT link_id FROM redundant) RETURNING id
),
moved AS (
  UPDATE property_record_links l
  SET "entityId" = s.head_id
  FROM stale s
  WHERE l.id = s.link_id AND l.id NOT IN (SELECT link_id FROM redundant)
  RETURNING l.id
)
SELECT (SELECT count(*) FROM moved) AS links_moved, (SELECT count(*) FROM removed) AS duplicate_links_removed;

COMMIT;
