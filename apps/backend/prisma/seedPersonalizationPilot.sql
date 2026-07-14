-- Personalization pilot seed for PostgreSQL / pgAdmin.
--
-- DATA SEED ONLY: this is not a schema migration. The personalization tables
-- must already exist. This file is idempotent and safe to run after the older
-- personalization seed files: it upserts by stable definition code, rule
-- version, and question code/version.
--
-- Existing definition/rule/question status is deliberately preserved. New
-- rows start DRAFT, so running this file never activates the pilot.

BEGIN;

WITH pilot_definitions(code, category, safety_class) AS (
  VALUES
    ('hvac_filter_replacement_check_proof', 'low_cost_prevention', 'ROUTINE'),
    ('smoke_co_detector_battery_check',      'low_cost_prevention', 'SAFETY_SENSITIVE'),
    ('dryer_vent_cleaning_reminder',         'low_cost_prevention', 'SAFETY_SENSITIVE')
)
INSERT INTO personalization_recommendation_definitions
  (id, code, category, "safetyClass", status, "createdAt", "updatedAt")
SELECT
  gen_random_uuid(), code, category, safety_class, 'DRAFT', now(), now()
FROM pilot_definitions
ON CONFLICT (code) DO UPDATE SET
  category      = EXCLUDED.category,
  "safetyClass" = EXCLUDED."safetyClass",
  "updatedAt"   = now();

WITH pilot_rules(code, rule_ast, score_config) AS (
  VALUES
    (
      'hvac_filter_replacement_check_proof',
      '{"op":"trait","key":"hvacFilterReplacementOverdue","cmp":"eq","value":true}'::jsonb,
      '{"modelVersion":"hvac-filter-proof-score-v1","baseRelevance":60,"weights":{"baseRelevance":0.4,"urgency":0.4,"confidence":0.2}}'::jsonb
    ),
    (
      'smoke_co_detector_battery_check',
      '{"op":"trait","key":"smokeDetectorBatteryOverdue","cmp":"eq","value":true}'::jsonb,
      NULL::jsonb
    ),
    (
      'dryer_vent_cleaning_reminder',
      '{"op":"trait","key":"dryerVentCleaningOverdue","cmp":"eq","value":true}'::jsonb,
      NULL::jsonb
    )
)
INSERT INTO personalization_recommendation_rules
  (id, "definitionId", version, "ruleAst", "dependencyKeys", "scoreConfig", status, "createdAt", "updatedAt")
SELECT
  gen_random_uuid(), d.id, 1, r.rule_ast, ARRAY[]::text[], r.score_config, 'DRAFT', now(), now()
FROM pilot_rules r
JOIN personalization_recommendation_definitions d ON d.code = r.code
ON CONFLICT ("definitionId", version) DO UPDATE SET
  "ruleAst"     = EXCLUDED."ruleAst",
  "scoreConfig" = EXCLUDED."scoreConfig",
  "updatedAt"   = now();

WITH pilot_content(code, title, body, templates) AS (
  VALUES
    (
      'hvac_filter_replacement_check_proof',
      'Your HVAC filter may be due for a replacement check',
      'Your recorded HVAC maintenance history indicates that the filter replacement interval may have passed.',
      '{"reasonCode":"HVAC_FILTER_OVERDUE","reasonTemplateKey":"hvac_filter_overdue_reason"}'::jsonb
    ),
    (
      'smoke_co_detector_battery_check',
      'Check your smoke and carbon monoxide detector batteries',
      'Your recorded maintenance history indicates that a detector battery check may be due. Test each detector and follow its manufacturer instructions.',
      '{"reasonCode":"SMOKE_CO_BATTERY_CHECK_DUE","reasonTemplateKey":"smoke_co_battery_check_due_reason"}'::jsonb
    ),
    (
      'dryer_vent_cleaning_reminder',
      'Your dryer vent may be due for cleaning',
      'Your recorded maintenance history indicates that dryer-vent cleaning may be due. Inspect the vent and use a qualified professional when appropriate.',
      '{"reasonCode":"DRYER_VENT_CLEANING_DUE","reasonTemplateKey":"dryer_vent_cleaning_due_reason"}'::jsonb
    )
)
INSERT INTO personalization_recommendation_content_versions
  (id, "definitionId", locale, version, title, body, templates, status, "createdAt", "updatedAt")
SELECT
  gen_random_uuid(), d.id, 'en-US', 1, c.title, c.body, c.templates, 'DRAFT', now(), now()
FROM pilot_content c
JOIN personalization_recommendation_definitions d ON d.code = c.code
ON CONFLICT ("definitionId", locale, version) DO UPDATE SET
  title       = EXCLUDED.title,
  body        = EXCLUDED.body,
  templates   = EXCLUDED.templates,
  "updatedAt" = now();

INSERT INTO personalization_profile_questions
  (id, code, version, status, prompt, "whyAsked", "privacyNote", "targetTable", "targetKey",
   "answerSchema", "placementContexts", "valueScore", "effortScore", "maxImpressions", "createdAt", "updatedAt")
VALUES
  (
    gen_random_uuid(), 'household_composition_safety', 1, 'DRAFT',
    'Does your household include children or seniors who need extra home-safety consideration?',
    'Helps prioritize home-safety guidance.',
    'We store broad household bands, never names, ages, or birthdates.',
    'HOUSEHOLD_MEMBER_SUMMARY', NULL,
    '{"type":"multi_select","options":["hasChildren","hasSeniors"]}'::jsonb,
    ARRAY['PILOT'], 8, 2, 3, now(), now()
  ),
  (
    gen_random_uuid(), 'household_pets', 1, 'DRAFT',
    'Do you have a dog or cat at this property?',
    'Helps tailor home maintenance and yard-safety guidance.',
    'We store pet type only, never names or medical information.',
    'PET_PROFILE', NULL,
    '{"type":"select_with_detail","options":["hasPet","petType"]}'::jsonb,
    ARRAY['PILOT'], 6, 1, 3, now(), now()
  ),
  (
    gen_random_uuid(), 'goal_aging_in_place', 1, 'DRAFT',
    'Are you planning to stay in this home long-term?',
    'Helps prioritize accessibility and long-term home-safety guidance.',
    'This is an optional goal you can remove at any time.',
    'HOUSEHOLD_GOAL', 'AGING_IN_PLACE',
    '{"type":"boolean"}'::jsonb,
    ARRAY['PILOT'], 7, 1, 3, now(), now()
  ),
  (
    gen_random_uuid(), 'preference_budget_posture', 1, 'DRAFT',
    'Should we favor lower-cost options when choices are equally useful?',
    'Helps rank practical options.',
    'This preference does not collect income or credit information.',
    'HOUSEHOLD_PREFERENCE', 'BUDGET_POSTURE',
    '{"type":"boolean"}'::jsonb,
    ARRAY['PILOT'], 6, 1, 3, now(), now()
  ),
  (
    gen_random_uuid(), 'lifestyle_travel_frequency', 1, 'DRAFT',
    'Are you away from home frequently?',
    'Helps prioritize home security and remote-monitoring guidance.',
    'We store only this answer, never destinations or travel dates.',
    'LIFESTYLE_ATTRIBUTE', 'TRAVEL_FREQUENCY',
    '{"type":"boolean"}'::jsonb,
    ARRAY['PILOT'], 5, 1, 3, now(), now()
  )
ON CONFLICT (code, version) DO UPDATE SET
  prompt         = EXCLUDED.prompt,
  "whyAsked"     = EXCLUDED."whyAsked",
  "privacyNote"  = EXCLUDED."privacyNote",
  "targetTable"  = EXCLUDED."targetTable",
  "targetKey"    = EXCLUDED."targetKey",
  "answerSchema" = EXCLUDED."answerSchema",
  "placementContexts" = EXCLUDED."placementContexts",
  "valueScore"   = EXCLUDED."valueScore",
  "effortScore"  = EXCLUDED."effortScore",
  "maxImpressions" = EXCLUDED."maxImpressions",
  "updatedAt"    = now();

COMMIT;

-- Verification: expect 3 definitions/rules and 5 questions. Existing rows
-- may already be ACTIVE; this seed does not change their status.
SELECT d.code, d.status AS definition_status, r.version, r.status AS rule_status
FROM personalization_recommendation_definitions d
JOIN personalization_recommendation_rules r ON r."definitionId" = d.id
WHERE d.code IN (
  'hvac_filter_replacement_check_proof',
  'smoke_co_detector_battery_check',
  'dryer_vent_cleaning_reminder'
)
ORDER BY d.code;

SELECT code, "targetTable", status, "placementContexts"
FROM personalization_profile_questions
WHERE code IN (
  'household_composition_safety',
  'household_pets',
  'goal_aging_in_place',
  'preference_budget_posture',
  'lifestyle_travel_frequency'
)
ORDER BY code;

SELECT d.code, c.locale, c.version, c.status AS content_status, c.title
FROM personalization_recommendation_definitions d
JOIN personalization_recommendation_content_versions c ON c."definitionId" = d.id
WHERE d.code IN (
  'hvac_filter_replacement_check_proof',
  'smoke_co_detector_battery_check',
  'dryer_vent_cleaning_reminder'
)
ORDER BY d.code, c.locale, c.version;
