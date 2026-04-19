# ContractToCozy (CtC) Strategic Product Audit — v2

**Date:** April 18, 2026
**Version:** 2 (supersedes v1 of same date)
**Changes from v1:** Sourced value scores, expanded competitive analysis, tightened phase definitions, added missing "Double Down" features to roadmap, corrected retention priority ordering, added data integration groundwork to Phase 1.
**Audit posture:** Brutally honest, execution-first, acquirer-grade

---

## Executive Read First

CtC is **not a toy**. It has unusual depth, serious backend architecture, and strong early foundations for a defensible home-operations data moat.

CtC is also **not yet a premium category product**. Right now it behaves like a high-potential feature lattice with uneven coherence, inconsistent trust UX, and too many duplicated surfaces.

### Hard facts observed in codebase

- **124 frontend page routes**
- **83 backend route files**
- **223 Prisma models**
- **~40 user-facing decision routes** (excluding admin, worker, and developer surfaces)
- **~14 duplicate route pairs** (same job, global + property-scoped entrypoint)

> Note: The 124-route figure includes internal admin and developer surfaces (`/dashboard/worker-jobs`, `/dashboard/analytics-admin`, `/dashboard/knowledge-admin`). The meaningful duplication problem is concentrated in the ~40 user-facing decision routes, not the full inventory.

### Headline verdict

- **Opportunity:** Real and large
- **Current state:** Powerful but fragmented platform
- **Main blocker:** Product coherence and end-to-end resolution depth
- **Winning move:** Consolidate around homeowner outcomes, not tool inventory

---

## Section 1 — Product Surface Audit

### 1.1 Feature Inventory (Route/Module Level)

> Scope note: Internal admin, worker job, and developer surfaces are excluded from strategic scoring. They are kept as-is unless operational requirements change.


| Route/Module                                                    | Feature                    | User Problem Solved             | Core Functionality                     | Status    | Strategic Importance | Keep/Improve/Merge/Remove          |
| --------------------------------------------------------------- | -------------------------- | ------------------------------- | -------------------------------------- | --------- | -------------------- | ---------------------------------- |
| `/`                                                             | Marketing Entry            | Understand value and start      | Landing + preview gate wrapper         | Hidden    | Critical             | **Improve immediately**            |
| `(auth)/login` `(auth)/signup`                                  | Auth                       | Access product                  | Email/password auth, social stub       | Partial   | Critical             | Improve                            |
| `/dashboard`                                                    | Dashboard Home             | See what matters now            | KPI/cards/actions surface              | Partial   | Critical             | Redesign                           |
| `/dashboard/actions`                                            | Action Center              | Next best actions               | Orchestration, snooze, complete, trace | Strong    | Critical             | Keep + polish                      |
| `/dashboard/properties`                                         | Properties List            | Manage homes                    | List/create/select properties          | Strong    | High                 | Keep                               |
| `/dashboard/properties/[id]`                                    | Property Workspace         | Operate one home                | Summary + tool navigation              | Partial   | Critical             | Redesign                           |
| `/dashboard/properties/[id]/home-score`                         | Home Score                 | Understand health/risk          | Score + breakdown                      | Partial   | High                 | **Improve**                        |
| `/dashboard/properties/[id]/status-board`                       | Status Board               | Operational pulse               | Health/risk/maintenance board          | Strong    | High                 | Keep                               |
| `/dashboard/properties/[id]/timeline`                           | Home Timeline              | Memory of lifecycle             | Events/history timeline                | Partial   | High                 | **Improve**                        |
| `/dashboard/properties/[id]/reports`                            | Reports                    | Share and review outcomes       | Report generation/share links          | Partial   | High                 | Improve                            |
| `/dashboard/properties/[id]/inventory`                          | Inventory Hub              | Know what you own               | Items, value, metadata                 | Strong    | Critical             | Keep                               |
| `/dashboard/properties/[id]/inventory/rooms`                    | Inventory Rooms            | Room-level context              | Room list + item grouping              | Strong    | High                 | Keep                               |
| `/dashboard/properties/[id]/rooms`                              | Rooms (parallel surface)   | Room management                 | Room list/detail routes                | Partial   | Medium               | **Merge with inventory rooms**     |
| `/dashboard/warranties`                                         | Warranties                 | Avoid coverage lapses           | Warranty CRUD/tracking                 | Partial   | High                 | Improve                            |
| `/dashboard/insurance`                                          | Insurance Hub              | Manage policy/claims context    | Insurance views + links                | Partial   | Critical             | Improve                            |
| `/dashboard/documents`                                          | Document Vault             | Store critical docs             | Upload, retrieval, analysis hooks      | Strong    | Critical             | Keep                               |
| `/vault/[propertyId]`                                           | Property Vault Share       | Centralized records by property | Vault view by property                 | Strong    | High                 | Keep                               |
| `/dashboard/maintenance`                                        | Maintenance                | Prevent failures                | Task lifecycle + templates             | Strong    | Critical             | Keep                               |
| `/dashboard/seasonal`                                           | Seasonal Tasks             | Seasonal readiness              | Seasonal checklist flows               | Strong    | High                 | Keep                               |
| `/dashboard/maintenance-setup`                                  | Maintenance Setup          | Configure recurring care        | Preferences/templates                  | Partial   | Medium               | Improve                            |
| `/dashboard/properties/[id]/incidents`                          | Incident Ops               | Handle home incidents           | Incident log/actions                   | Strong    | Critical             | Keep                               |
| `/dashboard/properties/[id]/claims`                             | Claims Ops                 | Resolve insurance claims        | Claim workflows/details                | Strong    | Critical             | Keep                               |
| `/dashboard/providers`                                          | Provider Discovery         | Find trusted service providers  | Search/list/filter/providers           | Partial   | Critical             | **Improve — trust UX gap**         |
| `/dashboard/providers/[id]/book`                                | Booking Flow               | Schedule service                | Provider booking journey               | Partial   | Critical             | **Improve — conversion/trust gap** |
| `/providers/(dashboard)/`*                                      | Provider OS                | Operate provider workflow       | Services/calendar/bookings/profile     | Partial   | High                 | Improve                            |
| `/knowledge`                                                    | Knowledge Hub              | Learn and decide                | Article browsing/reading               | Partial   | Medium               | Improve                            |
| `/dashboard/notifications`                                      | Notifications              | Stay informed                   | In-app notifications                   | Partial   | High                 | Improve                            |
| `/dashboard/home-tools`                                         | Home Tools Catalog         | Discover tools                  | Tool launcher catalog                  | Duplicate | High                 | **Merge**                          |
| `/dashboard/ai-tools`                                           | AI Tools Catalog           | Discover AI tools               | Tool launcher catalog                  | Duplicate | High                 | **Merge**                          |
| `/dashboard/properties/[id]/tools/guidance-overview`            | Guidance Engine            | Turn issue into plan            | Journey orchestration + step logic     | Strong    | Critical             | Double down                        |
| `/dashboard/properties/[id]/tools/service-price-radar`          | Service Price Radar        | Is quote fair                   | Benchmark verdict + confidence         | Strong    | Critical             | Double down                        |
| `/dashboard/properties/[id]/tools/negotiation-shield`           | Negotiation Shield         | Improve deal terms              | Leverage analysis + draft responses    | Strong    | High                 | Improve action handoff             |
| `/dashboard/properties/[id]/tools/quote-comparison`             | Quote Comparison           | Compare quotes                  | Placeholder routing surface            | Weak      | High                 | **Merge/remove standalone**        |
| `/dashboard/properties/[id]/tools/price-finalization`           | Price Finalization         | Record accepted terms           | Final decision capture                 | Partial   | High                 | Improve + connect                  |
| `/dashboard/properties/[id]/tools/coverage-intelligence`        | Coverage Intelligence      | Find coverage gaps              | Coverage analysis + signals            | Partial   | Critical             | Improve                            |
| `/dashboard/coverage-intelligence`                              | Global Coverage Route      | Same problem as above           | Duplicate entrypoint                   | Duplicate | High                 | **Merge**                          |
| `/dashboard/properties/[id]/tools/coverage-options`             | Coverage Options           | Explore plan choices            | Wrapper-like UX                        | Weak      | High                 | Rebuild or merge                   |
| `/dashboard/properties/[id]/tools/risk-premium-optimizer`       | Risk-to-Premium            | Lower premium risk              | Risk-premium optimization              | Partial   | High                 | Improve                            |
| `/dashboard/risk-premium-optimizer`                             | Global Risk-Premium Route  | Same problem as above           | Duplicate entrypoint                   | Duplicate | High                 | **Merge**                          |
| `/dashboard/properties/[id]/tools/do-nothing`                   | Do Nothing Simulator       | Cost of inaction                | Simulation run + outputs               | Partial   | High                 | Merge naming/flow                  |
| `/dashboard/do-nothing-simulator`                               | Global Do-Nothing Route    | Same job as above               | Duplicate entrypoint                   | Duplicate | High                 | **Merge**                          |
| `/dashboard/properties/[id]/tools/home-savings`                 | Home Savings Check         | Find immediate savings          | Savings opportunities                  | Partial   | Critical             | Improve                            |
| `/dashboard/home-savings`                                       | Global Home Savings        | Same job as above               | Duplicate entrypoint                   | Duplicate | High                 | **Merge**                          |
| `/dashboard/properties/[id]/tools/insurance-trend`              | Insurance Trend            | Premium trend awareness         | Heuristic trend projection             | Weak      | High                 | Rework                             |
| `/dashboard/properties/[id]/tools/property-tax`                 | Property Tax               | Tax burden insight              | Heuristic estimate model               | Weak      | High                 | Rebuild                            |
| `/dashboard/properties/[id]/tools/cost-growth`                  | Cost Growth                | Long-term cost projection       | 5/10-year forecast                     | Partial   | High                 | Improve                            |
| `/dashboard/properties/[id]/tools/cost-volatility`              | Cost Volatility            | Budget uncertainty              | Volatility scenarioing                 | Partial   | Medium               | Improve                            |
| `/dashboard/properties/[id]/tools/true-cost`                    | True Cost                  | Ownership economics             | Cost composition model                 | Partial   | Critical             | Improve                            |
| `/dashboard/properties/[id]/tools/break-even`                   | Break-Even                 | Financial threshold decisions   | Break-even calculations                | Partial   | Medium               | Improve                            |
| `/dashboard/properties/[id]/tools/capital-timeline`             | Home Capital Timeline      | Plan major spends               | Capex timeline projections             | Partial   | High                 | Improve                            |
| `/dashboard/properties/[id]/tools/sell-hold-rent`               | Sell/Hold/Rent             | Strategy decision               | Scenario comparison                    | Partial   | High                 | Improve                            |
| `/dashboard/home-event-radar`                                   | Home Event Radar           | External risk awareness         | Event signal matching                  | Partial   | High                 | Improve                            |
| `/dashboard/properties/[id]/tools/home-event-radar`             | Property wrapper to global | Same as above                   | Redirect wrapper                       | Duplicate | Medium               | Merge                              |
| `/dashboard/properties/[id]/tools/home-risk-replay`             | Home Risk Replay           | Learn from past events          | Historical risk replay engine          | Strong    | Medium               | Keep                               |
| `/dashboard/properties/[id]/tools/hidden-asset-finder`          | Hidden Asset Finder        | Find missed savings/benefits    | Program match + opportunities          | Strong    | Critical             | **Double down**                    |
| `/dashboard/properties/[id]/tools/home-digital-twin`            | Home Digital Twin          | Model system impacts            | Twin snapshots/scenarios               | Partial   | Medium               | Focus/trim                         |
| `/dashboard/properties/[id]/tools/home-digital-will`            | Home Digital Will          | Home continuity memory          | Home will sections/contacts            | Strong    | Medium               | Keep                               |
| `/dashboard/properties/[id]/tools/neighborhood-change-radar`    | Neighborhood Radar         | External neighborhood changes   | Signal ingestion and impact            | Partial   | Medium               | Improve                            |
| `/dashboard/properties/[id]/tools/mortgage-refinance-radar`     | Refinance Radar            | Lower financing costs           | Rate ingestion + opportunity scoring   | Strong    | Critical             | Double down                        |
| `/dashboard/properties/[id]/tools/home-gazette`                 | Home Gazette               | Digest insights                 | Weekly editorial intelligence          | Strong    | High                 | Keep + improve actionability       |
| `/dashboard/properties/[id]/tools/home-habit-coach`             | Habit Coach                | Build preventive behaviors      | Habit generation/actions               | Strong    | High                 | Keep                               |
| `/dashboard/home-renovation-risk-advisor`                       | Renovation Advisor         | Reduce compliance/permit risk   | Multi-domain renovation guidance       | Partial   | High                 | Improve                            |
| `/dashboard/properties/[id]/tools/home-renovation-risk-advisor` | Property wrapper to global | Same as above                   | Redirect wrapper                       | Duplicate | Medium               | Merge                              |
| `/dashboard/properties/[id]/tools/plant-advisor`                | Plant Advisor              | Plant care + seller integration | Plant recommendations + future CTA     | Partial   | Low → Future         | Keep — plant seller CTA planned    |
| `/dashboard/emergency`                                          | Emergency Help             | Urgent guidance                 | Emergency assistant surface            | Partial   | High                 | Improve trust + escalation         |
| `/dashboard/oracle`                                             | Appliance Oracle           | Appliance diagnostics guidance  | AI-backed troubleshooting              | Partial   | Medium               | Improve                            |
| `/dashboard/climate`                                            | Climate Risk               | Climate impact awareness        | Climate risk outputs                   | Partial   | Medium               | Improve                            |
| `/dashboard/energy`                                             | Energy Audit               | Reduce utility waste            | Energy recommendations                 | Partial   | Medium               | Improve                            |
| `/dashboard/tax-appeal`                                         | Tax Appeal                 | Reduce tax via appeal           | Appeal guidance content flow           | Partial   | Medium               | Improve                            |


### 1.2 Surface-Level Diagnosis

- CtC has **high breadth but low consolidation**.
- The same job often appears as:
  - a global route,
  - a property-scoped route,
  - a tool-catalog card,
  - and a guidance step.
- This creates cognitive and technical duplication in ~14 identified route pairs.
- Admin and developer surfaces (`/dashboard/worker-jobs`, `/dashboard/analytics-admin`, `/dashboard/knowledge-admin`) are correctly scoped and are not part of the consolidation problem.

---

## Section 2 — User Value Audit

### 2.1 Value Tiers

> v1 used ungrounded 1–10 scores. This version uses sourced tiers: **Tier 1** (users will pay, high engagement potential), **Tier 2** (strong complement, moderate engagement), **Tier 3** (situational, infrequent, or currently unproven). Scores within tiers are founder estimates pending instrumentation baseline.


| Feature                         | Saves Money | Saves Time | Reduces Stress | Prevents Mistakes | Helps Decisions | Emotional Value | Frequency | Tier  | User Will Pay?            |
| ------------------------------- | ----------- | ---------- | -------------- | ----------------- | --------------- | --------------- | --------- | ----- | ------------------------- |
| Guidance Engine                 | ●           | ●          | ●              | ●                 | ●               | ○               | High      | **1** | Yes                       |
| Action Center                   | ○           | ●          | ●              | ●                 | ●               | ○               | High      | **1** | Yes                       |
| Service Price Radar             | ●           | ○          | ○              | ●                 | ●               | ○               | Medium    | **1** | Yes                       |
| Negotiation Shield              | ●           | ○          | ○              | ○                 | ●               | ○               | Medium    | **1** | Yes                       |
| Refinance Radar                 | ●           | ●          | ●              | ●                 | ●               | ○               | Low-Med   | **1** | Yes                       |
| Hidden Asset Finder             | ●           | ○          | ○              | ●                 | ●               | ○               | Medium    | **1** | Yes                       |
| Coverage Intelligence           | ●           | ○          | ●              | ●                 | ●               | ○               | Low-Med   | **1** | Yes                       |
| Incidents + Claims              | ●           | ●          | ●              | ●                 | ●               | ●               | Event     | **1** | Yes                       |
| Maintenance + Seasonal + Habits | ○           | ●          | ●              | ●                 | ○               | ○               | High      | **1** | Yes                       |
| Morning Pulse / Daily Brief     | ○           | ●          | ●              | ○                 | ○               | ○               | Daily     | **1** | Yes (anchor)              |
| Inventory + Rooms               | ○           | ○          | ○              | ●                 | ○               | ●               | Medium    | **2** | Yes (foundation)          |
| Document Vault                  | ○           | ●          | ●              | ●                 | ○               | ○               | Medium    | **2** | Yes                       |
| Provider Discovery + Booking    | ●           | ●          | ●              | ○                 | ●               | ○               | Medium    | **2** | Yes                       |
| Home Score                      | ○           | ○          | ○              | ●                 | ●               | ●               | Monthly   | **2** | Maybe                     |
| Home Timeline                   | ○           | ○          | ○              | ○                 | ●               | ●               | Monthly   | **2** | Maybe                     |
| Home Gazette                    | ○           | ○          | ○              | ○                 | ○               | ●               | Weekly    | **2** | Maybe                     |
| True Cost / Cost Growth         | ●           | ○          | ○              | ○                 | ●               | ○               | Quarterly | **2** | Maybe (if trust improved) |
| Home Risk Replay                | ○           | ○          | ○              | ○                 | ○               | ○               | Rare      | **3** | Mostly no                 |
| Home Digital Twin               | ○           | ○          | ○              | ○                 | ○               | ○               | Rare      | **3** | Mostly no                 |
| Property Tax (current form)     | ○           | ○          | ○              | ○                 | ○               | ○               | Rare      | **3** | No                        |
| Insurance Trend (current form)  | ○           | ○          | ○              | ○                 | ○               | ○               | Rare      | **3** | No                        |
| Quote Comparison (placeholder)  | ○           | ○          | ○              | ○                 | ○               | ○               | —         | **3** | No                        |
| Plant Advisor                   | ○           | ○          | ○              | ○                 | ○               | ○               | Rare      | **3** | Future — plant seller CTA |


> ● = strong contribution, ○ = weak/no contribution

### 2.2 Honest segmentation

**Tier 1 — Users will pay:**
Money-saving decision engines with proof, coverage and refinance decisions with clear upside, incident/claims execution support, the daily brief as habit anchor.

**Tier 2 — Strong complements, not standalone paid drivers:**
Inventory, vault, provider booking, home score, timeline, gazette. These deepen retention and data moat but are not primary purchase motivators.

**Tier 3 — Likely ignored or abandoned:**
Placeholder flows, heuristic-heavy modules presented as high-confidence intelligence, standalone historical tools without execution paths.

---

## Section 3 — UX / Premium Quality Audit

### 3.1 Product-level premium quality verdict

Current CtC quality is **"powerful but patchwork"**.

Major issues:

- Overgrown navigation and weak mental model
- Duplicated entry points for same job
- Inconsistent trust and explainability treatment
- Mobile shell conflicts (fixed layers and density)
- Visible "coming soon" and unfinished artifacts in user-facing flow
- Provider booking lacks trust metadata needed for conversion

### 3.2 Route quality scoring


| Route Group                 | Visual Hierarchy | Clarity | Modern Feel | Mobile Quality | Trust Signals | Consistency | Verdict                                 |
| --------------------------- | ---------------- | ------- | ----------- | -------------- | ------------- | ----------- | --------------------------------------- |
| Dashboard Home              | 4                | 5       | 5           | 5              | 5             | 4           | Full redesign                           |
| Property Workspace          | 4                | 5       | 5           | 5              | 5             | 4           | Full redesign                           |
| Actions Center              | 7                | 7       | 6           | 7              | 7             | 6           | Polish only                             |
| Guidance Overview           | 7                | 7       | 6           | 7              | 8             | 6           | Strong, polish                          |
| Inventory System            | 6                | 6       | 6           | 6              | 7             | 5           | Improve                                 |
| Incident/Claims             | 7                | 7       | 6           | 6              | 8             | 6           | Improve                                 |
| Pricing & Negotiation Tools | 6                | 6       | 6           | 6              | 6             | 5           | Merge + simplify                        |
| Insurance/Cost Tool Family  | 5                | 5       | 5           | 5              | 4             | 5           | Rework                                  |
| Provider + Booking          | 6                | 6       | 6           | 6              | 5             | 5           | **Improve trust metadata + conversion** |
| Auth + Public Entry         | 5                | 6       | 5           | 6              | 4             | 4           | Significant polish required             |
| Home Score + Timeline       | 5                | 6       | 5           | 5              | 5             | 5           | Improve                                 |


### 3.3 Top 20 UX upgrades needed

1. Remove preview wall as default on `/`.
2. Remove all customer-facing "coming soon" markers.
3. Collapse duplicated global/property tool routes.
4. Replace tool-catalog IA with outcome-based IA.
5. One primary CTA per viewport.
6. Mandatory trust card for recommendation routes.
7. Standardize confidence/freshness/source labels.
8. Add persistent property context in app shell.
9. Simplify dashboard to prioritized decision feed.
10. Reduce card sprawl and competing actions.
11. Resolve mobile fixed-layer collisions.
12. Unify token system and visual language.
13. Replace raw controls with shared UI primitives.
14. Standardize empty/loading/error states.
15. Convert quote workflows into one guided flow.
16. Convert insurance workflows into one guided flow.
17. Add explicit completion and "outcome receipts."
18. Normalize terminology to homeowner language.
19. **Improve provider trust metadata: reviews, completion rate, response time, license status in booking UX.**
20. Add "what changed since last visit" in key routes.

---

## Section 4 — Data Moat Audit

### 4.1 Feature-level defensibility


| Feature               | Inputs Used                          | Outputs Generated           | Behavioral Signals Captured     | Feedback Loops              | Proprietary Data Generated          | Learning Potential | Benchmark Potential | Defensibility |
| --------------------- | ------------------------------------ | --------------------------- | ------------------------------- | --------------------------- | ----------------------------------- | ------------------ | ------------------- | ------------- |
| Guidance Journeys     | Property + asset + signal + issue    | Ordered next steps          | Start/skip/block/complete       | Journey completion tuning   | Resolution graph by issue/home type | High               | High                | 9             |
| Action Center         | Tasks + risk + suppression           | Prioritized actions         | CTA/snooze/complete             | Ranking optimization        | Action efficacy dataset             | High               | High                | 8             |
| Inventory Graph       | User data + scans                    | Structured home inventory   | Add/edit/verification cadence   | Better recommendations      | Home asset baseline graph           | High               | High                | 8             |
| Price Radar           | Quote + service + location + context | Fairness verdict            | Check frequency + outcomes      | Benchmark calibration       | Quote distribution map              | High               | High                | 9             |
| Price Finalization    | Accepted terms                       | Final record of decision    | Accept/override behavior        | Close loop on quote quality | Ground-truth accepted pricing       | Very High          | Very High           | 10            |
| Claims/Incidents      | Policy + event + home data           | Incident state/actions      | Escalation and closure behavior | Risk/action tuning          | Loss + response patterns            | High               | High                | 8             |
| Daily Pulse/Habits    | Tasks + weather + score deltas       | Brief + micro-action        | Open/streak/complete patterns   | Personalization loop        | Habit adherence dataset             | High               | Medium              | 7             |
| Risk Radar/Replay     | External events + property profile   | Risk relevance/ranking      | View/action response            | Match quality tuning        | Event impact by home profile        | Medium             | High                | 7             |
| Refinance Radar       | Market rates + property finance      | Opportunity score/scenarios | Scenario interactions           | Opportunity model tuning    | Refi propensity data                | High               | High                | 8             |
| Hidden Asset Finder   | Property profile + program data      | Matched savings programs    | Claim/dismiss/action patterns   | Program relevance tuning    | Savings match efficacy dataset      | High               | High                | 8             |
| Home Score + Timeline | All home signals                     | Score + history record      | Score check + event add cadence | Signal weight tuning        | Home condition baseline             | Medium             | High                | 7             |
| Analytics Pipeline    | Product telemetry                    | Rollups/cohorts/funnels     | Full funnel events              | Product optimization        | Cross-feature behavior graph        | High               | High                | 8             |
| Provider/Booking      | Provider + intent + scheduling       | Match + booking outcomes    | Conversion/no-show/repeat usage | Ranking and trust loops     | Marketplace quality graph           | Very High          | Very High           | 9             |


### 4.2 Strategic moat answer

CtC's moat is not "AI output."
CtC's moat is the **decision-to-outcome loop** at property level.

The second-order moat is **ground-truth pricing data** from accepted quotes (Price Finalization) and **provider quality outcomes** from completed bookings. No competitor has this at property resolution.

### 4.3 Missing data to become dominant

- Real invoice/receipt ingestion at scale
- Policy document normalization and real quote data
- Utility bill integrations
- Assessor/permit/violation feeds with freshness SLAs
- Provider quality outcomes (on-time, rework, warranty honor)

### 4.4 Highest leverage integrations (prioritized)

1. County assessor + permit + code events — enables Home Score accuracy, tax appeal, renovation compliance
2. Insurance quote + policy ingestion ecosystem — enables Coverage Intelligence and Insurance Trend credibility
3. Mortgage data + refinance execution rails — enables Refinance Radar to close the loop (requires partner)
4. Utility and energy usage feed — enables Energy Audit and Cost Growth accuracy
5. Provider operations signals (completion proof and quality) — enables marketplace trust and benchmark moat

> **Critical note:** Integrations 1–3 have external procurement timelines of 4–12 weeks. Groundwork must begin in Phase 1 (0–90 days), not Phase 2, or Phase 2 delivery will slip.

---

## Section 5 — Actionability Audit

### 5.1 Insight vs Action vs Resolution


| Feature                | Classification          | Where It Stops Today         | Required "Best" State                       |
| ---------------------- | ----------------------- | ---------------------------- | ------------------------------------------- |
| Insurance Trend        | Insight Only            | Shows trend only             | Compare carriers + switch support           |
| Property Tax           | Insight Only            | Estimate only                | Exemption + appeal workflow                 |
| Cost Growth/Volatility | Insight Only            | Projection without plan      | Budget + financing actions                  |
| Home Risk Replay       | Insight Only            | History only                 | Prevention plan + tasking                   |
| Coverage Intelligence  | Suggested Action        | Gap detected, weak closure   | Buy/update coverage with tracking           |
| Service Price Radar    | Suggested Action        | Verdict only                 | Negotiate/accept/requote path               |
| Negotiation Shield     | Suggested Action        | Advice but no execution rail | Send/track negotiation + finalize           |
| Quote Comparison       | Suggested Action (weak) | Placeholder redirection      | Real side-by-side compare + decision commit |
| Price Finalization     | Suggested Action        | Logs decision                | Trigger booking/payment/work order          |
| Hidden Asset Finder    | Suggested Action        | Match surfaced, weak closure | Program apply/track/confirm savings         |
| Guidance Engine        | Near Full Resolution    | Some branch-outs remain      | Complete issue-to-outcome closure           |
| Action Center          | Near Full Resolution    | Outcome proof inconsistent   | Verified outcome + savings receipt          |
| Claims/Incidents       | Partial Full Resolution | Limited partner handoff      | Claim concierge + vendor dispatch           |
| Refinance Radar        | Suggested Action        | Opportunity surfaced only    | Offer compare + lock + track flow           |
| Maintenance/Habits     | Suggested Action        | Closure proof weak           | Verified completion + reminders loop        |


### 5.2 Biggest actionability gaps

- Too many "go use another tool" endings
- Too few hard execution rails
- Hidden Asset Finder has a specific gap: matched programs with no guided apply or outcome tracking
- Not enough closed-loop outcome confirmation

---

## Section 6 — Retention Audit

### 6.1 Usage pull by feature class


| Feature                         | Daily Pull | Weekly Pull | Monthly Pull | One-Time | Retention Strength                    |
| ------------------------------- | ---------- | ----------- | ------------ | -------- | ------------------------------------- |
| Morning Pulse + Micro-Actions   | High       | High        | Medium       | Low      | **Critical anchor — must be Phase 1** |
| Action Center                   | Medium     | High        | High         | Low      | Strong                                |
| Maintenance + Seasonal + Habits | Medium     | High        | High         | Low      | Strong                                |
| Incident + Claims               | Low        | Medium      | Medium       | Medium   | Event-driven strong                   |
| Coverage + Insurance            | Low        | Medium      | High         | Medium   | Periodic                              |
| Refinance                       | Low        | Low         | Medium       | High     | Episodic high value                   |
| Inventory + Vault               | Low        | Medium      | Medium       | Medium   | Foundational                          |
| Pricing + Negotiation           | Low        | Medium      | Medium       | High     | Transactional                         |
| Hidden Asset Finder             | Low        | Medium      | Medium       | Medium   | Savings-driven                        |
| Home Score + Timeline           | Low        | Low         | Medium       | Medium   | Context-building                      |
| Home Gazette                    | Low        | Medium      | Medium       | Low      | Engagement-only                       |
| Replay + Twin                   | Low        | Low         | Low          | High     | Weak standalone                       |


### 6.2 Habit loop recommendations

- **Make morning brief the single daily anchor — this must be a Phase 1 deliverable, not Phase 3**
- Tie notifications to specific projected savings amounts (not generic alerts)
- Add monthly "home memory replay" summary tied to actual savings/actions completed
- Show "money saved to date" prominently and persistently
- Build Hidden Asset Finder into the weekly loop — new matched programs as a re-engagement trigger

---

## Section 7 — Monetization Audit

### 7.1 Feature monetization matrix


| Feature                          | Subscription Potential | Lead-Gen Potential | Marketplace Revenue | Affiliate Potential | B2B API Potential | Enterprise Potential |
| -------------------------------- | ---------------------- | ------------------ | ------------------- | ------------------- | ----------------- | -------------------- |
| Guidance + Action Center         | High                   | Medium             | High                | Low                 | Medium            | Medium               |
| Pricing/Negotiation/Finalization | High                   | High               | High                | Medium              | Medium            | Medium               |
| Coverage Intelligence/Options    | High                   | High               | Medium              | High                | Medium            | High                 |
| Refinance Radar                  | High                   | High               | High                | High                | Medium            | Medium               |
| Incident/Claims                  | High                   | Medium             | High                | Medium              | Medium            | High                 |
| Maintenance/Habit System         | High                   | Medium             | High                | Low                 | Low               | Medium               |
| Hidden Asset Finder              | High                   | Medium             | Medium              | High                | Medium            | Medium               |
| Inventory + Vault                | High                   | Low                | Low                 | Low                 | Medium            | High                 |
| Provider Marketplace             | Medium                 | High               | Very High           | Medium              | Medium            | Medium               |
| Home Score + Timeline            | Medium                 | Low                | Low                 | Low                 | High              | High                 |
| Buyer Reports                    | High                   | Medium             | Low                 | Medium              | High              | High                 |


### 7.2 Top 10 monetizable opportunities

1. Premium homeowner subscription anchored on verified savings.
2. Refinance marketplace conversion fees.
3. Service quote-to-book transaction capture.
4. Insurance switch/referral economics.
5. Claims concierge premium tier.
6. Hidden Asset Finder program placement / co-op economics.
7. Buyer due-diligence paid report package.
8. Annual home financial health review product.
9. Provider ranking/boost products tied to outcomes.
10. B2B benchmark API for lenders/insurers (using ground-truth accepted pricing data).

---

## Section 8 — Competitive Audit


| Competitor                                           | Where They Win                                       | Where CtC Wins                                       | CtC Weakness vs Them                                                                    |
| ---------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Zillow                                               | Distribution and consumer traffic                    | Post-purchase intelligence + action layer            | Weak top-of-funnel scale                                                                |
| Rocket Mortgage / Better                             | Mortgage conversion machine                          | Broader homeowner operating system vision            | Refinance execution depth; these players have rate lock and application rails CtC lacks |
| Rocket Money                                         | Habit and finance UX polish                          | Home-specific operational intelligence               | UX coherence/polish gap                                                                 |
| Thumbtack                                            | Service marketplace liquidity                        | Intelligence-driven service decisions                | Network liquidity uncertainty                                                           |
| ICE / ServiceMac (B2B servicers)                     | Embedded lender + servicer dashboards for homeowners | Consumer-grade UX and independent homeowner advocacy | If servicers ship homeowner OS features, they have captive distribution                 |
| Home maintenance apps (Thumbtack, Angi, HomeAdvisor) | Simplicity + contractor network                      | Depth of decisions and savings tools                 | Complexity/cognitive load                                                               |
| Insurance compare apps (Policygenius, Jerry)         | Quote-speed and carrier breadth                      | Home-context coverage reasoning                      | Integration maturity                                                                    |
| Google / AI assistants (Gemini, GPT)                 | Flexible chat, massive reach                         | Property memory + workflow orchestration             | Must improve product polish/trust consistency before AI-generics close the gap          |


### 8.1 Most underestimated competitive threat

**Embedded homeowner dashboards from lenders and servicers (Rocket, ICE, Better, servicer portals).** These players have captive homeowner relationships at the point of closing. If they add maintenance, coverage, and savings intelligence to their post-close dashboards, they have distribution CtC cannot easily replicate. CtC must establish strong brand loyalty and measurable savings proof before servicer-embedded tools mature.

### 8.2 Lane CtC can own uniquely

**"Homeowner Decision & Resolution OS"**

No mainstream competitor owns memory + intelligence + action + savings proof in one loop. The moat is the outcome graph: ground-truth pricing, completed resolutions, and provider quality — data that can only be generated by a product homeowners actually use to close decisions.

---

## Section 9 — Strategic Focus Audit

### 9.1 What is CtC today?

- More than a prototype
- Not yet a coherent premium product
- High-potential platform in progress

### 9.2 What should CtC become?

**Positioning statement:**

> ContractToCozy is the homeowner operating system that turns home signals into completed actions and measurable savings, with trusted memory of every decision.

---

## Section 10 — Kill / Keep / Double Down


| Bucket           | What belongs here                                                                                                                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Double Down**  | Guidance engine, Action Center, Maintenance/Habits, Morning Brief (daily anchor), Incidents/Claims, Service Price Radar, Refinance Radar, Hidden Asset Finder, Coverage Intelligence, Provider Booking (trust upgrade), Inventory + Document Vault |
| **Upgrade**      | Dashboard home, Property workspace, Home Score, Home Timeline, Coverage UX, Provider booking trust UX, Morning pulse UX, notification relevance                                                                                                    |
| **Merge**        | Duplicate global/property tool routes, Home/AI tool catalogs, pricing toolchain into one flow, insurance toolchain into one flow                                                                                                                   |
| **Kill / Pause** | Placeholder standalone routes, customer-visible "coming soon" artifacts, Home Digital Twin (trim scope). Plant Advisor stays — planned plant seller CTA integration.                                                                               |


---

## Section 11 — Priority Roadmap

### Phase 1 (0–90 days) — Highest ROI moves


| Theme                                    | Moves                                                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Product coherence                        | Remove preview gate default, remove placeholders, collapse duplicate routes                               |
| Premium UX baseline                      | Redesign `/dashboard` and `/dashboard/properties/[id]` around outcomes; improve Home Score and Timeline   |
| Trust contract                           | Mandatory confidence/freshness/source/rationale on recommendation pages                                   |
| Activation                               | Single clear "next action" architecture per major route                                                   |
| **Morning Brief (Phase 1, not Phase 3)** | Upgrade to actionable savings alerts and single primary CTA — this is the daily retention anchor          |
| **Provider trust upgrade**               | Add reviews, completion rate, response time, license status to booking UX                                 |
| **Hidden Asset Finder closure**          | Add guided apply flow and outcome tracking to matched programs                                            |
| **Data integration groundwork**          | Begin assessor feed, insurance quote API, and refinance partner procurement in Week 1 — not after Phase 1 |


### Phase 2 (3–6 months) — Retention + moat


| Theme                | Moves                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| Closed loop outcomes | Tie recommendations to verified completions and savings receipts                                       |
| Data quality         | Activate assessor/permit, utility, policy document and better quote feeds (groundwork done in Phase 1) |
| Habit retention      | Leverage improved morning brief, alerts, and monthly memory replay                                     |
| Marketplace fit      | Improve provider quality scoring and handoff completion                                                |
| Hidden Asset Finder  | Scale program database and co-op economics                                                             |


### Phase 3 (6–12 months) — Dominance moves


| Theme                      | Moves                                                           |
| -------------------------- | --------------------------------------------------------------- |
| Category product           | Launch "Homeowner Command Center" as default shell              |
| Monetization scale         | Introduce tiered paid plans + concierge + marketplace economics |
| Defensible intelligence    | Benchmark engine from real completion/outcome data              |
| Strategic expansion        | B2B API pilots for lenders/insurers and enterprise channels     |
| Competitive moat hardening | Publish savings and outcome proof as category trust signal      |


---

## Section 12 — Final Executive Summary

### Is CtC a serious opportunity?

Yes. Strongly yes.

### Biggest hidden strengths

- Deep journey and orchestration architecture
- Large structured domain model and telemetry surface
- Strong potential for proprietary outcome data moat via Price Finalization and Provider Booking
- Hidden Asset Finder is an underutilized, highly defensible wedge if closed loops are added

### Biggest risks

- Product coherence debt
- Route duplication and tool sprawl
- Heuristic outputs presented with insufficient trust framing
- Embedded servicer dashboards maturing before CtC establishes brand loyalty
- Morning Brief deprioritized in execution (it is the daily retention anchor, not a nice-to-have)

### What will block growth

- Adding more tools before consolidating current flows
- Keeping insight-only dead-ends without execution
- Leaving unfinished artifacts in customer experience
- Delaying data integration groundwork until Phase 2 (external timelines will slip Phase 2)
- Treating Morning Brief as a late-phase polish item

### What creates breakout success

- Repeated, provable homeowner savings from end-to-end resolution loops
- Unified premium UX around homeowner outcomes
- Closed-loop intelligence that improves with every completed action
- Ground-truth pricing and provider outcome data that no competitor can replicate

### What an acquirer would love

- Measurable decision-to-outcome graph
- High retention in core homeowner operations
- Ground-truth accepted pricing dataset (Price Finalization)
- Repeatable monetization through subscription + marketplace + data products

### Founder focus right now

1. Consolidate product surface into canonical flows.
2. Move Morning Brief upgrade to Phase 1 — it is the daily retention anchor.
3. Begin data integration partner procurement in Week 1 (external timelines are long).
4. Close Hidden Asset Finder loop (apply + outcome tracking).
5. Improve Provider Booking trust metadata — conversion depends on it.
6. Finish execution rails for pricing, coverage, and refinance.
7. Make trust/explainability a hard product contract.
8. Instrument and foreground "money saved" as north star.
9. Run a coherence-first quarter before adding new major modules.

---

## Appendix A — Brutal Truths (No Sugarcoating)

1. CtC has enough features to impress a demo audience and still lose the category.
2. The biggest risk is not competitor features. It is internal fragmentation.
3. A premium trust product cannot ship visible placeholders in critical user flow.
4. Users do not pay for dashboards. They pay for outcomes and reduced regret.
5. If Morning Brief is delayed to Phase 3, there is no daily retention hook for the first 6 months.
6. Hidden Asset Finder is one of the most defensible features CtC has — it is currently underdelivering because the loop is not closed.
7. Servicer-embedded homeowner tools are not a distant threat. They are a 12–18 month risk.
8. If CtC consolidates and closes loops, it can own a real category.

---

## Appendix B — v1 Audit Gaps Addressed in This Version


| Gap                                                 | How Addressed                                                              |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| Numeric value scores lacked sourcing                | Replaced with tier buckets and sourcing note                               |
| Competitive analysis missed servicer/lender threat  | Added ICE/ServiceMac and embedded dashboard risk                           |
| Morning Brief scheduled too late in execution       | Moved to Phase 1 in roadmap; flagged as daily retention anchor             |
| Provider/Booking trust upgrade missing from roadmap | Added to Double Down bucket and Phase 1                                    |
| Hidden Asset Finder missing from execution roadmap  | Added to Double Down bucket, Phase 1, and Phase 2                          |
| Home Score and Timeline absent from execution plan  | Added to Upgrade bucket and Phase 1                                        |
| Data integration groundwork absent                  | Added as explicit Phase 1 item with note on external procurement timelines |
| Phase 2/3 under-specified                           | Expanded detail and dependencies added                                     |


