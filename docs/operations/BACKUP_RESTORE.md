# Postgres Backup & Restore

Status: mechanism built and verified locally on 2026-07-09. **Not yet deployed to
the production Pi cluster** — see "What's left" at the bottom.

## What exists

| File | Purpose |
|---|---|
| `infrastructure/scripts/backup/pg_backup.sh` | Takes a `pg_dump -Fc` backup and prunes old ones. Runs in-cluster or locally. |
| `infrastructure/scripts/backup/pg_restore.sh` | Restores a `pg_dump -Fc` backup into a target database. Runs in-cluster or locally. |
| `infrastructure/kubernetes/data/postgres/backup-cronjob.yaml` | K8s `CronJob` + `PersistentVolumeClaim` that runs `pg_backup.sh` daily against the production `postgres` Service, using the existing `postgres-credentials` Secret. |

## How the CronJob works

- **Schedule**: `0 3 * * *` (03:00 UTC daily — low-traffic window for a
  homeowner-facing pilot app).
- **What it does**: runs `postgres:15-alpine` (same image family as the
  `postgres` StatefulSet, so `pg_dump` version matches the server) with
  `pg_backup.sh` mounted in via a `postgres-backup-script` ConfigMap, and dumps
  the `POSTGRES_DB` database (from the `postgres-credentials` Secret — same
  Secret, same three keys — `POSTGRES_USER`, `POSTGRES_PASSWORD`,
  `POSTGRES_DB` — that `statefulset.yaml` already uses; nothing new was
  invented) using `pg_dump -Fc` (custom format — required by `pg_restore`, and
  internally compressed).
- **Where dumps land**: a dedicated `postgres-backups` PVC (`local-path`
  storage class, 20Gi), mounted at `/backups` in the Job's pod. This is a
  **first cut** — the backup PVC lives on the same Raspberry Pi node/disk as
  the primary `postgres-data` PVC. It protects against logical mistakes
  (bad migration, accidental `DROP`, application bug that corrupts data) but
  **not** against node or disk failure. Pushing dumps to off-cluster object
  storage (S3/B2/rsync.net/etc.) is a deliberate, explicit follow-up — not
  wired up here because it needs real cloud credentials that don't exist yet
  in this environment.
- **Retention**: keeps the last 14 daily dumps (`RETENTION_COUNT=14` env var
  on the CronJob container); `pg_backup.sh` deletes anything older than that
  each run, scoped to dumps of the same `POSTGRES_DB` name (filename pattern
  `${POSTGRES_DB}_<UTC-timestamp>.dump`).
- **Failure visibility**: `pg_backup.sh` uses `set -euo pipefail`, checks the
  `pg_dump` exit code explicitly, and exits non-zero (after removing any
  partial `.in-progress` file) on any failure — it does not swallow errors.
  `restartPolicy: Never` + `backoffLimit: 2` on the Job means a failing
  backup shows up as a Failed Job, visible via:
  ```bash
  kubectl get cronjob postgres-backup -n production
  kubectl get jobs -n production -l app=postgres-backup
  kubectl logs -n production job/<failed-job-name>
  ```
  `activeDeadlineSeconds: 3600` bounds how long a hung `pg_dump` can occupy a
  slot before the Job is killed and retried on the next schedule.
- **Overlap safety**: `concurrencyPolicy: Forbid` — if a backup is still
  running when the next scheduled time arrives, the new one is skipped rather
  than piling up.

## Manually triggering a backup (in-cluster, once deployed)

```bash
kubectl create job -n production postgres-backup-manual-$(date +%s) \
  --from=cronjob/postgres-backup
kubectl get jobs -n production -l app=postgres-backup
```

## Restoring in production (procedure — has NOT been run against prod)

Restore is intentionally **not** automated (no restore CronJob) — it's a rare,
high-stakes, human-triggered action.

1. Get the dump off the `postgres-backups` PVC. Easiest path: `kubectl cp`
   from a pod that has the PVC mounted (e.g. spin up a throwaway debug pod
   mounting `postgres-backups`, or exec into a live backup Job pod if one is
   still around within its history-limit window):
   ```bash
   kubectl run pg-backup-access -n production --rm -it \
     --image=postgres:15-alpine --restart=Never \
     --overrides='{"spec":{"containers":[{"name":"pg-backup-access","image":"postgres:15-alpine","command":["sleep","3600"],"volumeMounts":[{"name":"backups","mountPath":"/backups"}]}],"volumes":[{"name":"backups","persistentVolumeClaim":{"claimName":"postgres-backups"}}]}}' \
     -- sleep 3600
   kubectl cp production/pg-backup-access:/backups/contracttocozy_<timestamp>.dump ./contracttocozy_<timestamp>.dump
   ```
2. Decide the restore target:
   - **Point-in-time recovery into the live `postgres` StatefulSet** (e.g.
     after a bad migration wiped data): this is destructive to whatever is
     currently in the target database. Take a fresh backup of current state
     first if there's any chance you'll want to compare/recover from it.
   - **Restore into a fresh scratch database/instance** to inspect/recover
     specific data without touching the live DB (safer default).
3. Port-forward to the target (see `database/backups/helper.md` for the
   existing pattern used in this repo):
   ```bash
   POD=$(kubectl get pod -n production -l app=postgres -o jsonpath='{.items[0].metadata.name}')
   kubectl port-forward -n production pod/$POD 5432:5432 &
   PASSWORD=$(kubectl get secret postgres-credentials -n production -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)
   ```
4. Run the restore script:
   ```bash
   PGHOST=127.0.0.1 PGPORT=5432 POSTGRES_USER=postgres \
   POSTGRES_PASSWORD="$PASSWORD" POSTGRES_DB=contracttocozy \
     ./infrastructure/scripts/backup/pg_restore.sh ./contracttocozy_<timestamp>.dump
   ```
   `pg_restore.sh` runs `pg_restore --clean --if-exists --no-owner
   --no-privileges` — it drops and recreates objects in the target database to
   match the dump, but does not touch other databases on the server.
5. Verify before declaring success — compare row counts on the tables that
   matter most (`users`, `properties`, and anything else relevant to the
   incident) against what you expect, the same way the local test below did.

## Local test performed (2026-07-09) — proof this actually works

This was run against the real local dev Postgres (`contracttocozy-postgres`,
`127.0.0.1:5433`, read-only `pg_dump` — non-destructive) and a disposable
container, **not** the production cluster.

1. Started a throwaway Postgres container (`c2c-backup-test-pg`, a separate
   container/volume from `contracttocozy-postgres` — the real dev DB was never
   stopped, restarted, or modified).
2. Ran `pg_backup.sh` against `contracttocozy-postgres` (`127.0.0.1:5433`),
   producing a real `pg_dump -Fc` file (~1.1MB, 277 tables in the `public`
   schema).
3. Ran `pg_restore.sh` to restore that dump into `c2c-backup-test-pg`
   (dropping/recreating the target database first for a clean slate). Exit
   code 0, zero errors in the restore log.
4. Verified correctness by deriving the exact table list from the dump's own
   table-of-contents (`pg_restore -l`, to avoid a race against the live dev DB,
   which had schema changes happening concurrently during testing — see note
   below), then running a single row-count query for all 277 tables against
   both the source (immediately after taking the backup) and the restored
   database.

**Result: all 277 tables matched exactly, row-for-row.** Total rows summed
across all tables: **198 on both sides**. Spot-checked key tables:

| Table | Source | Restored |
|---|---|---|
| `users` | 14 | 14 |
| `properties` | 2 | 2 |
| `inventory_items` | 9 | 9 |
| `inventory_rooms` | 5 | 5 |
| `provider_profiles` | 12 | 12 |
| `guidance_journeys` | 1 | 1 |

(Note: the first attempt at this comparison hit a naive TOCTOU issue — the dev
database had a schema change land mid-test, i.e. a table came into existence
between listing tables and counting them, unrelated to the backup mechanism
itself. Re-running the comparison using the dump's own table-of-contents as
the source of truth for "what tables exist" eliminated that race and produced
the clean, exact match above.)

5. Cleaned up: removed the `c2c-backup-test-pg` container (no volumes left
   behind) and all dump/scratch files created during the test. Confirmed
   `contracttocozy-postgres` was still running and healthy throughout and
   afterward.

To repeat this test yourself:
```bash
docker run -d --name c2c-backup-test-pg \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=test-throwaway-pw \
  -e POSTGRES_DB=contracttocozy -p 5434:5432 postgres:15-alpine

PGHOST=127.0.0.1 PGPORT=5433 POSTGRES_USER=postgres \
POSTGRES_PASSWORD=<value of POSTGRES_PASSWORD in .env.local> POSTGRES_DB=contracttocozy \
BACKUP_DIR=/tmp/backup-test RETENTION_COUNT=14 \
  ./infrastructure/scripts/backup/pg_backup.sh

PGHOST=127.0.0.1 PGPORT=5434 POSTGRES_USER=postgres \
POSTGRES_PASSWORD=test-throwaway-pw POSTGRES_DB=contracttocozy \
  ./infrastructure/scripts/backup/pg_restore.sh /tmp/backup-test/contracttocozy_<timestamp>.dump

# then compare row counts between the two, e.g.:
psql -h 127.0.0.1 -p 5433 -U postgres -d contracttocozy -c "SELECT count(*) FROM users;"
psql -h 127.0.0.1 -p 5434 -U postgres -d contracttocozy -c "SELECT count(*) FROM users;"

# cleanup
docker rm -f c2c-backup-test-pg
rm -rf /tmp/backup-test
```

## What's explicitly NOT done yet

- **Not deployed to the production cluster.** Nobody has run `kubectl apply`
  on `backup-cronjob.yaml` or created the `postgres-backup-script` ConfigMap
  in the `production` namespace. Until that happens, there is still no backup
  running anywhere in prod — this doc and the manifest only prove the
  mechanism works, they don't turn it on. Deploying is a separate decision for
  the repo owner.
- **Off-cluster storage.** Backups currently live on the same node/disk as the
  primary database (a `local-path` PVC). A full node/disk failure would take
  out both the primary data and the backups together. Shipping dumps to
  external object storage (S3, Backblaze B2, rsync.net, etc.) needs real
  credentials and a decision on which provider — not something to invent
  here.
- **Alerting on failure.** A failed CronJob is *visible* via `kubectl get
  cronjob` / `kubectl get jobs`, but nothing currently pages/notifies anyone
  when that happens. This repo already has Loki/Promtail/Prometheus running
  in the `monitoring` namespace (see `infrastructure/kubernetes/monitoring/`)
  — wiring a failed-Job alert through that stack is a reasonable next step but
  is not done.
- **Restore has only been tested locally against a disposable target**, not
  against the actual production StatefulSet. The prod restore procedure above
  is written from the same tooling and the working local mechanism, but
  hasn't itself been executed against prod (deliberately — restoring into a
  live prod DB is destructive and shouldn't be dry-run there).
