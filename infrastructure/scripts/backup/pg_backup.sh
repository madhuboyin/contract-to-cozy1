#!/usr/bin/env bash
#
# pg_backup.sh — dump a Postgres database with `pg_dump -Fc` and prune old dumps.
#
# Used by:
#   - infrastructure/kubernetes/data/postgres/backup-cronjob.yaml (in-cluster, daily,
#     mounted into the postgres:15-alpine container via a ConfigMap and run as the
#     CronJob's command)
#   - manual/local runs, e.g. for on-demand backups or testing the mechanism itself
#     (see docs/operations/BACKUP_RESTORE.md for a worked example against the local
#     docker-compose Postgres)
#
# This script writes a single custom-format (-Fc) dump, which is the format expected
# by pg_restore.sh. It is safe to run against a live database — pg_dump takes an
# MVCC snapshot and does not block or mutate the source.
#
# Required env vars:
#   POSTGRES_PASSWORD  - password for POSTGRES_USER (no default, on purpose)
#
# Optional env vars (defaults match docker-compose.yml / the postgres-credentials
# k8s Secret used by infrastructure/kubernetes/data/postgres/statefulset.yaml):
#   PGHOST            - Postgres host (default: 127.0.0.1)
#   PGPORT            - Postgres port (default: 5432)
#   POSTGRES_USER     - Postgres user (default: postgres)
#   POSTGRES_DB       - database to dump (default: contracttocozy)
#   BACKUP_DIR        - directory dumps are written to (default: /backups)
#   RETENTION_COUNT   - how many dumps of this DB to keep; older ones are deleted
#                       (default: 14)
#
# Usage:
#   PGHOST=127.0.0.1 PGPORT=5433 POSTGRES_PASSWORD=xxx BACKUP_DIR=/tmp/backups \
#     ./pg_backup.sh
#
# Exit status: non-zero if the dump failed. Deliberately does NOT swallow errors —
# the CronJob relies on this to mark the Job as Failed.

set -euo pipefail

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-contracttocozy}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_COUNT="${RETENTION_COUNT:-14}"

if [ -z "${POSTGRES_PASSWORD:-}" ]; then
  echo "[pg_backup] ERROR: POSTGRES_PASSWORD is not set" >&2
  exit 1
fi

export PGPASSWORD="$POSTGRES_PASSWORD"

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
DUMP_FILE="${BACKUP_DIR}/${POSTGRES_DB}_${TIMESTAMP}.dump"
TMP_FILE="${DUMP_FILE}.in-progress"

echo "[pg_backup] Starting backup of ${POSTGRES_DB}@${PGHOST}:${PGPORT} -> ${DUMP_FILE}"

if ! pg_dump -h "$PGHOST" -p "$PGPORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$TMP_FILE"; then
  echo "[pg_backup] ERROR: pg_dump failed, aborting (no partial dump left behind)" >&2
  rm -f "$TMP_FILE"
  exit 1
fi

if [ ! -s "$TMP_FILE" ]; then
  echo "[pg_backup] ERROR: pg_dump produced an empty file" >&2
  rm -f "$TMP_FILE"
  exit 1
fi

mv "$TMP_FILE" "$DUMP_FILE"

DUMP_SIZE="$(du -h "$DUMP_FILE" | cut -f1)"
echo "[pg_backup] Backup complete: ${DUMP_FILE} (${DUMP_SIZE})"

# --- Retention: keep only the most recent RETENTION_COUNT dumps for this DB ---
echo "[pg_backup] Enforcing retention: keep last ${RETENTION_COUNT} dumps of ${POSTGRES_DB}"

shopt -s nullglob
ALL_DUMPS=("${BACKUP_DIR}/${POSTGRES_DB}"_*.dump)
shopt -u nullglob

# `ls -t` sorts newest-first by mtime and works the same on GNU (Alpine, used by the
# CronJob container) and BSD (macOS, used for local testing).
if [ "${#ALL_DUMPS[@]}" -gt "$RETENTION_COUNT" ]; then
  mapfile -t SORTED_DUMPS < <(ls -1t "${ALL_DUMPS[@]}")
  for f in "${SORTED_DUMPS[@]:$RETENTION_COUNT}"; do
    echo "[pg_backup] Deleting old backup: $f"
    rm -f "$f"
  done
else
  echo "[pg_backup] Nothing to prune (${#ALL_DUMPS[@]} dump(s) present, retention is ${RETENTION_COUNT})"
fi

echo "[pg_backup] Done."
