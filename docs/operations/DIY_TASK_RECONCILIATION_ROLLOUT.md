# DIY reverse reconciliation: rollout (step 4 of the stateful GUIDE)

Plan: `docs/architecture/ASK_COZY_DIY_TASK_RECONCILIATION_PLAN.md` (§5 is the order, §6 the slices). **Slices 4a (schema, the atomic request, the worker handler and the project transitions) and 4b (disclosure, recovery, page) are built and verified locally; 4c (the real-Postgres acceptance and the read-only queries) is not done. Nothing here has been applied to any database or deployed.** This file exists now because the backend's fatal start-up message points to it; 4c completes it.

## The order (one release train, sequential; the same rules as step 3)

1. **Schema.** From `apps/backend`: `npx prisma db push`, then `npx prisma generate` in `apps/backend` **and** `apps/workers`. It adds, all additive: the enum value `DIY_TASK_COMPLETED_RECONCILE` on `DomainEventType`, the enum value `PROJECT_CLOSED_BY_LINKED_TASK` on `DiyProjectEventType`, the new enum `DiyCompletionBasis`, the nullable column `diy_projects.completionBasis`, and the index on `diy_projects.maintenanceTaskId`. (If step 3's push has not been done yet, this one includes it.)
2. **Worker gate**, before any deploy, from `apps/workers`: `npx tsc --noEmit`; `npm run lint:worker-import-boundary`; the unit tests `domainEventDispatchCoverage`, `diyCompletionAdaptersUnderWorkerStubs`, `processDomainEventsJob`; then the production-style build and the smoke test (commands in `DIY_COMPLETION_OUTBOX_ROLLOUT.md`; the smoke test now covers both DIY event types).
3. **Deploy and restart the worker image**, and confirm it booted. **The backend must not emit the new event before a worker that handles it is running.**
4. **Real-Postgres acceptance (4c)** against a scratch database before the backend producer is enabled, when one is available; otherwise record that atomicity, leasing and duplicate-delivery behavior are unverified against Postgres at go-live.
5. **Deploy and restart the backend.** It **refuses to start** (and so never becomes ready) if the database enum lacks `DIY_PROJECT_COMPLETED` or `DIY_TASK_COMPLETED_RECONCILE`. This matters more than in step 3: the reconciliation request is written inside **every** governed maintenance-task completion that has an open DIY project linked to it, so a missing value would fail those ordinary task completions, not just DIY ones.
6. **Deploy the frontend** (slice 4b).

## What a misorder does

| Misorder | Result |
| --- | --- |
| Backend before `prisma db push` | The backend fails its start-up check and does not serve. |
| Backend before the new worker is running | Task completions succeed; their reconciliation events wait, retry, and dead-letter after 8 attempts (hours). The page shows "Some updates from your linked task could not be applied" with a **Finish updating** button. |
| Frontend before the backend | No harm: the page shows what the project read gives it. |

## Behavior to expect (so none of it is a surprise)

- **Most task completions will leave a linked project open and "needs review".** Only the Home Action rich-completion path records whether the work was done by the household or a provider; the ordinary maintenance status endpoint, Ask's maintenance confirmation, the project tracker, the seasonal checklist and the generic task edit record no mode. The approved rule (O12) is never to infer one.
- **A recurring task's routine completion** will close a linked in-progress project when its recorded mode is DIY and the project's steps are not all done (with basis "linked task", steps untouched, no home event).
- **Two raw writers still complete tasks with no reconciliation request** (recall resolution and an inspection check coming back "met"); the page will show those projects as "needs review" because that is computed from the task's current state.
