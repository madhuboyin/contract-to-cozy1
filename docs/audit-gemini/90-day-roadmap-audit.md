# SECTION 12 — 90-Day Pre-Launch Roadmap: ContractToCozy (CtC)

> Canonical reference: [Audit Canonical Contract (v3)](./canonical-audit-contract-v3.md).

**Auditor Note:** You have 90 days to transform a "Beta Sandbox" into an "Essential Homeowner Companion." This roadmap is not about building new features — it is about **Curating the Surface and Empowering the Engine.** We are moving from "Builder Mode" to "Command Center."

---

### Phase 1: Architecture & Trust (Days 0–30) — ✅ IN PROGRESS / LARGELY COMPLETE
*Goal: Shift from "Tool Catalog" to "Job-based Command Center" and establish universal credibility.*

*   ✅ **Initiative 1: The 6-Job Navigation Shift.** (Product/Design) Replaced the 40+ link sidebar with the primary jobs: Today, My Home, Protect, Save, Fix, Vault.
*   ✅ **Initiative 2: The Universal Trust Layer.** (Design/Eng) Created the `WinCard` component with integrated `TrustStrip` (Confidence, Source, Rationale).
*   ✅ **Initiative 3: The "Magic Scan" Loop.** (Design/Eng) Implemented `MagicCaptureSheet` for the flagship "Camera -> Vault -> Action" onboarding wedge.
*   ✅ **Initiative 4: The Resolution Hub (`/dashboard/fix`).** (Product) Unified Decision (Replace/Repair), Search (Providers), and Execution (Bookings) into a single concierge surface.
*   **Success Metric:** Transition from fragmented tools to a unified "Surface vs. Engine" architecture.

---

### Phase 2: Hardening & Hero Flow Quality (Days 30–60) — ⏳ UP NEXT
*Goal: De-risk the already implemented "First 3 Minutes" and polish the core "Resolution" loops.*

*   **Initiative 1: Address-First Onboarding Reliability.** (Product/Eng) Improve lookup-to-claim reliability, fallback states, and data quality checks in the live flow.
*   **Initiative 2: The "Unexpected Repair" Flow.** (Product/Design) Build the world-class flow from "Issue" -> "Estimate" -> "Compare" -> "Book" -> "Track".
*   **Initiative 3: AI Fallback + Circuit Breakers.** (Eng) Add static fallback UI and API timeout/circuit-breaker safety nets for Gemini-dependent surfaces.
*   **Initiative 4: Zod Schema Sync (Final Pass).** (Eng) Ensure frontend and backend types are fully aligned to prevent optional-field drift.
*   **Success Metric:** Average Time to First Value (TTFV) < 180 seconds and reduced API-failure drop-off in onboarding and Magic Scan.

---

### Phase 3: Analytics, Conversion & Prep (Days 60–90)
*Goal: Instrument for "Outcome Density" and prepare for scale.*

*   **Initiative 1: Outcome Event Tracking.** (Eng/Product) Instrument analytics to track "Wins Generated" (e.g., $ saved, risks prevented) rather than just page views.
*   **Initiative 2: "Cozy+" Freemium Gate.** (Product/Eng) Implement the logic for Tier 2 limits (e.g., locking unlimited AI extraction behind a paywall).
*   **Initiative 3: PWA & Offline Stress Test.** (Eng) Verify offline sync reliability for the Action Center and Vault when in low-connectivity environments (basements/attics).
*   **Initiative 4: Empty State Polish.** (Design) Ensure all 6 Jobs have beautiful, contextual "Simulated Data" or onboarding prompts when no property data exists.
*   **Success Metric:** Full visibility on "Prop-Active User" funnel; 0 P0 bugs in the Property Claim and Resolution flows.

---

### The 10 Highest Leverage Pre-Launch Moves

1.  ✅ **Job-Based Navigation:** Moving from 40 links to 6 Jobs is the single biggest "Premium" upgrade you have made.
2.  ✅ **The "Magic Scan" Wedge:** The `MagicCaptureSheet` is the viral loop that passes the "Neighbor Test."
3.  ✅ **The `WinCard` Architecture:** Combining outcomes with the Universal Trust Layer proves authority.
4.  ✅ **The Resolution Hub (`/dashboard/fix`):** Moving from passive directories to active concierge management.
5.  **Address Lookup Reliability:** Keep the live onboarding wedge trustworthy under API latency and partial-data conditions.
6.  **"Unexpected Repair" Hero Flow:** The highest-anxiety moment for a homeowner must be the most polished part of the app.
7.  **Outcome-Density Tracking:** Measuring success by "$ Saved" or "Risks Prevented," not DAUs.
8.  **Progressive Profiling:** Don't ask for the HVAC age until the user is already hooked on their "Health Score."
9.  **Skeleton Shimmer Loaders:** Make the AI extraction *feel* 2x faster than it actually is.
10. **Error Boundaries:** Prevent "Frustration Churn" caused by fragile sub-tools.

---

### Strategic Risks & Dependencies

*   **Risk:** Gemini API latency ruins the "Magic Scan" moment. (Fix: Implement cached fallbacks and contextual loading shimmers).
*   **Risk:** Data entry remains too high-friction if the AI fails. (Fix: Provide a seamless "Manual Override" fallback for the Vault).
*   **Dependency:** Reliable public data providers through `ExternalPropertyDataService` (current Mock/RentCast bridge, future provider expansion optional).

**Verdict:** The Phase 1 shift to a **"Command Center"** architecture preserves your massive technical moat while delivering a premium, curated surface. By executing Phases 2 and 3, CtC will launch not as a software tool, but as an **Essential Homeowner Service.**
