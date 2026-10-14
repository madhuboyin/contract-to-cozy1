-- Renovation projects whose handoff was left partial (owner ruling D-H6). READ ONLY: nothing here changes data.
-- Run in pgAdmin. If it returns no rows there is nothing to repair and nothing to run.
--
-- A Project created from a renovation case is partial when it has no link to the case, no PROJECT_HANDOFF readiness event, or no
-- PROJECT_HANDOFF_STARTED case event. The repair is NOT SQL: it is `npx ts-node scripts/repair-renovation-handoffs.ts` (dry run by default), which
-- completes the same steps a new handoff performs, in one transaction, and needs the intake mode stated because it was never stored.

SELECT p.id AS project_id, p."propertyId", p.name, p.status AS project_status, c.lifecycle AS case_lifecycle, p."createdAt",
       NOT EXISTS (SELECT 1 FROM renovation_case_links l
                   WHERE l."renovationCaseId" = p."renovationCaseId" AND l."linkType" = 'PROJECT' AND l."targetId" = p.id) AS missing_case_link,
       NOT EXISTS (SELECT 1 FROM renovation_readiness_events e
                   WHERE e."renovationCaseId" = p."renovationCaseId" AND e."eventType" = 'PROJECT_HANDOFF' AND e.payload ->> 'projectId' = p.id) AS missing_readiness_event,
       NOT EXISTS (SELECT 1 FROM renovation_case_events e
                   WHERE e."renovationCaseId" = p."renovationCaseId" AND e."eventType" = 'PROJECT_HANDOFF_STARTED' AND e.payload ->> 'projectId' = p.id) AS missing_case_event
FROM project_records p
JOIN renovation_cases c ON c.id = p."renovationCaseId"
WHERE p."renovationCaseId" IS NOT NULL
  AND (
    NOT EXISTS (SELECT 1 FROM renovation_case_links l WHERE l."renovationCaseId" = p."renovationCaseId" AND l."linkType" = 'PROJECT' AND l."targetId" = p.id)
    OR NOT EXISTS (SELECT 1 FROM renovation_readiness_events e WHERE e."renovationCaseId" = p."renovationCaseId" AND e."eventType" = 'PROJECT_HANDOFF' AND e.payload ->> 'projectId' = p.id)
    OR NOT EXISTS (SELECT 1 FROM renovation_case_events e WHERE e."renovationCaseId" = p."renovationCaseId" AND e."eventType" = 'PROJECT_HANDOFF_STARTED' AND e.payload ->> 'projectId' = p.id)
  )
ORDER BY p."createdAt";
