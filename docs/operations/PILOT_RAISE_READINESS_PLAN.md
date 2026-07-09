# Pilot & Fundraise Readiness Plan

**Context:** Pre-revenue, pilot phase, no customers yet. Targeting a fundraising round in 2-3 months. This plan covers the four areas identified as highest-leverage before that raise: bug triage, analytics instrumentation, security/data hygiene, and general pilot readiness.

This document reflects the actual current state of the codebase (verified, not assumed) as of 2026-07-09.

---

## 1. Bug Triage & Prioritization

**Framework:** prioritize by (a) whether it blocks a pilot user's or investor's first-run experience, (b) whether it touches financial/trust-sensitive data, (c) effort to fix vs. effort to hide.

### P0 — fix before any pilot user or investor sees the product

| Issue | Why it's P0 | Status |
|---|---|---|
| Guidance Advisor "Homeowner profile not found" — AI strategic advice fails for at least one journey/property | This is core AI value proposition. A failure here in a live demo or early pilot session is close to worst-case. | Open |
| Inspection Check Advisor — blocked on DB drift + missing `S3_BUCKET` env var, currently can't even be manually tested | Can't verify this tool works at all right now — must resolve the env/config blocker before it's safe to expose. | ✅ The DB-drift half is fixed as a side effect of the seed-script rewrite below (`prisma db seed` now runs cleanly end-to-end again). `S3_BUCKET` still needs to be provisioned — untouched here. |
| **NEW — Post-login hang.** After a fresh signup + login, the dashboard can get stuck indefinitely on "Preparing your home command center…" (`PostLoginTransition`), with a console error `API Request Error: No token provided` on `/api/auth/me` immediately after login. Observed for 21+ seconds in one automated run. | If real and reproducible, this is worse than anything else on this list — it would block every single pilot user immediately after signup, not just one tool. | ⚠️ **Unconfirmed.** A clean, isolated repro (login via API, then immediately call `/api/auth/me` with the same cookie jar) succeeded instantly with no race — the access-token cookie was present and valid on the very next request. The environment during the original observation was unstable (backend was crash-looping from an unrelated schema change I was making concurrently, and the dev DB was being reseeded mid-test). **Needs a clean re-test in a live browser against a stable backend before triaging further** — don't treat as confirmed, but don't dismiss it either given the severity if real. |
| **NEW — Legal-page links 404 everywhere.** The cookie-consent banner (shown on every page), the signup page, and the landing-page footer all link to `/privacy`, `/terms`, `/cookies` — none of those routes existed. Clicking "Privacy Policy" from the consent banner in a demo would 404. | High-visibility, low-effort-to-fix, embarrassing in exactly the kind of moment (investor clicking around) this plan is trying to de-risk. | ✅ Fixed — see Section 4 below. |

### P1 — fix before pilot, not necessarily before an early demo

**Status as of 2026-07-08: both items already fixed and on `main`, verified in code — no open work here.**

| Issue | Why it's P1 | Status |
|---|---|---|
| Coverage Options — 6 known bugs in `CoverageOptionsClient.tsx` | Real bugs in a live financial-decision tool, but not confirmed to crash/mislead — audit and fix. | ✅ Fixed (`ac41b9b`) — verified all 6 fixes present in current code: double-negative copy, "remaining 0 gaps" clause suppression, "No Coverage exposure" → "Uninsured exposure" label, duplicate Gap Breakdown card hidden at 1 gap, neutral guidance-panel header, redundant hero card hidden at 1 gap. |
| Appliance Health CTA — "Add appliances to inventory" links to the wrong page | Confusing but not data-unsafe; quick fix. | ✅ Fixed (`ef1d464`) — CTA now links to `/edit?focus=appliances`, which auto-expands the appliances accordion and scrolls to it. |

### P2 — track, don't block on

| Issue | Notes |
|---|---|
| Coverage Waived feature | Spec is ready but this is a **new feature**, not a bug — don't let it compete with pilot-readiness work. |
| HOA Compliance Tracker fixes | Per earlier work, already fixed — needs redeploy confirmation, not new engineering. |

### Process
Don't trust this list alone — it's carried over from prior session notes and hasn't been re-verified end-to-end in this pass. Week 1 of the plan (below) should include a **fresh, full click-through of all 36 tools with realistic data**, logging every broken or confusing surface newly. Anything found gets triaged into P0/P1/P2 using the same framework. Any tool that can't be fixed in time should be **feature-flagged or hidden** rather than left exposed to pilot users or a demo — a hidden tool reads as "roadmap"; a broken visible one reads as "unfinished."

### ✅ Click-through of all 36 tools — done, status as of 2026-07-09
A full automated click-through of all 36 tool pages ran against the seeded "My Home" property. Key findings and what happened to each:

- **Root cause found for most "NaN" renders: empty demo data, not broken math.** 8 of 36 tools (break-even, cost-explainer, cost-growth, do-nothing, financing, mortgage-refinance-radar, reserve-fund, true-cost) rendered `NaN` somewhere in their output. Traced to the seeded homeowner having no mortgage/valuation data at all (`PropertyFinanceSnapshot` didn't exist, `Property.purchasePriceCents`/`lastAppraisedValue` were null) — several financial tools divide by these. **Fixed** by extending the seed script (Section 4 below) to include a realistic mortgage snapshot; re-verified live against the running API afterward — break-even, true-cost, cost-explainer, financing, do-nothing, cost-growth, and reserve-fund now all return zero `NaN` occurrences.
- **2 tools failed to load at all** (`plant-advisor`: `ERR_EMPTY_RESPONSE`; `price-finalization`: 20s navigation timeout) during the original run. Both loaded fine (200, real content) when spot-checked afterward against a stable backend — most likely caused by the dev server still compiling that route on first hit combined with the rate-limit cascade below, not an application bug. **Needs one more clean pass to confirm**, but not currently believed to be a real bug.
- **A cascade of 429s and a handful of "invalid csrf token" errors** showed up across most tool pages (`radar/analytics-events`, `csrf-token`, `notifications/unread-count`, tool-specific `/events` tracking endpoints). Root-caused: the app's CSRF middleware and general API rate limiter share the same `/api` prefix, and the frontend fetches a CSRF token lazily on first mutating request. If that first `GET /api/csrf-token` gets rate-limited, the client never gets a token to attach to the next tracking POST, which then fails CSRF with a confusing "invalid csrf token" message instead of a rate-limit message. This reproduced because the click-through script does a full `page.goto()` per tool (full reload, re-fetching csrf-token/notifications/property every time) rather than the client-side navigation a real user does — **most likely a test-methodology artifact, not a real user-facing bug**, but worth one clean re-run using in-app navigation to be sure before ruling it out entirely.
- **1-2 remaining unexplained NaN flags** (`home-gazette`, `home-habit-coach`, `service-price-radar`) — spot-checked `home-gazette` visually and it rendered a clean, no-NaN "being set up" empty state, so this may be a false-positive substring match in hidden hydration JSON rather than a visible bug. Not chased further this session — low-confidence, low-severity if real.
- **New finding, not from the original list:** the cookie-consent banner + signup page + landing footer legal links all 404'd (see P0 table above) — fixed.
- Full raw results (36/36 tools, screenshots, console/network logs) are in this session's scratchpad and were not committed anywhere durable — **re-run and save findings to this repo** (e.g. `docs/operations/`) next time rather than relying on ephemeral scratchpad output.

### ⚠️ Onboarding flow — audited, but scoped to the wrong flow (see Section 4)
The route this plan pointed at (`apps/frontend/src/app/onboarding`) turned out to be dead code with zero inbound links. The real first-property flow is different. See Section 4 for the actual findings.

---

## 2. Analytics Instrumentation

### What already exists (this is more mature than it looked from the outside)
- A real event taxonomy is already defined: `apps/frontend/src/lib/analytics/events.ts` — includes acquisition, activation, retention, "Outcome Density & Trust" (North Star), workflow funnel, and incident-lifecycle events.
- Frontend events flow through a single `track()` call site into **Faro RUM** (Grafana), gated behind a real user-consent flow (`apps/frontend/src/lib/consent`).
- Backend has its own persisted product-analytics system: a Prisma-backed `ProductAnalyticsEventType` enum, an emitter/service/repository/taxonomy layer (`apps/backend/src/services/analytics/`), covering modules like property, maintenance, risk, inventory, claims, financial, and more.
- An **admin analytics dashboard page already exists** at `apps/frontend/src/app/(dashboard)/dashboard/analytics-admin/page.tsx`.

### The actual gap: coverage, not infrastructure — status as of 2026-07-09, mostly closed
- Only **8 of 36 tool pages** call `track()` on the frontend. *(Still open — this pass was backend-only; frontend coverage sprint from item 1 below already covers this on the frontend side via Faro RUM, see item 1.)*
- ~~Only **12 of 238 backend services** emit an analytics event.~~ ✅ **Closed out this session.** Backend event emission expanded from 14 to **~80 distinct backend files** (57 controllers/route handlers newly instrumented in this pass, plus the pre-existing 17 emitter call sites + 4 direct-service callers + the 2 files below that now also emit `DECISION_GUIDED`). See item 3 for the full breakdown.
- The infrastructure and taxonomy were clearly built with real intent (event names like `outcome_win_generated`, `savings_verified`, `property_onboarded`, `return_visit` are exactly what a pitch deck needs) — they're just not being fired from most surfaces yet.

### Plan — status as of 2026-07-09
1. ✅ **Instrumentation coverage sprint.** Done — all 36 tools fire `workflow_started` on mount and, where a real action exists, `action_completed`/`workflow_completed`/`outcome_action_taken` on completion.
2. ✅ **Pilot success metrics wired**, not just decided:
   - Activation: `property_onboarded` (fires on property creation, with real `durationSeconds`) → `first_wow_moment` (fires when the onboarding reveal page's win cards render).
   - Retention: `return_visit` + `session_started`, fired once per browser session in the dashboard layout via localStorage.
   - Engagement depth: `workflow_started` per tool (from item 1) gives distinct-tool-per-user breadth.
   - Outcome trust: `outcome_win_generated` (hidden-asset-finder, on new match discovery) and `savings_verified` (Home Savings, on "mark as done") are both wired.
3. ✅ **Backend event emission — expanded from the wedge to comprehensive real-action-surface coverage.** Previously only Reserve Fund and Capital Timeline (14 of 238 `src/services/`-counted files) emitted server-side events. This session added `analyticsEmitter` `TOOL_USED`/`ACTION_COMPLETED` calls to **57 additional controllers/route handlers**, covering essentially every remaining homeowner-facing tool and CRUD action in the backend: all financial tools (break-even, cost explainer, cost volatility, coverage analysis, DIY decision, do-nothing simulator, financial efficiency, financing, home cost growth, true cost ownership, risk premium optimizer, home savings), insurance/risk/inspection/maintenance tools (insurance auditor/cost-trend/OCR, risk assessment, **Inspection Hub** — the P0 tool from Section 1, inspection readiness, maintenance + prediction, both checklist controllers, risk replay, habit coach, event radar), inventory/project/tax/community tools (inventory draft/import/OCR/room-scan/verification, permit tracker, project tracker, material spec, price finalization, property tax, HOA compliance, neighbourhood trust, recalls), and home-intelligence/AI/dashboard tools (digital will, score report/share, report export, home buyer tasks, sell/hold/rent, room plant advisor, room insights, narrative, service price radar, guidance advisor, orchestration dashboard summary, status board, booking, property profile view), plus the two entirely dark document/vault flows (`document.routes.ts` upload-analyze endpoint now emits `DOCUMENT_UPLOADED`; `vault.routes.ts` status/share-link endpoints now emit against the previously-unused `VAULT` feature key) and the Knowledge Hub article-view endpoint (now emits the previously-unused `ARTICLE_VIEWED` event type). Added ~25 new `AnalyticsModule`/`AnalyticsFeature` taxonomy keys to `apps/backend/src/services/analytics/taxonomy.ts` to cover tools that had no key at all. `npx tsc --noEmit` passes clean across the whole backend after all changes; every edited controller has exactly one clean emitter import (checked explicitly since the work was parallelized across 4 background agents plus some direct edits).
   - **Deliberately still excluded**, by design (not an oversight): admin-only controllers (`adminAnalytics`, `adminSharedData`, `adminWorkerJobs`, `knowledgeHubAdmin`, `toolOverride`), auth/account endpoints (`auth`, `mfa`, `user`, `household`, `providerCredential`), the provider-side domain (`provider.controller.ts` — this pass only covered the homeowner tool surface), `gemini.controller.ts` (raw AI chat — high-frequency, would need its own sampling/rate-aware approach to avoid drowning out real tool-usage signal, flagged as a follow-up rather than instrumented blindly), `notification.controller.ts` and `sharedData.controller.ts` (internal plumbing, no independent "tool used" semantics), and the handful of files that already had emission before this session. This is why the real denominator isn't literally "238 of 238" — most of the remaining ~150 files under `src/services/` are mappers, types, repositories, or internal helpers invoked *by* an already-instrumented controller, not independent action surfaces.
   - **`DECISION_GUIDED` now fires for the first time.** It existed in the `ProductAnalyticsEventType` enum and was already read by the admin funnel/metrics (`adminAnalytics/repository.ts`, `funnelService.ts`) but had zero write-path callers, so "Decisions Guided" was permanently stuck at 0. Now wired into `orchestration.service.ts`'s `getOrchestrationSummary()` (the dashboard's primary "next best move" recommendation — fires once per real top recommendation, not on every load) and `homeStatusBoard.service.ts`'s `listBoard()` (the status board's secondary decision surface). Both are guarded to only fire when the decision engine actually produces a non-null top recommendation.
4. ✅ **`analytics-admin` dashboard verified live on production — and it found two real bugs in the process, both now fixed:**
   - `apps/backend/src/services/adminAnalytics/repository.ts` — every one of its 9 raw SQL queries referenced snake_case columns (`property_id`, `occurred_at`, etc.), but `ProductAnalyticsEvent`/`Property` only have table-level `@@map`, no field-level `@map`, so the real Postgres columns are camelCase. Every query hit a nonexistent column, surfaced as Prisma `P2010`, failing all 6 endpoints identically with 500s.
   - `apps/frontend/src/lib/api/adminAnalytics.ts` — separately, all 6 fetch functions did `response.data.data`, double-unwrapping past what `api.get()` already unwraps once. This resolved to `undefined`, which React Query treats as an error — so even after the SQL fix returned real 200s, the UI still showed "unable to load" until this was also fixed.
   - After both fixes: dashboard renders live — Activated Homes, WAH/MAH, Activation Funnel, Engagement by Module, Feature Adoption, Top Used Tools, and Cohort Retention (real week-over-week % by signup cohort) all populate with real data.
   - ~~One genuine finding from the real numbers, not a bug: **Decisions Guided is 0**~~ — **resolved by item 3 above**; `DECISION_GUIDED` now has real write-path emitters, so this and the funnel's last two stages should populate with real traffic going forward. Not yet re-verified against live numbers post-fix (see item 5).
   - **A third real bug found from the live numbers themselves**: Feature Adoption showed rates like 1300% (13 unique homes ÷ 1 "activated" home) — mathematically impossible for a rate. Root cause: `maybeMarkPropertyActivated()` was only ever called from the Digital Twin tool (its own docstring described two other intended triggers — onboarding completion, first tool use — that were never wired up), so the "activated" denominator was stuck at 1 while real per-feature usage was already 4-13x higher. Fixed by centralizing the call inside `analyticsEmitter`'s `track`/`featureOpened`/`decisionGuided`/`toolUsed` methods (via a dynamic import to avoid a require cycle with `property.service.ts`), so any property generating a real event now counts as activated. With ~57 new emission points added this session, this denominator should now track real platform-wide usage far more closely.
5. ⚠️ **Weekly retention/activation report — code verified correct, still not run against live data.** `apps/backend/scripts/weekly-retention-report.ts` (run via `npm run report:weekly`) queries `ProductAnalyticsEvent` for: active properties/users this week, week-over-week property retention, event counts by type, and event counts by feature. Attempted to run it against the local dev stack this session: `apps/backend/.env`'s `DATABASE_URL` points at `127.0.0.1:5433`, and while that port appeared open, `pg_isready` got no response and Prisma failed to connect — the Docker daemon itself was unresponsive (`docker version` hung and had to be killed) in this environment, so the local Postgres container was never actually confirmed running. **Needs a real run** on a machine with Docker/the dev stack actually up (`make dev`) or against staging/prod, ideally after a few days of real traffic through the ~57 newly-instrumented surfaces from item 3. **Scope note the script itself prints:** it only covers server-side events; the six lifecycle events from item 2 above are frontend-only via Faro RUM → Grafana/Loki, not in this Postgres table, so retention/activation numbers from *those* still require a separate Grafana query until/unless they're also emitted server-side.

---

## 3. Security & Data Hygiene Pass

### What already exists (also more mature than typical pre-seed)
- `helmet`, CORS allowlist, CSRF protection on cookie-based mutating requests, rate limiting, JWT + refresh tokens + MFA (`JWT_MFA_SECRET`, `MFA_ENCRYPTION_KEY` already provisioned), property-level and document-level authorization middleware.
- Sentry on both frontend and backend, with cookie scrubbing already implemented.
- Centralized logging (Pino → Loki).
- CI (`.github/workflows/security.yml`) already runs on every push/PR and weekly:
  - `npm audit --audit-level=high` on backend and workers.
  - `audit-ci` on frontend, with an explicit, individually-tracked allowlist for Next.js 14's known unpatched HIGH advisories.
  - **TruffleHog** secret scanning across full git history.
  - An SSRF-guard lint rule enforced on backend `fetch()` call sites.

### Gaps — status as of 2026-07-07

1. ✅ **SAST added.** `.github/workflows/codeql.yml` — CodeQL with the `security-and-quality` query pack, on every push/PR to main plus a weekly scheduled scan.
2. ✅ **Auth/authz test suite — partially addressed, and two currently-broken tests were fixed in the process.**
   - `tests/unit/propertyAuthMiddlewareMetrics.test.js` was silently failing (`500` instead of `404`) — its Prisma mock predates the household-membership code path added to `propertyAuth.middleware.ts`, so the middleware was throwing before ever reaching the ownership check. Fixed the mock; added a new case for the actual cross-property scenario (a household member of Property A requesting Property B is still denied).
   - `tests/unit/propertyRoutesAuthGuards.test.js` failed to even load — its controller mock was missing `getPropertyResolutionCenter`, added after the test was written, so Express threw at route-registration time and **zero of its assertions were running**. Fixed the mock.
   - Added `tests/unit/jwtUtil.test.js` — the existing `authMiddleware.test.js` mocks `verifyAccessToken` away entirely, so tampered signatures were never actually exercised. The new file calls the real `jwt.util.ts` functions: valid token accepted, tampered signature rejected, wrong-secret-signed token rejected, expired token rejected.
   - **Still not done:** a CSRF-bypass test. `csrfProtection` is a direct pass-through to the third-party `csrf-csrf` library; testing it meaningfully means simulating the full double-submit-cookie flow rather than a quick unit test, and I didn't do that here — flagging as remaining work rather than a shallow one.
   - `tests/e2e/` and `tests/security/` at the repo root are still empty scaffolding — the tests above went into `apps/backend/tests/unit/`, following this repo's existing convention (there is no live e2e/security runner set up to target).
3. ⚠️ **At-rest encryption — verified, and the honest answer is no.** Postgres runs as a plain `postgres:15-alpine` container against a plain named Docker volume (`docker-compose.yml`) — no LUKS, no encrypted volume driver, no column-level encryption for financial fields. Combined with prod running on a Raspberry Pi cluster (physical disk, no managed-cloud encryption-at-rest default), this means reserve fund balances and contribution history are genuinely unencrypted at rest today. This needs an actual decision (encrypt the disk/volume, or accept the risk with eyes open for pilot scale) — not something to silently paper over.
4. ❌ **Secrets rotation policy — not written.** This is a policy/cadence decision (how often, who owns rotation, break-glass revocation procedure) that needs your input, not something to invent unilaterally.
5. ✅ **Account deletion — already existed on the backend, was missing from the homeowner-facing UI.** `DELETE /api/user/account` and `POST /api/user/account/deactivate` were already implemented and already wired into the **provider** profile page, but the **homeowner** profile page (the primary pilot user) had no Danger Zone section at all. Added the same Deactivate/Delete UI (with the same "type DELETE to confirm" pattern) to `dashboard/profile/page.tsx`, for both its mobile and desktop layouts. The underlying data-retention *policy* (what gets deleted vs. anonymized, GDPR/CCPA specifics) is still a decision for you, not implemented here.
6. ❌ **Next.js 14 upgrade timing — not decided.** Still allowlisted in `.audit-ci.json`. This is a scheduling decision I didn't make unilaterally given it's a major-version migration across a 216K-line frontend.
7. ⚠️ **Legal pages — mechanism built, real content still not written.** As of 2026-07-09: `/terms`, `/privacy`, `/cookies` now exist and return real pages instead of 404s (they previously didn't exist at all — see Section 1's new P0 finding), and signup now has an explicit "I agree to the Terms of Service and Privacy Policy" checkbox, enforced both client-side and server-side (`registerSchema` rejects registration without it), with real acceptance recorded on the user (`User.tosAcceptedAt` / `tosVersion`). **What's still not done, deliberately:** the page content itself is an honest placeholder ("this page is being finalized with counsel ahead of pilot launch") — I did not write real Privacy Policy / Terms of Service legal text, for the same reason as before: that needs actual legal review, and shipping fabricated legal copy could be worse than having none. This is still a hard blocker for real pilot users; the gate and pages are ready to receive real content the moment you/counsel have it.

---

## 4. Pilot-Readiness Checklist (beyond bugs/analytics/security)

**Status as of 2026-07-09** — worked through this list end-to-end this session; four items materially advanced, one re-scoped after a wrong assumption in the original plan, two still need your input/decision (not something to build unilaterally).

1. ✅ **Legal pages + consent gate — built.** `/terms`, `/privacy`, `/cookies` now exist (previously 404'd — see Section 1). Signup now has a real, enforced ToS-acceptance checkbox (`User.tosAcceptedAt`/`tosVersion` recorded server-side on register; `registerSchema` rejects registration without `acceptedTerms: true`). Real legal copy is still a placeholder pending your/counsel's input — see Section 3, item 7.

2. ✅ **Realistic demo/pilot data — built and verified live.** The seed script (`apps/backend/prisma/seed.ts`) had drifted badly out of sync with the schema and was failing outright (`propertyType` had moved off `HomeownerProfile` onto `Property`, and the manual per-model `deleteMany()` cleanup list was missing dozens of newer child tables, causing FK violations). Fixed by:
   - Rewriting the cleanup step as a single `TRUNCATE ... CASCADE` on the two root tables (`users`, `properties`) instead of an ever-growing manual delete list, so it stops going stale every time the schema grows.
   - Adding a `seedLivedInPropertyData()` step for the `EXISTING_OWNER` persona's property ("My Home"): 9 inventory items across 5 rooms with realistic install dates/conditions/brands, a 10-year capital timeline forecast (4 forecast items: water heater replace, washer/dryer replace, HVAC major repair, roof inspection), and a reserve fund with 12 months of real contribution history (~$2,150 balance, not $0).
   - Adding a `PropertyFinanceSnapshot` (mortgage balance/rate/term) plus `purchasePriceCents`/`lastAppraisedValue` on the property — this turned out to be the root cause of most of the "NaN" findings in the click-through audit below (financial tools were dividing by null purchase-price/mortgage data). Re-verified live: break-even, true-cost, cost-explainer, financing, do-nothing, cost-growth, and reserve-fund all render zero NaN now.
   - Also fixed the local dev `DATABASE_URL` in `apps/backend/.env`, which was pointed at a nonexistent local Postgres install (`contract_to_cozy_dev`, no credentials) rather than the docker-compose Postgres — the seed script couldn't have run at all before this.

3. ⚠️ **Onboarding flow — audited, but the plan pointed at the wrong flow.** `apps/frontend/src/app/onboarding` (the route this plan named) turned out to be **dead code with zero inbound links anywhere in the app** — not the real first-run experience. The actual first-property flow after signup is `/dashboard/properties/new`, reached via `PropertySetupBanner`, and was never audited. Findings from what *was* audited:
   - Confirmed a genuine dev-environment dead end (not necessarily a prod bug): the register response tells the user "check your email to verify," but in `NODE_ENV=development` the backend intentionally skips queuing the verification email (`auth.service.ts`) and no workers container was running in this environment to send it anyway — needs a real prod/staging-like check that the already-configured Brevo SMTP path actually delivers verification emails, since local dev can't demonstrate this either way.
   - Flagged (not confirmed — see Section 1's new P0 entry) a possible post-login hang.
   - The cookie-consent banner visually overlaps the password/confirm-password fields on the signup form on a typical viewport — minor, but a real user would need to dismiss it mid-form.
   - **Next step:** re-run this audit against `/dashboard/properties/new`, the actual flow, not `/onboarding`.

4. ✅ **Pilot feedback channel — built and verified live.** Generalized the existing seller-prep-only widget into a real app-wide channel: the `SellerPrepFeedback` Prisma model became a generic `Feedback` model (`propertyId` now optional), a new auth-required `POST /api/feedback` endpoint validates `rating` (`up`/`down`) and `page`, and on submission fire-and-forget enqueues a BullMQ job that emails `FEEDBACK_NOTIFICATION_EMAIL` (defaults to `feedback@contracttocozy.com`) via the existing Brevo/nodemailer pipeline — no new infra. `FeedbackWidget` no longer requires a `propertyId` and is now mounted globally in the dashboard layout instead of just on the seller-prep page. Also fixed the actual reason the widget was invisible: `NEXT_PUBLIC_FEATURE_FEEDBACK_WIDGET` was only set in the backend's `.env`, which the frontend never reads — it's now set in the frontend's own env too. Verified end-to-end: POST returns 201, a real row landed in `Feedback`, and the notification job was confirmed enqueued in Redis with the right payload (live SMTP send itself wasn't observed since no SMTP credentials/`workers` container are in this local stack, but the code path type-checks clean and the queue enqueue was confirmed). **Note:** renaming `SellerPrepFeedback` → `Feedback` was a drop-and-recreate via `prisma db push` (no `@@map`, so the underlying table was actually renamed) — fine here since the table was empty (feature was flagged off), but worth knowing this wasn't a purely additive migration.

5. ✅ **Backups — built from scratch and proven with a real restore test.** Confirmed nothing existed before (`infrastructure/scripts/backup/` and `database/backups/` were empty placeholders; independently flagged in `docs/functional/PRODUCTION_READINESS_AUDIT_2026.md` and `EXHAUSTIVE_SYSTEM_AUDIT.md`). Built: a k8s `CronJob` (`infrastructure/kubernetes/data/postgres/backup-cronjob.yaml`, daily 03:00 UTC, reuses the existing `postgres-credentials` secret and `nodeSelector: role: database` matching the real Postgres `StatefulSet`) + a `PersistentVolumeClaim` for dump storage + retention (14 daily dumps); standalone `pg_backup.sh`/`pg_restore.sh` scripts (atomic writes, no partial dumps, non-zero exit on failure so a failed CronJob run is actually visible via `kubectl get jobs`); and `docs/operations/BACKUP_RESTORE.md`. **Proven, not just written:** ran a real `pg_dump` against the live local dev DB, restored it into a throwaway container, and compared row counts across all 277 tables — exact match on every table. The real `contracttocozy-postgres` container/volume was never touched by the test. **Still explicitly not done** (left for you): actually deploying this to the prod Pi cluster (nobody has run `kubectl apply` on it yet — no backups are running in prod until that happens), off-cluster object storage (dumps currently share the same physical disk as the primary DB, so this doesn't protect against node/disk loss), and alerting on CronJob failure (visible via `kubectl` today, not yet wired into the existing Loki/Prometheus stack).

6. ❌ **Sentry/Loki monitoring ownership — a process question, not a code task.** This isn't something I can verify or build; it's "who is actually looking at the dashboard during the pilot window." Needs your answer, not engineering work.

7. ✅ **Full click-through of all 36 tools — done.** See Section 1's new "Click-through of all 36 tools" writeup for the detailed findings (most NaNs traced to the missing demo-data problem in item 2 above and fixed; two load failures and a rate-limit/CSRF cascade flagged for one more clean re-verification pass, believed to be test-methodology artifacts rather than real bugs).

---

## Suggested Sequencing (2-3 month window)

**Month 1**
- Full smoke test of all 36 tools + bug triage (Section 1)
- Instrumentation coverage sprint (Section 2)
- Legal pages + consent gate
- Backup/restore verification

**Month 2**
- Security gap closure: SAST, auth/authz test suite, data retention policy, secrets rotation policy
- Pilot user recruitment + onboarding dry-runs
- Demo data seeding, finish `analytics-admin` dashboard if needed

**Month 3**
- Run the actual pilot with instrumented tools
- Gather real retention/activation numbers
- Refine the pitch narrative using real data, not projections
- Final demo-path polish before the raise
