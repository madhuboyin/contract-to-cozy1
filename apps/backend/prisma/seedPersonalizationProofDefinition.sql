-- apps/backend/prisma/seedPersonalizationProofDefinition.sql
--
-- Raw-SQL equivalent of seedPersonalizationProofDefinition.ts, for running
-- directly in pgAdmin. Seeds the ONE inactive HVAC-filter proof definition
-- (src/modules/personalization/catalog/proofDefinition.ts) — the roadmap's
-- "first implementation step" exception to the "no rule logic" Phase 0
-- catalog-plan entries (see seedPersonalizationCatalog.sql, the 27 no-logic
-- entries). Creates a personalization_recommendation_definitions row AND
-- its personalization_recommendation_rules row (real ruleAst JSON), both
-- status DRAFT/inactive.
--
-- PREREQUISITE: both tables must already exist (npx prisma db push for the
-- schema change that added PersonalizationEvaluationRun and the
-- RecommendationRule/RecommendationDefinition back-relations).
--
-- Idempotent: safe to re-run. On conflict, refreshes category/safetyClass/
-- ruleAst but never touches `status` (same reasoning as
-- seedPersonalizationCatalog.sql — a manual promotion past DRAFT must not
-- get silently reverted by a re-run).

WITH def AS (
  INSERT INTO personalization_recommendation_definitions
    (id, code, category, "safetyClass", status, "createdAt", "updatedAt")
  VALUES
    (gen_random_uuid(), 'hvac_filter_replacement_check_proof', 'proof_of_concept', 'ROUTINE', 'DRAFT', now(), now())
  ON CONFLICT (code) DO UPDATE SET
    category      = EXCLUDED.category,
    "safetyClass" = EXCLUDED."safetyClass",
    "updatedAt"   = now()
  RETURNING id
)
INSERT INTO personalization_recommendation_rules
  (id, "definitionId", version, "ruleAst", "dependencyKeys", "scoreConfig", status, "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  def.id,
  1,
  '{"op":"trait","key":"hvacFilterReplacementOverdue","cmp":"eq","value":true}'::jsonb,
  ARRAY[]::text[],
  '{"modelVersion":"hvac-filter-proof-score-v1","baseRelevance":60,"weights":{"baseRelevance":0.4,"urgency":0.4,"confidence":0.2}}'::jsonb,
  'DRAFT',
  now(),
  now()
FROM def
ON CONFLICT ("definitionId", version) DO UPDATE SET
  "ruleAst"     = EXCLUDED."ruleAst",
  "scoreConfig" = EXCLUDED."scoreConfig",
  "updatedAt"   = now();

-- Sanity check after running: should return exactly 1 row, status DRAFT,
-- with a nested rule showing the trait-based ruleAst.
-- SELECT d.code, d.status AS definition_status, r.version, r.status AS rule_status, r."ruleAst"
-- FROM personalization_recommendation_definitions d
-- JOIN personalization_recommendation_rules r ON r."definitionId" = d.id
-- WHERE d.code = 'hvac_filter_replacement_check_proof';
