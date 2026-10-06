# DIY completion outbox: rollout (step 3 of the stateful GUIDE)

Plan: `docs/architecture/ASK_COZY_DIY_COMPLETION_OUTBOX_PLAN.md` (§4 is the order, §6 the gates). **Slices 3a (backend and worker) and 3b (disclosure, recovery route, page) are pushed; 3c (the real-Postgres acceptance through the real job, and this runbook) is built and was run locally. Nothing here has been applied to any database or deployed.** This file exists now because the backend's fatal start-up message points to it; 3c extends it.

## The order (one release train, sequential)

1. **Schema.** From `apps/backend`: `npx prisma db push` (adds the enum value `DIY_PROJECT_COMPLETED` to `DomainEventType`; nothing else for this step), then `npx prisma generate` in `apps/backend` **and** `apps/workers` (the worker's generated client was months stale on this machine; regenerate it before running any worker check).
2. **Worker gate, before any deploy.** From `apps/workers`: `npx tsc --noEmit`; `npm run lint:worker-import-boundary`; the unit tests `domainEventDispatchCoverage`, `diyCompletionAdaptersUnderWorkerStubs`, `processDomainEventsJob` (run with `node --require ts-node/register --require tsconfig-paths/register --test <files>`); then the production-style build and the smoke test:
   ```bash
   (cd apps/backend && npm run build)
   (cd apps/workers && node scripts/build-worker-backend-overrides.js ../backend/dist ./stubs && npx tsc --project tsconfig.docker.json && npx tsc-alias -p tsconfig.docker.json)
   (cd apps/workers && npm run smoke:built-worker)
   ```
3. **Deploy and restart the worker image** (`kubectl rollout restart`; a `:latest` tag does not restart by itself). Confirm it booted.
4. **Real-Postgres acceptance (3c)** against a scratch database, before the backend producer is enabled, when one is available (how: the section below). If none is, record that atomicity, leasing and duplicate-delivery behavior are unverified against Postgres at go-live; do not describe a later run as validating an already-safe rollout.
5. **Deploy and restart the backend.** It **refuses to start** (and so never becomes ready) if the database enum lacks `DIY_PROJECT_COMPLETED`; the message names step 1.
6. **Deploy the frontend** (slice 3b).

## What a misorder does

| Misorder | Result |
| --- | --- |
| Backend before `prisma db push` | The backend fails its start-up check and does not serve; nothing is half-done. |
| Backend before the new worker is running | Completions succeed; their outbox events wait, retry, and dead-letter after 8 attempts (hours). The page then shows "Some records could not be updated" with a **Finish recording** button, which re-queues the dead letter once a worker is running. |
| Frontend before the backend | The old page shows the home-event link only after a reload; no data harm. |

## Known pre-existing gap found while building the gate (not caused by this step)

`FOLLOW_UP_DUE` is an event type `claimFollowUpDue.poller.ts` emits for every due claim, but `processDomainEvents.job.ts` has no handler for it, so each such event fails, retries, and dead-letters after 8 attempts. The new dispatch test lists it as a known gap (`KNOWN_UNHANDLED`) so the gate stays exhaustive without hiding it. Whether claim follow-ups should notify someone is a product decision; nothing was changed. To see the effect in production: `SELECT status, count(*) FROM domain_events WHERE type = 'FOLLOW_UP_DUE' GROUP BY status;` (read-only).

## Looking at completions in production (read-only)

```sql
-- How completion effects are doing, by state (PENDING/PROCESSING/FAILED are still in progress; DEAD_LETTER needs a person to press "Finish recording").
SELECT status, count(*), min("createdAt") AS oldest FROM domain_events WHERE type = 'DIY_PROJECT_COMPLETED' GROUP BY status ORDER BY status;

-- Dead letters, with the reason and whether anyone has already tried recovery (payload.recovery).
SELECT "idempotencyKey", "propertyId", attempts, "lastError", payload -> 'recovery' AS recovery, "updatedAt"
FROM domain_events WHERE type = 'DIY_PROJECT_COMPLETED' AND status = 'DEAD_LETTER' ORDER BY "updatedAt" DESC;
```

## Checks after deploy (manual, in a browser; none of these has been run)

- Complete a project: the sheet closes and the page shows "Recording your completion." (no time promised); after the worker's next cycle the home timeline link appears.
- Complete a project linked to a maintenance task: the task shows completed and any seasonal item follows.
- A project linked to an incident: the note says the incident was not changed, and the incident itself is untouched.
- Open a project completed before this release: it says completion was recorded before effect tracking was added and offers no action.
- If a dead letter appears, press **Finish recording** as a household contributor; a viewer should not see the button.

## Running the real-Postgres acceptance (3c)

It runs the real completion service, the real `processDomainEventsJob`, the real handler and the real governed maintenance completion against a **throwaway** Postgres, 13 checks. It refuses any database whose name does not contain `scratch`, any non-local URL and port 5433, and it truncates the tables it seeds.

```bash
# 1. A scratch cluster (macOS: TCP only, the socket path is too long) and a database with the CURRENT schema. Postgres 15 here; the schema has two PostGIS
#    columns in unrelated tables, which the scratch copy turns into text and drops their two spatial indexes (see DIY_TEMPLATE_REVISIONS_ROLLOUT.md).
PGBIN=/usr/local/opt/postgresql@15/bin; D=<some scratch dir>
$PGBIN/initdb -D $D/data -U scratch --auth=trust
$PGBIN/pg_ctl -D $D/data -o "-p 54391 -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -l $D/pg.log -w start
$PGBIN/createdb -h 127.0.0.1 -p 54391 -U scratch scratch_c2c_3c
(cd apps/backend && npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > $D/ddl.sql)
sed -e 's/geography(Point, 4326)/TEXT/; s/geography(Geometry, 4326)/TEXT/' -e '/USING GIST ("locationPoint")/d' -e '/USING GIST ("geometry")/d' $D/ddl.sql > $D/ddl.scratch.sql
$PGBIN/psql -h 127.0.0.1 -p 54391 -U scratch -d scratch_c2c_3c -v ON_ERROR_STOP=1 -q -f $D/ddl.scratch.sql

# 2. From apps/workers (regenerate the worker's Prisma client first: npm run prisma:generate), without and then with the production stubs applied.
export SCRATCH_DATABASE_URL=postgresql://scratch@127.0.0.1:54391/scratch_c2c_3c
node --require ts-node/register --require tsconfig-paths/register --test tests/scratch/diyCompletionOutbox.scratch.js
WORKER_STUBS=1 node --require ts-node/register --require tsconfig-paths/register --test tests/scratch/diyCompletionOutbox.scratch.js
$PGBIN/pg_ctl -D $D/data stop
```

**What it did not cover** (so do not read a pass as more than this): the Docker image build and the Raspberry Pi image; Redis and the 30-second poller (the job is invoked directly); a crash between the maintenance status write and its side effects; production-sized data; any browser.
