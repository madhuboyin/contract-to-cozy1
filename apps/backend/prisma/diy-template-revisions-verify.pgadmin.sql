-- Contract-to-Cozy: DIY template revisions, verification, for pgAdmin. READ-ONLY (SELECT only); safe to run any time.
--
-- Run it after diy-template-revisions-backfill.pgadmin.sql and before deploying the code that reads revisions, and again after the deploy.
-- Each check says what the result should be. Anything else is explained next to the query.

-- 1. MUST BE ZERO ROWS. Live templates with no published head: homeowners cannot see them and cannot start a project from them.
SELECT t."id", t."slug", t."status" AS "ACTIVE_WITHOUT_HEAD"
FROM diy_project_templates t
WHERE t."status" = 'ACTIVE' AND t."publishedRevisionId" IS NULL;

-- 2. MUST BE ZERO ROWS. A head that does not exist or belongs to a different template.
SELECT t."id", t."slug", t."publishedRevisionId" AS "BROKEN_HEAD"
FROM diy_project_templates t
LEFT JOIN diy_template_revisions r ON r."id" = t."publishedRevisionId"
WHERE t."publishedRevisionId" IS NOT NULL AND (r."id" IS NULL OR r."templateId" <> t."id");

-- 3. MUST BE ZERO ROWS. A backfilled revision that no longer matches the template row it was copied from (counts or the reviewed headline fields).
--    Only meaningful until someone edits the template (an edited live template legitimately differs from its head). Rows here after the
--    backfill but before any admin edit mean the snapshot is wrong.
SELECT t."slug", 'steps ' || jsonb_array_length(r."contentJson"->'steps') || ' vs ' || (SELECT count(*) FROM diy_template_steps s WHERE s."templateId" = t."id") AS "STEP_COUNT_MISMATCH"
FROM diy_project_templates t JOIN diy_template_revisions r ON r."id" = t."publishedRevisionId"
WHERE r."provenance" = 'LEGACY_BACKFILL' AND t."status" = 'ACTIVE'
  AND jsonb_array_length(r."contentJson"->'steps') <> (SELECT count(*) FROM diy_template_steps s WHERE s."templateId" = t."id");

SELECT t."slug", 'headline fields differ' AS "HEADLINE_MISMATCH"
FROM diy_project_templates t JOIN diy_template_revisions r ON r."id" = t."publishedRevisionId"
WHERE r."provenance" = 'LEGACY_BACKFILL' AND t."status" = 'ACTIVE'
  AND (r."title", r."category", r."safetyLevel", r."permitRequirement", r."difficultyLevel", r."estimatedMinutes")
      IS DISTINCT FROM (t."title", t."category", t."safetyLevel", t."permitRequirement", t."difficultyLevel", t."estimatedMinutes");

-- 4. REVIEW THE ROWS. Templates in REVIEW or APPROVED with no open candidate revision: they were sent for review before revisions existed.
--    APPROVE and PUBLISH are refused for them ("return it to draft and submit it again"). An admin returns each to draft (templates list, or
--    Pending Reviews for approved ones) and submits it again. Zero rows means there is nothing to do.
SELECT t."id", t."slug", t."status" AS "NEEDS_RETURN_AND_RESUBMIT", t."approvedBy"
FROM diy_project_templates t
WHERE t."status" IN ('REVIEW', 'APPROVED')
  AND NOT EXISTS (
    SELECT 1 FROM diy_template_revisions r
    WHERE r."templateId" = t."id" AND r."returnedAt" IS NULL AND r."publishedAt" IS NULL AND r."retiredAt" IS NULL
  );

-- 5. INFORMATION. Revisions by provenance, and live templates by whether their head was reviewed.
SELECT r."provenance", count(*) AS "revisions", count(*) FILTER (WHERE t."publishedRevisionId" = r."id") AS "currently_live"
FROM diy_template_revisions r JOIN diy_project_templates t ON t."id" = r."templateId"
GROUP BY r."provenance" ORDER BY r."provenance";

-- 6. INFORMATION. Existing template projects have no revision (they predate revisions) and are not offered as reviewed guides in Ask.
SELECT count(*) FILTER (WHERE "templateId" IS NOT NULL AND "templateRevisionId" IS NULL) AS "template_projects_without_revision",
       count(*) FILTER (WHERE "templateRevisionId" IS NOT NULL) AS "template_projects_with_revision"
FROM diy_projects;
