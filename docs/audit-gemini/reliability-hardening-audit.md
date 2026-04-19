# SECTION 7 — Reliability / Hardening Audit: ContractToCozy (CtC)

**Auditor Note:** You have a sophisticated micro-application architecture (40+ specialized tool routes), but the "Glue" and "Safety Nets" are inconsistent. Your backend uses a solid `APIError` pattern, but the frontend suffers from "Fragmented Fragility." If one external API (Gemini, OpenWeather, Zillow) fails or returns an unexpected schema, large portions of your dashboard will either white-screen or show meaningless zero-states.

---

### Reliability Evaluation

| Factor | Status | Risk Analysis |
| :--- | :--- | :--- |
| **Route Health** | Mixed | High number of shallow routes (e.g., `do-nothing/page.tsx` just wraps a client component) increases surface area for build-time failures. |
| **Placeholder Management** | Poor | "Coming Soon" artifacts are scattered across sub-tools, signaling an unfinished product to first-time users. |
| **Validation Layer** | Strong (Backend) | Excellent use of Zod for request validation. However, frontend "Optimistic UI" lacks robust error-rollback logic. |
| **Auth Resilience** | High | Standard JWT/NextAuth-style implementation appears solid, but cross-app (Worker/Backend) session consistency needs a stress test. |
| **API Fragility** | **Critical** | Heavy reliance on external AI and weather APIs without visible "Circuit Breakers" in the UI. |
| **State Consistency** | Medium | High risk of IndexedDB vs. Postgres state divergence in the PWA/Offline-first model. |

---

### P0: Must Fix Before Launch (The "No-Go" List)

1.  **Global Error Boundaries:** Implement React Error Boundaries at the `/dashboard` level. If a niche tool like `tax-appeal` crashes, it must not take down the entire sidebar and navigation.
2.  **API Fallback UI:** Every AI-powered card must have a "Static Fallback." If Gemini is down, show a "Currently Calculating" or "General Recommendations" card instead of an empty state or crash.
3.  **Schema Enforcement for External Data:** You are fetching weather and property data. If the API returns a `null` for a key field (e.g., `zip_code`), the frontend current crashes in several `page.tsx` files. Add null-checks to all external data mappers.
4.  **Zod Schema Sync:** Ensure the Zod schemas used in `backend/src/validators` match the TypeScript types in `frontend/src/types` 100%. Mismatches here lead to silent data corruption in the DB.
5.  **Sensitive Data Leakage:** Ensure `logger.error({ err })` in the backend isn't logging full JWT tokens or PII (emails/phone numbers) in production logs.

### P1: Should Fix (The "Polish" List)

1.  **Unified Loading Skeletons:** Move away from "Loading items..." text. Create a standard `SkeletonCard` component used across all 40 routes for visual consistency.
2.  **Form Dirty States:** Homeowners spend 10+ minutes entering appliance data. If they refresh or navigate away without saving, they lose everything. Implement "Unsaved Changes" warnings.
3.  **BullMQ Worker Visibility:** If a report generation job fails in the background, the user is never notified in the frontend. Implement a "Job Status" notification center.
4.  **Rate Limit Communication:** When a user hits an OCR or AI rate limit, the error must say "You've reached your daily AI limit," not "Internal Server Error."

---

### Pre-Launch Hardening Checklist

#### 🛡️ Backend & API
- [ ] **Circuit Breakers:** Implement timeouts for all Gemini/External API calls (max 10s).
- [ ] **Rate Limiting:** Confirm limiters are active for `/api/gemini` and `/api/ocr` to prevent bill shock.
- [ ] **DB Migrations:** Dry-run all Prisma migrations against a production-sized data seed to check for performance bottlenecks.
- [ ] **Health Check Probes:** Ensure `/api/health` monitors DB and Redis connectivity, not just the process.

#### 📱 Frontend & UX
- [ ] **The "Offline" Stress Test:** Manually disable WiFi and ensure the "Vault" and "Actions" can still be viewed and updated via IndexedDB.
- [ ] **Validation Feedback:** Ensure every form field shows a specific Zod error message (e.g., "Invalid Zip Code") rather than a generic red border.
- [ ] **Asset Minification:** Verify that Next.js image optimization is correctly configured for PWA performance on slow cellular connections.

#### 📊 Observability
- [ ] **Error Tracking:** Connect Sentry or Faro (which is referenced in `/api/faro`) to capture all client-side crashes.
- [ ] **User Journey Logging:** Ensure you can reconstruct a user's path from "Add Property" to "Crash" in your logs.

**Verdict:** Your code is high-quality, but your **architecture is overly optimistic.** You assume external APIs and user inputs will always be perfect. To harden CtC for launch, you must **embrace failure**: handle nulls, catch exceptions at the component level, and provide graceful UI fallbacks when the "Magic" (AI) fails to appear.
