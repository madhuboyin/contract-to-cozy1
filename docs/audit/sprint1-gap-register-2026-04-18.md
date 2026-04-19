# Sprint 1 — Gap Register

**Date:** April 18, 2026
**Source:** Manual codebase walkthrough of all Tier 1 tool client components and supporting infrastructure.
**Purpose:** Authoritative backlog for Sprint 2 and Sprint 3 work. Every dead end, broken loop, missing trust signal, and placeholder found.

---

## Status of Sprint 1 Deliverables

- [x] Codebase walkthrough — all Tier 1 tool flows read and assessed
- [x] Instrumentation event schema — created at `src/lib/analytics/events.ts`
- [x] Trust contract schema — already existed at `src/lib/trust/trustContract.ts`
- [x] Trust presets — existing presets confirmed; added `hiddenAssetTrust` and `guidanceEngineTrust` to `src/lib/trust/trustPresets.ts`
- [x] Route consolidation status confirmed — P0-safe already done; P0 deferred and P1 remain for Sprint 2
- [x] Feature freeze — to be communicated to team

---

## 1) Dead Ends and Broken Loops

### CRITICAL — Refinance Radar: "Get refinance quotes" is a dead button
**File:** `MortgageRefinanceRadarClient.tsx`
**Problem:** The primary exit CTA "Get refinance quotes" renders as a disabled-equivalent button with no `href` and no `onClick` handler. A user who reaches an open opportunity hits a wall.
**Fix (Sprint 3):** Wire the button to the scenario compare view being built in I-21. Until that ships, render the button as "View next steps" linking to the steps-to-act guidance panel.

### HIGH — Negotiation Shield: exits to `/dashboard/properties`, not Price Finalization
**File:** `NegotiationShieldToolClient.tsx`
**Problem:** The tool's primary exit routes the user back to the properties page (`router.push('/dashboard/properties')`). The pricing loop requires Negotiation Shield → Price Finalization. This connection is missing.
**Fix (Sprint 3 / I-17):** After a draft is copied or a case is resolved, the exit CTA should navigate to Price Finalization with the case context pre-populated (vendor name, final price, guidance params forwarded).

### HIGH — Hidden Asset Finder: stops at "Mark as Pursuing", no apply flow
**File:** `HiddenAssetFinderClient.tsx`
**Problem:** When a user marks a match as "Pursuing", the detail sheet closes and they return to the list. There is no guided apply flow per program type, no next-step instructions, and no outcome tracking (applied / approved / savings confirmed).
**Fix (Sprint 3 / I-20):** Each program type needs a concrete apply path — at minimum a "Steps to apply" panel with action items and an outcome state machine (pursuing → applied → approved → savings confirmed).

### MEDIUM — Guidance Overview: "Next step is being prepared" disabled state
**File:** `GuidanceOverviewClient.tsx`
**Problem:** When `resolveGuidanceStepHref()` fails to resolve a tool URL, the step CTA renders as a disabled button with the text "Next step is being prepared." This is vague and leaves users stuck.
**Fix (Sprint 2):** Replace the disabled state with either (a) a fallback action (contact support, view related tools) or (b) an explicit message with an ETA or manual workaround.

---

## 2) Trust Signal Gaps

### Hidden Asset Finder — no tool-level trust summary
**File:** `HiddenAssetFinderClient.tsx`
**Problem:** Trust signals exist per match (confidence badge, last-verified date, source link) but there is no tool-level trust card. Per the trust contract spec, every Tier 1 decision route needs a tool-level confidence/freshness/source/rationale block.
**Fix (Sprint 2):** Add `hiddenAssetTrust()` (now in `trustPresets.ts`) to the tool's header section. Preset created in Sprint 1.

### Guidance Engine — trust is centralized in layout, not inline
**File:** `GuidanceOverviewClient.tsx`
**Problem:** Trust info renders via a `TrustPanel` component in the page layout rather than inline on the active step. For multi-step journeys this means trust context disappears as the user navigates steps.
**Fix (Sprint 2):** Render `guidanceEngineTrust()` (now in `trustPresets.ts`) inline on each active step card, not only in the layout panel. Preset created in Sprint 1.

### Insurance Trend and Property Tax — heuristic outputs with no caveat
**Files:** `InsuranceTrendClient.tsx`, `PropertyTaxClient.tsx`
**Problem:** Both tools present model estimates without an explicit disclaimer that the output is a heuristic estimate, not a verified figure. The audit flagged this as a trust failure.
**Fix (Sprint 2):** Add an explicit "This is an estimate" caveat banner with data source explanation. Use `coverageLoopTrust` for Insurance Trend (merge candidate) and a new property-tax preset for Property Tax.

---

## 3) Placeholder and Coming-Soon Content

### Mortgage Refinance Radar — dead primary CTA (see §1 above)
This is both a dead end and a placeholder. The button visually implies an action exists but doesn't do anything.

### No other "coming soon" text found in Tier 1 tools
The global dashboard pages (`/dashboard/budget`, `/dashboard/expenses`, `/dashboard/appreciation`, `/dashboard/energy`, `/dashboard/climate`, `/dashboard/modifications`, `/dashboard/moving-concierge`, `/dashboard/visual-inspector`) use `SelectValue placeholder="Choose a property"` which is standard form UI — not coming-soon content. These are real pages.

**One item flagged for Sprint 2:** `/dashboard/bookings` has a cancel-booking modal with `placeholder="Please provide a reason"` — form UI, fine.

---

## 4) Route Consolidation Status

### Already done (PropertyScopedToolRedirectPage)
| Route | Status |
|---|---|
| `/dashboard/coverage-intelligence` | ✅ Done |
| `/dashboard/risk-premium-optimizer` | ✅ Done |
| `/dashboard/home-savings` | ✅ Done |
| `/dashboard/do-nothing-simulator` | ✅ Done |
| `/dashboard/home-event-radar` | ✅ Done |
| `/dashboard/home-renovation-risk-advisor` | ✅ Done |
| `/marketplace` | ✅ Done (directory removed) |
| `/dashboard/inventory` | ✅ Done |

### P0 deferred — Sprint 2 work (I-09)

| Route | Canonical Target | Pre-Condition to Resolve in Sprint 2 |
|---|---|---|
| `/dashboard/risk-radar` | `/properties/:id/tools/home-event-radar` | Confirm risk-radar content maps cleanly; 216-line page still live |
| `/dashboard/checklist` | `/dashboard/maintenance` | Validate no buyer flows depend on this path; 361-line page still live |
| `/dashboard/seasonal` | `/dashboard/maintenance?tab=seasonal` | Seasonal tab must exist in maintenance shell first; 303-line page still live |
| `/dashboard/replace-repair` | `/properties/:id/inventory/items/:itemId/replace-repair` | Item-scoped URL resolver; 259-line page still live |
| `/dashboard/inspection-report` | `/properties/:id/reports?report=inspection` | Confirm inspection surface matches report ledger |
| `/properties/[id]/rooms` | `/properties/[id]/inventory/rooms` | Still a real RoomsHubClient; design decision: same UX? |
| `/properties/[id]/health-score` | `/properties/[id]/home-score?tab=health` | Tab contract not yet built in home-score |
| `/properties/[id]/risk-assessment` | `/properties/[id]/home-score?tab=risk` | Tab contract not yet built in home-score |

### P1 — Sprint 2 work (I-10, requires canonical builds)

| Old Route | Canonical Target | Build Required |
|---|---|---|
| `/dashboard/home-tools` + `/dashboard/ai-tools` | `/dashboard/tools` | New unified tool launcher |
| `/dashboard/insurance` | Coverage Intelligence `?entry=insurance` | Entry mode param |
| `/properties/:id/tools/coverage-options` | Coverage Intelligence `?tab=options` | Options tab |
| `/properties/:id/tools/insurance-trend` | Coverage Intelligence `?tab=trend` | Trend tab |
| `/properties/:id/tools/quote-comparison` | Price Radar `?workspace=quote` | Interim redirect only |
| `/dashboard/tax-appeal` | Property Tax `?mode=appeal` | Mode param |
| `/dashboard/budget` + `/dashboard/expenses` | True Cost `?view=budget/expenses` | View params |
| `/dashboard/appreciation` | Capital Timeline `?view=appreciation` | View param |

---

## 5) Instrumentation Status

### Created in Sprint 1
**File:** `src/lib/analytics/events.ts`

Defines:
- `CtcEventName` — typed union of all 15 product funnel events
- `CtcTool` — typed union of all Tier 1 tool identifiers
- `CtcEventProperties` — per-event typed property shapes
- `track(event, properties)` — single call site; routes to Faro when configured, falls back to `console.debug` in dev

### Existing tracking (scattered, untyped)
- Plant Advisor: own `trackEvent` prop pattern — not connected to `events.ts`. Migrate in Sprint 2. Note: Plant Advisor stays in nav — future plant seller CTA surface.
- Negotiation Shield: own `trackEvent` prop pattern — not connected to `events.ts`. Migrate in Sprint 2.
- Route redirects: no `route_redirected` event fires yet from `PropertyScopedToolRedirectPage`. Add in Sprint 2.

### What fires nothing today
Every Tier 1 tool except Plant Advisor and Negotiation Shield (which have own untyped patterns). All workflow_started, workflow_completed, savings_projected events are unimplemented. Sprint 2 wires these up.

---

## 6) Trust Presets — Final State After Sprint 1

`src/lib/trust/trustPresets.ts` now exports:

| Function | Covers | Status |
|---|---|---|
| `pricingLoopTrust()` | Price Radar, Quote Comparison, Price Finalization | ✅ Existed |
| `coverageLoopTrust()` | Coverage Intelligence, Coverage Options | ✅ Existed |
| `refinanceLoopTrust()` | Mortgage Refinance Radar | ✅ Existed |
| `negotiationLoopTrust()` | Negotiation Shield | ✅ Existed |
| `hiddenAssetTrust()` | Hidden Asset Finder | ✅ Added Sprint 1 |
| `guidanceEngineTrust()` | Guidance Overview | ✅ Added Sprint 1 |

Property Tax and Insurance Trend need new presets when they are rebuilt/merged in Sprint 2.

---

## 7) Sprint 2 Priority Order

Based on this walkthrough, the recommended execution order for Sprint 2:

1. **Entry + cleanup** (I-07, I-08) — preview wall, Digital Twin stub. Lowest risk, unblocks first impressions immediately. Plant Advisor stays in nav — future plant seller CTA surface.
2. **P0 route redirects** (I-09) — resolve design decisions for rooms/health-score/risk-assessment first, then implement redirects.
3. **Trust rollout** (I-13, I-14) — build shared trust UI primitives, wire `hiddenAssetTrust` and `guidanceEngineTrust` presets into their tools. HAF and Guidance are the two trust gaps.
4. **Dashboard + workspace redesign** (I-11, I-12) — can run in parallel with trust rollout.
5. **P1 canonical builds + redirects** (I-10) — after IA decisions confirmed.
6. **Instrumentation wiring** (I-15) — add `track()` calls to all Tier 1 tool entry points after trust and routing are stable.

---

## 8) Decisions Needed Before Sprint 2 Starts

These require a product decision, not just code:

| Decision | Options | Impact |
|---|---|---|
| `/properties/[id]/rooms` vs `/properties/[id]/inventory/rooms` | (a) Same UX — redirect rooms to inventory/rooms; (b) Different UX — keep both with distinct purposes | Affects I-09 scope |
| Checklist vs Maintenance merge | (a) Checklist is a buyer flow — keep separate; (b) Merge into maintenance with a buyer tab | Affects I-09 scope |
| Seasonal tab in Maintenance | Does the maintenance shell have a seasonal tab today? If not, build it before redirect | Blocks I-09 seasonal redirect |
| Insurance Trend merge path | (a) Merge as tab under Coverage Intelligence; (b) Rebuild as standalone with real data | Affects I-10 scope |
| Digital Twin stub depth | Single summary card only, or keep one workflow step? | Affects I-08 scope |
