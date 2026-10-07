-- READ-ONLY. Run in pgAdmin before and after the DIY project guide release (docs/operations/DIY_PROJECT_GUIDE_ROLLOUT.md). Changes nothing.
-- AUTHOR'S NOTE: these queries were written from the schema and have NOT been executed by the author (no database was provisioned for this slice). If one errors,
-- fix the query; it is not a sign of a problem in your data.
--
-- The guide opens only for an open DIY project started from a reviewed template version (plan docs/architecture/ASK_COZY_DIY_PROJECT_GUIDE_PLAN.md section 3.2).
-- These show how many open projects are in each position, so you know what the guide will and will not open. The guide's own checks are STRICTER than query 4.

-- 1. Open projects by origin. Only 'reviewed template revision' can ever be guided; the rest answer with a refusal and a link to the project page.
SELECT CASE
         WHEN p."aiGuideId" IS NOT NULL                                  THEN '1 AI guide (never guided)'
         WHEN p."templateId" IS NULL                                     THEN '2 no template recorded (never guided)'
         WHEN p."templateRevisionId" IS NULL OR r.id IS NULL             THEN '3 template, no revision recorded (not guided)'
         WHEN r.provenance = 'LEGACY_BACKFILL'                           THEN '4 legacy revision, no review claim (not guided)'
         ELSE                                                                 '5 reviewed template revision (may be guided)'
       END AS origin,
       count(*) AS open_projects
FROM diy_projects p
LEFT JOIN diy_template_revisions r ON r.id = p."templateRevisionId"
WHERE p.status IN ('PLANNING', 'IN_PROGRESS')
GROUP BY 1 ORDER BY 1;

-- 2. Of the reviewed ones, where each revision stands now: current head, superseded (the guide says "a corrected version is available"), or withdrawn
--    (unpublished or archived: the guide says "withdrawn" and keeps the steps readable).
SELECT CASE
         WHEN r."retiredReason" IN ('UNPUBLISHED', 'ARCHIVED') OR t."publishedRevisionId" IS NULL THEN 'withdrawn'
         WHEN t."publishedRevisionId" <> r.id                                                       THEN 'superseded'
         ELSE                                                                                            'current'
       END AS revision_state,
       count(*) AS open_projects
FROM diy_projects p
JOIN diy_template_revisions r ON r.id = p."templateRevisionId" AND r.provenance = 'GOVERNED'
LEFT JOIN diy_project_templates t ON t.id = p."templateId"
WHERE p.status IN ('PLANNING', 'IN_PROGRESS') AND p."aiGuideId" IS NULL
GROUP BY 1 ORDER BY 1;

-- 3. Published templates a guide could be built on right now (an ACTIVE template whose head is a reviewed, governed revision). Zero is expected until the
--    first production template is authored and published (decision O7).
SELECT count(*) AS published_reviewed_templates
FROM diy_project_templates t
JOIN diy_template_revisions r ON r.id = t."publishedRevisionId"
WHERE t.status = 'ACTIVE' AND r.provenance = 'GOVERNED';

-- 4. A cheap pre-check of the step match for open projects on a reviewed revision: the number of steps equals the revision's, and none lacks a template step id.
--    APPROXIMATE: the guide also checks every id, the order, and every instruction field, and refuses on any difference. A row here will be refused; absence
--    from this list does not promise the guide will open.
SELECT p.id, p."propertyId", p.title,
       (SELECT count(*) FROM diy_project_steps s WHERE s."projectId" = p.id)                                  AS project_steps,
       jsonb_array_length(r."contentJson" -> 'steps')                                                          AS revision_steps,
       (SELECT count(*) FROM diy_project_steps s WHERE s."projectId" = p.id AND s."templateStepId" IS NULL)    AS steps_without_template_id
FROM diy_projects p
JOIN diy_template_revisions r ON r.id = p."templateRevisionId" AND r.provenance = 'GOVERNED'
WHERE p.status IN ('PLANNING', 'IN_PROGRESS') AND p."aiGuideId" IS NULL
  AND ( (SELECT count(*) FROM diy_project_steps s WHERE s."projectId" = p.id) <> jsonb_array_length(r."contentJson" -> 'steps')
     OR EXISTS (SELECT 1 FROM diy_project_steps s WHERE s."projectId" = p.id AND s."templateStepId" IS NULL) )
ORDER BY p."updatedAt" DESC;
