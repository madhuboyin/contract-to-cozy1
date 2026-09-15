---
name: verify
description: Build, launch, and drive Contract to Cozy locally to verify frontend/backend changes end-to-end with Playwright.
---

# Verifying Contract to Cozy locally

## Launch

```bash
open -a Docker                                  # if daemon not running; wait ~15s
docker compose --env-file .env.local up -d postgres redis backend frontend
```

**Gotchas:**
- Plain `docker compose up` FAILS: compose interpolation reads `.env`, not `.env.local` — redis gets an empty `requirepass` and goes unhealthy. Always pass `--env-file .env.local`.
- The `workers` image build is broken/fragile (curated COPY list); skip it unless needed.
- Backend takes ~60s to boot (ts-node). Poll `POST /api/auth/login` rather than `/health`.
- Frontend and backend mount the repo source, so edits are live (next dev / nodemon).

## Schema drift (common after other sessions touch prisma)

Backend crashes with TS2305 (`@prisma/client has no exported member ...`) or requests 500 with Prisma P2021 (table does not exist):

```bash
docker exec contracttocozy-backend npx prisma generate
docker exec contracttocozy-backend npx prisma db push --skip-generate
docker restart contracttocozy-backend   # ALWAYS restart after db push — live connections still throw P2021
```

## Test identity

Seeded users (sarah@example.com etc.) may not exist in the local DB. Create a throwaway:

1. `POST /api/auth/register` — requires `acceptedTerms: true`.
2. Verify email flag manually: `docker exec contracttocozy-postgres psql -U postgres -d contracttocozy -c "UPDATE users SET \"emailVerified\" = true WHERE email = '...';"`
3. Auth is **cookie session + CSRF double-submit**, not bearer tokens. For curl: login with `-c cookies.txt`, then `GET /api/csrf-token` (same jar), then send `x-csrf-token: <token>` on writes. In Playwright just drive the login form — the app handles it.

## Host-side scripts connecting to Postgres (not via `docker exec`)

This host also runs an unrelated **native Postgres on port 5432** (confirmed via `lsof -nP -iTCP:5432 -sTCP:LISTEN` — a loopback-specific bind that silently wins over Docker's own wildcard bind on the same port for any `localhost:5432` connection made from outside the Docker network, e.g. a plain Node/psql process on the host). A `DATABASE_URL` built for a host-side script (a `.db.test.js` integration test, a one-off `psql`/`node -e` check) that points at `localhost:5432` will connect successfully but fail with `User "postgres" was denied access` (wrong server, wrong credentials) rather than a connection-refused error, which looks like a permissions bug, not a port conflict. Use **port 5433** instead — docker-compose.yml already publishes the project's Postgres there too, specifically for this. (`docker exec contracttocozy-backend ...`/the Docker network itself is unaffected — only host-side connections need the 5433 workaround.)

## Gemini API key may be invalid

`.env.local`'s `GEMINI_API_KEY` is not guaranteed to be live. Before spending time on anything that depends on a real model call (conversational capture/extraction, goal classification, any `ai:...` route), preflight it directly and cheaply:

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$(grep '^GEMINI_API_KEY=' .env.local | cut -d= -f2)"
```

`"API key not valid"` / `API_KEY_INVALID` means the configured key is dead — confirmed 2026-09-15, independent of the app (same result hitting Google's API directly). Don't try to fix or guess a replacement key yourself; tell the user and design around it: split LLM-dependent verification into an LLM-independent test of the downstream mechanism (using a hand-built candidate/fixture in place of the model's output) plus a separate live-extraction smoke test that preflights the key and skips cleanly (not a false pass or fail) when it can't reach the model.

## Rate limiter

Heavy scripted testing trips the Redis-backed limiter (429s persist across backend restarts). Clear it:

```bash
REDIS_PASS=$(grep REDIS_PASSWORD .env.local | cut -d= -f2)
docker exec contracttocozy-redis sh -c "redis-cli -a '$REDIS_PASS' --scan --pattern 'rl:*' | xargs -r redis-cli -a '$REDIS_PASS' DEL"
```

## Driving the UI

Playwright isn't in any repo package.json — `npm install playwright` in the scratchpad (Chromium is already in `~/Library/Caches/ms-playwright`). Login via the form at `/login`, then navigate to `http://localhost:3000/dashboard/properties/<id>/...`. Dismiss the cookie-consent banner (`button:has-text("Accept all")`) before interacting near the bottom of the page.
