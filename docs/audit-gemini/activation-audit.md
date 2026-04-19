# SECTION 8 — Activation Audit: ContractToCozy (CtC)

**Auditor Note:** In a homeowner's life, "Home Management" is a chore they avoid. If CtC feels like another chore (manual entry, uploading 50 photos, filling out long forms), they will never activate. You have **3 minutes** to move a user from "Curious Stranger" to "Relieved Homeowner." Your current activation path is likely blocked by a "Data Entry Wall."

---

### Activation Evaluation

| Milestone | Status | Analysis |
| :--- | :--- | :--- |
| **Add Property Flow** | Partial | Technically functional, but requires too many manual fields (SqFt, Year, etc.) that users might not know. |
| **Onboarding Quality** | Weak | Likely a generic signup -> empty dashboard. No guided "First Success" path. |
| **First Dashboard Value** | Low | Without data entry, the dashboard is a skeleton of empty charts and zero-states. |
| **First Action Completion** | Medium | Completing a task is easy, but *finding* why a task is relevant takes too long. |
| **First Savings Insight** | High Risk | If savings only show up after 1 week of data logging, the user is gone. |
| **First "Wow" Moment** | **Missing** | There is no "Magic" moment where the app tells the user something they didn't know about their home. |
| **First Retained Reason** | Partial | The "Vault" is a good reason to stay, but a bad reason to *start*. |

---

### The Recommended Activation Strategy

#### 1. The "Zero-Input" Onboarding Flow
*   **Step 1:** Landing Page: "Enter your address to see your Home Health Score."
*   **Step 2:** Background Fetch: Use Zillow/Public APIs to pull Home Year, Type, and Value.
*   **Step 3:** The Reveal: "We found your home. Based on its age (2012) and your local climate (Texas), you have 3 urgent maintenance risks. [See Risks]."
*   **Step 4:** Soft Signup: "Create an account to claim this property and unlock your 2024 Savings Report."

#### 2. The "Seeded Value" Strategy
*   Don't start with an empty dashboard. Start with **"Generic Hero Data."**
*   *Example:* "Typical homes in your neighborhood save $450/year by optimizing their insurance. Tap here to see if you qualify."
*   *Example:* "Your HVAC model is likely a [Brand] based on your home's build year. Here is its manual and first task."

#### 3. The "Demo Mode" Bridge
*   Provide a "Sample Home" (e.g., "The Modern Suburban") that is 100% populated. Let users play with the `Visual Inspector` and `Savings Calculator` on dummy data before they commit to their own home.

#### 4. The First-Week Lifecycle (The "Habit" Loop)
*   **Day 0:** Property Claimed + First "Wow" (Risk insight).
*   **Day 1:** "Your Vault is 10% secure. Upload your Insurance Policy for a free coverage audit."
*   **Day 3:** "Weather Alert: Extreme cold coming. Here is a 2-minute task to prevent pipe bursts."
*   **Day 7:** First "Home Health Report" email summary.

---

### Activation Funnel Metrics (The "North Stars")

1.  **Address Lookup Rate:** % of landing page visitors who enter an address.
2.  **Property Claim Rate:** % of lookups who create an account.
3.  **First Document Upload:** % of new users who upload 1 document/photo in the first 24 hours. (**Primary Activation Metric**).
4.  **First Task Check-off:** % of users who complete the "New Homeowner Checklist" within 7 days.

---

### Biggest Blockers to Activation

*   **[CRITICAL] The Serial Number Wall:** Asking for appliance model/serial numbers during onboarding. (Solution: AI Photo Extraction).
*   **[HIGH] Choice Paralysis:** Too many tools available on Day 1. (Solution: Gate 80% of tools until the Property is "Healthy").
*   **[HIGH] Lack of Immediate Payoff:** The user gives data but doesn't get an "Insight" back for 24 hours. (Solution: Real-time public data fetching).

**Verdict:** Currently, CtC is a **"Self-Service Database."** To activate users, it must become an **"Automated Advisor."** You must move the "Value" from the end of the journey to the very first 30 seconds. Invert the flow: **Give value first, then ask for data.**
