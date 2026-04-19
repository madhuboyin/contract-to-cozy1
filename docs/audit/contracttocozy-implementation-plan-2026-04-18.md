# ContractToCozy — Pre-Launch Implementation Plan

**Date:** April 18, 2026
**Mode:** Agile, implementation-first. No ceremonies, no sign-offs. Ship, review, iterate.
**Rule:** No new features until the launch gate passes. Fix and close what exists.

---

## Launch Gate — Done When All Pass

- [ ] Preview wall gone. Site opens to real value for a new visitor.
- [ ] Zero "coming soon" or placeholder pages in any Tier 1 flow.
- [ ] All P0 + P1 duplicate routes redirected. Nav shows no duplicates.
- [ ] Trust contract live on all 6 Tier 1 decision routes (confidence, freshness, source, rationale).
- [ ] Pricing loop traversable end-to-end: Price Radar → Negotiation → Finalization → Booking handoff.
- [ ] Coverage loop traversable end-to-end: Intelligence → Options → Resolution handoff.
- [ ] Hidden Asset Finder: matched program → guided apply → outcome tracked.
- [ ] Refinance Radar: opportunity → scenario compare → clear next steps (internal, no partner needed).
- [ ] Morning Brief loads from real property data with at least one actionable CTA.
- [ ] Action Center populates from real property state.
- [ ] Provider booking shows reviews + response time. Booking completes without error.
- [ ] All Tier 1 routes pass mobile + desktop QA. No uncaught errors. No redirect loops.

---

## Sprint 1 — Lock and Clear (Weeks 1–2)

**Ship nothing until the IA is decided. Do these in parallel.**

- [ ] Walk every Tier 1 flow manually. Log every dead end, broken loop, and placeholder. This is the real backlog.
- [ ] Finalize canonical IA — every remaining P0/P1 route gets a decision: redirect, merge, or keep.
- [ ] Define trust contract schema — confidence, freshness, source, rationale fields for UI + API.
- [ ] Define instrumentation event schema — all funnel events specified before coding starts.
- [ ] Announce feature freeze to team.

---

## Sprint 2 — Coherence (Weeks 3–6)

Ship these in parallel across frontend and backend. IA decision from Sprint 1 is the prerequisite.

### Entry + cleanup
- [ ] Remove preview wall default on `/`.
- [ ] Remove all "coming soon" text from Tier 1 flows.
- [ ] Keep Plant Advisor in navigation — future monetization surface for plant seller CTAs.
- [ ] Trim Digital Twin to a single summary stub — remove multi-step flows.
- [ ] Remove all dead-end placeholder pages.

### Route consolidation — P0 deferred
- [ ] `/dashboard/risk-radar` → `/properties/:id/tools/home-event-radar` (confirm content maps first)
- [ ] `/dashboard/checklist` → `/dashboard/maintenance`
- [ ] `/dashboard/seasonal` → `/dashboard/maintenance?tab=seasonal` (seasonal tab must exist first)
- [ ] `/dashboard/replace-repair` → `/properties/:id/inventory/items/:itemId/replace-repair`
- [ ] `/dashboard/inspection-report` → `/properties/:id/reports?report=inspection`
- [ ] `/properties/[id]/rooms` → `/properties/[id]/inventory/rooms` (design decision: confirm same UX)
- [ ] `/properties/[id]/health-score` → `/properties/[id]/home-score?tab=health` (tab must exist first)
- [ ] `/properties/[id]/risk-assessment` → `/properties/[id]/home-score?tab=risk` (tab must exist first)

### Route consolidation — P1 (requires canonical builds)
- [ ] Build `/dashboard/tools` unified launcher → redirect `/dashboard/home-tools` + `/dashboard/ai-tools`
- [ ] Add `entry=insurance` mode to Coverage Intelligence → redirect `/dashboard/insurance`
- [ ] Add `tab=options` to Coverage Intelligence → redirect `/properties/:id/tools/coverage-options`
- [ ] Add `tab=trend` to Coverage Intelligence → redirect `/properties/:id/tools/insurance-trend`
- [ ] Interim: redirect `/properties/:id/tools/quote-comparison` → Price Radar `?workspace=quote`
- [ ] Add `mode=appeal` to Property Tax → redirect `/dashboard/tax-appeal`
- [ ] Add `view=budget` + `view=expenses` to True Cost → redirect `/dashboard/budget` + `/dashboard/expenses`
- [ ] Add `view=appreciation` to Capital Timeline → redirect `/dashboard/appreciation`

### Dashboard redesign
- [ ] Redesign `/dashboard` — outcome-first prioritized decision feed, one primary CTA per section, no card sprawl.
- [ ] Redesign `/dashboard/properties/[id]` — operating center, outcome-based tool navigation, persistent property context.

### Trust contract
- [ ] Build shared trust UI primitives: confidence badge, freshness label, source chip, rationale drawer.
- [ ] Apply trust contract to: Service Price Radar, Negotiation Shield, Coverage Intelligence, Refinance Radar, Hidden Asset Finder, Guidance Engine.
- [ ] Add explicit estimate disclaimers to all heuristic-only outputs (property tax, insurance trend).

### Instrumentation
- [ ] Implement all events from Sprint 1 schema: `workflow_started`, `workflow_step_reached`, `workflow_completed`, `workflow_abandoned`, `recommendation_shown`, `action_taken`, `savings_projected`, `savings_verified`, `route_redirected`, `morning_brief_opened`, `morning_brief_cta_clicked`, `dead_end_reached`.

---

## Sprint 3 — Close the Loops (Weeks 7–11)

Each loop must be traversable end-to-end with no dead ends before moving to Sprint 4.

### Pricing loop
- [ ] Connect Price Radar verdict → Negotiation Shield (context passed, no re-entry friction).
- [ ] Connect Negotiation Shield advice → Price Finalization (execution path, not just advice).
- [ ] Connect Price Finalization → Booking handoff (triggers booking flow, not a log entry).
- [ ] Add outcome receipt after booking (decision record + projected savings).
- [ ] Replace Quote Comparison placeholder with real side-by-side compare workspace + decision commit.

### Coverage loop
- [ ] Coverage Intelligence gap detection → Options tab → Resolution handoff — full path, no dead end.
- [ ] Retire standalone `coverage-options` and `insurance-trend` pages (merged as tabs above).
- [ ] Hardened resolution handoff: user knows exactly what to do next after a gap is found.

### Hidden Asset Finder
- [ ] Add guided apply flow per program type (each match type gets a concrete apply path).
- [ ] Add outcome tracking: applied / approved / savings confirmed states per program.
- [ ] Surface outcome record in savings ledger.

### Refinance Radar
- [ ] Build scenario compare view — show multiple rate/term scenarios side by side.
- [ ] Add "steps to act" guidance panel — concrete next steps a user can take today (internal, no live partner needed).
- [ ] Outcome: user leaves with a clear plan, not just an opportunity score.

### Savings ledger
- [ ] Savings receipt model — outcome entity (decision made, savings projected, savings verified).
- [ ] API endpoints for creating + reading savings records.
- [ ] Wire into pricing, coverage, HAF, and refinance outcomes.

---

## Sprint 4 — Daily Experience + Hardening (Weeks 12–13)

### Morning Brief
- [ ] Loads from real property data — no empty state, no error state on a real property.
- [ ] Shows one primary actionable CTA linked to a real Tier 1 tool.
- [ ] CTA is savings-anchored where possible (ties to savings ledger).
- [ ] No generic or placeholder content.

### Action Center
- [ ] Populates reliably from real property state.
- [ ] Completion proof — marking an action done updates state correctly.
- [ ] No stale or phantom items.

### Provider booking
- [ ] Provider cards show reviews and response time.
- [ ] Booking completion path hardened — no unhandled error states.

### QA pass
- [ ] Every Tier 1 route: manual walkthrough on mobile + desktop.
- [ ] Every P0/P1 redirect: direct URL hit + in-app navigation both work.
- [ ] No uncaught exceptions on any Tier 1 route.
- [ ] No redirect loops.
- [ ] Trust contract spot-checked: confidence/freshness/source visible on all 6 decision routes.
- [ ] Instrumentation spot-checked: key events fire in browser dev tools.

---

## Feature Gap Quick Reference

What each existing feature is missing — the specific things to close.

| Feature | Gap |
|---|---|
| Service Price Radar | Verdict stops here — no path to Negotiation Shield |
| Negotiation Shield | Advice stops here — no execution path to Finalization |
| Price Finalization | Logs decision — does not trigger booking |
| Quote Comparison | Placeholder — no real compare workspace |
| Coverage Intelligence | Gap detected — resolution path weak, options/trend are standalone wrappers |
| Hidden Asset Finder | Shows matches — no apply flow, no outcome tracking |
| Refinance Radar | Shows opportunity — no scenario compare, no next steps |
| Morning Brief | Can render empty/error — no savings anchor, no single CTA |
| Action Center | Can show stale items — completion proof inconsistent |
| Provider Booking | No reviews or response time — error states unhandled |
| Dashboard Home | Card sprawl — no prioritized decision feed |
| Property Workspace | Weak mental model — no operating center structure |
| Home Score | Separate health-score and risk-assessment routes — tab contract not built |
| Trust (all tools) | No standardized confidence/freshness/source component — heuristics presented without caveat |

---

## Remaining Routes — Status at Plan Start

Already done (redirect via `PropertyScopedToolRedirectPage`):
- `/dashboard/coverage-intelligence` ✅
- `/dashboard/risk-premium-optimizer` ✅
- `/dashboard/home-savings` ✅
- `/dashboard/do-nothing-simulator` ✅
- `/dashboard/home-event-radar` ✅
- `/dashboard/home-renovation-risk-advisor` ✅
- `/marketplace` ✅
- `/dashboard/inventory` ✅

Still to do — in Sprint 2 above.

---

## What Success Looks Like at Day 90

A recruited homeowner (someone you know, not a stranger from the internet) can:

1. Sign up, create a property, and reach the dashboard in under 10 minutes.
2. Open Morning Brief and click through to a real tool.
3. Run at least one money workflow end-to-end — get a recommendation they trust, take an action, and get confirmation something happened.
4. Come back the next day because there is something worth coming back to.

That is the bar. Ship toward that. Everything else is noise until it passes.
