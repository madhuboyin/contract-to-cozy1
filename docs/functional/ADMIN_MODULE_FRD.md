# Admin Module — Functional Requirements Document

**Version:** 1.2
**Last Updated:** 2026-07-09
**Status:** Implemented — verified via manual browser testing on 2026-07-09; see §11 for fixes found during verification beyond the original scope
**Audience:** Frontend engineers, backend engineers, QA, product

---

## Table of Contents

1. [Overview](#1-overview)
2. [Problem Statement](#2-problem-statement)
3. [Current State (Gap Analysis)](#3-current-state-gap-analysis)
4. [Goals](#4-goals)
5. [Non-Goals](#5-non-goals)
6. [Functional Requirements](#6-functional-requirements)
7. [Data Model Notes](#7-data-model-notes)
8. [Rollout Plan](#8-rollout-plan)
9. [Open Questions](#9-open-questions)
10. [Appendix: File Reference Map](#10-appendix-file-reference-map)
11. [Post-Implementation Fixes Found in Verification](#11-post-implementation-fixes-found-in-verification)

---

## 1. Overview

The ADMIN role today is implemented as an overlay on top of the HOMEOWNER dashboard rather than as its own module. Admin users authenticate, land in the same `(dashboard)` route group as homeowners, see the full homeowner navigation (Today, My Home, Protect, Save, Fix, Vault, Neighbours, Home Lab), and get a short list of admin links appended to the bottom of the desktop sidebar only. There is no dedicated admin shell, no consistent route protection, and no session inactivity control for any role.

This FRD defines the requirements to make the admin module a lightweight, self-contained experience scoped to admin functions (analytics, worker jobs, knowledge admin, provider compliance, DIY templates, and related ops tooling), and to close the route-protection and duplication gaps discovered during review.

## 2. Problem Statement

Reported by product owner, confirmed by code review on 2026-07-09:

1. Admin users see all HOMEOWNER-facing features (property tools, vault, neighbourhood tools, etc.) instead of an admin-appropriate, lightweight surface.
2. There is no inactivity/session timeout for the ADMIN role.
3. The admin module should contain only admin-related functionality.

Review finding on point 2: no role currently has an inactivity timeout — this is a net-new capability, not a fix to role-scoped logic. Given ADMIN's access to analytics, job triggers, and content admin tooling, it is the role most in need of one, so it's included here as a phase of this FRD rather than deferred as unrelated work.

## 3. Current State (Gap Analysis)

| # | Area | Current Behavior | Location |
|---|---|---|---|
| G1 | Primary nav | ADMIN renders the same `PRIMARY_JOBS` array as HOMEOWNER; no role parameter exists in the nav source | `apps/frontend/src/lib/navigation/jobsNavigation.ts:29-162` |
| G2 | Dashboard shell | No ADMIN branch in the redirect effect that exists for PROVIDER; ADMIN falls through into the homeowner dashboard shell | `apps/frontend/src/app/(dashboard)/layout.tsx:595-599, 666` |
| G3 | Desktop sidebar | Admin gets homeowner nav **plus** an appended 3-link admin block; only links Analytics, Knowledge Admin, Worker Jobs — omits Provider Compliance and DIY Templates | `apps/frontend/src/app/(dashboard)/layout.tsx:242-284` |
| G4 | Mobile drawer nav | Zero admin links; admins cannot reach any admin page from the mobile drawer | `apps/frontend/src/app/(dashboard)/layout.tsx:362-511` (`MobileDrawerNav`) |
| G5 | Bottom tab bar (mobile) | Fully role-agnostic; same tabs shown to homeowner and admin | `apps/frontend/src/components/mobile/BottomNav.tsx` |
| G6 | Route protection (middleware) | Dead rule guards a non-existent `/admin` path; the real admin paths (`/dashboard/admin*`, `/dashboard/analytics-admin`, `/dashboard/knowledge-admin`, `/dashboard/worker-jobs`) have no middleware prefix rule | `apps/frontend/middleware.ts:212-217` |
| G7 | Route protection (page-level) | Each of the 4 admin pages reimplements its own `role !== 'ADMIN'` guard independently, with inconsistent implementations (`isAdmin` boolean vs. raw role check) | `admin/provider-compliance/page.tsx`, `admin/diy/templates/page.tsx`, `analytics-admin/page.tsx`, `knowledge-admin/page.tsx` |
| G8 | Session timeout | No idle/inactivity timeout exists for any role; session expiry is purely reactive (401 → refresh) | `apps/frontend/src/lib/api/client.ts:373-394`; no idle-timer hook exists in `src/hooks` |
| G9 | Role type definition | Role is independently defined in 3 places (Prisma enum, backend TS enum, frontend string union) plus a literal re-check in middleware — drift risk if a role is ever added/renamed | `prisma/schema.prisma:24-28`, `apps/backend/src/types/auth.types.ts:4-8`, `apps/frontend/src/types/index.ts:10`, `apps/frontend/middleware.ts:85-87` |

## 4. Goals

- G-A: Admin users see a lightweight, admin-scoped navigation shell — not the homeowner nav plus an appendix.
- G-B: Every admin route is discoverable from nav on both desktop and mobile.
- G-C: Every admin route is protected consistently at both the middleware and page level, via one shared mechanism.
- G-D: Admin sessions (and eventually all sessions) enforce an inactivity timeout.
- G-E: No behavior change for HOMEOWNER or PROVIDER roles.

## 5. Non-Goals

- Redesigning the visual theme/branding of the admin pages themselves (analytics, knowledge admin, etc.) — those pages are functionally in scope only for nav/guard wiring, not a redesign.
- Adding new admin *features* (user management, moderation, impersonation) — none exist today and none are requested; out of scope for this FRD.
- Building a general-purpose per-role nav framework beyond what's needed to give ADMIN and PROVIDER their own shells consistently.
- Consolidating the three role-type definitions (G9) beyond documenting the risk — listed as an open question, not a committed requirement, since it touches backend/frontend/workers simultaneously.

## 6. Functional Requirements

### FR-1: Dedicated Admin Shell

The ADMIN role must get its own layout branch, mirroring the existing PROVIDER pattern.

- FR-1.1: On login/session load, if `user.role === 'ADMIN'`, the dashboard layout must render an admin-specific nav shell instead of `PRIMARY_JOBS`.
- FR-1.2: The admin nav must list exactly the admin-owned route groups: Provider Compliance, DIY Templates, Analytics, Knowledge Admin, Worker Jobs (extendable as new admin routes are added).
- FR-1.3: Homeowner-only nav sections (Today, My Home, Protect, Save, Fix, Vault, Neighbours, Home Lab) must not render for ADMIN.
- FR-1.4: This applies to desktop sidebar, mobile drawer, and mobile bottom tab bar consistently (closes G3, G4, G5).

**Acceptance criteria:**
- Logging in as an ADMIN test user shows only admin nav items, on both desktop and mobile viewports.
- Logging in as a HOMEOWNER or PROVIDER user shows unchanged nav (regression check).
- All 5 admin route groups are reachable from nav without typing a URL directly.

### FR-2: Centralized Route Protection

- FR-2.1: Add middleware prefix rules covering the real admin paths (`/dashboard/admin`, `/dashboard/analytics-admin`, `/dashboard/knowledge-admin`, `/dashboard/worker-jobs`) that redirect non-ADMIN roles before the page loads.
- FR-2.2: Remove or repoint the dead `/admin` prefix rule in `middleware.ts:212-217` to match actual paths.
- FR-2.3: Replace the duplicated page-level guards with a single shared guard (`useAdminGuard`) used by every admin page. New admin pages must adopt this guard rather than reimplementing the check. (Implementation note: a 5th page, `worker-jobs`, was found during implementation to have the same duplicated pattern as the original 4 — not counted in the gap analysis in §3, but migrated along with the rest since it's the identical bug.)

**Acceptance criteria:**
- A HOMEOWNER session hitting any admin URL directly is redirected server-side (middleware), before any admin page code executes client-side.
- All 5 admin pages use the shared guard; no page contains its own inline `role !== 'ADMIN'` branch.
- Backend `requireRole(ADMIN)` checks are unchanged (defense in depth retained).

### FR-3: Session Inactivity Timeout

- FR-3.1: Introduce an idle-timeout mechanism on the frontend that logs the user out (or forces re-authentication) after a period of inactivity.
- FR-3.2: Phase 1 scope: enabled for ADMIN sessions only, given elevated access to analytics, job triggers, and content admin tooling.
- FR-3.3: Timeout duration is 15 minutes idle (configurable via a constant, not hardcoded inline), consistent with OWASP guidance for privileged sessions and with this app's existing MFA-for-ADMIN precedent.
- FR-3.4: Activity (mouse, keyboard, navigation, API calls made in response to user action) resets the idle timer. The timer syncs across tabs via a `localStorage` `storage` event listener — activity in any open tab resets the timer in all tabs for that session, since admins commonly run multiple admin pages (analytics, worker-jobs, knowledge-admin) open simultaneously.
- FR-3.5: A warning modal appears 60 seconds before the actual timeout, giving the admin a chance to stay signed in. If no action is taken, the user is logged out and redirected to `/login` with a "session expired due to inactivity" message.

**Acceptance criteria:**
- An idle ADMIN session with no interaction for the configured duration is logged out automatically and redirected to `/login`.
- HOMEOWNER/PROVIDER sessions are unaffected in Phase 1.
- Any active API polling (e.g. dashboard auto-refresh) does not itself reset the idle timer — only genuine user interaction should count as activity.

### FR-4: Extend Timeout to All Roles — DEFERRED, not in scope

**Decision (2026-07-09):** Not building this now. The original ask was specifically that ADMIN lacks a timeout, and the module should stay scoped to admin concerns — extending idle-logout to the consumer-facing HOMEOWNER/PROVIDER roles is a separate product decision with broader UX impact (interrupting a homeowner mid-session is a different cost/benefit than interrupting an admin) and shouldn't ride along with an admin-scoped fix. Left documented here only as a known future option, not as committed work. If revisited later, it would need its own UX pass (duration, warning copy, whether it should exist at all for a consumer app).

## 7. Data Model Notes

- No Prisma schema changes are required for FR-1 through FR-3. Role already exists as `UserRole.ADMIN` (`prisma/schema.prisma:24-28`).
- FR-3 does not require new persisted state if implemented as a pure client-side idle timer keyed off existing JWT expiry; if a server-enforced idle timeout is preferred instead (harder to bypass via client tampering), that would require tracking `lastActivityAt` server-side and is a larger change — flagged as an open question below.
- No new migration is anticipated. Per project convention, any schema changes needed would go through `prisma/schema.prisma` + `npx prisma db push` directly, not a migration script.

## 8. Rollout Plan

1. **Phase 1 — Nav & route protection (FR-1, FR-2):** No user-facing risk beyond admins; ships behind normal review, no flag needed given the small admin user base.
2. **Phase 2 — Admin inactivity timeout (FR-3):** Ship to ADMIN only first; monitor for unexpected logouts (e.g. long-running analytics review sessions) before considering FR-4.
3. **Phase 3 — All-role timeout (FR-4):** Only if product confirms it's wanted; requires its own UX pass (warning modal, remembered duration, etc.) given the consumer-facing impact.

## 9. Decisions and Open Questions

Resolved 2026-07-09:

- **Q2 (idle duration):** 15 minutes idle + 60-second warning modal before logout. See FR-3.3/FR-3.5.
- **Q3 (cross-tab):** Synced across tabs via `localStorage` `storage` event; activity in any tab resets the timer for all tabs. See FR-3.4.
- **Q4 (extend to all roles):** Deferred, not in scope for this implementation. See FR-4.
- **Q5 (role type consolidation):** Tracked separately, not bundled into this work — touches backend/frontend/workers schemas simultaneously and is unrelated regression risk for a currently-cosmetic drift issue.

Resolved 2026-07-09 (confirmed with product):

- **Q1 (enforcement model):** Client-side only. A JS idle timer logs the admin out and redirects to `/login` after 15 minutes of inactivity (with the 60-second warning modal from FR-3.5). No new server-side session-activity tracking in this phase — the existing 15-minute access-token expiry already bounds the worst case if the client timer is bypassed. Server-enforced idle tracking is not ruled out permanently but is only worth adding if a future security review calls for it.

## 10. Appendix: File Reference Map

| File | Relevance |
|---|---|
| `apps/frontend/src/app/(dashboard)/layout.tsx` | Desktop sidebar (`PersistentSidebarNav`), mobile drawer (`MobileDrawerNav`), PROVIDER redirect pattern to mirror for ADMIN |
| `apps/frontend/src/lib/navigation/jobsNavigation.ts` | Homeowner `PRIMARY_JOBS` nav source; needs an admin-equivalent nav source |
| `apps/frontend/src/components/mobile/BottomNav.tsx` | Mobile bottom tab bar; currently role-agnostic |
| `apps/frontend/middleware.ts` | Dead `/admin` rule (lines 212-217); needs real prefix rules for admin paths |
| `apps/frontend/src/lib/auth/AuthContext.tsx` | Central source of `user.role` / `isAdmin` on the frontend; where a shared guard hook would consume role state |
| `apps/frontend/src/app/(dashboard)/dashboard/admin/provider-compliance/page.tsx` | Existing inline guard to replace with shared guard |
| `apps/frontend/src/app/(dashboard)/dashboard/admin/diy/templates/page.tsx` | Existing inline guard to replace with shared guard |
| `apps/frontend/src/app/(dashboard)/dashboard/analytics-admin/page.tsx` | Existing inline guard to replace with shared guard |
| `apps/frontend/src/app/(dashboard)/dashboard/knowledge-admin/page.tsx` | Existing inline guard to replace with shared guard |
| `apps/frontend/src/lib/api/client.ts` | Current reactive 401→refresh session handling; idle timer needs to integrate with this without conflicting |
| `apps/backend/src/config/jwt.config.ts` | Existing token expiries (uniform across roles today); relevant if a server-enforced timeout (Q1) is chosen |
| `apps/backend/src/middleware/auth.middleware.ts` | `requireMfa` — existing precedent for admin-only session behavior (MFA), a useful pattern reference for admin-only timeout gating |
| `prisma/schema.prisma` | `UserRole` enum — no changes anticipated |

## 11. Post-Implementation Fixes Found in Verification

FR-1 through FR-3 were implemented and pushed on 2026-07-09. Manual browser testing that same day (using a seeded test account temporarily promoted to ADMIN) surfaced several more homeowner-only surfaces leaking into the admin console. These weren't in the original §3 gap analysis — that analysis only covered the sidebar/drawer/bottom-bar/middleware — but they're the same class of bug as G1–G5, just in global chrome rendered by `(dashboard)/layout.tsx` rather than the primary nav itself, so they're recorded here as an extension of FR-1.3 rather than a new FRD.

| # | Surface | Issue | Fix |
|---|---|---|---|
| P1 | `useIdleTimeout` logout path | Idle-triggered logout went through `AuthContext.logout()` (React state update + soft `router.replace`). A tab idle since shortly after login hits the access token's own 15-min expiry at nearly the same moment as the idle timer; any other in-flight request could independently trigger the app's existing hard `window.location.href` redirect (`client.ts`), and that hard navigation racing the in-flight React state update surfaced as a visible Next.js error-boundary crash. | Idle-timeout logout no longer goes through `AuthContext.logout()` — it's now a self-contained hard redirect (`api.logout()` then `window.location.href = '/login?reason=idle_timeout'`), so both mechanisms resolve via ordinary browser navigation instead of colliding with React. Login page also now shows a distinct message for `reason=idle_timeout`. |
| P2 | `PropertySetupBanner` ("Add your first property") | Gated only on `user.segment !== 'EXISTING_OWNER'`, never on role — rendered for ADMIN. | Added explicit `user.role === 'ADMIN'` bail-out in `(dashboard)/layout.tsx`. |
| P3 | `CtcTopCommandBar` property switcher ("Main Home" dropdown) | Rendered unconditionally, no role check. | Hidden for `isAdminNav` on both desktop and mobile top bars. |
| P4 | `/dashboard` page (homeowner main dashboard) | Every admin page's "Back to dashboard" link (`AdminConsoleShell`'s default `backHref`) points at `/dashboard`. Since admin has zero properties, that page's own onboarding gate fired, showing "Start My Property Setup Now" — a dead end. | `/dashboard` now redirects ADMIN to `/dashboard/knowledge-admin`, mirroring the existing PROVIDER-redirect pattern. Covers any stray link to bare `/dashboard`, not just the back-link. |
| P5 | `DashboardBreadcrumbs` | Nested admin routes (e.g. `/dashboard/admin/provider-compliance`) produced a broken `Today / Admin / Details` trail — "Admin" linked to a nonexistent `/dashboard/admin` index page (404), and `provider-compliance` happened to match the component's long-token ID-detection heuristic and got mislabeled "Details". | Breadcrumbs suppressed entirely for admin routes — redundant with `AdminConsoleShell`'s own back-link + header anyway. |
| P6 | `DashboardCommandPalette` (Cmd+K) | Showed the full homeowner nav list (Protect, Save, Vault, Rooms, Inventory, Book a Pro, etc.) to admin with only one admin item (`Knowledge Admin`) appended — the same homeowner-nav-plus-extras pattern FR-1 was written to fix, just in a second, undiscovered nav surface. | Branches to a dedicated admin-only item list sourced from `ADMIN_NAV`, with no property-scoped "Recent Actions"/"Quick Shortcuts" sections. |
| P7 | `AIChat` ("Cozy") | A homeowner maintenance/expense concierge widget, floating on every dashboard page including admin. | No longer rendered for ADMIN. |
| P8 | `CtcCommandSearch` placeholder copy | "Ask your home anything…" shown on the admin console top bar. | Swapped to "Search admin console…" when opened from the admin top bar. |

All 8 fixes are committed on `main` (commits `0473a9b`, `8054e1d`, `b92b4ad`, `fe9e032`) and verified via `tsc --noEmit` (no new errors) plus live browser testing against the running dev stack.

---

*This FRD reflects a code review conducted 2026-07-09, implemented the same day, and verified in the browser the same day — including the fixes in §11 found during that verification pass.*
