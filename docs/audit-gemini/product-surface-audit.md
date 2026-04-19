# SECTION 1 — Product Surface Audit: The Engine-to-Outcome Mapping

> Canonical reference: [Audit Canonical Contract (v3)](./canonical-audit-contract-v3.md).

**Auditor Note:** ContractToCozy's primary strength is the **Depth of its Engines.** We are no longer treating these as "Tools" that users browse in a catalog. Instead, we map them as engine clusters that power the **6 Primary Jobs**.

---

### GROUP 1: PROTECT MY HOME (Defensive Engine Cluster)

These engines work together to prevent catastrophic home failure and ensure coverage.

| Route / Engine | Current State | Outcome Produced | Launch Strategy |
| :--- | :--- | :--- | :--- |
| `maintenance` | Partial | "Your filter needs changing." | **Embed:** Surface via the Action Center. |
| `checklist` | Partial | "Seasonal prep complete." | **Embed:** Surface via the Action Center. |
| `seasonal` | Partial | "Home winterized." | **Embed:** Surface via the Action Center. |
| `risk-radar` | Weak | "Detected 2 risks." | **Embed:** Surface as high-priority alerts. |
| `insurance` | Partial | "Policy stored & audited." | **Embed:** Surface in the Protection Vault. |
| `warranties` | Partial | "1 active warranty found." | **Embed:** Surface in the Protection Vault. |
| `coverage-intel` | Weak | "Detected $5k coverage gap." | **Embed:** Surface as high-priority alert. |

---

### GROUP 2: SAVE MONEY (Financial Engine Cluster)

These engines optimize the user's equity and reduce recurring expenses.

| Route / Engine | Current State | Outcome Produced | Launch Strategy |
| :--- | :--- | :--- | :--- |
| `savings` | Partial | "$400 saved on insurance." | **Embed:** Surface in the Savings Dashboard. |
| `home-savings` | Partial | "$120 saved on energy." | **Embed:** Surface in the Savings Dashboard. |
| `tax-appeal` | Prototype | "$250 saved on taxes." | **Contextual:** Only show during tax season. |
| `energy` | Partial | "Energy usage optimized." | **Embed:** Surface via Savings/Risk feeds. |
| `appreciation` | Partial | "Equity growth tracked." | **Embed:** Surface on Home Dashboard. |
| `budget` | Partial | "Maintenance fund tracked." | **Embed:** Surface in Financial Dashboard. |
| `do-nothing` | Prototype | "Visualized $10k risk." | **Contextual:** Use to upsell maintenance. |

---

### GROUP 3: FIX PROBLEMS (Resolution Engine Cluster)

These engines bridge the gap between "Problem Identified" and "Problem Solved."

| Route / Engine | Current State | Outcome Produced | Launch Strategy |
| :--- | :--- | :--- | :--- |
| `replace-repair` | Partial | "Item replaced." | **Embed:** Part of the Resolution Flow. |
| `emergency` | Partial | "Help requested." | **Surface:** Always visible as a "Rescue" button. |
| `providers` | Partial | "Pros found." | **Embed:** Part of the Booking Flow. |
| `bookings` | Partial | "Repair scheduled." | **Embed:** Part of the Booking Flow. |
| `visual-inspector`| Prototype | "Problem identified via photo."| **Contextual:** Tool inside the "Memory" flow. |
| `oracle` | Prototype | "Answered home question." | **Embed:** Contextual "Ask AI" in any job. |

---

### GROUP 4: MY HOME MEMORY (Intelligence Engine Cluster)

These engines build the "Black Box" Digital Twin of the home.

| Route / Engine | Current State | Outcome Produced | Launch Strategy |
| :--- | :--- | :--- | :--- |
| `inventory` | Partial | "Assets logged." | **Surface:** Core Vault functionality. |
| `documents` | Strong | "Records secured." | **Surface:** Core Vault functionality. |
| `rooms` | Strong | "Spatial twin built." | **Surface:** Core Vault functionality. |
| `vault` | Strong | "Home records locked." | **Primary Nav:** The "Black Box" hub. |
| `inspection-report`| Partial | "Historical health saved." | **Embed:** Part of the Memory/Vault flow. |

---

### Audit Summary & Verdict

#### 1. Strongest Existing Assets
*   **Deep Engine Moat:** You have the logic to handle everything from tax appeals to room scans.
*   **Black Box Hub:** The Vault/Memory architecture is robust and premium.

#### 2. Biggest Duplicates (Now Unified)
*   The **"Work" Engines** $\rightarrow$ Unified "Protect My Home" Surface.
*   The **"Financial" Engines** $\rightarrow$ Unified "Save Money" Surface.
*   The **"Resolution" Engines** $\rightarrow$ Unified "Fix Problems" Surface.
*   These clusters now resolve into the canonical **6-Job navigation model** (Today, My Home, Protect, Save, Fix, Vault).

#### 3. Strategic Decision: CURATE, DON'T REDUCE
Do not delete the `do-nothing-simulator`. Instead, move it from being a "Sidebar Tool" to being a "Card" that appears when a user neglects a high-priority maintenance task. **Make your depth contextual, not navigational.**
