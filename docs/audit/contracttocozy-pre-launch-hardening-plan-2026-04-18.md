# ContractToCozy Pre-Launch Hardening Plan

**Date:** April 18, 2026
**Scope:** Internal feature solidification only. No partner outreach, no external integrations, no new features. Partner and data integration work is deferred to a separate post-launch track.
**Context:** No real users yet. The product has serious depth but is not yet coherent or trustworthy enough for a first real homeowner. This plan hardens what exists before opening the door.
**Primary objective:** Every Tier 1 feature works end-to-end, is trustworthy, and leaves no user at a dead end. Launch gate passes. First cohort onboarded.

---

## 1) The One Rule

> **No new features until the launch gate passes.**

Every engineering hour spent building something new before the gate is an hour not spent making existing features trustworthy and complete. The audit is clear: CtC's risk is internal fragmentation, not missing features.

---

## 2) Launch Gate Criteria

The product does not open to real users until every item below is checked off.

### Gate A — No broken first impressions
- [ ] Preview wall removed as default on `/` — site opens to value, not a locked gate
- [ ] Zero customer-facing "coming soon" text in any Tier 1 user flow
- [ ] Zero placeholder routes that dead-end without a real experience
- [ ] Auth → property creation → dashboard completes without error for a fresh account
- [ ] A new user can fully onboard one property in under 10 minutes

### Gate B — Route coherence
- [ ] All remaining P0 duplicate global routes resolved or redirected
- [ ] All P1 canonical routes built and redirects live
- [ ] Navigation exposes only canonical routes — no duplicate sidebar entries for the same job
- [ ] No in-app link points to a dead or placeholder route

### Gate C — Trust contract on Tier 1 decision routes
- [ ] Every recommendation surface in the following tools shows confidence level, data freshness, source, and rationale:
  - Service Price Radar
  - Negotiation Shield
  - Coverage Intelligence
  - Refinance Radar
  - Hidden Asset Finder
  - Guidance Engine
- [ ] No heuristic-only output is presented without an explicit caveat explaining it is an estimate

### Gate D — Closed loops on money workflows
- [ ] **Pricing:** Service Price Radar → Negotiation Shield → Price Finalization → Booking handoff — traversable end-to-end without a dead end
- [ ] **Coverage:** Coverage Intelligence → Coverage Options → Resolution handoff — gap detected, action available
- [ ] **Hidden Asset Finder:** Matched program → guided apply flow → outcome tracked — not just a list
- [ ] **Refinance Radar:** Opportunity shown → scenario compare → clear next step (internal guidance, no live partner required)

### Gate E — Core daily experience
- [ ] Morning Brief loads from real property data and shows at least one actionable item
- [ ] Morning Brief CTA links to a real Tier 1 tool, not a placeholder
- [ ] Action Center populates from real property state
- [ ] Maintenance and seasonal tasks generate correctly for a real property

### Gate F — Provider booking
- [ ] Provider cards show at minimum: reviews and response time
- [ ] Booking flow completes without error from provider selection to confirmation

### Gate G — QA
- [ ] All Tier 1 routes pass manual QA on mobile and desktop
- [ ] No uncaught exceptions or console errors on Tier 1 routes
- [ ] No redirect loops on any canonicalized route
- [ ] All redirect telemetry events fire correctly

---

## 3) What Solidifying Means Per Audit Bucket

| Audit Bucket | Hardening Work |
|---|---|
| **Double Down** | Close every open loop. No tool ends at an insight without an available next action. Trust contract applied. |
| **Upgrade** | Dashboard and property workspace redesigned around outcomes. Home Score and Timeline improved to functional standard. Morning Brief functional on real data. |
| **Merge** | All remaining route consolidation complete. Canonical IA enforced in navigation. |
| **Kill / Pause** | Plant Advisor hidden. Digital Twin trimmed to a stub. All "coming soon" removed from user-facing flows. |

---

## 4) Workstreams

| ID | Workstream | Objective | Owner | Gate |
|---|---|---|---|---|
| WS-01 | IA Lock + Route Consolidation | Canonical navigation and redirects for all remaining P0 and P1 items | HOP + FEL | B |
| WS-02 | Entry + Funnel Unblock | Remove preview wall, coming-soon markers, placeholder pages | GL + FEL | A |
| WS-03 | Kill / Pause Cleanup | Hide Plant Advisor, stub Digital Twin, remove dead-end pages | FEL | A |
| WS-04 | Dashboard + Property Workspace Redesign | Outcome-first command surfaces | DL + FEL | E |
| WS-05 | Trust Contract | Trust primitives + rollout on all Tier 1 decision routes | DL + BEL + FEL | C |
| WS-06 | Pricing Closed Loop | Price Radar → Negotiation → Finalization → Booking handoff | BEL + FEL | D |
| WS-07 | Coverage Closed Loop | Intelligence → Options → Resolution handoff | BEL + FEL | D |
| WS-08 | Hidden Asset Finder Closure | Guided apply flow + outcome tracking | BEL + FEL | D |
| WS-09 | Refinance Radar Hardening | Opportunity → scenario compare → internal next-step guidance (no live partner required) | BEL + FEL | D |
| WS-10 | Morning Brief + Action Center | Daily anchor functional on real property data | HOP + BEL + FEL | E |
| WS-11 | Provider Booking Trust | Reviews and response time visible in booking UX | FEL + BEL | F |
| WS-12 | Instrumentation Readiness | Event schema + analytics instrumentation ready before first user | DAL + BEL + FEL | Pre-launch |
| WS-13 | QA + Launch Hardening | Full Tier 1 QA pass, redirect validation, mobile QA, launch gate sign-off | QAL + FEL + BEL | G |

---

## 5) Remaining Route Consolidation Work

### P0 deferred — all must complete before launch gate (Gate B)

| Old Route | Canonical Target | Pre-Condition |
|---|---|---|
| `/dashboard/risk-radar` | `/properties/:id/tools/home-event-radar` | Confirm risk-radar content maps cleanly to event-radar; resolve any content gaps first |
| `/dashboard/checklist` | `/dashboard/maintenance` | Validate no active buyer flows still depend on `/checklist` path |
| `/dashboard/seasonal` | `/dashboard/maintenance?tab=seasonal` | Seasonal tab must exist in maintenance shell before redirect |
| `/dashboard/replace-repair` | `/properties/:id/inventory/items/:itemId/replace-repair` | Item-scoped URL resolver must handle missing `itemId` gracefully |
| `/dashboard/inspection-report` | `/properties/:id/reports?report=inspection` | Confirm inspection report and report ledger are the same surface |
| `/properties/[id]/rooms` | `/properties/[id]/inventory/rooms` | Design decision: confirm rooms and inventory/rooms are the same UX; implement redirect |
| `/properties/[id]/health-score` | `/properties/[id]/home-score?tab=health` | Home-score tab contract must be built before redirect |
| `/properties/[id]/risk-assessment` | `/properties/[id]/home-score?tab=risk` | Home-score tab contract must be built before redirect |

### P1 — all must complete before launch gate (Gate B)

| Old Route | Canonical Target | Build Required |
|---|---|---|
| `/dashboard/home-tools` + `/dashboard/ai-tools` | `/dashboard/tools` | Build unified tool launcher route |
| `/dashboard/insurance` | `/properties/:id/tools/coverage-intelligence?entry=insurance` | Coverage route accepts `entry=insurance` mode |
| `/properties/:id/tools/coverage-options` | Coverage Intelligence `?tab=options` | Add options tab to coverage intelligence |
| `/properties/:id/tools/insurance-trend` | Coverage Intelligence `?tab=trend` | Add trend tab to coverage intelligence |
| `/properties/:id/tools/quote-comparison` | Service Price Radar `?workspace=quote` | Interim redirect until real quote workspace ships in WS-06 |
| `/dashboard/tax-appeal` | `/properties/:id/tools/property-tax?mode=appeal` | Property-tax route accepts `mode=appeal` |
| `/dashboard/budget` + `/dashboard/expenses` | True Cost `?view=budget` / `?view=expenses` | True-cost view modes |
| `/dashboard/appreciation` | Capital Timeline `?view=appreciation` | Capital timeline accepts `view=appreciation` |

---

## 6) Feature Gap Register (Audit-Derived)

These are the specific gaps identified in the audit that must be closed before launch. This is the hardening backlog — not new features, but completion of what already exists.

### Pricing toolchain gaps
- Quote Comparison is a placeholder — replace with real side-by-side compare workspace
- Negotiation Shield ends at advice — add execution path to Price Finalization
- Price Finalization logs a decision but does not trigger a booking — connect to booking handoff
- No outcome receipt after booking — add savings/decision record

### Coverage toolchain gaps
- Coverage Intelligence detects gaps but resolution path is weak — build options → handoff flow
- Coverage Options is a thin wrapper — merge into Coverage Intelligence as a tab
- Insurance Trend is heuristic-only — add explicit data source caveat or merge under Coverage Intelligence trend tab

### Hidden Asset Finder gaps
- Matches programs but stops at a list — add guided apply flow per program type
- No outcome tracking after apply — add outcome record (applied, approved, savings confirmed)

### Refinance Radar gaps
- Surfaces opportunity but no scenario compare — build scenario comparison view internally
- No clear next step after opportunity is shown — add "steps to act" guidance (internal, no live partner rails needed)

### Trust gaps (across all Tier 1 tools)
- No standardized confidence / freshness / source / rationale component — build once, apply everywhere
- Several tools show AI-generated output without provenance — add source labels
- Heuristic models (property tax estimate, insurance trend) present outputs without caveat — add explicit estimate disclaimers

### Dashboard and navigation gaps
- Dashboard home is a card sprawl — redesign as prioritized decision feed
- Property workspace has weak mental model — redesign as operating center
- Tool catalog IA is tool-inventory-based — replace with outcome-based navigation
- Morning Brief does not anchor to a single action — redesign with one primary CTA

### Daily experience gaps
- Morning Brief can render empty or in error state on a real property — harden data loading
- Action Center does not always reflect real property state — harden data sources
- Maintenance tasks may not generate for new properties — validate seeding and generation logic

### Provider booking gaps
- Provider cards lack trust metadata — add reviews and response time at minimum
- Booking flow has error states not handled — harden completion path

### Kill / Pause gaps
- Plant Advisor is live but low-value — hide from navigation and user-facing routes
- Digital Twin is partial — trim to a single summary card, remove multi-step flows
- "Coming soon" labels visible in Tier 1 flows — remove entirely

---

## 7) Plan by Phase

### Phase 0: Lock (Days 1–14)

**Goal:** Align the team, lock the IA, define the trust contract, define instrumentation schema. No feature work ships without all four in place.

| ID | Initiative | Owner | Effort (pw) | Deliverable |
|---|---|---:|---|---|
| I-01 | Lock canonical IA and route decision list — every remaining P0/P1 route gets a decision (redirect / merge / keep) | HOP + DL | 4 | Approved IA map |
| I-02 | Sign committed scope; publish not-now list and feature freeze notice | Founder + HOP | 1 | Scope doc signed |
| I-03 | Define trust contract schema — confidence, freshness, source, rationale fields (UI + API) | DL + BEL | 3 | Trust contract spec v1 |
| I-04 | Define instrumentation event schema — all Tier 1 funnel events specified before implementation | DAL + HOP | 2 | Event schema doc |
| I-05 | Walk every Tier 1 flow manually — log every dead end, placeholder, broken loop, and trust gap | HOP + QAL | 2 | Prioritized defect + gap register |
| I-06 | Delivery governance — weekly launch gate checklist review, risk log, decision log | HOP | 1 | Operating cadence live |

**Phase 0 effort:** 13 pw

---

### Phase 1: Coherence (Days 15–45)

**Goal:** A first-time user hits a real product. No gates, no dead ends, no broken navigation. App shell redesigned. Trust primitives built. All route consolidation done. Kill/pause work complete.

| ID | Initiative | Owner | Effort (pw) | Dependencies | Deliverable |
|---|---|---:|---|---|---|
| I-07 | Remove preview wall + all "coming soon" artifacts from Tier 1 flows | GL + FEL | 3 | I-02 | Public entry live; Gate A partial |
| I-08 | Kill/pause: hide Plant Advisor, stub Digital Twin, remove all dead-end placeholder pages | FEL | 3 | I-01 | No dead-end pages in user-facing routes; Gate A partial |
| I-09 | Complete all P0 deferred route redirects | FEL + BEL | 8 | I-01 IA decision | All P0 redirects live; Gate B partial |
| I-10 | Build P1 canonical routes and redirects (tool launcher, coverage tabs, insurance entry, quote-comparison interim, budget/expenses/appreciation/tax-appeal) | FEL + BEL | 10 | I-01 IA decision | All P1 redirects live; Gate B complete |
| I-11 | Redesign Dashboard Home — outcome-first, prioritized decision feed, one primary CTA per section | DL + FEL | 10 | I-01 | New `/dashboard` shipped |
| I-12 | Redesign Property Workspace — operating center, outcome-based tool navigation | DL + FEL | 10 | I-01 | New `/dashboard/properties/[id]` shipped |
| I-13 | Build shared trust UI primitives — confidence badge, freshness label, source chip, rationale drawer | DL + FEL | 6 | I-03 | Reusable trust component library |
| I-14 | Apply trust contract to all 6 Tier 1 decision routes — Price Radar, Negotiation Shield, Coverage Intelligence, Refinance Radar, Hidden Asset Finder, Guidance Engine | FEL + BEL | 8 | I-13 | Gate C complete |
| I-15 | Implement all instrumentation events per schema | DAL + FEL + BEL | 5 | I-04 | Analytics ready to fire on first user |
| I-16 | QA gates — visual regression checklist + mobile review process enforced | QAL + FEL | 3 | I-11, I-12 | Release checklist live |

**Phase 1 effort:** 66 pw

---

### Phase 2: Close the loops (Days 46–75)

**Goal:** All four money workflows are traversable end-to-end. No dead ends inside a workflow. Hidden Asset Finder apply flow live. Savings receipt model in place.

| ID | Initiative | Owner | Effort (pw) | Dependencies | Deliverable |
|---|---|---:|---|---|---|
| I-17 | Pricing loop — unify Price Radar → Negotiation Shield → Price Finalization → Booking handoff; add outcome receipt | BEL + FEL | 14 | I-09, I-14 | End-to-end pricing workflow; Gate D partial |
| I-18 | Real quote compare workspace — replace placeholder with side-by-side compare + decision commit | FEL + BEL | 8 | I-17 | Functional quote compare; Gate D partial |
| I-19 | Coverage loop — Coverage Intelligence → Options tab → Resolution handoff; add trend tab; retire standalone wrappers | BEL + FEL | 12 | I-10, I-14 | Coverage resolution flow v1; Gate D partial |
| I-20 | Hidden Asset Finder — guided apply flow per program type + outcome tracking (applied / approved / savings confirmed) | BEL + FEL | 8 | I-19 patterns | Apply flow live, outcome tracked; Gate D partial |
| I-21 | Refinance Radar — scenario compare view + internal next-step guidance ("steps to act" — no live partner rails needed) | BEL + FEL | 8 | I-14 | Refinance loop hardened internally; Gate D complete |
| I-22 | Savings receipt model — outcome entity + API (decision made, savings projected, savings verified) | DAL + BEL | 6 | I-17, I-19, I-20 | Savings ledger ready |

**Phase 2 effort:** 56 pw

---

### Phase 3: Harden + launch (Days 76–90)

**Goal:** Daily experience functional on real data. Provider trust upgraded. Full QA pass. Launch gate signed off. First cohort onboarded.

| ID | Initiative | Owner | Effort (pw) | Dependencies | Deliverable |
|---|---|---:|---|---|---|
| I-23 | Morning Brief v2 — loads from real property data, one primary actionable CTA, savings-anchored, no empty/error states | HOP + FEL + BEL | 8 | I-22, I-15 | Daily brief functional; Gate E partial |
| I-24 | Action Center hardening — populates from real property state, completion proof, no stale items | BEL + FEL | 4 | I-22 | Action Center reliable; Gate E complete |
| I-25 | Provider Booking trust — add reviews and response time to provider cards; harden booking completion path | FEL + BEL | 5 | I-13 primitives | Booking trust upgraded; Gate F complete |
| I-26 | Full Tier 1 QA pass — mobile + desktop, every redirect validated, no console errors, no loops, trust contract spot-checked | QAL + FEL + BEL | 10 | All prior | Release candidate; Gate G complete |
| I-27 | Launch gate sign-off — founder walks every gate criterion; any fail is a P0 bug with 48-hour fix window | Founder + HOP + QAL | 2 | I-26 | Launch gate passed or P0 bugs logged |

**Phase 3 effort:** 29 pw

---

## 8) Effort Summary

| Phase | Effort (pw) |
|---|---:|
| Phase 0 — Lock | 13 |
| Phase 1 — Coherence | 66 |
| Phase 2 — Close the loops | 56 |
| Phase 3 — Harden + launch | 29 |
| **Total** | **164 pw** |

> At 100–120 pw team capacity this is tight. Apply the pre-decided cuts in Section 9 at Day 45 if tracking behind — do not carry hidden over-commitment.

---

## 9) Scope Control (Pre-Decided Cuts)

If tracking behind at Day 45 gate review, cut in this exact order. These decisions are made now, not under deadline pressure.

**Cut first:**
1. Real quote compare workspace (I-18) — keep interim redirect to Price Radar; ship real workspace post-launch
2. Refinance scenario compare (I-21) — reduce to hardened opportunity view + "steps to act" text; full scenario compare post-launch
3. P1 low-traffic canonical builds (tax-appeal, budget/expenses, appreciation) — redirect to parent tool root instead of specific view mode

**Cut second (severe constraint only):**
4. Provider booking trust (I-25) — reduce to reviews only; defer response time and completion rate
5. Morning Brief savings-anchored redesign (I-23) — reduce to data hardening only; UX redesign post-launch

**Do NOT cut:**
- IA lock (I-01) — gates everything downstream
- Entry unblock + kill/pause (I-07, I-08) — launch gate A cannot pass without these
- Route consolidation (I-09, I-10) — launch gate B cannot pass without these
- Trust primitives + rollout (I-13, I-14) — launch gate C cannot pass without these
- Pricing and coverage closed loops (I-17, I-19) — launch gate D core requirement
- Hidden Asset Finder apply flow (I-20) — audit rates this as Tier 1 Critical; it is not a nice-to-have
- Morning Brief data hardening (I-23) — launch gate E; empty state on first load is a first-impression failure
- Full QA pass (I-26) — launch gate G

---

## 10) Dependency Graph (Critical Path)

```
I-01 IA lock
  → I-09 P0 route redirects         (W3–W5)
  → I-10 P1 canonical builds        (W3–W6)
  → I-11 Dashboard redesign         (W3–W7)
  → I-12 Property workspace          (W4–W8)

I-03 Trust schema
  → I-13 Trust primitives           (W4–W6)
      → I-14 Trust rollout          (W6–W8)
      → I-17 Pricing loop           (W7–W10)  ─┐
      → I-19 Coverage loop          (W8–W11)  ─┤→ I-22 Savings ledger
          → I-20 HAF apply flow     (W9–W11)  ─┘      → I-23 Morning Brief v2
      → I-21 Refinance hardening    (W8–W11)           → I-24 Action Center
                                                         → I-26 QA pass
                                                             → I-27 Launch gate
```

---

## 11) Milestones and Launch Gate Schedule

| Target | Milestone | Exit Criteria |
|---|---|---|
| Day 14 | M0 — Foundations locked | IA approved, scope signed, trust schema done, event schema done, defect register prioritized |
| Day 45 | M1 — Coherence live | Preview wall gone, placeholders killed, route consolidation done, dashboard + workspace redesigned, trust primitives built, trust contract on Tier 1 routes |
| Day 75 | M2 — Loops closed | Pricing, coverage, HAF, and refinance loops traversable end-to-end; savings receipt model live; instrumentation firing |
| Day 85 | M3 — Launch gate review | Founder + HOP + QAL walk all Gate A–G criteria; any fail is a P0 bug with 48-hour fix |
| Day 90 | M4 — First cohort onboarded | All gates pass; 10–20 directly recruited homeowners onboarded |

---

## 12) Instrumentation Readiness

No real users means no baselines — but instrumentation must be in place before user #1 arrives so data flows from day one.

### Events to instrument before launch (I-15)

| Event | Trigger | Key Properties |
|---|---|---|
| `session_started` | User logs in | `userId`, `propertyCount` |
| `property_onboarded` | First property created | `propertyId`, `durationSeconds` |
| `workflow_started` | User enters a Tier 1 tool | `tool`, `propertyId`, `entryPoint` |
| `workflow_step_reached` | User reaches each step of a tool | `tool`, `step`, `propertyId` |
| `workflow_completed` | User reaches resolution | `tool`, `propertyId`, `durationSeconds` |
| `workflow_abandoned` | User exits mid-flow | `tool`, `exitStep`, `propertyId` |
| `recommendation_shown` | Trust card rendered | `tool`, `confidenceLevel`, `source` |
| `action_taken` | User clicks primary CTA | `tool`, `actionType`, `propertyId` |
| `savings_projected` | Savings estimate surfaced | `tool`, `amountUsd`, `propertyId` |
| `savings_verified` | Savings confirmed | `tool`, `amountUsd`, `propertyId` |
| `route_redirected` | Legacy route fires | `oldRoute`, `canonicalRoute`, `redirectType` |
| `morning_brief_opened` | User opens Morning Brief | `propertyId`, `itemCount` |
| `morning_brief_cta_clicked` | User acts on brief item | `actionType`, `tool`, `propertyId` |
| `dead_end_reached` | User hits a page with no forward action | `route`, `propertyId` |

### What to learn from first cohort (not metrics, signals)

Statistical baselines require 50–100 active users. The first cohort of 10–20 answers qualitative questions:

- Does a new user complete property onboarding without confusion?
- Does at least one money workflow resolve end-to-end in the first week?
- Does Morning Brief show something relevant to their actual home?
- Does any user hit a dead end or error in a Tier 1 flow?
- Would they pay for this? What specifically?

---

## 13) First Cohort Approach (Day 90+)

**Who:** 10–20 homeowners recruited directly — network, beta waitlist, or trusted contacts. Each has a real property with recent service activity or upcoming maintenance.

**How:** Founder or HOP conducts a 30-minute onboarding call with each user. Not a demo — they drive, you watch.

**During cohort 1:**
- No new features shipped
- Weekly check-in call with each user for 4 weeks
- Watch session recordings for confusion and drop-off
- Log every broken moment as a P0 fix

**When to open broader:**
Only after cohort 1 validates that at least two Tier 1 money workflows complete end-to-end for real users on real properties. Do not open signups until this is confirmed.

---

## 14) RACI

| Deliverable | Responsible | Accountable | Consulted | Informed |
|---|---|---|---|---|
| IA lock + route decisions | HOP | Founder | DL, FEL, BEL | All |
| Dashboard + property workspace | DL, FEL | HOP | Founder, QAL | All |
| Trust contract rollout | DL, BEL, FEL | HOP | DAL, QAL | All |
| Pricing closed loop | BEL, FEL | HOP | DAL | Founder |
| Coverage closed loop | BEL, FEL | HOP | DAL | Founder |
| Hidden Asset Finder apply flow | BEL, FEL | HOP | DAL | Founder |
| Refinance Radar hardening | BEL, FEL | HOP | DL | Founder |
| Morning Brief v2 | HOP, FEL, BEL | Founder | DAL, DL | All |
| Provider Booking trust | FEL, BEL | HOP | DL | All |
| Instrumentation readiness | DAL, BEL, FEL | HOP | — | All |
| Launch gate sign-off | QAL | Founder | HOP, FEL, BEL, DAL | All |

---

## 15) Weekly Operating Rhythm

- **Monday:** Workstream standup + launch gate checklist status (15 min per lead)
- **Wednesday:** Product + design checkpoint — scope defense, any cut decisions (60 min, HOP + DL + Founder)
- **Friday:** Demo of week's output + gate item review (45 min)

Artifacts updated weekly:
- Launch gate checklist (A–G, each item: not started / in progress / done)
- Initiative burndown
- Risk log
- Decision log

---

## 16) Immediate Next 7 Days

| Day | Action | Owner | Output |
|---|---|---|---|
| Day 1 | Assign named owners to I-01 through I-06 | Founder | Owner list shared with team |
| Day 1 | Announce feature freeze — no new routes or features until launch gate passes | HOP | Written to team |
| Day 1–2 | Manually walk every Tier 1 flow; log every dead end, placeholder, broken loop, and trust gap | HOP + QAL | Defect and gap register |
| Day 2–3 | Draft canonical IA map — every remaining P0/P1 route gets a decision | HOP + DL | Draft for review |
| Day 3–4 | Draft trust contract schema and UI component spec | DL + BEL | Spec doc shared |
| Day 3–5 | Draft instrumentation event schema | DAL + HOP | Schema doc shared |
| Day 5–7 | Sign committed scope doc and publish not-now list | Founder + HOP | Scope doc signed |
| Day 7 | Schedule M0 gate review for Day 14 | HOP | Calendar invite sent |

---

## 17) Bottom Line

CtC is not ready for real users today. That is the right call to make now rather than after a first cohort churns.

The product has the right features to win a category. What it lacks is coherence and closure. Every Tier 1 tool exists — but several stop at insight, leave a dead end, or skip the trust framing that makes a recommendation credible.

This plan fixes that. No new features. No external dependencies. Pure internal hardening.

When the launch gate passes, the first user will onboard a real property, see a trustworthy recommendation, take an action, and get proof that something happened. That is the bar. That is what this plan delivers.
