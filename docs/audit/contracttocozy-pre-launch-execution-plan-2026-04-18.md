# ContractToCozy Pre-Launch Execution Plan

**Date:** April 18, 2026
**Replaces:** 90-day execution plan v1 and v2 for the pre-user phase
**Context:** No real users yet. The product must not be opened to real users until it meets the launch gate criteria defined in Section 3. This plan is about making CtC worthy of a first cohort — not about improving metrics that don't yet exist.
**Primary objective:** Convert the existing feature lattice into a coherent, trustworthy, premium-feeling product that a first cohort of homeowners can use end-to-end without hitting dead ends, placeholders, or broken loops.

---

## 1) The Core Reframe

Previous plans were structured around improving KPI baselines. That framing is wrong for a pre-user product.

The right question is not: **"How do we improve by X%?"**
The right question is: **"What must be true before we let a real homeowner in?"**

A first user who hits a placeholder, a broken loop, a "coming soon" marker, or a tool that gives insight with no action path will not come back. There is no second chance with early adopters. The cost of launching too early is higher than the cost of launching 4 weeks later.

This plan is organized around a **launch gate** — a hard set of criteria that must pass before the first real user is onboarded. Everything before the gate is build and harden. Everything after is operate and learn.

---

## 2) Launch Gate Criteria (Must All Pass)

The product is not ready for real users until every item below is true.

### Gate A — No broken first impressions
- [ ] Preview wall removed as default on `/` — site opens to value, not a locked gate
- [ ] Zero customer-facing "coming soon" text in any Tier 1 user flow
- [ ] Zero placeholder routes that dead-end without a real experience
- [ ] Auth flow (signup → property creation → dashboard) completes without error for a new account
- [ ] At least one property can be fully onboarded from scratch in under 10 minutes

### Gate B — Route coherence
- [ ] All remaining P0 duplicate routes resolved or explicitly redirected (see Section 6)
- [ ] Navigation exposes only canonical routes — no duplicate entries in sidebar/nav for the same job
- [ ] No in-app link points to a dead or placeholder route

### Gate C — Trust contract on Tier 1 decision routes
- [ ] Every recommendation surface in the following tools carries confidence, freshness, source, and rationale:
  - Service Price Radar
  - Negotiation Shield
  - Coverage Intelligence
  - Refinance Radar
  - Hidden Asset Finder
  - Guidance Engine
- [ ] No heuristic-only output is presented without an explicit caveat explaining the data source

### Gate D — Closed loops on the three money workflows
- [ ] **Pricing loop:** Service Price Radar → Negotiation Shield → Price Finalization → Booking handoff — a user can traverse the full loop without hitting a dead end
- [ ] **Coverage loop:** Coverage Intelligence → Coverage Options → Resolution handoff — a user receives a gap finding and can act on it
- [ ] **Hidden Asset Finder loop:** Matched program surfaced → guided apply flow → outcome tracked — a user can act on a match, not just see a list

### Gate E — Core daily experience
- [ ] Morning Brief loads with real property data, not empty or error state
- [ ] Morning Brief shows at least one actionable item linked to a real tool
- [ ] Action Center populates from real property state
- [ ] Maintenance and seasonal tasks generate for a real property

### Gate F — Provider booking trust
- [ ] Provider cards in booking flow show: at minimum reviews and response time
- [ ] Booking flow completes without error from provider selection to confirmation

### Gate G — QA pass
- [ ] All Tier 1 routes pass a manual QA walkthrough on mobile and desktop
- [ ] No console errors or uncaught exceptions on Tier 1 routes
- [ ] No redirect loops on any canonicalized route

---

## 3) What "Solidifying" Means Per Feature Class

The audit (Section 10) defines four buckets. Pre-launch work maps to those buckets as follows:

| Audit Bucket | Pre-Launch Work |
|---|---|
| **Double Down** | Ensure end-to-end loops are closed. No dead ends. Trust contract applied. |
| **Upgrade** | Redesign dashboard and property workspace. Improve Home Score and Timeline to functional standard. |
| **Merge** | Complete remaining P0 route consolidation. Lock canonical IA before dashboard redesign ships. |
| **Kill / Pause** | Digital Twin (trim to stub), all "coming soon" markers. No user should encounter these. Plant Advisor stays in nav — planned plant seller CTA integration. |

---

## 4) Team and Owner Model

### Named role owners (replace with actual names)

- **Executive Sponsor:** Founder/CEO
- **Program Owner:** Head of Product (HOP)
- **Design Owner:** Design Lead (DL)
- **Frontend Owner:** Frontend Lead (FEL)
- **Backend Owner:** Backend Lead (BEL)
- **Data/Analytics Owner:** Data Lead (DAL)
- **Growth Owner:** Growth Lead (GL)
- **Partnerships Owner:** Partnerships Lead (PAL)
- **QA Owner:** QA Lead (QAL)

### Capacity assumption

- ~13 weeks to launch gate
- Effective throughput: ~100–120 person-weeks
- Committed scope is sized to 110 pw; stretch scope engages only if team is ahead at Week 7

---

## 5) Workstreams

| ID | Workstream | Objective | Owner | Gate |
|---|---|---|---|---|
| WS-01 | IA Lock + Route Consolidation | Canonical navigation before anything else ships | HOP + FEL | Gate B |
| WS-02 | Entry + Funnel Unblock | Remove preview wall, placeholders, auth cleanup | GL + FEL | Gate A |
| WS-03 | Dashboard + Property Workspace Redesign | Outcome-first command surfaces | DL + FEL | Gate E |
| WS-04 | Trust Contract | Trust primitives + rollout on all Tier 1 decision routes | DL + BEL + FEL | Gate C |
| WS-05 | Pricing Closed Loop | Price Radar → Negotiation → Finalization → Booking | BEL + FEL | Gate D |
| WS-06 | Coverage Closed Loop | Intelligence → Options → Resolution handoff | BEL + FEL | Gate D |
| WS-07 | Hidden Asset Finder Closure | Apply flow + outcome tracking | BEL + FEL | Gate D |
| WS-08 | Morning Brief + Action Center Hardening | Daily anchor functional on real property data | HOP + BEL + FEL | Gate E |
| WS-09 | Provider Booking Trust | Reviews, response time, completion rate in booking UX | FEL + BEL | Gate F |
| WS-10 | Kill / Pause Cleanup | Trim Digital Twin to stub, kill placeholders. Plant Advisor stays — future plant seller CTA surface. | FEL | Gate A |
| WS-11 | Instrumentation Readiness | Event schema + analytics instrumentation ready before first user | DAL + BEL | Pre-launch |
| WS-12 | Partner Groundwork | Assessor, insurance quote API, refinance partner outreach | PAL | Post-launch Phase 2 setup |
| WS-13 | QA + Launch Hardening | Full Tier 1 QA pass, redirect validation, mobile QA | QAL + FEL + BEL | Gate G |

---

## 6) Remaining Route Consolidation Work

Most P0-safe items are already done. What remains:

### P0 deferred — complete before launch gate

| Old Route | Canonical Target | Blocker to Resolve First |
|---|---|---|
| `/dashboard/risk-radar` | `/dashboard/properties/:id/tools/home-event-radar` | Semantic review: confirm risk-radar content maps to event-radar |
| `/dashboard/checklist` | `/dashboard/maintenance` | Validate no active buyer flows depend on `/checklist` |
| `/dashboard/seasonal` | `/dashboard/maintenance?tab=seasonal` | Confirm seasonal tab exists in maintenance shell |
| `/dashboard/replace-repair` | `/dashboard/properties/:id/inventory/items/:itemId/replace-repair` | Item-scoped URL resolver |
| `/dashboard/inspection-report` | `/dashboard/properties/:id/reports?report=inspection` | Confirm inspection report is part of report ledger |
| `/properties/[id]/rooms` | `/properties/[id]/inventory/rooms` | Design decision: rooms and inventory/rooms are same UX or distinct — resolve and implement |
| `/properties/[id]/health-score` | `/properties/[id]/home-score?tab=health` | Home-score tab contract must be built first |
| `/properties/[id]/risk-assessment` | `/properties/[id]/home-score?tab=risk` | Home-score tab contract must be built first |

### P1 — complete before launch gate (require canonical build first)

| Old Route | Canonical Target | Build Required |
|---|---|---|
| `/dashboard/home-tools` + `/dashboard/ai-tools` | `/dashboard/tools` | Build unified tool launcher |
| `/dashboard/insurance` | `/properties/:id/tools/coverage-intelligence?entry=insurance` | Coverage route accepts insurance entry mode |
| `/properties/:id/tools/coverage-options` | Coverage Intelligence `?tab=options` | Options tab in coverage intelligence |
| `/properties/:id/tools/insurance-trend` | Coverage Intelligence `?tab=trend` | Trend tab in coverage intelligence |
| `/properties/:id/tools/quote-comparison` | Service Price Radar `?workspace=quote` | Interim until real quote workspace ships |
| `/dashboard/tax-appeal` | Property Tax `?mode=appeal` | Property-tax route accepts mode |
| `/dashboard/budget` + `/dashboard/expenses` | True Cost `?view=budget/expenses` | True-cost view modes |
| `/dashboard/appreciation` | Capital Timeline `?view=appreciation` | Capital timeline accepts view |

---

## 7) Plan by Phase

### Phase 0: Lock the foundations (Days 1–14)

**Goal:** Nothing moves until IA is locked, scope is signed, and partner outreach starts. No feature work ships without these gates.

| ID | Initiative | Owner | Effort (pw) | Deliverable |
|---|---|---|---:|---|
| I-01 | Lock canonical IA and route merge decision list | HOP + DL | 4 | Approved IA map; every remaining P0/P1 route has a decision (redirect, merge, or keep) |
| I-02 | Sign committed scope and publish not-now list | Founder + HOP | 1 | Scope doc signed; team aligned |
| I-03 | Define trust contract schema (UI + API fields) | DL + BEL | 3 | Trust contract spec v1 |
| I-04 | Define event instrumentation schema (pre-user) | DAL + HOP | 2 | Event schema doc; what fires on what action |
| I-05 | Initiate partner outreach: assessor feed, insurance API, refinance partner | PAL | 2 | First contact made; timeline for each confirmed |
| I-06 | Delivery governance: weekly review, launch gate checklist, risk log | HOP | 1 | Operating cadence + RAID log |

**Phase 0 effort:** 13 pw

---

### Phase 1: Coherence foundation (Days 15–45)

**Goal:** A user landing on the site for the first time hits a real product — no gates, no placeholders, no broken navigation. The app shell and core surfaces are redesigned. Trust primitives exist. Route consolidation is complete.

| ID | Initiative | Owner | Effort (pw) | Dependencies | Deliverable |
|---|---|---|---:|---|---|
| I-07 | Remove preview wall default + all "coming soon" artifacts from Tier 1 flows | GL + FEL | 3 | I-02 | Public entry live; auth cleanup done |
| I-08 | Kill / pause: Digital Twin stubbed, placeholder pages removed. Plant Advisor stays — future plant seller CTA surface. | FEL | 3 | I-01 | No dead-end pages in user-facing routes |
| I-09 | Complete P0 deferred route redirects (risk-radar, checklist, seasonal, replace-repair, rooms, health-score, risk-assessment) | FEL + BEL | 8 | I-01 IA decision | All P0 redirects live |
| I-10 | Build P1 canonical routes and redirects (tools launcher, insurance entry, coverage tabs, quote-comparison interim, budget/expenses, tax-appeal, appreciation) | FEL + BEL | 10 | I-01 IA decision | All P1 redirects live |
| I-11 | Redesign Dashboard Home as action-first command center | DL + FEL | 10 | I-01 | New `/dashboard` shipped |
| I-12 | Redesign Property Workspace as operating center | DL + FEL | 10 | I-01 | New `/dashboard/properties/[id]` shipped |
| I-13 | Build shared trust UI primitives (confidence badge, freshness label, source chip, rationale drawer) | DL + FEL | 6 | I-03 | Reusable trust component library |
| I-14 | Apply trust contract to all Tier 1 decision routes (Price Radar, Negotiation Shield, Coverage Intelligence, Refinance Radar, Hidden Asset Finder, Guidance Engine) | FEL + BEL | 8 | I-13 | Trust contract on all 6 routes — Gate C |
| I-15 | Instrument all funnel events per schema (workflow_started, workflow_completed, recommendation_shown, action_taken, savings_verified) | DAL + BEL + FEL | 6 | I-04 | Analytics fires on all Tier 1 actions — ready for first user |
| I-16 | Visual QA gates (regression checklist + mobile review process) | QAL + FEL | 3 | I-11, I-12 | Release checklist enforced |

**Phase 1 effort:** 67 pw

---

### Phase 2: Close the money loops (Days 46–75)

**Goal:** The three closed-loop money workflows work end-to-end. Hidden Asset Finder loop is closed. A first user can traverse a complete resolution journey from signal to action.

| ID | Initiative | Owner | Effort (pw) | Dependencies | Deliverable |
|---|---|---|---:|---|---|
| I-17 | Pricing loop: unify Service Price Radar → Negotiation Shield → Price Finalization → Booking handoff | BEL + FEL | 14 | I-09, I-14 | End-to-end pricing workflow — Gate D partial |
| I-18 | Replace Quote Comparison placeholder with real compare workspace | FEL + BEL | 8 | I-17 | Functional quote compare + decision commit |
| I-19 | Coverage loop: Coverage Intelligence → Options → Resolution handoff | BEL + FEL | 12 | I-10, I-14 | Coverage resolution flow v1 — Gate D partial |
| I-20 | Hidden Asset Finder: guided apply flow + outcome tracking | BEL + FEL | 8 | I-19 patterns | Apply flow live, outcome tracked — Gate D complete |
| I-21 | Savings receipt model: outcome entity + API (decision made, savings projected, savings verified) | DAL + BEL | 6 | I-17, I-19, I-20 | Savings ledger ready for first real completions |
| I-22 | Refinance loop v1: opportunity → scenario compare → guided partner handoff | BEL + FEL + PAL | 10 | I-05 partner status | Refinance loop v1 — Stretch if partner not ready |

**Phase 2 committed effort:** 48 pw (+ 10 pw stretch for I-22)

---

### Phase 3: Daily experience + launch hardening (Days 76–90)

**Goal:** The daily experience works on real property data. Every Tier 1 surface passes QA on mobile and desktop. Launch gate criteria are met and signed off.

| ID | Initiative | Owner | Effort (pw) | Dependencies | Deliverable |
|---|---|---|---:|---|---|
| I-23 | Morning Brief v2: loads from real property data, one actionable item, savings-anchored CTA | HOP + FEL + BEL | 8 | I-21, I-15 | Daily brief functional on real data — Gate E |
| I-24 | Action Center hardening: populates from real property state, completion proof | BEL + FEL | 4 | I-21 | Action Center functional — Gate E |
| I-25 | Provider Booking trust upgrade: reviews, response time, completion rate visible in booking UX | FEL + BEL | 6 | I-13 primitives | Booking trust upgraded — Gate F |
| I-26 | Full Tier 1 QA pass: mobile + desktop, redirect validation, no console errors, no loops | QAL + FEL + BEL | 10 | All prior | Release candidate quality pass — Gate G |
| I-27 | Launch gate review: founder sign-off on all Gate A–G criteria | Founder + HOP + QAL | 2 | I-26 | Launch gate passed or items logged for rapid fix |

**Phase 3 committed effort:** 30 pw

---

## 8) Effort Summary

| Phase | Committed (pw) | Stretch (pw) |
|---|---:|---:|
| Phase 0 | 13 | — |
| Phase 1 | 67 | — |
| Phase 2 | 48 | 10 |
| Phase 3 | 30 | — |
| **Total** | **158 pw** | **10 pw** |

> If team capacity is under 110 pw effective, apply the pre-decided cuts in Section 9 immediately. Do not carry hidden over-commitment into Week 7.

---

## 9) Scope Control (Pre-Decided)

Cut in this exact order if capacity is constrained. Decide at Day 45, not under deadline pressure.

**Cut first:**
1. Refinance loop (I-22) — defer to post-launch Phase 2; ship as "coming soon" stub (hidden, not visible to users)
2. P1 canonical builds for low-traffic routes (tax-appeal, appreciation, budget/expenses) — redirect to parent tool instead
3. Digital Twin — stub to a single card instead of trimming the full feature

**Cut second (only if severe constraint):**
4. Provider Booking trust upgrade (I-25) — reduce to reviews only
5. Quote Comparison real workspace (I-18) — keep interim redirect to Price Radar

**Do NOT cut:**
- IA lock (I-01) — gates everything
- Entry + funnel unblock (I-07, I-08) — first impression cannot be broken
- Route consolidation (I-09, I-10) — navigation coherence is a launch gate requirement
- Trust contract on Tier 1 routes (I-13, I-14) — Gate C
- All three money loop closures (I-17, I-19, I-20) — Gate D; this is the core product thesis
- Morning Brief functional on real data (I-23) — Gate E
- Full QA pass (I-26) — Gate G

---

## 10) Dependency Graph (Critical Path)

```
I-01 IA lock
  → I-09 P0 route redirects
  → I-10 P1 canonical builds
  → I-11 Dashboard redesign
  → I-12 Property workspace redesign
      → I-17 Pricing loop
      → I-19 Coverage loop
          → I-20 Hidden Asset Finder closure
              → I-21 Savings receipt model
                  → I-23 Morning Brief v2
                      → I-26 Full QA pass
                          → I-27 Launch gate sign-off

I-03 Trust schema
  → I-13 Trust primitives
      → I-14 Trust rollout on Tier 1 routes
      → I-25 Provider booking trust
```

**Single highest-risk external dependency:**
- Refinance partner (I-05 / I-22) — external procurement timeline. If not signed by Day 30, I-22 is deferred. This is the only item that can slip without blocking the launch gate.

---

## 11) Milestones and Launch Gate

| Target | Milestone | Exit Criteria |
|---|---|---|
| Day 14 | M0 — Foundations locked | IA approved, scope signed, trust schema done, instrumentation schema done, partner outreach initiated |
| Day 30 | M0.5 — Partner decision | Refinance partner LOI status confirmed; I-22 kept in scope or explicitly deferred |
| Day 45 | M1 — Coherence foundation live | Preview wall removed, placeholders killed, route consolidation complete, dashboard and property workspace redesigned, trust primitives built |
| Day 75 | M2 — Money loops closed | Pricing + coverage + Hidden Asset Finder loops operational; savings receipt model live; instrumentation firing |
| Day 85 | M3 — Launch gate review | All Gate A–G criteria reviewed; any fails logged as P0 bugs with 5-day fix window |
| Day 90 | M4 — Launch gate passed | All gates pass; first real user cohort onboarded |

---

## 12) Instrumentation Readiness (Pre-User)

Since there are no real users yet, I-15 (instrumentation) is about **being ready**, not about measuring baselines.

### Event schema to implement before first user

| Event | Trigger | Properties |
|---|---|---|
| `session_started` | User logs in | `userId`, `propertyCount` |
| `property_onboarded` | First property created | `propertyId`, `onboardingDuration` |
| `workflow_started` | User enters a Tier 1 tool | `tool`, `propertyId`, `entryPoint` |
| `workflow_completed` | User reaches resolution in a tool | `tool`, `propertyId`, `durationSeconds` |
| `workflow_abandoned` | User exits a tool mid-flow | `tool`, `propertyId`, `exitStep` |
| `recommendation_shown` | Trust card rendered on a decision route | `tool`, `confidenceLevel`, `source` |
| `action_taken` | User clicks primary CTA on a recommendation | `tool`, `actionType`, `propertyId` |
| `action_completed` | Downstream action confirmed complete | `tool`, `actionType`, `propertyId` |
| `savings_projected` | Savings estimate surfaced to user | `tool`, `amountUsd`, `propertyId` |
| `savings_verified` | Savings confirmed after completion | `tool`, `amountUsd`, `propertyId` |
| `route_redirected` | Legacy route redirect fires | `oldRoute`, `canonicalRoute`, `redirectType` |
| `morning_brief_opened` | User opens Morning Brief | `propertyId`, `itemCount` |
| `morning_brief_cta_clicked` | User acts on Morning Brief action | `propertyId`, `actionType`, `tool` |

### What to measure with first cohort (not a baseline, a signal)

When the first real users arrive, the questions are qualitative and small-n:
- Does a new user complete property onboarding without confusion?
- Do users open Morning Brief and click through to a tool?
- Do users reach a resolution in at least one money workflow in their first week?
- Do any users hit a dead end, placeholder, or error in a Tier 1 flow?

These are pass/fail signals, not percentages. Statistical baselines come after a real cohort of 50–100 active users.

---

## 13) Launch Cohort Strategy (Day 90+)

The first cohort should be **controlled and watched closely**, not a public launch.

**Recommended first cohort:**
- 10–20 homeowners recruited directly (friends, network, beta list)
- Each has a real property with recent service activity or upcoming maintenance
- Founder or HOP does a 30-minute onboarding call with each
- Weekly check-in for the first 4 weeks

**What to learn from cohort 1:**
- Which Tier 1 tool do they use first, and do they complete it?
- Where do they get confused or drop off?
- Does Morning Brief surface something relevant to their actual home?
- Do they find a matched program in Hidden Asset Finder?
- Would they pay for this? What would they pay for?

**What not to do with cohort 1:**
- Do not open signups broadly until cohort 1 validates at least two money workflows end-to-end
- Do not add new features during cohort 1 observation period
- Do not measure aggregate metrics — watch individual sessions

---

## 14) RACI for Launch Gate Deliverables

| Deliverable | Responsible | Accountable | Consulted | Informed |
|---|---|---|---|---|
| IA lock + route map | HOP | Founder | DL, FEL, BEL | All |
| Dashboard + Property redesign | DL, FEL | HOP | Founder, QAL | All |
| Trust contract rollout | DL, BEL, FEL | HOP | DAL, QAL | All |
| Pricing closed loop | BEL, FEL | HOP | DAL, PAL | Founder |
| Coverage closed loop | BEL, FEL | HOP | DAL | Founder |
| Hidden Asset Finder closure | BEL, FEL | HOP | DAL | Founder |
| Morning Brief v2 | HOP, FEL, BEL | Founder | DAL, DL | All |
| Provider Booking trust | FEL, BEL | HOP | DL | All |
| Partner outreach | PAL | Founder | BEL | HOP |
| Instrumentation readiness | DAL, BEL | HOP | FEL | All |
| Launch gate sign-off | QAL | Founder | HOP, FEL, BEL, DAL | All |

---

## 15) Weekly Operating Rhythm

- **Monday:** Workstream standup + launch gate checklist review (15 min per lead)
- **Wednesday:** Product/design checkpoint + scope defense (60 min, HOP + DL + Founder)
- **Friday:** Demo of week's output + launch gate item status (45 min)

Artifacts updated weekly:
- Launch gate checklist (A–G item status: not started / in progress / done)
- Initiative burndown by effort
- Dependency risk log (partner contract status called out every week)
- Decision log

---

## 16) Immediate Next 7 Days

| Day | Action | Owner | Output |
|---|---|---|---|
| Day 1 | Assign named humans to I-01 through I-06 | Founder | Owner list published |
| Day 1 | Freeze new feature intake — no new routes or features until launch gate passes | HOP | Communicated to team |
| Day 1–2 | Draft canonical IA map and route decision list (redirect, merge, keep) for all remaining P0/P1 items | HOP + DL | Draft shared |
| Day 1–2 | **Begin partner outreach: assessor, insurance API, refinance** | PAL | First contact made |
| Day 2–3 | Draft trust contract schema and component spec | DL + BEL | Spec doc shared |
| Day 2–4 | Draft instrumentation event schema | DAL + HOP | Schema doc shared |
| Day 3–5 | Walk every Tier 1 user flow manually and log every dead end, placeholder, and broken loop | HOP + QAL | Defect list prioritized |
| Day 5–7 | Sign committed scope doc and publish not-now list | Founder + HOP | Scope doc signed |
| Day 7 | Schedule M0 gate review for Day 14 | HOP | Calendar invite sent |

---

## 17) Bottom Line

CtC is not ready for real users today. That is not a failure — it is the right assessment.

The product has serious depth, a defensible architecture, and the right features to win a category. What it needs before a first user arrives is coherence, closed loops, and trust.

**Three rules for this phase:**

1. **No new features until the launch gate passes.** Every engineering hour spent on a new feature before the gate is an hour not spent making existing features trustworthy and complete.

2. **A user who hits a dead end in their first session does not come back.** The launch gate exists to prevent this. Every gate item is a first-impression risk.

3. **The first cohort is not a metric exercise — it is a conversation.** Watch real people use the product. What breaks, what confuses, what delights. Metrics come after you understand the behavior.

If this plan is executed with discipline, CtC is ready for a first real cohort by Day 90 — and that cohort will experience a product that is coherent, trustworthy, and capable of delivering a completed money-saving outcome in their first week.
