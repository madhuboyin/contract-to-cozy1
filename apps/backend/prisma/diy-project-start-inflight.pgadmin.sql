-- READ-ONLY. Run in pgAdmin before and after the DIY project start release (docs/operations/DIY_PROJECT_START_ROLLOUT.md). Changes nothing.
-- AUTHOR'S NOTE: these queries were written from the schema and have NOT been executed by the author (no database was provisioned for this slice). If one errors,
-- fix the query; it is not a sign of a problem in your data.
--
-- The project row does not record which surface started it (the project page or Ask), so Ask starts cannot be counted as such. What these show is what the start must never break.

-- 1. INVARIANT after the release (expect 0 rows): two or more OPEN projects (planning or in progress) started from the same template on the same property. The start now serializes on a
--    (property, template) advisory lock and refuses a second one. Rows created BEFORE the release may legitimately appear: look at their createdAt before concluding anything.
SELECT p."propertyId", p."templateId", count(*) AS open_projects, min(p."createdAt") AS first_created, max(p."createdAt") AS last_created
FROM diy_projects p
WHERE p."templateId" IS NOT NULL AND p.status IN ('PLANNING', 'IN_PROGRESS')
GROUP BY p."propertyId", p."templateId"
HAVING count(*) > 1
ORDER BY max(p."createdAt") DESC;

-- 2. INVARIANT (expect 0 rows): a project started from a template that has no steps. The start copies the steps of the published revision in the same transaction as the project.
SELECT p.id, p."propertyId", p.title, p."createdAt"
FROM diy_projects p
WHERE p."templateRevisionId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM diy_project_steps s WHERE s."projectId" = p.id)
ORDER BY p."createdAt" DESC;

-- 3. Projects started from a template, by day and revision provenance (GOVERNED is what Ask starts; LEGACY_BACKFILL can only come from the page). Zero rows is expected until a first
--    template is published (decision O7).
SELECT date_trunc('day', p."createdAt") AS day, r.provenance, count(*) AS projects_started
FROM diy_projects p JOIN diy_template_revisions r ON r.id = p."templateRevisionId"
GROUP BY 1, 2 ORDER BY 1 DESC, 2;

-- 4. Open projects whose revision has since been withdrawn (informational): they keep working as projects but the guide discloses the withdrawal.
SELECT p.id, p."propertyId", p.title, r."retiredReason", r."retiredAt"
FROM diy_projects p JOIN diy_template_revisions r ON r.id = p."templateRevisionId"
WHERE p.status IN ('PLANNING', 'IN_PROGRESS') AND r."retiredAt" IS NOT NULL
ORDER BY r."retiredAt" DESC;

-- 5. Projects started by someone who is not a member of the property now (compare with removal dates; the start checks CONTRIBUTOR inside its transaction, so this is only expected for
--    members removed later).
SELECT p.id, p."propertyId", p."userId", p."createdAt"
FROM diy_projects p
WHERE p."templateRevisionId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM household_members m WHERE m."propertyId" = p."propertyId" AND m."userId" = p."userId" AND m.role IN ('CONTRIBUTOR', 'OWNER'))
  AND NOT EXISTS (SELECT 1 FROM properties pr JOIN homeowner_profiles h ON h.id = pr."homeownerProfileId" WHERE pr.id = p."propertyId" AND h."userId" = p."userId")
ORDER BY p."createdAt" DESC;

-- 6. Long-held transactions or waiting advisory locks right now (a start that is stuck would show here).
SELECT pid, state, wait_event_type, wait_event, now() - xact_start AS open_for, left(query, 120) AS query
FROM pg_stat_activity
WHERE datname = current_database() AND (wait_event = 'advisory' OR (xact_start IS NOT NULL AND now() - xact_start > interval '30 seconds'))
ORDER BY xact_start;
