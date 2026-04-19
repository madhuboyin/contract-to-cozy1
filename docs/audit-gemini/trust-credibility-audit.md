# SECTION 6 — Trust & Credibility Audit: ContractToCozy (CtC)

**Auditor Note:** You are using Google Gemini to power home insights. While powerful, AI hallucinations or "Black Box" recommendations are the fastest way to lose a homeowner's trust. If CtC says "Replace your roof," and the user doesn't know *why* or *how you know*, they won't just ignore the advice—they will delete the app. Trust is not a feature; it is your core product.

---

### Recommendation Flow Audit (Typical AI/Insight Outputs)

| Output Type | Believable? | Confidence Visible? | Source Shown? | Freshness Shown? | Reasoning Explained? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Maintenance Tasks** | Partial | No | No | No | Weak |
| **Risk Radar / Gaps** | Low | No | No | No | Weak |
| **Financial Savings** | Low | No | No | No | No |
| **Property Valuation** | Medium | Partial | No | Partial | No |
| **Visual Inspection** | High | No | **Yes** (Photo) | **Yes** | Partial |

---

### Where Trust Currently Breaks

1.  **The "Expert" Hallucination:** Standalone AI chat (`Oracle`) making specific home repair claims without citing building codes or manufacturer manuals.
2.  **Unexplained Savings:** "You could save $400/year on energy" with no breakdown of *how* that number was calculated.
3.  **Ghost Data:** Showing risks or tasks for appliances the user hasn't actually added yet (based on generic zip code data) without labeling them as "General Estimates."
4.  **Static Freshness:** A "Home Health Score" that doesn't show *when* it was last calculated. If it's 2 weeks old, it feels irrelevant.
5.  **Opaque Risk:** Telling a user a task is "High Priority" without explaining the literal cost of failure (e.g., "Neglecting this flush can lead to a $3,000 basement flood").

---

### The Universal Trust Layer (UTL)

You must implement these components across *every* insight card in the app.

#### 1. The "Insight Header" (Metadata)
*   **Confidence Badge:** `[High Confidence (92%)]` or `[Estimate/General]`.
*   **Freshness Label:** `Updated 2h ago` or `Based on 2024 Energy Rates`.
*   **Source Attribution:** `Source: Carrier Model 58 Manual` or `Source: Zillow API`.

#### 2. The "Why This Matters" Block
*   A 2-sentence explanation in human language.
*   *Example:* "We're recommending this filter change because your local air quality index is 'Poor' and your unit hasn't been serviced in 6 months."

#### 4. The "ROI & Risk" Labels
*   **Expected Upside:** `Est. Savings: $45/mo`.
*   **Downside of Ignoring:** `Risk: 15% shorter HVAC lifespan / Potential $2k repair`.

#### 5. The "Human Logic" Rewrite System
*   **Before (Robotic):** "Maintenance frequency exceeded. Inspect evaporator coils."
*   **After (Premium):** "Your AC is working harder than it needs to. A 10-minute coil cleaning now will keep your house cooler this summer and lower your bill."

---

### Top Trust Issues to Fix Before Launch

| Rank | Issue | Impact | Fix |
| :--- | :--- | :--- | :--- |
| **1** | **Black Box AI Tasks** | **High** | Add "Based on [Appliance Model]" labels to every task. |
| **2** | **Opaque Health Score** | **High** | Add a "How we calculated this" breakdown popup. |
| **3** | **Unverified Data** | Medium | Distinguish between "User Verified" data and "AI Estimated" data. |
| **4** | **Missing Citations** | Medium | Link to manufacturer PDFs or Manuals in the Vault. |
| **5** | **Binary Risk Levels** | Low | Replace "Low/Med/High" with "Impact: [Financial Cost of Failure]." |

**Verdict:** Currently, CtC feels like an "Information Dump." To be a "Premium Companion," it must become a **"Verified Advisor."** Every time the app speaks, it must show its work. If a user can't verify the source of an insight in 2 clicks, they will eventually stop trusting the platform entirely.
