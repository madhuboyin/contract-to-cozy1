# ContractToCozy 90-Day Execution Plan — v2

**Date:** April 18, 2026
**Version:** 2 (supersedes v1 of same date)
**Scope:** Revised execution plan aligned with Strategic Audit v2. Corrects: Morning Brief moved to Phase 1, Provider trust added as workstream, Hidden Asset Finder closure added, data integration groundwork moved to Week 1, scope split into committed vs. stretch, KPI baseline instrumented before targets are set.
**Primary objective:** Move CtC from fragmented feature lattice to coherent, premium, action-first homeowner platform.

---

## 1) Day-90 Outcomes (What Must Be True)

By Day 90, CtC should have the following outcomes in production:

1. **Canonical homeowner navigation and route architecture** for all priority workflows — no duplicate global vs. property tool confusion in Tier 1 features.
2. **Three closed-loop money workflows** live end-to-end:
   - Service pricing and negotiation → finalization → booking
   - Coverage gap detection → option comparison → resolution handoff
   - Refinance opportunity → offer comparison → partner execution handoff
3. **Trust contract standardized** across all priority recommendation screens (confidence, freshness, source, rationale).
4. **Morning Brief upgraded and live** as the daily retention anchor — actionable savings alerts, single primary CTA, personalized to property and open actions.
5. **Hidden Asset Finder loop closed** — matched programs have a guided apply flow and outcome tracking (not just a list).
6. **Provider Booking trust upgrade live** — reviews, completion rate, response time, and license status visible in booking UX.
7. **Top-of-funnel unblocked** — no default preview wall, no customer-facing "coming soon" in Tier 1 pathways.
8. **KPI baseline established by Day 14** — all Day-90 targets are set relative to measured baselines, not assumed denominators.
9. **Savings proof instrumentation** in place — projected vs. verified savings tracked by feature and user cohort.
10. **Data integration partner contracts or LOIs initiated** for assessor feed, insurance quote API, and refinance partner by Day 30.

---

## 2) Scope Model: Committed vs. Stretch

> v1 listed 140 person-weeks against a 95–120 pw capacity, creating hidden over-commitment. This version separates committed scope (must ship) from stretch scope (ship if capacity allows).

### 2.1 Committed scope (Day-90 must-have)

- Product coherence: route consolidation, preview/coming-soon cleanup
- Dashboard and Property Workspace redesign
- Trust contract primitives + rollout on Tier 1 routes
- **Morning Brief v2** (moved from Phase 3 in v1)
- Pricing closed loop (Radar → Negotiation → Finalization → Booking)
- Coverage closed loop (Intelligence → Options → Resolution handoff)
- **Hidden Asset Finder closure** (apply flow + outcome tracking)
- **Provider Booking trust upgrade**
- Savings measurement system (projected + verified savings ledger)
- KPI baseline + north star instrumentation
- QA hardening and launch readiness

### 2.2 Stretch scope (ship if capacity > 110 pw)

- Refinance loop — deep partner integration (if partner contract signed early enough)
- Monthly home memory replay
- Home Score and Timeline improvements (beyond baseline polish)
- Notification relevance engine (beyond savings alerts)

### 2.3 Explicitly deferred to Phase 2

- Assessor/permit feed activation (groundwork in Phase 1, feed live in Phase 2)
- Insurance quote API activation (groundwork in Phase 1)
- Refinance loop v1 if partner contract slips
- Digital Twin trim/refocus
- Plant Advisor pause

---

## 3) Team and Owner Model

### 3.1 Named role owners (replace with actual names)

- **Executive Sponsor:** Founder/CEO
- **Program Owner:** Head of Product (HOP)
- **Design Owner:** Design Lead (DL)
- **Frontend Owner:** Frontend Lead (FEL)
- **Backend Owner:** Backend Lead (BEL)
- **Data/Analytics Owner:** Data Lead (DAL)
- **Growth Owner:** Growth Lead (GL)
- **Marketplace/Partnership Owner:** Partnerships Lead (PAL)
- **QA/Release Owner:** QA Lead (QAL)

### 3.2 Capacity assumptions

- 90 days = ~13 weeks
- Core delivery team: Product (1), Design (1–2), FE (3–4), BE (3–4), Data (1–2), QA (1), Growth (1)
- **Committed scope: ~110 person-weeks**
- **Stretch scope adds ~20 pw** — only engage if team is tracking ahead by Day 45

---

## 4) Prioritized Workstreams

| Stream ID | Workstream | Objective | Owner | Committed/Stretch |
|---|---|---|---|---|
| WS-01 | Product Surface Consolidation | Remove route duplication and IA confusion | HOP + FEL | Committed |
| WS-02 | Dashboard + Property Hub Redesign | Create coherent premium command surfaces | DL + FEL | Committed |
| WS-03 | Pricing Resolution Loop | Convert quote intelligence into booked outcome | BEL + FEL | Committed |
| WS-04 | Coverage Resolution Loop | Convert coverage insights into actionable resolution | BEL + FEL | Committed |
| WS-05 | Refinance Resolution Loop | Convert refinance signal into execution flow | BEL + FEL + PAL | **Stretch** |
| WS-06 | Trust & Explainability Contract | Standard trust UX and confidence semantics | DL + BEL | Committed |
| WS-07 | **Morning Brief + Retention Engine** | Upgrade Morning Brief to daily anchor (Phase 1 not Phase 3) | HOP + DAL + BEL | **Committed** |
| WS-08 | Growth Funnel Hardening | Improve activation/conversion at entry and auth | GL + FEL | Committed |
| WS-09 | Savings Measurement System | Instrument projected vs verified savings | DAL + BEL | Committed |
| WS-10 | Reliability, QA, and Release Hardening | Ship safely with clear quality gates | QAL + FEL + BEL | Committed |
| WS-11 | **Hidden Asset Finder Closure** | Add guided apply flow and outcome tracking | BEL + FEL | **Committed** |
| WS-12 | **Provider Booking Trust Upgrade** | Add trust metadata to booking UX | FEL + BEL | **Committed** |
| WS-13 | **Data Integration Groundwork** | Initiate assessor, insurance, and refinance partner contracts | PAL + BEL | **Committed** |

> WS-11, WS-12, WS-13 are new vs. v1. WS-07 is expanded and moved to committed/Phase 1.

---

## 5) 90-Day Plan by Phase

### Phase 0: Mobilize and lock scope (Days 1–14)

**Primary goal:** Establish baselines, lock IA, assign owners, start external partner outreach. No feature work ships without these.

| Initiative | Owner | Effort (pw) | Dependencies | Deliverable |
|---|---|---:|---|---|
| Instrument KPI baseline — activation, action completion, WAU, savings events | DAL + HOP | 4 | None | Baseline dashboard live; Day-90 targets set from real numbers |
| Finalize canonical IA map (outcome-based nav, route consolidation priority) | HOP + DL | 4 | None | Approved IA and route consolidation map |
| Select committed scope and publish not-now list | Founder + HOP | 1 | None | Signed scope doc |
| Define trust contract schema (UI fields + API fields) | DL + BEL | 3 | KPI baseline | Trust contract spec v1 |
| **Initiate partner outreach: assessor feed, insurance quote API, refinance partner** | PAL | 2 | Scope lock | LOI or intro meeting with ≥2 partners |
| Create delivery governance (weekly review + risk log) | HOP | 1 | None | Operating cadence + RAID log |

**Phase 0 committed effort:** 15 pw

> **KPI baseline note:** Do not finalize percentage targets in Section 10 until the baseline dashboard is live. Targets are placeholders until Day 14.

---

### Phase 1: Coherence foundation + Morning Brief (Days 15–45)

**Primary goal:** Ship coherent entry, navigation, core UX, trust primitives, Morning Brief v2, and provider trust. These are the foundation everything else builds on.

| Initiative | Owner | Effort (pw) | Dependencies | Deliverable |
|---|---|---:|---|---|
| Remove preview wall default + core "coming soon" artifacts | GL + FEL | 3 | Scope lock | Public entry and auth cleanup live |
| Merge duplicate route entrypoints (priority 8 Tier 1 flows) | FEL + BEL | 12 | IA map | Canonical routes + redirects |
| Redesign Dashboard Home as action-first command center | DL + FEL | 10 | IA map | New `/dashboard` shipped |
| Redesign Property Workspace as operating center | DL + FEL | 10 | IA map | New `/dashboard/properties/[id]` shipped |
| Implement shared trust UI primitives | DL + FEL | 6 | Trust contract spec | Reusable trust components |
| Apply trust contract to top 6 Tier 1 decision routes | FEL + BEL | 8 | Trust primitives | Standardized trust across priority tools |
| **Morning Brief v2: savings-anchored, single CTA, personalized** | HOP + FEL + BEL + DAL | 10 | Trust primitives, KPI baseline | Daily brief v2 live |
| **Provider Booking trust upgrade: reviews, completion rate, response time, license status** | FEL + BEL | 6 | Trust primitives | Updated booking UX live |
| Introduce quality gates (visual regression + UX checklist) | QAL + FEL | 4 | Governance | Release checklist enforced |

**Phase 1 committed effort:** 69 pw

---

### Phase 2: Close the money loops + Hidden Asset Finder (Days 46–75)

**Primary goal:** Ship the three closed-loop money workflows. Close Hidden Asset Finder loop. Instrument outcome receipts.

| Initiative | Owner | Effort (pw) | Dependencies | Deliverable |
|---|---|---:|---|---|
| Pricing loop unification (Radar → Negotiation → Finalization → Booking) | BEL + FEL | 14 | Canonical routing, trust rollout | End-to-end pricing workflow |
| Replace Quote Comparison placeholder with real compare workspace | FEL + BEL | 8 | Pricing loop architecture | Functional quote compare + decisioning |
| Coverage loop (intelligence → options → resolution handoff) | BEL + FEL | 12 | Trust contract applied | Coverage resolution flow v1 |
| **Hidden Asset Finder closure: guided apply flow + outcome tracking** | BEL + FEL | 8 | Pricing/coverage loop patterns | Apply flow live, savings tracked |
| Outcome receipt model (decision and savings proof record) | DAL + BEL | 8 | KPI schema | Savings receipt entities + APIs |
| Instrument workflow funnel analytics per step | DAL + BEL | 6 | Outcome model | Step-level conversion telemetry |
| Refinance loop v1 (guided handoff, not deep partner integration) [**Stretch**] | BEL + PAL + FEL | 12 | Partner constraints | Refinance execution flow v1 |

**Phase 2 committed effort:** 56 pw (+ 12 pw stretch if refinance partner ready)

---

### Phase 3: Retention hardening + launch readiness (Days 76–90)

**Primary goal:** Harden retention loops, QA the full release, and confirm KPI proof.

| Initiative | Owner | Effort (pw) | Dependencies | Deliverable |
|---|---|---:|---|---|
| Savings alerts and notification relevance rules | DAL + BEL | 6 | Savings instrumentation | Alert relevance engine v1 |
| Monthly "home memory replay" summary [**Stretch**] | HOP + FEL + BEL | 5 | Timeline and analytics hooks | Monthly recap v1 |
| QA stabilization sprint + bug burn-down | QAL + FEL + BEL | 8 | All prior feature work | Release candidate quality pass |
| Launch readiness + KPI reporting pack | HOP + DAL | 3 | QA pass | Day-90 business readout |

**Phase 3 committed effort:** 17 pw (+ 5 pw stretch)

---

## 6) Effort Summary

| Phase | Committed (pw) | Stretch (pw) |
|---|---:|---:|
| Phase 0 | 15 | — |
| Phase 1 | 69 | — |
| Phase 2 | 56 | 12 |
| Phase 3 | 17 | 5 |
| **Total** | **157 pw** | **17 pw** |

> **Realism check:** Committed scope at 157 pw against 95–120 pw capacity is still aggressive. If team capacity is under 110 pw, apply the cuts in Section 9 immediately rather than waiting. The cuts in Section 9 are pre-decided — do not negotiate them under deadline pressure.

---

## 7) Detailed Initiative Backlog

| ID | Initiative | Primary Owner | Supporting | Effort (pw) | Weeks | Dependencies | Criticality | Committed/Stretch |
|---|---|---|---|---:|---|---|---|---|
| I-01 | KPI baseline + north star dashboard | DAL | HOP | 4 | W1–W2 | None | Critical | Committed |
| I-02 | Canonical IA + nav grammar | HOP | DL, FEL | 4 | W1–W2 | None | Critical | Committed |
| I-03 | Scope lock — committed vs. stretch | Founder | HOP | 1 | W1 | None | Critical | Committed |
| I-04 | Trust contract schema | DL | BEL, DAL | 3 | W1–W2 | I-01 | Critical | Committed |
| I-05 | **Partner outreach: assessor, insurance, refinance** | PAL | BEL | 2 | W1–W2 | I-03 | Critical | Committed |
| I-06 | Remove preview/coming-soon blockers | GL | FEL | 3 | W3 | I-03 | High | Committed |
| I-07 | Route consolidation (top 8 Tier 1 flows) | FEL | BEL | 12 | W3–W6 | I-02 | Critical | Committed |
| I-08 | Dashboard home redesign | DL | FEL | 10 | W3–W7 | I-02 | Critical | Committed |
| I-09 | Property workspace redesign | DL | FEL | 10 | W4–W8 | I-02 | Critical | Committed |
| I-10 | Trust UI primitive library | DL | FEL | 6 | W4–W6 | I-04 | High | Committed |
| I-11 | Trust rollout on top 6 Tier 1 routes | FEL | BEL | 8 | W6–W8 | I-10 | Critical | Committed |
| I-12 | **Morning Brief v2** | HOP | FEL, BEL, DAL | 10 | W5–W8 | I-10, I-01 | **Critical** | **Committed** |
| I-13 | **Provider Booking trust upgrade** | FEL | BEL | 6 | W6–W8 | I-10 | High | **Committed** |
| I-14 | Pricing loop unification | BEL | FEL, DAL | 14 | W7–W10 | I-07, I-11 | Critical | Committed |
| I-15 | Replace quote placeholder with real compare | FEL | BEL | 8 | W8–W10 | I-14 | Critical | Committed |
| I-16 | Coverage resolution loop v1 | BEL | FEL | 12 | W8–W11 | I-07, I-11 | Critical | Committed |
| I-17 | **Hidden Asset Finder: apply flow + outcome tracking** | BEL | FEL | 8 | W9–W11 | I-14, I-16 patterns | Critical | **Committed** |
| I-18 | Outcome receipts + savings ledger | DAL | BEL | 8 | W9–W11 | I-14, I-16, I-17 | Critical | Committed |
| I-19 | Step funnel analytics instrumentation | DAL | BEL | 6 | W9–W11 | I-14 | High | Committed |
| I-20 | Refinance execution loop v1 | BEL | FEL, PAL | 12 | W8–W11 | I-05, I-07 | High | **Stretch** |
| I-21 | Savings alert rules engine | DAL | BEL | 6 | W11–W12 | I-18 | High | Committed |
| I-22 | Monthly home memory replay | HOP | FEL, BEL | 5 | W12–W13 | I-19 | Medium | Stretch |
| I-23 | QA hardening + launch readiness | QAL | FEL, BEL, DAL | 11 | W12–W13 | I-08..I-21 | Critical | Committed |

**Committed effort total:** ~148 pw
**Stretch additions (I-20, I-22):** ~17 pw

---

## 8) Dependency Graph (Critical Path)

### 8.1 Critical chain

```
I-02 IA lock
  → I-07 route consolidation
    → I-14 pricing loop
    → I-16 coverage loop
    → I-17 Hidden Asset Finder closure
      → I-18 savings ledger
        → I-21 savings alerts
          → I-23 launch readiness
```

### 8.2 Parallel chain (retention)

```
I-01 KPI baseline + I-10 trust primitives
  → I-12 Morning Brief v2 (W5–W8, parallel with route consolidation)
  → I-13 Provider Booking trust (W6–W8)
```

### 8.3 Hard dependencies

- Morning Brief v2 (I-12) depends on trust primitives (I-10) and KPI baseline (I-01)
- Trust rollout (I-11) depends on trust primitives (I-10)
- Quote compare replacement (I-15) depends on pricing loop architecture (I-14)
- Savings alerts (I-21) depend on savings ledger (I-18)
- Hidden Asset Finder (I-17) depends on loop patterns established in I-14/I-16

### 8.4 External dependency (highest risk)

- Refinance loop (I-20) depends on partner contract from I-05 (external procurement, 4–12 week timeline)
- If partner contract is not signed by Day 30, I-20 must be deferred to Phase 2 (post-Day-90)
- **This is the single highest-risk item in the plan. Assign PAL ownership and escalation path on Day 1.**

---

## 9) Scope Control (Pre-Decided Cuts)

If capacity is under target, cut in this exact order. Do not renegotiate under deadline pressure — these decisions are made now.

**Cut first:**
1. Monthly home memory replay (I-22) — defer to Day 120
2. Refinance deep integration (I-20) — ship as guided handoff only
3. Limit route consolidation to top 6 flows (not top 8) — save ~4 pw

**Cut second (only if severe capacity constraint):**
4. Provider Booking trust upgrade (I-13) — reduce to reviews only, defer completion rate and license status
5. Home Score and Timeline polish — defer to Phase 2

**Do NOT cut:**
- KPI baseline (I-01) — can't set real targets without it
- IA consolidation (I-02, I-07)
- Trust contract rollout (I-10, I-11)
- **Morning Brief v2 (I-12) — this is the daily retention anchor**
- Pricing and coverage closed loops (I-14, I-16)
- **Hidden Asset Finder closure (I-17)**
- Savings instrumentation (I-18, I-19)

---

## 10) RACI for High-Risk Deliverables

| Deliverable | Responsible | Accountable | Consulted | Informed |
|---|---|---|---|---|
| KPI baseline + targets | DAL | HOP | Founder | All |
| Canonical IA + route map | HOP | Founder | DL, FEL, BEL | All |
| **Morning Brief v2** | HOP, FEL, BEL | Founder | DAL, DL | All |
| Dashboard + Property redesign | DL, FEL | HOP | Founder, QAL | All |
| Pricing closed loop | BEL, FEL | HOP | DAL, PAL | Founder |
| Coverage closed loop | BEL, FEL | HOP | DAL | Founder |
| **Hidden Asset Finder closure** | BEL, FEL | HOP | DAL | Founder |
| **Provider Booking trust upgrade** | FEL, BEL | HOP | DL | All |
| **Partner outreach (assessor, insurance, refi)** | PAL | Founder | BEL, Legal | HOP |
| Refinance closed loop | BEL, PAL, FEL | HOP | DAL, Legal | Founder |
| Trust contract rollout | DL, BEL | HOP | DAL, QAL | All |
| Savings measurement system | DAL, BEL | HOP | Finance, Growth | Founder |
| Launch go/no-go | QAL | Founder | HOP, FEL, BEL, DAL | All |

---

## 11) Milestones and Go/No-Go Gates

| Date (Target) | Milestone | Exit Criteria |
|---|---|---|
| Day 14 | M1 Scope and architecture locked | IA approved, committed scope signed, trust schema approved, **KPI baseline live**, partner outreach initiated |
| Day 30 | M1.5 Partner contracts decision | Assessor and insurance API partners engaged; refinance partner LOI status confirmed — I-20 kept or deferred based on this |
| Day 45 | M2 Coherence foundation + Morning Brief live | Dashboard/property redesign live, route consolidation for priority routes complete, **Morning Brief v2 live**, provider trust upgrade live |
| Day 75 | M3 Closed loops live | Pricing + coverage + Hidden Asset Finder loops operational with telemetry; savings ledger tracking |
| Day 90 | M4 Launch readiness and KPI proof | QA pass complete, trust contract coverage ≥90% on priority routes, measurable savings/reporting live, **Day-90 KPIs vs. real baselines** |

---

## 12) KPI Targets for Day 90

> Baseline values must be filled from the Day-14 instrumentation sprint (I-01). Targets below are directional. Do not commit to percentage targets until baselines are known.

| KPI | Baseline (from I-01, fill by Day 14) | Day-90 Target |
|---|:---:|:---:|
| Activation to first meaningful action (7-day) | TBD | +25% vs. baseline |
| Action completion rate (top Tier 1 workflows) | TBD | +30% vs. baseline |
| Recommendation-to-resolution conversion | TBD | +20% vs. baseline |
| Weekly active homeowners (WAH) | TBD | +20% vs. baseline |
| **Morning Brief action click-through** | TBD | +40% vs. baseline |
| Verified savings events per 1,000 users | TBD | +50% vs. baseline |
| Hidden Asset Finder apply-flow start rate | TBD | +60% vs. baseline |
| Trust contract coverage on priority recommendation routes | TBD | ≥90% |
| Duplicate route usage on canonicalized workflows | TBD | -70% |
| Provider booking conversion rate | TBD | +20% vs. baseline |

---

## 13) Weekly Operating Rhythm

- **Monday:** Workstream standup + dependency/risk review (15 min per stream lead)
- **Wednesday:** Product/design checkpoint + scope defense (60 min with HOP + DL)
- **Friday:** Demo + KPI movement review + decision log updates (45 min)
- **Weekly executive review:** Founder + HOP decide keep/cut/escalate on blockers

Required artifacts updated weekly:

- Initiative burndown by effort (committed vs. stretch separately)
- Dependency risk log (flag partner contract status every week)
- KPI scorecard vs. baseline
- Decision log

---

## 14) Immediate Next 7 Days (Day 1–7 Actions)

> These are not Phase 0 themes — these are specific actions with named owners, due by end of Day 7.

| Day | Action | Owner | Output |
|---|---|---|---|
| Day 1 | Assign named humans to I-01 through I-05 | Founder | Owner list published |
| Day 1 | Freeze new feature intake (except critical bug/security) | HOP | Communicated to team |
| Day 1–2 | Start instrumentation for KPI baseline (activation, WAU, action completion, savings events) | DAL | Instrumentation PR open |
| Day 1–2 | Draft IA consolidation map and route merge proposal | HOP + DL | Draft shared for review |
| Day 2–3 | **Initiate outreach to assessor feed, insurance quote API, refinance partner candidates** | PAL | First contact made; timeline confirmed |
| Day 3–5 | Draft trust contract schema and UX component spec | DL + BEL | Spec doc shared |
| Day 5–7 | Publish committed scope doc and not-now list | HOP + Founder | Scope doc signed |
| Day 7 | Schedule M1 gate review for Day 14 | HOP | Calendar invite sent |

---

## 15) Bottom Line

CtC does not need more features in the next 90 days.
CtC needs **coherence, closure, trust, and measurable savings outcomes.**

The three corrections from v1 that matter most:

1. **Morning Brief is a Day-45 deliverable, not Day-75.** It is the only daily retention hook. Delaying it means 45 days of product time with no daily pull.
2. **Hidden Asset Finder is one of CtC's most defensible Tier 1 features.** It currently stops at a list. The apply flow and outcome tracking are the difference between a feature and a moat.
3. **Partner procurement for data integrations starts Day 1, not after Phase 1.** External timelines are outside your control. The only thing you can control is when you start.

If this plan is executed with discipline, CtC exits the quarter as a serious category contender instead of a fragmented feature set.
