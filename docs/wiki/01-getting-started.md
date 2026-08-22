[← Back to Wiki Home](README.md)

# Getting Started

This page covers running Contract to Cozy locally. It's a monorepo with three runtime apps — `apps/backend` (Express API), `apps/frontend` (Next.js), `apps/workers` (BullMQ job processors) — plus an `apps/ios` client.

## Prerequisites

- Docker (for the easiest path: Postgres + Redis + all three apps via Compose)
- Node.js (for running services individually without Docker)

## Environment setup

Copy `.env.local.example` → `.env.local` at the repo root and fill in secrets (`openssl rand -hex 32` works for generating token secrets). Docker Compose reads this file.

**Corrected against the real `.env.local.example`** (95 lines; the table below previously omitted several required secrets and listed one that doesn't exist):

| Variable | Purpose |
|---|---|
| `POSTGRES_PASSWORD` | Postgres password — required, no default |
| `REDIS_PASSWORD` | Redis password — required, no default |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` / `JWT_MFA_SECRET` | Token signing (access, refresh, and the short-lived MFA challenge token) |
| `SESSION_SECRET` / `CSRF_SECRET` | Session and CSRF protection |
| `MFA_ENCRYPTION_KEY` | AES-256 key (32-byte, as 64 hex chars) encrypting TOTP secrets at rest |
| `GEMINI_API_KEY` | Server-side Gemini key (backend only — optional, several AI features degrade gracefully without it) |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist (defaults to `http://localhost:3000` in dev) |
| `METRICS_BEARER_TOKEN` / `SWAGGER_PASSWORD` | Optional: gate `/metrics` and `/api/docs` |

`DATABASE_URL`, `REDIS_HOST`/`REDIS_PORT`, and `NEXT_PUBLIC_API_URL` are **not** developer-set values — Docker Compose hardcodes/derives them (`DATABASE_URL` is built from `POSTGRES_PASSWORD`; see `docker-compose.yml`). There is no `NEXT_PUBLIC_GEMINI_API_KEY` anywhere in this codebase — Gemini is called server-side only; a prior version of this table listed one, which was wrong.

## Running everything with Docker (recommended)

```bash
# From repo root:
make install      # Install deps for frontend + backend
make dev          # Start postgres, redis, backend, frontend, workers via docker-compose
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8080 (Swagger docs at `/api/docs`)

## Running services individually (without Docker)

Requires Postgres + Redis running locally.

```bash
cd apps/backend && npm run dev     # nodemon, port 8080
cd apps/frontend && npm run dev    # next dev, port 3000
cd apps/workers && npm run dev     # nodemon
```

## Database (Prisma)

The schema lives at `apps/backend/prisma/schema.prisma`.

> **Important:** Never write migration scripts by hand. Edit `prisma/schema.prisma` directly and run `npx prisma db push` to apply changes; migration files are created manually only when needed.

```bash
cd apps/backend
npx prisma generate      # Regenerate Prisma client after a schema edit
npx prisma db push       # Apply schema changes without a migration file
npx prisma studio        # Visual DB browser at localhost:5555
npm run seed             # Seed the dev database
```

`apps/workers` references the same backend schema — after any schema change, also run `npx prisma generate` inside `apps/workers` so the client there stays in sync.

## Seeded test users

| Email | Password | Role |
|---|---|---|
| sarah@example.com | password123 | HOMEOWNER |
| mike@inspect.com | password123 | PROVIDER |
| tom@fixitpro.com | password123 | PROVIDER |

## Running tests

**Frontend (Jest + jsdom):**
```bash
cd apps/frontend
npm test                                       # All tests
npx jest src/__tests__/SomeComponent.test.tsx  # Single file
npx jest --watch
npx jest --coverage
```

**Backend (Node's native test runner — not Jest):**
```bash
cd apps/backend
npm test                                        # All tests
node --test tests/unit/decisionEngine.test.js   # Single unit test
node --test tests/integration/<file>.test.js    # Single integration test
node --test tests/unit/*.test.js                # All unit tests
```

End-to-end, load, and security tests live at the repo root under `tests/e2e/`, `tests/load/`, `tests/security/`.

## Lint & build

```bash
make lint     # Lint frontend + backend

cd apps/backend && npm run build   # tsc → dist/
cd apps/frontend && npm run build  # next build
cd apps/workers && npm run build   # tsc → dist/
```

**Correction — `make lint` is currently broken:** it runs `npm run lint` in both `apps/frontend` and `apps/backend` (`Makefile` line ~35), but `apps/backend/package.json` has no `lint` script defined — the backend half of this command fails with "Missing script: lint." Only `cd apps/frontend && npm run lint` on its own actually works today.

## Docker images & deployment

```bash
make build        # Build x86 Docker images
make build-arm     # Build ARM64 images (production runs on a Raspberry Pi k3s cluster)
make deploy-pi     # Deploy to the Raspberry Pi k3s cluster
```

**Correction — `make build` and `make build-arm` are currently broken:** both run `docker build ... ./apps/frontend` and `./apps/backend` with no `-f` flag, which makes Docker look for a Dockerfile at `apps/frontend/Dockerfile` / `apps/backend/Dockerfile` — neither exists. The real Dockerfiles live at `infrastructure/docker/{frontend,backend,workers}/Dockerfile`. Until the `Makefile` is fixed to point `-f` at those paths (or the targets are otherwise updated), build images directly, e.g. `docker build -f infrastructure/docker/backend/Dockerfile .`

See **[Architecture & Data Model](02-architecture-and-data-model.md)** for how these pieces fit together, and the `features/` pages for what each part of the product actually does.

---
[← Back to Wiki Home](README.md)
