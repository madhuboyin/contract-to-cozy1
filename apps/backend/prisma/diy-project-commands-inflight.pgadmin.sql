-- READ-ONLY. Run in pgAdmin before and after the DIY project commands release (docs/operations/DIY_PROJECT_COMMANDS_ROLLOUT.md). Changes nothing.
-- AUTHOR'S NOTE: these queries were written from the schema and have NOT been executed by the author (no database was provisioned for this slice). If one errors,
-- fix the query; it is not a sign of a problem in your data.
--
-- The ledger (diy_project_events) does NOT record which surface made a change (the project page or Ask), so nothing below can count "Ask commands" as such.
-- What these show is the state the commands act on and the invariants they must never break.

-- 1. Where the records that follow a project completion stand, by outbox status. DEAD_LETTER rows are the ones the recovery action can queue again. Zero rows is expected
--    until a first template is published and a project is finished (decision O7), but completions made on the page are included.
SELECT e.status AS outbox_status, count(*) AS completed_projects, min(e."updatedAt") AS oldest_update
FROM diy_projects p
JOIN domain_events e ON e."idempotencyKey" = 'diy-project-completed:' || p.id
WHERE p.status = 'COMPLETED'
GROUP BY e.status ORDER BY e.status;

-- 2. INVARIANT (expect 0 rows after the outbox release): a project completed from its steps (basis STEPS) with no outbox row. A normal completion writes both in one transaction.
SELECT p.id, p."propertyId", p.title, p."completedAt"
FROM diy_projects p
WHERE p.status = 'COMPLETED' AND p."completionBasis" = 'STEPS'
  AND NOT EXISTS (SELECT 1 FROM domain_events e WHERE e."idempotencyKey" = 'diy-project-completed:' || p.id)
ORDER BY p."completedAt" DESC;

-- 3. INVARIANT (expect 0 rows): a project completed from its steps (basis STEPS) that still has an unfinished step. Completion requires every step resolved, checked inside the
--    transaction that holds the project row. (A project closed from its linked task, basis LINKED_TASK, may legitimately have open steps.)
SELECT p.id, p.title, p."completedAt", count(*) FILTER (WHERE s.status NOT IN ('COMPLETED', 'SKIPPED')) AS unfinished_steps
FROM diy_projects p JOIN diy_project_steps s ON s."projectId" = p.id
WHERE p.status = 'COMPLETED' AND p."completionBasis" = 'STEPS'
GROUP BY p.id, p.title, p."completedAt"
HAVING count(*) FILTER (WHERE s.status NOT IN ('COMPLETED', 'SKIPPED')) > 0
ORDER BY p."completedAt" DESC;

-- 4. INVARIANT (expect 0 rows): a closed project missing the fields its status implies, or its ledger row.
SELECT p.id, p.status, p."completedAt", p."abandonedAt", p."completedByUserId"
FROM diy_projects p
WHERE (p.status = 'COMPLETED' AND (p."completedAt" IS NULL OR p."completedByUserId" IS NULL))
   OR (p.status IN ('ABANDONED', 'HIRED_OUT') AND p."abandonedAt" IS NULL)
   OR (p.status = 'COMPLETED' AND p."completionBasis" = 'STEPS' AND NOT EXISTS (SELECT 1 FROM diy_project_events e WHERE e."projectId" = p.id AND e.type = 'PROJECT_COMPLETED'))
   OR (p.status = 'ABANDONED' AND NOT EXISTS (SELECT 1 FROM diy_project_events e WHERE e."projectId" = p.id AND e.type = 'PROJECT_ABANDONED'))
   OR (p.status = 'HIRED_OUT' AND NOT EXISTS (SELECT 1 FROM diy_project_events e WHERE e."projectId" = p.id AND e.type IN ('PROJECT_HIRED_OUT', 'PROJECT_CLOSED_BY_LINKED_TASK')));

-- 5. Dead-lettered DIY requests waiting to be queued again, with their age: the completion events and the linked-task reconciliation events. These are what the two recovery actions
--    act on (the task one only while the project is still open). A dead letter that is old and untouched deserves a look at its lastError in the worker logs.
SELECT e.type, e."idempotencyKey", e."propertyId", e.attempts, e."updatedAt", e.payload -> 'recovery' AS earlier_recoveries
FROM domain_events e
WHERE e.type IN ('DIY_PROJECT_COMPLETED', 'DIY_TASK_COMPLETED_RECONCILE') AND e.status = 'DEAD_LETTER'
ORDER BY e."updatedAt";

-- 6. Recoveries that were asked for more than once on the same request (a request that keeps dead-lettering).
SELECT e.type, e."idempotencyKey", (e.payload -> 'recovery' ->> 'count')::int AS recoveries, e.payload -> 'recovery' ->> 'lastBy' AS last_by, e.status
FROM domain_events e
WHERE e.type IN ('DIY_PROJECT_COMPLETED', 'DIY_TASK_COMPLETED_RECONCILE') AND (e.payload -> 'recovery' ->> 'count')::int >= 2
ORDER BY recoveries DESC;

-- 7. Reopened steps in the last 14 days, per project (informational: Ask offers Reopen from the previous-step view; the page has always allowed it).
SELECT e."projectId", count(*) AS reopens, max(e.at) AS last_reopen
FROM diy_project_events e
WHERE e.type = 'STEP_REOPENED' AND e.at > now() - interval '14 days'
GROUP BY e."projectId" ORDER BY reopens DESC, last_reopen DESC LIMIT 50;

-- 8. Project-level changes (finish, stop, hand off) made by someone who is not (now) a member of the property and not its owner, or who is a VIEWER. A removed member's EARLIER
--    changes legitimately appear; a recent one after a removal would be the revocation window this release closes for stop. Compare dates with the removal.
SELECT e."projectId", e.type, e."actorUserId", e.at, m.role AS member_role
FROM diy_project_events e
JOIN diy_projects p ON p.id = e."projectId"
JOIN properties pr ON pr.id = p."propertyId"
LEFT JOIN household_members m ON m."propertyId" = p."propertyId" AND m."userId" = e."actorUserId"
LEFT JOIN homeowner_profiles hp ON hp.id = pr."homeownerProfileId" AND hp."userId" = e."actorUserId"
WHERE e.type IN ('PROJECT_COMPLETED', 'PROJECT_ABANDONED', 'PROJECT_HIRED_OUT') AND ((m.id IS NULL AND hp.id IS NULL) OR m.role = 'VIEWER')
ORDER BY e.at DESC LIMIT 100;

-- 9. A stopped or handed-off project whose linked maintenance task is still open: expected (stopping never changes the task). Informational, so the task is not mistaken for an error.
SELECT p.id AS project_id, p.status, p."maintenanceTaskId", t.status AS task_status, p."abandonedAt"
FROM diy_projects p JOIN property_maintenance_tasks t ON t.id = p."maintenanceTaskId"
WHERE p.status IN ('ABANDONED', 'HIRED_OUT') AND t.status <> 'COMPLETED'
ORDER BY p."abandonedAt" DESC LIMIT 50;

-- 10. Long-held transactions right now (run while something looks stuck; empty is normal). Finish and the step commands take SHARE locks on a revision and its template for the few
--     statements of their transaction; a withdrawal waits behind them, and the reverse.
SELECT a.pid, a.state, now() - a.xact_start AS open_for, left(a.query, 120) AS query
FROM pg_stat_activity a
WHERE a.datname = current_database() AND a.xact_start IS NOT NULL AND now() - a.xact_start > interval '5 seconds' AND a.pid <> pg_backend_pid()
ORDER BY a.xact_start;
