# Contract to Cozy — Production Readiness Audit

**Date:** 2026-03-29
**Scope:** Home Tools and AI Tools hardening review (42 entries total)
**Phase 1 Prioritization Scope:** Home Tools + AI Tools independently; Guidance Overview is documented for reference and excluded from Phase 1 prioritization
**Method:** Deep codebase audit with evidence anchors — routes, services, controllers, validators, frontend pages
**Standard:** "Can a real homeowner use this safely and confidently, under imperfect conditions, and get meaningful end-to-end value without confusion or dead ends?"

---

## Table of Contents

0. [Scoring and Evidence Rubric](#0-scoring-and-evidence-rubric)
1. [Tool Inventory Map](#1-tool-inventory-map)
2. [Per-Tool Audit](#2-per-tool-audit)
3. [Cross-Tool Consistency Audit](#3-cross-tool-consistency-audit)
4. [Production-Grade Classification](#4-production-grade-classification)
5. [Prioritized Gap List by Independent Track](#5-prioritized-gap-list-by-independent-track)
6. [Implementation Board (Top 15)](#6-implementation-board-top-15)
7. [Evidence Index](#7-evidence-index)
8. [Summary](#8-summary)

---

## 0. Scoring and Evidence Rubric

### 0.1 Readiness Scoring Rubric (Weighted)

| Dimension | Weight | What "Good" Looks Like |
|---|---|---|
| Safety and Compliance | 30% | No safety/privacy/legal failure mode; required safeguards enforced |
| Data Integrity and Determinism | 25% | Deterministic outputs for same inputs; source quality and freshness visible |
| Functional Completeness | 20% | Core promise fully delivered without critical TODO/stub gaps |
| Actionability and UX Trust | 15% | Clear "what next" path and transparent reasoning/confidence |
| Operability and Resilience | 10% | Error handling, fallback behavior, logging, and stale-data signaling present |

Score bands used in this audit:
- **1 — Production-grade:** >= 85 and no open P0/P1
- **2 — Usable with targeted hardening:** 70-84 and no open P0
- **3 — Valuable but incomplete:** 55-69
- **4 — Conceptually good but not production-ready:** 40-54 or unresolved trust/safety risk
- **5 — Rework/reposition:** < 40 or placeholder architecture
- **0 — Not independently scorable:** Embedded module or missing backend implementation

### 0.2 Evidence Standard

Each prioritized gap in Section 5 includes one or more evidence IDs (`EV-*`) mapped in Section 7 to concrete code anchors (route/service/file).

---

## 1. Tool Inventory Map

### Home Tools

| Tool | Frontend Path | Backend Route File | Primary Service | Key Data Models | Fully Wired |
|---|---|---|---|---|---|
| Home Event Radar | `properties/[id]/tools/home-event-radar/` | `homeEventRadar.routes.ts` | `homeEventRadar.service.ts` + `homeEventRadarMatcher.service.ts` | RadarEvent, RadarMatch | Yes |
| Home Risk Replay | `properties/[id]/tools/home-risk-replay/` | `homeRiskReplay.routes.ts` | `homeRiskReplay.service.ts` + `homeRiskReplay.engine.ts` | RiskReplayRun, RiskReplayScenario | Yes |
| Service Price Radar | `properties/[id]/tools/service-price-radar/` | `servicePriceRadar.routes.ts` | `servicePriceRadar.service.ts` + `servicePriceRadar.engine.ts` | ServicePriceRadarCheck | Yes |
| Property Tax | `properties/[id]/tools/property-tax/` | `propertyTax.routes.ts` | `propertyTax.service.ts` | Property | Partial — heuristics only |
| Cost Growth | `properties/[id]/tools/cost-growth/` | `homeCostGrowth.routes.ts` | `homeCostGrowth.service.ts` | CostGrowthDataPoint | Partial |
| Insurance Trend | `properties/[id]/tools/insurance-trend/` | `insuranceCostTrend.routes.ts` | `insuranceCostTrend.service.ts` | Property | Partial — heuristics only |
| Negotiation Shield | `properties/[id]/tools/negotiation-shield/` | `negotiationShield.routes.ts` | `negotiationShield.service.ts` (61KB) + 6 sub-services | NegotiationScenario | Yes |
| Quote Comparison | `properties/[id]/tools/quote-comparison/` | None | None (placeholder UI) | None | No — intentional placeholder |
| Price Finalization | `properties/[id]/tools/price-finalization/` | `priceFinalization.routes.ts` | `priceFinalization.service.ts` | PriceFinalizationDraft | Yes |
| Cost Explainer | `properties/[id]/tools/cost-explainer/` | `costExplainer.routes.ts` | `costExplainer.service.ts` | Property | Yes |
| True Cost | `properties/[id]/tools/true-cost/` | `trueCostOwnership.routes.ts` | `trueCostOwnership.service.ts` | Property | Yes |
| Sell / Hold / Rent | `properties/[id]/tools/sell-hold-rent/` | `sellHoldRent.routes.ts` | `sellHoldRent.service.ts` | Property, FinanceSnapshot | Yes |
| Cost Volatility | `properties/[id]/tools/cost-volatility/` | `costVolatility.routes.ts` | `costVolatility.service.ts` | Property | Yes |
| Break-Even | `properties/[id]/tools/break-even/` | `breakEven.routes.ts` | `breakEven.service.ts` | Property, FinanceSnapshot | Yes |
| Home Capital Timeline | `properties/[id]/tools/capital-timeline/` | `homeCapitalTimeline.routes.ts` | `homeCapitalTimeline.service.ts` | InventoryItem, HomeAsset | Yes |
| Seller Prep | (own module) | `sellerPrep/sellerPrep.routes.ts` | `sellerPrep/` (multiple) | SellerPrepItem, AgentInterview | Yes — loosely coupled |
| Home Timeline | Embedded in Capital Timeline | — | — | — | Partial |
| Status Board | Dashboard integration | `homeStatusBoard.routes.ts` | `homeStatusBoard.service.ts` | InventoryItem, Warranty, MaintenanceTask | Yes |
| Home Digital Will | `properties/[id]/tools/home-digital-will/` | `homeDigitalWill.routes.ts` | `homeDigitalWill.service.ts` | HomeDigitalWillSection, Entry, Contact | Yes |
| Hidden Asset Finder | `properties/[id]/tools/hidden-asset-finder/` | `hiddenAssets.routes.ts` | `hiddenAssets.service.ts` | HiddenAssetProgram, Match | Yes |
| Home Digital Twin | `properties/[id]/tools/home-digital-twin/` | `homeDigitalTwin.routes.ts` | `homeDigitalTwin.service.ts` + 4 sub-services | DigitalTwinSnapshot | Yes |
| Neighborhood Change Radar | `properties/[id]/tools/neighborhood-change-radar/` | `neighborhoodIntelligence.routes.ts` | `neighborhoodIntelligence/` (multiple) | NeighborhoodEvent | Partial |
| Home Habit Coach | `properties/[id]/tools/home-habit-coach/` | `homeHabitCoach.routes.ts` | `homeHabitCoach/` (multiple) | HabitPattern | Yes |
| Plant Advisor | `properties/[id]/tools/plant-advisor/` | `roomPlantAdvisor.routes.ts` | `roomPlantAdvisor.service.ts` | PlantRecommendation | Yes |
| Renovation Risk Advisor | `properties/[id]/tools/home-renovation-risk-advisor/` | `homeRenovationAdvisor.routes.ts` | `homeRenovationAdvisor/` (multiple) | RenovationSession | Yes |
| Mortgage Refinance Radar | `properties/[id]/tools/mortgage-refinance-radar/` | `refinanceRadar.routes.ts` | `refinanceRadar/` (multiple) | RefinanceRadarState, RefinanceScenario | Yes |
| Home Gazette | `properties/[id]/tools/home-gazette/` | `gazette/gazette.routes.ts` | `gazette/` (multiple) | GazetteEdition, GazetteStory | Yes |
| Coverage Options | `properties/[id]/tools/coverage-options/` | None identified | None identified | — | No — UI wrapper only |
| Guidance Overview | `properties/[id]/tools/guidance-overview/` | `guidance.routes.ts` | `guidanceEngine/` (8+ services) | GuidanceJourney, GuidanceStep | Yes |

### AI Tools

| Tool | Frontend Path | Backend Route File | Primary Service | AI Dependency | Fully Wired |
|---|---|---|---|---|---|
| Coverage Intelligence | `properties/[id]/tools/coverage-intelligence/` | `coverageAnalysis.routes.ts` | `coverageAnalysis.service.ts` (69KB) | None — deterministic | Yes |
| Risk-to-Premium Optimizer | `properties/[id]/tools/risk-premium-optimizer/` | `riskPremiumOptimizer.routes.ts` | `riskPremiumOptimizer.service.ts` (53KB) | None — deterministic | Yes |
| Replace or Repair | Inventory item detail | `inventory.routes.ts` | `replaceRepairAnalysis.service.ts` | None — deterministic | Yes |
| Do-Nothing Simulator | `properties/[id]/tools/do-nothing/` | `doNothingSimulator.routes.ts` | `doNothingSimulator.service.ts` (54KB) | None — deterministic | Yes |
| Home Savings Check | `properties/[id]/tools/home-savings/` | `homeSavings.routes.ts` | `homeSavings.service.ts` + subdirectory | None — category modules | Yes |
| Emergency Help | `dashboard/emergency/` | `emergency.routes.ts` | `emergencyTroubleshooter.service.ts` | Gemini 2.0 (required) | Partial |
| Document Vault | `dashboard/documents/` | `document.routes.ts` | `documentIntelligence.service.ts` | Gemini 2.0 (required) | Yes |
| Appliance Oracle | `dashboard/oracle/` | `applianceOracle.routes.ts` | `applianceOracle.service.ts` | Gemini 2.0 (optional) | Yes |
| Budget Planner | `dashboard/budget/` | `budgetForecaster.routes.ts` | `budgetForecaster.service.ts` | Gemini 2.0 (optional) | Partial |
| Climate Risk | `dashboard/climate/` | `climateRisk.routes.ts` | `climateRiskPredictor.service.ts` | Gemini 2.0 (required) | Partial |
| Home Upgrades | `dashboard/modifications/` | `homeModification.routes.ts` | `homeModificationAdvisor.service.ts` | Gemini 2.0 (required) | Partial |
| Value Tracker | Equity section | `inventoryVerification.routes.ts` | `valueIntelligence.service.ts` | None — deterministic | Yes |
| Energy Audit | `dashboard/energy/` | `energyAuditor.routes.ts` | `energyAuditor.service.ts` | Gemini 2.0 (optional) | Partial |

---

## 2. Per-Tool Audit

Journey classification key:
- **Awareness-only** — surfaces information, no recommended action
- **Analysis-only** — produces analysis or score, no resolution path
- **Decision-support** — helps homeowner make a decision but does not execute it
- **End-to-end resolution** — helps homeowner complete the full job

---

### Home Event Radar

**What it does:** Ingests external weather and infrastructure events, matches them to a property's specific characteristics, and produces a prioritized feed of relevant events with recommended actions.

**Maturity:** Service-layer complete. Matching engine handles 10 event families with property-attribute-sensitive scoring. Signal integration active.

**Journey:** Decision-support — stops after recommended actions with no handoff to scheduling or booking.

| Category | Gap |
|---|---|
| Functional | County and polygon location matching not implemented (stubbed with TODO comments) — events at county-granularity may never match |
| Functional | No de-duplication across multiple radar sources reporting the same event |
| UX/Trust | Priority score inflation: signal boosts compound additively without clamping; a property with all signals active gets artificially inflated priority |
| UX/Trust | No explanation of why an event became high-priority (black-box multiplier compounding) |
| Data Resilience | Signal fallback is silent — empty signal context used without user-visible warning when signal service fails |
| Data Resilience | Signals may be stale (7+ days) but treated as current; no recency validation |
| Orchestration | No link from "Inspect roof" recommendation to Service Price Radar, booking, or provider matching |

**Readiness:** 3 — Valuable but incomplete

---

### Home Risk Replay

**What it does:** Generates a retrospective analysis of all weather/risk events at the property's location over the last 5 years or since built, showing which events impacted the specific property given its characteristics.

**Maturity:** Engine is highly detailed — 10+ event families with property-attribute-sensitive scoring (roof age, irrigation, foundation type, HVAC age, drainage). Location matching has 5 tiers with decay weights.

**Journey:** Decision-support — strong retrospective analysis but no forward guidance or execution path.

| Category | Gap |
|---|---|
| Functional | County-level geo-matching stubbed — events only at county granularity may not match |
| Functional | No cross-event correlation (e.g., "hail 2021 + heat 2022 = compound roof risk") |
| Data Resilience | Property age fallback: if yearBuilt is NULL, defaults to 20 years regardless of actual age |
| Data Resilience | Properties over 100 years treated as 100 years in age calculations |
| Data Resilience | Signal fallback is silent — stale or empty signals used without user visibility |
| Orchestration | "Test sump pump" recommendation has no link to who should do it, when, or at what cost |

**Readiness:** 2 — Usable but needs targeted hardening

---

### Service Price Radar

**What it does:** Evaluates a contractor quote for a specific service against benchmarks — adjusting for property size, region, property age, linked entity context, and service type — to produce a verdict (fair / high / very high) with confidence score.

**Maturity:** Strong engine. 30 service categories, 6 sequential multipliers, data-driven confidence scoring (18–92%).

**Journey:** Decision-support — returns verdict + explanation but never says "negotiate" or "get a second quote."

| Category | Gap |
|---|---|
| Functional | Non-USD currency not FX-adjusted — a EUR quote produces a meaningless USD-denominated verdict |
| Functional | State name normalization fails for full state names ("California" → fails to match "CA" benchmark) |
| Functional | Linked entity age: if both installedYear and purchasedYear are NULL, age treated as 0 (inflates confidence) |
| UX/Trust | Confidence can reach 0.92 with entirely heuristic inputs; no marker distinguishing "data-backed" from "heuristic-high" |
| UX/Trust | No "what should I do now?" guidance after verdict (negotiate, accept, get another quote) |
| Edge Case | No deduplication — user can create 3 roofing checks for the same project with no rollup |
| Edge Case | Size band (whole home area) used for room-scoped jobs like painting one bedroom |
| Orchestration | No link from "above range" verdict to Negotiation Shield or booking flow |

**Readiness:** 2 — Usable but needs targeted hardening

---

### Property Tax

**What it does:** Estimates current and projected property tax using heuristic state-level rates, school district data, and property value approximations.

**Maturity:** Phase 1 heuristic estimator. No county assessor data. Service comments explicitly call out this as a temporary placeholder.

**Journey:** Awareness-only — shows estimated tax, does not help reduce tax or take any action.

| Category | Gap |
|---|---|
| Functional | No county assessor integration (TODO comment in service code) |
| Functional | Home value estimated via sqft × $/sqft heuristic — no MLS comps or appraisal |
| Functional | Homestead exemption eligibility not checked |
| Functional | No tax appeal leverage guidance |
| Data Resilience | $350K fallback when property size unavailable — misleading for high/low-value markets |
| UX/Trust | "MEDIUM" confidence label actually means "entirely heuristic" — the label is misleading |
| Orchestration | No connection to exemption filing, tax appeal process, or savings tools |

**Readiness:** 3 — Valuable but incomplete

---

### Cost Growth

**What it does:** Projects 5- and 10-year home ownership cost growth incorporating FHFA HPI appreciation data when available, plus insurance and maintenance trends.

**Maturity:** FHFA data adds real credibility on the appreciation side. Insurance and maintenance use percentage-of-value heuristics with hardcoded inflation rates.

**Journey:** Analysis-only — shows cost trajectory, no action.

| Category | Gap |
|---|---|
| Data Resilience | Insurance growth assumptions (+4–9%/yr by state) hardcoded, not from DOI filings |
| Data Resilience | Maintenance "1% rule" doesn't account for deferred maintenance backlog or property age |
| Functional | Utilities entirely absent from cost growth projections |
| Functional | Property condition not integrated into cost projections |
| UX/Trust | FHFA-backed appreciation and heuristic insurance/maintenance presented at the same confidence level |
| Orchestration | No connection to refinancing advice, savings planning, or cashflow tools |

**Readiness:** 2 — Usable but needs targeted hardening

---

### Insurance Trend

**What it does:** Shows current insurance premium estimate and projects a 5-year trend based on climate multipliers, ZIP volatility, and state baseline premiums.

**Maturity:** Heavily heuristic. State baseline premiums hardcoded. ZIP volatility uses a hardcoded list of prefix codes. The service explicitly acknowledges no live DOI, FEMA, or NOAA datasets are used. Blending formula (55% calculated + 45% state baseline) is arbitrary.

**Journey:** Awareness-only — and not reliably so.

| Category | Gap |
|---|---|
| Data Quality | State baseline premiums are hardcoded static values, not real rate filings |
| Data Quality | ZIP volatility is a hardcoded set of prefix codes — not data-driven, not validated against actual claims |
| Data Quality | "Climate pressure index" (0–100) is a heuristic blend with no external data backing |
| Functional | No actual quote data or market comparison — only a parametric model |
| UX/Trust | Presented as a "trend" but is actually a formula output with no ground truth |
| Orchestration | No link to insurance shopping, policy comparison, or carrier marketplace |

**Readiness:** 4 — Should be reworked. Not suitable for any financial planning use case in current form.

---

### Negotiation Shield

**What it does:** Analyzes a user's negotiation position across 5 scenario types (contractor quotes, insurance premiums, claim settlements, buyer inspections, contractor urgency), generating leverage findings and draft counter-offer communications.

**Maturity:** Sophisticated — 5 sub-service delegation, document parsing, property signal integration, manual + parsed input merging. Analysis quality depends on Gemini.

**Journey:** Analysis-only — produces findings + draft response; user must execute entirely independently.

| Category | Gap |
|---|---|
| Functional | Gemini API failure has no fallback — tool returns nothing useful if AI is unavailable |
| Data Resilience | OCR-parsed document values not sanity-checked (e.g., negative premium values accepted) |
| Data Resilience | Multiple conflicting parsed documents merged silently — user doesn't know which data won |
| UX/Trust | Confidence scores from Gemini have no disclosed methodology |
| UX/Trust | "Leverage finding" is unexplained — user doesn't understand how it was derived |
| Orchestration | Draft counter-offer is generated but there's no "send" or "execute" pathway |
| Orchestration | No link from Negotiation Shield outcome to Price Finalization or booking |

**Readiness:** 2 — Usable but needs targeted hardening

---

### Quote Comparison

**What it does:** Placeholder UI (`QuoteComparisonPlaceholderClient.tsx`) that redirects users through a 3-step funnel: Service Price Radar → Negotiation Shield → Price Finalization.

**Maturity:** Intentional placeholder. No backend. No comparison logic.

**Journey:** Workflow connector — not a tool.

| Category | Gap |
|---|---|
| Functional | No actual quote comparison logic |
| UX/Trust | Users expecting side-by-side vendor comparison will be confused by the redirect UX |
| Orchestration | 3-step guidance is suggested, not enforced as a journey |

**Readiness:** 5 — Should be repositioned as a workflow step, not a standalone tool

---

### Price Finalization

**What it does:** Captures the final accepted price and terms for a service after the negotiation workflow — creating an audit trail of the decision.

**Maturity:** Primarily CRUD. Creates, updates, and marks drafts as finalized. No pricing logic or validation.

**Journey:** Decision-capture (audit log only).

| Category | Gap |
|---|---|
| Functional | No price sanity checks — tool accepts obviously incorrect values silently |
| Functional | Terms are an unstructured array — no enforcement of standard payment term categories |
| Functional | No downstream execution — booking and vendor notification must happen entirely outside the platform |
| UX/Trust | Acts as a form, not a decision engine — homeowner gets no confirmation that the decision is sound |
| Orchestration | No connection to booking, contractor engagement, or follow-up scheduling |

**Readiness:** 3 — Useful but incomplete. Should be marketed as a "Decision Record," not a tool.

---

### Cost Explainer

**What it does:** Explains year-over-year changes in ownership costs (tax, insurance, maintenance) with directional deltas and driver narratives.

**Maturity:** Clean composition on top of Property Tax and Insurance Trend services. Maintenance uses hardcoded inflation delta.

**Journey:** Awareness → light decision support.

| Category | Gap |
|---|---|
| Data Quality | Maintenance delta uses hardcoded 0.35% baseline — not from actual repair records |
| UX/Trust | Confidence mixes real data sources (tax, insurance) with heuristic (maintenance) without distinguishing them |
| Functional | No explanation of cost changes due to property changes (renovation, damage, lifecycle events) |
| Orchestration | Suggests companion tools but has no CTA to navigate there |

**Readiness:** 2 — Usable but needs targeted hardening

---

### True Cost

**What it does:** Aggregates property tax + insurance + maintenance + utilities into a 5-year cost-of-ownership view.

**Maturity:** Aggregation layer. Strong when upstream services have real data. Utilities are hardcoded by state — the weakest component.

**Journey:** Analysis-only — useful as input to Break-Even and Sell/Hold/Rent.

| Category | Gap |
|---|---|
| Data Quality | Utilities hardcoded by state (e.g., CA $3,200/yr) — no property-specific usage, rate schedule, or provider |
| Data Quality | Maintenance uses the 1% of home value rule — no property age or condition adjustment |
| Functional | 5-year horizon only — no long-hold scenario support |
| Functional | Inflation assumption +3.5–4.5%/yr with no regional override capability |
| Orchestration | Downstream to Break-Even/Sell-Hold-Rent but no signposting from the tool itself |

**Readiness:** 2 — Usable but needs targeted hardening

---

### Sell / Hold / Rent

**What it does:** Financially models the three main exit/hold options — sell (net proceeds), hold (appreciation + principal paydown − costs), rent (rental income + appreciation + principal − overhead) — and recommends the financially optimal path.

**Maturity:** Sophisticated debt-aware modeling. FHFA appreciation when available. Overrides well-supported. Winner algorithm is clean and defensible.

**Journey:** Decision-support — strong financially, but recommendation stops at "your numbers favor SELL" with no execution path.

| Category | Gap |
|---|---|
| Functional | Tax implications entirely absent — capital gains, rental income tax, 1031 exchange |
| Data Quality | Rent estimate uses hardcoded $/sqft by state — no Zillow/CoStar benchmark |
| Data Quality | Selling costs assumed at 6% (rough average; not per-market validated) |
| Data Quality | Year 6–10 ownership costs use inflation extrapolation beyond the 5-year True Cost baseline |
| Functional | Mortgage modeling only if user provides snapshot/overrides — not fetched proactively |
| Orchestration | "SELL" recommendation: no agent integration, no market staging, no closing timeline |
| Orchestration | "RENT" recommendation: no property management, no lease template, no tenant screening |

**Readiness:** 2 — Usable but needs targeted hardening

---

### Cost Volatility

**What it does:** Produces a volatility index (0–100) indicating how unpredictable ownership costs are, based on insurance repricing patterns, tax cadence, and climate exposure.

**Maturity:** Event detection is well-architected (window-invariant, standard deviation of deltas). Volatility index formula is sound in structure. Climate event detection is a Phase 2 placeholder (disabled).

**Journey:** Awareness-only — tells homeowners their costs are "moderately volatile" with no reduction guidance.

| Category | Gap |
|---|---|
| Functional | Climate event detection disabled — CLIMATE_EVENT hook is a TODO placeholder |
| Data Quality | Tax cadence mapping is a static lookup table — not validated against actual county reassessment calendars |
| Data Quality | Regional climate sensitivity uses state-level heuristics — no FEMA/NOAA grounding |
| UX/Trust | 45/30/15/10 weighting formula has no disclosed basis |
| UX/Trust | Volatility index (0–100) has no actionable threshold explanation |
| Orchestration | No guidance on how to reduce volatility |

**Readiness:** 3 — Valuable but incomplete

---

### Break-Even

**What it does:** Projects the year in which cumulative ownership costs are offset by appreciation + principal paydown, with sensitivity bands and year-by-year net position tracking.

**Maturity:** Strong. FHFA-backed appreciation. Sensitivity analysis (conservative/base/optimistic). Clean break-even status classification.

**Journey:** Decision-support — answers the question but doesn't help the user act on the answer.

| Category | Gap |
|---|---|
| Data Quality | 10/20/30y expense projections use simple drift beyond the 5y True Cost baseline — increasingly speculative |
| Functional | Mortgage modeling not fetched by default — requires user-provided snapshot/overrides |
| Functional | No guidance on how to accelerate break-even (refinance, sell sooner, reduce costs) |
| Edge Case | Does not account for capital expenditure events (roof, HVAC replacement) within the break-even window |
| UX/Trust | Sensitivity range "year 6–9" shown but not attached to any prescriptive guidance |

**Readiness:** 2 — Usable but needs targeted hardening

---

### Home Capital Timeline

**What it does:** Builds a forward-looking capital replacement schedule from inventory items — showing when each major system/appliance will need replacement, at what estimated cost, prioritized by urgency.

**Maturity:** The strongest financial planning tool in the portfolio. Inventory-backed, override-rich, confidence-scored per item, deep-linked to inventory/systems/maintenance/warranty.

**Journey:** End-to-end within capital planning scope — does not connect to execution (booking, financing).

| Category | Gap |
|---|---|
| Data Quality | Lifespan condition adjustments (1.10× NEW → 0.70× POOR) are ordinal assumptions, not validated against research |
| Data Quality | Cost ranges use ±20% static bands — not validated against real contractor quotes |
| Data Quality | Repair frequency adjustment (3+ repairs → 20% shorter lifespan) is an arbitrary threshold |
| Functional | No seasonal/climate adjustment (roof in hurricane zone wears faster) |
| Functional | No coordination of simultaneous replacements (bundling, contractor scheduling) |
| Orchestration | "Replace roof 2027" but no link to contractor booking, budget planning, or financing |

**Readiness:** 2 — Usable but needs targeted hardening

---

### Seller Prep

**What it does:** Generates a pre-sale readiness checklist based on property type, location, and user preferences — prioritized by ROI and tracked to completion. Includes comparable home data and agent interview capture.

**Maturity:** Complete as a standalone module. ROI engine, personalization engine, comparables resolver, readiness report. Operates independently from the rest of the platform.

**Journey:** Semi-end-to-end (checklist + tracking) — no execution integration.

| Category | Gap |
|---|---|
| Functional | Not integrated with Negotiation Shield (for contractor selection on prep tasks) |
| Functional | Not integrated with Price Finalization (actual spend never flows back to update ROI estimates) |
| Data Quality | ROI estimates hardcoded per region/property type — not validated against actual market outcomes |
| UX/Trust | Personalization algorithm balances ROI + timeline + budget but methodology undocumented |
| Functional | Agent interview is a CRM function — no follow-up mechanism or conversion tracking |
| Orchestration | Budget tracking is estimated; no real spend capture |

**Readiness:** 3 — Valuable but incomplete

---

### Home Timeline

Embedded within the Capital Timeline data model. Not independently surfaced as a navigable tool. Cannot be assessed as standalone.

---

### Status Board

**What it does:** Aggregates the condition of all home systems and appliances into a single dashboard — condition ratings, warranty status, maintenance alerts, and recommended actions (OK / REPAIR / REPLACE_SOON).

**Maturity:** Strong. Inventory-backed, override-rich, signal-integrated, deep-linked. Decision tree for condition/recommendation is clean.

**Journey:** End-to-end within its scope — identifies what needs attention and provides recommended action. Does not connect to booking or cost estimation.

| Category | Gap |
|---|---|
| UX/Trust | Condition scoring is categorical (GOOD/FAIR/POOR) — no nuance for degrees within a category |
| Functional | No cost estimation per item — shows what needs attention but not what it costs |
| Data Resilience | Signal integration depends on SignalService freshness — stale signals used without warning |
| Functional | Priority treats all item categories equally — roof gets same base weight as a small appliance |
| Edge Case | Warranty logic is basic (active/expiring/expired) — no claim tracking or coverage terms display |

**Readiness:** 2 — Usable but needs targeted hardening

---

### Home Digital Will

**What it does:** Creates a structured repository of home knowledge for trusted contacts — emergency instructions, contractor preferences, utility info, maintenance rules, access notes — with trusted contact designation.

**Maturity:** Complete and clean. 8 default sections, 6 entry types, trusted contacts with access levels, priority sorting, readiness status tracking.

**Journey:** Data repository — does not connect to any action.

| Category | Gap |
|---|---|
| Functional | Per-contact permission boundaries not enforced at read — any trusted contact can access all sections |
| Functional | No notification mechanism when will is published, updated, or accessed |
| Functional | No versioning or change history |
| Functional | No export or offline backup mechanism |
| UX | No review cadence prompting — `lastReviewedAt` stored but no nudge to keep it current |
| Data Resilience | Requires live DB access — no offline capability for emergency scenarios |

**Readiness:** 2 — Usable but needs targeted hardening (the per-contact permission gap is a privacy issue)

---

### Hidden Asset Finder

**What it does:** Automatically scans property attributes against a database of tax exemptions, energy credits, utility incentives, insurance discounts, and local grants to identify programs the homeowner likely qualifies for.

**Maturity:** Well-designed discovery engine. Rule evaluation is structured. Confidence bands assigned. Status tracking (DETECTED → VIEWED → CLAIMED) works.

**Journey:** Discovery-only — no execution, no outcome tracking.

| Category | Gap |
|---|---|
| UX/Trust | "HIGH" confidence based on rule match count — not validated against real approval rates |
| Functional | No claim execution — no form pre-fill, no application assistance |
| Functional | No claim outcome tracking — "CLAIMED" status stored but no confirmation if homeowner was actually approved |
| Data Resilience | Program freshness tracked but stale programs persist if admin doesn't refresh |
| Edge Case | Conflicting program requirements (e.g., two programs with overlapping income thresholds) not flagged |

**Readiness:** 2 — Usable but needs targeted hardening

---

### Home Digital Twin

**What it does:** Synthesizes a structured model of all home systems from property data and inventory items, then enables scenario modeling ("what if I replace HVAC?" "what if I add solar?") with upfront cost, annual savings, payback, property value impact, and risk reduction estimates.

**Maturity:** Sophisticated data model and scenario engine. Quality evaluation, version tracking, component status (KNOWN/ESTIMATED/NEEDS_REVIEW). Five sub-services.

**Journey:** Simulation → decision-support. No execution pathway.

| Category | Gap |
|---|---|
| Data Quality | Scenario cost/savings estimates are national medians — not validated against regional contractor quotes |
| UX/Trust | `confidenceScore` field present but methodology undocumented — homeowner cannot interpret it |
| Functional | No cross-scenario comparison across archived scenarios (5-scenario limit with archiving) |
| Data Resilience | Sparse property profiles produce sparse twins — no pre-flight validation of minimum data requirements |
| Orchestration | "Replace HVAC, 6.7-year payback" — no link to contractor matching, financing, or scheduling |

**Readiness:** 3 — Valuable but incomplete

---

### Neighborhood Change Radar

**What it does:** Monitors neighborhood-level events (development, crime, school changes, permits) and surfaces trends and signals relevant to the property's value and livability.

**Maturity:** Architecture exists. Full implementation depth of `impactRules.ts` and the geo-matching engine was not auditable from available code. Uncertain production scope.

**Journey:** Awareness-only at best.

| Category | Gap |
|---|---|
| Functional | Geo-matching implementation completeness unclear |
| Functional | Impact rules not validated against real neighborhood data sources |
| Orchestration | No connection from neighborhood signals to property decision tools |

**Readiness:** Cannot fully classify — requires deeper implementation review

---

### Home Habit Coach

**What it does:** Generates personalized home maintenance habits from property profile, tracks completion/snooze/skip, and surfaces a "spotlight" top habit.

**Maturity:** Generation and ranking engines complete. Status state machine is clean. History tracking works. Entirely passive — no notification system.

**Journey:** Habit tracking — does not drive execution.

| Category | Gap |
|---|---|
| Functional | No push notifications or email reminders — entirely dependent on user opening the app |
| Functional | Completion is self-reported with no verification (no photo, no contractor confirmation) |
| Functional | No contractor/service integration — "clean gutters" has no "find a service" option |
| UX | Generation is deterministic — no learning from user behavior or A/B optimization |
| Orchestration | No connection from completed habit to inventory update, maintenance record, or capital timeline |

**Readiness:** 2 — Usable but needs targeted hardening

---

### Plant Advisor

**What it does:** Recommends plants for a specific room based on light level, maintenance preference, pet safety, and goals. Users can save recommendations and add them to home inventory.

**Maturity:** Recommendation scoring is strong. Room-specific goal boosting adds relevance. Advanced signal weightings (climate zone, window direction) are in the code at 0 weight — never fire.

**Journey:** Discovery + saving. No sourcing, care, or follow-through.

| Category | Gap |
|---|---|
| Functional | Climate zone, window direction, room scan signals built but all have 0 weight — never activate |
| Functional | No sourcing — no nursery/store links or availability check |
| Functional | No care instructions beyond template text |
| Functional | No ongoing care tracking (watering reminders, health check) |
| UX/Trust | Confidence band methodology undocumented |

**Readiness:** 3 — Valuable but incomplete

---

### Renovation Risk Advisor

**What it does:** Evaluates a planned renovation for permit requirements, tax impacts (credits, deductions), and compliance checklist items — producing a structured risk and compliance report.

**Maturity:** Sophisticated jurisdiction resolver, tax evaluation engine, compliance checklist generation. Supports archive and export. Post-evaluation integrations run fire-and-forget.

**Journey:** Compliance and risk awareness — no execution.

| Category | Gap |
|---|---|
| Data Resilience | Jurisdiction compliance rules stored in DB with no versioning or deprecation markers — stale rules persist silently |
| Data Quality | Tax estimates use national median if project cost not provided — potentially off by multiples for regional variation |
| Functional | Compliance library completeness unknown — missing codes could cause permit rejections downstream |
| Functional | Post-evaluation integrations run fire-and-forget — failures logged but not retried or surfaced to user |
| Functional | No permit execution — no form pre-fill, no agency integration |
| Orchestration | No contractor matching after risk/compliance assessment |

**Readiness:** 3 — Valuable but incomplete

---

### Mortgage Refinance Radar

**What it does:** Evaluates whether current market rates create a refinancing opportunity by comparing against the homeowner's existing mortgage — with hysteresis, multi-threshold evaluation, break-even calculation, and scenario modeling.

**Maturity:** Rate evaluation engine is mathematically rigorous. Hysteresis prevents false signals. Multi-threshold evaluation (rate gap, minimum balance, minimum savings, maximum break-even months). Rate snapshots require admin ingestion.

**Journey:** Decision-support — no execution.

| Category | Gap |
|---|---|
| Functional | Rate snapshots require admin ingestion — no real-time rate feed |
| Functional | 30-year fixed only — cannot evaluate 15-year, ARM, or IO products |
| Data Quality | Closing cost assumed as flat percentage — not adjusted for loan balance, property value, or lender |
| Functional | Hysteresis may miss brief rate windows (gap must widen to 0.25% from closed state before re-opening) |
| Functional | No affordability check for longer-term refinancing scenarios |
| Orchestration | No lender matching, no rate lock integration, no refinancing execution pathway |

**Readiness:** 2 — Usable but needs targeted hardening

---

### Home Gazette

**What it does:** Assembles a curated digest of the most relevant home signals, events, and action items into a ranked story feed — with hero story, high/medium/low tiers, and a ticker.

**Maturity:** Assembly is deterministic (composite score from urgency + financial impact + confidence + novelty + engagement). Headline generation has fallbacks. Story ranking works.

**Journey:** Awareness-only — no in-gazette actions or execution bridge.

| Category | Gap |
|---|---|
| UX/Trust | Fallback editorial copy is generic ("Your roof replacement is due soon") — homeowners may not understand urgency or scope |
| Functional | No A/B testing or editorial override capability — fully algorithmic |
| Functional | No in-gazette action — stories link to deep links but no execution from within the gazette |
| Orchestration | Stories surface recommendations but do not connect to resolution paths |

**Readiness:** 3 — Valuable but incomplete

---

### Coverage Options

**What it does:** Unknown. Frontend page exists as a UI wrapper. No corresponding backend service or route was identified.

**Readiness:** Cannot assess — no backend implementation found.

---

### Guidance Overview

**What it does:** Orchestrates multi-step guidance journeys driven by property signals — routing homeowners through relevant tool sequences with step completion, evidence capture, and execution readiness checks.

**Maturity:** 8+ services. Signal resolution, step resolution, priority scoring, financial context, confidence, suppression, copy generation, validation. Journey templates are hardcoded. Evidence capture uses keyword matching on `sourceToolKey`.

**Journey:** Partial execution pathway — has scaffolding for end-to-end journeys but templates are hardcoded and execution handoff is not natively wired.

| Category | Gap |
|---|---|
| Functional | Journey templates hardcoded — adding new journeys requires a code redeployment |
| UX/Trust | Signal suppression rules not visible in API response — homeowner doesn't know why a signal was suppressed |
| Functional | No rollback — once a step is COMPLETED, cannot revert to IN_PROGRESS |
| Data Resilience | No pre-flight validation that required context (e.g., `roofReplacementYear`) is populated before a journey starts |
| UX/Trust | Priority scoring uses the same unbounded multiplier compounding found in other signal-integrated tools |
| Functional | Evidence proof-type inference is keyword matching — fragile and not type-safe |

**Readiness:** 3 — Valuable but incomplete

---

### Coverage Intelligence

**What it does:** Evaluates insurance coverage adequacy and warranty coverage across inventory items — producing coverage gaps, flags, and recommended add-ons. Fully deterministic, no AI.

**Maturity:** Strong. Multi-step verdict logic, confidence scoring by data completeness, deduplication, clear decision traces. 69KB service.

**Journey:** Decision-support — no marketplace integration to act on recommendations.

| Category | Gap |
|---|---|
| Functional | No dynamic premium/deductible search — assumes user knows their actual costs |
| Functional | No link to insurance marketplace or carrier APIs |
| UX/Trust | Confidence doesn't account for policy-specific carrier caps or exclusions |
| Orchestration | Recommendations ("add water backup coverage") have no execution path |

**Readiness:** 2 — Usable but needs targeted hardening

---

### Risk-to-Premium Optimizer

**What it does:** Identifies insurance premium drivers for a specific property (state risk exposure, claims history, perils), produces recommendations with estimated annual savings, and tracks plan items from recommended → planned → done.

**Maturity:** Strong. State-informed risk drivers, severity weighting, peril-specific recommendations, plan item status tracking. 53KB service.

**Journey:** Decision-support + actionable plan items — no verification loop.

| Category | Gap |
|---|---|
| Functional | No savings verification — premium reduction not confirmed after mitigation completion |
| Functional | No insurer API for completed mitigation submission |
| Functional | No timeline/urgency for recommendations beyond priority level |
| Orchestration | "Install sump pump → save $150/yr" has no link to contractor booking or product sourcing |

**Readiness:** 2 — Usable but needs targeted hardening

---

### Replace or Repair

**What it does:** Analyzes a single inventory item across age ratio, condition, repair frequency, and repair spend ratio to produce a verdict (REPLACE_NOW / REPLACE_SOON / REPAIR_AND_MONITOR / REPAIR_ONLY) with break-even months and a full decision trace.

**Maturity:** The strongest AI tool in the portfolio. Fully deterministic. Multi-factor failure probability model. Clear verdict logic. Transparent decision trace. Category defaults well-researched. No hallucination risk.

**Journey:** Decision-support + actionable. Closest to end-to-end of all AI tools.

| Category | Gap |
|---|---|
| Functional | Single-item only — no batch optimization across multiple failing appliances |
| Functional | No seasonal cost considerations (HVAC replacement costs spike in summer) |
| Functional | No integration with warranty/service plan data (replace vs. use remaining warranty) |
| Orchestration | Verdict has no link to contractor booking or financing |

**Readiness:** 1 — Production-grade

---

### Do-Nothing Simulator

**What it does:** Simulates the financial and risk consequences of deferring maintenance over a 6–36 month horizon — surfacing risk delta, cost delta, incident likelihood, and biggest avoidable losses.

**Maturity:** Solid simulation. Scenario-based with saved states. Decision trace explicit. 54KB service.

**Journey:** Awareness → analysis — no execution.

| Category | Gap |
|---|---|
| Data Resilience | Low-data properties (no claims history) produce low-confidence simulations without adequate user warning |
| Functional | Cost deltas are generic per property age, not per actual inventory items |
| Functional | No dynamic risk (e.g., storm season approaching during simulation window) |
| Edge Case | `outputsSnapshot` stored as JSON — schema changes could break historical scenario display |
| Orchestration | "Do nothing costs $X" — no link to "do something" execution path |

**Readiness:** 2 — Usable but needs targeted hardening

---

### Home Savings Check

**What it does:** Identifies savings opportunities across ELECTRICITY_GAS, INSURANCE_HOME, INTERNET, WARRANTY_HOME by comparing the current account against alternatives, and tracks applications from VIEWED → APPLIED → SWITCHED.

**Maturity:** Category-modular design. Full opportunity status workflow. Real financial impact. Expiration dates on offers.

**Journey:** End-to-end. Users connect account → find alternative → apply → track status.

| Category | Gap |
|---|---|
| Functional | No bundling — switching electric + internet simultaneously doesn't surface combined discount |
| Functional | Opportunity expiration validated by dates but not confirmed against live carrier API |
| Functional | No credit check or eligibility verification before showing opportunity |

**Readiness:** 1 — Production-grade

---

### Emergency Help

**What it does:** AI chat interface (Gemini 2.0) for diagnosing home emergencies in real-time — classifying severity and recommending steps.

**Maturity:** Stateless chat with property context enrichment. Severity classification via regex keyword matching on free-text Gemini response.

**Journey:** Awareness-only. Dangerous if relied on for IMMEDIATE_DANGER classification.

| Category | Gap |
|---|---|
| Safety | Severity mapped via regex on free text — Gemini phrasing variation causes silent misclassification |
| Safety | No incident logging for liability protection |
| Safety | No rate-limiting on emergency calls |
| Functional | Does not schedule emergency services |
| Functional | Does not validate address for dispatcher |
| Functional | No follow-up or incident tracking after conversation ends |
| UX/Trust | Gemini can hallucinate steps that are unsafe for specific emergency types |

**Readiness:** 4 — Not production-ready. Direct safety liability.

---

### Document Vault

**What it does:** Accepts uploaded documents (images/PDFs), uses Gemini to extract structured data (product name, warranty expiration, serial number, model), and optionally auto-creates warranty records.

**Maturity:** File validation, Zod input validation, Gemini extraction with confidence scoring (0.0–1.0), auto-warranty creation, inventory asset matching suggestions.

**Journey:** Decision-support + partially automated — needs confidence gate.

| Category | Gap |
|---|---|
| Data Resilience | No confidence threshold gate before auto-warranty creation — can create records at 20% confidence |
| Data Resilience | Warranty expiration dates not validated (an expired warranty from 5 years ago is auto-created) |
| Functional | No OCR fallback if PDF text is unreadable |
| UX/Trust | Malformed JSON from Gemini silently falls back to empty response — no user notification |
| Edge Case | Asset linkage matching uses exact name/serial — no fuzzy matching for slight naming variations |

**Readiness:** 3 — Valuable but incomplete

---

### Appliance Oracle

**What it does:** Calculates failure risk for all home appliances using an age-ratio exponential curve, assigns urgency (LOW/MEDIUM/HIGH/CRITICAL), and produces a prioritized replacement timeline with total cost summary.

**Maturity:** Failure risk model is clean. Urgency derived from risk + remaining life. Gemini recommendations are optional with graceful degradation.

**Journey:** Decision-support — no execution.

| Category | Gap |
|---|---|
| Data Quality | Gemini recommendations not validated against property square footage, ductwork capacity, or budget |
| Functional | No bundling optimization across co-failing appliances |
| Functional | No financing options surfaced |
| Orchestration | "HVAC critical" has no link to contractor matching or booking |

**Readiness:** 2 — Usable but needs targeted hardening

---

### Budget Planner

**What it does:** Generates a 12-month home maintenance budget forecast by property age and type, with seasonal variation and optional AI recommendations.

**Maturity:** Partially functional. Contains a non-determinism bug (`Math.random()` in unexpected cost calculation). Seasonal patterns hardcoded nationally.

**Journey:** Awareness-only — and unreliable due to non-determinism.

| Category | Gap |
|---|---|
| Functional | **Non-determinism bug:** `base * (0.8 + Math.random() * 0.4)` for unexpected costs — same property generates different forecasts on different runs |
| Data Quality | Seasonal patterns hardcoded nationally — spring/fall assumed 20–30% higher regardless of climate zone |
| Functional | No maintenance backlog integration — deferred repairs not reflected in forecast |
| Functional | Confidence level based on appliance count, not data quality |
| UX/Trust | Gemini recommendations not validated against actual property state |

**Readiness:** 3 — Valuable but incomplete. Non-determinism bug is a P0.

---

### Climate Risk

**What it does:** Assesses a property's climate risk profile using Gemini to analyze location-based risks (flood, wildfire, hurricane, heatwave) with mitigation recommendations.

**Maturity:** State-based fallback works for ~10 states. Primary analysis relies on Gemini, which can invent risk percentages without grounding in FEMA or NOAA data.

**Journey:** Awareness-only — hallucination-prone.

| Category | Gap |
|---|---|
| Data Quality | Gemini can invent risk percentages not grounded in FEMA/NOAA data |
| Data Quality | No validation of AI risk scores against authoritative climate/flood databases |
| Functional | No temporal aspect — risk trend over time not modeled |
| Functional | Fallback only covers ~10 states — other states fall back to empty response |
| Orchestration | Mitigation recommendations have no cost, timeline, or contractor connection |
| UX/Trust | Risk percentages presented as facts, not as estimates with confidence ranges |

**Readiness:** 4 — Not production-ready. Replace Gemini estimates with FEMA/NOAA data sources.

---

### Home Upgrades

**What it does:** Uses Gemini to recommend 6–8 home modifications based on user-stated needs and property type/age — with ROI estimates, cost ranges, timeline, and permit requirements.

**Maturity:** Gemini-primary. `COMMON_MODIFICATIONS` templates exist in code but are bypassed when Gemini succeeds (dead code). ROI and cost estimates are AI-generated without regional validation.

**Journey:** Awareness-only — not safe for financial planning.

| Category | Gap |
|---|---|
| Data Quality | ROI percentages invented by Gemini — not validated against real market outcomes |
| Data Quality | Cost estimates not regionalized — same modification priced identically for different markets |
| Functional | Permit requirements guessed by AI, not sourced from jurisdiction permit database |
| Functional | `COMMON_MODIFICATIONS` template is dead code when Gemini succeeds |
| Orchestration | No contractor vetting, no permit filing, no financing options |

**Readiness:** 4 — Not production-ready. ROI claims too risky without regional grounding.

---

### Value Tracker

**What it does:** Calculates home equity, maintenance premium (documented maintenance = increased equity), and health score tie-in — fully deterministic, no AI.

**Maturity:** Clean financial calculation. Maintenance premium rate (0.08) documented and conservative. No hallucination risk.

**Journey:** Decision-support — clean and defensible.

| Category | Gap |
|---|---|
| Data Quality | 8% maintenance premium rate not validated against market data |
| Functional | No comparison to neighborhood market comps |
| Functional | No depreciation modeling for renovations |

**Readiness:** 1 — Production-grade

---

### Energy Audit

**What it does:** Benchmarks property energy consumption against state averages (EIA data), calculates efficiency score and grade (A–F), and produces improvement recommendations with savings estimates and payback periods.

**Maturity:** Strong baseline. EIA data embedded. Energy Star benchmarking. DOE appliance breakdown. Gemini recommendations optional. Bill upload feature partially implemented (`extractBillData()` incomplete).

**Journey:** Decision-support + partially actionable — execution pathway incomplete.

| Category | Gap |
|---|---|
| Functional | Bill upload feature incomplete — `extractBillData()` implementation missing |
| Functional | No integration with utility rebate programs or IRA tax credits |
| Data Quality | AI recommendations not validated against regional availability or property specs |
| Functional | Carbon offset claims ("equivalent trees") are rough calculations, not validated |
| Orchestration | "Install heat pump → save $800/yr" has no link to contractor booking or rebate application |

**Readiness:** 2 — Usable but needs targeted hardening

---

## 3. Cross-Tool Consistency Audit

### 3.1 Duplicated Problem Solving

| Problem | Overlapping Tools | Issue |
|---|---|---|
| "Is my insurance cost reasonable?" | Insurance Trend + Coverage Intelligence + Risk-to-Premium Optimizer | Three tools address insurance from different angles with no guidance on when to use which |
| "How much does home ownership cost?" | Property Tax + Cost Growth + True Cost + Cost Explainer + Cost Volatility | 5 tools aggregate or explain cost components; heuristic stack compounds errors end-to-end |
| "Should I sell, hold, or invest?" | Sell/Hold/Rent + Break-Even + Home Capital Timeline | Three tools answer adjacent decision questions with overlapping assumptions but no shared context |
| "What is my home's current condition?" | Status Board + Home Digital Twin + Home Capital Timeline + Home Risk Replay | Four tools produce condition assessments from different angles without cross-referencing |
| "What repairs/replacements should I prioritize?" | Home Capital Timeline + Status Board + Appliance Oracle + Do-Nothing Simulator | Four tools produce priority lists with different data models and action frameworks |
| "Is this contractor quote fair?" | Service Price Radar + Negotiation Shield + Quote Comparison (placeholder) | Three tools exist for the same workflow; Quote Comparison is a redirect to the other two |

### 3.2 Tools with Unclear Differentiation

**Coverage Intelligence vs. Coverage Options**
Coverage Intelligence is a 69KB actuarial-grade service. Coverage Options is a frontend-only UI wrapper with no identified backend. The names imply relationship; the implementations are entirely different in depth. Users navigating to Coverage Options expecting analysis will be confused.

**Service Price Radar vs. Quote Comparison vs. Negotiation Shield**
These three are intended as a workflow (benchmark → compare → negotiate) but presented as independent peer tools. Quote Comparison's name implies functionality that doesn't exist.

**Replace or Repair vs. Renovation Risk Advisor**
Both address the "should I do this work?" decision but for different scopes (appliance vs. renovation). No shared signal. No result cross-referencing.

**Home Event Radar vs. Home Risk Replay vs. Status Board**
All three surface home condition and risk information. The conceptual distinction (forward events vs. historical events vs. current system state) is valid but the names ("Radar," "Replay," "Board") obscure the relationship. A homeowner doesn't know which to use.

### 3.3 Naming Inconsistencies

| Issue | Examples |
|---|---|
| "Radar" overused for 4 tools with different mechanics | Home Event Radar, Service Price Radar, Neighborhood Change Radar, Mortgage Refinance Radar |
| "Digital" used ambiguously | Home Digital Will (static document) vs. Home Digital Twin (dynamic simulation) |
| AI Tools category includes deterministic tools | Replace or Repair, Value Tracker, Home Savings, Coverage Intelligence have no AI dependency |
| "Overview" doesn't communicate orchestration | Guidance Overview is an orchestration layer, not a peer tool |

### 3.4 Inconsistent Result Presentation

| Dimension | Issue |
|---|---|
| Confidence labels | 5+ different systems across the platform: Insurance Trend (none), Property Tax (LOW/MEDIUM/HIGH), Coverage Intelligence (0–1 float), Service Price Radar (18–92% score) — all mean different things |
| CTA patterns | Most tools show analysis with no "what to do next" action |
| Decision trace | Present in Replace or Repair, Coverage Intelligence. Absent in Insurance Trend, Climate Risk, Home Upgrades |
| Empty states | Inconsistent — some tools (Status Board) have clear empty states; others don't communicate what's missing |

### 3.5 Signal Integration Architectural Risk

Four tools (Home Event Radar, Home Risk Replay, Guidance Overview, Home Digital Twin quality scoring) share the same unbounded multiplier compounding bug in their signal enrichment logic:

```
priority += riskSpike × 2.0
priority += costAnomaly × 1.5
priority += riskAccumulation × 0.6
priority += costPressure × 0.5
priority += interaction × 0.35
```

With all signals at maximum, priority can be boosted by more than 2× with no cap. This distorts what homeowners see as urgent across the entire platform. Since Guidance Overview uses this pattern, every guided journey is at risk of incorrect prioritization.

### 3.6 Disconnected Natural Journeys

| Journey | Current State |
|---|---|
| Risk → Coverage → Optimize | Home Event Radar → (no bridge) → Coverage Intelligence → (no bridge) → Risk-to-Premium Optimizer |
| Cost Spike → Understand → Act | Insurance Trend → Cost Explainer → (no bridge) → Home Savings Check |
| Renovation Planning → Risk → Compliance → Execute | Renovation Risk Advisor → (no bridge) → Negotiation Shield → Price Finalization |
| Pre-Sale → Prep → Price → Negotiate → Close | Seller Prep → (no bridge) → Negotiation Shield → Quote Comparison (placeholder) → Price Finalization |
| Emergency → Document → Track → Prevent | Emergency Help → (no bridge) → Document Vault → (no bridge) → Home Habit Coach |
| Appliance Age → Replace/Repair → Budget → Book | Appliance Oracle → Replace or Repair → Home Capital Timeline → (no booking integration) |

---

## 4. Production-Grade Classification

### 1 — Production-Grade (Ship As-Is)

| Tool | Rationale |
|---|---|
| Replace or Repair | Deterministic, multi-factor, transparent decision trace, clean verdict logic, no hallucination risk |
| Home Savings Check | End-to-end workflow, real financial impact, full opportunity status tracking |
| Value Tracker | Clean financial calculation, no AI, defensible assumptions, transparent methodology |

### 2 — Usable But Needs Targeted Hardening

| Tool | Critical Hardening Needed |
|---|---|
| Home Risk Replay | Fix county/polygon matching; add stale signal warnings; add cross-event correlation |
| Service Price Radar | Fix FX conversion; fix state name normalization; add "what now" CTA |
| Cost Growth | Add data source transparency; tighten insurance/maintenance assumptions |
| True Cost | Fix utilities (real data or explicit caveat); add long-hold scenario |
| Cost Explainer | Separate heuristic confidence from data-backed confidence |
| Break-Even | Wire mortgage fetch by default; add capital expenditure events to projections |
| Home Capital Timeline | Validate lifespan assumptions; add bundling coordination |
| Sell / Hold / Rent | Add tax implications disclosure; wire mortgage fetch by default |
| Status Board | Add cost context per item; cap signal multiplier |
| Home Digital Will | Enforce per-contact permissions; add notifications; add export |
| Hidden Asset Finder | Validate confidence against real approval rates; add claim outcome tracking |
| Home Habit Coach | Add notification/reminder system; add execution link |
| Negotiation Shield | Add Gemini fallback; disclose confidence methodology; add data sanity checks |
| Mortgage Refinance Radar | Add real-time rate feed; add 15-year/ARM options |
| Coverage Intelligence | Add insurance marketplace link |
| Risk-to-Premium Optimizer | Add mitigation verification loop |
| Do-Nothing Simulator | Add low-data fallback messaging; fix schema stability |
| Appliance Oracle | Validate Gemini recommendations against property specs |
| Energy Audit | Complete bill extraction; add rebate integration |

### 3 — Valuable But Incomplete

| Tool | What's Missing |
|---|---|
| Home Event Radar | County/polygon matching completion; signal explanation transparency; stale-signal warnings |
| Property Tax | County assessor data; exemption eligibility; tax appeal guidance |
| Cost Volatility | Climate event detection (disabled); actionable volatility reduction guidance |
| Seller Prep | Execution integration (contractors, Price Finalization, actual spend capture) |
| Home Digital Twin | Regional cost validation; execution pathway; confidence methodology disclosure |
| Plant Advisor | Sourcing; care instructions; ongoing tracking |
| Renovation Risk Advisor | Permit execution; contractor matching; DB freshness mechanism |
| Home Gazette | In-gazette actions; editorial customization; actionability bridge |
| Document Vault | Confidence threshold gate; OCR fallback; expiration validation |
| Budget Planner | Fix non-determinism; add backlog integration; regional seasonal patterns |
| Price Finalization | Should be repositioned as a Decision Record, not a tool |
| Guidance Overview | Hardcoded templates; state machine enforcement; pre-flight validation |

### 4 — Conceptually Good But Not Production-Ready

| Tool | Why Not Ready |
|---|---|
| Insurance Trend | Arbitrary assumptions with no data backing; marketed as a trend, is actually a parametric formula |
| Emergency Help | Direct safety liability — regex-based severity classification on free-text AI output |
| Climate Risk | Gemini hallucination risk on risk percentages; no FEMA/NOAA grounding |
| Home Upgrades | Gemini-invented ROI and cost estimates presented as facts; no regional validation |
| Neighborhood Change Radar | Incomplete implementation visibility; uncertain production scope |

### 5 — Should Be Reworked or Repositioned

| Tool | Recommended Action |
|---|---|
| Quote Comparison | Remove as a named peer tool; expose only as a step in the Negotiation workflow |

### 0 — Not Independently Scorable

| Tool | Why It Is Unscored in This Classification |
|---|---|
| Coverage Options | Frontend wrapper exists but no backend route/service implementation found |
| Home Timeline | Embedded inside Home Capital Timeline; no standalone route/service/UI surface to score independently |

---

## 5. Prioritized Gap List by Independent Track

Phase 1 prioritization intentionally excludes Guidance Overview orchestration changes so Home Tools and AI Tools can be hardened independently first.

### 5.1 Home Tools Track

#### Home P0

| ID | Gap | Tool(s) | Reason | Evidence |
|---|---|---|---|---|
| HT-P0-1 | Signal multiplier compounding is unbounded and can over-inflate urgency | Home Event Radar, Home Risk Replay, Home Digital Twin | Distorts homeowner priority and decision quality | EV-H1 |
| HT-P0-2 | Per-contact read permissions are not enforced | Home Digital Will | Privacy/security exposure | EV-H2 |
| HT-P0-3 | Insurance Trend presents heuristic outputs as trend-grade analysis | Insurance Trend | Financial trust risk | EV-H3 |

#### Home P1

| ID | Gap | Tool(s) | Evidence |
|---|---|---|---|
| HT-P1-1 | FX conversion and state normalization gaps degrade quote fairness verdicts | Service Price Radar | EV-H4 |
| HT-P1-2 | Mortgage context not fetched by default in core financial decision tools | Break-Even, Sell/Hold/Rent | EV-H5 |
| HT-P1-3 | County/polygon geo matching incomplete in risk/event tools | Home Event Radar, Home Risk Replay | EV-H1 |
| HT-P1-4 | Quote Comparison is a placeholder but presented as a peer tool | Quote Comparison | EV-H6 |
| HT-P1-5 | Missing next-action CTAs in high-traffic decision tools | Service Price Radar, Break-Even, Home Capital Timeline | EV-H4, EV-H5 |

### 5.2 AI Tools Track

#### AI P0

| ID | Gap | Tool(s) | Reason | Evidence |
|---|---|---|---|---|
| AI-P0-1 | Emergency severity is inferred by regex on free-text AI output | Emergency Help | Direct safety liability | EV-A1 |
| AI-P0-2 | Non-deterministic forecasting (`Math.random`) in planning output | Budget Planner | Breaks repeatability and trust | EV-A2 |
| AI-P0-3 | Auto-warranty creation lacks confidence threshold gate | Document Vault | Cascading downstream data corruption | EV-A3 |
| AI-P0-4 | Hallucination-prone numeric outputs presented as facts | Climate Risk, Home Upgrades | Financial and trust harm | EV-A4, EV-A5 |

#### AI P1

| ID | Gap | Tool(s) | Evidence |
|---|---|---|---|
| AI-P1-1 | No execution bridge from coverage recommendations to marketplace/carrier flow | Coverage Intelligence | EV-A6 |
| AI-P1-2 | Mitigation plan savings are not verified post-action | Risk-to-Premium Optimizer | EV-A7 |
| AI-P1-3 | Bill extraction path is incomplete in energy analysis workflow | Energy Audit | EV-A8 |
| AI-P1-4 | Low-data simulation quality not transparently surfaced to users | Do-Nothing Simulator | EV-A9 |
| AI-P1-5 | Oracle recommendations are not validated against property-specific constraints | Appliance Oracle | EV-A10 |

---

## 6. Implementation Board (Top 15)

| ID | Track | Work Item | Owner | ETA | Dependencies | Acceptance Criteria | Evidence |
|---|---|---|---|---|---|---|---|
| IMP-01 | Home | Cap shared signal multiplier at 1.5x with explicit clamp | Home Platform Eng | Sprint 1 | Shared signal utility | With maxed signals, priority never exceeds 1.5x baseline; regression tests added | EV-H1 |
| IMP-02 | Home | Enforce Home Digital Will per-contact read ACLs | Privacy/Security Eng | Sprint 1 | Contact role mapping | Unauthorized sections return 403; ACL integration tests pass | EV-H2 |
| IMP-03 | Home | Re-label Insurance Trend as Educational Estimate and gate financial usage | Home Tools PM + Eng | Sprint 1 | UX copy + API flag | UI/API both show disclosure; planning flows cannot consume as trusted trend input | EV-H3 |
| IMP-04 | Home | Add FX normalization and robust state mapping in Service Price Radar | Home Pricing Eng | Sprint 2 | FX source + state map util | EUR/CAD quotes normalize correctly; full state-name inputs resolve correctly | EV-H4 |
| IMP-05 | Home | Auto-fetch finance snapshot for Break-Even and Sell/Hold/Rent | Home Finance Eng | Sprint 2 | Finance snapshot availability | Both tools include debt context by default or prompt for missing data | EV-H5 |
| IMP-06 | Home | Reposition Quote Comparison as workflow step, not peer tool | Home UX Eng | Sprint 2 | Navigation IA update | Quote Comparison removed from peer nav and reachable only in negotiation workflow | EV-H6 |
| IMP-07 | Home | Add next-action CTAs for top decision tools | Home UX Eng | Sprint 2 | Destination deep links | Tools show deterministic next-action button with validated deep links | EV-H4, EV-H5 |
| IMP-08 | AI | Replace Emergency Help regex severity with structured response contract | AI Safety Eng | Sprint 1 | Schema validation + incident logging | Severity derives only from structured field; misclassification tests pass | EV-A1 |
| IMP-09 | AI | Remove non-determinism from Budget Planner forecasts | AI Core Eng | Sprint 1 | Deterministic unexpected-cost model | Same inputs always produce same forecast outputs | EV-A2 |
| IMP-10 | AI | Add >= 0.70 confidence gate before auto-warranty creation | AI Intake Eng | Sprint 1 | Extraction confidence scoring | Warranty records created only when confidence threshold is met | EV-A3 |
| IMP-11 | AI | Add uncertainty disclosure and source grounding in Climate Risk outputs | AI Risk Eng | Sprint 2 | Source attribution format | Risk percentages include source/confidence and disclaimer when heuristic | EV-A4 |
| IMP-12 | AI | Validate Home Upgrades ROI/costs against regional baseline tables | AI Planning Eng | Sprint 2 | Regional pricing dataset | ROI values outside allowed bounds are rejected or downgraded with disclosure | EV-A5 |
| IMP-13 | AI | Complete Energy Audit bill extraction and fallback path | AI Energy Eng | Sprint 3 | OCR/parser completion | Uploaded bill contributes to model or explicit fallback message is returned | EV-A8 |
| IMP-14 | AI | Add mitigation verification loop to Risk-to-Premium Optimizer | AI Insurance Eng | Sprint 3 | Policy premium history data | Completed mitigations trigger post-check with observed premium delta | EV-A7 |
| IMP-15 | AI | Add execution CTA to Coverage Intelligence recommendations | AI Insurance Eng | Sprint 3 | Marketplace link strategy | Coverage recs include actionable next step and destination | EV-A6 |

---

## 7. Evidence Index

| Evidence ID | Code Anchor(s) |
|---|---|
| EV-H1 | `apps/backend/src/services/homeEventRadar.service.ts`, `apps/backend/src/services/homeRiskReplay.engine.ts`, `apps/backend/src/services/homeDigitalTwinQuality.service.ts` |
| EV-H2 | `apps/backend/src/services/homeDigitalWill.service.ts`, `apps/backend/src/controllers/homeDigitalWill.controller.ts` |
| EV-H3 | `apps/backend/src/services/insuranceCostTrend.service.ts`, `apps/backend/src/routes/insuranceCostTrend.routes.ts` |
| EV-H4 | `apps/backend/src/services/servicePriceRadar.service.ts`, `apps/backend/src/services/servicePriceRadar.engine.ts`, `apps/backend/src/routes/servicePriceRadar.routes.ts` |
| EV-H5 | `apps/backend/src/services/breakEven.service.ts`, `apps/backend/src/services/sellHoldRent.service.ts`, `apps/backend/src/routes/breakEven.routes.ts`, `apps/backend/src/routes/sellHoldRent.routes.ts` |
| EV-H6 | `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/quote-comparison/QuoteComparisonPlaceholderClient.tsx`, `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/quote-comparison/page.tsx` |
| EV-A1 | `apps/backend/src/services/emergencyTroubleshooter.service.ts`, `apps/backend/src/routes/emergency.routes.ts` |
| EV-A2 | `apps/backend/src/services/budgetForecaster.service.ts`, `apps/backend/src/routes/budgetForecaster.routes.ts` |
| EV-A3 | `apps/backend/src/services/documentIntelligence.service.ts`, `apps/backend/src/routes/document.routes.ts` |
| EV-A4 | `apps/backend/src/services/climateRiskPredictor.service.ts`, `apps/backend/src/routes/climateRisk.routes.ts` |
| EV-A5 | `apps/backend/src/services/homeModificationAdvisor.service.ts`, `apps/backend/src/routes/homeModification.routes.ts` |
| EV-A6 | `apps/backend/src/services/coverageAnalysis.service.ts`, `apps/backend/src/routes/coverageAnalysis.routes.ts` |
| EV-A7 | `apps/backend/src/services/riskPremiumOptimizer.service.ts`, `apps/backend/src/routes/riskPremiumOptimizer.routes.ts` |
| EV-A8 | `apps/backend/src/services/energyAuditor.service.ts`, `apps/backend/src/routes/energyAuditor.routes.ts` |
| EV-A9 | `apps/backend/src/services/doNothingSimulator.service.ts`, `apps/backend/src/routes/doNothingSimulator.routes.ts` |
| EV-A10 | `apps/backend/src/services/applianceOracle.service.ts`, `apps/backend/src/routes/applianceOracle.routes.ts` |

---

## 8. Summary

**Classification integrity check (42 entries total):**

| Classification | Count | Tools |
|---|---|---|
| 1 — Production-grade | 3 | Replace or Repair, Home Savings Check, Value Tracker |
| 2 — Usable but needs targeted hardening | 19 | Home Risk Replay, Service Price Radar, Cost Growth, True Cost, Cost Explainer, Break-Even, Home Capital Timeline, Sell/Hold/Rent, Status Board, Home Digital Will, Hidden Asset Finder, Home Habit Coach, Negotiation Shield, Mortgage Refinance Radar, Coverage Intelligence, Risk-to-Premium Optimizer, Do-Nothing Simulator, Appliance Oracle, Energy Audit |
| 3 — Valuable but incomplete | 12 | Home Event Radar, Property Tax, Cost Volatility, Seller Prep, Home Digital Twin, Plant Advisor, Renovation Risk Advisor, Home Gazette, Document Vault, Budget Planner, Price Finalization, Guidance Overview |
| 4 — Conceptually good but not production-ready | 5 | Insurance Trend, Emergency Help, Climate Risk, Home Upgrades, Neighborhood Change Radar |
| 5 — Rework/reposition | 1 | Quote Comparison |
| 0 — Not independently scorable | 2 | Coverage Options, Home Timeline |

**Phase 1 execution scope for hardening:**

- 39 tools (all scored tools except Guidance Overview and the 2 unscored entries)
- Two independent tracks: Home Tools and AI Tools
- Top-15 implementation board is executable without Guidance Overview dependencies

**Central finding:**

The product has strong analytical depth but uneven production hardening. The fastest path to dependable user outcomes is to close high-risk gaps in Home and AI tools independently, then reintroduce orchestration once tool-level reliability is proven.
