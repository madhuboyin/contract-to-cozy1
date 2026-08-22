[← Back to Wiki Home](README.md)

# Architecture & Data Model

> Everything below was verified against the code at the time of writing (routes counted with `ls`, models counted with `grep '^model ' prisma/schema.prisma`, etc.), not against `docs/functional/` or `docs/product/`, which are historical planning docs and drift from what's actually implemented. Two concrete drifts found: `apps/CLAUDE.md` says "52 route files / 30+ models" — the real numbers are **127 route files** and **505 Prisma models**. Read counts here as current, not the docs that state otherwise.
>
> This page is pure implementation — how the code is organized, not what the product is for. See [Introduction](00-introduction.md) for the canonical product definition and the decision & action loop that the routes/services/jobs below actually implement.

## 1. Monorepo Layout

The repo root holds three deployable apps under `apps/` (backend, frontend, workers, plus an `ios/` client), supporting infra and data directories at the root, and a large `docs/` tree. `apps/backend` and `apps/workers` share one Prisma schema — workers run `prisma generate` against the backend's `schema.prisma` rather than owning their own.

```
contract-to-cozy/
├── apps/
│   ├── backend/        # Express REST API (port 8080)
│   │   ├── src/
│   │   │   ├── routes/        (127 files)
│   │   │   ├── controllers/   (105 files)
│   │   │   ├── services/      (298 files)
│   │   │   ├── middleware/    (17 files)
│   │   │   ├── modules/gazette/   # self-contained module pattern
│   │   │   └── community/, sellerPrep/, localUpdates/, homeRenovationAdvisor/,
│   │   │       refinanceRadar/, neighborhoodIntelligence/, propertyIntelligence/,
│   │   │       propertyBrief/, homeBriefing/, productFramework/,
│   │   │       propertyChanges/, feedback/   # colocated feature directories
│   │   └── prisma/schema.prisma   # 505 models, ~23k lines
│   ├── frontend/       # Next.js 14 App Router (port 3000)
│   ├── workers/        # BullMQ job processors + cron + pollers
│   └── ios/            # native iOS client
├── infrastructure/     # Docker, Kubernetes (k3s), Terraform, Ansible
├── database/           # migrations & seed files
└── docs/               # functional/product FRDs (historical), + this wiki
```

## 2. Backend Architecture

**Pattern:** Routes → Controllers → Services → Prisma ORM. Entry point is `apps/backend/src/index.ts`, a single Express app that initializes Sentry before any other import, then wires ~150 `app.use('/api', ...)` router mounts (most feature routers mount at the bare `/api` prefix and define their own sub-paths internally, rather than each getting a unique prefix).

### Startup sequence (from `src/index.ts`)
- Sentry init (must be first, so OpenTelemetry can wrap Express/Prisma/HTTP).
- Fail-fast registry validation: on boot, the app validates several in-code registries (Ask operation/audience/domain-command registries, Skill definitions/adapters/handoffs/lineage/dependencies, Decision Platform preference/context/definition/thread-transition contracts) and **throws immediately** if any are inconsistent — these are internal correctness gates for the Ask/Skills/Decision Platform subsystems, not infrastructure checks.
- Middleware chain (in order): `requestIdMiddleware` → `helmet()` (CSP disabled only on `/api/docs` for Swagger UI) → CORS (env-driven `ALLOWED_ORIGINS`, required in production) → JSON/urlencoded body parsing (1MB limit) → `cookieParser` → CSP-report intake → `csrfProtection` → `metricsMiddleware` → global `apiRateLimiter`.
- Health/metrics endpoints: `/api/health`, `/api/ready` (public), `/api/health/deep` (internal-network-only, checks DB + Redis), `/metrics` (Prometheus, bearer-token gated).
- Swagger UI at `/api/docs`, Basic-Auth gated in production (`SWAGGER_PASSWORD` required to boot).
- 404 handler, then Sentry's Express error handler, then the app's own `errorHandler` — must stay last in the chain.

### Middleware (`src/middleware/`, 17 files)

| Middleware | What it actually does |
|---|---|
| `auth.middleware.ts` | `authenticate` — verifies JWT (from cookie or `Authorization: Bearer`), loads the user, rejects on `tokenVersion` mismatch (password-change revocation), suspended/inactive accounts, and unverified email. `authenticateAllowUnverified` is the same but skips the email-verification gate (used only by `/me`, `/logout`, `/resend-verification`). Also exports `requireRole(...)`, `restrictToHomeowner`, `requireMfa` (admin-only TOTP enforcement), and `optionalAuth`. |
| `propertyAuth.middleware.ts` | Resolves whether `req.user` has access to `:propertyId` via `resolvePropertyAccess()`, attaches `req.property` and `req.householdRole`. `requireHouseholdRole('CONTRIBUTOR'\|'OWNER')` enforces a household-role floor (`VIEWER: 0 < CONTRIBUTOR: 1 < OWNER: 2`) for mutating routes. |
| `validate.middleware.ts` | `validate(schema)` (validates body+query+params) and `validateBody(schema)` — both wrap a Zod `parseAsync`, returning a uniform 400 `VALIDATION_ERROR` shape on failure. |
| `rateLimiter.middleware.ts` | Redis-backed (via a Lua INCR+PEXPIRE script, with an in-process fallback if Redis is down) sliding-window limiters, each in its own namespace: `authRateLimiter`, `strictRateLimiter` (3/hr, password reset etc.), `apiRateLimiter` (global, keyed by user or IP, skips `/auth/*`), `aiOracleRateLimiter`, `geminiRateLimiter`, `expensiveAiRateLimiter`, `uploadRateLimiter`, `ocrRateLimiter`, `vaultPasswordRateLimiter`/`vaultShareAccessRateLimiter`, `renovationEvaluationRateLimiter`. |
| `csrf.middleware.ts` | CSRF protection for cookie-authenticated mutating requests; requests carrying a Bearer token skip it. |
| `adminCapability.middleware.ts` | `requireCapability(name)` — fine-grained admin permission check beyond role (see Admin & Ops models). |
| `householdRole.middleware.ts`, `documentAuth.middleware.ts`, `recallMatchAuth.middleware.ts`, `intelligenceCoverage.middleware.ts`, `premiumOcrGate.middleware.ts`, `seasonalOwnership.middleware.ts`, `rollout.middleware.ts` | Feature-specific auth/gating middleware (household-scoped roles, document ownership, recall-match ownership, intelligence source coverage gates, premium OCR quota gate, seasonal-checklist ownership, and rollout/feature-flag gating). |
| `error.middleware.ts`, `metrics.middleware.ts`, `requestId.middleware.ts` | Centralized error formatting (must be last), Prometheus request metrics, and per-request ID tagging for log correlation. |

### `src/modules/gazette/` — the self-contained module pattern
A newer convention for complex features: everything for one feature lives under one directory with clear internal layering — `controllers/`, `services/`, `routes/` (`gazette.routes.ts` + `gazetteInternal.routes.ts`), `validators/`, `mappers/`, `dto/`. It's mounted into `index.ts` like any other router. Concretely, the Gazette feature has since been retired in favor of Home Briefing — its routes now return `410 Gone` with a pointer to the replacement (`/api/properties/:propertyId/home-briefings`), while the module's file layout is preserved as the reference example of this pattern. New complex features are expected to follow this shape rather than spreading files across the flat `routes/` / `controllers/` / `services/` directories.

### Colocated feature directories
Instead of routes/controllers/services being split across the three top-level flat directories, some features are colocated as their own directory at `src/<feature>/` (mirroring the module pattern but usually flatter — controller+service+routes+types, no separate mapper/dto layers): `community/`, `sellerPrep/`, `localUpdates/`, `homeRenovationAdvisor/`, `refinanceRadar/`, `neighborhoodIntelligence/`, `propertyIntelligence/`, `propertyBrief/`, `homeBriefing/`, `productFramework/` (cross-cutting contracts — capabilities, decision platform, ask registries, recommendation governance), `propertyChanges/`, `feedback/`. Some of these (`sellerPrep/`, `homeRenovationAdvisor/`, `refinanceRadar/`) have grown their own sub-directories for engines, mappers, validators, and provider integrations.

### Scale
- **126 route files** in `src/routes/` alone (plus the colocated directories above) — this count has drifted by one file since the wiki was first written; treat it as approximate and re-count (`find src/routes -name '*.ts' | wc -l`) if precision matters.
- **105 controllers**. Services are **256 files directly under `src/services/`**, or **575 files counting the 42 subdirectories underneath it** (`find src/services -name '*.ts' | wc -l`) — a prior version of this page said "298," which matches neither count precisely and appears stale. Use 256 for "how many top-level service modules," 575 for "how much service-layer code total."
- Key API prefixes actually mounted with a dedicated prefix: `/api/auth` (+ `/api/auth/mfa`), `/api/providers`, `/api/bookings`, `/api/vault`, `/api/weather`, `/api/environment`, `/api/properties`, `/api/users`, `/api/checklist`, `/api/risk`, `/api/gemini`, `/api/inventory` (mounted generically), `/api/documents`, `/api/oracle`, `/api/budget`, `/api/climate`. The large majority of feature routers, though, mount at the bare `/api` and define their own paths (e.g. `homeActionsRoutes`, `guidanceRoutes`, dozens of `admin*Routes`) — there is no one-to-one prefix-per-feature convention beyond the earliest features.

## 3. Frontend Architecture

Next.js **^16.2.6** (per `apps/frontend/package.json` — a prior version of this page said "Next.js 14," which is stale), App Router, path alias `@/*` → `./src/*`.

- **Route groups:** `app/(auth)/` (login, signup, forgot-password, reset-password, verify-email), `app/(dashboard)/` (dashboard, savings — homeowner-authenticated pages), and `app/providers/(dashboard)/` (a parallel authenticated area for the provider role: provider dashboard, bookings). Several top-level routes live outside any group (`gazette`, `home-briefing`, `home-score`, `invite`, `knowledge`, `onboarding`, `property-brief`, `vault`, `reports`, `renovation-closeout`, `acceptance` — internal acceptance-test harness pages).
- **API client (`src/lib/api/client.ts`):** one large typed `APIClient` class (thousands of lines, ~120+ methods covering every backend feature domain — admin ops, coverage, onboarding, personalization, radar, savings, etc.). Auth is **cookie-based** (`credentials: 'include'` on nearly every call) with CSRF-token fetch/cache built in; `getToken()`/`setToken()` are now no-ops (tokens are httpOnly cookies, not localStorage). It queues requests that hit a 401 and retries them once a refresh completes (`processFailedQueue`).
- **Auth (`src/lib/auth/AuthContext.tsx`):** React context wrapping login/logout/register/MFA-challenge flows; on logout it clears the React Query cache and a `selectedPropertyId` localStorage key so a new session in the same tab never sees stale cross-account state. Exposes `isHomeowner`/`isProvider`/`isAdmin` booleans derived from `user.role`.
- **React Query (`src/lib/providers/QueryProvider.tsx`):** `staleTime: 60s`, retries up to 2 times but never retries a 429.
- **`src/adapters/`:** currently just `orchestration.adapter.ts` — an orchestration-layer adapter (other feature-specific adapters mentioned in `apps/CLAUDE.md` were not found as separate files; the directory is thinner than the doc implies).
- **`src/store/`:** present but empty at the time of writing — no client-side store files currently live there.
- **`src/features/`:** self-contained feature slices — `ask/`, `guidance/`, `homeEventRadar/`, `renovations/`, `tools/`.
- **`src/content/`:** static copy, e.g. `toolExplainers.ts`.
- **PWA/offline:** service worker registered client-side (`src/lib/pwa.ts::registerServiceWorker`, served from `public/sw.js`, with a Trusted-Types-safe URL construction path) inside `app/providers.tsx`. `public/manifest.json` provides the PWA manifest. `src/lib/storage/db.ts` wraps IndexedDB (via `idb`) with three stores: `maintenance-tasks` (offline-editable, `syncStatus: synced|pending|failed`), `offline-queue` (queued mutating requests to replay when back online), and `cached-properties`.

## 4. Workers Architecture

`apps/workers/src/worker.ts` is the entry point: it registers ~60 BullMQ job processors and `node-cron` schedules, installs graceful-shutdown handling, and validates startup dependencies before accepting work.

- **Jobs (`src/jobs/`, ~65 files)** span several categories: seasonal checklists (`seasonalChecklistGeneration`, `seasonalChecklistExpiration`, `seasonalNotification`), notifications (`sendEmailNotification`, `sendPushNotification`, `sendSmsNotification`, `sendFeedbackNotification`, `sendHouseholdInvitation`, `sendPropertyBriefInvitation`/`UpdateNotice`), recall ingestion/matching (`recallIngest`, `recallMatch`), report/export generation (`generateHomeReportExport`, `generateMaterialSpecExport`, `generatePermitDisclosure`, `generateDiyAiGuide`), cleanup/expiry (`cleanupInventoryDrafts`, `expireGuidanceSignals`, `expireStaleWorkItemCandidates`, `expireStaleWeatherPreparations`), and a long tail of domain-specific ingestion/evaluation jobs (mortgage rates, refinance radar, neighborhood events, USGS/FEMA/AirNow hazard feeds, tax assessment events, permit history, provider credential expiry, reserve-fund recalculation, weekly retention report, etc.).
- **Runners/pollers (`src/runners/`)**: long-running loops rather than scheduled jobs — `domainEvents.poller`, `homeReportExport.poller`, `materialSpecExport.poller`, `radarNotificationDelivery.poller`, `claimFollowUpDue.poller`, `highPriorityEmailEnqueue.poller`, plus cleanup runners (`reportExport.cleanup`, `materialSpecExport.cleanup`, `propertyRecordPurge.cleanup`).
- **Backend → worker handoff:** the backend enqueues work via a `QueuePort` abstraction (`src/lib/queuePort.ts`) that lazily constructs the real BullMQ `Queue` on first use (avoiding eager Redis connections at module load, previously a test-hang trap) with a `createFakeQueue()` swap-in for tests. A concrete example in `services/JobQueue.service.ts`: after a property is created/updated, the backend does
  ```ts
  const queue = getPropertyIntelligenceQueue();
  await queue.add(PropertyIntelligenceJobType.CALCULATE_RISK_REPORT,
    { propertyId, jobType: PropertyIntelligenceJobType.CALCULATE_RISK_REPORT },
    { jobId: `${propertyId}-RISK`, attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
  ```
  which the workers process app picks up via its matching `Worker(...)` processor for that queue name. Job execution itself is additionally gated by a `JOB_REGISTRY` + `evaluateWorkerExecution()` policy check (rollout/kill-switch control per job key) before the enqueue is allowed to proceed.

## 5. Data Model

`apps/backend/prisma/schema.prisma` is ~23,000 lines and defines **505 models** (verified via `grep '^model '` — substantially more than the "30+" figure in `apps/CLAUDE.md`, which is stale). The schema has grown by accretion: nearly every feature vertical below has its own multi-model sub-schema (workspace/revision/event patterns repeat constantly — e.g. most "X" domains have an `X`, `XRevision`/`XEvent`/`XVersion`, and often an `XShare` or `XExport`). What follows groups the models by domain and calls out the central ones; long tails of supporting models are summarized rather than enumerated one-by-one.

| Domain | Representative models | Purpose |
|---|---|---|
| **Identity & Access** | `User`, `RefreshTokenSession`, `MfaRecoveryCode`, `HomeownerProfile`, `ProviderProfile`, `ProviderCredential`, `ProviderCredentialRequirement`, `ProviderCategoryEligibility`, `ProviderComplianceAlert`, `Household`, `HouseholdProperty`, `HouseholdMember`, `HouseholdInvite`, `HouseholdActivityLog`, `PreferenceProfile` | Accounts, sessions, MFA, role-specific profiles, and the household/multi-user-per-property model (`Household`/`HouseholdProperty` is the newer "personalization" household concept; `HouseholdMember`/`HouseholdInvite` is a separate, older per-property member/invite model — both coexist). |
| **Property & Household Context** | `Property`, `Address`, `PropertyExteriorProfile`, `PropertySalePrepProfile`, `PropertyResponsibility`, `PropertyFactEvidence`, `PropertyContextCaptureReceipt`, `PropertyInsightSnapshot`, `PropertyOnboarding`, `PropertyClimateSetting`, `PropertyRecord`/`PropertyRecordVersion`/`PropertyRecordLink`/`PropertyRecordPurgeJob`/`PropertyRecordSavedSearch` | Core property record (address, geocoding cache, self-reported hazard-zone/utility facts), onboarding state, and the "Home Records" document/fact vault. |
| **Inventory & Maintenance** | `InventoryRoom`, `InventoryItem`, `InventoryRoomScanSession`, `InventoryImportBatch`, `InventoryOcrSession`/`InventoryOcrField`, `InventoryDraftItem`/`InventoryDraftBox`, `InventoryScanImage`/`InventoryScanDelta`, `Checklist`/`ChecklistItem`, `MaintenanceTaskTemplate`, `PropertyMaintenanceTask`, `MaintenancePrediction`, `SeasonalTaskTemplate`/`SeasonalChecklist`/`SeasonalChecklistItem` | Home inventory capture (including OCR/AI-assisted scanning), maintenance task tracking (two parallel systems: legacy `ChecklistItem` and newer `PropertyMaintenanceTask`), and seasonal checklist generation. |
| **Coverage & Financial** | `InsurancePolicy`/`InsurancePolicyTerm`/`InsurancePolicyFact`, `CoverageAnalysis`/`CoverageScenario`/`AssumptionSet`, `CoverageReview`/`CoverageReviewQuestion`, `CoverageComparison`/`CoverageComparisonOption`/`CoverageDecision`, `Claim`/`ClaimChecklistItem`/`ClaimDocument`/`ClaimTimelineEvent`, `Expense`, `Warranty`, `HomeReserveFund`/`HomeReserveFundLineItem`/`HomeReserveFundContribution`, `HomeCapitalTimelineAnalysis`/`Item`/`Override`, `RiskPremiumOptimizationAnalysis`, `InsuranceQuoteRequest`, `InsuranceMarketBenchmarkSource`/`Release`/`Observation`, `PropertyFinancingProfile`, `FinancingScenario`, `EquityPosition`, `PriceFinalization`/`Term` | Insurance policy tracking, coverage analysis/decisioning, claims lifecycle, reserve-fund and capital-timeline planning, financing scenarios, and quote/price finalization. |
| **Risk, Radar & Neighborhood Intelligence** | `RiskAssessmentReport`, `HomeRiskEvent`/`HomeRiskReplayRun`/`EventMatch`, `RadarSourceDefinition`/`Health`/`Coverage`/`Run`, `RadarEvent`/`RadarEventRevision`, `PropertyRadarMatch`/`State`/`Action`/`Feedback`/`Coverage`/`NotificationPreference`/`NotificationDecision`, `NeighborhoodEvent`, `PropertyNeighborhoodEvent`, `NeighborhoodImpact`, `DemographicImpact`, `IntelligenceSource`/`Coverage`/`Run`, `IntelligenceObservation`, `PropertyImpactAssessment`, `PropertyHazardOutcome`/`Assertion`/`EvidenceLink`, `RecallRecord`/`RecallProduct`/`RecallMatch`, `Incident`/`Signal`/`Action`/`SuppressionRule`/`Acknowledgement`/`Event`/`ScoreSnapshot` | The largest single cluster — external hazard/event ingestion (weather, USGS, FEMA, recalls, neighborhood/demographic signals), matched against a property, scored, and surfaced as incidents/radar feed items with per-user feedback and notification state. |
| **Guidance, AI & Personalization** | `GuidanceSignal`, `GuidanceJourney`/`Step`/`Event`/`StepEvidence`, `AskSession`/`AskExecution`/`AskExecutionEvent`/`AskTrustReviewCandidate`, `GroundedAskProposal`/`Artifact`, `DecisionThread`/`Participant`/`FactReference`/`PreferenceReference`/`Assumption`/`Option`/`Question`/`ExecutionLink`, `DecisionPreferenceValue`, `RecommendationDefinition`/`Rule`/`ContentVersion`, `RecommendationSnapshot`, `PersonalizedRecommendation`, `RecommendationExplanation`/`Feedback`/`Incident`/`Suppression`, `ProfileQuestion`/`ProfileAnswer`, `DerivedTrait`, `CalibrationRelease`/`GovernanceReview`, `OutcomeObservation`, `RecommendationAttribution` | The "Ask" conversational/AI layer, the Decision Platform (structured multi-turn decision threads), and the personalization/recommendation engine (rule-driven recommendations, calibration releases, outcome tracking, suppression rules). |
| **Knowledge & Content** | `KnowledgeArticle`/`Section`/`Category`/`Tag`, `ProductTool`, `KnowledgeArticleToolLink`/`Cta`/`AudienceRule`/`Relation`/`Event` | Editorial knowledge-base content and its linkage to in-app tools/CTAs. |
| **Provider & Marketplace** | `Service`, `Booking`/`BookingTimeline`, `Payment`, `Review`, `ProviderPortfolio`, `ProviderAvailability`, `ProviderServiceZone`, `Message`, `Favorite` | Core two-sided marketplace: service catalog, bookings with a timeline/state machine, payments, reviews, and provider messaging. |
| **Buyer Journey & New-Home Setup** | `HomeBuyerChecklist`, `HomeBuyerTask`, `BuyerJourneyMilestone`/`Contact`, `BuyerContractWorkspace`/`Revision`/`FieldConfirmation`/`Contingency`, `BuyerPurchaseFinancingPlan`/`LoanOffer`/`LoanEstimateRevision`, `BuyerClosingDisclosureWorkspace`/`Revision`, `BuyerClosingDayWorkspace`, `BuyerPurchaseLenderReadiness`/`Condition`, `BuyerTitleEscrowWorkspace`/`Issue`, `BuyerInsuranceWorkspace`/`Quote`/`Requirement`, `BuyerWalkthroughWorkspace`/`Observation`/`Issue`, `BuyerInspectionPlan`, `NewHomePilotAssessment`, `NewHomeSetupPlan`/`Task`, `NewHomePunchListItem`, `NewHomeBuilderResponse`, `NewHomeWarrantyRight`, `NewHomeSystemRegistration`, `NewHomeEvidenceRecord`, `NewHomeInspectionBundle` | A very large, self-contained vertical modeling the full home-purchase pipeline from contract through closing to post-move-in setup. |
| **Selling & Renovation** | `SellerPrepPlan`/`Lead`, `PropertySaleCase`, `SaleReadinessItem`, `PropertyTransition`, `RenovationCase`/`Exploration`/`UpgradeOption`/`ReadinessItem`/`Event`/`ComplianceCondition`/`ScopeVersion`/`Participant`/`Link`, `HomeRenovationAdvisorSession`, `HomeRenovationPermitOutput`/`TaxImpactOutput`/`LicensingOutput`/`ComplianceChecklist`, `RenovationAuthorityProfile`/`Requirement`/`Event`, `ProjectRecord`/`Milestone`/`Payment`/`ChangeOrder`/`ProgressLog`/`Issue`/`WriteBack`, `MaterialSpec`/`LifecycleEvent`/`ExtractionReview`/`Photo`/`Export` | Sale-readiness planning, the renovation-advisor decision engine (permits, taxes, licensing, compliance by jurisdiction), and contractor project tracking. |
| **Refinance & Ownership Costs** | `MortgageRateSnapshot`, `RefinanceRateMonitor`, `RefinanceOpportunity`, `PropertyRefinanceRadarState`, `RefinanceDecision`/`History`, `OwnershipCostDefinition`/`Snapshot`/`Scenario`/`Forecast`/`Change`/`Decision` | Refinance opportunity detection and long-run ownership-cost forecasting/scenario comparison. |
| **Property Tax** | `PropertyTaxJurisdiction`, `PropertyTaxRuleProfile`/`DeadlineRule`, `PropertyTaxAppealCase`/`Evidence`/`Comparable`/`Packet`/`Reminder`, `PropertyTaxAssessmentRecord`/`BillRecord`, `PropertyTaxDocumentIntake`/`ExtractedField` | Full property-tax appeal workflow, from jurisdiction rules through appeal-packet generation. |
| **HOA, Permits & Inspections** | `HoaAssociation`, `HoaApprovalRecord`, `PermitDataSource`, `PropertyPermitRecord`, `PermitInspectionMilestone`, `PermitUnpermittedFlag`, `InspectionReport`/`Finding`/`WriteBack`, `LegacyInspectionReport`/`Issue` | HOA compliance tracking, permit-history ingestion/unpermitted-work detection, and inspection reports. |
| **Hidden Assets & Savings** | `HiddenAssetSource`/`Program`/`Rule`, `PropertyHiddenAssetMatch`/`CriterionResult`, `HiddenAssetMatchOutcome`, `PropertyHiddenAssetSensitiveFact`, `SavingsBenefitAction`/`Partner`, `HomeSavingsRun`/`Opportunity`/`Account`/`Category` | The "hidden savings/benefits" discovery engine matching properties against rebate/assistance programs. |
| **Home Digital Twin & Briefing** | `HomeDigitalTwin`/`Component`/`ProjectedFact`/`Scenario`/`DataQuality`/`ComputationRun`, `HomeDigitalWill`/`Section`/`Entry`/`TrustedContact`, `PropertyChange`/`AudienceState`, `HomeBriefingPreference`/`Delivery`/`Item`/`Share`, `PropertyBrief`/`Section`/`EvidenceLink`/`Share`, `GazetteEdition`/`Story` (retired, kept for history) | Structured "digital twin" of the home's systems/facts, a digital-will/legacy-planning feature, and the Home Briefing / Property Brief change-notification surfaces that replaced the retired Gazette. |
| **Admin & Ops** | `AuditLog`, `SystemSetting`, `AdminCapabilityGrant`, `AdminCase`/`Note`, `AccessCertificationCampaign`/`Decision`, `RefundRequest`, `PrivacyRequest`, `CronJobLock`, `DomainEvent`, `ProductAnalyticsEvent`, `PropertyAnalyticsDailyRollup`, `FeatureAnalyticsDailyRollup`, `AdminAnalyticsDailySnapshot`, `OperationalWorkItem`/`Source`/`Execution`/`Event`/`Evidence`/`Watcher`/`Reconciliation` | Admin console backing (capability grants, case management, access certification), privacy/refund request handling, and the operational work-item queue that backs the admin worker-jobs UI. |
| **DIY & Habits** | `DiySkillProfile`, `DiyProjectTemplate`/`Step`/`Material`/`Tool`, `DiyProject`/`Step`/`Material`/`Tool`, `DiyAiGuide`, `HabitTemplate`, `PropertyHabit`/`Action`/`Preference` | DIY project guidance (including AI-generated guides) and habit-coaching/gamification. |
| **Notifications** | `Notification`, `NotificationDelivery`, `NotificationPreference`, `NotificationChannelConsent`, `PushSubscription`, `NotificationOutcome`, `HomeActionProactiveDeliveryDecision` | Multi-channel (email/push/SMS) notification delivery, preferences, and consent tracking. |

Enums worth knowing: `UserRole` (`HOMEOWNER` / `PROVIDER` / `ADMIN`), `UserStatus` (`ACTIVE` / `SUSPENDED` / `INACTIVE` / `PENDING_VERIFICATION`), `HouseholdRole` (`VIEWER` / `CONTRIBUTOR` / `OWNER`), `BookingStatus`.

## 6. Authentication & Authorization

**JWT access/refresh flow** (`src/utils/jwt.util.ts`, `src/middleware/auth.middleware.ts`, `src/routes/auth.routes.ts`):
- `POST /api/auth/register` / `/login` issue a short-lived **access token** and a longer-lived **refresh token** (both JWTs, signed with separate secrets `JWT_SECRET`/`JWT_REFRESH_SECRET`), delivered as httpOnly cookies (the frontend never touches them directly — `credentials: 'include'` throughout `client.ts`). `POST /api/auth/refresh` mints a new access token from a valid refresh token.
- Tokens embed `userId`, `email`, `role`, a `tokenVersion` snapshot, and MFA flags (`mfaEnabled`, `mfaVerified`). `User.tokenVersion` is incremented on password change, and `authenticate` rejects any token whose embedded version doesn't match the current DB value — an effective global session-revocation mechanism on password change.
- `PUT /api/auth/change-password` requires the current password, bumps `tokenVersion`, and is rate-limited by `strictRateLimiter` (3/hour).

**Roles.** Three: `HOMEOWNER`, `PROVIDER`, `ADMIN` (the `UserRole` enum). Role checks happen via `requireRole(...UserRole[])` middleware (401 if unauthenticated, 403 if the role isn't in the allowed list) and the narrower `restrictToHomeowner` (also requires an attached `homeownerProfile`). The frontend mirrors this with `isHomeowner`/`isProvider`/`isAdmin` derived in `AuthContext`.

**MFA** (`src/routes/mfa.routes.ts`, `mfa.controller.ts`) is TOTP-based and **admin-only for v1.0** — `requireMfa` middleware only enforces the check when `role === 'ADMIN'`. Flow: `POST /mfa/setup` returns an otpauth URI + base32 secret; `POST /mfa/setup/verify` confirms with the first code and enables MFA; subsequent logins for an MFA-enabled admin get a short-lived `mfaToken` (5 min) instead of real tokens, exchanged via `POST /mfa/challenge` (TOTP code) or `POST /mfa/challenge/recovery` (one-time recovery code) for the actual access/refresh pair with `mfaVerified: true` baked in. Recovery codes can be regenerated after re-verifying a TOTP code.

**Property-level access control** (`propertyAuth.middleware.ts`): given `:propertyId` on the route, `resolvePropertyAccess(userId, propertyId)` determines whether the user has any relationship to that property (owner or household member) and what `HouseholdRole` they hold; a 404 (not 403) is returned on no-access to avoid leaking property existence. `requireHouseholdRole('CONTRIBUTOR' | 'OWNER')` then enforces a role floor for mutations — `VIEWER`s can read but never write to a property they've been given visibility into.

## 7. Deployment & Infrastructure

`infrastructure/` holds: `docker/` (per-app Dockerfiles for `backend/`, `frontend/`, `workers/`), `kubernetes/` (base manifests plus `overlays/{production,staging,raspberry-pi}`), `terraform/` (environments + modules), `ansible/` (inventory/playbooks/roles), and `helm/`.

Production targets a **Raspberry Pi ARM64 k3s cluster** — confirmed by the dedicated `overlays/raspberry-pi` Kustomize overlay and by the backend Dockerfile itself, which pins a multi-arch `node:22-bookworm-slim` base (Debian/glibc, not Alpine) specifically because Alpine's musl libc previously truncated the generated Prisma client and mismatched the ARM64 native engine. The backend image is a multi-stage build: `deps` (prod-only npm install, plus build-time sanity checks on the Gemini SDK's CommonJS export and the Prisma WASM schema-builder), `prisma-gen` (isolated `prisma generate`, schema-only), `builder` (TypeScript compile), then a slim runtime stage.

From repo root: `make build` (x86 images), `make build-arm` (ARM64 for the Pi), `make deploy-pi` (deploy to the Pi k3s cluster). See the root `CLAUDE.md` for the full command list. This page is a pointer, not an ops runbook — consult `infrastructure/kubernetes/overlays/raspberry-pi` and the Ansible playbooks directly for cluster specifics.

## 8. Key Environment Variables

**Corrected against the real `.env.local.example`** (a prior version of this table omitted several required secrets and listed a client-side Gemini key that doesn't exist anywhere in the codebase — Gemini is server-side only):

| Variable | Purpose |
|---|---|
| `POSTGRES_PASSWORD` / `REDIS_PASSWORD` | Required, no defaults — Postgres and Redis auth |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` / `JWT_MFA_SECRET` | Access/refresh/MFA-challenge token signing |
| `SESSION_SECRET` / `CSRF_SECRET` | Session and CSRF protection |
| `MFA_ENCRYPTION_KEY` | AES-256 key encrypting TOTP secrets at rest |
| `GEMINI_API_KEY` | Server-side Gemini key (backend only, optional) |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist — required to boot in production |
| `SWAGGER_PASSWORD` / `METRICS_BEARER_TOKEN` | Gate `/api/docs` and `/metrics` |

`DATABASE_URL`, `REDIS_HOST`/`REDIS_PORT`, and `NEXT_PUBLIC_API_URL` are not developer-set — Docker Compose hardcodes/derives them (see `docker-compose.yml`). Generate secrets with `openssl rand -hex 32`. Copy `.env.local.example` → `.env.local` at repo root; Docker Compose reads it directly.

## Related pages

- [Onboarding & Property Setup](features/01-onboarding-and-property-setup.md)
- [Admin, Analytics & Platform Operations](features/08-admin-analytics-and-platform-operations.md)
- [← Back to Wiki Home](README.md)
