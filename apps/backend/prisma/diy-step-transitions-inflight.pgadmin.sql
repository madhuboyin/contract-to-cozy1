-- READ-ONLY. Run in pgAdmin before the step-transitions release (docs/operations/DIY_STEP_TRANSITIONS_ROLLOUT.md). Changes nothing.
--
-- From this release a DIY project can be finished only when every required step is COMPLETED and every optional step is COMPLETED or SKIPPED.
-- Before it, a project could be finished with steps still open. This lists the projects still open (PLANNING or IN_PROGRESS) that the new rule would
-- stop from finishing, with what is unresolved, so you can see who will meet the new "N steps are still open" message. It does not touch them.

-- 1. Open projects and how many steps stand between them and finishing.
SELECT p.id,
       p."propertyId",
       p.title,
       p.status,
       p."updatedAt",
       count(*) FILTER (WHERE NOT s."isOptional" AND s.status <> 'COMPLETED')                     AS required_open,
       count(*) FILTER (WHERE s."isOptional" AND s.status NOT IN ('COMPLETED', 'SKIPPED'))        AS optional_unresolved,
       count(*)                                                                                   AS total_steps
FROM diy_projects p
JOIN diy_project_steps s ON s."projectId" = p.id
WHERE p.status IN ('PLANNING', 'IN_PROGRESS')
GROUP BY p.id
HAVING count(*) FILTER (WHERE NOT s."isOptional" AND s.status <> 'COMPLETED') > 0
    OR count(*) FILTER (WHERE s."isOptional" AND s.status NOT IN ('COMPLETED', 'SKIPPED')) > 0
ORDER BY optional_unresolved DESC, p."updatedAt" DESC;

-- 2. The case that is NEW for people: every required step is done, so the old page offered "Complete Project", but optional steps are unresolved,
--    so the new rule asks them to finish or skip those first (the page shows a hint saying how many).
SELECT p.id, p."propertyId", p.title, p.status, p."updatedAt",
       count(*) FILTER (WHERE s."isOptional" AND s.status NOT IN ('COMPLETED', 'SKIPPED')) AS optional_unresolved
FROM diy_projects p
JOIN diy_project_steps s ON s."projectId" = p.id
WHERE p.status IN ('PLANNING', 'IN_PROGRESS')
GROUP BY p.id
HAVING count(*) FILTER (WHERE NOT s."isOptional" AND s.status <> 'COMPLETED') = 0
   AND count(*) FILTER (WHERE s."isOptional" AND s.status NOT IN ('COMPLETED', 'SKIPPED')) > 0
ORDER BY p."updatedAt" DESC;

-- 3. Open projects that were created from a step list that carries a safety note on an OPTIONAL step: those steps can no longer be skipped, only done.
SELECT p.id, p."propertyId", p.title, s."stepNumber", s.title AS step_title, s.status
FROM diy_projects p
JOIN diy_project_steps s ON s."projectId" = p.id
WHERE p.status IN ('PLANNING', 'IN_PROGRESS')
  AND s."isOptional" AND s."safetyNote" IS NOT NULL AND btrim(s."safetyNote") <> '' AND s.status NOT IN ('COMPLETED', 'SKIPPED')
ORDER BY p."updatedAt" DESC, s."stepNumber";
