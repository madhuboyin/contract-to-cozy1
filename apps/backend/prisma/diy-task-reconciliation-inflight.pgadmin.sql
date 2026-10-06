-- READ-ONLY. Run in pgAdmin before and after the reverse-reconciliation release (docs/operations/DIY_TASK_RECONCILIATION_ROLLOUT.md). Changes nothing.
--
-- From this release, completing a maintenance task that has an open DIY project linked to it asks a worker to update that project from what the completion
-- recorded (docs/architecture/ASK_COZY_DIY_TASK_RECONCILIATION_PLAN.md). These queries show what the release will meet, and how it is going.

-- 1. BEFORE: open DIY projects whose linked task is ALREADY completed. They get no automatic update (the completion predates the release) and the page will
--    show "review the project" for them. Split by whether that completion recorded who did the work: only 'DIY' or 'PROVIDER' would ever have been applied.
SELECT coalesce(t."completionMetadata" ->> 'fulfillmentMode', '(not recorded)') AS recorded_mode,
       count(*)                                                                  AS open_projects,
       count(DISTINCT p."maintenanceTaskId")                                     AS distinct_tasks
FROM diy_projects p
JOIN property_maintenance_tasks t ON t.id = p."maintenanceTaskId" AND t."propertyId" = p."propertyId"
WHERE p.status IN ('PLANNING', 'IN_PROGRESS') AND t.status = 'COMPLETED'
GROUP BY 1 ORDER BY 2 DESC;

-- 2. Open DIY projects pointing at a task that does not exist on their property (deleted, or linked across properties before creation was validated).
SELECT p.id, p."propertyId", p.title, p.status, p."maintenanceTaskId"
FROM diy_projects p
LEFT JOIN property_maintenance_tasks t ON t.id = p."maintenanceTaskId" AND t."propertyId" = p."propertyId"
WHERE p.status IN ('PLANNING', 'IN_PROGRESS') AND p."maintenanceTaskId" IS NOT NULL AND t.id IS NULL
ORDER BY p."updatedAt" DESC;

-- 3. Tasks linked by more than one open project (each is reconciled on its own; a routine completion can change several at once).
SELECT p."maintenanceTaskId", count(*) AS open_projects, array_agg(p.id ORDER BY p."createdAt") AS project_ids
FROM diy_projects p
WHERE p.status IN ('PLANNING', 'IN_PROGRESS') AND p."maintenanceTaskId" IS NOT NULL
GROUP BY p."maintenanceTaskId" HAVING count(*) > 1
ORDER BY 2 DESC;

-- 4. AFTER: how the reconciliation requests are doing, by state (PENDING/PROCESSING/FAILED are still in progress; DEAD_LETTER needs a person to press
--    "Finish updating" on the project).
SELECT status, count(*) AS events, min("createdAt") AS oldest
FROM domain_events WHERE type = 'DIY_TASK_COMPLETED_RECONCILE' GROUP BY status ORDER BY status;

-- 5. AFTER: what the finished requests did, per project (one row per snapshotted project; the outcome is recorded on the event).
SELECT o.key AS project_id, o.value AS outcome, e."idempotencyKey", e."updatedAt"
FROM domain_events e,
     LATERAL jsonb_each_text(coalesce(e.payload -> 'processingOutcome' -> 'projectOutcomes', e.payload -> 'projectOutcomes', '{}'::jsonb)) AS o
WHERE e.type = 'DIY_TASK_COMPLETED_RECONCILE'
ORDER BY e."updatedAt" DESC LIMIT 200;

-- 6. AFTER: dead letters, with the reason and whether anyone has already tried recovery (payload.recovery).
SELECT "idempotencyKey", "propertyId", attempts, "lastError", payload -> 'recovery' AS recovery, "updatedAt"
FROM domain_events WHERE type = 'DIY_TASK_COMPLETED_RECONCILE' AND status = 'DEAD_LETTER' ORDER BY "updatedAt" DESC;

-- 7. AFTER: projects closed from their linked task, by how (HIRED_OUT: a provider completed the task; COMPLETED: completed with DIY while steps were open).
SELECT status, "completionBasis", count(*) AS projects
FROM diy_projects WHERE "completionBasis" = 'LINKED_TASK' GROUP BY 1, 2 ORDER BY 3 DESC;
