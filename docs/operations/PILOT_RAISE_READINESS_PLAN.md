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

### Plan
1. **Instrumentation coverage sprint.** Wire `track('tool_opened', ...)` on load and `track('action_taken'/'workflow_completed', ...)` on completion into every one of the 36 tool pages — use the 8 existing call sites as the template. This is mechanical, low-risk work, and it's the single highest-leverage thing on this list because it directly produces the data a raise pitch needs.
2. **Decide pilot success metrics now, before the pilot starts** — not retroactively. Recommended set, all of which map onto events that already exist in the taxonomy:
   - Activation: time from `property_onboarded` to `first_wow_moment`.
   - Retention: `return_visit` at 7/14/30 days.
   - Engagement depth: distinct `tool_opened` values per user (breadth of adoption).
   - Outcome trust: counts of `outcome_win_generated` and `savings_verified`.
3. **Prioritize backend event emission by wedge**, not blanket coverage — instrument the services behind whichever tool becomes the fundraise "wedge" story first, then expand outward.
4. **Verify the `analytics-admin` dashboard actually renders a usable funnel/retention view.** If it's a stub, finishing it is probably 1-2 days of work and produces a genuinely strong investor artifact ("here's our live product dashboard") — better ROI than most new features right now.
5. **Start a weekly retention/activation report** (even a manual query against the analytics event table) so that by pitch time you're quoting real numbers, not describing infrastructure.

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

### Gaps to close before pilot / before investor technical diligence
1. **No SAST (static analysis security scanning)** — no CodeQL or Semgrep in CI. `npm audit`/TruffleHog catch dependency and secret issues, not injection/XSS-class code bugs. Add before pilot.
2. **`tests/e2e/` and `tests/security/` are empty** (only `.gitkeep`) — no automated end-to-end or security-specific test suite exists despite the scaffolding. At minimum, add negative auth/authz tests before pilot: cross-property data access attempts, expired/tampered token handling, CSRF-bypass attempts. This product holds financial and PII data across multiple unrelated households — this is the kind of gap that matters more than it looks like at pre-seed.
3. **No documented at-rest encryption story** for sensitive fields (reserve fund balances, contribution history, other financial data). Confirm what's actually true (disk-level encryption via the hosting provider, or column-level for the most sensitive fields) and write it down — this will come up in diligence given the product handles financial data.
4. **No secrets rotation policy.** JWT/session/CSRF/MFA secrets in `.env.local.example` are static, long-lived values with no documented rotation cadence or break-glass revocation procedure.
5. **No data retention/deletion policy or visible account-deletion flow.** If a pilot user asks "delete my data," is there a real path today? Needed both as basic ethical practice for early users and because investors will ask about GDPR/CCPA posture even for a small pilot.
6. **Next.js 14's unpatched HIGH advisories are allowlisted, not fixed.** That's a reasonable interim call, but it should be a conscious, dated decision (e.g., "upgrade to Next 15 by [date]") rather than an indefinite allowlist — especially once real pilot users' data is at stake.
7. **No legal pages found anywhere in the app** — no Privacy Policy, no Terms of Service. This is a hard blocker for real pilot users, independent of any security engineering.

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
