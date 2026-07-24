# Postgres: local-path → Longhorn migration

## Why

`postgres-0`'s volume currently uses the `local-path` StorageClass, which
physically pins the data to one node's local disk (`mb-06-rbp5-deb`, via
`nodeSelector: role: database`). When that node went `NotReady` on
2026-07-23, `postgres-0` became permanently unschedulable — Kubernetes had
no other node it could legally place the pod on, because the PV's
`nodeAffinity` required that exact hostname. See the PV's node affinity:

```
Node Affinity:
  Required Terms:
    Term 0: kubernetes.io/hostname in [mb-06-rbp5-deb]
```

Longhorn replicates volume data across multiple nodes, so losing one node
no longer means losing the volume — Kubernetes can reschedule the pod
anywhere Longhorn has a healthy replica.

## Pre-flight facts (confirmed 2026-07-23)

| Check | Result |
|---|---|
| Current pod | `postgres-0` Running on `mb-06-rbp5-deb` (recovered) |
| Actual DB size | 267 MB (well under the 100Gi PVC allocation — dump/restore will be fast) |
| `pg_dump` / `pg_restore` in container | Present at `/usr/local/bin/` |
| Longhorn StorageClass | `longhorn`, provisioner `driver.longhorn.io`, `numberOfReplicas: 3` |
| Longhorn node coverage | `longhorn-manager` + `longhorn-csi-plugin` running on all 9 nodes (mb-01 through mb-09), including the control-plane node |
| Longhorn UI | Not externally exposed — reach it via `kubectl port-forward svc/longhorn-frontend -n longhorn-system 8080:80` then open `http://localhost:8080` |

Side note, not part of this migration: both `local-path` and `longhorn`
are currently marked `(default)` StorageClass. Harmless here since this
manifest always sets `storageClassName` explicitly, but worth cleaning up
separately since two defaults is an ambiguous cluster config for any
future PVC that doesn't specify one.

## What changes in `statefulset.yaml`

Two edits to `infrastructure/kubernetes/data/postgres/statefulset.yaml`:

1. `volumeClaimTemplates[0].spec.storageClassName`: `local-path` → `longhorn`
2. Remove `spec.template.spec.nodeSelector: { role: database }` entirely.

**Do not skip #2.** It's the actual fix, not a cleanup detail. The
`nodeSelector` only exists because `local-path` forces node-pinning. If
storage moves to Longhorn but the pod stays pinned to `mb-06-rbp5-deb` by
label, the volume becomes resilient but the *pod* is still a single point
of failure — you'd have moved the SPOF, not removed it. Longhorn's own
CSI driver + Kubernetes scheduler decide where the pod runs; no manual
node selector is needed once storage isn't node-local.

`volumeClaimTemplates` is immutable on an existing StatefulSet object, so
this can't be applied in place — the StatefulSet has to be deleted and
recreated (see steps below). The `Service` and the `postgres-config`
ConfigMap are untouched by this migration and don't need to be
deleted/recreated.

## Migration steps

There are no real users on this environment, so a short offline
dump/restore window is fine — no need for a live replication cutover.
Given the 267MB size, expect the whole downtime window (steps 3–7) to be
a few minutes.

### 1. Take a dump while the current pod is still up

```bash
kubectl exec -n production postgres-0 -- sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/postgres-backup.dump'

kubectl cp production/postgres-0:/tmp/postgres-backup.dump ./postgres-backup.dump
```

Verify the file actually landed and isn't empty before proceeding:

```bash
ls -lh ./postgres-backup.dump
```

This dump is your rollback point — don't proceed past step 3 (deleting
the old PVC) until this file exists and has a reasonable size (should be
well under 267MB compressed).

### 2. Edit the manifest

Apply the two changes described above to
`infrastructure/kubernetes/data/postgres/statefulset.yaml`.

### 3. Scale down and delete the old PVC

```bash
kubectl scale statefulset postgres -n production --replicas=0
kubectl delete statefulset postgres -n production
kubectl delete pvc postgres-data-postgres-0 -n production
```

Deleting the PVC triggers the `local-path` PV's `Delete` reclaim policy —
the backing directory on `mb-06-rbp5-deb`'s disk is removed. This is the
irreversible step; it's why step 1 has to come first.

### 4. Apply the updated StatefulSet

```bash
kubectl apply -f infrastructure/kubernetes/data/postgres/statefulset.yaml
```

This recreates a fresh `postgres-data-postgres-0` PVC from the updated
(Longhorn-backed) `volumeClaimTemplate`, and Kubernetes schedules
`postgres-0` onto whichever healthy node Longhorn/the scheduler picks —
no longer restricted to one node.

Wait for it to come up:

```bash
kubectl get pod postgres-0 -n production -w
```

### 5. Restore the dump

```bash
kubectl cp ./postgres-backup.dump production/postgres-0:/tmp/postgres-backup.dump

kubectl exec -n production postgres-0 -- sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists /tmp/postgres-backup.dump'
```

### 6. Verify

```bash
# Data landed
kubectl exec -n production postgres-0 -- sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT pg_size_pretty(pg_database_size(current_database()));"'

# New PVC is actually Longhorn-backed
kubectl get pvc postgres-data-postgres-0 -n production
kubectl get pv | grep postgres

# Backend/workers reconnected without a restart (Service DNS name is unchanged)
kubectl logs -n production -l app=api --tail=50 | grep -i -E "database|postgres|error"
```

Spot-check a couple of the manually-populated config tables (the ones set
up via pgAdmin SQL scripts, not Prisma seed) to confirm they came through
the dump/restore intact — these wouldn't be recreated by `prisma db seed`
if something in this process were skipped.

### 7. Confirm replica health

```bash
kubectl port-forward svc/longhorn-frontend -n longhorn-system 8080:80
# open http://localhost:8080, find the postgres-data-postgres-0 volume,
# confirm it shows 3 healthy replicas spread across different nodes.
```

## Rollback

If the restore fails or looks wrong at step 6, the old PVC/PV are already
gone (deleted in step 3) — the only way back is `pg_restore` from
`./postgres-backup.dump` again into whatever state the new volume is in,
or re-running from a clean `pg_restore --clean --if-exists` pass. Keep
`postgres-backup.dump` until you're fully satisfied with step 6 and 7.
