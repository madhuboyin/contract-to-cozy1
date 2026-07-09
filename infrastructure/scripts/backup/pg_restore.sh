#!/usr/bin/env bash
#
# pg_restore.sh — restore a pg_dump custom-format (-Fc) backup, as produced by
# pg_backup.sh, into a target Postgres database.
#
# WARNING: this is destructive against the TARGET database (it drops and recreates
# objects there via --clean). Only ever point it at a throwaway/restore-target
# database, or at a database you genuinely intend to overwrite. It never touches
# the source database a backup was taken from.
#
# Required env vars:
#   POSTGRES_PASSWORD  - password for POSTGRES_USER on the TARGET server (no default)
#
# Optional env vars:
#   PGHOST            - target Postgres host (default: 127.0.0.1)
#   PGPORT            - target Postgres port (default: 5432)
#   POSTGRES_USER     - target Postgres user (default: postgres)
#   POSTGRES_DB       - target database name to restore INTO; created if it doesn't
#                       exist (default: contracttocozy)
#
# Usage:
#   PGHOST=127.0.0.1 PGPORT=<throwaway-port> POSTGRES_PASSWORD=xxx POSTGRES_DB=contracttocozy \
#     ./pg_restore.sh /path/to/dumpfile.dump
#
# Exit status: non-zero if pg_restore reported any errors.

set -euo pipefail

DUMP_FILE="${1:?Usage: pg_restore.sh <dump-file>}"

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-contracttocozy}"

if [ -z "${POSTGRES_PASSWORD:-}" ]; then
  echo "[pg_restore] ERROR: POSTGRES_PASSWORD is not set" >&2
  exit 1
fi

if [ ! -f "$DUMP_FILE" ]; then
  echo "[pg_restore] ERROR: dump file not found: $DUMP_FILE" >&2
  exit 1
fi

export PGPASSWORD="$POSTGRES_PASSWORD"

echo "[pg_restore] Ensuring target database '${POSTGRES_DB}' exists on ${PGHOST}:${PGPORT}"
DB_EXISTS="$(psql -h "$PGHOST" -p "$PGPORT" -U "$POSTGRES_USER" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname = '${POSTGRES_DB}'")"

if [ "$DB_EXISTS" != "1" ]; then
  echo "[pg_restore] Database '${POSTGRES_DB}' does not exist yet, creating it"
  psql -h "$PGHOST" -p "$PGPORT" -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE \"${POSTGRES_DB}\""
fi

echo "[pg_restore] Restoring ${DUMP_FILE} into ${POSTGRES_DB}@${PGHOST}:${PGPORT}"

if ! pg_restore -h "$PGHOST" -p "$PGPORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --clean --if-exists --no-owner --no-privileges --verbose "$DUMP_FILE"; then
  echo "[pg_restore] ERROR: pg_restore reported errors" >&2
  exit 1
fi

echo "[pg_restore] Restore complete."
