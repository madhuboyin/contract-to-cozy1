# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference

Detailed architecture and patterns are documented in [`apps/CLAUDE.md`](apps/CLAUDE.md). This file covers repo-root concerns and supplements that guide.

## Development Commands

```bash
# From repo root:
make install      # Install all deps (frontend + backend)
make dev          # Start all services (postgres, redis, backend, frontend, workers)
make lint         # Lint frontend + backend
make test         # Run all tests

# Build Docker images
make build        # x86
make build-arm    # ARM64 (Raspberry Pi)
make deploy-pi    # Deploy to Raspberry Pi k3s
```

## Running Tests

### Frontend (Jest + jsdom)
```bash
cd apps/frontend
npm test                                          # All tests
npx jest src/__tests__/SomeComponent.test.tsx    # Single file
npx jest --watch                                 # Watch mode
npx jest --coverage                              # With coverage
```

### Backend (Node native test runner — NOT Jest)
```bash
cd apps/backend
npm test                                          # All tests
node --test tests/unit/decisionEngine.test.js    # Single unit test
node --test tests/integration/<file>.test.js     # Single integration test
node --test tests/unit/*.test.js                  # All unit tests
```

## Database (Prisma)

Schema lives at `apps/backend/prisma/schema.prisma`.

**IMPORTANT:** Never write migration scripts. Edit `prisma/schema.prisma` directly and run `npx prisma db push` to apply. Migration files are created manually when needed.

```bash
cd apps/backend
npx prisma generate      # Regenerate client after schema edit
npx prisma db push       # Apply schema changes without a migration file
npx prisma studio        # Visual DB browser (localhost:5555)
npm run seed             # Seed dev database
```

Workers reference the backend schema directly — `npx prisma generate` in `apps/workers/` picks it up.

## Environment Setup

Copy `.env.local.example` → `.env.local` at repo root and fill in secrets. Docker Compose uses this file. Key variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Token signing |
| `NEXT_PUBLIC_API_URL` | Backend URL seen by frontend (default `http://localhost:8080`) |
| `NEXT_PUBLIC_GEMINI_API_KEY` | Google Gemini AI features |
| `GEMINI_API_KEY` | Server-side Gemini key (backend) |

Generate secrets with `openssl rand -hex 32`.

## Test Users (seeded)

| Email | Password | Role |
|---|---|---|
| sarah@example.com | password123 | HOMEOWNER |
| mike@inspect.com | password123 | PROVIDER |
| tom@fixitpro.com | password123 | PROVIDER |
