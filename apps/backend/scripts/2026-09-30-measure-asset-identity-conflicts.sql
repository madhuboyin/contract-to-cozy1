-- READ-ONLY measurement, NOT a migration. Run it in pgAdmin's Query Tool. It creates nothing and changes nothing:
-- three SELECT queries over risk_assessment_reports. SQL twin of scripts/measure-asset-identity-conflicts.ts (FRD v1.177/v1.178).
--
-- QUESTION IT ANSWERS
-- The Home Action feed raises a "Review asset details" card ("Your Home Record names this item as X but classifies its
-- system as Y") when a stored risk-report row's name and system type resolve to two DIFFERENT known asset labels.
-- Code reading says current code cannot produce that for inventory appliances (every MAJOR_APPLIANCE_* system type
-- resolves to no label, and a conflict needs BOTH labels). This measures whether any row in your data does.
--
-- HOW IT MATCHES THE FEED
-- Each row is evaluated exactly as services/riskRowIdentity.ts does it:
--   system_type = systemType, else assetName, else 'Unknown'          (the feed's  String(d.systemType ?? d.assetName ?? 'Unknown'))
--   title       = assetName if non-empty, else system_type
--   label(x)    = x trimmed; if it equals a canonical label exactly, that label; otherwise the label for its
--                 "identifier key" (camelCase split, non-alphanumerics -> '_', edge '_' trimmed, upper-cased) in the table below
--   conflict    = label(title) and label(system_type) are both known and different
--   actionable  = riskLevel (or severity) HIGH/CRITICAL, or status NEEDS_ATTENTION/ACTION_REQUIRED/MISSING_DATA/NEEDS_REVIEW,
--                 or a non-blank recommendedAction
-- The label table in the `amap` CTE mirrors ASSET_DISPLAY_LABELS in src/productFramework/homeAssetDisplay.ts. If that
-- table ever changes, this file must change with it (a test compares them).
--
-- HOW TO RUN
-- pgAdmin shows only the LAST statement's result grid when several run together, so run ONE query at a time
-- (highlight it, press F5). Each query is self-contained (it repeats the same WITH block).
--   Query 1: the summary. Read "actionable_conflicts": it is the number of identity-conflict cards the feed shows today.
--            0 means this conflict is not occurring in your data.
--   Query 2: the distinct name/type pairs behind any conflicts, with counts.
--   Query 3: example conflicting rows.
-- Note: it reads the stored reports the feed reads (one per property, latest calculation). Reports written by older code
-- are the only plausible source of a conflict, which is why the summary also shows how old the reports are.

-- =====================================================================================================================
-- QUERY 1 — SUMMARY
-- =====================================================================================================================
WITH amap(key, label) AS (
  VALUES
    ('HVAC_FURNACE', 'HVAC Furnace'), ('HVAC_HEAT_PUMP', 'HVAC Heat Pump'), ('HVAC_FURNACE_FILTER', 'HVAC Filter'),
    ('HVAC_FILTER', 'HVAC Filter'), ('HVAC_FILTER_CHECK', 'HVAC Filter'), ('ROOF_SHINGLE', 'Roof'), ('ROOF_TILE_METAL', 'Roof'),
    ('WATER_HEATER_TANK', 'Water Heater'), ('WATER_HEATER_TANKLESS', 'Tankless Water Heater'),
    ('REFRIGERATOR', 'Refrigerator'), ('FRIDGE', 'Refrigerator'), ('DISHWASHER', 'Dishwasher'),
    ('WASHER', 'Washer'), ('WASHING_MACHINE', 'Washer'), ('CLOTHES_WASHER', 'Washer'),
    ('DRYER', 'Dryer'), ('CLOTHES_DRYER', 'Dryer'), ('OVEN', 'Oven'), ('RANGE', 'Range'), ('STOVE', 'Range'),
    ('SAFETY_SMOKE_CO_DETECTOR', 'Smoke & CO Detector Check'), ('SAFETY_SMOKE_CO_DETECTORS', 'Smoke & CO Detector Check')
), rows AS (
  SELECT
    r."propertyId"      AS property_id,
    r."lastCalculatedAt" AS calculated_at,
    d                   AS d
  FROM risk_assessment_reports r
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(r.details) = 'array' THEN r.details ELSE '[]'::jsonb END
  ) AS d
  WHERE jsonb_typeof(d) = 'object'
), evaluated AS (
  SELECT
    x.property_id,
    x.calculated_at,
    x.system_type,
    x.title,
    COALESCE(
      (SELECT DISTINCT a.label FROM amap a WHERE a.label = regexp_replace(x.title, '^\s+|\s+$', '', 'g')),
      (SELECT a.label FROM amap a WHERE a.key = upper(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
         regexp_replace(x.title, '^\s+|\s+$', '', 'g'), '([a-z0-9])([A-Z])', '\1_\2', 'g'), '[^a-zA-Z0-9]+', '_', 'g'), '^_+|_+$', '', 'g'), '^$', '', 'g')))
    ) AS named_label,
    COALESCE(
      (SELECT DISTINCT a.label FROM amap a WHERE a.label = regexp_replace(x.system_type, '^\s+|\s+$', '', 'g')),
      (SELECT a.label FROM amap a WHERE a.key = upper(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
         regexp_replace(x.system_type, '^\s+|\s+$', '', 'g'), '([a-z0-9])([A-Z])', '\1_\2', 'g'), '[^a-zA-Z0-9]+', '_', 'g'), '^_+|_+$', '', 'g'), '^$', '', 'g')))
    ) AS typed_label,
    x.actionable
  FROM (
    SELECT
      rows.property_id,
      rows.calculated_at,
      COALESCE(rows.d->>'systemType', rows.d->>'assetName', 'Unknown') AS system_type,
      COALESCE(NULLIF(rows.d->>'assetName', ''), COALESCE(rows.d->>'systemType', rows.d->>'assetName', 'Unknown')) AS title,
      -- COALESCE: without a recommendedAction the last term is NULL, and "false OR false OR NULL" is NULL, not false.
      COALESCE(
        upper(regexp_replace(COALESCE(rows.d->>'riskLevel', rows.d->>'severity', ''), '^\s+|\s+$', '', 'g')) IN ('HIGH', 'CRITICAL')
        OR upper(regexp_replace(COALESCE(rows.d->>'status', ''), '^\s+|\s+$', '', 'g')) IN ('NEEDS_ATTENTION', 'ACTION_REQUIRED', 'MISSING_DATA', 'NEEDS_REVIEW')
        OR (jsonb_typeof(rows.d->'recommendedAction') = 'string'
            AND length(regexp_replace(rows.d->>'recommendedAction', '^\s+|\s+$', '', 'g')) > 0),
        false
      ) AS actionable
    FROM rows
  ) x
), flagged AS (
  SELECT e.*, (e.named_label IS NOT NULL AND e.typed_label IS NOT NULL AND e.named_label <> e.typed_label) AS conflict
  FROM evaluated e
)
SELECT
  (SELECT count(*) FROM risk_assessment_reports)                                                   AS reports,
  (SELECT count(*) FROM risk_assessment_reports WHERE jsonb_typeof(details) <> 'array')            AS reports_with_unreadable_details,
  (SELECT min("lastCalculatedAt") FROM risk_assessment_reports)                                    AS oldest_report_calculated,
  (SELECT count(*) FROM risk_assessment_reports WHERE "lastCalculatedAt" < now() - interval '30 days') AS reports_older_than_30_days,
  count(*)                                                                                         AS risk_rows,
  count(*) FILTER (WHERE actionable)                                                               AS actionable_rows,
  count(*) FILTER (WHERE left(system_type, 16) = 'MAJOR_APPLIANCE_' AND typed_label IS NULL)       AS inert_major_appliance_rows,
  count(*) FILTER (WHERE conflict)                                                                 AS conflict_rows,
  count(*) FILTER (WHERE conflict AND actionable)                                                  AS actionable_conflicts,
  count(DISTINCT property_id) FILTER (WHERE conflict AND actionable)                               AS properties_with_actionable_conflict
FROM flagged;

-- =====================================================================================================================
-- QUERY 2 — DISTINCT CONFLICTING PAIRS (name [label] vs system type [label]) WITH COUNTS
-- (Empty result = no conflicts. Same WITH block as query 1.)
-- =====================================================================================================================
WITH amap(key, label) AS (
  VALUES
    ('HVAC_FURNACE', 'HVAC Furnace'), ('HVAC_HEAT_PUMP', 'HVAC Heat Pump'), ('HVAC_FURNACE_FILTER', 'HVAC Filter'),
    ('HVAC_FILTER', 'HVAC Filter'), ('HVAC_FILTER_CHECK', 'HVAC Filter'), ('ROOF_SHINGLE', 'Roof'), ('ROOF_TILE_METAL', 'Roof'),
    ('WATER_HEATER_TANK', 'Water Heater'), ('WATER_HEATER_TANKLESS', 'Tankless Water Heater'),
    ('REFRIGERATOR', 'Refrigerator'), ('FRIDGE', 'Refrigerator'), ('DISHWASHER', 'Dishwasher'),
    ('WASHER', 'Washer'), ('WASHING_MACHINE', 'Washer'), ('CLOTHES_WASHER', 'Washer'),
    ('DRYER', 'Dryer'), ('CLOTHES_DRYER', 'Dryer'), ('OVEN', 'Oven'), ('RANGE', 'Range'), ('STOVE', 'Range'),
    ('SAFETY_SMOKE_CO_DETECTOR', 'Smoke & CO Detector Check'), ('SAFETY_SMOKE_CO_DETECTORS', 'Smoke & CO Detector Check')
), rows AS (
  SELECT
    r."propertyId"      AS property_id,
    r."lastCalculatedAt" AS calculated_at,
    d                   AS d
  FROM risk_assessment_reports r
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(r.details) = 'array' THEN r.details ELSE '[]'::jsonb END
  ) AS d
  WHERE jsonb_typeof(d) = 'object'
), evaluated AS (
  SELECT
    x.property_id,
    x.calculated_at,
    x.system_type,
    x.title,
    COALESCE(
      (SELECT DISTINCT a.label FROM amap a WHERE a.label = regexp_replace(x.title, '^\s+|\s+$', '', 'g')),
      (SELECT a.label FROM amap a WHERE a.key = upper(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
         regexp_replace(x.title, '^\s+|\s+$', '', 'g'), '([a-z0-9])([A-Z])', '\1_\2', 'g'), '[^a-zA-Z0-9]+', '_', 'g'), '^_+|_+$', '', 'g'), '^$', '', 'g')))
    ) AS named_label,
    COALESCE(
      (SELECT DISTINCT a.label FROM amap a WHERE a.label = regexp_replace(x.system_type, '^\s+|\s+$', '', 'g')),
      (SELECT a.label FROM amap a WHERE a.key = upper(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
         regexp_replace(x.system_type, '^\s+|\s+$', '', 'g'), '([a-z0-9])([A-Z])', '\1_\2', 'g'), '[^a-zA-Z0-9]+', '_', 'g'), '^_+|_+$', '', 'g'), '^$', '', 'g')))
    ) AS typed_label,
    x.actionable
  FROM (
    SELECT
      rows.property_id,
      rows.calculated_at,
      COALESCE(rows.d->>'systemType', rows.d->>'assetName', 'Unknown') AS system_type,
      COALESCE(NULLIF(rows.d->>'assetName', ''), COALESCE(rows.d->>'systemType', rows.d->>'assetName', 'Unknown')) AS title,
      -- COALESCE: without a recommendedAction the last term is NULL, and "false OR false OR NULL" is NULL, not false.
      COALESCE(
        upper(regexp_replace(COALESCE(rows.d->>'riskLevel', rows.d->>'severity', ''), '^\s+|\s+$', '', 'g')) IN ('HIGH', 'CRITICAL')
        OR upper(regexp_replace(COALESCE(rows.d->>'status', ''), '^\s+|\s+$', '', 'g')) IN ('NEEDS_ATTENTION', 'ACTION_REQUIRED', 'MISSING_DATA', 'NEEDS_REVIEW')
        OR (jsonb_typeof(rows.d->'recommendedAction') = 'string'
            AND length(regexp_replace(rows.d->>'recommendedAction', '^\s+|\s+$', '', 'g')) > 0),
        false
      ) AS actionable
    FROM rows
  ) x
), flagged AS (
  SELECT e.*, (e.named_label IS NOT NULL AND e.typed_label IS NOT NULL AND e.named_label <> e.typed_label) AS conflict
  FROM evaluated e
)
SELECT
  title || ' [' || named_label || ']  vs  ' || system_type || ' [' || typed_label || ']' AS pair,
  count(*)                                   AS rows,
  count(*) FILTER (WHERE actionable)         AS actionable_rows
FROM flagged
WHERE conflict
GROUP BY title, named_label, system_type, typed_label
ORDER BY count(*) DESC, pair;

-- =====================================================================================================================
-- QUERY 3 — EXAMPLE CONFLICTING ROWS (first 25; change LIMIT to see more). Same WITH block as query 1.
-- =====================================================================================================================
WITH amap(key, label) AS (
  VALUES
    ('HVAC_FURNACE', 'HVAC Furnace'), ('HVAC_HEAT_PUMP', 'HVAC Heat Pump'), ('HVAC_FURNACE_FILTER', 'HVAC Filter'),
    ('HVAC_FILTER', 'HVAC Filter'), ('HVAC_FILTER_CHECK', 'HVAC Filter'), ('ROOF_SHINGLE', 'Roof'), ('ROOF_TILE_METAL', 'Roof'),
    ('WATER_HEATER_TANK', 'Water Heater'), ('WATER_HEATER_TANKLESS', 'Tankless Water Heater'),
    ('REFRIGERATOR', 'Refrigerator'), ('FRIDGE', 'Refrigerator'), ('DISHWASHER', 'Dishwasher'),
    ('WASHER', 'Washer'), ('WASHING_MACHINE', 'Washer'), ('CLOTHES_WASHER', 'Washer'),
    ('DRYER', 'Dryer'), ('CLOTHES_DRYER', 'Dryer'), ('OVEN', 'Oven'), ('RANGE', 'Range'), ('STOVE', 'Range'),
    ('SAFETY_SMOKE_CO_DETECTOR', 'Smoke & CO Detector Check'), ('SAFETY_SMOKE_CO_DETECTORS', 'Smoke & CO Detector Check')
), rows AS (
  SELECT
    r."propertyId"      AS property_id,
    r."lastCalculatedAt" AS calculated_at,
    d                   AS d
  FROM risk_assessment_reports r
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(r.details) = 'array' THEN r.details ELSE '[]'::jsonb END
  ) AS d
  WHERE jsonb_typeof(d) = 'object'
), evaluated AS (
  SELECT
    x.property_id,
    x.calculated_at,
    x.system_type,
    x.title,
    COALESCE(
      (SELECT DISTINCT a.label FROM amap a WHERE a.label = regexp_replace(x.title, '^\s+|\s+$', '', 'g')),
      (SELECT a.label FROM amap a WHERE a.key = upper(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
         regexp_replace(x.title, '^\s+|\s+$', '', 'g'), '([a-z0-9])([A-Z])', '\1_\2', 'g'), '[^a-zA-Z0-9]+', '_', 'g'), '^_+|_+$', '', 'g'), '^$', '', 'g')))
    ) AS named_label,
    COALESCE(
      (SELECT DISTINCT a.label FROM amap a WHERE a.label = regexp_replace(x.system_type, '^\s+|\s+$', '', 'g')),
      (SELECT a.label FROM amap a WHERE a.key = upper(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
         regexp_replace(x.system_type, '^\s+|\s+$', '', 'g'), '([a-z0-9])([A-Z])', '\1_\2', 'g'), '[^a-zA-Z0-9]+', '_', 'g'), '^_+|_+$', '', 'g'), '^$', '', 'g')))
    ) AS typed_label,
    x.actionable
  FROM (
    SELECT
      rows.property_id,
      rows.calculated_at,
      COALESCE(rows.d->>'systemType', rows.d->>'assetName', 'Unknown') AS system_type,
      COALESCE(NULLIF(rows.d->>'assetName', ''), COALESCE(rows.d->>'systemType', rows.d->>'assetName', 'Unknown')) AS title,
      -- COALESCE: without a recommendedAction the last term is NULL, and "false OR false OR NULL" is NULL, not false.
      COALESCE(
        upper(regexp_replace(COALESCE(rows.d->>'riskLevel', rows.d->>'severity', ''), '^\s+|\s+$', '', 'g')) IN ('HIGH', 'CRITICAL')
        OR upper(regexp_replace(COALESCE(rows.d->>'status', ''), '^\s+|\s+$', '', 'g')) IN ('NEEDS_ATTENTION', 'ACTION_REQUIRED', 'MISSING_DATA', 'NEEDS_REVIEW')
        OR (jsonb_typeof(rows.d->'recommendedAction') = 'string'
            AND length(regexp_replace(rows.d->>'recommendedAction', '^\s+|\s+$', '', 'g')) > 0),
        false
      ) AS actionable
    FROM rows
  ) x
), flagged AS (
  SELECT e.*, (e.named_label IS NOT NULL AND e.typed_label IS NOT NULL AND e.named_label <> e.typed_label) AS conflict
  FROM evaluated e
)
SELECT
  property_id,
  calculated_at,
  actionable,
  title,
  named_label,
  system_type,
  typed_label
FROM flagged
WHERE conflict
ORDER BY actionable DESC, calculated_at, property_id
LIMIT 25;
