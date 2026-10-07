-- READ-ONLY. Run in pgAdmin before and after the DIY step command release (docs/operations/DIY_STEP_UPDATE_ROLLOUT.md). Changes nothing.
-- AUTHOR'S NOTE: these queries were written from the schema and have NOT been executed by the author (no database was provisioned for this slice). If one errors,
-- fix the query; it is not a sign of a problem in your data.
--
-- The ledger (diy_project_events) does NOT record which surface made a change (the project page or Ask), so nothing below can count "Ask commands" as such.
-- What these show is the state the commands act on and the invariants they must never break.

-- 1. What Ask would offer right now, per open project on a reviewed revision: the CURRENT step (the first step, in authored order, that is not COMPLETED or SKIPPED),
--    and whether Skip would be offered (optional AND no safety note). Mark-done is always offered on the current step. Zero rows is expected until a first template is
--    published and a project is started from it (decision O7).
SELECT p.id AS project_id, p."propertyId", p.title, cur."stepNumber" AS current_step_number, cur.title AS current_step_title, cur.status AS current_step_status,
       (cur."isOptional" AND COALESCE(btrim(cur."safetyNote"), '') = '') AS skip_offered
FROM diy_projects p
JOIN diy_template_revisions r ON r.id = p."templateRevisionId" AND r.provenance = 'GOVERNED'
JOIN LATERAL (
  SELECT s.* FROM diy_project_steps s
  WHERE s."projectId" = p.id AND s.status NOT IN ('COMPLETED', 'SKIPPED')
  ORDER BY s."stepNumber" LIMIT 1
) cur ON TRUE
WHERE p.status IN ('PLANNING', 'IN_PROGRESS') AND p."aiGuideId" IS NULL
ORDER BY p."updatedAt" DESC;

-- 2. Out-of-order progress: an open project with a finished step AFTER an unfinished one. The project page allows this; Ask only ever acts on the first unfinished
--    step and answers "this step has moved on" for the others. Informational, not an error.
SELECT p.id AS project_id, p.title,
       min(s."stepNumber") FILTER (WHERE s.status NOT IN ('COMPLETED', 'SKIPPED')) AS first_unfinished,
       max(s."stepNumber") FILTER (WHERE s.status IN ('COMPLETED', 'SKIPPED'))     AS last_finished
FROM diy_projects p JOIN diy_project_steps s ON s."projectId" = p.id
WHERE p.status IN ('PLANNING', 'IN_PROGRESS')
GROUP BY p.id, p.title
HAVING min(s."stepNumber") FILTER (WHERE s.status NOT IN ('COMPLETED', 'SKIPPED')) < max(s."stepNumber") FILTER (WHERE s.status IN ('COMPLETED', 'SKIPPED'))
ORDER BY p.title;

-- 3. INVARIANT (expect 0 rows): a finished step with no ledger row of the matching type. Every transition through updateStep writes one in the same transaction.
--    (Steps finished before the ledger existed will show here; look at their dates.)
SELECT s.id AS step_id, s."projectId", s."stepNumber", s.status, s."updatedAt"
FROM diy_project_steps s
WHERE (s.status = 'COMPLETED' AND NOT EXISTS (SELECT 1 FROM diy_project_events e WHERE e."stepId" = s.id AND e.type = 'STEP_COMPLETED'))
   OR (s.status = 'SKIPPED'   AND NOT EXISTS (SELECT 1 FROM diy_project_events e WHERE e."stepId" = s.id AND e.type = 'STEP_SKIPPED'))
ORDER BY s."updatedAt" DESC;

-- 4. INVARIANT (expect 0 rows): a COMPLETED step with no recorded actor. Both the page and Ask pass the actor.
SELECT s.id AS step_id, s."projectId", s."stepNumber", s."updatedAt"
FROM diy_project_steps s
WHERE s.status = 'COMPLETED' AND s."completedByUserId" IS NULL
ORDER BY s."updatedAt" DESC;

-- 5. INVARIANT (expect 0 rows after this release): a step that was SKIPPED although it is required or carries a safety note. The transition table refuses this.
--    Older rows written before step 2 may exist; check their dates.
SELECT s.id AS step_id, s."projectId", s."stepNumber", s."isOptional", (COALESCE(btrim(s."safetyNote"), '') <> '') AS has_safety_note, s."updatedAt"
FROM diy_project_steps s
WHERE s.status = 'SKIPPED' AND (NOT s."isOptional" OR COALESCE(btrim(s."safetyNote"), '') <> '')
ORDER BY s."updatedAt" DESC;

-- 6. Step changes made by someone who is not (now) a member of the property and not its owner. A removed member's EARLIER changes legitimately appear; a recent
--    change made after a removal would be the revocation window this release closes. Look at the dates against the removal.
SELECT e."projectId", e.type, e."actorUserId", e.at
FROM diy_project_events e
JOIN diy_projects p ON p.id = e."projectId"
JOIN properties pr ON pr.id = p."propertyId"
LEFT JOIN household_members m ON m."propertyId" = p."propertyId" AND m."userId" = e."actorUserId"
LEFT JOIN homeowner_profiles hp ON hp.id = pr."homeownerProfileId" AND hp."userId" = e."actorUserId"
WHERE e.type IN ('STEP_STARTED', 'STEP_COMPLETED', 'STEP_SKIPPED', 'STEP_REOPENED') AND m.id IS NULL AND hp.id IS NULL
ORDER BY e.at DESC LIMIT 100;

-- 7. Step changes by a VIEWER (expect none dated after this release: a viewer can no longer change a step through the service). Earlier rows may exist.
SELECT e."projectId", e.type, e."actorUserId", e.at
FROM diy_project_events e
JOIN diy_projects p ON p.id = e."projectId"
JOIN household_members m ON m."propertyId" = p."propertyId" AND m."userId" = e."actorUserId" AND m.role = 'VIEWER'
WHERE e.type IN ('STEP_STARTED', 'STEP_COMPLETED', 'STEP_SKIPPED', 'STEP_REOPENED')
ORDER BY e.at DESC LIMIT 100;

-- 8. Long-held locks right now (run while something looks stuck; empty is normal). The step command takes SHARE locks on a revision and its template for the few
--    statements of its transaction; a withdrawal waits behind it, and the reverse.
SELECT a.pid, a.state, now() - a.xact_start AS open_for, left(a.query, 120) AS query
FROM pg_stat_activity a
WHERE a.datname = current_database() AND a.xact_start IS NOT NULL AND now() - a.xact_start > interval '5 seconds' AND a.pid <> pg_backend_pid()
ORDER BY a.xact_start;
