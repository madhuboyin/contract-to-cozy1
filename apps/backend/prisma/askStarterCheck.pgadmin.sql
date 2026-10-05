-- Contract-to-Cozy: read-only check of the two PROPERTY_SUMMARY starter questions on an empty property (pgAdmin).
--
-- READ ONLY. It changes nothing. Run the two questions in Ask first, as a VIEWER, on a property with no recorded data:
--   1. How complete is my home record?
--   2. Give me a summary of my home record
-- Then replace PROPERTY_ID_HERE below (the property's id) and run the whole script. Each result set answers one point of the check.

-- 1. Status, reason code and clarification for each run -------------------------------------------------------------------------
WITH params AS (SELECT 'PROPERTY_ID_HERE'::text AS property_id, 6::int AS hours)
SELECT e."createdAt", e."message", e."operationId", e."status", e."reasonCode",
       COALESCE(jsonb_typeof(e."resultJson"::jsonb -> 'clarification') = 'object', false) AS asked_a_clarification,
       jsonb_array_length(COALESCE(e."resultJson"::jsonb -> 'blocks', '[]'::jsonb)) AS block_count
FROM "ask_executions" e, params p
WHERE e."propertyId" = p.property_id AND e."createdAt" > now() - make_interval(hours => p.hours)
  AND e."message" IN ('How complete is my home record?', 'Give me a summary of my home record')
ORDER BY e."createdAt";

-- 2. The content of each answer: block types, titles and a short body, to judge "meaningful and non-empty" and "materially distinct" ----
WITH params AS (SELECT 'PROPERTY_ID_HERE'::text AS property_id, 6::int AS hours)
SELECT e."message", b.ord AS block_no, b.block ->> 'type' AS block_type, b.block ->> 'id' AS block_id,
       b.block ->> 'title' AS title, left(COALESCE(b.block ->> 'body', b.block ->> 'headline', ''), 160) AS body_start
FROM "ask_executions" e, params p,
     LATERAL jsonb_array_elements(COALESCE(e."resultJson"::jsonb -> 'blocks', '[]'::jsonb)) WITH ORDINALITY AS b(block, ord)
WHERE e."propertyId" = p.property_id AND e."createdAt" > now() - make_interval(hours => p.hours)
  AND e."message" IN ('How complete is my home record?', 'Give me a summary of my home record')
ORDER BY e."createdAt", b.ord;

-- 3. Every action the answers offer (block actions and per-item actions), to look for contributor-only actions (captures, add, correct, mutate) ----
WITH params AS (SELECT 'PROPERTY_ID_HERE'::text AS property_id, 6::int AS hours),
runs AS (
  SELECT e."message", e."createdAt", e."resultJson"::jsonb AS r
  FROM "ask_executions" e, params p
  WHERE e."propertyId" = p.property_id AND e."createdAt" > now() - make_interval(hours => p.hours)
    AND e."message" IN ('How complete is my home record?', 'Give me a summary of my home record')
)
SELECT runs."message", a.action ->> 'id' AS action_id, a.action ->> 'label' AS label,
       a.action ->> 'interactionType' AS interaction_type, a.action ->> 'operationId' AS operation_id, a.action ->> 'href' AS href
FROM runs,
     LATERAL jsonb_array_elements(COALESCE(runs.r -> 'blocks', '[]'::jsonb)) AS blk(block),
     LATERAL (
       SELECT x AS action FROM jsonb_array_elements(COALESCE(blk.block -> 'actions', '[]'::jsonb)) AS x
       UNION ALL
       SELECT ia FROM jsonb_array_elements(COALESCE(blk.block -> 'sections', '[]'::jsonb)) AS s(section),
                      jsonb_array_elements(COALESCE(s.section -> 'items', '[]'::jsonb)) AS it(item),
                      jsonb_array_elements(COALESCE(it.item -> 'actions', '[]'::jsonb)) AS ia
     ) AS a
ORDER BY runs."createdAt", action_id;

-- 4. Capture requests and confirmations (a contributor-only write path would show here) --------------------------------------------------------
WITH params AS (SELECT 'PROPERTY_ID_HERE'::text AS property_id, 6::int AS hours)
SELECT e."message",
       jsonb_array_length(COALESCE(e."resultJson"::jsonb -> 'captureRequests', '[]'::jsonb)) AS capture_requests,
       COALESCE(jsonb_typeof(e."resultJson"::jsonb -> 'confirmation') = 'object', false) AS has_confirmation
FROM "ask_executions" e, params p
WHERE e."propertyId" = p.property_id AND e."createdAt" > now() - make_interval(hours => p.hours)
  AND e."message" IN ('How complete is my home record?', 'Give me a summary of my home record')
ORDER BY e."createdAt";
