---
title: "ContractToCozy Product Framework — Audit Verification Report"
version: "1.0"
date: "July 23, 2026"
status: "Independent verification of self-reported implementation status"
verifies: "docs/product/ContractToCozy_Product_Framework_Application_Audit_and_Implementation_Plan.md"
method: "Seven independent code-verification passes, one per phase (0-6), each cross-checking claimed status against actual routes, schema, service logic, worker registration, and test execution — not against the audit doc's own prose."
---

# ContractToCozy Product Framework — Audit Verification Report

## Purpose

`ContractToCozy_Product_Framework_Application_Audit_and_Implementation_Plan.md` and its per-phase companions (`docs/product/phase0/README.md` through `phase6/README.md`) assert that Phases 0 through 6 are code-complete. Those are self-reported statuses. This report independently verifies each claim against the actual codebase — reading the real files, running real tests where possible, and checking whether claimed backend logic is actually reachable from the frontend rather than sitting unused.

**Overall verdict:** The self-reported status holds up better than typical self-grading. Most backend/data-layer claims (contracts, adapters, transactions, worker jobs, tests) are real and wired, not stubbed. The gaps that exist are concentrated exactly where a large refactor is most likely to cut corners under time pressure: user-facing navigation consolidation (Phase 2) and notification/cadence polish (Phase 4). One phase (5) overstates its test coverage. Several documentation-hygiene issues exist independent of the code itself.

**Implementation follow-up — July 24, 2026:** The two findings selected for remediation are now closed. Global Protect, Save, Documents, and Maintenance pages are compatibility redirects to property-scoped Home Record destinations; Protect and Save resolve into the existing property-hub tabs; Documents and Maintenance retain their detailed workflows under property-scoped routes; and the legacy hubs no longer appear as Cmd+K shortcuts. The route audit now fails when a page classified `REDIRECT_DUPLICATE` does not implement a redirect. Weekly Home Brief notifications now persist/derive canonical attention priority and render ordered Soon, Plan, and Consider sections with weekly-specific copy. The original findings below are retained as the audit record.

---

## Phase-by-phase findings

### Phase 0 — Contracts, evidence, baseline governance

**Verdict: Solid. No material gaps.**

| Claim | Status | Evidence |
| --- | --- | --- |
| Canonical `HomeAction` Zod contract | CONFIRMED | `apps/backend/src/productFramework/homeAction.contract.ts:111-215`. Minor structural drift from the audit doc's sketch: `safetyTier`/`commercialDisclosure` live under a nested `governance` object rather than flat top-level fields — functionally equivalent, not a false claim. |
| 8 domain adapters (GUIDANCE, MAINTENANCE, INCIDENT, RECALL, COVERAGE, PERSONALIZATION, PROJECT, SYSTEM) | CONFIRMED, genuinely invoked | `homeActionSourceAdapters.ts` + `homeActionSourcePromotion.service.ts:262,377,474,538,572,688,756` build all 7 non-SYSTEM kinds from real domain data; consumed by `homeActions.service.ts`, `orchestration.service.ts:328-420`, `entryContext.service.ts:484,605`. Not orphaned. |
| Route-disposition inventory, CI-enforced | CONFIRMED | `apps/frontend/scripts/product-framework/check-route-disposition.mjs`. Live run: **216 routes classified, PASSED** (README claims 210 — stale count). Wired into `frontend-quality-gates.yml` → `npm run qa:gates`, a real blocking CI gate. |
| Safety-tier policy in code | CONFIRMED | `recommendationGovernance.contract.ts:3-8,44-` — 4 tiers with Zod `superRefine` enforcement of required fields per tier, not just prose. |
| Commercial-disclosure schema | CONFIRMED | `recommendationGovernance.contract.ts:32-41`; `homeAction.contract.ts:188-197` requires disclosure whenever a commercial CTA (SELECT_PROVIDER/PURCHASE/FINANCE) is present. |
| 7 golden test homes, runnable | CONFIRMED | `apps/backend/tests/fixtures/productFramework/goldenTestHomes.js` — exact 7 scenarios. `node --test tests/unit/productFrameworkContracts.test.js`: **17/17 pass**. |
| CI enforcement of "no feature launches without job/outcome/tier/etc." | PARTIALLY CONFIRMED | The narrow technical claims (contract tests, route-disposition check) are real, blocking CI checks. But the broader "every new feature must declare job/outcome/action/evidence/tier/learning/metric" is only an **unchecked PR-template checklist** (`.github/PULL_REQUEST_TEMPLATE.md`) — a human process gate, not something CI actually blocks on. This matches what the phase0 README itself says, but is weaker than the main audit doc's phrasing implies if read as "code enforces this." |
| `ENFORCE_HUMAN_POLICY_APPROVALS` flag | CONFIRMED | `apps/backend/src/config/appConfig.ts:3,22-24`, fail-closed to `"true"` exact-match. Actually branched on in `newHomeSetup.service.ts:192-200`, `personalizationCatalogAdmin.service.ts:56`, `adminWorkerJobs.service.ts`, `phase6PilotService.ts`. K8s configmap currently sets it `"false"`, consistent with "internal beta." |

**Minor findings:** Route count in docs is already stale vs. the live script (210 vs. 216). No script re-validates that `approval-register.md` stays in sync with real human approvals — it's manually edited prose.

---

### Phase 1 — Trigger-first activation for existing owners

**Verdict: Substantially real. One claim reads as more complete than it is.**

| Claim | Status | Evidence |
| --- | --- | --- |
| "What brought you here?" trigger UI before address entry | CONFIRMED | `apps/frontend/src/app/onboarding/address/page.tsx:202` — literal fieldset legend, 8 real trigger-type buttons (lines 18-27) plus situation selector. |
| Data fields on `PropertyOnboarding` | CONFIRMED | `apps/backend/prisma/schema.prisma:4925-4973` — `entryPath`, `ownershipState`, `propertyOrigin`, `activeTriggerType`, `triggerEntityType`/`Id`, `firstValueType`/`At`, `firstActionResolvedAt` all present. Minor naming drift: doc says `activeTriggerText`, schema has `activeTriggerLabel` + `activeTriggerDetail` (doc explicitly permits this variance). |
| **"Complete removal of permanent homeowner segmentation"** | **CONFIRMED for storage, MISLEADING as a full claim** | `grep -rn "HomeownerSegment"` across backend and frontend: **zero hits**. Enum and `HomeownerProfile.segment` field are genuinely gone. **However**, the underlying `'HOME_BUYER' \| 'EXISTING_OWNER'` binary branching logic is **not** gone — it persists extensively (`orchestration.service.ts:1526`, `orchestrationIntegration.service.ts`, `planningContext/context.ts`, `analytics/taxonomy.ts`, `homeBuyerTask.controller.ts`), just derived per-request from `entryContextPolicy.ts` instead of read from a stored field. That's a legitimate architectural improvement, but "complete removal of... segmentation" is easy to misread as "the binary concept is gone," which it isn't — only its *storage* is. One stale test snapshot (`priority-route-visual-contract.test.ts.snap:68-69`) still references the old field name; confirmed dead cruft, not live UI. |
| Manual/low-context fallback | CONFIRMED | `address/page.tsx` has real `manualMode` state and a "Continue without public records" CTA routing into the same `prepareConfirmation`/`captureEntryContext` path as lookup — not a stub. |
| First-value API (`GET /properties/:propertyId/onboarding/first-value`) | CONFIRMED, real logic | `propertyOnboarding.routes.ts:129` → `entryContext.service.ts:445`. Computes confidence from actual missing-fact counts, builds real `HomeAction`, routes to genuinely existing pages (verified `guidance-overview`, `claims`, `seller-prep`, `fix`, `protect` all exist). Not mock data. |
| Analytics lineage (trigger → first-value → resolution) | CONFIRMED | Shared `triggerId`/`actionId`/`entryId` threaded through `emitNorthStarLineageEvent` calls (service:575-590, 729-740). |
| Tests | CONFIRMED, passing | `node --test tests/unit/phase1TriggerActivation.test.js`: **10/10 pass**, and they assert on real source/schema/routes, not trivial mocks. |

**Unverified:** DB apply state against a live instance — Postgres was unreachable in this environment. Consistent with the doc's own "owner-applied schema verification... remain operational activities" disclaimer.

---

### Phase 2 — Unified Home and action system

**Verdict: Backend is real and substantive. The navigation-consolidation claim — arguably the most user-visible promise of the whole framework — is meaningfully overstated.**

| Claim | Status | Evidence |
| --- | --- | --- |
| `GET /api/properties/:propertyId/home-actions` and unified `GET .../home` | CONFIRMED | `apps/backend/src/routes/homeActions.routes.ts:23-50`, mounted in `src/index.ts:514`. |
| 7 lifecycle commands (COMPLETE, DEFER, SNOOZE, DISMISS, ALREADY_DONE, NOT_RELEVANT, CORRECT_FACT) | CONFIRMED | `POST .../home-actions/:actionId/commands` (routes.ts:53-73), validated by `HomeActionCommandSchema` (`homeActions.service.ts:32-38`), real disposition logic (524-642) with safety-tier restrictions. |
| Substantive cross-source ranking/dedup | CONFIRMED | `scoreHomeAction()` (185-211) — weighted consequence/urgency/confidence/householdRelevance minus a missing-context penalty. `rankAndDeduplicateHomeActions()` (213-242) groups by canonical key, deterministic tiebreak, returns merge diagnostics. Not a passthrough. |
| Desktop and mobile consume one Home data contract | CONFIRMED | `dashboard/page.tsx:1343` unconditionally renders `<UnifiedHomeSurface propertyId=.../>`, backed by one `api.getUnifiedHome(propertyId)` call. Legacy `MobileDashboardHome`/`MobileHomeBuyerDashboard` are imported but never rendered — dead code, consistent with unification. **Caveat:** `dashboard/page.tsx` still contains roughly 700 lines of unused legacy logic (health-score CTAs, `primaryActionHero`, etc.) computed but never used — sloppy, not a correctness bug. |
| Personalization promoted into the same governed Home feed | CONFIRMED, live path | `getHomeActionFeed()` (244-260) calls `materializeRecommendationsForProperty(...)`, feeds results through `getPromotedHomeActions(...)` into the same `rankAndDeduplicateHomeActions()` used by every other source. Not dead code. |
| **≤5 primary destinations; old parallel systems retired** | **PARTIALLY CONFIRMED, meaningfully overstated** | `jobsNavigation.ts` correctly defines 5 destinations, and `/dashboard/vault`, `/dashboard/fix`, `/dashboard/inventory`, `/dashboard/home-savings` genuinely redirect via `JobHubRedirectPage`/`PropertyScopedToolRedirectPage`. **But:** `/dashboard/protect` and `/dashboard/save` are **full live standalone pages** (`RiskProtectionClient`, `FinancialEfficiencyClient`), not redirects, and are surfaced as first-class "Quick Shortcuts" in the global Cmd+K palette (`DashboardCommandPalette.tsx:178-181`) alongside `/dashboard/vault` and `/dashboard/home-lab` — presented as navigation peers, not contextual tools. `/dashboard/documents` (915 lines) and `/dashboard/maintenance` (652 lines) are also full independent pages despite the project's own route-disposition script labeling them `REDIRECT_DUPLICATE`. Both are actively, heavily linked from `layout.tsx`, provider pages, the checklist redirect target, `mobileToolCatalog.ts`, and `lib/cta/contracts.ts` — live parallel destinations, not orphaned links. |
| Route-contract tests validating CTA/journey destinations | PARTIALLY CONFIRMED, overstated | `check-route-disposition.mjs` genuinely checks that CTA routes, guidance-template routes, and notification `actionUrl` strings resolve to an *existing page file*. It does **not** verify runtime redirect behavior, dynamically-built hrefs (e.g., the command palette, `dashboard/page.tsx`'s own dead hrefs), or that a route labeled "merged" actually redirects — which is exactly how Documents and Maintenance pass the check while contradicting their labeled disposition. Backend `npm run test:phase2` does run 9 real unit-test files covering the action feed, promotion, and lifecycle. |

**Bottom line for Phase 2:** items 1-3 and personalization promotion (the backend "one action system") are real and substantive. The navigation-consolidation and old-route-retirement claims (the user-visible "one calm operating system" promise) are overstated — Protect, Save, Documents, and Maintenance remain live, separately reachable, actively-linked pages.

---

### Phase 3 — Complete Major Repair / System Replacement

**Verdict: Solid. This is the flagship "close the loop" journey and it holds up under direct scrutiny.**

| Claim | Status | Evidence |
| --- | --- | --- |
| Stages 9–14 added to `asset_lifecycle_resolution`, template version bumped | CONFIRMED | `guidanceTemplateRegistry.ts:142-218`, version `3.0.0` (line 18). All 6 new steps present with real `routePath`s; original 8 steps preserved. Reachable via real pages: `properties/[id]/projects/new/page.tsx` and `projects/[projectId]/page.tsx` (313 lines), using the same generic routing mechanism as steps 1-8. |
| Verified-closure transaction touches every claimed entity | CONFIRMED | `projectTracker.service.ts:1271-1648`, `confirmCompletion`, `Serializable` isolation. Actually writes HomeEvent (1344), proof/documents (1382-1434), Expense (1443), Warranty (1465), InventoryItem (1485), MaterialSpec (1506), InspectionFinding (1608), Review (1573), future-care `PropertyMaintenanceTask` (1542-1560). Idempotent (line 1294 short-circuits replay). |
| Minor work closes without a full project object | CONFIRMED | `completeMinorWork` (1089-1242) operates only on `GuidanceJourney` + `InventoryItem`, never creates a `ProjectRecord`. |
| Real commercial disclosure / non-commercial alternatives / credential checks | CONFIRMED, not a static field | `getProviderExecutionReadiness` (219-276) runs real DB queries against `ProviderCategoryEligibility`/`ProviderCredentialRequirement`/`ProviderCredential`. Zod validators (`projectTracker.validators.ts:104-119,368-374`) hard-require `providerRankingRationale` + non-empty `nonCommercialAlternatives`. |
| Reviews linked to project/journey/scope/schedule/cost/outcome | CONFIRMED | `schema.prisma:5234-5282` `Review` model carries all those fields; populated in `confirmCompletion` (1573-1604), surfaced in `provider.service.ts:556-560` and the provider profile page. |
| Follow-up remediation on failed outcomes | CONFIRMED | `PropertyMaintenanceTask.service.ts:586-635` — upserts an `URGENT`/`HIGH` remediation task when follow-up health ≠ `CONFIRMED_HEALTHY`. |
| Analytics (elapsed/blocked time, price variance, override, provider result, write-back, follow-up health) | CONFIRMED, broad | Emitted from controllers (`projectTracker.controller.ts:~431-450`) and `PropertyMaintenanceTask.service.ts:620-634` — note analytics live in controllers, not the service file itself, worth knowing if searching only one file. |
| Gated DB acceptance harness | CONFIRMED, non-trivial | `tests/integration/phase3VerifiedClosure.db.test.js` (525 lines), gated on `PHASE3_ACCEPTANCE_DATABASE_URL` (never falls back to dev DB). Runs the full 14-step journey, asserts idempotent replay produces zero duplicate write-backs, verifies an `UNSAFE` exception path stays unverified, exercises follow-up→remediation. Real integrity test, not a smoke test. |

No stubs, no dead metadata, no contradicted claims found for this phase.

---

### Phase 4 — Trust, cadence, grounded Ask, recurring care

**Verdict: Mostly solid, with two concrete, real gaps and one previously-open cross-cutting issue now confirmed fixed.**

| Claim | Status | Evidence |
| --- | --- | --- |
| `safetyTier` on definitions, guidance steps, and generated actions | CONFIRMED, with nuance | `RecommendationDefinition.safetyTier` (schema:13935), `GuidanceJourneyStep.safetyTier` (:4648), `RecommendationIncident.safetyTier` (:14311) are real columns. `PersonalizedRecommendation` (the "generated" instance) has **no** `safetyTier` column — tier is carried through the runtime `RecommendationGovernanceSchema` populated by adapters, not a DB field. Technically accurate but blurs a schema/contract distinction. |
| Tier-differentiated required-field validation | CONFIRMED | `recommendationGovernance.contract.ts:87-127` — real `superRefine` logic, invoked from `recommendationLaunchGate.ts:57`, `guidanceGovernance.catalog.ts:54/99`, `homeActionSourcePromotion.service.ts:43`. |
| Automatic high-risk pausing, actually enforced | CONFIRMED | `recommendationIncident.service.ts:35-58` sets `pausedAt` on critical/safety incidents; `evaluationRunRepository.ts:41-44` genuinely excludes paused definitions from active-rule loading. Not a flag nobody reads. |
| Canonical notification preference service | PARTIALLY CONFIRMED | All live `Notification` writes route through `NotificationService.create` → `resolveNotificationPolicy`; legacy `HomeownerProfile.notificationPreferences` JSON is folded in as a merge input, not bypassed; `PropertyClimateSetting.notificationEnabled` is a deliberate, documented additional opt-out that still routes through the canonical service. **But:** `HouseholdNotificationService` still directly queries the old `HouseholdMember.notifyOn*` booleans, bypassing the canonical service entirely — confirmed via repo-wide grep that this class is **never called anywhere** in backend or workers. It's dead/orphaned code, not an active bug, but it means the "fully migrated" framing is inaccurate — the old fragmented reader wasn't removed, just stranded. |
| `propertyId` threading fixed in main chat UI (a gap flagged earlier in the same audit doc) | CONFIRMED FIXED | `(dashboard)/layout.tsx:793` mounts `<AIChat/>` globally; `AIChat.tsx:56` pulls `selectedPropertyId` from `usePropertyContext()`. A separate `AIChatWindow.tsx` (zero `propertyId` references) is unused dead code, not the live chat UI. |
| Schema-validated Ask action proposals with confirmation gating | CONFIRMED | `groundedAsk.service.ts:60-199` has real handlers for all 7 proposal kinds, gated behind explicit confirmation in `AIChat.tsx`. |
| `ENFORCE_HUMAN_POLICY_APPROVALS` not propagated to workers (previously open gap, flagged in the Worker Module Audit doc) | **CONFIRMED FIXED** | `infrastructure/kubernetes/apps/workers/deployment.yaml:28-32` and `apps/backend/deployment.yaml:58-62` both source the same configmap key; `docker-compose.yml:72,117` set it for both services. |
| **Weekly Home Brief bundles Soon/Plan/Consider items** | **OVERSTATED — real gap** | The digest job exists and fires on the right cadence (`worker.ts:199` → `runWeeklyHomeBriefDigest`, `sendEmailNotification.job.ts:225`), correctly filtered by `WEEKLY_BRIEF` cadence policy. But `buildDigestHtml.ts` produces a **flat, recency-ordered list** with no priority-band grouping or headers — it does not implement the "bundle Soon/Plan/Consider" requirement at all. The email footer even hardcodes "daily notification digest" text on the weekly path. |

---

### Phase 5 — Existing-home buyer acquisition journey

**Verdict: Functionally real. Test-coverage claim is overstated. One documentation inconsistency confirmed.**

| Claim | Status | Evidence |
| --- | --- | --- |
| `buyerAcquisition.contract.ts` matches described shape | CONFIRMED | 97 lines — `BUYER_PLAN_PHASES`, `BUYER_PLAN_PRIORITIES` (NOW/SOON/PLAN/CONSIDER), lineage fields, `BUYER_FINDING_DISPOSITIONS` all present. |
| Property-scoped REST endpoints | CONFIRMED | `homeBuyerTask.routes.ts` — checklist, tasks, stats, import-readiness, evidence-review, acceptance-status, lifecycle, document verification, finding disposition, handoff. Mounted at `/api/home-buyer-tasks` (`index.ts:517`). |
| Eligibility from onboarding context, not `UserSegment` | CONFIRMED | `HomeBuyerTask.service.ts:57-70` gates on `entryPath`/`ownershipState`. Zero references to `UserSegment`/`HomeownerSegment` anywhere in the buyer-acquisition code paths. |
| 4-way finding disposition + branching into `asset_lifecycle_resolution` | CONFIRMED | `buyerAcquisition.service.ts:175-337`. SAFETY/MAJOR findings fire `guidanceJourneyService.ingestSignal` (252-280), deterministically routed by `guidanceTemplateRegistry.ts:19`. Idempotent via `checklistId_actionKey` uniqueness. |
| Idempotent day-91/established-owner handoff | CONFIRMED | `ensureRecurringHandoff` (`buyerAcquisition.service.ts:340-405`), idempotency via `handoffCompletedAt`, wired directly into the standard feed (`homeActions.service.ts:247`) rather than a standalone cron. |
| `/api/admin/analytics/phase5-pilot` | CONFIRMED | `adminAnalytics.routes.ts:166-169`, mounted under `/api`. |
| **Contract/integration/acceptance tests** | **PARTIALLY CONFIRMED — overstated** | Test files exist (`phase5BuyerAcquisitionFoundation.test.js`, `phase5BuyerAcquisition.acceptance.test.js`) and do exercise the real Zod schemas plus a real no-migration-file assertion. But most of the substantive claims — including "idempotent task and canonical repair lineage" and "day-91 handoff is idempotent" — are asserted via `assert.match(sourceFileText, /regex/)` against raw `.ts` source text, **not** actual calls into `BuyerAcquisitionService`/`HomeBuyerTaskService`. This is weaker than the repo's own convention elsewhere (e.g. `adminBookingOps.integration.test.js`, which really invokes the service against a mocked Prisma harness). The underlying code is real; the tests never execute it at runtime. |
| Gap register (GAP-12) / epic backlog (PF-024, PF-025) reflect Phase 5 completion | CONFIRMED STALE | Both still read as open, unresolved gaps in §4/§7 of the main audit doc — but this is systemic (true for every phase, not Phase-5-specific). |
| **Doc-consistency:** Phase 5's section in the main audit doc lacks an "Implementation status:" line | CONFIRMED | Unlike Phases 0, 1, 2, 3, 4, 6 (each has one), Phase 5's section (lines ~823-861 of the main doc) has no such line, even though `phase5/README.md` separately claims completion. |

---

### Phase 6 — Specialized new-home path and controlled expansion

**Verdict: Solid. No gaps found.**

| Claim | Status | Evidence |
| --- | --- | --- |
| Automated qualification + auditable operator cohort admission | CONFIRMED | `newHomeSetup.service.ts:57-65` (`qualify()`), `phase6PilotService.ts:11-30` (`decidePhase6PilotAdmission`) — requires reviewer identity, rejects admitting non-qualified properties. `getOrCreatePlan()` (189-202) enforces `ENFORCE_HUMAN_POLICY_APPROVALS` as a hard gate. |
| Punch-list collaboration with verified closure | CONFIRMED | `createPunchListItem`/`addBuilderResponse` (307-365) — dispute flow (`REJECTED→DISPUTED`), `RESOLVED+verifyClosure→CLOSED` completes the linked task with evidence metadata. |
| Warranty deadline worker job, actually registered | CONFIRMED | `newHomeWarrantyDeadline.service.ts` expires stale rights, promotes due deadlines to real `propertyMaintenanceTask` rows, idempotent notification (`notifiedAt` set only after send). Registered in `workerJobRegistry.ts:231-247` (cron `30 8 * * *`), wired in `worker.ts:68,200` — not orphaned. |
| Inventory registration writes to real inventory model | CONFIRMED | `upsertRegistration()` (432-444) requires an existing `inventoryItem`, writes manufacturer/model/serial/verification directly onto `prisma.inventoryItem`. |
| Commissioning evidence / inspection-prep bundles | CONFIRMED, not stubbed | `newHomeEvidenceRecord` has classification/source/verification lineage. `syncInspectionBundles` (239-250) generates idempotent DAY_30/DAY_90/ONE_YEAR bundles with due-date anchoring. |
| First-year handoff writes back into Living Home Record | CONFIRMED | `ensureRecurringHandoff()` (472-489) upserts into `propertyMaintenanceTask`, creates an idempotent `homeEvent` (MILESTONE/NEW_HOME_FIRST_YEAR_HANDOFF). |
| All 6 expansion-gate measures, honest gating | CONFIRMED | `getPhase6PilotMetrics()` (`phase6PilotService.ts:38-118`) computes all six from real data; status logic genuinely returns `INSUFFICIENT_EVIDENCE` when sample floors aren't met and `BLOCKED` when thresholds fail — it cannot manufacture `READY`, exactly as claimed. |
| Opt-in DB acceptance harness | CONFIRMED, non-trivial | `tests/integration/phase6NewHomeControlledPilot.db.test.js` (107 lines), gated on `PHASE6_ACCEPTANCE_DATABASE_URL`, checks owner-applied schema columns and exercises the full qualification→admission→plan→closure→warranty→notification→bundle flow. |

Not independently located (but doesn't affect the above): a specific "buyer-plan and new-home-plan routes classified under consolidated Projects route policy" claim — likely exists but wasn't found in a targeted search.

---

## Consolidated gap list, prioritized

1. **RESOLVED July 24, 2026 — Phase 2 navigation consolidation.** The original finding was valid. Global Protect, Save, Documents, and Maintenance now redirect to property-scoped canonical destinations, the Cmd+K peer shortcuts are removed, and route CI validates redirect implementation.
2. **RESOLVED July 24, 2026 — Phase 4 Weekly Home Brief priority bundling.** The original finding was valid. Weekly output now groups Soon, Plan, and Consider items and uses weekly-specific footer copy.
3. **Phase 5 — Acceptance tests don't execute the code they claim to verify.** Core lineage/idempotency assertions are regex matches against source text, not runtime calls into the service. The feature works; the test suite doesn't prove it the way "acceptance test" implies.
4. **Phase 1 — Segmentation logic isn't actually gone, just its storage.** `HOME_BUYER`/`EXISTING_OWNER` string-literal branching persists throughout the codebase, now derived per-request rather than stored. Not wrong, but "complete removal of... segmentation" overstates what changed.
5. **Phase 4 — `HouseholdNotificationService` is dead code that still bypasses the canonical notification preference service.** Harmless because it's never called, but it means the old fragmented reader was stranded, not removed as claimed.
6. **Phase 0 — The "no feature without job/outcome/tier" gate is a human PR checklist, not a CI-enforced block.** Narrower technical claims in the same bullet are genuinely CI-enforced; this broader one isn't.
7. **Systemic documentation staleness:** the main audit doc's gap register (§4) and epic backlog (§7) were never updated to reflect any phase's completion — every GAP-xx/PF-xxx row still reads as open regardless of what the corresponding phase README claims. Phase 5's section is also missing the "Implementation status:" line every other phase has. Route counts (210 vs. live 216) are stale.
8. **Unverifiable in this pass:** whether the target Prisma schema has actually been applied to a live database — Postgres was unreachable locally during this review. Every phase's own README already flags DB application as an owner-side operational step, so this is a known open item, not a new one.

## What was *not* found to be a gap

No stub functions, orphaned adapters, hardcoded mock data standing in for "complete" features, or fabricated test results were found anywhere across all 7 phases. Where the doc says something is wired end-to-end (Phase 0 contracts, Phase 1 onboarding, Phase 2 action feed/ranking/promotion, Phase 3's entire flagship journey, Phase 4's trust-tier/incident/Ask pipeline, Phase 5's buyer-plan lifecycle, Phase 6's entire scope), it is. The gaps above are specific and bounded, not evidence of broad overstatement.

## Recommended next actions

1. **Completed July 24, 2026:** Protect/Save/Documents/Maintenance were consolidated behind property-scoped destinations and removed from Cmd+K peer treatment.
2. **Completed July 24, 2026:** Weekly Home Brief now groups by canonical priority band.
3. Rewrite Phase 5's acceptance tests to call the real service functions rather than pattern-matching source text.
4. Remove the dead `HouseholdNotificationService`, or wire it into the canonical preference service if it's still needed.
5. Add an "Implementation status" line to Phase 5's section in the main audit doc, and do a pass updating §4/§7 gap-register rows to reflect actual phase completion so the document stops contradicting itself.
