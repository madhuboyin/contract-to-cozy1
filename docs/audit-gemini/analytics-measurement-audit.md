# SECTION 9 — Analytics & Measurement Audit: ContractToCozy (CtC)

> Canonical reference: [Audit Canonical Contract (v3)](./canonical-audit-contract-v3.md).

**Auditor Note:** We have moved from a generic "Page View" model to a high-signal **Outcome Density** framework. We are now measuring whether users are actually gaining value ($ saved, risk prevented) rather than just clicking links.

---

### Event Tracking Model (Catalog + Live Emissions)

| Category | Event Name | Implementation Status |
| :--- | :--- | :--- |
| **Onboarding** | `address_lookup_started` | ✅ **Live** |
| | `property_claimed` | ✅ **Live** (Tracks Zip & Home Age) |
| **Magic Scan** | `magic_scan_started` | ✅ **Live** |
| | `magic_scan_completed` | ✅ **Live** (Tracks Confidence & Doc Type) |
| **Outcome Density** | `outcome_win_generated` | ⚠️ **Defined in catalog; wiring pending** |
| | `outcome_action_taken` | ✅ **Live** (Standardized via WinCard) |
| **Trust Layer** | `trust_info_clicked` | ✅ **Live** (Standardized via TrustStrip) |
| **Errors** | `api_error_encountered` | ✅ **Live** (Captures Gemini & OCR failures) |
| **Retention** | `task_completed` | ⚠️ **Defined in catalog; wiring pending** |
| | `session_started` | ⚠️ **Defined in catalog; wiring pending** |
| **Monetization** | `booking_initiated` | ⚠️ **Defined in catalog; wiring pending** |
| **Navigation Diagnostics** | `route_redirected` | ✅ **Live** (via route-redirect analytics endpoint) |

---

### The Launch North-Star Metric (Outcome Density)

> **"Wins per User" (WPU):** The average number of verified financial or risk outcomes a user experiences in their first 14 days. 
> *Target for Soft Launch: > 1.5 Wins per User.*

---

### Key Metric Categories (Post-Implementation)

#### 1. Activation Metrics (The "Wow" Loop)
*   ✅ **Lookup-to-Claim Conversion:** % of users who enter an address and complete the property claim.
*   ✅ **Scan Success Rate:** % of `magic_scan_completed` events where confidence > 80%.

#### 2. Retention Metrics (The "Command" Habit)
*   ⚠️ **Outcome Re-engagement:** Metric framework defined; event wiring for key retention markers is still in progress.
*   ✅ **Vault Growth Velocity:** Documents/items added per property per month can be computed from persisted records.

#### 3. Trust Metrics (Authority Building)
*   ✅ **Trust Interaction Rate:** % of WinCards where the user clicks for source/confidence details. This proves the **Universal Trust Layer** is active.

---

### The "Founder's Dashboard" (One Screen)

1.  ✅ **Total Assets Secured:** Growth of the digital twin database.
2.  ⚠️ **Total Savings Identified:** Use existing tool/report outputs now; migrate to `outcome_win_generated` once wired.
3.  ✅ **Magic Scan Funnel:** Started -> Completed -> Action Taken.
4.  ⚠️ **Service Booking Intent:** `booking_initiated` contract exists but frontend emission is pending.

---

### Strategic Diagnostic: Error Visibility
We have implemented **`api_error_encountered`** tracking specifically for the **Magic Scan** and **Property Lookup** flows. This allows the team to distinguish between "User Bounce" and "Technical Failure" during the most critical activation moments.

**Verdict:** The product has a **strong analytics contract and partial live instrumentation.** Activation and trust signals are live; several retention/monetization events still need runtime wiring before claiming full launch instrumentation.
