# Signal & Action Taxonomy Reference — v3.0

**Generated:** 2026-03-17
**Applies to:** signal-action-audit.json (55 signals, schema v3.0)
**Purpose:** Canonical reference for Guidance Engine resolver, signal classification, and routing decisions

---

## 1. Signal Intent Families

All 21 normalized signal intent families used in the v3.0 audit.

### `lifecycle_end_or_past_life`
**Description:** A system or appliance has reached or exceeded its expected service life (ageRatio >= 0.85). The homeowner's primary concern is whether to repair or replace, and whether coverage exists.
**issueDomain(s):** asset_lifecycle, insurance, safety
**Typical canonicalFirstStep:** Compare repair vs replace / Check coverage / Replace immediately
**executionReadiness pattern:** Always `not_ready` — repair-vs-replace analysis and coverage check must precede booking
**Signals:** SIG-002 (HVAC), SIG-003 (Roof), SIG-004 (Water Heater), SIG-045 (Electrical Panel), SIG-047 (Plumbing)

---

### `overdue_maintenance`
**Description:** A maintenance task, habit, or predictive alert has passed its due date or failure probability has exceeded threshold. The homeowner needs to understand urgency and decide DIY vs professional.
**issueDomain(s):** maintenance, onboarding
**Typical canonicalFirstStep:** Assess urgency / Estimate out-of-pocket cost
**executionReadiness pattern:** `not_ready` if safety-critical or isNoAction=true; `needs_context` if DIY vs pro decision pending; `ready` if simple task with known professional routing
**Signals:** SIG-005, SIG-015, SIG-027, SIG-041, SIG-047, SIG-051

---

### `coverage_gap`
**Description:** Property lacks active insurance coverage — NO_COVERAGE, WARRANTY_ONLY, EXPIRED_INSURANCE, or coverage lapse incident detected by worker.
**issueDomain(s):** insurance
**Typical canonicalFirstStep:** Check coverage
**executionReadiness pattern:** Always `not_ready` — coverage verification and remediation path must be surfaced before any other action
**Signals:** SIG-008, SIG-053

---

### `policy_expiring`
**Description:** A home insurance policy is within 60 days of expiry. Homeowner needs to shop rates and renew before lapse occurs.
**issueDomain(s):** insurance
**Typical canonicalFirstStep:** Check coverage
**executionReadiness pattern:** `not_ready` — no frontend alert exists; must bridge worker incident to UI
**Signals:** SIG-007

---

### `recall_detected`
**Description:** An appliance or system in the property's inventory has been matched to an active government recall (OPEN or DISMISSED without resolution).
**issueDomain(s):** safety
**Typical canonicalFirstStep:** Replace immediately (OPEN) / Request recall remediation (DISMISSED)
**executionReadiness pattern:** `not_ready` for OPEN recalls (safety-critical, no alert exists); `tracking_only` for DISMISSED without resolution
**Signals:** SIG-014, SIG-052

---

### `price_above_market`
**Description:** A contractor quote has been flagged as above the market price range for the service category and location.
**issueDomain(s):** pricing
**Typical canonicalFirstStep:** Review quote
**executionReadiness pattern:** `needs_context` — counter-offer tool and competing provider search must be available before acting on the quote
**Signals:** SIG-010

---

### `deductible_exposure`
**Description:** The homeowner's insurance deductible exceeds 40% of their emergency cash buffer, creating material financial risk if a claim occurs.
**issueDomain(s):** financial
**Typical canonicalFirstStep:** Validate deductible impact
**executionReadiness pattern:** `not_ready` — backend computes the ratio but no frontend action exists
**Signals:** SIG-009

---

### `inspection_due`
**Description:** No property inspection has been recorded in the past 12 months, or a specific system inspection is flagged as needed.
**issueDomain(s):** maintenance
**Typical canonicalFirstStep:** Schedule inspection
**executionReadiness pattern:** `not_ready` — time-since-last-inspection and scope education must precede booking CTA
**Signals:** SIG-016

---

### `inspection_followup_needed`
**Description:** An inspection (professional or AI-visual) has found defects or issues that remain unresolved and need follow-up action.
**issueDomain(s):** maintenance
**Typical canonicalFirstStep:** Assess urgency
**executionReadiness pattern:** `needs_context` — per-defect severity, cost estimate, and provider-category mapping are all missing
**Signals:** SIG-017, SIG-037

---

### `permit_documentation_gap`
**Description:** A modification or renovation requires a permit that has not been filed, or unpermitted work is suspected based on property records.
**issueDomain(s):** compliance
**Typical canonicalFirstStep:** Verify permit status
**executionReadiness pattern:** `not_ready` (SIG-018 isNoAction=true); `needs_context` (SIG-043 has some frontend but missing permit filing link)
**Signals:** SIG-018, SIG-043

---

### `neighborhood_change_risk`
**Description:** A nearby property event (permit filing, sale, new construction) has been detected that may affect the homeowner's property value.
**issueDomain(s):** neighborhood
**Typical canonicalFirstStep:** Log to home timeline
**executionReadiness pattern:** `tracking_only` — informational signal; no immediate action required
**Signals:** SIG-019

---

### `seller_readiness_gap`
**Description:** The homeowner is preparing to sell but has incomplete pre-listing items, or the property onboarding is not complete enough to surface full platform value.
**issueDomain(s):** market_value, onboarding
**Typical canonicalFirstStep:** Check seasonal readiness (SIG-020) / Log to home timeline (SIG-055)
**executionReadiness pattern:** `needs_context` (SIG-020 — no frontend screens); `not_ready` (SIG-055 — routes to booking before data captured)
**Signals:** SIG-020, SIG-055

---

### `valuation_uncertainty`
**Description:** The homeowner's property value, home score, or appreciation trajectory is uncertain, stale, or below benchmarks. Requires updated valuation or score improvement actions.
**issueDomain(s):** market_value, maintenance
**Typical canonicalFirstStep:** Assess urgency
**executionReadiness pattern:** `needs_context` for most; `tracking_only` for appreciation signals that are informational
**Signals:** SIG-001, SIG-031, SIG-038, SIG-050

---

### `seasonal_readiness_due`
**Description:** A seasonal checklist, gazette section, or daily pulse task is pending for the current season and requires the homeowner's attention or completion.
**issueDomain(s):** maintenance
**Typical canonicalFirstStep:** Check seasonal readiness
**executionReadiness pattern:** `ready` when checklist exists and tasks are well-defined; `needs_context` when gazette is disconnected from checklist
**Signals:** SIG-006, SIG-029, SIG-044, SIG-048

---

### `energy_inefficiency`
**Description:** Energy usage or costs are estimated to be above optimal levels for the property profile based on audit analysis.
**issueDomain(s):** financial
**Typical canonicalFirstStep:** Assess urgency
**executionReadiness pattern:** `needs_context` — top waste sources and prioritized action list not surfaced
**Signals:** SIG-012

---

### `refinance_opportunity_exposure`
**Description:** Current mortgage rates may be favorable relative to the homeowner's existing rate, creating a refinance opportunity that has not been acted upon.
**issueDomain(s):** financial
**Typical canonicalFirstStep:** Compare quotes
**executionReadiness pattern:** `needs_context` — market rate comparison and lender pre-qualification link absent
**Signals:** SIG-011

---

### `tax_overpayment_exposure`
**Description:** Property tax assessment may be over-valued relative to comparable sales, creating an appeal opportunity.
**issueDomain(s):** financial
**Typical canonicalFirstStep:** Verify permit status
**executionReadiness pattern:** `ready` — backend has full appeal logic; frontend just needs appeal initiation CTA
**Signals:** SIG-013

---

### `maintenance_cost_burden`
**Description:** Deferred maintenance, upcoming capital expenses, budget shortfalls, or cost-of-inaction scenarios are creating financial accumulation risk for the homeowner.
**issueDomain(s):** financial
**Typical canonicalFirstStep:** Estimate out-of-pocket cost
**executionReadiness pattern:** `needs_context` for most — cost estimates exist in backend but routing to cost-reduction tools is absent
**Signals:** SIG-021, SIG-025, SIG-033, SIG-039, SIG-046, SIG-049, SIG-054

---

### `uncovered_repair_exposure`
**Description:** A financial tool or analysis has found that the homeowner's insurance premium is above market, or that a rebate/program opportunity exists that reduces out-of-pocket exposure.
**issueDomain(s):** financial, insurance
**Typical canonicalFirstStep:** Compare quotes / Estimate out-of-pocket cost
**executionReadiness pattern:** `needs_context` — ranked action lists, insurer comparison, and application links absent
**Signals:** SIG-030, SIG-035

---

### `contractor_quality_risk`
**Description:** A booking or contractor interaction has quality, urgency manipulation, or dispute risk indicators. Includes booking lifecycle signals (PENDING, COMPLETED, DISPUTED).
**issueDomain(s):** booking, negotiation, claims
**Typical canonicalFirstStep:** Compare quotes / Assess urgency / Log to home timeline
**executionReadiness pattern:** `not_ready` for DISPUTED (no resolution workflow); `tracking_only` for PENDING/COMPLETED; `needs_context` for urgency/quality flags
**Signals:** SIG-022, SIG-023, SIG-034, SIG-042

---

### `asset_info_missing`
**Description:** Required asset data (appliance model, age, purchase date) or property data (digital twin completeness) is absent, blocking downstream analysis.
**issueDomain(s):** documentation
**Typical canonicalFirstStep:** Log to home timeline
**executionReadiness pattern:** `ready` — Add Item / Add Missing Data CTAs exist; only field-level routing and priority guidance are missing
**Signals:** SIG-028, SIG-032

---

### `claim_documentation_gap`
**Description:** A claim has been denied or underpaid, or an insurance document has not been uploaded/processed via OCR, blocking coverage gap analysis.
**issueDomain(s):** claims, documentation
**Typical canonicalFirstStep:** Validate deductible impact (denied claim) / Check coverage (policy not uploaded)
**executionReadiness pattern:** `needs_context` (SIG-024 — appeal workflow absent); `ready` (SIG-040 — Upload Policy CTA works)
**Signals:** SIG-024, SIG-040

---

### `climate_risk_to_value`
**Description:** Climate risk scores (flood, wildfire, freeze) or historical risk patterns are high, potentially impacting property value, insurance costs, or physical safety.
**issueDomain(s):** insurance, maintenance
**Typical canonicalFirstStep:** Check coverage / Log to home timeline
**executionReadiness pattern:** `needs_context` for active climate risk (SIG-026); `tracking_only` for historical pattern (SIG-036)
**Signals:** SIG-026, SIG-036

---

## 2. Issue Domains

| Domain | Description | Signal Count | Primary Tool/Flow |
|---|---|---|---|
| safety | Physical hazard to home occupants — recalls, electrical panel brand risk, gas/fire risks | 4 | Asset Detail Page |
| maintenance | Ongoing upkeep, overdue tasks, seasonal readiness, predictive failure | 17 | Maintenance Checklist |
| insurance | Coverage gaps, policy expiry, premium optimization, lapse incidents | 10 | Insurance Auditor |
| financial | Savings shortfalls, cost-of-inaction, mortgage opportunities, budget gaps | 12 | Energy Audit / Home Timeline |
| compliance | Permit gaps, unpermitted work, renovation risk | 3 | Permit/Compliance Advisor |
| market_value | Home score, appreciation, sell/hold/rent decisions | 4 | Seller Prep Checklist / Risk Detail Drawer |
| asset_lifecycle | Appliance EOL, repair vs replace decisions | 2 | Replace vs Repair |
| claims | Denied/underpaid claims, booking disputes | 3 | Claims Assistant |
| pricing | Above-market quotes, service price spikes | 2 | Negotiation Shield / Price Radar |
| negotiation | Contractor urgency manipulation, counter-offer needed | 1 | Negotiation Shield |
| booking | Booking lifecycle (PENDING, COMPLETED, DISPUTED) | 2 | Booking Flow |
| documentation | Missing docs, OCR not processed, digital twin quality | 3 | Home Timeline / Asset Detail Page |
| neighborhood | Nearby permit activity, local market changes | 1 | Home Event Radar |
| onboarding | Move-in tasks, buyer tasks, onboarding completeness | 4 | Maintenance Checklist / Home Timeline |

---

## 3. Execution Readiness Rubric

The following rules govern `executionReadiness` assignment:

### Rule 1: isPrematureBooking=true → always `not_ready`
A signal that routes directly to provider booking without a diagnosis or decision gate is `not_ready`. The repair-vs-replace analysis, coverage check, or safety education must be presented first.

### Rule 2: isNoAction=true + safety or insurance issueDomain → `not_ready`
Safety (recall, electrical, gas) and insurance (lapse, gap) signals with no frontend action are `not_ready`. The system detects the problem but provides no path forward — this is a blocking gap.

### Rule 3: isNoAction=true + informational issueDomain → `tracking_only`
Signals that are informational in nature (neighborhood events, booking tracking, historical patterns) and have no action can be `tracking_only`. The user should monitor, not act.

### Rule 4: All context prerequisites met → `ready`
When the backend data is available AND a reasonable frontend CTA exists AND no pre-decision steps are missing, the signal is `ready`. The Guidance Engine can render the execution CTA directly.

### Rule 5: Some context missing → `needs_context`
When the backend has the data but the frontend does not surface the critical decision inputs (cost estimate, coverage status, comparable quotes, severity classification), the signal is `needs_context`. The Guidance Engine must first collect or display missing context before offering the CTA.

### Rule 6: Insufficient information to classify → `unknown`
Reserve for signals added in future audits before full review.

---

## 4. Canonical First Step Examples

| Signal Family | Canonical First Step | Recommended Tool |
|---|---|---|
| `lifecycle_end_or_past_life` (HVAC/Water Heater) | Compare repair vs replace | Replace vs Repair |
| `lifecycle_end_or_past_life` (Roof) | Check coverage | Insurance Auditor |
| `lifecycle_end_or_past_life` (Electrical Panel) | Replace immediately | Asset Detail Page |
| `coverage_gap` | Check coverage | Insurance Auditor |
| `policy_expiring` | Check coverage | Insurance Auditor |
| `recall_detected` (OPEN) | Replace immediately | Asset Detail Page |
| `recall_detected` (DISMISSED) | Request recall remediation | Asset Detail Page |
| `price_above_market` | Review quote | Negotiation Shield |
| `deductible_exposure` | Validate deductible impact | Insurance Auditor |
| `overdue_maintenance` (high failure prob) | Assess urgency | Maintenance Checklist |
| `overdue_maintenance` (cost-of-delay) | Estimate out-of-pocket cost | Maintenance Checklist |
| `inspection_due` | Schedule inspection | Booking Flow |
| `inspection_followup_needed` | Assess urgency | Negotiation Shield |
| `permit_documentation_gap` | Verify permit status | Permit/Compliance Advisor |
| `neighborhood_change_risk` | Log to home timeline | Home Event Radar |
| `seller_readiness_gap` | Check seasonal readiness | Seller Prep Checklist |
| `valuation_uncertainty` | Assess urgency | Risk Detail Drawer |
| `seasonal_readiness_due` | Check seasonal readiness | Maintenance Checklist |
| `energy_inefficiency` | Assess urgency | Energy Audit |
| `refinance_opportunity_exposure` | Compare quotes | Price Radar |
| `tax_overpayment_exposure` | Verify permit status | Home Timeline |
| `maintenance_cost_burden` | Estimate out-of-pocket cost | Maintenance Checklist |
| `uncovered_repair_exposure` | Compare quotes | Insurance Auditor |
| `contractor_quality_risk` (urgency) | Compare quotes | Negotiation Shield |
| `contractor_quality_risk` (booking) | Log to home timeline | Booking Flow |
| `contractor_quality_risk` (dispute) | Assess urgency | Claims Assistant |
| `asset_info_missing` | Log to home timeline | Home Timeline |
| `claim_documentation_gap` (denied) | Validate deductible impact | Claims Assistant |
| `claim_documentation_gap` (no upload) | Check coverage | Insurance Auditor |
| `climate_risk_to_value` | Check coverage | Insurance Auditor |

---

## 5. Recommended Tools & Flows Reference

### Insurance Auditor
**Signals routed here:** SIG-003, SIG-007, SIG-008, SIG-009, SIG-026, SIG-035, SIG-040, SIG-053
**What they have in common:** All involve insurance coverage status, premium level, or policy expiry. The Insurance Auditor is the central hub for coverage intelligence.
**Rationale:** coverageGap.service, insuranceAuditor.service, and riskPremiumOptimizer.service all exist in backend. Frontend coverage-intelligence page and insurance page exist. The gap is surfacing remediation CTAs per gap type.

---

### Replace vs Repair
**Signals routed here:** SIG-002, SIG-004
**What they have in common:** HVAC and Water Heater at or past expected lifespan — classic repair-vs-replace decisions.
**Rationale:** replaceRepairAnalysis.service.ts exists in backend. The Guidance Engine must insert this analysis as a mandatory gate before any provider booking CTA for lifecycle signals.

---

### Price Radar
**Signals routed here:** SIG-011, SIG-046
**What they have in common:** Market rate comparisons — mortgage refinance rates and service price spikes both require market data comparison before the user can decide.
**Rationale:** servicePriceRadar.engine.ts and breakEven.service.ts both produce market comparison data. The Price Radar surface is the right destination for "should I lock in now?" decisions.

---

### Negotiation Shield
**Signals routed here:** SIG-010, SIG-017, SIG-034
**What they have in common:** All involve contractor or inspection findings where the homeowner needs tools to push back, negotiate, or leverage data.
**Rationale:** negotiationShieldContractorQuote.service, negotiationShieldContractorUrgency.service, and negotiationShieldBuyerInspection.service all exist. The unified Negotiation Shield frontend page is the destination.

---

### Booking Flow
**Signals routed here:** SIG-016, SIG-022, SIG-047
**What they have in common:** Inspection scheduling and booking lifecycle signals where booking is the correct next action — but only after prerequisites are met.
**Rationale:** Booking flow at /dashboard/providers is the correct destination. For SIG-016 and SIG-047 it is currently premature; the Guidance Engine must gate it with prerequisite checks.

---

### Maintenance Checklist
**Signals routed here:** SIG-005, SIG-006, SIG-015, SIG-021, SIG-027, SIG-029, SIG-037, SIG-044, SIG-049, SIG-051
**What they have in common:** All involve overdue, seasonal, or predicted maintenance tasks where the homeowner needs a prioritized to-do list.
**Rationale:** seasonalChecklist.service, maintenancePrediction.service, and dailyHomePulse.service all exist. Maintenance page and seasonal page are the primary destinations.

---

### Home Timeline
**Signals routed here:** SIG-013, SIG-023, SIG-025, SIG-028, SIG-030, SIG-033, SIG-036, SIG-041
**What they have in common:** Logging events, tracking history, or informational follow-ups where the canonical action is to record something for future reference rather than execute immediately.
**Rationale:** Home Timeline (homeTimeline.service, ES_HOME_TIMELINE.md) is the longitudinal record of all property events. Many signals that are currently "no action" should route here as a baseline.

---

### Claims Assistant
**Signals routed here:** SIG-024, SIG-042
**What they have in common:** Insurance claim denial and booking dispute both require structured resolution workflows involving documentation, negotiation, and escalation.
**Rationale:** claims.service exists with full claim lifecycle. negotiationShieldInsuranceClaimSettlement.service exists for denied claims. The Claims Assistant is the correct orchestration surface.

---

### Risk Detail Drawer
**Signals routed here:** SIG-001, SIG-050
**What they have in common:** Overall risk/score signals that need score-band-specific routing logic and a drill-down into the specific risk domains driving the score.
**Rationale:** RiskAssessment.service produces per-asset risk levels and actionCta. The Risk Detail Drawer (or risk-assessment page) needs score-band differentiation to be useful.

---

### Asset Detail Page
**Signals routed here:** SIG-014, SIG-032, SIG-045, SIG-052
**What they have in common:** Recall alerts and inventory signals that are asset-specific and require the user to see the full asset context (age, model, recall status, warranty) before acting.
**Rationale:** The inventory/asset page with recall confirmation/dismissal APIs is the natural hub for all per-asset safety and documentation signals.

---

### Home Event Radar
**Signals routed here:** SIG-019
**What they have in common:** Neighborhood change events from the homeEventRadar worker pipeline.
**Rationale:** homeEventRadar.service and the Home Event Radar page already exist. The gap is value-impact classification and sell/hold/rent cross-linking.

---

### Permit/Compliance Advisor
**Signals routed here:** SIG-018, SIG-043
**What they have in common:** Both involve permit requirements — unpermitted work suspected and high-risk renovation planned.
**Rationale:** homeModificationAdvisor.service has permitRequired flag. A dedicated Permit/Compliance Advisor surface (or enhanced home-renovation-risk-advisor page) is the appropriate destination.

---

### Energy Audit
**Signals routed here:** SIG-012, SIG-039, SIG-054
**What they have in common:** Energy inefficiency, above-market ownership costs, and budget shortfalls all share energy/utility costs as a primary reduction lever.
**Rationale:** energyAuditor.service.ts exists. The Energy Audit page provides prioritized waste sources. It is the first-line cost-reduction tool before more complex financial tools.

---

### Seller Prep Checklist
**Signals routed here:** SIG-020, SIG-031, SIG-038
**What they have in common:** All three involve decisions about maximizing home value — through pre-listing prep, sell/hold/rent analysis, or improving below-average appreciation.
**Rationale:** sellerPrep.service.ts, roiRules.engine.ts, and valueCalculator.engine.ts exist in backend. Frontend screens are missing and must be built for the Guidance Engine to route here.

---

### Gazette
**Signals routed here:** SIG-029, SIG-048
**What they have in common:** AI-generated digest signals where the gazette itself is the surface — but individual recommendations within it need per-item action routing.
**Rationale:** gazetteGeneration.job.ts and HomeGazetteClient.tsx exist. The Guidance Engine should integrate with gazette sections to provide per-recommendation CTAs rather than a single "View Details."

---

*End of Signal & Action Taxonomy Reference v3.0*
