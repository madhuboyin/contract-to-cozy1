# Postgres on Longhorn — Migration Requirements

Status: requirements only, drafted 2026-07-11. No manifests changed yet.
Triggered by the 2026-07-11 production outage: the sole node carrying the
`role: database` label (`mb-06-rbp5-deb`) went `NotReady`, and since
`postgres-data` is a `local-path` (node-local) PVC, the `postgres-0` pod could
not be rescheduled anywhere else — total login/API outage until that specific
board recovered after a manual reboot. See chat history same day for the full
incident timeline.

## Background: current state (verified against manifests in this repo)

- `infrastructure/kubernetes/data/postgres/statefulset.yaml`: `postgres`
  StatefulSet, `replicas: 1`, PVC `storageClassName: local-path`, `100Gi`,
  `nodeSelector: { role: database }`.
- `infrastructure/kubernetes/overlays/raspberry-pi/node-selector.yaml`: a
  strategic-merge patch that further pins the StatefulSet to
  `kubernetes.io/hostname: pi-node-6`. **This does not match any real node
  hostname** (real hostnames are `mb-0N-rbp5-deb`) — either stale/orphaned or
  silently inert. Needs to be resolved (fixed or removed) as part of this
  work regardless of the Longhorn decision, since a hostname selector is the
  opposite of what failover requires.
- `infrastructure/kubernetes/overlays/production/` is empty (`.gitkeep` only)
  — `overlays/raspberry-pi` is the overlay actually deployed to prod. (Stated
  here explicitly so this doc isn't read against the wrong overlay later.)
- `infrastructure/kubernetes/data/postgres/backup-cronjob.yaml`: daily
  `pg_dump` CronJob, dumps land on a **separate `postgres-backups` PVC that is
  also `local-path`, on the same node** as the primary data. Per
  `docs/operations/BACKUP_RESTORE.md`, as of 2026-07-09 this CronJob has **not
  been applied to the production cluster** — confirm current deploy state
  before treating backups as a safety net during this migration (see Open
  Questions).
- Longhorn is confirmed already live and in production use on this cluster:
  `infrastructure/kubernetes/monitoring/loki/loki-longhorn-values.yaml` moved
  Loki's `singleBinary.persistence` onto `storageClass: "longhorn"`, with a
  comment noting it was done to get onto "your healthy mb-08 storage." This
  both confirms the storage class name (`longhorn`, no guessing needed) and
  implies at least one node's local disk is already known to be degraded —
  relevant context for which nodes should/shouldn't host Postgres's Longhorn
  replicas (see R3).

## Goals

1. A node failure (the exact failure mode from 2026-07-11) no longer causes
   an open-ended outage — the `postgres-0` pod reschedules onto a surviving
   node automatically, with data intact, on the order of a pod restart, not a
   wait for a human to find and power-cycle a specific board.
2. `postgres-backups` no longer lives exclusively on the same physical disk
   as the primary data.
3. Close the stale/mismatched node-selector patch so it can't cause a
   confusing failure later (either it's inert today and rots further, or it's
   silently constraining scheduling — both are bad).

## Explicit non-goals

- **Not** multi-master / zero-downtime Postgres HA. `replicas` stays `1` on
  the StatefulSet. Postgres itself has no notion of two writers against
  independently-initialized `PGDATA` directories — running `replicas: 2` on
  this StatefulSet as-is would produce two independent, diverging databases,
  not a hot standby. True active/passive failover (Patroni, repmgr,
  CloudNativePG) is a materially larger undertaking (leader election,
  streaming replication, connection routing) and is out of scope here given
  this is a pilot-scale app on Pi hardware.
- **Not** eliminating the brief service interruption during a node failure.
  Expected behavior post-migration: pod terminates on the dead node, k8s
  reschedules it onto another eligible node, Longhorn attaches the volume
  there (using a synced replica), Postgres runs crash recovery (WAL replay).
  This is a bounded interruption (rough order: tens of seconds), not zero.
- **Not** wiring off-cluster (S3/B2/rsync.net) backup storage. That's the
  already-documented follow-up in `BACKUP_RESTORE.md` and needs real
  credentials/provider decision — orthogonal to this migration, though moving
  `postgres-backups` onto Longhorn (R2) meaningfully improves on today's
  single-point-of-failure without needing those credentials.

## Requirements

### R1 — `postgres-data` PVC moves to the `longhorn` storage class

- New `StorageClass`-backed PVC (`storageClassName: longhorn`) replacing the
  current `local-path` volume claim template in `statefulset.yaml`.
- Because `storageClassName` on an existing PVC is immutable and Longhorn
  cannot simply "adopt" a `local-path` volume in place, this requires a data
  migration (see R5), not an in-place edit.
- Volume size: preserve `100Gi` unless current usage data says otherwise —
  confirm actual usage before deciding (`kubectl exec` into the current pod
  and check `df -h /var/lib/postgresql/data`) since Longhorn replicates the
  full volume size N times (see R4), so oversizing here has a real multiplied
  storage cost on Pi-scale disks.

### R2 — `postgres-backups` PVC moves to the `longhorn` storage class

- Same storage class change in `backup-cronjob.yaml`'s PVC. Unlike R1, this
  one is a clean cutover (no live data to preserve mid-flight beyond existing
  dump files, which are disposable/regenerable on the next scheduled run) —
  no special migration procedure needed, just confirm whether existing dumps
  in the old PVC are worth copying forward or can be left to regenerate.
- Explicitly confirm (per Open Questions) whether this CronJob is even
  running in prod yet before assuming it as a safety net for R5's migration.

### R3 — Multi-node eligibility for Postgres scheduling

- Longhorn only protects against node loss if a **surviving** node is both
  schedulable for the pod and holds (or can quickly rebuild) a data replica.
  Today exactly one node (`mb-06-rbp5-deb`) is labeled `role: database`.
- Label at least 2–3 nodes with `role: database` (exact count depends on how
  many boards can spare `1 CPU / 2Gi request` — Postgres's current resource
  request — without starving other workloads; needs a current
  `kubectl describe nodes` capacity check, not assumed here).
- Given the "healthy mb-08" comment in `loki-longhorn-values.yaml`, treat
  node disk health as a real selection input, not just labeling arbitrary
  nodes — check Longhorn's own node/disk health status
  (`kubectl get nodes.longhorn.io -n longhorn-system`) before choosing which
  nodes are eligible.
- Fix or remove `overlays/raspberry-pi/node-selector.yaml`'s
  `kubernetes.io/hostname: pi-node-6` patch — a hostname pin defeats the
  entire point of this migration by construction, regardless of how many
  nodes carry `role: database`.

### R4 — Longhorn volume replica count

- Set Longhorn `numberOfReplicas` to 2 or 3 for the `postgres-data` volume
  (via a dedicated Longhorn `StorageClass`/`Volume` parameter, not the
  default used for e.g. Loki's single-replica-factor setup — Postgres's
  durability requirements are higher than Loki's 24h-retention log store).
  Exact count is a storage-budget vs. durability tradeoff across however many
  nodes come out of R3 — needs a decision, not just a default.
- Confirm replicas will be scheduled on **distinct physical disks/nodes**
  (Longhorn's default anti-affinity behavior) — otherwise "3 replicas on the
  same degraded SD card" provides zero protection.

### R5 — Migration procedure for existing data (no live-volume clone)

Reuse the already-built, already-tested backup/restore tooling
(`infrastructure/scripts/backup/pg_backup.sh` /
`infrastructure/scripts/backup/pg_restore.sh`, validated locally per
`BACKUP_RESTORE.md`) rather than inventing a new migration path:

1. Take a fresh `pg_dump -Fc` of the live production database.
2. Stand up the new Longhorn-backed `postgres-data` PVC (R1) — either as a
   new StatefulSet name/PVC alongside the old one, or by deleting and
   recreating the existing PVC (StatefulSet PVCs aren't recreated
   automatically on spec change) — decide based on acceptable downtime
   window.
3. Restore the dump into the new volume via `pg_restore.sh`.
4. Verify: row counts on key tables (same method `BACKUP_RESTORE.md`'s local
   test already used — `users`, `properties`, etc.) match between old and
   new before cutting traffic over.
5. Cut the `postgres` Service/StatefulSet over to the new PVC; keep the old
   `local-path` PVC untouched and unattached for a rollback window (see R7)
   rather than deleting it immediately.

This is a real (brief) maintenance window, not a hot migration — flag to
stakeholders before scheduling.

### R6 — Failover must be actually tested, not just configured

- After cutover, deliberately `kubectl cordon` + `kubectl drain` (or power
  off) the node currently running `postgres-0` and confirm:
  - the pod reschedules onto a different `role: database` node,
  - Longhorn attaches the volume there without manual intervention,
  - the application recovers (login works again) without any manual
    `kubectl` action beyond observing it.
- Record how long this took end-to-end — that number is the real answer to
  "how much better is this than before," not the migration itself.

### R7 — Rollback plan

- Keep the old `local-path` `postgres-data` PVC intact and unattached for a
  defined retention window (e.g. matching backup retention, 14 days) after
  cutover, in case the Longhorn-backed volume shows unexpected performance or
  stability issues on this hardware.
- Rollback path if Longhorn causes problems: point the StatefulSet back at
  the old PVC (data will be stale by however long Longhorn was live — a gap
  that would need to be reconciled from a backup taken at cutover time, not
  silently ignored).

## Open questions to resolve before implementation (not assumed in this doc)

1. **Is `postgres-backup` CronJob actually deployed in prod right now?**
   `BACKUP_RESTORE.md` says no as of 2026-07-09. If still no, there is
   currently zero backup safety net for R5's migration step — confirm and,
   if needed, deploy the existing CronJob first, independent of the Longhorn
   work.
2. **Current `postgres-data` disk usage** — needed to right-size the new
   Longhorn volume and estimate the replicated storage footprint (usage ×
   `numberOfReplicas`) against actual free disk on candidate nodes.
3. **Which nodes are healthy enough to be Longhorn replica targets?** — the
   "healthy mb-08" comment suggests this cluster already has known disk
   health variance across boards; get current Longhorn node/disk status
   before picking R3/R4's node set, don't assume all non-`mb-06` nodes are
   equally suitable.
4. **Acceptable maintenance window** for the R5 cutover — determines whether
   this happens as a scheduled low-traffic-window operation (matching the
   backup CronJob's own 03:00 UTC low-traffic assumption) or needs more
   careful sequencing.
5. **Resource headroom** on candidate `role: database` nodes for Postgres's
   `1 CPU / 2Gi` request (`4Gi`/`2 CPU` limit) plus whatever Longhorn's own
   per-node engine/replica overhead adds — not confirmed here.

## Success criteria

- A `role: database` node can be drained or powered off and `postgres-0`
  recovers on a different node automatically, verified live (R6), with the
  application functional again without manual `kubectl` intervention beyond
  observation.
- `postgres-data` and `postgres-backups` both report `storageClassName:
  longhorn` with `numberOfReplicas >= 2`, replicas confirmed on distinct
  nodes/disks.
- The stale `pi-node-6` hostname selector no longer exists in the overlay.
- Old `local-path` PVC retained, unattached, for the agreed rollback window,
  then cleaned up.
