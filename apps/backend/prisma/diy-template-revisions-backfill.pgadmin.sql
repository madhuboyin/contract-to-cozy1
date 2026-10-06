-- Contract-to-Cozy: DIY template revisions, one-time backfill, for pgAdmin.
--
-- DATA BACKFILL ONLY. Not a schema migration. Run it AFTER `prisma db push` has created diy_template_revisions (and the new columns on
-- diy_project_templates and diy_projects) and BEFORE the backend and frontend that read revisions are deployed. Idempotent: safe to run again.
-- Plan and rollout order: docs/architecture/ASK_COZY_DIY_TEMPLATE_REVISIONS_PLAN.md section 6, docs/operations/DIY_TEMPLATE_REVISIONS_ROLLOUT.md.
--
-- Why: homeowners now see a template's PUBLISHED HEAD REVISION, not the template row. A template that is live today (status ACTIVE) has no revision,
-- so without this script the homeowner DIY library is empty and no template project can be started.
--
-- What it does, in one transaction:
--   1. For every ACTIVE template that has no published head and no revision yet, inserts revision 1 as a snapshot of the template row and its steps,
--      materials and tools, with provenance LEGACY_BACKFILL.
--   2. Points the template's published head at that revision.
--
-- What a LEGACY_BACKFILL revision means (read this before running):
--   * The template was live and approved before revisions existed. Its approval was attached to the TEMPLATE, not to this content, so the revision
--     claims no review and no integrity: contentHash is NULL (SQL cannot reproduce the application's canonical hash), and Ask treats it as NOT
--     reviewed. approvedBy and approvedAt are copied from the template for the record only.
--   * Homeowners keep seeing exactly what they saw before, and projects can still be started from it.
--   * It becomes a reviewed revision only by going through review again: edit, submit for review, approve, publish. That creates a GOVERNED revision
--     that supersedes this one.
--
-- What it does NOT do:
--   * It does not touch templates in REVIEW or APPROVED. They have no candidate revision; an admin must return them to draft and submit them again
--     (the verification file lists them). It does not touch DRAFT or ARCHIVED templates, and it never changes template content or status.
--   * It does not set diy_projects."templateRevisionId" for existing projects. Projects that predate revisions stay null and are not guideable.
--
-- Revision ids are deterministic ('legacy-<templateId>-1'), so a re-run can never create a second revision for a template.
-- Column names are quoted camelCase because the Prisma models do not @map them.

BEGIN;

-- 1. The snapshot. The JSON shape is the one the application writes (longDescription, steps, materials, tools), steps ordered by step number and
--    materials and tools by sort order then name, with SQL NULL becoming JSON null exactly as the application stores a missing value.
INSERT INTO diy_template_revisions (
  "id", "templateId", "revision",
  "slug", "title", "shortDescription", "category", "difficultyLevel", "requiredSkillLevel", "safetyLevel", "permitRequirement", "estimatedMinutes",
  "estimatedMaterialCostMinCents", "estimatedMaterialCostMaxCents", "professionalCostMinCents", "professionalCostMaxCents", "tags",
  "contentJson", "contentHash", "provenance",
  "submittedBy", "submittedAt", "approvedBy", "approvedAt", "publishedBy", "publishedAt", "createdAt"
)
SELECT
  'legacy-' || t."id" || '-1', t."id", 1,
  t."slug", t."title", t."shortDescription", t."category", t."difficultyLevel", t."requiredSkillLevel", t."safetyLevel", t."permitRequirement", t."estimatedMinutes",
  t."estimatedMaterialCostMinCents", t."estimatedMaterialCostMaxCents", t."professionalCostMinCents", t."professionalCostMaxCents", t."tags",
  jsonb_build_object(
    'longDescription', t."longDescription",
    'steps', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'stepNumber', s."stepNumber", 'title', s."title", 'description', s."description", 'estimatedMinutes', s."estimatedMinutes",
        'safetyNote', s."safetyNote", 'tipNote', s."tipNote", 'imageUrl', s."imageUrl", 'isOptional', s."isOptional"
      ) ORDER BY s."stepNumber")
      FROM diy_template_steps s WHERE s."templateId" = t."id"
    ), '[]'::jsonb),
    'materials', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', m."name", 'description', m."description", 'unit', m."unit", 'quantityFormula', m."quantityFormula",
        'unitPriceCents', m."unitPriceCents", 'isOptional', m."isOptional", 'purchaseNote', m."purchaseNote", 'sortOrder', m."sortOrder"
      ) ORDER BY m."sortOrder", m."name")
      FROM diy_template_materials m WHERE m."templateId" = t."id"
    ), '[]'::jsonb),
    'tools', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', tl."name", 'canonicalId', tl."canonicalId", 'description', tl."description", 'isRequired', tl."isRequired",
        'defaultToolAction', tl."defaultToolAction", 'rentDailyPriceCents', tl."rentDailyPriceCents",
        'buyEstimatePriceCents', tl."buyEstimatePriceCents", 'sortOrder', tl."sortOrder"
      ) ORDER BY tl."sortOrder", tl."name")
      FROM diy_template_tools tl WHERE tl."templateId" = t."id"
    ), '[]'::jsonb)
  ),
  NULL, 'LEGACY_BACKFILL',
  NULL, NULL, t."approvedBy", t."approvedAt", NULL, now(), now()
FROM diy_project_templates t
WHERE t."status" = 'ACTIVE'
  AND t."publishedRevisionId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM diy_template_revisions r WHERE r."templateId" = t."id");

-- 2. The published head. Also repairs a template whose legacy revision exists but whose pointer was never set.
UPDATE diy_project_templates t
SET "publishedRevisionId" = r."id", "updatedAt" = now()
FROM diy_template_revisions r
WHERE r."templateId" = t."id"
  AND r."id" = 'legacy-' || t."id" || '-1'
  AND r."provenance" = 'LEGACY_BACKFILL'
  AND t."status" = 'ACTIVE'
  AND t."publishedRevisionId" IS NULL;

COMMIT;

-- Result: the live templates and their heads. Every ACTIVE template should show a head, and legacy ones read 'LEGACY_BACKFILL'.
SELECT t."slug", t."status", r."revision", r."provenance", r."publishedAt"
FROM diy_project_templates t
LEFT JOIN diy_template_revisions r ON r."id" = t."publishedRevisionId"
WHERE t."status" = 'ACTIVE'
ORDER BY t."slug";
