-- Contract-to-Cozy: read-only check of the two PROPERTY_SUMMARY starter questions on an empty property (pgAdmin).
--
-- READ ONLY. It changes nothing. ONE query, ONE result grid (pgAdmin shows only the last statement's result, so this is a single statement).
-- First run the two questions in Ask, as a VIEWER, on a property with no recorded data:
--   1. How complete is my home record?
--   2. Give me a summary of my home record
-- Then run this whole query. There is nothing to replace: it shows the 10 most recent executions whose text contains either question (no time
-- window, case-insensitive) and the property id on each row so you can confirm it is the empty property. Expect your two runs at the top.
SELECT
  e."createdAt",
  e."propertyId",
  e."message",
  e."operationId",
  e."status",
  e."reasonCode",
  COALESCE(jsonb_typeof(e."resultJson"::jsonb -> 'clarification') = 'object', false) AS asked_a_clarification,
  COALESCE(jsonb_typeof(e."resultJson"::jsonb -> 'confirmation') = 'object', false) AS has_confirmation,
  jsonb_array_length(COALESCE(e."resultJson"::jsonb -> 'captureRequests', '[]'::jsonb)) AS capture_requests,
  -- the blocks the answer contains: type, title and the start of its body
  (SELECT string_agg(concat(b.block ->> 'type', ' | ', COALESCE(b.block ->> 'title', ''), ' | ', left(COALESCE(b.block ->> 'body', b.block ->> 'headline', ''), 120)), E'\n' ORDER BY b.ord)
   FROM jsonb_array_elements(COALESCE(e."resultJson"::jsonb -> 'blocks', '[]'::jsonb)) WITH ORDINALITY AS b(block, ord)) AS blocks,
  -- every action offered, block-level and per-item: id, interaction type and operation (look here for contributor-only actions)
  (SELECT string_agg(concat(COALESCE(a.action ->> 'id', '?'), ' [', COALESCE(a.action ->> 'interactionType', 'link'), ' ', COALESCE(a.action ->> 'operationId', ''), ']'), E'\n')
   FROM jsonb_array_elements(COALESCE(e."resultJson"::jsonb -> 'blocks', '[]'::jsonb)) AS blk(block),
        LATERAL (
          SELECT x AS action FROM jsonb_array_elements(COALESCE(blk.block -> 'actions', '[]'::jsonb)) AS x
          UNION ALL
          SELECT ia FROM jsonb_array_elements(COALESCE(blk.block -> 'sections', '[]'::jsonb)) AS s(section),
                         jsonb_array_elements(COALESCE(s.section -> 'items', '[]'::jsonb)) AS it(item),
                         jsonb_array_elements(COALESCE(it.item -> 'actions', '[]'::jsonb)) AS ia
        ) AS a) AS actions
FROM "ask_executions" e
WHERE e."message" ILIKE '%how complete is my home record%'
   OR e."message" ILIKE '%summary of my home record%'
ORDER BY e."createdAt" DESC
LIMIT 10;
