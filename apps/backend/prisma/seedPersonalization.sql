-- Initial personalization catalog seed for PostgreSQL / pgAdmin.
--
-- DATA SEED ONLY: this is not a schema migration. The personalization tables
-- must already exist. This bootstrap is idempotent: it inserts only missing
-- rows identified by stable definition code, rule/content version, and
-- question code/version.
--
-- Existing rule/content rows are deliberately left unchanged. Phase 4 trust
-- metadata is synchronized by definition code, but rerunning this file cannot
-- overwrite reviewed content or activate anything.

BEGIN;

WITH personalization_definitions(code, category, safety_class, safety_tier, governance_policy_version) AS (
  VALUES
    ('hvac_filter_replacement_check_proof', 'low_cost_prevention', 'ROUTINE', 'LOW_CONSEQUENCE', 'phase4-v1'),
    ('smoke_co_detector_battery_check',      'low_cost_prevention', 'SAFETY_SENSITIVE', 'SAFETY_EMERGENCY', 'phase4-v1'),
    ('dryer_vent_cleaning_reminder',         'low_cost_prevention', 'SAFETY_SENSITIVE', 'SAFETY_EMERGENCY', 'phase4-v1'),
    ('smoke_detector_installation_review',   'safety_risk_reduction', 'SAFETY_SENSITIVE', 'SAFETY_EMERGENCY', 'phase4-v1'),
    ('aging_roof_condition_review',          'aging_system_planning', 'ROUTINE', 'MATERIAL_FINANCIAL', 'phase4-v1')
)
INSERT INTO personalization_recommendation_definitions
  (id, code, category, "safetyClass", "safetyTier", "governancePolicyVersion", status, "createdAt", "updatedAt")
SELECT
  gen_random_uuid(), code, category, safety_class, safety_tier::"RecommendationSafetyTier", governance_policy_version, 'DRAFT', now(), now()
FROM personalization_definitions
ON CONFLICT (code) DO UPDATE SET
  "safetyTier" = EXCLUDED."safetyTier",
  "governancePolicyVersion" = EXCLUDED."governancePolicyVersion",
  "updatedAt" = now();

WITH personalization_rules(code, rule_ast) AS (
  VALUES
    (
      'hvac_filter_replacement_check_proof',
      '{"op":"trait","key":"hvacFilterReplacementOverdue","cmp":"eq","value":true}'::jsonb
    ),
    (
      'smoke_co_detector_battery_check',
      '{"op":"trait","key":"smokeDetectorBatteryOverdue","cmp":"eq","value":true}'::jsonb
    ),
    (
      'dryer_vent_cleaning_reminder',
      '{"op":"trait","key":"dryerVentCleaningOverdue","cmp":"eq","value":true}'::jsonb
    ),
    (
      'smoke_detector_installation_review',
      '{"op":"trait","key":"smokeDetectorMissing","cmp":"eq","value":true}'::jsonb
    ),
    (
      'aging_roof_condition_review',
      '{"op":"trait","key":"roofReplacementOverdue","cmp":"eq","value":true}'::jsonb
    )
)
INSERT INTO personalization_recommendation_rules
  (id, "definitionId", version, "ruleAst", status, "createdAt", "updatedAt")
SELECT
  gen_random_uuid(), d.id, 1, r.rule_ast, 'DRAFT', now(), now()
FROM personalization_rules r
JOIN personalization_recommendation_definitions d ON d.code = r.code
ON CONFLICT ("definitionId", version) DO NOTHING;

WITH personalization_content(code, title, body) AS (
  VALUES
    (
      'hvac_filter_replacement_check_proof',
      'Your HVAC filter may be due for a replacement check',
      'Your recorded HVAC maintenance history indicates that the filter replacement interval may have passed.'
    ),
    (
      'smoke_co_detector_battery_check',
      'Check your smoke and carbon monoxide detector batteries',
      'Your recorded maintenance history indicates that a detector battery check may be due. Test each detector and follow its manufacturer instructions.'
    ),
    (
      'dryer_vent_cleaning_reminder',
      'Your dryer vent may be due for cleaning',
      'Your recorded maintenance history indicates that dryer-vent cleaning may be due. Inspect the vent and use a qualified professional when appropriate.'
    ),
    (
      'smoke_detector_installation_review',
      'Confirm smoke-detector coverage for this home',
      'Your property details currently indicate that smoke detectors are not installed. Confirm the record, then install and test detectors in the locations required for your home.'
    ),
    (
      'aging_roof_condition_review',
      'Review your roof''s age and condition',
      'The recorded roof replacement year is at least 25 years ago. Review the roof condition and service history, and schedule a qualified inspection when appropriate before planning repair or replacement.'
    )
)
INSERT INTO personalization_recommendation_content_versions
  (id, "definitionId", locale, version, title, body, status, "createdAt", "updatedAt")
SELECT
  gen_random_uuid(), d.id, 'en-US', 1, c.title, c.body, 'DRAFT', now(), now()
FROM personalization_content c
JOIN personalization_recommendation_definitions d ON d.code = c.code
ON CONFLICT ("definitionId", locale, version) DO NOTHING;

INSERT INTO personalization_profile_questions
  (id, code, version, status, prompt, "whyAsked", "privacyNote",
   "answerSchema", "valueScore", "effortScore", "maxImpressions", "createdAt", "updatedAt")
VALUES
  (
    gen_random_uuid(), 'household_composition_safety', 1, 'DRAFT',
    'Does your household include children or seniors who need extra home-safety consideration?',
    'Helps prioritize home-safety guidance.',
    'We store broad household bands, never names, ages, or birthdates.',
    '{"type":"multi_select","options":["hasChildren","hasSeniors"]}'::jsonb,
    8, 2, 3, now(), now()
  ),
  (
    gen_random_uuid(), 'household_pets', 1, 'DRAFT',
    'Do you have a dog or cat at this property?',
    'Helps tailor home maintenance and yard-safety guidance.',
    'We store pet type only, never names or medical information.',
    '{"type":"select_with_detail","options":["hasPet","petType"]}'::jsonb,
    6, 1, 3, now(), now()
  ),
  (
    gen_random_uuid(), 'goal_aging_in_place', 1, 'DRAFT',
    'Are you planning to stay in this home long-term?',
    'Helps prioritize accessibility and long-term home-safety guidance.',
    'This is an optional goal you can remove at any time.',
    '{"type":"boolean"}'::jsonb,
    7, 1, 3, now(), now()
  ),
  (
    gen_random_uuid(), 'preference_budget_posture', 1, 'DRAFT',
    'Should we favor lower-cost options when choices are equally useful?',
    'Helps rank practical options.',
    'This preference does not collect income or credit information.',
    '{"type":"boolean"}'::jsonb,
    6, 1, 3, now(), now()
  ),
  (
    gen_random_uuid(), 'lifestyle_travel_frequency', 1, 'DRAFT',
    'Are you away from home frequently?',
    'Helps prioritize home security and remote-monitoring guidance.',
    'We store only this answer, never destinations or travel dates.',
    '{"type":"boolean"}'::jsonb,
    5, 1, 3, now(), now()
  )
ON CONFLICT (code, version) DO NOTHING;

COMMIT;

-- Verification: expect 5 definitions/rules and 5 questions. Existing rows
-- may already be ACTIVE; this bootstrap does not change existing rows.
SELECT d.code, d.status AS definition_status, r.version, r.status AS rule_status
FROM personalization_recommendation_definitions d
JOIN personalization_recommendation_rules r ON r."definitionId" = d.id
WHERE d.code IN (
  'hvac_filter_replacement_check_proof',
  'smoke_co_detector_battery_check',
  'dryer_vent_cleaning_reminder',
  'smoke_detector_installation_review',
  'aging_roof_condition_review'
)
ORDER BY d.code;

SELECT code, status, "answerSchema"
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
  'dryer_vent_cleaning_reminder',
  'smoke_detector_installation_review',
  'aging_roof_condition_review'
)
ORDER BY d.code, c.locale, c.version;
