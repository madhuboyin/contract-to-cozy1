# ContractToCozy 90-Day Execution Plan

**Date:** April 18, 2026  
**Scope:** Convert strategic audit into a 0–90 day execution plan with owners, effort, dependencies, milestones, and success metrics.  
**Primary objective:** Move CtC from fragmented feature lattice to coherent, premium, action-first homeowner platform.

---

## 1) Day-90 Outcomes (What Must Be True)

By Day 90, CtC should have the following outcomes in production:

1. **Canonical homeowner navigation and route architecture** for top workflows (no duplicate global vs property tool confusion for priority flows).
2. **Three closed-loop money workflows** live end-to-end:
   - Service pricing and negotiation to finalization and booking
   - Coverage gap detection to option comparison to resolution handoff
   - Refinance opportunity to offer comparison and execution handoff
3. **Trust contract standardized** across all priority recommendation screens (confidence, freshness, source, rationale).
4. **Morning Brief retention loop upgraded** with actionable savings alerts and clear next action.
5. **Top-of-funnel unblocked** (no default preview wall, no customer-facing “coming soon” in core pathways).
6. **Savings proof instrumentation** in place (track projected + verified savings by feature and by user cohort).

---

## 2) Team and Owner Model

### 2.1 Named role owners (replace with actual names)

- **Executive Sponsor:** Founder/CEO
- **Program Owner:** Head of Product (HOP)
- **Design Owner:** Design Lead (DL)
- **Frontend Owner:** Frontend Lead (FEL)
- **Backend Owner:** Backend Lead (BEL)
- **Data/Analytics Owner:** Data Lead (DAL)
- **Growth Owner:** Growth Lead (GL)
- **Marketplace/Partnership Owner:** Partnerships Lead (PAL)
- **QA/Release Owner:** QA Lead (QAL)

### 2.2 Capacity assumptions

- 90 days = ~13 weeks
- Core delivery team: Product (1), Design (1–2), FE (3–4), BE (3–4), Data (1–2), QA (1), Growth (1)
- Effective throughput assumption: **~95–120 person-weeks** total

---

## 3) Prioritized Workstreams

| Stream ID | Workstream | Objective | Owner |
|---|---|---|---|
| WS-01 | Product Surface Consolidation | Remove route duplication and IA confusion | HOP + FEL |
| WS-02 | Dashboard + Property Hub Redesign | Create coherent premium command surfaces | DL + FEL |
| WS-03 | Pricing Resolution Loop | Convert quote intelligence into booked outcome | BEL + FEL |
| WS-04 | Coverage Resolution Loop | Convert coverage insights into actionable resolution | BEL + FEL |
| WS-05 | Refinance Resolution Loop | Convert refinance signal into execution flow | BEL + FEL + PAL |
| WS-06 | Trust & Explainability Contract | Standard trust UX and confidence semantics | DL + BEL |
| WS-07 | Retention Engine Upgrade | Improve Morning Brief, notifications, and habit loops | HOP + DAL + BEL |
| WS-08 | Growth Funnel Hardening | Improve activation/conversion at entry and auth | GL + FEL |
| WS-09 | Savings Measurement System | Instrument projected vs verified savings | DAL + BEL |
| WS-10 | Reliability, QA, and Release Hardening | Ship safely with clear quality gates | QAL + FEL + BEL |

---

## 4) 90-Day Plan by Phase

## Phase 0: Mobilize and lock scope (Days 1–14)

| Initiative | Owner | Effort (pw) | Dependencies | Deliverable |
|---|---|---:|---|---|
| Confirm North Star metrics and baseline | HOP + DAL | 3 | None | KPI baseline dashboard (activation, action completion, savings, WAU) |
| Finalize canonical IA map (outcome-based nav) | HOP + DL | 4 | None | Approved IA and route consolidation map |
| Select top 3 closed-loop workflows | Founder + HOP | 1 | None | Signed scope and “not-now” list |
| Define trust contract schema (UI + API fields) | DL + BEL | 3 | KPI baseline | Trust contract spec v1 |
| Create delivery governance (weekly review + risk log) | Program Owner | 1 | None | Operating cadence + RAID log |

**Phase 0 effort:** 12 pw

---

## Phase 1: Coherence foundation (Days 15–45)

| Initiative | Owner | Effort (pw) | Dependencies | Deliverable |
|---|---|---:|---|---|
| Remove preview wall default + core “coming soon” artifacts | GL + FEL | 3 | Phase 0 scope lock | Public entry and auth cleanup |
| Merge duplicate route entrypoints (priority 8 flows) | FEL + BEL | 12 | IA map | Canonical routes + redirects |
| Redesign Dashboard Home as action-first command center | DL + FEL | 10 | IA map | New `/dashboard` shipped |
| Redesign Property Workspace as operating center | DL + FEL | 10 | IA map | New `/dashboard/properties/[id]` shipped |
| Implement shared trust UI primitives | DL + FEL | 6 | Trust contract spec | Reusable trust components |
| Apply trust contract to top 6 decision routes | FEL + BEL | 8 | Trust primitives | Standardized trust across priority tools |
| Introduce quality gates (visual regression + UX checklist) | QAL + FEL | 4 | Governance | Release checklist enforced |

**Phase 1 effort:** 53 pw

---

## Phase 2: Close the money loops (Days 46–75)

| Initiative | Owner | Effort (pw) | Dependencies | Deliverable |
|---|---|---:|---|---|
| Pricing loop unification (Radar -> Negotiation -> Finalization -> Booking) | BEL + FEL | 14 | Canonical routing | End-to-end pricing workflow |
| Replace Quote Comparison placeholder with real compare workspace | FEL + BEL | 8 | Pricing loop architecture | Functional quote compare + decisioning |
| Coverage loop (intelligence -> options -> resolution handoff) | BEL + FEL | 12 | Trust contract applied | Coverage resolution flow v1 |
| Refinance loop (opportunity -> scenario compare -> partner handoff) | BEL + PAL + FEL | 12 | Partner constraints | Refinance execution flow v1 |
| Outcome receipt model (decision and savings proof record) | DAL + BEL | 8 | KPI schema | Savings receipt entities + APIs |
| Instrument workflow funnel analytics per step | DAL + BEL | 6 | Outcome model | Step-level conversion telemetry |

**Phase 2 effort:** 60 pw

---

## Phase 3: Retention and production hardening (Days 76–90)

| Initiative | Owner | Effort (pw) | Dependencies | Deliverable |
|---|---|---:|---|---|
| Morning Brief revamp with one primary action | HOP + FEL + BEL | 8 | Trust + closed loops | Daily brief v2 live |
| Savings alerts and notification relevance rules | DAL + BEL | 6 | Savings instrumentation | Alert relevance engine v1 |
| Monthly “home memory replay” summary | HOP + FEL + BEL | 5 | Timeline and analytics hooks | Monthly recap v1 |
| QA stabilization sprint + bug burn-down | QAL + FEL + BEL | 8 | All prior feature work | Release candidate quality pass |
| Launch readiness + KPI reporting pack | Program Owner + DAL | 3 | QA pass | Day-90 business readout |

**Phase 3 effort:** 30 pw

---

## 5) Detailed Initiative Backlog (Owners, Effort, Dependencies)

| ID | Initiative | Primary Owner | Supporting Owners | Effort (pw) | Start-End | Dependencies | Criticality |
|---|---|---|---|---:|---|---|---|
| I-01 | KPI baseline + north star dashboard | DAL | HOP | 3 | W1-W2 | None | Critical |
| I-02 | Canonical IA + nav grammar | HOP | DL, FEL | 4 | W1-W2 | None | Critical |
| I-03 | Scope lock for top 3 loops | Founder | HOP | 1 | W1 | None | Critical |
| I-04 | Trust contract schema | DL | BEL, DAL | 3 | W1-W2 | I-01 | Critical |
| I-05 | Remove preview/coming-soon blockers | GL | FEL | 3 | W3 | I-03 | High |
| I-06 | Route consolidation (top 8 flows) | FEL | BEL | 12 | W3-W6 | I-02 | Critical |
| I-07 | Dashboard home redesign | DL | FEL | 10 | W3-W7 | I-02 | Critical |
| I-08 | Property workspace redesign | DL | FEL | 10 | W4-W8 | I-02 | Critical |
| I-09 | Trust UI primitive library | DL | FEL | 6 | W4-W6 | I-04 | High |
| I-10 | Trust rollout on top 6 routes | FEL | BEL | 8 | W6-W8 | I-09 | Critical |
| I-11 | Pricing loop unification | BEL | FEL, DAL | 14 | W7-W10 | I-06, I-10 | Critical |
| I-12 | Replace quote placeholder with real compare | FEL | BEL | 8 | W8-W10 | I-11 | Critical |
| I-13 | Coverage resolution loop v1 | BEL | FEL | 12 | W8-W11 | I-06, I-10 | Critical |
| I-14 | Refinance execution loop v1 | BEL | FEL, PAL | 12 | W8-W11 | I-06 | High |
| I-15 | Outcome receipts + savings ledger | DAL | BEL | 8 | W9-W11 | I-11, I-13, I-14 | Critical |
| I-16 | Step funnel analytics instrumentation | DAL | BEL | 6 | W9-W11 | I-11 | High |
| I-17 | Morning Brief v2 | HOP | FEL, BEL, DAL | 8 | W11-W12 | I-15, I-16 | High |
| I-18 | Savings alert rules engine | DAL | BEL | 6 | W11-W12 | I-15 | High |
| I-19 | Monthly home memory replay | HOP | FEL, BEL | 5 | W12-W13 | I-16 | Medium |
| I-20 | QA hardening + launch readiness | QAL | FEL, BEL, DAL | 11 | W12-W13 | I-07..I-19 | Critical |

**Total planned effort:** 140 pw  
**Reality check:** This is aggressive for a single squad. If capacity is <120 pw, reduce scope (see Section 8).

---

## 6) Dependency Graph (Critical Path)

### 6.1 Critical chain

1. I-02 IA lock -> I-06 route consolidation -> I-11/I-13/I-14 loop implementations -> I-15 savings ledger -> I-17 brief v2 -> I-20 launch readiness

### 6.2 Hard dependencies

- Trust rollout (I-10) depends on trust primitives (I-09)
- Quote compare replacement (I-12) depends on pricing loop architecture (I-11)
- Savings alerts (I-18) depend on savings ledger (I-15)
- Morning Brief v2 (I-17) depends on telemetry and outcome receipts (I-15/I-16)

### 6.3 Soft dependencies

- Growth funnel cleanup (I-05) can run in parallel with IA work after scope lock
- QA gates can start early, but full hardening (I-20) requires feature completion

---

## 7) RACI for High-Risk Deliverables

| Deliverable | Responsible | Accountable | Consulted | Informed |
|---|---|---|---|---|
| Canonical IA + route map | HOP | Founder | DL, FEL, BEL | All |
| Dashboard + Property redesign | DL, FEL | HOP | Founder, QAL | All |
| Pricing closed loop | BEL, FEL | HOP | DAL, PAL | Founder |
| Coverage closed loop | BEL, FEL | HOP | DAL | Founder |
| Refinance closed loop | BEL, PAL, FEL | HOP | DAL, Legal/Ops | Founder |
| Trust contract rollout | DL, BEL | HOP | DAL, QAL | All |
| Savings measurement system | DAL, BEL | HOP | Finance, Growth | Founder |
| Launch go/no-go | QAL | Founder | HOP, FEL, BEL, DAL | All |

---

## 8) Scope Control (Brutally Honest)

Current plan is **ambitious and borderline over-capacity** for a typical team.

If capacity is constrained, cut in this order:

1. Defer low-frequency modules (digital twin expansion, plant advisor improvements).
2. Limit route consolidation to top 6 workflows (not top 8).
3. Ship refinance loop as guided handoff v1 (not full deep partner integration).
4. Delay monthly replay (I-19) to Day-120 if needed.

Do **not** cut:

- IA consolidation
- Trust contract rollout on decision routes
- Pricing/coverage closed loops
- Savings instrumentation

---

## 9) Milestones and Go/No-Go Gates

| Date (Target) | Milestone | Exit Criteria |
|---|---|---|
| Day 14 | M1 Scope and architecture locked | IA approved, top 3 loops scoped, trust schema approved |
| Day 45 | M2 Coherence foundation live | Dashboard/property redesign live, route consolidation for priority routes complete |
| Day 75 | M3 Closed loops live | Pricing + coverage + refinance loops operational with telemetry |
| Day 90 | M4 Launch readiness and KPI proof | QA pass complete, trust contract coverage >=90% on priority routes, measurable savings/reporting live |

---

## 10) KPI Targets for Day 90

| KPI | Baseline (fill) | Day-90 Target |
|---|---:|---:|
| Activation to first meaningful action (7-day) | TBD | +25% |
| Action completion rate (top workflows) | TBD | +30% |
| Recommendation-to-resolution conversion | TBD | +20% |
| Weekly active homeowners (WAH) | TBD | +20% |
| Morning brief action click-through | TBD | +35% |
| Verified savings events per 1,000 users | TBD | +50% |
| Trust contract coverage on priority recommendation routes | TBD | >=90% |
| Duplicate route usage on canonicalized workflows | TBD | -70% |

---

## 11) Weekly Operating Rhythm

- **Monday:** Workstream standup + dependency/risk review
- **Wednesday:** Product/design checkpoint + scope defense
- **Friday:** Demo + KPI movement review + decision log updates
- **Weekly executive review:** Founder + HOP decide keep/cut/escalate on blockers

Required artifacts updated weekly:

- Initiative burndown by effort
- Dependency risk log
- KPI scorecard
- Decision log

---

## 12) Immediate Next 7 Days (Actionable Start)

1. Assign named owners to I-01 through I-04.
2. Freeze new feature intake for 2 weeks except critical bug/security.
3. Publish IA draft and route merge proposal.
4. Approve trust contract schema and UX component spec.
5. Set baseline KPI snapshot and commit Day-90 targets.

---

## 13) Bottom Line

CtC does not need more features in the next 90 days.  
CtC needs **coherence, closure, trust, and measurable savings outcomes**.

If this plan is executed with discipline, CtC exits the quarter as a serious category contender instead of a fragmented feature set.

