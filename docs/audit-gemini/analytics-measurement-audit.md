# SECTION 9 — Analytics & Measurement Audit: ContractToCozy (CtC)

**Auditor Note:** You have no users yet. You don't need a complex data warehouse. You need a **High-Signal Feedback Loop.** You need to know exactly where the first 1,000 users "trip" and why they don't come back. Your primary goal with analytics is to validate your **Activation Wedge** and identify **Feature Friction.**

---

### Pre-Launch Event Tracking Model (The "Essential 20")

| Category | Event Name | Properties to Track |
| :--- | :--- | :--- |
| **Acquisition** | `landing_page_viewed` | Source (Google/FB/Direct), Device Type |
| | `hero_cta_clicked` | Button text, Section name |
| **Onboarding** | `signup_started` | Method (Google/Email) |
| | `signup_completed` | Time-to-complete |
| | `property_claimed` | Zip code, Home age, Source (API vs Manual) |
| **Activation** | `dashboard_first_view` | - |
| | `tool_opened` | Tool ID (e.g., `inventory`), Entry point |
| | `first_wow_moment` | Insight ID (The specific AI insight shown) |
| | `document_uploaded` | Type (Photo/PDF), Size, Success/Fail |
| **Retention** | `task_completed` | Priority, Category |
| | `return_visit` | Session count, Days since last visit |
| | `notification_clicked` | Channel (Push/Email), Campaign ID |
| **Monetization** | `provider_searched` | Category, Location |
| | `booking_initiated` | Provider ID |
| **Trust** | `trust_info_clicked` | Insight ID (User clicked "Why am I seeing this?") |
| **Errors** | `api_error_encountered` | Endpoint, Status Code, Message |

---

### The Launch North-Star Metric

> **"Prop-Active User" (PAU):** A user who adds at least 1 property and completes 1 "Action Center" task within their first 7 days.

---

### Key Metric Categories

#### 1. Activation Metrics (The "Aha!" Moment)
*   **TTFV (Time to First Value):** Seconds from signup to first AI-driven home insight.
*   **Claim-to-Action Rate:** % of users who add a property and check off at least one maintenance task in session 1.

#### 2. Retention Metrics (The "Stickiness")
*   **D7 Retention:** % of users who return on Day 7+.
*   **Vault Growth:** Average number of documents/appliances added per user in Month 1.

#### 3. Product Health Metrics (The "Reliability")
*   **AI Success Rate:** % of document uploads that successfully extract data vs. require manual correction.
*   **Dashboard Latency:** p95 time to load the main property health score.

---

### The "Founder's Dashboard" (One Screen)

1.  **Total Properties Claimed** (Cumulative growth).
2.  **Conversion Funnel:** Landing -> Address Lookup -> Signup -> First Action.
3.  **Top 5 Tools Used:** Which of the 40+ routes are actually getting traffic?
4.  **Action Completion Rate:** Are users actually doing what we suggest?
5.  **Daily Active / Weekly Active Ratio:** Is the app a utility or a one-time toy?

---

### Analytics Mistakes to Avoid

1.  **Tracking Everything:** Don't track every button hover. You'll drown in noise. Focus on **State Changes** (Signups, Saves, Deletes).
2.  **Ignoring Errors:** If a user clicks "Add Property" and it fails, you must know *immediately*. Error tracking is your most important pre-launch "analytics."
3.  **Broken Funnels:** Ensure you use a persistent `anonymousId` so you can connect a landing page visitor to a signed-up user.
4.  **No Naming Convention:** Use `object_action` (e.g., `property_added`) rather than inconsistent names like `ClickedSave` and `addedHome`.

**Verdict:** Currently, you are "flying blind." You have 40+ routes but no way to know if anyone is using them. Before you spend $1 on marketing, you must instrument the **Activation Funnel** and the **Trust Interaction**. If people are clicking "Why this matters," your Trust Layer is working. If they aren't, they are either ignoring you or they already left.
