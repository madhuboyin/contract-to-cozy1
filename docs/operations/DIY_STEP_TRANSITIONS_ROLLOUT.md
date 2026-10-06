# DIY step and project transitions: rollout (step 2 of the stateful GUIDE)

Plan: `docs/architecture/ASK_COZY_DIY_STEP_TRANSITIONS_PLAN.md`. Slices 2a (service), 2b (routes, validators, page) and 2c (this runbook and the Postgres run) are committed. **Nothing here has been applied to any database or deployed; the steps below are yours to run.**

## What must ship together

- **2a and 2b ship together.** The service now requires a version token; the old page sends none, so on its own it could not update a step (400 `DIY_TOKEN_REQUIRED`). They are already one deploy: backend and frontend images from this commit or later.
- **Step 1 (template revisions) has its own ordering constraint** that still applies: run the revision backfill and verification before that code serves traffic (`docs/operations/DIY_TEMPLATE_REVISIONS_ROLLOUT.md`). If step 1 is already live, nothing more is needed.

## Order

1. **Schema:** from `apps/backend`, `npx prisma db push`. It adds `diy_project_events` (and its enum), `completedByUserId` on `diy_projects` and `diy_project_steps`, and `updatedAt` on `diy_project_steps` (default `now()`, so every existing step starts with a fresh version). All additive. Then `npx prisma generate` in `apps/backend` and `apps/workers`.
2. **Look before you ship (read-only):** run `apps/backend/prisma/diy-step-transitions-inflight.pgadmin.sql` in pgAdmin. Query 2 lists open projects whose required steps are all done but whose optional steps are unresolved. These people used to be offered "Complete Project" and now will be asked to do or skip the optional steps first (the page says how many). Query 1 also shows open projects with required steps open. Query 3 lists unresolved optional steps that carry a safety note, which can no longer be skipped. Nothing is changed; it tells you how many people will see the new message. There is no data fix to run: a project is never forced into a state.
3. **Deploy** backend and frontend together, then restart (the `:latest` tag does not restart pods by itself): `kubectl rollout restart` for the backend and frontend deployments.
4. **Expect for a short while:** a browser tab opened before the deploy has no tokens. Its first step change gets a 400 and the page shows an error; a reload fixes it.

## Check after deploy (manual, in a browser; none of this has been run)

- Open an in-progress project, mark a step done, reopen it, and mark it done again.
- Open the same project in two tabs, change a step in one, then change the same step in the other: the second tab should reload and say the project changed.
- A project with an optional step left: no "Complete Project" until the step is done or skipped; the hint names how many are left. A step with a safety note has no Skip.
- Finish a project: the home event exists and shows the person who finished it.

## What the scratch run covered, and did not

`apps/backend/tests/scratch/diyStepTransitions.scratch.js` (13 checks) runs the real service and Prisma client against an empty throwaway Postgres 15: token round trip through `timestamp(3)` and JSON; the version moving forward on every write; stale and missing tokens; two people on the same step and on different steps; 4 and 10 concurrent writers; completion against itself, against a reopen (40 jittered rounds, both orders occurred) and against an abandon; the completion rule; a refused completion leaving the caller's token valid; actor attribution and the ledger in order; and a project token going stale when any step changes. It refuses to run against anything that is not an obvious scratch database (name contains `scratch`, local URL, not port 5433) and truncates the tables it seeds.

Setup is the same scratch cluster as `DIY_TEMPLATE_REVISIONS_ROLLOUT.md` ("To repeat it"), with a database named `scratch_c2c_2c`, then:

```bash
SCRATCH_DATABASE_URL=postgresql://scratch@127.0.0.1:54391/scratch_c2c_2c node --test tests/scratch/diyStepTransitions.scratch.js
```

**Limits.** The schema copy substitutes plain text for two PostGIS columns in unrelated tables. The completion effects (maintenance task, incident, home event) are stubbed, so their failure behavior is not exercised; that is step 3. Contention was measured at 10 simultaneous writers on one project (all succeeded); a household is two or three people, and the retry loop allows 4 attempts, after which a writer gets a clean `DIY_STALE` and reloads. Not measured: production-sized data, the Raspberry Pi, the browser. A mutant that makes versions clock-only (could repeat within one millisecond) is not caught here, because awaited writes are never that close; the frozen-clock unit test from 2a covers it.
