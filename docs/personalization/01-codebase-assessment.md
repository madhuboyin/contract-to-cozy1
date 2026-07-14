# 01 — Codebase Assessment

## Method and confidence

The review traced route mounts in `apps/backend/src/index.ts`, route middleware, controllers, services, Prisma relations, worker handlers/schedules, frontend calls and screens, and Kubernetes manifests. Generated `dist/`, dependency folders, and unrelated feature internals were excluded. The repository contains roughly 654 backend, 996 frontend, and 92 worker source files; the evidence index records the material subset.

## Executive finding

**Feasible with moderate refactoring.** The stack already contains most technical primitives: property-scoped access control, Prisma/PostgreSQL, Redis/BullMQ, deterministic scoring, confidence/freshness signals, suppression, event records, analytics, snapshots, notifications, workers, feature rollout, and a responsive component system. It lacks a canonical household-profile aggregate, typed traits, a shared recommendation catalog/instance lifecycle, and uniformly enforced property authorization.

The main architectural problem is fragmented intelligence. Feature services independently calculate and present recommendations: Seller Prep, Risk, Daily Pulse, Home Digital Twin, Room Plant Advisor, Guidance, orchestration, maintenance prediction, neighborhood intelligence, and others. Centralization should preserve their domain calculations while moving cross-module eligibility, ranking, feedback, explanations, and fatigue controls into one module.

## Backend assessment

### Architecture and data access

**Verified.** `apps/backend/src/index.ts` mounts a large Express application. Most flows follow route → controller → service → shared Prisma singleton (`apps/backend/src/lib/prisma.ts`), but services often query Prisma directly rather than repositories. `apps/backend/src/modules/gazette/` is the clearest complex-module precedent. Zod validation is available through `validate`/`validateBody`; `APIError` and the global `errorHandler` normalize many failures.

**Implication.** Use a self-contained personalization module with repositories at its boundary, rather than introduce a global repository rewrite. Existing domains should publish normalized facts/signals through adapters.

### Identity, profiles, households, and authorization

- `User` owns a one-to-one `HomeownerProfile`; that profile owns many `Property` records.
- `HomeownerProfile` contains segment, contact/notification JSON, and budget fields—not household composition or lifestyle.
- Current `HouseholdMember` is a property-to-authenticated-user ACL/collaboration record with `OWNER`, `CONTRIBUTOR`, `VIEWER`; it cannot represent children, pets, or non-account summaries.
- `propertyAuthMiddleware` checks membership, falls back to owner linkage, and bootstraps an owner membership. This is reusable.
- Several mature property routes apply `authenticate` + `propertyAuthMiddleware`, including Household, Guidance, Home Digital Twin, and many tool routes.
- Authorization is inconsistent. `PropertyMaintenanceTaskService.verifyPropertyOwnership` and Seller Prep owner queries exclude invited collaborators; several task-by-ID mutation routes do not apply `propertyAuthMiddleware` at the route and rely on service checks. The Risk controller also contains a suspicious `req.user.id` cast while the auth middleware attaches `userId`. These are blockers for shared-household semantics.

**Recommendation.** Introduce a distinct `Household` aggregate and `HouseholdProperty` association without repurposing `HouseholdMember`. Centralize authorization through a property access policy that accepts collaborator roles and checks capability, not just ownership.

### Properties, assets, protection, and tasks

`Property` is already a rich hub: structure/systems/safety, `HomeAsset`, inventory, warranties, insurance, inspections, climate setting, incidents, scores, signals, Guidance, Digital Twin, and collaborators. It is suitable as the initial personalization scope.

The Prisma schema is far ahead of checked-in migration history: only five `migration.sql` files are present under `apps/backend/prisma/migrations/`, while the schema contains hundreds of models/enums, and `database/migrations/` is empty apart from `.gitkeep`. During the data-free pilot, the user applies the desired schema to a disposable database and no backfill/rehearsal machinery is required. Conventional migrations and rehearsal become necessary only after deployed data must survive schema changes.

`PropertyMaintenanceTask` is the best action target. It supports source, `actionKey` dedupe, priority/risk, recurring frequency, due dates, seasonal linkage, asset/warranty/booking linkage, assignment, costs, and status. Limitations include string `assetType`/`category`, a narrow recurrence enum, and source semantics split between `ACTION_CENTER` and `RISK_ASSESSMENT` even though risk integration calls the Action Center creator.

There are also legacy `ChecklistItem`, `HomeBuyerTask`, `SeasonalChecklistItem`, and `MaintenancePrediction` action types. `OrchestrationSuppressionService` explicitly resolves new maintenance tasks before legacy checklist items. The engine should use an action adapter and not create another task system.

### Existing recommendation and scoring logic

| Area | Verified behavior | Reuse/centralize |
|---|---|---|
| `decisionEngine.service.ts` | Weighted deterministic score; low-confidence/stale/completed/dismissed suppression; dedupe; intent conflict resolution; limit; trace and diagnostics | Reuse concepts and pure-function tests; generalize candidate/category/goal inputs |
| `signal.service.ts` | Versioned property signals with confidence breakdown, validity, provenance, interaction signals and health summaries | Reuse as an input adapter; traits need separate user-visible override semantics |
| Guidance engine | Signal resolution, priority, suppression, journeys, evidence, confidence, execution guards | Reuse lifecycle/evidence patterns; do not force all recommendations into journeys |
| Orchestration | Aggregates Risk and Checklist actions; action keys, snooze, completion, coverage-aware CTAs, shared context | Integrate as a consumer/action target; remove duplicated rank decisions over time |
| Seller Prep | Code-defined checklist plus preference scoring and a generated summary | Migrate catalog/ranking; current free-form JSON preferences and string enums are fragile |
| Health Score | `calculateHealthScore` uses fixed weights and property facts; booking state changes labels | Keep score math domain-owned; engine may rank score-improvement actions |
| Daily Pulse | Produces one micro-action from maintenance/incidents/weather with a 45-day suppression window | Rebuild selection as a dashboard channel consuming central results |
| Digital Twin | One property snapshot, modeled components, quality/confidence, computation runs and scenario suggestions | Reuse computation-run and snapshot patterns; property twin is not household intelligence |
| Room Plant Advisor | Deterministic scoring, warnings, dedupe, save/dismiss and staleness behavior | Useful algorithm pattern; pet toxicity logic must remain safety constrained |
| Neighborhood intelligence | Impact × confidence × freshness and property-event matching | Normalize as local context candidates |

Duplicated concepts include priority scales, confidence, freshness, dedupe keys, suppression windows, explanations, recommendation status, feedback, and score weights. They should be canonicalized without deleting domain-specific calculations.

### Scheduling, notifications, and events

- Workers combine BullMQ queues with registry-driven `node-cron` jobs. The `JOB_REGISTRY`/`CRON_HANDLERS` pattern offers admin visibility and job metrics.
- Property intelligence is already BullMQ event-driven. `DomainEvent` processing has a database processing lock.
- Notifications persist a user-facing `Notification` and per-channel `NotificationDelivery`; email batching/digest exists.
- Seasonal, maintenance, weather, recall, neighborhood, and other jobs generate notifications independently.
- **Risk:** Kubernetes runs two worker replicas while every replica calls `scheduleCronJobs()`; the generic cron scheduler has no visible leader/distributed lock. Individual jobs use some dedupe, but this is not a safe personalization scheduler foundation.

Use BullMQ job IDs/coalescing or a DB lease for personalization recompute. Central notification eligibility and fatigue should run before creating deliveries.

### AI, flags, observability, errors, caching, tests

- Gemini is integrated through both `@google/genai` and the older `@google/generative-ai` across many services. `gemini.service.ts` has resilience/circuit-breaking; AI model names are inconsistent.
- Feature rollout supports deterministic user bucketing in `apps/backend/src/config/featureFlags.ts`; frontend flags are separate environment booleans.
- Pino logs to stdout and Loki with redaction; Sentry captures unexpected errors; Prometheus covers HTTP, security, BullMQ, cron, and Node metrics; Faro covers frontend telemetry behind analytics consent.
- Redis is used for queues and rate limiting, but recommendation caching is not centralized. React Query defaults to 60-second staleness; the API client has a property-list cache.
- Backend has 55 Node test files and CI runs unit/integration suites; frontend has 28 Jest test files but CI's governance command does not clearly run the full suite. There are no personalization migration/privacy/golden-dataset tests.

## Frontend assessment

### Structure and request flow

**Verified.** Next.js App Router uses authenticated dashboard and property-specific routes. `APIClient.request` centralizes cookies, CSRF, refresh handling, and errors, but the client is a very large cross-domain class with additional per-feature API files. React Query is used inconsistently alongside local `useEffect` state. `PropertyContext` persists the selected property.

The main dashboard assembles many separate fetches/cards and contains local next-best-move logic. `ExistingOwnerDashboard` fetches maintenance tasks/stats/bookings directly. This makes the dashboard a second ranking layer and risks inconsistent priorities.

### Reusable UI

- Responsive primitives: `MobilePageContainer`, `MobileCard`, `StatusChip`, `DashboardShell`.
- Accessible Radix primitives and shared buttons/forms/dialogs.
- Trust/explanation primitives: `ConfidenceBadge`, `TrustMetaRow`, Guidance safety components.
- Action presentation: `SignatureRecommendationCard`, `SupportingActionCard`, `ActionCenter`, `WinCard`.
- Property onboarding already supports skip, progress, responsive steps, and React Query mutations.
- Household collaborator screen offers notification toggles and role management.
- Account profile supports correction, deactivation, and anonymization request flow.

### Gaps

- No household composition, pet, goal, lifestyle, or personalization-control UI.
- “Household” navigation currently means collaborators; naming must avoid confusion.
- Dashboard is already card-heavy and performs competing ranking in UI code.
- No “why am I seeing this?”, evidence correction, confidence, dismiss/snooze taxonomy, or profile-question component shared across recommendations.
- No central recommendation query/cache keys, offline policy, or accessible announcement behavior for profile questions.
- Some UI errors are logged only to console and optimistic updates do not always rollback fully.

## Infrastructure assessment

**Verified manifests, not live capacity.** Raspberry Pi overlay deploys 5 API replicas, 4 frontend replicas, 2 worker replicas, one PostgreSQL 15 pod (100 Gi local-path PVC, 2–4 Gi memory), and one Redis 7 pod (10 Gi PVC, 0.5–1.5 Gi memory). The base plus overlay resource requests can exceed a single 8 Gi Pi; actual node count, utilization, storage IOPS, and production cardinality were not available.

PostgreSQL is sufficient for deterministic filtering, indexed lookups, JSONB rules, and snapshots. Redis/BullMQ is already paid operational complexity. A graph database, vector database, Kafka, feature store, or separate personalization service would add disproportionate burden.

## Technical debt and blockers

| Severity | Finding | Required treatment |
|---|---|---|
| High | Owner-only and member-aware authorization coexist | Property capability policy and authorization test matrix in Phase 0 |
| High | Two worker replicas schedule the same node-cron handlers | Queue-backed scheduling or distributed lease before recompute jobs |
| High | Account “deletion” anonymizes `User`/`Address` but retains property/household domain data | Define household-profile deletion cascade/anonymization and legal retention |
| High | Sensitive JSON may be logged through validation/error/debug paths | Schema-aware redaction and never log profile/rule evaluation payloads |
| Medium | Recommendation logic and priority enums are duplicated | Canonical catalog, score contract, channel limits, action adapter |
| Medium | Huge `Property` model and API client | Add module repositories/client, not more fields/methods in central files |
| Medium | Free-form JSON preferences and strings | Typed preferences with source, consent, effective dates, and validation |
| Medium | No rule content lifecycle/admin kill switch | Version/status/effective/review fields and audit log |
| Medium | No canonical household profile | Add aggregate separate from collaborator ACL |
| Medium | Checked-in migration history does not reconstruct the visible Prisma schema | Establish schema-parity baseline and rehearse additive migrations/backfills |
| Low | Docs describe Next 14 while package is Next 16.2.6 | Treat package manifests as authoritative |

## Conclusion

Do not extract a service. Establish the personalization domain within the backend, fix authorization and scheduling foundations, then migrate consumers one module at a time behind a feature flag. The existing decision, signal, Guidance, action-key, analytics, snapshot, and notification components significantly reduce MVP risk.
