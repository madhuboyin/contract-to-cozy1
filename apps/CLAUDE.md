# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Contract to Cozy (C2C) is a property management platform connecting homeowners with service providers. It provides maintenance tracking, risk assessment, financial tools, AI-powered insights (via Google Gemini), and a service booking marketplace. The platform supports PWA/offline-first mobile usage.

## Repository Structure

This is the `apps/` directory of a monorepo with three applications:

- **`backend/`** — Express.js REST API (port 8080)
- **`frontend/`** — Next.js 14 app-router frontend (port 3000)
- **`workers/`** — BullMQ background job processors

Supporting directories at the repo root (`../`):
- `infrastructure/` — Docker, Kubernetes (k3s), Terraform configs
- `database/` — Migrations and seed files
- `docs/functional/` — Feature specifications (~23 docs)

## Development Commands

### Local development (with Docker)
```bash
# From repo root:
make install          # Install deps for frontend + backend
make dev              # Start all services via docker-compose (postgres, redis, backend, frontend, workers)
```

### Running services individually (without Docker)
```bash
# Backend (requires Postgres + Redis running)
cd apps/backend && npm run dev     # nodemon, port 8080

# Frontend
cd apps/frontend && npm run dev    # next dev, port 3000

# Workers
cd apps/workers && npm run dev     # nodemon
```

### Build
```bash
cd apps/backend && npm run build   # tsc → dist/
cd apps/frontend && npm run build  # next build
cd apps/workers && npm run build   # tsc → dist/
```

### Lint
```bash
cd apps/frontend && npm run lint   # next lint (ESLint 9)
```

### Database
```bash
cd apps/backend && npx prisma generate        # Regenerate Prisma client after schema changes
cd apps/backend && npx prisma migrate dev      # Create/apply migrations
cd apps/backend && npx prisma db seed          # Seed database
cd apps/backend && npx prisma studio           # Visual DB browser
```

### Docker images
```bash
make build            # Build x86 Docker images
make build-arm        # Build ARM64 images (Raspberry Pi)
make deploy-pi        # Deploy to Raspberry Pi k3s cluster
```

## Architecture

### Backend (`apps/backend/`)

**Pattern:** Routes → Controllers → Services → Prisma ORM

- **Entry point:** `src/index.ts` — Express app with all route mounting
- **Routes (52 files):** `src/routes/` — Define endpoints with middleware chains. Some feature routes live in colocated directories (`src/community/`, `src/sellerPrep/`, `src/localUpdates/`)
- **Controllers (41 files):** `src/controllers/` — Request handling and response formatting
- **Services (77+ files):** `src/services/` — Business logic and Prisma queries
- **Middleware:** `src/middleware/` — `auth.middleware` (JWT verification + profile attachment), `validate.middleware` (Zod schema validation), `rateLimiter.middleware`, `propertyAuth.middleware` (property-level access control)
- **Validators:** `src/utils/validators.ts` — Zod v4 schemas for request validation, applied via `validateBody(schema)` middleware
- **Prisma schema:** `prisma/schema.prisma` (~102KB) — PostgreSQL, 30+ models

**Key API prefixes:** `/api/auth`, `/api/properties`, `/api/providers`, `/api/bookings`, `/api/risk`, `/api/gemini`, `/api/inventory`, `/api/room-insights`, `/api/home-events`

**Financial routes** use a versioned prefix: `/api/v1/financial-efficiency`, `/api/v1/properties`

**Auth:** JWT tokens in `Authorization: Bearer <token>` header. Three roles: `HOMEOWNER`, `PROVIDER`, `ADMIN`.

**API Docs:** Swagger UI at `/api/docs` (auto-generated from JSDoc annotations on routes)

### Frontend (`apps/frontend/`)

**Framework:** Next.js 14 with App Router

- **Route groups:** `(auth)/` for login/register, `(dashboard)/` for authenticated pages
- **Path alias:** `@/*` maps to `./src/*`
- **API client:** `src/lib/api/client.ts` — Centralized typed client with ~120 endpoint methods
- **Auth:** `src/lib/auth/AuthContext.tsx` — React context for JWT session management
- **State:** TanStack React Query v5 for server state (5min stale time, 10min cache)
- **UI:** Radix UI primitives + Tailwind CSS. Components in `src/components/ui/`
- **Types:** `src/types/index.ts` (~37KB) — All shared TypeScript interfaces
- **PWA:** Service worker registration, IndexedDB storage (`src/lib/storage/`), offline fallback pages
- **Styling:** Tailwind with CSS variable theming, dark mode via class strategy, custom fonts (Poppins headings, Inter body)

### Workers (`apps/workers/`)

**Queue system:** BullMQ backed by Redis

- **Entry:** `src/worker.ts` — Registers job processors and cron schedules
- **Jobs:** `src/jobs/` — Seasonal checklists, notifications (email/push/SMS), recall ingestion/matching, report generation, inventory draft cleanup
- **Runners/pollers:** `src/runners/` — Long-running pollers for report exports, domain events, email queues

## Key Patterns

- **Validation:** Zod v4 schemas in `backend/src/utils/validators.ts`, applied as Express middleware via `validateBody(schema)`
- **Error handling:** Centralized `errorHandler` middleware (must be last in Express chain)
- **Rate limiting:** Separate limiters for auth, general API, OCR, and premium features
- **Feature flags:** Environment-variable controlled (`NEXT_PUBLIC_FEATURE_*`, `NEXT_PUBLIC_GEMINI_CHAT_ENABLED`)
- **AI integration:** Google Generative AI (Gemini) used for chat, appliance analysis, visual inspection, room insights, energy auditing
- **Offline-first:** Frontend uses IndexedDB + service workers for offline capability; hooks like `useOnline` and `useGeolocation` integrate with PWA caching

## Environment

Required environment variables (see `docker-compose.yml` for dev defaults):
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_HOST` / `REDIS_PORT` — Redis for BullMQ job queues
- `JWT_SECRET` / `JWT_REFRESH_SECRET` — Token signing
- `NEXT_PUBLIC_API_URL` — Backend URL for frontend (default `http://localhost:8080`)
- `NEXT_PUBLIC_GEMINI_API_KEY` — Google Gemini API key for AI features
