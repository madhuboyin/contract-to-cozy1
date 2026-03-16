# Worker Jobs — Feature Documentation

## Overview

The Worker Jobs feature gives platform administrators a live operational console to monitor and manually trigger all background jobs running in the C2C worker process. It surfaces BullMQ queue stats, recent run history, health status, schedule information, and a "Run Job" button for supported jobs — all from a single admin-only dashboard.

The architecture is built on a **shared registry** (`workerJobRegistry.ts`) that acts as the single source of truth. Both the worker process (for scheduling) and the backend API (for the admin dashboard) read from the same registry, ensuring the UI always reflects the complete and accurate list of jobs.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│          apps/backend/src/config/workerJobRegistry.ts   │
│          (Single Source of Truth — 20 jobs)             │
└──────────────────┬──────────────────┬───────────────────┘
                   │                  │
        ┌──────────▼──────┐  ┌────────▼──────────────────┐
        │  apps/workers/  │  │  apps/backend/             │
        │  src/worker.ts  │  │  src/services/             │
        │  (scheduling)   │  │  adminWorkerJobs.service.ts│
        └─────────────────┘  └────────────────────────────┘
                                        │
                             ┌──────────▼─────────────────┐
                             │  GET /api/admin/worker-jobs │
                             │  POST /api/admin/worker-jobs│
                             │       /:jobKey/trigger      │
                             └──────────┬─────────────────┘
                                        │
                             ┌──────────▼─────────────────┐
                             │  apps/frontend/             │
                             │  dashboard/worker-jobs/     │
                             │  page.tsx                   │
                             └────────────────────────────┘
```

---

## File Reference

### Shared Config

| File | Purpose |
|------|---------|
| `apps/backend/src/config/workerJobRegistry.ts` | Single source of truth. Defines `JOB_REGISTRY` array with all 20 jobs, their schedules, categories, queue names, and trigger support flags. Imported by both worker and backend service. |

### Backend

| File | Purpose |
|------|---------|
| `apps/backend/src/services/adminWorkerJobs.service.ts` | Service layer. Imports `JOB_REGISTRY`, fetches live BullMQ queue stats and recent run history per job, exposes `listWorkerJobs()` and `triggerJob()`. |
| `apps/backend/src/controllers/adminWorkerJobs.controller.ts` | Express handlers. `getWorkerJobsHandler` → calls `listWorkerJobs()`. `triggerJobHandler` → calls `triggerJob(jobKey)`, returns 400 for invalid/unsupported keys. |
| `apps/backend/src/routes/adminWorkerJobs.routes.ts` | Route definitions. Mounts under `/api/admin/worker-jobs`. Protected by `apiRateLimiter` + `authenticate` + `requireRole(ADMIN)`. Includes Swagger annotations. |
| `apps/backend/src/index.ts` | Mounts `adminWorkerJobsRoutes` at `/api`. |

### Workers

| File | Purpose |
|------|---------|
| `apps/workers/src/worker.ts` | Entry point. Imports `JOB_REGISTRY`. Defines `CRON_HANDLERS` map (key → async handler function). `scheduleCronJobs()` iterates the registry, schedules each cron job via `node-cron`, and logs startup warnings for handler/registry mismatches. BullMQ workers started in `startWorker()`. |
| `apps/workers/src/jobs/` | Individual job implementations (`recallIngest.job.ts`, `seasonalChecklistGeneration.job.ts`, `habitGeneration.job.ts`, etc.) |
| `apps/workers/src/runners/` | Long-running pollers (`homeReportExport.poller.ts`, `domainEvents.poller.ts`, `highPriorityEmailEnqueue.poller.ts`, `claimFollowUpDue.poller.ts`) |

### Frontend

| File | Purpose |
|------|---------|
| `apps/frontend/src/app/(dashboard)/dashboard/worker-jobs/page.tsx` | Admin-only page. Renders jobs grouped by category with health indicators, last run status, queue stats, schedule, next run countdown, and Run Job button. |
| `apps/frontend/src/hooks/useAdminWorkerJobs.ts` | React Query hooks. `useWorkerJobs(enabled)` — 30s stale time. `useTriggerWorkerJob()` — mutation that auto-invalidates query 1.5s after success. |
| `apps/frontend/src/lib/api/adminWorkerJobs.ts` | API client. `fetchWorkerJobs()` → `GET /api/admin/worker-jobs`. `triggerWorkerJob(jobKey)` → `POST /api/admin/worker-jobs/:jobKey/trigger`. TypeScript interfaces for `WorkerJobDetail`, `QueueStats`, `RecentRun`. |
| `apps/frontend/src/app/(dashboard)/layout.tsx` | Navigation. Worker Jobs link added to desktop sidebar and mobile nav (admin users only). Uses `Cpu` icon from lucide-react. |

### Infrastructure

| File | Purpose |
|------|---------|
| `infrastructure/docker/workers/Dockerfile` | Copies `workerJobRegistry.ts` from backend into the worker build context at `src/shared/backend/config/`. Rewrites the import path in `worker.ts` via `sed`. |

---

## API Reference

### `GET /api/admin/worker-jobs`

Returns the full job registry enriched with live BullMQ data.

**Auth:** Bearer token, `ADMIN` role required.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "key": "recall-ingest",
      "name": "Recall Ingest",
      "description": "...",
      "category": "RECALLS",
      "schedule": "Daily at 3:00 AM EST",
      "cronExpression": "0 3 * * *",
      "type": "bullmq",
      "queueName": "recall-jobs-queue",
      "jobName": "recall.ingest",
      "triggerSupported": true,
      "queueStats": {
        "waiting": 0,
        "active": 0,
        "completed": 142,
        "failed": 1
      },
      "recentRuns": [
        {
          "id": "abc123",
          "jobName": "recall.ingest",
          "status": "completed",
          "finishedAt": 1710000000000,
          "durationMs": 4200
        }
      ]
    }
  ]
}
```

`queueStats` and `recentRuns` are only populated for `type: "bullmq"` jobs. Cron and event-driven jobs return `recentRuns: []`.

### `POST /api/admin/worker-jobs/:jobKey/trigger`

Manually enqueues a BullMQ job.

**Auth:** Bearer token, `ADMIN` role required.

**Supported job keys:** `recall-ingest`, `recall-match`

**Response (success):**
```json
{ "success": true, "data": { "queued": true, "jobId": "42" } }
```

**Response (error):**
```json
{ "success": false, "error": { "message": "Manual trigger not supported for job: property-intelligence" } }
```

**HTTP 400** for: unknown key, trigger not supported, missing queue config.
**HTTP 500** for: Redis/BullMQ errors.

---

## Job Registry

All 20 jobs are registered in `workerJobRegistry.ts`. They are grouped into 7 categories:

### PROPERTY_INTELLIGENCE
| Key | Type | Schedule | Trigger |
|-----|------|----------|---------|
| `property-intelligence` | BullMQ | Event-driven (property update) | No |

### RECALLS
| Key | Type | Schedule | Trigger |
|-----|------|----------|---------|
| `recall-ingest` | BullMQ | Daily 3:00 AM EST | **Yes** |
| `recall-match` | BullMQ | Daily 3:10 AM EST | **Yes** |

### NOTIFICATIONS
| Key | Type | Schedule | Trigger |
|-----|------|----------|---------|
| `email-notification` | BullMQ | Event-driven | No |
| `push-notification` | BullMQ | Event-driven | No |
| `sms-notification` | BullMQ | Event-driven | No |
| `daily-email-digest` | Cron | Daily 8:00 AM EST | No |

### MAINTENANCE
| Key | Type | Schedule | Trigger |
|-----|------|----------|---------|
| `maintenance-reminders` | Cron | Daily 9:00 AM EST | No |
| `seasonal-checklist-generation` | Cron | Daily 2:00 AM EST | No |
| `seasonal-checklist-expiration` | Cron | Daily 1:00 AM EST | No |
| `seasonal-notifications` | Cron | Daily 9:00 AM EST | No |
| `inventory-draft-cleanup` | Cron | Daily 3:15 AM EST | No |

### RISK_SAFETY
| Key | Type | Schedule | Trigger |
|-----|------|----------|---------|
| `coverage-lapse-incidents` | Cron | Daily 8:00 AM EST | No |
| `freeze-risk-incidents` | Cron | Daily 9:00 AM EST | No |
| `weekly-score-snapshots` | Cron | Mondays 4:00 AM EST | No |
| `hidden-asset-refresh` | Cron | Sundays 3:00 AM EST | No |

### NEIGHBORHOOD
| Key | Type | Schedule | Trigger |
|-----|------|----------|---------|
| `neighborhood-radar-refresh` | Cron | Sundays 5:00 AM EST | No |
| `neighborhood-change-notifications` | Cron | Daily 6:00 AM EST | No |

### HOME_CARE
| Key | Type | Schedule | Trigger |
|-----|------|----------|---------|
| `home-habit-generation` | Cron | Saturdays 3:30 AM EST | No |

---

## Job Types

| Type | Mechanism | Queue Stats | Run History | Manual Trigger |
|------|-----------|-------------|-------------|----------------|
| `bullmq` | BullMQ queue + Redis | Yes | Yes (last 3) | If `triggerSupported: true` |
| `cron` | node-cron in worker process | No | No | No |

Event-driven jobs (property intelligence, notifications) are `bullmq` type with no cron expression and `triggerSupported: false`.

---

## Access Control

### Backend
- All routes under `/api/admin/worker-jobs` require:
  - Valid JWT (`authenticate` middleware)
  - `ADMIN` role (`requireRole(UserRole.ADMIN)` middleware)
  - `apiRateLimiter` applied
- Non-admin requests receive `403 Forbidden`

### Frontend
- `useWorkerJobs(enabled)` hook only fires when `isAdmin === true`
- Page renders an "Admin access required" gate for non-admin users
- The Worker Jobs nav link is only rendered when `user?.role === 'ADMIN'`
- Pattern matches the Admin Analytics access guard

---

## UI Features

The dashboard at `/dashboard/worker-jobs` provides:

- **Health indicator** — colored left border + dot per card (`healthy` / `warning` / `failing` / `idle`)
- **Health summary** — page header shows "2 failing · 1 warning" or "All healthy"
- **Last run status** — icon + "Success/Failed" + time ago (e.g. "3h ago")
- **Queue counts** — "Failures: X | Success: Y" with red highlight when failures > 0 (BullMQ jobs only)
- **Schedule** — human-readable schedule string from registry
- **Next run** — computed from cron expression (e.g. "in 4h 20m", "in 2d")
- **Active/waiting indicators** — shown when queue has active or waiting jobs
- **Recent runs** — last 3 runs with status icon, time ago, duration, and failure reason
- **Run Job button** — available only for `triggerSupported: true` jobs; shows spinner while queuing, switches to "Queued" with checkmark on success
- **Refresh button** — manual refetch with spin animation; shows "Last refreshed: HH:MM:SS"
- **Auto-stale** — React Query refetches automatically after 30 seconds
- **Skeleton loading** — animated placeholder on initial load
- **Error banner** — shown when backend is unreachable

---

## Scheduling Mechanism (Worker)

All production cron jobs are registered in `scheduleCronJobs()` which runs at worker startup:

```
Worker startup
    │
    ├── scheduleCronJobs()          ← reads JOB_REGISTRY, schedules node-cron entries
    │     ├── For each registry entry with type=cron + cronExpression:
    │     │     ├── Look up CRON_HANDLERS[entry.key]
    │     │     ├── Apply CRON_ENV_OVERRIDES if present
    │     │     └── cron.schedule(expr, handler, { timezone: 'America/New_York' })
    │     └── Warn for: missing handlers + unregistered handlers
    │
    └── startWorker()               ← starts BullMQ workers for queue-backed jobs
```

**Startup warnings:**
- `⚠️ No handler for registry job "X"` — job is in registry but has no function in `CRON_HANDLERS`
- `⚠️ Handler exists for unregistered job "X"` — function exists but job is missing from registry (won't appear in admin UI)

**Environment overrides:**
- `INVENTORY_DRAFT_CLEANUP_CRON` — overrides the cron expression for `inventory-draft-cleanup`

---

## Adding a New Job

Follow this two-step checklist. Both changes must be in the same PR.

### Step 1 — Add to `workerJobRegistry.ts`

```typescript
{
  key: 'my-new-job',              // unique kebab-case key
  name: 'My New Job',             // human-readable name
  description: 'What it does.',  // shown in admin UI
  category: 'MAINTENANCE',       // must be an existing JobCategory
  schedule: 'Daily at 4:00 AM EST',
  cronExpression: '0 4 * * *',
  type: 'cron',                  // 'cron' or 'bullmq'
  triggerSupported: false,
}
```

### Step 2 — Add to `CRON_HANDLERS` in `worker.ts`

```typescript
const CRON_HANDLERS: Record<string, () => Promise<void>> = {
  // ... existing handlers ...
  'my-new-job': async () => { await myNewJobFunction(); },
};
```

### Step 3 (only if new category)

Add the new category to:
- `JobCategory` union type in `workerJobRegistry.ts`
- `CATEGORY_LABELS` and `CATEGORY_ORDER` in `apps/frontend/src/app/(dashboard)/dashboard/worker-jobs/page.tsx`

The admin dashboard will automatically display the new job after the worker restarts — no other frontend changes needed.

---

## Docker Build (Workers)

The workers Docker image uses a two-stage build. Since `worker.ts` imports `workerJobRegistry.ts` from the backend, the Dockerfile handles this explicitly:

```dockerfile
# Stage 1: Builder
# Copy registry into workers shared tree
COPY apps/backend/src/config/workerJobRegistry.ts src/shared/backend/config/

# Rewrite import path in worker.ts
RUN sed -i 's/\.\.\/\.\.\/backend\/src\/config\/workerJobRegistry/\.\/shared\/backend\/config\/workerJobRegistry/g' src/worker.ts
```

This pattern is consistent with how all other backend files shared with workers are handled (analytics, incident services, etc.).

---

## Environment Variables

| Variable | Default | Used By | Purpose |
|----------|---------|---------|---------|
| `REDIS_HOST` | `redis.production.svc.cluster.local` | Worker | Redis connection host |
| `REDIS_PORT` | `6379` | Worker | Redis connection port |
| `REDIS_DB` | `0` | Worker | Redis database index |
| `REDIS_PASSWORD` | — | Worker | Redis auth password |
| `INVENTORY_DRAFT_CLEANUP_CRON` | `15 3 * * *` | Worker | Override cleanup cron expression |
| `RADAR_DUMMY_INGEST_ENABLED` | `false` | Worker | Enable QA radar ingest (non-production) |
| `RADAR_DUMMY_INGEST_CRON` | `*/30 * * * *` | Worker | QA radar ingest cron |
| `NEIGHBORHOOD_DUMMY_INGEST_ENABLED` | `false` | Worker | Enable QA neighborhood ingest |
| `HOME_RISK_REPLAY_DUMMY_INGEST_ENABLED` | `false` | Worker | Enable QA home risk replay ingest |

---

## Future Enhancements

### Near-term

| Enhancement | Description |
|-------------|-------------|
| **Expand manual trigger support** | Currently only `recall-ingest` and `recall-match` support manual triggering. Add trigger support for `hidden-asset-refresh`, `home-habit-generation`, and `weekly-score-snapshots` — all are idempotent and safe to run on-demand. |
| **Cron job run history** | Cron jobs currently show "No recent runs" because node-cron has no built-in history. Write start/end/error records to a `worker_job_runs` DB table, and expose them via the existing `recentRuns` field in the API response. |
| **Job enable/disable toggle** | Add an `enabled` flag to `JobRegistryEntry` and a `PATCH /api/admin/worker-jobs/:jobKey` endpoint to toggle it. The admin UI renders a toggle switch per job card. |

### Medium-term

| Enhancement | Description |
|-------------|-------------|
| **Per-job run log viewer** | Expand the job card with a "View Logs" drawer that streams or displays the last N log lines for that job key, filtered from structured worker logs. |
| **Job duration trend chart** | Add a sparkline to each job card showing run duration over the last 7–14 runs, useful for detecting slow degradation. |
| **Alerting thresholds** | Allow admins to set a failure count threshold per job. If exceeded, surface a platform alert or send an admin email notification. |
| **Scheduled job pause during maintenance** | Add a global "maintenance mode" flag that suspends all cron scheduling. Worker checks flag from Redis or DB before running each job. |

### Long-term

| Enhancement | Description |
|-------------|-------------|
| **BullMQ Board integration** | Embed or link to a BullMQ UI (e.g. Bull Board) for deep queue inspection — dead-letter queue, job retry, payload inspection. |
| **Distributed worker support** | Track which worker instance (pod) processed each job. Relevant when scaling workers horizontally. Requires job metadata tagging. |
| **Trigger with custom payload** | Allow admins to provide a JSON payload when manually triggering a job (e.g. specific `propertyId` for property-intelligence). Requires a trigger config schema per job in the registry. |
| **Job dependency graph** | Visually represent jobs that depend on each other (e.g. `recall-match` runs after `recall-ingest`). Block trigger if dependency hasn't run successfully. |
