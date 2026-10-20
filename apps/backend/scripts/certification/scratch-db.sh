#!/usr/bin/env bash
# Sole Homeowner Interface Phase 9: a throwaway PostgreSQL for the production-like certification checks.
#   scripts/certification/scratch-db.sh start   creates and starts it, pushes the schema, prints ASK_CERT_DATABASE_URL
#   scripts/certification/scratch-db.sh stop    stops it and deletes it
# It never touches any other database. PostGIS is not required: the two spatial columns (and their index) are left out of the scratch copy
# of the schema because nothing the certification checks read uses them.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$(cd "$HERE/../.." && pwd)"
ROOT="${ASK_CERT_DIR:-${TMPDIR:-/tmp}/ask-cert-db}"
PORT="${ASK_CERT_PORT:-54329}"
PGBIN="${PG_BIN:-$(dirname "$(command -v pg_ctl || echo /usr/local/opt/postgresql@15/bin/pg_ctl)")}"
SOCK="/tmp/ask-cert-sock"

case "${1:-}" in
  start)
    rm -rf "$ROOT"; mkdir -p "$ROOT" "$SOCK"
    "$PGBIN/initdb" -D "$ROOT/data" -U cert --auth=trust >/dev/null
    "$PGBIN/pg_ctl" -D "$ROOT/data" -o "-p $PORT -k $SOCK" -l "$ROOT/pg.log" -w start >/dev/null
    "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U cert -d postgres -qc "create database ask_cert" >/dev/null
    SCHEMA="$BACKEND/prisma/.cert-schema.prisma"
    grep -v 'locationPoint' "$BACKEND/prisma/schema.prisma" | grep -v 'Unsupported("geography' | grep -v '@@index(\[geometry\], type: Gist)' > "$SCHEMA"
    trap 'rm -f "$SCHEMA"' EXIT
    (cd "$BACKEND" && DATABASE_URL="postgresql://cert@127.0.0.1:$PORT/ask_cert" npx prisma db push --schema "$SCHEMA" --skip-generate --accept-data-loss >/dev/null)
    echo "export ASK_CERT_DATABASE_URL=postgresql://cert@127.0.0.1:$PORT/ask_cert"
    ;;
  stop)
    "$PGBIN/pg_ctl" -D "$ROOT/data" -m fast stop >/dev/null 2>&1 || true
    rm -rf "$ROOT" "$SOCK"
    echo "stopped and removed $ROOT"
    ;;
  *) echo "usage: $0 start|stop" >&2; exit 2 ;;
esac
