# Audit Canonical Contract (v3)

**Last normalized:** April 19, 2026  
**Scope:** `docs/audit-gemini/*.md`

This file is the single source of truth for naming, status, route references, and analytics claims used across the audit set.

---

## 1) Canonical IA (6 Jobs)

Source of truth: `apps/frontend/src/lib/navigation/jobsNavigation.ts`.

| Job Key | Job Label | Hub Route | Property-Scoped Canonical Route |
| :--- | :--- | :--- | :--- |
| `today` | Today | `/dashboard` | `/dashboard/properties/:propertyId` (default home context) |
| `my-home` | My Home | `/dashboard/properties` | `/dashboard/properties/:propertyId` |
| `protect` | Protect | `/dashboard/protect` | `/dashboard/properties/:propertyId/protect` |
| `save` | Save | `/dashboard/save` | `/dashboard/properties/:propertyId/save` |
| `fix` | Fix | `/dashboard/fix` | `/dashboard/properties/:propertyId/fix` |
| `vault` | Vault | `/dashboard/vault` | `/dashboard/properties/:propertyId/vault` |

Notes:
- `/dashboard/{protect|save|fix|vault}` are redirect hubs that resolve to property-scoped routes.
- Public Seller Vault sharing route is `/vault/:propertyId`.

---

## 2) Engine Naming Rules

- Use `do-nothing-simulator` when referring to dashboard route/module naming.
- Use `do-nothing` when referring to property-scoped tool keys (`/tools/do-nothing`).
- `home-savings` is an active Save-cluster engine and should be treated as contextual (not a primary nav item).

---

## 3) Launch Readiness Truth Table

| Area | Current Status |
| :--- | :--- |
| 6-job navigation architecture | ✅ Implemented |
| Address-first onboarding flow | ✅ Implemented |
| Magic Scan loop | ✅ Implemented |
| WinCard + TrustStrip trust surface | ✅ Implemented |
| Dashboard-level error boundaries | ✅ Implemented |
| Gemini/API static fallback UI on AI cards | ⚠️ Pending |
| API circuit breakers/timeouts | ⚠️ Pending |
| API rate-limit verification for AI endpoints | ✅ Implemented (Redis-backed + automated `429` integration coverage) |
| Health probes (DB + Redis) verification | ✅ Implemented (`/api/health/deep` checks DB + Redis ping with timeout/degraded status) |
| Frontend/backend schema optional-field parity final pass | ⚠️ Pending |
| Resolution-flow session replay instrumentation | ⚠️ Pending |

Launch wording rule:
- Use "Beta ready with hardening gates" until all pending reliability gates above are closed.
- Do not use "fully launch-ready" or "technically complete" without explicitly calling out remaining gates.

---

## 4) Analytics Canonical Status

Source of truth: `apps/frontend/src/lib/analytics/events.ts` and current frontend call-sites.

### 4.1 Event Catalog Contract

The strongly typed event catalog is implemented and includes onboarding, activation, trust, retention, monetization, workflow, and diagnostics events.

### 4.2 Verified Emission Status (current)

| Event | Status |
| :--- | :--- |
| `landing_page_viewed` | ✅ Emitting |
| `address_lookup_started` | ✅ Emitting |
| `property_claimed` | ✅ Emitting |
| `magic_scan_started` | ✅ Emitting |
| `magic_scan_completed` | ✅ Emitting |
| `outcome_action_taken` | ✅ Emitting |
| `trust_info_clicked` | ✅ Emitting |
| `morning_brief_opened` | ✅ Emitting |
| `morning_brief_cta_clicked` | ✅ Emitting |
| `api_error_encountered` | ✅ Emitting |
| `route_redirected` | ✅ Emitting through navigation redirect analytics endpoint |
| `booking_initiated` | ✅ Emitting from provider booking submit flow |
| `outcome_win_generated` | ⚠️ Defined in catalog, not yet emitted from frontend call-sites |
| `task_completed` | ⚠️ Defined in catalog, not yet emitted from frontend call-sites |
| `session_started` | ✅ Emitting once per dashboard session (sessionStorage dedupe) |

Claims rule:
- "Live" means emitted by code path today.
- "Defined" means typed in catalog but not yet wired in runtime flows.

---

## 5) Vocabulary and Consistency Rules

- Primary navigation reference must always be "6 Jobs".
- Do not mix "4 jobs", "4 pillars", and "5 pillars" language in launch-state docs.
- Prefer "curate the surface, preserve the engines" language over "remove features".
