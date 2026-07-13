# Codebase Evidence Index

This index lists source actually inspected for the personalization assessment. “Relevant” explains the verified behavior used in the design; it is not a claim that every listed feature is complete in production.

## Repository and application topology

| Evidence | Symbols/behavior reviewed | Relevance |
|---|---|---|
| `CLAUDE.md`, `apps/CLAUDE.md` | repo commands and stated architecture | navigation aid; verified against source/package manifests |
| `apps/backend/package.json` | Express, Prisma 5, BullMQ, Redis, Zod, Pino, Prometheus, Sentry, Gemini dependencies; Node test scripts | confirms backend capabilities and no existing rules dependency |
| `apps/frontend/package.json` | Next 16.2.6, React 18, React Query, Radix, Tailwind, Jest, Faro | authoritative frontend versions; repo guide's Next 14 statement is stale |
| `apps/workers/package.json` | BullMQ, node-cron, shared backend Prisma schema | confirms dual worker scheduling model |
| `apps/backend/src/index.ts` | middleware order and all `app.use` route mounts | actual API composition; broad modular monolith |
| `apps/backend/src/modules/gazette/` | module-local routes/controllers/services/validators/editorial pipeline | precedent for a bounded complex backend module |

## Identity, authorization, validation, privacy

| Evidence | Symbols/routes | Relevance |
|---|---|---|
| `apps/backend/src/middleware/auth.middleware.ts` | `_authenticate`, `authenticate`, `restrictToHomeowner`, role checks; attaches `req.user.userId` | JWT/profile behavior and field naming |
| `apps/backend/src/middleware/propertyAuth.middleware.ts` | `propertyAuthMiddleware` | membership-first scope, owner fallback, owner-row backfill; primary reusable ACL |
| `apps/backend/src/middleware/householdRole.middleware.ts` | `ROLE_RANK`, `requireRole` | OWNER/CONTRIBUTOR/VIEWER capability seed |
| `apps/backend/src/middleware/validate.middleware.ts` | `validate`, `validateBody` | shared Zod validation convention |
| `apps/backend/src/middleware/error.middleware.ts` | `APIError`, `errorHandler` | central response/Sentry behavior; validation log privacy concern |
| `apps/backend/src/middleware/csrf.middleware.ts` | API CSRF protection mounted in `index.ts` | mutation security convention |
| `apps/backend/src/middleware/rateLimiter.middleware.ts` | API/auth/Gemini Redis-backed limiters | abuse controls reusable for new endpoints |
| `apps/backend/src/controllers/user.controller.ts` | `deactivateAccount`, `deleteAccount` | deletion currently anonymizes User/Address but does not erase property household domain |
| `apps/backend/src/routes/user.routes.ts` | profile/account routes | existing correction/deactivate/delete surface |
| `apps/backend/src/lib/logger.ts` | Pino redaction, request context, Loki/stdout, `auditLog`, `redactEmail` | observability/audit base and PII rules |
| `apps/backend/src/lib/requestContext.ts` | AsyncLocalStorage request ID context | trace correlation base |

## Household and property profile

| Evidence | Symbols/routes | Relevance |
|---|---|---|
| `apps/backend/src/routes/household.routes.ts` | member/invite/activity/assignment routes | proves “household” currently means property collaboration |
| `apps/backend/src/controllers/household.controller.ts` | household handlers | response shapes and cursor handling |
| `apps/backend/src/services/household.service.ts` | `HouseholdService`, `ensurePrimaryOwnerMember`, invitation and role operations | authenticated-member model, activity audit, assignment adapters |
| `apps/backend/src/validators/household.validators.ts` | invite/role/notification/assignment schemas | typed validation pattern |
| `apps/backend/src/routes/property.routes.ts` | property CRUD/bootstrap/health endpoints and guards | property API conventions |
| `apps/backend/src/controllers/property.controller.ts` | property and score handlers | frontend property data source |
| `apps/backend/src/services/property.service.ts` | property CRUD/activation and relations | property ownership/data hub |
| `apps/backend/src/routes/propertyOnboarding.routes.ts` | property-scoped onboarding status/mutations | progressive collection integration point |
| `apps/backend/src/services/propertyOnboarding.service.ts` | step/completeness state | existing setup-score/snapshot pattern |

## Prisma schema and migrations

| Schema entity (in `apps/backend/prisma/schema.prisma`) | Relevance |
|---|---|
| `User`, `HomeownerProfile`, `Property` | current identity → owner profile → multi-property ownership chain |
| `PreferenceProfile` | narrow financial posture per property; not general personalization |
| `HouseholdMember`, `HouseholdInvite`, `HouseholdActivityLog` | property collaborator ACL/activity; not demographic profile |
| `HomeAsset`, `InventoryItem`, `Warranty`, `InsurancePolicy`, `Document` | key property evidence/adapters |
| `Checklist`, `ChecklistItem`, `HomeBuyerChecklist`, `HomeBuyerTask` | legacy/buyer action systems |
| `PropertyMaintenanceTask`, `MaintenanceTaskTemplate`, `MaintenancePrediction` | preferred execution target, recurrence, action keys, forecast |
| `SeasonalTaskTemplate`, `SeasonalChecklist`, `SeasonalChecklistItem`, `PropertyClimateSetting` | climate/season catalog and generated tasks |
| `RiskAssessmentReport`, `FinancialEfficiencyReport`, `PropertyScoreSnapshot` | domain scores and historical snapshot pattern |
| `PropertyInsightSnapshot`, `PropertyNarrativeRun` | versioned JSON snapshot/rendered plan precedent |
| `Signal`, `SignalProvenance`, `SignalAttribution` | normalized property signals with version/confidence/provenance |
| `GuidanceSignal`, `GuidanceJourney`, `GuidanceJourneyStep`, `GuidanceJourneyEvent`, `GuidanceStepEvidence` | signal→journey→evidence lifecycle |
| `OrchestrationActionEvent`, `OrchestrationActionSnooze` | completion/snooze suppression history |
| `Notification`, `NotificationDelivery` | central user/channel delivery persistence |
| `HomeDigitalTwin`, `HomeTwinComponent`, `HomeTwinDataQuality`, `HomeTwinComputationRun`, `HomeTwinScenario` | property twin, quality, computation run and scenario patterns |
| `SellerPrepPlan`, `SellerPrepPlanItem`, `Feedback` | feature-local preferences/items and generic shallow feedback |
| `PropertyDailySnapshot`, `PropertyMicroAction`, `PropertyStreak` | precomputed daily payload and micro-action suppression |
| `CommunityEvent`, `PropertyNeighborhoodEvent`, `PropertyRadarMatch` | local context and property matching |
| `DomainEvent` | asynchronous event processing/outbox-like foundation |
| `ProductAnalyticsEvent`, `PropertyAnalyticsDailyRollup` | product instrumentation/aggregation |

Migration review:

- `apps/backend/prisma/migrations/20251118023802_add_renewal_categories/migration.sql`
- `apps/backend/prisma/migrations/20251121020725_add_homeowner_management_tables/migration.sql`
- `apps/backend/prisma/migrations/20260317000000_add_gazette_tables/migration.sql`
- `apps/backend/prisma/migrations/20260414000000_add_user_mfa_fields/migration.sql`
- `apps/backend/prisma/migrations/20260713000000_add_plant_care_and_garden_zones/migration.sql`
- `database/migrations/` contains only `.gitkeep`.

Only five checked-in Prisma SQL migrations exist despite a much larger schema. This is a material migration/reproducibility risk and supports additive, rehearsed personalization migrations with explicit schema-parity checks.

## Tasks, maintenance, risk, scoring

| Evidence | Symbols | Relevance |
|---|---|---|
| `apps/backend/src/routes/propertyMaintenanceTask.routes.ts` | property list/create plus task-ID mutations | action API; inconsistent property middleware on ID routes |
| `apps/backend/src/controllers/propertyMaintenanceTask.controller.ts` | handler methods | service inputs and response behavior |
| `apps/backend/src/services/PropertyMaintenanceTask.service.ts` | `getTasksForProperty`, `createUserTask`, `createFromActionCenter`, `createFromSeasonalItem`, `createFromTemplates`, ownership verification | task conversion, action-key dedupe, legacy ownership limitation |
| `apps/backend/src/services/riskAssessmentIntegration.service.ts` | `createTasksFromRiskAssessment`, due-date/category mapping | Risk→task bridge; source/action semantics mismatch |
| `apps/backend/src/routes/risk.routes.ts` | risk endpoints/auth middleware | current risk surface |
| `apps/backend/src/controllers/riskAssessment.controller.ts` | `checkAuthAndProfile`, report/summary/update handlers | owner authorization and `id` vs `userId` cast concern |
| `apps/backend/src/services/RiskAssessment.service.ts` | `getOrCreateRiskReport`, risk calculation/job enqueue | risk domain remains authoritative |
| `apps/backend/src/utils/propertyScore.util.ts` | `calculateHealthScore`, `isInsightBeingAddressed` | fixed health weighting and booking-based label suppression |
| `apps/backend/src/services/propertyScoreSnapshot.service.ts` | weekly score series | score history/snapshot read pattern |
| `apps/workers/src/worker.ts` | `capturePropertyScoreSnapshots`, weekly score snapshot job | score capture/recompute precedent |
| `apps/backend/src/services/maintenancePrediction.service.ts` | asset/property forecast generation | recommendation-like property prediction |

## Existing decision/recommendation/guidance implementations

| Evidence | Symbols | Relevance |
|---|---|---|
| `apps/backend/src/services/decisionEngine.service.ts` | `DecisionCandidate`, `computeDecisionScore`, `runDecisionEngine`, quality suppression/dedupe/conflict/trace/diagnostics | strongest deterministic personalization algorithm precedent |
| `apps/backend/tests/unit/decisionEngine.test.js` | score/suppression/dedupe/conflict tests | reusable pure test style |
| `apps/backend/src/services/orchestration.service.ts` | `OrchestratedAction`, `OrchestrationSummary`, candidate building/shared context | current cross-feature action aggregation |
| `apps/backend/src/services/orchestrationSuppression.service.ts` | `resolveSuppressionSource` | canonical precedence across user event/new task/legacy checklist |
| `apps/backend/src/services/orchestrationSnooze.service.ts` | snooze persistence/read | existing suppression behavior |
| `apps/backend/src/services/orchestrationActionKey.ts` | action-key normalization | dedupe precedent |
| `apps/backend/src/services/orchestrationIntegration.service.ts` | action-to-segment task routing | action adapter seed |
| `apps/backend/src/routes/orchestration.routes.ts` | summary/complete/snooze/trace routes | current Action Center API |
| `apps/backend/src/services/signal.service.ts` | signal DTO/publish/freshness/confidence/interactions/health | normalized input/provenance pattern |
| `apps/backend/src/services/signalPriorityBoost.service.ts` | signal priority influence | bounded input-weight precedent |
| `apps/backend/src/routes/guidance.routes.ts` | property-scoped signals/journeys/steps/guards/advisors | mature property authorization and workflow API |
| `apps/backend/src/services/guidanceEngine/guidanceSignalResolver.service.ts` | signal family, dedupe/severity/confidence | normalization precedent |
| `.../guidancePriority.service.ts` | severity/deadline priority | feature-specific rank precedent |
| `.../guidanceSuppression.service.ts` | weak/redundant/conflicting action suppression | reusable concepts |
| `.../guidanceJourney.service.ts` | evidence capture/compatibility/lifecycle | recommendation action/evidence pattern |
| `.../guidanceTemplateRegistry.ts` | code-defined journey templates and skip policy | catalog precursor; too feature-specific for direct reuse |
| `.../guidanceAdvisor.service.ts`, `modelShortlistAdvisor.service.ts`, `vendorSuggestionsAdvisor.service.ts` | Gemini-assisted advice with fallbacks | AI assistive reuse and guardrail need |
| `apps/backend/src/services/dailyHomePulse.service.ts` | `MicroActionCandidate`, 45-day suppression, weather/task selection | current one-action dashboard pattern |
| `apps/backend/src/services/homeDigitalTwinRecommendations.service.ts` | deterministic scenario suggestions | lightweight non-persisted recommendation precedent |
| `apps/backend/src/services/roomPlantAdvisor.service.ts` | `scorePlantCandidate`, `recommendationSort`, save/dismiss/staleness | deterministic scoring/feedback pattern, but feature-local |
| `apps/backend/src/neighborhoodIntelligence/eventConfidence.ts` | confidence/freshness/composite rank and explanations | local context rank precedent |
| `apps/backend/src/neighborhoodIntelligence/neighborhoodImpactEngine.ts` | property impact/distance decay | external context normalization |

## Seller Prep, seasonal, community, weather

| Evidence | Symbols | Relevance |
|---|---|---|
| `apps/backend/src/sellerPrep/engines/personalization.engine.ts` | `personalizeChecklist`, `generatePersonalizedSummary` | explicit scattered preference scoring to migrate |
| `apps/backend/src/sellerPrep/engines/roiRules.engine.ts` | code catalog generation | feature-local rule catalog |
| `apps/backend/src/sellerPrep/sellerPrep.service.ts` | `getOverview` | plan creation, JSON preferences, personalized ordering |
| `apps/backend/src/services/seasonalChecklist.service.ts` | checklist generation/read/add logic | seasonal personalization and duplicate legacy task path |
| `apps/workers/src/jobs/seasonalChecklistGeneration.job.ts` | climate setting/template filtering/generation | asynchronous context-aware candidate generation |
| `apps/workers/src/jobs/seasonalNotification.job.ts` | notification settings/email generation | feature-owned notification policy to centralize |
| `apps/backend/src/services/weather.service.ts` | forecast/geocode access | local weather input adapter |
| `apps/workers/src/jobs/freezeRiskIncidents.job.ts`, `severeWeatherAlerts.job.ts` | weather risk incident generation | safety-critical external context |
| `apps/backend/src/community/community.service.ts` and `community/providers/*` | Ticketmaster/NOAA/RSS/open data/trash providers | provider normalization requirement |
| `apps/backend/src/neighborhoodIntelligence/*` | ingestion/match/query/signal | local homeowner intelligence input |

## Notifications, events, analytics, AI

| Evidence | Symbols | Relevance |
|---|---|---|
| `apps/backend/src/services/notification.service.ts` | `NotificationService.create/list/mark*`, `IMPORTANT_TYPES` | atomic notification/delivery creation, per-profile email flag, immediate vs digest; no global fatigue |
| `apps/backend/src/routes/notification.routes.ts`, `controllers/notification.controller.ts` | list/count/read/delivery actions | frontend notification contract |
| `apps/workers/src/jobs/sendEmailNotification.job.ts` | per-user pending batching/digest | existing batching |
| `apps/workers/src/jobs/sendPushNotification.job.ts`, `sendSmsNotification.job.ts` | currently skip/future channel behavior | channel evolution |
| `apps/workers/src/jobs/processDomainEvents.job.ts` | DB PROCESSING lock and idempotent notification | multi-replica-safe event pattern |
| `apps/backend/src/services/analytics/taxonomy.ts` | centralized module/feature constants | analytics governance base; add personalization taxonomy |
| `apps/backend/src/services/analytics/emitter.ts` | fire-and-forget tracking and in-process view dedupe | instrumentation base; cross-pod dedupe limitation |
| `apps/backend/src/config/ai-constants.ts` | Gemini model defaults | AI config exists but model use is inconsistent |
| `apps/backend/src/services/gemini.service.ts` | chat context, `AICircuitBreaker`, fallback/error behavior | reusable AI resilience; not eligibility |
| `apps/backend/src/lib/aiResilience.ts` | retry/circuit metrics | assistive AI reliability |
| `apps/backend/src/services/documentIntelligence.service.ts`, `inspectionExtraction.service.ts`, `roomScan/provider.ts` | unstructured extraction | appropriate future profile/context extraction adapters after review |

## Workers and operational control

| Evidence | Symbols | Relevance |
|---|---|---|
| `apps/backend/src/config/workerJobRegistry.ts` | `JOB_REGISTRY` | single metadata source for jobs/admin UI |
| `apps/workers/src/worker.ts` | `CRON_HANDLERS`, `scheduleCronJobs`, BullMQ workers/metrics startup | two scheduling mechanisms; every replica schedules cron; new job insertion point |
| `apps/workers/src/lib/metrics.ts` | BullMQ and cron counters/histograms/gauges | evaluation job observability base |
| `apps/workers/src/lib/cronRunHistory.ts` | operational run history | computation audit analogy |
| `apps/backend/src/services/JobQueue.service.ts` | queue objects/defaults | recompute queue precedent |
| `apps/backend/src/config/queueDefaults.ts` | attempts/backoff/retention | queue policy base |

## Frontend

| Evidence | Symbols/screens | Relevance |
|---|---|---|
| `apps/frontend/src/app/(dashboard)/dashboard/page.tsx` | dashboard data fetching, local priority/badge/action builders, orchestration adapter | current competing rank/presentation complexity |
| `.../components/ExistingOwnerDashboard.tsx` | maintenance/task/booking fetch and many cards | card density and direct feature fetching |
| `.../components/SignatureRecommendationCard.tsx`, `SupportingActionCard.tsx` | ranked action presentation | reusable recommendation UI |
| `apps/frontend/src/components/orchestration/ActionCenter.tsx` | action list/complete/snooze | existing execution UI |
| `apps/frontend/src/adapters/orchestration.adapter.ts` | backend→frontend decision mapping | consumer adapter pattern |
| `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/household/page.tsx` | collaborator members/invites/notification prefs | naming/access UI and per-member preferences |
| `apps/frontend/src/components/features/household/*` | member list/invite/role utilities | keep separate from demographic profile |
| `apps/frontend/src/app/(dashboard)/dashboard/profile/page.tsx` | user correction, deactivation/deletion | account privacy/control integration |
| `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/onboarding/OnboardingClient.tsx` | React Query step flow, progress, skip, responsive UI | progressive profiling UX precedent |
| `.../onboarding/steps/*` | property/rooms/inventory/protection/insights steps | contextual profile opportunities |
| `apps/frontend/src/lib/api/client.ts` | `APIClient.request`, CSRF/refresh/errors, property cache and feature methods | central HTTP behavior; class is already oversized |
| `apps/frontend/src/lib/providers/QueryProvider.tsx` | 60s stale time/retry policy | server-state defaults |
| `apps/frontend/src/lib/property/PropertyContext.tsx` | selected property persistence and route parsing | property-scoped queries |
| `apps/frontend/src/lib/auth/AuthContext.tsx` | cookie session/user context | auth frontend |
| `apps/frontend/src/lib/notifications/NotificationContext.tsx` | list/count/optimistic read state | notification consumer |
| `apps/frontend/src/lib/consent/index.tsx` | analytics consent in localStorage | consent UX precedent; personalization needs server-side purpose consent |
| `apps/frontend/src/lib/monitoring/faro.ts` | consent-gated RUM/logging | privacy-aware frontend observability |
| `apps/frontend/src/components/mobile/dashboard/MobilePrimitives.tsx` | mobile cards/containers/status chips | responsive design system |
| `apps/frontend/src/components/system/PremiumPrimitives.tsx` | confidence/trust/metric/page/action primitives | explainability UI reuse |
| `apps/frontend/src/components/ui/*` | Radix/Tailwind controls | accessible component base |
| `apps/frontend/src/lib/storage/db.ts`, service worker/PWA files | IndexedDB/offline behavior | stale/offline recommendation policy |

## Infrastructure and deployment

| Evidence | Verified configuration | Relevance |
|---|---|---|
| `infrastructure/kubernetes/apps/backend/deployment.yaml` | API x5; 500m/800Mi requests, 1 CPU/1.2Gi limits; PostgreSQL/Redis/Gemini/Sentry/Loki env | Pi resource budget/API topology |
| `infrastructure/kubernetes/apps/frontend/deployment.yaml` | frontend x3 base + HPA 3–8, 300m/512Mi request | web topology |
| `infrastructure/kubernetes/apps/workers/deployment.yaml` | workers x2, 250m/512Mi request, metrics 9091 | cron duplication risk/background capacity |
| `infrastructure/kubernetes/overlays/raspberry-pi/resource-limits.yaml` | frontend x4, API x5/HPA 5–12 | intended Pi overlay sizing |
| `infrastructure/kubernetes/overlays/raspberry-pi/kustomization.yaml` | ARM images and included data/apps | deployment composition |
| `infrastructure/kubernetes/data/postgres/statefulset.yaml` | PG15 x1, 2–4Gi, 100Gi local-path, Pi-tuned config | choose PostgreSQL; single-node/storage constraints |
| `infrastructure/kubernetes/data/redis/statefulset.yaml` | Redis7 x1 AOF, 0.5–1.5Gi, 10Gi | queue/cache already available |
| `infrastructure/kubernetes/data/postgres/backup-cronjob.yaml` | database backup schedule | data protection base |
| `infrastructure/kubernetes/monitoring/prometheus/*` | PodMonitor, alerts, Prometheus values | metric collection |
| `infrastructure/kubernetes/monitoring/loki/*` | Loki/Alloy/Promtail config | structured log collection |
| `infrastructure/kubernetes/monitoring/grafana/security-dashboard-configmap.yaml` | security dashboard | operational visibility |
| `infrastructure/kubernetes/ingress/cloudflare-tunnel/deployment.yaml` | Cloudflare tunnel x2/domains | external ingress |
| `docker-compose.yml` | local PostgreSQL/Redis/API/frontend/workers | developer topology |

## Test and CI evidence

| Evidence | Relevance |
|---|---|
| `apps/backend/tests/` (55 `.test.js` files) | Node unit/integration/e2e patterns; strong Decision/Guidance/auth/security coverage, no personalization/migration/privacy suite |
| `apps/frontend/src/**` (28 Jest test files) | component/adapter/visual tests; limited full-flow/accessibility coverage |
| `.github/workflows/backend-quality-gates.yml` | generates Prisma client, runs unit and integration tests |
| `.github/workflows/frontend-quality-gates.yml` | ESLint plus governance/visual gates; does not explicitly run complete Jest suite |
| `.github/workflows/security.yml`, `codeql.yml` | dependency/secret/static security gates |
| `tests/e2e`, `tests/load`, `tests/security` | repo-level harness directories; not a verified personalization suite |

## Evidence limitations

No live cluster, production database, Grafana, queue, external provider account, or user research was accessed. Source manifests may differ from deployed state. The assessment did not execute production endpoints or mutate data. Generated `dist/` was ignored in favor of TypeScript source. Existing documentation was not treated as proof without source confirmation.
