-- apps/backend/prisma/seedDryerVentCleaningRule.sql
--
-- Raw-SQL equivalent of seedDryerVentCleaningRule.ts, for running directly
-- in pgAdmin. The `dryer_vent_cleaning_reminder` definition already exists
-- (seeded DRAFT by seedPersonalizationCatalog.sql) — this just adds its
-- first real RecommendationRule, also DRAFT. Going ACTIVE still needs the
-- docs' two-person review for SAFETY_SENSITIVE content.
--
-- PREREQUISITE: seedPersonalizationCatalog.sql must have already run.
--
-- Idempotent: safe to re-run.

INSERT INTO personalization_recommendation_rules
  (id, "definitionId", version, "ruleAst", "dependencyKeys", status, "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  d.id,
  1,
  '{"op":"trait","key":"dryerVentCleaningOverdue","cmp":"eq","value":true}'::jsonb,
  ARRAY[]::text[],
  'DRAFT',
  now(),
  now()
FROM personalization_recommendation_definitions d
WHERE d.code = 'dryer_vent_cleaning_reminder'
ON CONFLICT ("definitionId", version) DO UPDATE SET
  "ruleAst"   = EXCLUDED."ruleAst",
  "updatedAt" = now();

-- Sanity check after running:
-- SELECT d.code, d.status AS definition_status, r.version, r.status AS rule_status, r."ruleAst"
-- FROM personalization_recommendation_definitions d
-- JOIN personalization_recommendation_rules r ON r."definitionId" = d.id
-- WHERE d.code = 'dryer_vent_cleaning_reminder';
