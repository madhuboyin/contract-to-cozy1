[← Back to Wiki Home](README.md)

# Getting Started

This page covers running Contract to Cozy locally. It's a monorepo with three runtime apps — `apps/backend` (Express API), `apps/frontend` (Next.js), `apps/workers` (BullMQ job processors) — plus an `apps/ios` client.

## Prerequisites

- Docker (for the easiest path: Postgres + Redis + all three apps via Compose)
- Node.js (for running services individually without Docker)

## Environment setup

Copy `.env.local.example` → `.env.local` at the repo root and fill in secrets (`openssl rand -hex 32` works for generating token secrets). Docker Compose reads this file.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_HOST` / `REDIS_PORT` | Redis for BullMQ job queues |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Token signing |
| `NEXT_PUBLIC_API_URL` | Backend URL seen by the frontend (default `http://localhost:8080`) |
| `NEXT_PUBLIC_GEMINI_API_KEY` | Google Gemini AI features (frontend) |
| `GEMINI_API_KEY` | Server-side Gemini key (backend) |

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

## Docker images & deployment

```bash
make build        # Build x86 Docker images
make build-arm     # Build ARM64 images (production runs on a Raspberry Pi k3s cluster)
make deploy-pi     # Deploy to the Raspberry Pi k3s cluster
```

See **[Architecture & Data Model](02-architecture-and-data-model.md)** for how these pieces fit together, and the `features/` pages for what each part of the product actually does.

---
[← Back to Wiki Home](README.md)
