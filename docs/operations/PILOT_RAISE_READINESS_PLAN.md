# Pilot & Fundraise Readiness Plan

**Context:** Pre-revenue, pilot phase, no customers yet. Targeting a fundraising round in 2-3 months. This plan covers the four areas identified as highest-leverage before that raise: bug triage, analytics instrumentation, security/data hygiene, and general pilot readiness.

This document reflects the actual current state of the codebase (verified, not assumed) as of 2026-07-07.

---

## 1. Bug Triage & Prioritization

**Framework:** prioritize by (a) whether it blocks a pilot user's or investor's first-run experience, (b) whether it touches financial/trust-sensitive data, (c) effort to fix vs. effort to hide.

### P0 — fix before any pilot user or investor sees the product

| Issue | Why it's P0 |
|---|---|
| Guidance Advisor "Homeowner profile not found" — AI strategic advice fails for at least one journey/property | This is core AI value proposition. A failure here in a live demo or early pilot session is close to worst-case. |
| Inspection Check Advisor — blocked on DB drift + missing `S3_BUCKET` env var, currently can't even be manually tested | Can't verify this tool works at all right now — must resolve the env/config blocker before it's safe to expose. |

### P1 — fix before pilot, not necessarily before an early demo

| Issue | Why it's P1 |
|---|---|
| Coverage Options — 6 known bugs in `CoverageOptionsClient.tsx` | Real bugs in a live financial-decision tool, but not confirmed to crash/mislead — audit and fix. |
| Appliance Health CTA — "Add appliances to inventory" links to the wrong page | Confusing but not data-unsafe; quick fix. |

### P2 — track, don't block on

| Issue | Notes |
|---|---|
| Coverage Waived feature | Spec is ready but this is a **new feature**, not a bug — don't let it compete with pilot-readiness work. |
| HOA Compliance Tracker fixes | Per earlier work, already fixed — needs redeploy confirmation, not new engineering. |

### Process
Don't trust this list alone — it's carried over from prior session notes and hasn't been re-verified end-to-end in this pass. Week 1 of the plan (below) should include a **fresh, full click-through of all 36 tools with realistic data**, logging every broken or confusing surface newly. Anything found gets triaged into P0/P1/P2 using the same framework. Any tool that can't be fixed in time should be **feature-flagged or hidden** rather than left exposed to pilot users or a demo — a hidden tool reads as "roadmap"; a broken visible one reads as "unfinished."

---

## 2. Analytics Instrumentation

### What already exists (this is more mature than it looked from the outside)
- A real event taxonomy is already defined: `apps/frontend/src/lib/analytics/events.ts` — includes acquisition, activation, retention, "Outcome Density & Trust" (North Star), workflow funnel, and incident-lifecycle events.
- Frontend events flow through a single `track()` call site into **Faro RUM** (Grafana), gated behind a real user-consent flow (`apps/frontend/src/lib/consent`).
- Backend has its own persisted product-analytics system: a Prisma-backed `ProductAnalyticsEventType` enum, an emitter/service/repository/taxonomy layer (`apps/backend/src/services/analytics/`), covering modules like property, maintenance, risk, inventory, claims, financial, and more.
- An **admin analytics dashboard page already exists** at `apps/frontend/src/app/(dashboard)/dashboard/analytics-admin/page.tsx`.

### The actual gap: coverage, not infrastructure
- Only **8 of 36 tool pages** call `track()` on the frontend.
- Only **12 of 238 backend services** emit an analytics event.
- The infrastructure and taxonomy were clearly built with real intent (event names like `outcome_win_generated`, `savings_verified`, `property_onboarded`, `return_visit` are exactly what a pitch deck needs) — they're just not being fired from most surfaces yet.

### Plan — status as of 2026-07-08
1. ✅ **Instrumentation coverage sprint.** Done — all 36 tools fire `workflow_started` on mount and, where a real action exists, `action_completed`/`workflow_completed`/`outcome_action_taken` on completion.
2. ✅ **Pilot success metrics wired**, not just decided:
   - Activation: `property_onboarded` (fires on property creation, with real `durationSeconds`) → `first_wow_moment` (fires when the onboarding reveal page's win cards render).
   - Retention: `return_visit` + `session_started`, fired once per browser session in the dashboard layout via localStorage.
   - Engagement depth: `workflow_started` per tool (from item 1) gives distinct-tool-per-user breadth.
   - Outcome trust: `outcome_win_generated` (hidden-asset-finder, on new match discovery) and `savings_verified` (Home Savings, on "mark as done") are both wired.
3. ✅ **Backend event emission — started on the wedge, not blanket coverage.** Reserve Fund and Capital Timeline (the two tools that got the most iteration this session, and the closest thing to a de facto wedge) now emit `TOOL_USED`/`ACTION_COMPLETED` server-side via `analyticsEmitter` — up from 12 to 14 of 238 backend services instrumented. Added a `RESERVE_FUND` feature key to the taxonomy (`HOME_CAPITAL_TIMELINE` already existed, unused until now). Still not blanket — the other 224 services remain un-instrumented by design; expand outward from here as the wedge gets confirmed.
4. ✅ **`analytics-admin` dashboard verified live on production — and it found two real bugs in the process, both now fixed:**
   - `apps/backend/src/services/adminAnalytics/repository.ts` — every one of its 9 raw SQL queries referenced snake_case columns (`property_id`, `occurred_at`, etc.), but `ProductAnalyticsEvent`/`Property` only have table-level `@@map`, no field-level `@map`, so the real Postgres columns are camelCase. Every query hit a nonexistent column, surfaced as Prisma `P2010`, failing all 6 endpoints identically with 500s.
   - `apps/frontend/src/lib/api/adminAnalytics.ts` — separately, all 6 fetch functions did `response.data.data`, double-unwrapping past what `api.get()` already unwraps once. This resolved to `undefined`, which React Query treats as an error — so even after the SQL fix returned real 200s, the UI still showed "unable to load" until this was also fixed.
   - After both fixes: dashboard renders live — Activated Homes, WAH/MAH, Activation Funnel, Engagement by Module, Feature Adoption, Top Used Tools, and Cohort Retention (real week-over-week % by signup cohort) all populate with real data.
   - One genuine finding from the real numbers, not a bug: **Decisions Guided is 0** — expected, since none of the 14 currently-instrumented backend services emit `DECISION_GUIDED`. The funnel's last two stages will stay at zero regardless of real usage until the guidance/decision engine is also instrumented (see item 3's "expand outward from the wedge").
5. ✅ **Weekly retention/activation report built.** `apps/backend/scripts/weekly-retention-report.ts` (run via `npm run report:weekly`) queries `ProductAnalyticsEvent` for: active properties/users this week, week-over-week property retention, event counts by type, and event counts by feature. Couldn't verify against live data in this environment (no reachable dev Postgres here), but it compiled and ran through ts-node to the point of actually issuing the Prisma query — failure was purely a local DB-credentials issue, not the script. **Important scope note the script itself prints:** it only covers server-side events (14 services); the six lifecycle events from item 2 above are frontend-only via Faro RUM → Grafana/Loki, not in this Postgres table, so retention/activation numbers from *those* still require a separate Grafana query until/unless they're also emitted server-side.

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
7. ❌ **Legal pages — not created.** I'm not writing placeholder Privacy Policy / Terms of Service text and presenting it as real — that's the kind of thing that needs actual legal review, and shipping fabricated legal copy could be worse than having none. This is a hard blocker for real pilot users and needs your (or counsel's) input on content, not just a route scaffold from me.

---

## 4. Pilot-Readiness Checklist (beyond bugs/analytics/security)

- **Legal pages + consent gate.** Privacy Policy and Terms of Service, with real acceptance at signup — the analytics consent-banner pattern already exists (`lib/consent`); extend that same pattern to a ToS acceptance gate.
- **Realistic demo/pilot data.** Build or confirm a seed script that produces a non-zero, lived-in property (inventory with real ages/conditions, reserve fund contribution history, populated capital timeline) — a pilot user's or investor's first screen should never be an empty/zero dashboard.
- **Walk the onboarding flow end-to-end as a brand-new user this week.** (`apps/frontend/src/app/onboarding` exists.) This is the single highest-scrutiny path for both pilot users and investor demos — it must be flawless.
- **A real feedback channel for pilot users** — in-app widget or at minimum a monitored inbox. Check if one exists; if not, it's cheap to add and materially raises the quality of the pilot feedback you bring into the raise.
- **Verify backups actually run, and test a restore at least once.** Losing a pilot user's home/financial data would be reputationally fatal at this stage — don't assume backups work, prove it.
- **Confirm someone is actually watching Sentry/Loki during the pilot window**, not just collecting data into it.
- **A full, fresh click-through of all 36 tools** with realistic data, cataloguing anything broken or confusing. Feeds directly into Section 1's bug triage.

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
