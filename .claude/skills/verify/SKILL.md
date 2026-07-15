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

## Rate limiter

Heavy scripted testing trips the Redis-backed limiter (429s persist across backend restarts). Clear it:

```bash
REDIS_PASS=$(grep REDIS_PASSWORD .env.local | cut -d= -f2)
docker exec contracttocozy-redis sh -c "redis-cli -a '$REDIS_PASS' --scan --pattern 'rl:*' | xargs -r redis-cli -a '$REDIS_PASS' DEL"
```

## Driving the UI

Playwright isn't in any repo package.json — `npm install playwright` in the scratchpad (Chromium is already in `~/Library/Caches/ms-playwright`). Login via the form at `/login`, then navigate to `http://localhost:3000/dashboard/properties/<id>/...`. Dismiss the cookie-consent banner (`button:has-text("Accept all")`) before interacting near the bottom of the page.
