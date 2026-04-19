# SECTION 9 — Analytics & Measurement Audit: ContractToCozy (CtC)

**Auditor Note:** We have moved from a generic "Page View" model to a high-signal **Outcome Density** framework. We are now measuring whether users are actually gaining value ($ saved, risk prevented) rather than just clicking links.

---

### Implemented Event Tracking Model (The "Essential 20")

| Category | Event Name | Implementation Status |
| :--- | :--- | :--- |
| **Onboarding** | `address_lookup_started` | ✅ **Live** |
| | `property_claimed` | ✅ **Live** (Tracks Zip & Home Age) |
| **Magic Scan** | `magic_scan_started` | ✅ **Live** |
| | `magic_scan_completed` | ✅ **Live** (Tracks Confidence & Doc Type) |
| **Outcome Density** | `outcome_win_generated` | ✅ **Live** (Tracks Win Type & USD Value) |
| | `outcome_action_taken` | ✅ **Live** (Standardized via WinCard) |
| **Trust Layer** | `trust_info_clicked` | ✅ **Live** (Standardized via TrustStrip) |
| **Errors** | `api_error_encountered` | ✅ **Live** (Captures Gemini & OCR failures) |
| **Retention** | `task_completed` | ✅ **Live** |
| | `session_started` | ✅ **Live** |

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
*   ✅ **Outcome Re-engagement:** % of users who return to take action on a secondary win (e.g., scan policy, then book repair).
*   ✅ **Vault Growth Velocity:** Documents/Items added per property per month.

#### 3. Trust Metrics (Authority Building)
*   ✅ **Trust Interaction Rate:** % of WinCards where the user clicks for source/confidence details. This proves the **Universal Trust Layer** is active.

---

### The "Founder's Dashboard" (One Screen)

1.  ✅ **Total Assets Secured:** Growth of the digital twin database.
2.  ✅ **Total Savings Identified:** Aggregated USD value found for the entire user base.
3.  ✅ **Magic Scan Funnel:** Started -> Analyzing -> Outcome -> Action Taken.
4.  ✅ **Service Booking Intent:** Number of `booking_initiated` events from the Resolution Center.

---

### Strategic Diagnostic: Error Visibility
We have implemented **`api_error_encountered`** tracking specifically for the **Magic Scan** and **Property Lookup** flows. This allows the team to distinguish between "User Bounce" and "Technical Failure" during the most critical activation moments.

**Verdict:** The product is now **Fully Instrumented for Launch.** We have the telemetry needed to prove the **"Outcome Density"** thesis and iterate based on real user interactions with the 6 core Jobs.
