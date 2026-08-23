[← Back to Wiki Home](../README.md)

# Admin, Analytics & Platform Operations

Unlike the other feature-guide pages, this cluster isn't a homeowner-facing job — it's the governance and trust infrastructure that makes the rest of the product's decision & action loop safe to run at scale: kill-switches on AI/automation, capability-gated access, an audit trail, and the background job system that actually executes ingestion/matching/delivery work behind Home Event Radar, recalls, notifications, and more. C2C runs a dedicated internal console for the `ADMIN` role — roughly two dozen `admin*.routes.ts` files behind a shared authentication/MFA/role gate plus a fine-grained, per-user **capability** system, backed by a matching Next.js console under `/dashboard/admin/*` and a few sibling top-level routes (`/dashboard/analytics-admin`, `/dashboard/worker-jobs`). This page covers that console end to end, the platform's background job/queue system (BullMQ via `apps/workers`), the multi-channel notification pipeline, and the Home Gazette module — which turned out, on reading the code, to be almost entirely retired.

## Access control model (applies to nearly every section below)

Every `admin*.routes.ts` file in `apps/backend/src/routes/` follows the same chain, mounted with `router.use(<path>, authenticate, requireMfa, requireRole(UserRole.ADMIN), ...)`:

1. **`authenticate`** — valid JWT.
2. **`requireMfa`** — **correction: this does not mandate MFA enrollment.** Reading `auth.middleware.ts` (~line 296) directly: the middleware's own doc comment says "Admin accounts with `mfaEnabled=false` pass through (setup not yet complete)," and the code matches — it only blocks when `role === 'ADMIN' && mfaEnabled && !mfaVerified`. An admin who has never enrolled MFA passes this gate freely; `requireMfa` verifies MFA *for accounts that have it enabled*, it doesn't require every admin to have it enabled. A prior version of this page overstated this as "admin actions cannot be taken from an MFA-less session," which is false.
3. **`requireRole(UserRole.ADMIN)`** — coarse role gate.
4. **`requireCapability('<NAME>')`** (`apps/backend/src/middleware/adminCapability.middleware.ts`) — a fine-grained per-user grant check on top of the role. It re-checks `role === ADMIN` itself (defense in depth), then calls `hasCapability(userId, capability)` against the `AdminCapabilityGrant` table; a denial is written to the audit log via `auditLog('PERMISSION_DENIED', ...)`. So being an ADMIN user is necessary but not sufficient — each workspace/action also requires an explicit capability grant (e.g. `USER_VIEW`, `PROVIDER_SUSPEND`, `REFUND_APPROVE`, `ADMIN_ROLE_MANAGE`). Capabilities and persona bundles are code-owned in `apps/backend/src/config/adminCapabilities.ts`; `AdminCapabilityGrant` rows are soft-revoked (`revokedAt`) rather than deleted, so grant history stays reviewable.

Frontend pages mirror this at the UX layer with `useAdminGuard()` (`apps/frontend/src/hooks/useAdminGuard.tsx`), which checks `user.role === 'ADMIN'` client-side and renders loading/unauthenticated/forbidden/offline states via `AdminConsoleShell`/`AdminRouteState` — this is a UX convenience only; the real enforcement is the backend capability chain above. Most admin pages are wrapped in `AdminConsoleShell` (`apps/frontend/src/components/ops/AdminConsoleShell.tsx`), giving the console a consistent header/back-button/shell. **Correction: this is not universal, as a prior version of this page claimed.** `admin/diy/templates/page.tsx` (the list view) uses it, but `admin/diy/templates/new/page.tsx` and `admin/diy/templates/[id]/edit/page.tsx` (the two DIY template editor pages) do not reference `AdminConsoleShell` at all — they render outside the standard console shell.

The full workspace list lives in `apps/frontend/src/lib/navigation/adminNavigation.ts` (`ADMIN_NAV`), which renders in place of the homeowner/provider nav for the ADMIN role.

## Admin Console landing, search & work queues

- **What it does:** `/dashboard/admin` is the console home: a global search box across every admin domain the actor can view, plus live "work waiting" tiles for actionable queues, plus (via nav) the full workspace grid.
- **User flow:**
  1. Admin lands on `/dashboard/admin`.
  2. Types a query (name/email/booking number/case/etc.) and submits — results are capability-scoped server-side.
  3. Clicks a result to jump straight into the relevant workspace, or clicks a non-zero "work waiting" tile to jump to that queue.
- **Frontend:** `apps/frontend/src/app/(dashboard)/dashboard/admin/page.tsx`, `apps/frontend/src/app/(dashboard)/dashboard/admin/work-queues/page.tsx`, shared shell in `components/ops/AdminConsoleShell.tsx`.
- **Backend:**
  - `GET /api/admin/search` (`adminSearch.routes.ts` → `services/adminSearch.service.ts`, capability `ADMIN_DASHBOARD_VIEW`) — fans a single query out across Users, Providers, Bookings, Cases, and Privacy Requests (`AdminSearchResult['type']` is exactly this 5-way union today; nothing else is indexed yet).
  - `GET /api/admin/work-queues` (`adminWorkQueues.routes.ts` → `services/adminWorkQueues.service.ts`, capability `ADMIN_DASHBOARD_VIEW`) — parallel `count()` queries across `ProviderCredential` (pending review), `ProviderComplianceAlert` (new), `Review` (pending/flagged), `AdminCase` (open, and open+critical), `Booking` (disputed), `ProviderProfile` (pending approval), `RefundRequest` (pending approval), `PrivacyRequest` (open states), `KnowledgeArticle` (review/awaiting-publish), `AccessCertificationDecision` (pending), `DiyProjectTemplate` (review/awaiting-publish).
- **Data:** reads across the models above; writes nothing itself.
- **Notes:** Search and queue counts are described in code comments as "baseline `ADMIN_DASHBOARD_VIEW`" — the search service itself still only surfaces rows in domains the actor holds the domain-specific view capability for, and each linked workspace re-enforces its own capability on open. This is a real defense-in-depth pattern, not just a comment.

## User & Provider Operations

Covers `adminUserSupport.routes.ts`, `adminProviderOps.routes.ts`, `adminAccessCertification.routes.ts`, `adminPrivacyRequests.routes.ts`.

### Account Support
- **What it does:** Lets an admin search for a homeowner/provider account, view a support-safe summary, revoke all of a user's active sessions, or change their account status (ACTIVE/SUSPENDED/INACTIVE). Explicitly separate from self-service `user.routes.ts` — this surface is actor-driven, an admin acting on someone else's account.
- **User flow:** Search by email/name → open account summary → revoke sessions (forces re-login everywhere) and/or transition status with a reason.
- **Frontend:** `apps/frontend/src/app/(dashboard)/dashboard/admin/users/page.tsx`.
- **Backend:** `GET /api/admin/users` (search, `USER_VIEW`), `GET /api/admin/users/:userId` (summary, `USER_VIEW`), `POST /api/admin/users/:userId/sessions/revoke` (`USER_SESSION_REVOKE`, bumps `tokenVersion`), `POST /api/admin/users/:userId/status` (`USER_STATUS_CHANGE`) — `controllers/adminUserSupport.controller.ts`.
- **Data:** `User`, session/token-version fields, audit log.

### Provider Operations
- **What it does:** A provider-centric directory (search by business/user name/email, filter by status), a detail view (credentials, compliance alerts, booking/review context), and a governed marketplace-status transition (ACTIVE/SUSPENDED/INACTIVE). Positioned as an expansion of the older credential-centric queue in `providerCredential.routes.ts` (not in this cluster).
- **Frontend:** `apps/frontend/src/app/(dashboard)/dashboard/admin/providers/page.tsx`.
- **Backend:** `GET /api/admin/providers` (`PROVIDER_VIEW`), `GET /api/admin/providers/:providerProfileId` (`PROVIDER_VIEW`), `POST /api/admin/providers/:providerProfileId/status` (`PROVIDER_SUSPEND`) — `controllers/adminProviderOps.controller.ts`.
- **Data:** `ProviderProfile`, `ProviderCredential`, `ProviderComplianceAlert`.

### Access Certification
- **What it does:** Periodic "who has what" review of every active `AdminCapabilityGrant`. An admin (with `ADMIN_ROLE_MANAGE`) opens a campaign, which snapshots every active grant into pending per-grant decisions; a reviewer attests each as KEEP or REVOKE (a grant holder cannot self-attest; REVOKE executes immediately); the campaign is then completed once every decision is attested, or cancelled.
- **User flow:** Open campaign → list decisions → attest each (KEEP/REVOKE) → complete campaign (blocked if any decision is unattested).
- **Frontend:** `apps/frontend/src/app/(dashboard)/dashboard/admin/access-certification/page.tsx`.
- **Backend:** `adminAccessCertification.routes.ts` (all under `ADMIN_ROLE_MANAGE` — same critical gate as capability grant/revoke itself): `GET/POST /api/admin/access-certification/campaigns`, `GET .../campaigns/:campaignId`, `POST .../decisions/:decisionId/attest`, `POST .../campaigns/:campaignId/complete`, `POST .../campaigns/:campaignId/cancel` — `controllers/adminAccessCertification.controller.ts`.
- **Data:** `AccessCertificationCampaign`, `AccessCertificationDecision`, `AdminCapabilityGrant`.

### Capability Grants
- **What it does:** The grant/revoke surface itself — lists the capability catalog and persona bundles, a user's grant history (active + revoked), and lets an admin grant or revoke a capability/bundle. Self-grant is blocked in the service layer.
- **Backend:** `adminCapability.routes.ts`, entirely under `ADMIN_ROLE_MANAGE`: `GET /api/admin/capabilities/catalog`, `GET .../users/:userId`, `POST .../users/:userId/grant`, `POST .../users/:userId/revoke` — `controllers/adminCapability.controller.ts`.
- **Data:** `AdminCapabilityGrant`.

### Privacy Requests
- **What it does:** Subject-rights (GDPR/CCPA-style) request intake and lifecycle tracking — access, deletion, correction, etc. Tracking only; no actual data operation on the subject's account happens through this surface. Legal holds can block a DELETION request from completing.
- **Frontend:** `apps/frontend/src/app/(dashboard)/dashboard/admin/privacy/page.tsx`.
- **Backend:** `adminPrivacyRequests.routes.ts`, entirely under `PRIVACY_REQUEST_MANAGE`: `GET/POST /api/admin/privacy-requests`, `GET .../:requestId`, `POST .../:requestId/status`, `POST .../:requestId/legal-hold` — `controllers/adminPrivacyRequests.controller.ts`.
- **Data:** `PrivacyRequest` (email snapshot at intake — subject may be unmatched to a `User` row).

## Content & Case Management

Covers `adminCase.routes.ts`, `adminContentGovernance.routes.ts`, `adminReviewModeration.routes.ts` (capability routing only; `adminCapability.routes.ts` is covered above since it's really an access-control primitive).

### Admin Cases
- **What it does:** A general cross-domain case tracker for SAFETY, ABUSE, REVIEW_INVESTIGATION, and SUPPORT case types, with severity, assignment to an ADMIN user, a note trail, and governed status transitions (resolving requires a resolution). The code comments flag that a richer SAFETY-specific workflow (containment, evidence, notification decisions gated by a future `SAFETY_INCIDENT_MANAGE` capability) is **planned, not built** — today all case types share one lifecycle.
- **User flow:** List (defaults to the open working set, filterable by type/status/severity/entity) → open case detail → assign → add notes → transition status.
- **Frontend:** `apps/frontend/src/app/(dashboard)/dashboard/admin/cases/page.tsx`.
- **Backend:** `adminCase.routes.ts`, all under `SUPPORT_CASE_MANAGE`: `GET/POST /api/admin/cases`, `GET .../:caseId`, `POST .../:caseId/status`, `POST .../:caseId/assign`, `POST .../:caseId/notes` — `controllers/adminCase.controller.ts`. Cases can also be opened *from* other workspaces: booking disputes (`adminBookingOps` → `DISPUTE_MANAGE`) and review investigations (`adminReviewModeration` → same `RequestInvestigationBodySchema`).
- **Data:** `AdminCase`, `AdminCaseNote`.

### Content Governance (Knowledge & DIY editorial lifecycle)
- **What it does:** A three-role editorial workflow (author → reviewer → publisher) for Knowledge Hub articles and DIY project templates, each with its own capability: `CONTENT_AUTHOR` (submit for review / revive archived→draft), `CONTENT_REVIEW` (approve / return to draft), `CONTENT_PUBLISH` (publish / unpublish / archive — DIY publish for HIGH-safety templates additionally requires the publisher to be a different person than the approver). The comment in the route file notes the older generic article-upsert route (`knowledgeHubAdmin.routes.ts`, outside this cluster) can no longer change lifecycle state — this file owns transitions exclusively now.
- **Frontend:** `apps/frontend/src/app/(dashboard)/dashboard/admin/content-reviews/page.tsx` (editorial queues), `admin/diy/templates/**` (DIY template CRUD + this lifecycle).
- **Backend:** `adminContentGovernance.routes.ts`: `GET /api/admin/content/knowledge/queues`, `POST .../:articleId/{author-action,review-decision,publish-action}`, and parallel `POST /api/admin/content/diy/:templateId/{author-action,review-decision,publish-action}` — `controllers/adminContentGovernance.controller.ts`.
- **Data:** `KnowledgeArticle`, `DiyProjectTemplate` (status fields drive the queues counted in Work Queues above).

### Review Moderation
- **What it does:** A moderation queue over the `Review` model, entirely separate from the public provider-review reads (which only ever expose `APPROVED` reviews). Approve/reject/flag/restore with a required reason, plus the ability to open a `REVIEW_INVESTIGATION` case linked to a review without changing the review's own status.
- **Frontend:** `apps/frontend/src/app/(dashboard)/dashboard/admin/reviews/page.tsx`.
- **Backend:** `adminReviewModeration.routes.ts`, all under `REVIEW_MODERATE`: `GET /api/admin/reviews` (defaults to pending+flagged), `GET .../:reviewId`, `POST .../:reviewId/moderate`, `POST .../:reviewId/request-investigation` — `controllers/adminReviewModeration.controller.ts`.
- **Data:** `Review`, `AdminCase` (via investigation link).

## Analytics & Search

Covers `adminAnalytics.routes.ts`, `adminAuditExplorer.routes.ts`, `adminSearch.routes.ts` (see Console landing above), `navigationAnalytics.routes.ts`, `propertyScoreSnapshot.routes.ts`.

### Product Analytics Dashboard
- **What it does:** The platform's internal product-analytics surface: activation/engagement overview (WAH/MAH-style active-home metrics, interactions, decisions guided), daily trends, feature-adoption rates, an activation funnel, cohort retention, top-tools ranking, and a long tail of feature-specific operational-health endpoints (tool-lifecycle funnel, refinance radar metrics, service-quote decision metrics, renovation operational health, Home Operations §14 measurement, Home Digital Twin diagnostics, and an "Ask Trust" learning/calibration workflow with its own review-candidate queue).
- **User flow:** Open `/dashboard/analytics-admin` → pick a date range/module filter → read overview cards, trend charts, funnel, cohorts, top tools; separately, review/approve/promote Ask Trust regression-candidate fixtures in the embedded workspace.
- **Frontend:** `apps/frontend/src/app/(dashboard)/dashboard/analytics-admin/page.tsx`, `components/admin-analytics/AdminAnalyticsLineChart.tsx`, `AdminAnalyticsSkeleton.tsx`, `AskTrustReviewWorkspace.tsx`; data hooks in `hooks/useAdminAnalytics.ts`.
- **Backend:** `adminAnalytics.routes.ts`, entirely under `ANALYTICS_VIEW` (plus `SYSTEM_SETTINGS_MANAGE` for the one write endpoint): `GET /api/admin/analytics/{overview,trends,feature-adoption,funnel,cohorts,top-tools,tool-lifecycle,refinance-radar,service-quote-decisions,renovation-operations,home-operations,ask-trust,home-digital-twin,phase1-pilot,phase5-pilot,phase6-pilot}`, `POST .../phase6-pilot/properties/:propertyId/admission` (`SYSTEM_SETTINGS_MANAGE`), and the Ask Trust candidate workflow (`GET/POST .../ask-trust/candidates`, `.../candidates/:fixtureKey/{review,promote}`, `.../regression-corpus`, `.../calibration-artifact`) — `controllers/adminAnalytics.controller.ts`, `services/adminAnalytics/schemas.ts`.
- **Data:** derived from analytics event tables (`AnalyticsEvent`-style emitter output) plus feature-specific models per metric; `AskTrustReviewCandidate` for the review workflow.
- **Notes:** several endpoint names carry phase numbers from their originating FRDs (`phase1-pilot`, `phase5-pilot`, `phase6-pilot`) — these are shipped and live, not placeholders, just named after the phase that introduced them.

### Audit Explorer
- **What it does:** Read-only, filtered, paginated query surface over the admin audit log — trace what any admin actor did, to which entity, from which request.
- **Frontend:** `apps/frontend/src/app/(dashboard)/dashboard/admin/audit/page.tsx`.
- **Backend:** `GET /api/admin/audit` (`adminAuditExplorer.routes.ts`, capability `AUDIT_VIEW`) → `controllers/adminAuditExplorer.controller.ts`.
- **Data:** `AuditLog` (userId, action, entityType/entityId, old/new values, ip/userAgent/requestId/traceId/signatureHash, structured `metadata` JSON for admin-specific context like reason/disposition/capability used). This is the same table every `auditLog(...)` call across the admin console writes to (e.g. `PERMISSION_DENIED` on a capability check failure, `ADMIN_ACTION` on worker-job triggers).

### Navigation Analytics & Retired Score Snapshots
- **What it does:** `navigationAnalytics.routes.ts` is a homeowner-facing (not admin-gated) endpoint that records when the frontend silently redirects an old route to its canonical replacement — `POST /properties/:propertyId/navigation/route-redirects`, used to measure stale-link/bookmark traffic during route migrations. It is not part of the admin console UI itself but feeds platform-wide navigation-health telemetry.
- **Notes — `propertyScoreSnapshot.routes.ts` is retired:** `GET /properties/:propertyId/score-snapshots` now unconditionally returns **HTTP 410** with `code: 'COMPOSITE_HOME_SCORE_RETIRED'`, pointing callers at `/api/properties/:propertyId/status-board` and `/api/properties/:propertyId/property-briefs` instead. There is no live Composite Home Score trend feature today despite the route file still existing.

## Operations & Delivery

Covers `adminBookingOps.routes.ts`, `adminPaymentOps.routes.ts`, `adminHomeOperations.routes.ts`, `adminHomeActionProactiveDelivery.routes.ts`, `adminCalibrationRelease.routes.ts`, `adminPersonalization.routes.ts`, `adminSharedData.routes.ts` / `sharedData.routes.ts`.

### Booking Operations
- **What it does:** Read-only v1 (per the route file's own comment — governed mutations are "a later slice, not yet built") booking search and a merged operational timeline per booking, plus the ability to open a `DISPUTE` case linked to a booking (one open dispute case per booking, enforced in the service).
- **Frontend:** `apps/frontend/src/app/(dashboard)/dashboard/admin/bookings/page.tsx`.
- **Backend:** `GET /api/admin/bookings` (`BOOKING_VIEW`), `GET .../:bookingId` (`BOOKING_VIEW`), `POST .../:bookingId/dispute-case` (`DISPUTE_MANAGE`) — `controllers/adminBookingOps.controller.ts`.
- **Data:** `Booking`, `AdminCase`.

### Payment Operations
- **What it does:** Local-ledger payment search/detail and a two-person refund workflow — one capability to *request* a refund (`REFUND_REQUEST`), a separate one to *approve/reject* it (`REFUND_APPROVE`, and the requester cannot decide their own request). The route file is explicit that there is **no refund execution** yet — "record-and-govern only until a payment-provider integration exists."
- **Frontend:** `apps/frontend/src/app/(dashboard)/dashboard/admin/payments/page.tsx`.
- **Backend:** `adminPaymentOps.routes.ts`: `GET /api/admin/payments`, `GET .../:paymentId`, `POST .../:paymentId/refund-requests`, `GET /api/admin/refund-requests` (queue, defaults pending-approval oldest-first), `POST .../:requestId/withdraw` (requester only), `POST .../:requestId/decide` — `controllers/adminPaymentOps.controller.ts`.
- **Data:** `Payment`, `RefundRequest`.

### Home Operations Admin Tooling
- **What it does:** A single read-only diagnostic endpoint letting admins inspect one Home Operations "work item"'s full graph — sources, executions, evidence, watchers, event history — property-agnostic (an admin doesn't need property access to look at a work item).
- **Backend:** `GET /api/admin/home-operations/work-items/:workItemId` (`PROPERTY_SUPPORT_VIEW`) — `controllers/adminHomeOperations.controller.ts`. The route comment notes it reuses an existing capability (`PROPERTY_SUPPORT_VIEW`) that had no route consumer before this one.
- **Data:** Home Operations work-item models (sources/executions/evidence — property-workflow tables outside this cluster's direct ownership).

### Proactive Delivery, Calibration Releases & Personalization kill switches
Three related "decision platform" governance surfaces, each pairing a status/monitoring read with a `SYSTEM_SETTINGS_MANAGE`-gated kill switch:
- **Home Action Proactive Delivery** (`adminHomeActionProactiveDelivery.routes.ts`): `GET /api/admin/home-action-proactive-delivery/status` and `/decisions` (`ANALYTICS_VIEW`), `POST .../kill-switch/{pause,resume}` (`SYSTEM_SETTINGS_MANAGE`) — controls whether the system proactively pushes external Home Action alerts.
- **Calibration Releases** (`adminCalibrationRelease.routes.ts`): list/get/get-active-state under `RELEASE_GATE_VIEW`; propose/governance-review/activate/rollback under `SYSTEM_SETTINGS_MANAGE` — a propose→multi-party-review→activate→rollback pipeline for Ask-intelligence calibration changes. Frontend surface: `admin/release-gates/page.tsx` and `components/ops/release-gates/*`.
- **Personalization** (`adminPersonalization.routes.ts`, everything gated by `PERSONALIZATION_OPERATE`): system-wide kill switch (`GET/POST kill-switch`, `/pause`, `/resume`), per-definition pause/resume/activate, a catalog and quality-snapshot read, and a recommendation-incident intake/transition workflow. Frontend: `admin/personalization/page.tsx`, `components/ops/personalization/*` (DefinitionCard, IncidentQueueCard, ProfileQuestionsCard, QualitySnapshotCard).
- **Data:** no dedicated cluster-owned tables beyond `CalibrationGovernanceReview`, `RecommendationGovernanceReview`, `PersonalizationAuditEvent` (personalization catalog/engine state lives outside this cluster).

### Shared Data Health
- **What it does:** Operational diagnostics for the cross-feature "shared data" layer (preference profiles, assumption sets, property signals that multiple features read) — readiness, consistency, per-signal health, and a manual backfill trigger.
- **Frontend:** `apps/frontend/src/app/(dashboard)/dashboard/admin/shared-data/page.tsx`.
- **Backend:** `adminSharedData.routes.ts`, everything under `SHARED_DATA_OPERATE`: `POST /api/admin/shared-data/backfill`, `GET .../readiness`, `.../consistency`, `.../signals/health`, `.../diagnostics` — `controllers/adminSharedData.controller.ts`. The homeowner-facing counterpart (not admin-gated) is `sharedData.routes.ts`: `GET/PUT /properties/:propertyId/preference-profile`, `POST/GET .../assumption-sets`, `GET .../signals`.
- **Data:** preference-profile, assumption-set, and property-signal tables (shared-data domain, outside this cluster's model ownership).

## Background Jobs & Work Queues

### Worker Jobs console
- **What it does:** The admin-facing operational view of every BullMQ-backed background job — live queue stats, recent-run history, a manual trigger (with dry-run support and optional property scoping), effective governance-flag status (`WORKER_AUTOMATION_ENABLED`, `ENFORCE_HUMAN_POLICY_APPROVALS`), and a narrow, ID-exact smoke-test cleanup tool (preview then delete records tagged with one correlation ID — explicitly never a date/status sweep, per the route comment).
- **User flow:** Open `/dashboard/worker-jobs` → filter/search by category or health (healthy/warning/failing/idle) → inspect a job card (queue depth, failure counts, recent runs) → trigger a run manually if needed → separately, look up a smoke-test correlation ID to preview and clean up exactly the records it created.
- **Frontend:** `apps/frontend/src/app/(dashboard)/dashboard/worker-jobs/page.tsx`; `components/ops/worker-jobs/{CategorySection,JobCard,JobsTable,JobsToolbar,PageSkeleton,SmokeChecklistPanel,workerJobsUtils}.tsx`.
- **Backend:** `adminWorkerJobs.routes.ts`: `GET /api/admin/worker-jobs/governance` (`WORKER_JOB_VIEW`), `GET /api/admin/worker-jobs` (`WORKER_JOB_VIEW`), `POST .../:jobKey/trigger` (`WORKER_JOB_TRIGGER`, audit-logged as `ADMIN_ACTION`), `GET`/`DELETE /api/admin/worker-jobs/smoke/:correlationId` (`WORKER_JOB_SMOKE_CLEANUP`) — `controllers/adminWorkerJobs.controller.ts`, `services/adminWorkerJobs.service.ts`, driven by the static `JOB_REGISTRY` in `apps/backend/src/config/workerJobRegistry.ts`.
- **Notes:** the registry's actual `JobCategory` values (read from `workerJobRegistry.ts`) are `RISK_SAFETY`, `HOME_INTELLIGENCE`, `MAINTENANCE`, `NOTIFICATIONS`, `FINANCIAL_MARKET`, `NEIGHBORHOOD`, `RECALLS`, `PROPERTY_INTELLIGENCE`, and `DIY_TEMPLATES` — a finer-grained taxonomy than the "seasonal checklists / notifications / recalls / reports / cleanup" summary in the top-level `apps/CLAUDE.md`.

### Background job & poller survey (`apps/workers/`)

Reading `apps/workers/src/jobs/` (60+ files) and `apps/workers/src/runners/` directly, grouped by what they actually do:

- **Notification delivery (channel fan-out):** `sendEmailNotification.job.ts`, `sendPushNotification.job.ts`, `sendSmsNotification.job.ts`, plus feedback/household/property-brief specific senders (`sendFeedbackNotification.job.ts`, `sendHouseholdInvitation.job.ts`, `sendPropertyBriefInvitation.job.ts`, `sendPropertyBriefUpdateNotice.job.ts`) and `seasonalNotification.job.ts`, `neighborhoodChangeNotification.job.ts`, `homeBriefingDelivery.job.ts`.
- **Seasonal / maintenance checklists:** `seasonalChecklistGeneration.job.ts`, `seasonalChecklistExpiration.job.ts`.
- **Recall ingestion & matching:** `recallIngest.job.ts`, `ingestRecalls.job.ts`, `recallMatch.job.ts`.
- **Risk / safety monitoring:** `coverageLapseIncidents.job.ts`, `freezeRiskIncidents.job.ts`, `detectUnpermittedWork.job.ts`, `expireGuidanceSignals.job.ts`, `expireStaleWeatherPreparations.job.ts`, `expireStaleWorkItemCandidates.job.ts`, `severeWeatherAlerts.job.ts` (+ `.scoring.ts`), `usgsEarthquake.job.ts`, `usgsHazardIntelligenceIngest.job.ts`, `openFemaDeclarations.job.ts`, `radarSafetyNetReconciliation.job.ts`, `providerCredentialExpire.job.ts`, `providerCredentialLapse.job.ts`, `providerMissingCredentialSweep.job.ts`.
- **Financial / market data:** `ingestMortgageRates.job.ts`, `evaluateRefinanceRadar.job.ts`, `evaluateRefinanceDataRequired.job.ts`, `refinanceTransitionAlert.job.ts`, `recalculateReserveFunds.job.ts`, `reserveFundBalanceReminder.job.ts`, `reserveFundReconciliation.job.ts`, `savingsBenefitsDeadlineReminder.job.ts`, `savingsBenefitsFollowUpReminder.job.ts`, `savingsBenefitsSourceHealthAudit.job.ts`, `ingestTaxAssessmentEvents.job.ts`.
- **Neighborhood / permits:** `ingestNeighborhoodDummyEvents.job.ts`, `refreshNeighborhoodEvents.job.ts`, `nycZapPlanningIngest.job.ts`, `fetchPermitHistory.job.ts`, `permitInspectionReminder.job.ts`, `generatePermitDisclosure.job.ts`, `renovationPermitRequirementReminder.job.ts`.
- **Report / export generation:** `generateHomeReportExport.job.ts`, `generateMaterialSpecExport.job.ts`, `generateDiyAiGuide.job.ts`, `weeklyRetentionReport.job.ts`.
- **Cleanup / lifecycle:** `cleanupInventoryDrafts.job.ts`, `renovationAdvisorSessionExpiry.job.ts`, `newHomeWarrantyDeadline.job.ts`.
- **Shared-data / signal maintenance:** `sharedDataBackfill.job.ts` (the job behind the admin backfill trigger above), `sharedDataConsistencyAudit.job.ts`, `sharedSignalHealthAudit.job.ts`, `sharedSignalRefresh.job.ts`.
- **Property/home intelligence:** `propertyIntelligence.job.ts`, `propertyScoreSnapshots.job.ts` (note: the *reading* API for these snapshots is retired per above — the job may still compute data that nothing serves), `hiddenAssetRefresh.job.ts`, `habitGeneration.job.ts`, `homeOperationsDueDigest.job.ts`, `homeOperationsReconciliation.job.ts`, `ingestRadarSignals.job.ts`, `evaluateHomeActionProactiveDelivery.job.ts` (feeds the Proactive Delivery admin surface above), `processDomainEvents.job.ts`.
- **Pollers/runners** (`apps/workers/src/runners/`, long-running rather than scheduled): `domainEvents.poller.ts`, `highPriorityEmailEnqueue.poller.ts`, `homeReportExport.poller.ts`, `materialSpecExport.poller.ts` (+ `.cleanup.ts`), `reportExport.cleanup.ts`, `claimFollowUpDue.poller.ts`, `radarNotificationDelivery.poller.ts`, `propertyRecordPurge.cleanup.ts`.

This is a much larger and more finely-divided set than the four-bucket summary ("seasonal checklists, notifications, recall ingestion/matching, report generation, inventory draft cleanup" + "pollers for report exports/domain events/email queues") in the top-level `apps/CLAUDE.md` — that summary is directionally right but the actual job count and domain spread (financial/market data, neighborhood/permits, shared-data health) is considerably wider.

## Platform Notifications (email / push / SMS)

- **What it does:** A single `Notification` + `NotificationDelivery` model pair drives all channels. `services/notification.service.ts` creates the notification and per-channel delivery rows, then enqueues **immediate/important** deliveries onto BullMQ queues (`getEmailNotificationQueue()`, `getPushNotificationQueue()`, `getSmsNotificationQueue()` from `services/JobQueue.service.ts`); `IN_APP` deliveries never go to a queue (they're just read from the DB). Workers pick jobs off those queues and actually send: `apps/workers/src/jobs/sendEmailNotification.job.ts` (batches up to 10 notifications per email, builds HTML via `buildDigestHtml`/`buildWeeklyHomeBriefHtml`/`renderNotificationCard`, applies an aggregation-delivery policy filter and a refinance-alert rollout gate), plus the parallel `sendPushNotification.job.ts` and `sendSmsNotification.job.ts`.
- **User-facing surface:** `/dashboard/notifications` (in-app list, mark read/unread, outcome recording) and preference/consent management — `notification.routes.ts`: `GET/PUT /preferences`, `GET /quality`, `GET/POST /channel-consents` (+`/revoke`), `GET /`, `GET /unread-count`, `POST /read-all`, `PATCH /:id/{read,unread}`, `POST /:id/outcomes` (+ `DELETE .../outcomes/:type`).
- **"Admin/Advanced" delivery retry — not actually admin-gated:** `POST /deliveries/:deliveryId/retry` sits under a comment block literally labeled "DELIVERY MANAGEMENT (Admin / Advanced)" in `notification.routes.ts`, but the route only requires `authenticate` — no `requireRole(ADMIN)`. `NotificationController.retryDelivery` (`controllers/notification.controller.ts`) enforces ownership instead (`delivery.notification.userId !== userId` → 403), so in practice this is a **self-service** retry for the notification's own recipient, not an admin tool. Worth flagging as a naming/comment mismatch rather than a real admin capability gap.
- **Data:** `Notification`, `NotificationDelivery`, `NotificationPreference`, `NotificationChannelConsent`, `NotificationOutcome`.
- **Notes:** channel consent (`NotificationChannelConsent`) is a distinct, newer concept from preference tuning (`NotificationPreference`) — affirmative per-category/channel consent per the Ask Intelligence FRD, added alongside the rest of the preference system rather than replacing it.

## Gazette Module — retired

- **What it does now:** Almost nothing. Reading `apps/backend/src/modules/gazette/` shows the entire homeowner-facing surface (`gazette.routes.ts`) has been turned into HTTP 410 responses: `GET /gazette/current`, `GET /gazette/editions`, `GET /gazette/editions/:editionId`, and `POST /gazette/editions/:editionId/share` all return `410` with explicit retirement codes (`GAZETTE_RETIRED`, `WHOLE_EDITION_SHARING_RETIRED`) pointing callers at the replacement feature, **Home Briefing** (`/api/properties/:propertyId/home-briefings`). The public share-link read (`GET /gazette/share/:token`) also 410s (`WHOLE_EDITION_PUBLIC_ACCESS_RETIRED`). Only `POST /gazette/share/:token/revoke` still does real work (revoking a legacy share link that might still exist). On the internal/admin side (`gazetteInternal.routes.ts`, `requireRole(ADMIN)`), edition generation and regeneration are likewise 410'd (`LEGACY_GAZETTE_GENERATION_RETIRED` / `..._REGENERATION_RETIRED`); only three read-only diagnostic endpoints remain live (a prior version of this line said "two," then listed three) — `GET /internal/gazette/editions/:editionId/trace` and `.../candidates` (selection-algorithm debugging data) and `GET /internal/gazette/jobs` (historical generation-job list).
- **What it used to do (inferred from the surviving models/mappers):** Gazette generated a weekly "edition" per property with ranked "stories" (`GazetteEdition`, `GazetteStory`, `GazetteStoryCandidate`, `GazetteSelectionTrace`, `GazetteGenerationJob`, `GazetteShareLink`) — i.e. a digest/newsletter of property changes, with a candidate-scoring/selection pipeline and whole-edition public share links.
- **Frontend:** confirms the retirement — `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-gazette/page.tsx` is now just a `redirect()` to the property's `tools/home-briefing` page; `apps/frontend/src/app/gazette/share/[token]/page.tsx` renders a static "This shared Gazette edition is unavailable" notice pointing at Home Briefing's new per-item expiring share links.
- **Data:** `GazetteEdition`, `GazetteStory`, `GazetteStoryCandidate`, `GazetteSelectionTrace`, `GazetteGenerationJob`, `GazetteShareLink` — all still in `schema.prisma`, presumably kept for the surviving trace/candidate/jobs diagnostic reads and historical data, not for active writes.
- **Notes:** Do not treat any planning doc describing "Home Gazette" as a current feature — it is fully superseded by Home Briefing. The only genuinely live code paths are the internal trace/candidate/jobs diagnostics and the legacy share-link revoke.

## Related pages
- [Architecture & Data Model](../02-architecture-and-data-model.md)
- [Sale, Buyer & Life Transitions](07-sale-buyer-and-life-transitions.md)
- [← Back to Wiki Home](../README.md)
