# 02 — Current-State Architecture

## System boundary

The maps below are **verified current state** unless annotated. They describe relevant paths, not every product feature.

## Backend component diagram

```mermaid
flowchart LR
  FE["Next.js dashboard"] --> IDX["Express index.ts route mounts"]
  IDX --> MW["JWT / CSRF / rate limit / Zod / property auth"]
  MW --> CTL["Feature controllers"]
  CTL --> SVC["Feature services"]
  SVC --> PR["Prisma client"]
  PR --> PG[("PostgreSQL 15")]
  SVC --> REDIS[("Redis 7 / BullMQ")]
  SVC --> EXT["Weather, community, Gemini, S3 and other providers"]
  WK["Workers: BullMQ + node-cron"] --> PG
  WK --> REDIS
  WK --> EXT
  WK --> NS["Notification + Delivery rows"]
  NS --> FE
```

Business rules predominantly live in services and pure helper engines, with some ranking/presentation rules in frontend dashboard files. There is no shared personalization service.

## Frontend-to-backend request flow

```mermaid
sequenceDiagram
  participant U as Homeowner
  participant P as Next.js page/component
  participant Q as React Query or local state
  participant A as APIClient.request
  participant E as Express route
  participant M as Auth/property middleware
  participant S as Controller/service
  participant D as Prisma/PostgreSQL
  U->>P: Visit property feature
  P->>Q: Request query or effect
  Q->>A: Cookie-authenticated fetch + CSRF for mutation
  A->>E: /api/...
  E->>M: authenticate, validate, property scope (route-dependent)
  M->>S: authorized request
  S->>D: direct Prisma queries/transaction
  D-->>S: records
  S-->>A: { success, data } or feature-specific shape
  A-->>Q: parsed response/error
  Q-->>P: render cards/actions
```

Authentication uses httpOnly-cookie access/refresh flow; `APIClient.getToken()` intentionally returns null. Property selection is retained in `PropertyContext`. Not every page uses React Query: dashboard and several feature components issue their own parallel requests.

## Recommendation and task-generation flows

```mermaid
flowchart TD
  P["Property/system facts"] --> R["RiskAssessmentService"]
  R --> RR[("RiskAssessmentReport")]
  RR --> O["OrchestrationService"]
  C[("ChecklistItem")] --> O
  O --> DE["runDecisionEngine"]
  DE --> AC["Action Center response"]
  AC --> UI["User adds/completes/snoozes"]
  UI --> PMT[("PropertyMaintenanceTask / events / snooze")]
  RR -. "risk integration" .-> PMT

  ST[("SeasonalTaskTemplate")] --> SJ["Seasonal generation cron"]
  SJ --> SC[("SeasonalChecklistItem")]
  SC -->|"user adds"| PMT

  PP[("SellerPrepPlan preferences JSON")] --> SP["Seller Prep personalization helper"]
  SP --> SPI["Sorted plan items + summary"]

  SIG[("Signals / feature outputs")] --> G["Guidance engine"]
  G --> J[("Journey / step / evidence")]

  DT[("HomeTwinComponent")]
  DT --> DTR["Prebuilt scenario suggestions"]
```

Key observations:

- `runDecisionEngine` is current closest analogue to centralized ranking but only consumes candidates built by orchestration and has a fixed tool vocabulary.
- Tasks can be produced through several paths. `actionKey` and unique indexes provide partial dedupe; legacy checklist and new task records coexist.
- Seller Prep, Daily Pulse, Room Plant Advisor, Digital Twin, Guidance and neighborhood features have separate recommend/rank/suppress implementations.

## Current data relationships

```mermaid
erDiagram
  USER ||--o| HOMEOWNER_PROFILE : has
  HOMEOWNER_PROFILE ||--o{ PROPERTY : owns
  PROPERTY ||--o{ HOUSEHOLD_MEMBER : grants_access
  USER ||--o{ HOUSEHOLD_MEMBER : authenticates
  PROPERTY ||--o{ HOME_ASSET : contains
  PROPERTY ||--o{ INVENTORY_ITEM : inventories
  PROPERTY ||--o{ PROPERTY_MAINTENANCE_TASK : schedules
  PROPERTY ||--o{ SEASONAL_CHECKLIST : has
  SEASONAL_CHECKLIST ||--o{ SEASONAL_CHECKLIST_ITEM : contains
  PROPERTY ||--o| RISK_ASSESSMENT_REPORT : assesses
  PROPERTY ||--o{ PROPERTY_SCORE_SNAPSHOT : records
  PROPERTY ||--o| HOME_DIGITAL_TWIN : models
  HOME_DIGITAL_TWIN ||--o{ HOME_TWIN_COMPONENT : contains
  PROPERTY ||--o{ SIGNAL : emits
  PROPERTY ||--o{ GUIDANCE_SIGNAL : resolves
  PROPERTY ||--o{ GUIDANCE_JOURNEY : guides
  USER ||--o{ NOTIFICATION : receives
  NOTIFICATION ||--o{ NOTIFICATION_DELIVERY : delivers
  PROPERTY ||--o{ SELLER_PREP_PLAN : prepares
```

There is no `Household` profile entity and no pet, goal, lifestyle, trait definition/snapshot, recommendation definition, personalized recommendation, or recommendation feedback entity. `HouseholdMember` must remain an ACL/collaboration relation.

## How scores work today

| Score/rank | Inputs | Persistence | Rule location |
|---|---|---|---|
| Health score | Property fields, assets, warranties, documents, active bookings | Property fields and weekly `PropertyScoreSnapshot` | `utils/propertyScore.util.ts` |
| Risk | Property/system risk inputs | one `RiskAssessmentReport` per property | `services/RiskAssessment.service.ts` and constants |
| Financial efficiency | expenses/protection/property data | `FinancialEfficiencyReport`, score snapshots | financial services/workers |
| Decision ranking | urgency, financial impact, risk reduction, effort, confidence, freshness, reversibility | response diagnostics, not catalog instances | `services/decisionEngine.service.ts` |
| Neighborhood | impact, distance, confidence, freshness | property-event match | neighborhood services |
| Seller Prep | timeline, budget, goal, condition | preferences JSON and items | Seller Prep engines |
| Digital Twin quality | completeness/confidence by dimension | twin quality and computation runs | Digital Twin services |

## Notifications

Feature code creates `Notification` plus channel `NotificationDelivery` records. Workers deliver/batch email and mark delivery status. Current controls exist in both `HomeownerProfile.notificationPreferences` JSON and per-collaborator boolean fields, causing two preference sources. Feature jobs generally own their own dedupe and timing. There is no cross-feature notification budget or centralized fatigue score.

## Deployment diagram

```mermaid
flowchart TB
  WEB["Browser / PWA"] --> CF["Cloudflare tunnel x2"]
  CF --> F["Next.js frontend x4 in Pi overlay"]
  F --> A["Express API x5"]
  A --> P[("PostgreSQL x1\n100 Gi local PVC")]
  A --> R[("Redis x1\n10 Gi AOF PVC")]
  W["Worker x2\nBullMQ + node-cron"] --> P
  W --> R
  A --> OBS["Prometheus / Loki / Sentry"]
  W --> OBS
  F --> FARO["Faro / Sentry with consent"]
```

The deployment manifest is evidence of intended topology, not measured available headroom. Five API pods each request 800 MiB, workers request 512 MiB each, frontend pods request 512 MiB each, and PostgreSQL requests 2 GiB. Personalization should therefore avoid per-request full-profile joins and unnecessary replicas/services.

## Starting point

Create `apps/backend/src/modules/personalization/` with adapters for `Property`, assets/inventory, `Signal`, climate/weather, tasks/history, and collaboration. Reuse the Decision Engine's pure patterns, Signal confidence/freshness, Guidance evidence, Digital Twin computation runs, and Notification delivery. Do not make any one of those feature-specific models the new aggregate.
