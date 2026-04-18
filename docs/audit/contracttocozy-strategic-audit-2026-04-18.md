# ContractToCozy (CtC) Strategic Product Audit

**Date:** April 18, 2026  
**Prepared as:** Principal Product Strategist + UX Auditor + Systems Architect + Growth Advisor + Category Dominance Consultant  
**Audit posture:** Brutally honest, execution-first, acquirer-grade

---

## Executive Read First

CtC is **not a toy**. It has unusual depth, serious backend architecture, and strong early foundations for a defensible home-operations data moat.

CtC is also **not yet a premium category product**. Right now it behaves like a high-potential feature lattice with uneven coherence, inconsistent trust UX, and too many duplicated surfaces.

### Hard facts observed in codebase

- **124 frontend page routes**
- **83 backend route files**
- **223 Prisma models**

### Headline verdict

- **Opportunity:** Real and large
- **Current state:** Powerful but fragmented platform
- **Main blocker:** Product coherence and end-to-end resolution depth
- **Winning move:** Consolidate around homeowner outcomes, not tool inventory

---

## Section 1 — Product Surface Audit

### 1.1 Feature Inventory (Route/Module Level)

| Route/Module | Feature | User Problem Solved | Core Functionality | Status | Strategic Importance | Keep/Improve/Merge/Remove |
|---|---|---|---|---|---|---|
| `/` | Marketing Entry | Understand value and start | Landing + preview gate wrapper | Hidden | Critical | **Improve immediately** |
| `(auth)/login` `(auth)/signup` | Auth | Access product | Email/password auth, social stub | Partial | Critical | Improve |
| `/dashboard` | Dashboard Home | See what matters now | KPI/cards/actions surface | Partial | Critical | Redesign |
| `/dashboard/actions` | Action Center | Next best actions | Orchestration, snooze, complete, trace | Strong | Critical | Keep + polish |
| `/dashboard/properties` | Properties List | Manage homes | List/create/select properties | Strong | High | Keep |
| `/dashboard/properties/[id]` | Property Workspace | Operate one home | Summary + tool navigation | Partial | Critical | Redesign |
| `/dashboard/properties/[id]/home-score` | Home Score | Understand health/risk | Score + breakdown | Partial | High | Improve |
| `/dashboard/properties/[id]/status-board` | Status Board | Operational pulse | Health/risk/maintenance board | Strong | High | Keep |
| `/dashboard/properties/[id]/timeline` | Home Timeline | Memory of lifecycle | Events/history timeline | Partial | High | Improve |
| `/dashboard/properties/[id]/reports` | Reports | Share and review outcomes | Report generation/share links | Partial | High | Improve |
| `/dashboard/properties/[id]/inventory` | Inventory Hub | Know what you own | Items, value, metadata | Strong | Critical | Keep |
| `/dashboard/properties/[id]/inventory/rooms` | Inventory Rooms | Room-level context | Room list + item grouping | Strong | High | Keep |
| `/dashboard/properties/[id]/rooms` | Rooms (parallel surface) | Room management | Room list/detail routes | Partial | Medium | **Merge with inventory rooms** |
| `/dashboard/warranties` | Warranties | Avoid coverage lapses | Warranty CRUD/tracking | Partial | High | Improve |
| `/dashboard/insurance` | Insurance Hub | Manage policy/claims context | Insurance views + links | Partial | Critical | Improve |
| `/dashboard/documents` | Document Vault | Store critical docs | Upload, retrieval, analysis hooks | Strong | Critical | Keep |
| `/vault/[propertyId]` | Property Vault Share | Centralized records by property | Vault view by property | Strong | High | Keep |
| `/dashboard/maintenance` | Maintenance | Prevent failures | Task lifecycle + templates | Strong | Critical | Keep |
| `/dashboard/seasonal` | Seasonal Tasks | Seasonal readiness | Seasonal checklist flows | Strong | High | Keep |
| `/dashboard/maintenance-setup` | Maintenance Setup | Configure recurring care | Preferences/templates | Partial | Medium | Improve |
| `/dashboard/properties/[id]/incidents` | Incident Ops | Handle home incidents | Incident log/actions | Strong | Critical | Keep |
| `/dashboard/properties/[id]/claims` | Claims Ops | Resolve insurance claims | Claim workflows/details | Strong | Critical | Keep |
| `/dashboard/providers` | Provider Discovery | Find trusted service providers | Search/list/filter/providers | Partial | Critical | Improve |
| `/dashboard/providers/[id]/book` | Booking Flow | Schedule service | Provider booking journey | Partial | Critical | Improve |
| `/providers/(dashboard)/*` | Provider OS | Operate provider workflow | Services/calendar/bookings/profile | Partial | High | Improve |
| `/knowledge` | Knowledge Hub | Learn and decide | Article browsing/reading | Partial | Medium | Improve |
| `/dashboard/knowledge-admin/*` | Knowledge Admin | Manage content | CMS-like admin flows | Strong | Medium | Keep |
| `/dashboard/notifications` | Notifications | Stay informed | In-app notifications | Partial | High | Improve |
| `/dashboard/analytics-admin` | Admin Analytics | Monitor product metrics | Admin analytics screens | Partial | Medium | Keep |
| `/dashboard/worker-jobs` | Job Operations | Observe/trigger jobs | Worker job controls | Strong | Medium | Keep |
| `/dashboard/home-tools` | Home Tools Catalog | Discover tools | Tool launcher catalog | Duplicate | High | **Merge** |
| `/dashboard/ai-tools` | AI Tools Catalog | Discover AI tools | Tool launcher catalog | Duplicate | High | **Merge** |
| `/dashboard/properties/[id]/tools/guidance-overview` | Guidance Engine | Turn issue into plan | Journey orchestration + step logic | Strong | Critical | Double down |
| `/dashboard/properties/[id]/tools/service-price-radar` | Service Price Radar | Is quote fair | Benchmark verdict + confidence | Strong | Critical | Double down |
| `/dashboard/properties/[id]/tools/negotiation-shield` | Negotiation Shield | Improve deal terms | Leverage analysis + draft responses | Strong | High | Improve action handoff |
| `/dashboard/properties/[id]/tools/quote-comparison` | Quote Comparison | Compare quotes | Placeholder routing surface | Weak | High | **Merge/remove standalone** |
| `/dashboard/properties/[id]/tools/price-finalization` | Price Finalization | Record accepted terms | Final decision capture | Partial | High | Improve + connect |
| `/dashboard/properties/[id]/tools/coverage-intelligence` | Coverage Intelligence | Find coverage gaps | Coverage analysis + signals | Partial | Critical | Improve |
| `/dashboard/coverage-intelligence` | Global Coverage Route | Same problem as above | Duplicate entrypoint | Duplicate | High | **Merge** |
| `/dashboard/properties/[id]/tools/coverage-options` | Coverage Options | Explore plan choices | Wrapper-like UX | Weak | High | Rebuild or merge |
| `/dashboard/properties/[id]/tools/risk-premium-optimizer` | Risk-to-Premium | Lower premium risk | Risk-premium optimization | Partial | High | Improve |
| `/dashboard/risk-premium-optimizer` | Global Risk-Premium Route | Same problem as above | Duplicate entrypoint | Duplicate | High | **Merge** |
| `/dashboard/properties/[id]/tools/do-nothing` | Do Nothing Simulator | Cost of inaction | Simulation run + outputs | Partial | High | Merge naming/flow |
| `/dashboard/do-nothing-simulator` | Global Do-Nothing Route | Same job as above | Duplicate entrypoint | Duplicate | High | **Merge** |
| `/dashboard/properties/[id]/tools/home-savings` | Home Savings Check | Find immediate savings | Savings opportunities | Partial | Critical | Improve |
| `/dashboard/home-savings` | Global Home Savings | Same job as above | Duplicate entrypoint | Duplicate | High | **Merge** |
| `/dashboard/properties/[id]/tools/insurance-trend` | Insurance Trend | Premium trend awareness | Heuristic trend projection | Weak | High | Rework |
| `/dashboard/properties/[id]/tools/property-tax` | Property Tax | Tax burden insight | Heuristic estimate model | Weak | High | Rebuild |
| `/dashboard/properties/[id]/tools/cost-growth` | Cost Growth | Long-term cost projection | 5/10-year forecast | Partial | High | Improve |
| `/dashboard/properties/[id]/tools/cost-volatility` | Cost Volatility | Budget uncertainty | Volatility scenarioing | Partial | Medium | Improve |
| `/dashboard/properties/[id]/tools/true-cost` | True Cost | Ownership economics | Cost composition model | Partial | Critical | Improve |
| `/dashboard/properties/[id]/tools/break-even` | Break-Even | Financial threshold decisions | Break-even calculations | Partial | Medium | Improve |
| `/dashboard/properties/[id]/tools/capital-timeline` | Home Capital Timeline | Plan major spends | Capex timeline projections | Partial | High | Improve |
| `/dashboard/properties/[id]/tools/sell-hold-rent` | Sell/Hold/Rent | Strategy decision | Scenario comparison | Partial | High | Improve |
| `/dashboard/home-event-radar` | Home Event Radar | External risk awareness | Event signal matching | Partial | High | Improve |
| `/dashboard/properties/[id]/tools/home-event-radar` | Property wrapper to global | Same as above | Redirect wrapper | Duplicate | Medium | Merge |
| `/dashboard/properties/[id]/tools/home-risk-replay` | Home Risk Replay | Learn from past events | Historical risk replay engine | Strong | Medium | Keep |
| `/dashboard/properties/[id]/tools/hidden-asset-finder` | Hidden Asset Finder | Find missed savings/benefits | Program match + opportunities | Strong | Critical | Double down |
| `/dashboard/properties/[id]/tools/home-digital-twin` | Home Digital Twin | Model system impacts | Twin snapshots/scenarios | Partial | Medium | Focus/trim |
| `/dashboard/properties/[id]/tools/home-digital-will` | Home Digital Will | Home continuity memory | Home will sections/contacts | Strong | Medium | Keep |
| `/dashboard/properties/[id]/tools/neighborhood-change-radar` | Neighborhood Radar | External neighborhood changes | Signal ingestion and impact | Partial | Medium | Improve |
| `/dashboard/properties/[id]/tools/mortgage-refinance-radar` | Refinance Radar | Lower financing costs | Rate ingestion + opportunity scoring | Strong | Critical | Double down |
| `/dashboard/properties/[id]/tools/home-gazette` | Home Gazette | Digest insights | Weekly editorial intelligence | Strong | High | Keep + improve actionability |
| `/dashboard/properties/[id]/tools/home-habit-coach` | Habit Coach | Build preventive behaviors | Habit generation/actions | Strong | High | Keep |
| `/dashboard/home-renovation-risk-advisor` | Renovation Advisor | Reduce compliance/permit risk | Multi-domain renovation guidance | Partial | High | Improve |
| `/dashboard/properties/[id]/tools/home-renovation-risk-advisor` | Property wrapper to global | Same as above | Redirect wrapper | Duplicate | Medium | Merge |
| `/dashboard/properties/[id]/tools/plant-advisor` | Plant Advisor | Plant care guidance | Plant recommendations | Partial | Low | Pause/merge |
| `/dashboard/emergency` | Emergency Help | Urgent guidance | Emergency assistant surface | Partial | High | Improve trust + escalation |
| `/dashboard/oracle` | Appliance Oracle | Appliance diagnostics guidance | AI-backed troubleshooting | Partial | Medium | Improve |
| `/dashboard/climate` | Climate Risk | Climate impact awareness | Climate risk outputs | Partial | Medium | Improve |
| `/dashboard/energy` | Energy Audit | Reduce utility waste | Energy recommendations | Partial | Medium | Improve |
| `/dashboard/tax-appeal` | Tax Appeal | Reduce tax via appeal | Appeal guidance content flow | Partial | Medium | Improve |

### 1.2 Surface-Level Diagnosis

- CtC has **high breadth but low consolidation**.
- The same job often appears as:
  - a global route,
  - a property-scoped route,
  - a tool-catalog card,
  - and a guidance step.
- This creates cognitive and technical duplication.

---

## Section 2 — User Value Audit

### 2.1 Value Scores (1–10)

| Feature | Saves Money | Saves Time | Reduces Stress | Prevents Mistakes | Helps Decisions | Emotional Value | Frequency of Need | User Will Pay? |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Guidance Engine | 8 | 8 | 8 | 9 | 9 | 6 | 8 | Yes |
| Action Center | 7 | 9 | 8 | 8 | 8 | 5 | 8 | Yes |
| Service Price Radar | 9 | 7 | 7 | 8 | 9 | 4 | 6 | Yes |
| Negotiation Shield | 8 | 6 | 7 | 7 | 8 | 5 | 5 | Yes |
| Refinance Radar | 10 | 8 | 8 | 9 | 9 | 6 | 4 | Yes |
| Hidden Asset Finder | 9 | 7 | 7 | 8 | 8 | 6 | 5 | Yes |
| Coverage Intelligence | 8 | 6 | 8 | 9 | 8 | 5 | 4 | Yes |
| Incidents + Claims | 8 | 8 | 9 | 9 | 8 | 7 | 3 | Yes |
| Maintenance + Seasonal + Habits | 7 | 8 | 8 | 8 | 7 | 6 | 8 | Yes |
| Daily Snapshot / Pulse | 6 | 7 | 7 | 6 | 6 | 6 | 9 | Maybe |
| Inventory + Rooms | 6 | 7 | 7 | 8 | 7 | 7 | 6 | Yes (as foundation) |
| Document Vault | 6 | 8 | 8 | 8 | 6 | 7 | 6 | Yes |
| Home Gazette | 5 | 6 | 6 | 5 | 6 | 7 | 5 | Maybe |
| True Cost / Cost Growth | 7 | 5 | 5 | 6 | 7 | 3 | 4 | Maybe (if trust improved) |
| Property Tax (current) | 4 | 4 | 3 | 3 | 4 | 2 | 2 | No (current form) |
| Insurance Trend (current) | 3 | 4 | 3 | 3 | 4 | 2 | 3 | No (current form) |
| Home Risk Replay | 5 | 5 | 5 | 6 | 6 | 4 | 3 | Mostly no |
| Home Digital Twin | 4 | 4 | 4 | 5 | 6 | 5 | 2 | Mostly no |
| Quote Comparison (placeholder) | 1 | 2 | 1 | 2 | 2 | 1 | 1 | No |
| Plant Advisor | 2 | 3 | 4 | 2 | 2 | 4 | 2 | No |

### 2.2 Honest segmentation

**Users will pay for:**

- Money-saving decision engines with proof
- Coverage and refinance decisions with clear upside
- Incident/claims execution support

**Nice-to-have only:**

- Digest/news-like layers without execution
- Historical analysis not tied to next actions

**Likely ignored:**

- Placeholder flows
- Heuristic-heavy financial modules presented as high-confidence intelligence

---

## Section 3 — UX / Premium Quality Audit

### 3.1 Product-level premium quality verdict

Current CtC quality is **“powerful but patchwork”**.

Major issues:

- Overgrown navigation and weak mental model
- Duplicated entry points for same job
- Inconsistent trust and explainability treatment
- Mobile shell conflicts (fixed layers and density)
- Visible “coming soon” and unfinished artifacts in user-facing flow

### 3.2 Route quality scoring

| Route Group | Visual Hierarchy | Clarity | Modern Feel | Mobile Quality | Trust Signals | Consistency | Verdict |
|---|---:|---:|---:|---:|---:|---:|---|
| Dashboard Home | 4 | 5 | 5 | 5 | 5 | 4 | Full redesign |
| Property Workspace | 4 | 5 | 5 | 5 | 5 | 4 | Full redesign |
| Actions Center | 7 | 7 | 6 | 7 | 7 | 6 | Polish only |
| Guidance Overview | 7 | 7 | 6 | 7 | 8 | 6 | Strong, polish |
| Inventory System | 6 | 6 | 6 | 6 | 7 | 5 | Improve |
| Incident/Claims | 7 | 7 | 6 | 6 | 8 | 6 | Improve |
| Pricing & Negotiation Tools | 6 | 6 | 6 | 6 | 6 | 5 | Merge + simplify |
| Insurance/Cost Tool Family | 5 | 5 | 5 | 5 | 4 | 5 | Rework |
| Provider + Booking | 6 | 6 | 6 | 6 | 6 | 5 | Improve conversion/trust |
| Auth + Public Entry | 5 | 6 | 5 | 6 | 4 | 4 | Significant polish required |

### 3.3 Top 20 UX upgrades needed

1. Remove preview wall as default on `/`.
2. Remove all customer-facing “coming soon” markers.
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
17. Add explicit completion and “outcome receipts.”
18. Normalize terminology to homeowner language.
19. Improve provider trust metadata in booking UX.
20. Add “what changed since last visit” in key routes.

---

## Section 4 — Data Moat Audit

### 4.1 Feature-level defensibility

| Feature | Inputs Used | Outputs Generated | Behavioral Signals Captured | Feedback Loops | Proprietary Data Generated | Learning Potential | Benchmark Potential | Defensibility (1–10) |
|---|---|---|---|---|---|---|---|---:|
| Guidance Journeys | Property + asset + signal + issue | Ordered next steps | Start/skip/block/complete | Journey completion tuning | Resolution graph by issue/home type | High | High | 9 |
| Action Center | Tasks + risk + suppression | Prioritized actions | CTA/snooze/complete | Ranking optimization | Action efficacy dataset | High | High | 8 |
| Inventory Graph | User data + scans | Structured home inventory | Add/edit/verification cadence | Better recommendations | Home asset baseline graph | High | High | 8 |
| Price Radar | Quote + service + location + context | Fairness verdict | Check frequency + outcomes | Benchmark calibration | Quote distribution map | High | High | 9 |
| Price Finalization | Accepted terms | Final record of decision | Accept/override behavior | Close loop on quote quality | Ground-truth accepted pricing | Very High | Very High | 10 |
| Claims/Incidents | Policy + event + home data | Incident state/actions | Escalation and closure behavior | Risk/action tuning | Loss + response patterns | High | High | 8 |
| Daily Pulse/Habits | Tasks + weather + score deltas | Brief + micro-action | Open/streak/complete patterns | Personalization loop | Habit adherence dataset | High | Medium | 7 |
| Risk Radar/Replay | External events + property profile | Risk relevance/ranking | View/action response | Match quality tuning | Event impact by home profile | Medium | High | 7 |
| Refinance Radar | Market rates + property finance | Opportunity score/scenarios | Scenario interactions | Opportunity model tuning | Refi propensity data | High | High | 8 |
| Home Gazette | Signals + ranking + editorial | Weekly digest | Open/click/action response | Story ranking optimization | Signal-to-attention map | Medium | Medium | 6 |
| Analytics Pipeline | Product telemetry | Rollups/cohorts/funnels | Full funnel events | Product optimization | Cross-feature behavior graph | High | High | 8 |
| Provider/Booking | Provider + intent + scheduling | Match + booking outcomes | Conversion/no-show/repeat usage | Ranking and trust loops | Marketplace quality graph | Very High | Very High | 9 |

### 4.2 Strategic moat answer

CtC’s moat is not “AI output.”
CtC’s moat is the **decision-to-outcome loop** at property level.

### 4.3 Missing data to become dominant

- Real invoice/receipt ingestion at scale
- Policy document normalization and real quote data
- Utility bill integrations
- Assessor/permit/violation feeds with freshness SLAs
- Provider quality outcomes (on-time, rework, warranty honor)

### 4.4 Highest leverage integrations

1. County assessor + permit + code events
2. Insurance quote + policy ingestion ecosystem
3. Mortgage data + refinance execution rails
4. Utility and energy usage feed
5. Provider operations signals (completion proof and quality)

---

## Section 5 — Actionability Audit

### 5.1 Insight vs Action vs Resolution

| Feature | Classification | Where It Stops Today | Required “Best” State |
|---|---|---|---|
| Insurance Trend | Insight Only | Shows trend only | Compare carriers + switch support |
| Property Tax | Insight Only | Estimate only | Exemption + appeal workflow |
| Cost Growth/Volatility | Insight Only | Projection without plan | Budget + financing actions |
| Home Risk Replay | Insight Only | History only | Prevention plan + tasking |
| Coverage Intelligence | Suggested Action | Gap detected, weak closure | Buy/update coverage with tracking |
| Service Price Radar | Suggested Action | Verdict only | Negotiate/accept/requote path |
| Negotiation Shield | Suggested Action | Advice but no execution rail | Send/track negotiation + finalize |
| Quote Comparison | Suggested Action (weak) | Placeholder redirection | Real side-by-side compare + decision commit |
| Price Finalization | Suggested Action | Logs decision | Trigger booking/payment/work order |
| Guidance Engine | Near Full Resolution | Some branch-outs remain | Complete issue-to-outcome closure |
| Action Center | Near Full Resolution | Outcome proof inconsistent | Verified outcome + savings receipt |
| Claims/Incidents | Partial Full Resolution | Limited partner handoff | Claim concierge + vendor dispatch |
| Refinance Radar | Suggested Action | Opportunity surfaced only | Offer compare + lock + track flow |
| Maintenance/Habits | Suggested Action | Closure proof weak | Verified completion + reminders loop |

### 5.2 Biggest actionability gaps

- Too many “go use another tool” endings
- Too few hard execution rails
- Not enough closed-loop outcome confirmation

---

## Section 6 — Retention Audit

### 6.1 Usage pull by feature class

| Feature | Daily Pull | Weekly Pull | Monthly Pull | One-Time | Retention Strength |
|---|---|---|---|---|---|
| Morning Pulse + Micro-Actions | High | High | Medium | Low | Strong |
| Action Center | Medium | High | High | Low | Strong |
| Maintenance + Seasonal + Habits | Medium | High | High | Low | Strong |
| Incident + Claims | Low | Medium | Medium | Medium | Event-driven strong |
| Coverage + Insurance | Low | Medium | High | Medium | Periodic |
| Refinance | Low | Low | Medium | High | Episodic high value |
| Inventory + Vault | Low | Medium | Medium | Medium | Foundational |
| Pricing + Negotiation | Low | Medium | Medium | High | Transactional |
| Home Gazette | Low | Medium | Medium | Low | Engagement-only |
| Replay + Twin | Low | Low | Low | High | Weak standalone |

### 6.2 Habit loop recommendations

- Make morning brief the single daily anchor
- Tie notifications to specific projected savings
- Add monthly “home memory replay” summary
- Show “money saved to date” prominently and repeatedly

---

## Section 7 — Monetization Audit

### 7.1 Feature monetization matrix

| Feature | Subscription Potential | Lead-Gen Potential | Marketplace Revenue | Affiliate Potential | B2B API Potential | Enterprise Potential |
|---|---|---|---|---|---|---|
| Guidance + Action Center | High | Medium | High | Low | Medium | Medium |
| Pricing/Negotiation/Finalization | High | High | High | Medium | Medium | Medium |
| Coverage Intelligence/Options | High | High | Medium | High | Medium | High |
| Refinance Radar | High | High | High | High | Medium | Medium |
| Incident/Claims | High | Medium | High | Medium | Medium | High |
| Maintenance/Habit System | High | Medium | High | Low | Low | Medium |
| Hidden Asset Finder | High | Medium | Medium | High | Medium | Medium |
| Inventory + Vault | High | Low | Low | Low | Medium | High |
| Provider Marketplace | Medium | High | Very High | Medium | Medium | Medium |
| Buyer Reports | High | Medium | Low | Medium | High | High |

### 7.2 Top 10 monetizable opportunities

1. Premium homeowner subscription anchored on verified savings.
2. Refinance marketplace conversion fees.
3. Service quote-to-book transaction capture.
4. Insurance switch/referral economics.
5. Claims concierge premium tier.
6. Buyer due-diligence paid report package.
7. Annual home financial health review product.
8. Provider ranking/boost products tied to outcomes.
9. B2B benchmark API for lenders/insurers.
10. White-label enterprise product for brokerages/portfolios.

---

## Section 8 — Competitive Audit

| Competitor | Where They Win | Where CtC Wins | CtC Weakness vs Them |
|---|---|---|---|
| Zillow | Distribution and consumer traffic | Post-purchase intelligence + action layer | Weak top-of-funnel scale |
| Rocket Mortgage | Mortgage conversion machine | Broader homeowner operating system vision | Refinance execution depth |
| Rocket Money | Habit and finance UX polish | Home-specific operational intelligence | UX coherence/polish gap |
| Thumbtack | Service marketplace liquidity | Intelligence-driven service decisions | Network liquidity uncertainty |
| Home maintenance apps | Simplicity | Depth of decisions and savings tools | Complexity/cognitive load |
| Insurance compare apps | Quote-speed and carrier breadth | Home-context coverage reasoning | Integration maturity |
| Generic AI apps | Flexible chat | Property memory + workflow orchestration | Must improve product polish/trust consistency |

### 8.1 Lane CtC can own uniquely

**“Homeowner Decision & Resolution OS”**

No mainstream competitor owns memory + intelligence + action + savings proof in one loop.

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

| Bucket | What belongs here |
|---|---|
| **Double Down** | Guidance engine, Action Center, Maintenance/Habits, Incidents/Claims, Service Price Radar, Refinance Radar, Hidden Asset Finder, Inventory + Document Vault |
| **Upgrade** | Dashboard home, Property workspace, Coverage UX, Provider booking trust UX, Morning pulse UX, notification relevance |
| **Merge** | Duplicate global/property tool routes, Home/AI tool catalogs, pricing toolchain into one flow, insurance toolchain into one flow |
| **Kill / Pause** | Placeholder standalone routes, low-value standalone side tools, customer-visible “coming soon” artifacts |

---

## Section 11 — Priority Roadmap

### Phase 1 (0–90 days) — Highest ROI moves

| Theme | Moves |
|---|---|
| Product coherence | Remove preview gate default, remove placeholders, collapse duplicate routes |
| Premium UX baseline | Redesign `/dashboard` and `/dashboard/properties/[id]` around outcomes |
| Trust contract | Mandatory confidence/freshness/source/rationale on recommendation pages |
| Activation | Single clear “next action” architecture per major route |

### Phase 2 (3–6 months) — Retention + moat

| Theme | Moves |
|---|---|
| Closed loop outcomes | Tie recommendations to verified completions and savings receipts |
| Data quality | Add assessor/permit, utility, policy document and better quote feeds |
| Habit retention | Strengthen morning brief, alerts, and monthly memory replay |
| Marketplace fit | Improve provider quality scoring and handoff completion |

### Phase 3 (6–12 months) — Dominance moves

| Theme | Moves |
|---|---|
| Category product | Launch “Homeowner Command Center” as default shell |
| Monetization scale | Introduce tiered paid plans + concierge + marketplace economics |
| Defensible intelligence | Benchmark engine from real completion/outcome data |
| Strategic expansion | B2B API pilots for lenders/insurers and enterprise channels |

---

## Section 12 — Final Executive Summary

### Is CtC a serious opportunity?

Yes. Strongly yes.

### Biggest hidden strengths

- Deep journey and orchestration architecture
- Large structured domain model and telemetry surface
- Strong potential for proprietary outcome data moat

### Biggest risks

- Product coherence debt
- Route duplication and tool sprawl
- Heuristic outputs presented with insufficient trust framing

### What will block growth

- Adding more tools before consolidating current flows
- Keeping insight-only dead-ends without execution
- Leaving unfinished artifacts in customer experience

### What creates breakout success

- Repeated, provable homeowner savings from end-to-end resolution loops
- Unified premium UX around homeowner outcomes
- Closed-loop intelligence that improves with every completed action

### What an acquirer would love

- Measurable decision-to-outcome graph
- High retention in core homeowner operations
- Repeatable monetization through subscription + marketplace + data products

### Founder focus right now

1. Consolidate product surface into canonical flows.
2. Finish execution rails for pricing, coverage, and refinance.
3. Make trust/explainability a hard product contract.
4. Instrument and foreground “money saved” as north star.
5. Run a coherence-first quarter before adding new major modules.

---

## Appendix — Brutal Truths (No Sugarcoating)

1. CtC has enough features to impress a demo audience and still lose the category.
2. The biggest risk is not competitor features. It is internal fragmentation.
3. A premium trust product cannot ship visible placeholders in critical user flow.
4. Users do not pay for dashboards. They pay for outcomes and reduced regret.
5. If CtC consolidates and closes loops, it can own a real category.

