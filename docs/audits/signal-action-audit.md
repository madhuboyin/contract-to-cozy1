# Signal & Action Audit (Final Hardened) — v3.0

**Generated:** 2026-03-17
**Source of truth:** signal-action-audit.json
**Schema version:** 3.0
**Scope:** Full codebase (backend + frontend + workers + schema)
**Purpose:** Guidance Engine design input

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Final Signal Taxonomy](#2-final-signal-taxonomy)
3. [Highest-Risk Broken Flows](#3-highest-risk-broken-flows)
4. [Signal → Canonical First Step Mapping](#4-signal--canonical-first-step-mapping)
5. [Execution Readiness Analysis](#5-execution-readiness-analysis)
6. [Guidance Engine Input Readiness](#6-guidance-engine-input-readiness)
7. [Remaining Edge Cases / Manual Review](#7-remaining-edge-cases--manual-review)

---

## 1. Executive Summary

| Metric | Count |
|--------|-------|
| Total signals | 55 |
| Total normalized signal families | 21 |
| Total issue domains represented | 13 |
| Signals with no action (`isNoAction=true`) | 12 |
| Generic CTA count (`isGenericCta=true`) | 23 |
| Premature booking count (`isPrematureBooking=true`) | 8 |
| Backend exists / frontend weak | 52 |
| Backend action missing | 2 |
| High confidence signals | 30 |
| Medium confidence signals | 25 |
| **Execution readiness — not_ready** | **13** |
| **Execution readiness — needs_context** | **23** |
| **Execution readiness — ready** | **10** |
| **Execution readiness — tracking_only** | **7** |
| **Execution readiness — unknown** | **2** |

### Signal Family Distribution (v3.0 — Post Taxonomy Split)

Previous over-broad families (`home_value_risk`, `financial_exposure`, `missing_documentation`) have been split into sub-families based on homeowner intent and canonical first step. The 21 normalized families are listed in Section 2.

---

## 2. Final Signal Taxonomy

| signalIntentFamily | issueDomain(s) | Count | Typical canonicalFirstStep | Typical recommendedToolOrFlow |
|---|---|---|---|---|
| `lifecycle_end_or_past_life` | asset_lifecycle, insurance, safety | 5 | Compare repair vs replace / Check coverage / Replace immediately | Replace vs Repair / Insurance Auditor / Asset Detail Page |
| `overdue_maintenance` | maintenance, onboarding | 8 | Assess urgency / Estimate out-of-pocket cost | Maintenance Checklist |
| `coverage_gap` | insurance | 3 | Check coverage | Insurance Auditor |
| `policy_expiring` | insurance | 1 | Check coverage | Insurance Auditor |
| `recall_detected` | safety | 2 | Replace immediately / Request recall remediation | Asset Detail Page |
| `price_above_market` | pricing | 1 | Review quote | Negotiation Shield |
| `high_out_of_pocket_exposure` | — | 0 | — | — (split into `deductible_exposure`) |
| `deductible_exposure` | financial | 1 | Validate deductible impact | Insurance Auditor |
| `inspection_due` | maintenance | 1 | Schedule inspection | Booking Flow |
| `inspection_followup_needed` | maintenance | 2 | Assess urgency | Negotiation Shield / Maintenance Checklist |
| `permit_documentation_gap` | compliance | 2 | Verify permit status | Permit/Compliance Advisor |
| `neighborhood_change_risk` | neighborhood | 1 | Log to home timeline | Home Event Radar |
| `seller_readiness_gap` | market_value, onboarding | 2 | Check seasonal readiness / Log to home timeline | Seller Prep Checklist / Home Timeline |
| `valuation_uncertainty` | market_value, maintenance | 5 | Assess urgency | Risk Detail Drawer / Seller Prep Checklist |
| `seasonal_readiness_due` | maintenance | 5 | Check seasonal readiness | Maintenance Checklist / Gazette |
| `energy_inefficiency` | financial | 1 | Assess urgency | Energy Audit |
| `refinance_opportunity_exposure` | financial | 1 | Compare quotes | Price Radar |
| `tax_overpayment_exposure` | financial | 1 | Verify permit status | Home Timeline |
| `deductible_exposure` | financial | 1 | Validate deductible impact | Insurance Auditor |
| `maintenance_cost_burden` | financial | 9 | Estimate out-of-pocket cost | Maintenance Checklist / Home Timeline / Energy Audit |
| `uncovered_repair_exposure` | financial, insurance | 3 | Compare quotes / Estimate out-of-pocket cost | Insurance Auditor / Home Timeline |
| `contractor_quality_risk` | booking, negotiation, claims | 5 | Compare quotes / Assess urgency / Log to home timeline | Negotiation Shield / Booking Flow / Claims Assistant |
| `asset_info_missing` | documentation | 2 | Log to home timeline | Home Timeline / Asset Detail Page |
| `claim_documentation_gap` | claims, documentation | 2 | Validate deductible impact / Check coverage | Claims Assistant / Insurance Auditor |
| `climate_risk_to_value` | insurance, maintenance | 2 | Check coverage / Log to home timeline | Insurance Auditor / Home Timeline |

---

## 3. Highest-Risk Broken Flows

### 3.1 Premature Booking (isPrematureBooking=true)

These 8 signals route users directly to provider booking, skipping critical intermediate steps (repair-vs-replace analysis, coverage checks, safety education).

| Signal ID | Signal Label | Current Action | Missing Intermediate Step |
|---|---|---|---|
| SIG-002 | HVAC System — At or Past Expected Lifespan | Schedule Replacement → providers | Repair vs Replace analysis; warranty coverage check |
| SIG-003 | Roof System — Aging or Past Expected Lifespan | Schedule Inspection → providers | Insurance coverage check for roof replacement |
| SIG-004 | Water Heater — Near or At End of Life | Schedule Maintenance → providers | Recall check; home warranty coverage check |
| SIG-005 | Maintenance Task Overdue | Overdue - Schedule Now → providers | Cost-of-delay estimate; DIY vs professional decision |
| SIG-016 | Property Inspection — No Recent Inspection | Schedule Inspection → providers | Time-since-last-inspection display; scope education |
| SIG-045 | Electrical Panel — Age Risk or Recall Flag | Schedule Inspection → providers | Brand-specific risk warning (Federal Pacific/Zinsco); recall cross-check |
| SIG-047 | Plumbing System — Age Risk (15+ Year Pipes) | Schedule Inspection → providers | Pipe material education; water damage history check; insurance check |
| SIG-055 | Property Onboarding Incomplete | Schedule Inspection / Comprehensive Assessment → providers | Basic property data capture before booking |

### 3.2 Critical Signals With No Action (isNoAction=true + safety/insurance)

| Signal ID | Signal Label | issueDomain | canonicalFirstStep |
|---|---|---|---|
| SIG-007 | Insurance Policy Expiring Within 60 Days | insurance | Check coverage |
| SIG-008 | Coverage Gap Detected — NO_COVERAGE or WARRANTY_ONLY | insurance | Check coverage |
| SIG-009 | Deductible-to-Cash-Buffer Ratio >40% | financial | Validate deductible impact |
| SIG-014 | Appliance Recall Match — OPEN Status | safety | Replace immediately |
| SIG-018 | Unpermitted Work Suspected | compliance | Verify permit status |
| SIG-042 | Booking Disputed — Unresolved | claims | Assess urgency |
| SIG-053 | Coverage Lapse Incident — Worker-Detected | insurance | Check coverage |

### 3.3 Backend Guidance Hidden From Frontend

These signals have confirmed backend logic (`backendActionExists=true`) but no matching frontend CTA. They represent the highest-ROI frontend-only opportunities.

| Signal ID | Signal Label | canonicalFirstStep | recommendedToolOrFlow |
|---|---|---|---|
| SIG-007 | Policy Expiring | Check coverage | Insurance Auditor |
| SIG-008 | Coverage Gap | Check coverage | Insurance Auditor |
| SIG-009 | High Deductible Ratio | Validate deductible impact | Insurance Auditor |
| SIG-013 | Tax Overpayment Risk | Verify permit status | Home Timeline |
| SIG-014 | Recall Match OPEN | Replace immediately | Asset Detail Page |
| SIG-015 | High Failure Probability | Assess urgency | Maintenance Checklist |
| SIG-018 | Permit Gap | Verify permit status | Permit/Compliance Advisor |
| SIG-019 | Neighborhood Change | Log to home timeline | Home Event Radar |
| SIG-020 | Seller Prep Incomplete | Check seasonal readiness | Seller Prep Checklist |
| SIG-021 | Cost of Inaction | Estimate out-of-pocket cost | Maintenance Checklist |
| SIG-024 | Claim Denied | Validate deductible impact | Claims Assistant |
| SIG-026 | High Climate Risk | Check coverage | Insurance Auditor |
| SIG-030 | Hidden Asset Found | Estimate out-of-pocket cost | Home Timeline |
| SIG-031 | Sell/Hold/Rent Optimal Exit | Assess urgency | Seller Prep Checklist |
| SIG-033 | Capital Expense < 12 Months | Estimate out-of-pocket cost | Home Timeline |
| SIG-034 | Urgency Flag in Quote | Compare quotes | Negotiation Shield |
| SIG-035 | Premium Above Market | Compare quotes | Insurance Auditor |
| SIG-036 | Historical Risk Pattern | Log to home timeline | Home Timeline |
| SIG-038 | Appreciation Below Average | Assess urgency | Seller Prep Checklist |
| SIG-039 | True Cost Above Market | Estimate out-of-pocket cost | Energy Audit |
| SIG-050 | Home Score Below 70 | Assess urgency | Risk Detail Drawer |
| SIG-053 | Coverage Lapse | Check coverage | Insurance Auditor |
| SIG-054 | Budget Monthly Shortfall | Estimate out-of-pocket cost | Energy Audit |

**Total high-ROI frontend-only gaps: 23 signals**

---

## 4. Signal → Canonical First Step Mapping

| Signal ID | Signal Label | signalIntentFamily | canonicalFirstStep | idealStage | executionReadiness | recommendedToolOrFlow |
|---|---|---|---|---|---|---|
| SIG-001 | Property Risk Score | valuation_uncertainty | Assess urgency | diagnosis | needs_context | Risk Detail Drawer |
| SIG-002 | HVAC System — At or Past Expected Lifespan | lifecycle_end_or_past_life | Compare repair vs replace | decision | not_ready | Replace vs Repair |
| SIG-003 | Roof System — Aging or Past Expected Lifespan | lifecycle_end_or_past_life | Check coverage | diagnosis | not_ready | Insurance Auditor |
| SIG-004 | Water Heater — Near or At End of Life | lifecycle_end_or_past_life | Compare repair vs replace | decision | not_ready | Replace vs Repair |
| SIG-005 | Maintenance Task Overdue | overdue_maintenance | Estimate out-of-pocket cost | decision | not_ready | Maintenance Checklist |
| SIG-006 | Seasonal Checklist Pending | seasonal_readiness_due | Check seasonal readiness | execution | ready | Maintenance Checklist |
| SIG-007 | Insurance Policy Expiring | policy_expiring | Check coverage | decision | not_ready | Insurance Auditor |
| SIG-008 | Coverage Gap Detected | coverage_gap | Check coverage | decision | not_ready | Insurance Auditor |
| SIG-009 | High Deductible Ratio | deductible_exposure | Validate deductible impact | decision | not_ready | Insurance Auditor |
| SIG-010 | Quote Price Above Market | price_above_market | Review quote | decision | needs_context | Negotiation Shield |
| SIG-011 | Refinance Break-Even Not Reached | refinance_opportunity_exposure | Compare quotes | decision | needs_context | Price Radar |
| SIG-012 | Energy Inefficiency | energy_inefficiency | Assess urgency | diagnosis | needs_context | Energy Audit |
| SIG-013 | Tax Overpayment Risk | tax_overpayment_exposure | Verify permit status | execution | ready | Home Timeline |
| SIG-014 | Appliance Recall Match — OPEN | recall_detected | Replace immediately | execution | not_ready | Asset Detail Page |
| SIG-015 | High Failure Probability | overdue_maintenance | Assess urgency | decision | not_ready | Maintenance Checklist |
| SIG-016 | No Recent Inspection | inspection_due | Schedule inspection | diagnosis | not_ready | Booking Flow |
| SIG-017 | Inspection Defect Found | inspection_followup_needed | Assess urgency | decision | needs_context | Negotiation Shield |
| SIG-018 | Unpermitted Work Suspected | permit_documentation_gap | Verify permit status | diagnosis | not_ready | Permit/Compliance Advisor |
| SIG-019 | Neighborhood Change Detected | neighborhood_change_risk | Log to home timeline | diagnosis | tracking_only | Home Event Radar |
| SIG-020 | Seller Prep Plan Incomplete | seller_readiness_gap | Check seasonal readiness | decision | needs_context | Seller Prep Checklist |
| SIG-021 | Cost of Inaction Projection | maintenance_cost_burden | Estimate out-of-pocket cost | decision | needs_context | Maintenance Checklist |
| SIG-022 | Booking Awaiting Confirmation | contractor_quality_risk | Log to home timeline | tracking | tracking_only | Booking Flow |
| SIG-023 | Booking Completed No Review | contractor_quality_risk | Log to home timeline | validation | tracking_only | Home Timeline |
| SIG-024 | Insurance Claim Denied | claim_documentation_gap | Validate deductible impact | decision | needs_context | Claims Assistant |
| SIG-025 | Savings Goal Behind Target | maintenance_cost_burden | Estimate out-of-pocket cost | decision | needs_context | Home Timeline |
| SIG-026 | High Climate Risk | climate_risk_to_value | Check coverage | diagnosis | needs_context | Insurance Auditor |
| SIG-027 | Habit Overdue / Snoozed | overdue_maintenance | Assess urgency | decision | needs_context | Maintenance Checklist |
| SIG-028 | Digital Twin Quality Low | asset_info_missing | Log to home timeline | execution | ready | Home Timeline |
| SIG-029 | Gazette Weekly Digest | seasonal_readiness_due | Check seasonal readiness | decision | needs_context | Gazette |
| SIG-030 | Hidden Asset Found | uncovered_repair_exposure | Estimate out-of-pocket cost | execution | ready | Home Timeline |
| SIG-031 | Sell/Hold/Rent Optimal Exit | valuation_uncertainty | Assess urgency | decision | needs_context | Seller Prep Checklist |
| SIG-032 | Inventory Missing | asset_info_missing | Log to home timeline | execution | ready | Asset Detail Page |
| SIG-033 | Capital Expense < 12 Months | maintenance_cost_burden | Estimate out-of-pocket cost | decision | needs_context | Home Timeline |
| SIG-034 | Contractor Urgency Flag | contractor_quality_risk | Compare quotes | decision | needs_context | Negotiation Shield |
| SIG-035 | Insurance Premium Above Market | uncovered_repair_exposure | Compare quotes | decision | needs_context | Insurance Auditor |
| SIG-036 | Historical Risk Pattern | climate_risk_to_value | Log to home timeline | decision | tracking_only | Home Timeline |
| SIG-037 | Visual Inspection AI Defect | inspection_followup_needed | Assess urgency | decision | needs_context | Maintenance Checklist |
| SIG-038 | Appreciation Below Average | valuation_uncertainty | Assess urgency | diagnosis | tracking_only | Seller Prep Checklist |
| SIG-039 | True Cost Above Market | maintenance_cost_burden | Estimate out-of-pocket cost | decision | needs_context | Energy Audit |
| SIG-040 | Insurance Doc Not Uploaded | claim_documentation_gap | Check coverage | execution | ready | Insurance Auditor |
| SIG-041 | Incomplete Property Details | overdue_maintenance | Log to home timeline | execution | ready | Home Timeline |
| SIG-042 | Booking Disputed | contractor_quality_risk | Assess urgency | execution | not_ready | Claims Assistant |
| SIG-043 | High Risk Renovation Planned | permit_documentation_gap | Verify permit status | validation | needs_context | Permit/Compliance Advisor |
| SIG-044 | Daily Pulse Micro-Task | seasonal_readiness_due | Check seasonal readiness | execution | ready | Maintenance Checklist |
| SIG-045 | Electrical Panel Age/Recall | lifecycle_end_or_past_life | Replace immediately | diagnosis | not_ready | Asset Detail Page |
| SIG-046 | Service Price Spike | maintenance_cost_burden | Compare quotes | decision | needs_context | Price Radar |
| SIG-047 | Plumbing Age Risk | overdue_maintenance | Schedule inspection | diagnosis | not_ready | Booking Flow |
| SIG-048 | Gazette Seasonal Section | seasonal_readiness_due | Check seasonal readiness | execution | needs_context | Gazette |
| SIG-049 | Move-In Checklist Incomplete | maintenance_cost_burden | Check seasonal readiness | execution | ready | Maintenance Checklist |
| SIG-050 | Home Score Below 70 | valuation_uncertainty | Assess urgency | decision | needs_context | Risk Detail Drawer |
| SIG-051 | Buyer Task Incomplete | overdue_maintenance | Assess urgency | execution | ready | Maintenance Checklist |
| SIG-052 | Recall Dismissed No Resolution | recall_detected | Request recall remediation | validation | tracking_only | Asset Detail Page |
| SIG-053 | Coverage Lapse Detected | coverage_gap | Check coverage | execution | not_ready | Insurance Auditor |
| SIG-054 | Budget Monthly Shortfall | maintenance_cost_burden | Estimate out-of-pocket cost | decision | needs_context | Energy Audit |
| SIG-055 | Onboarding Incomplete | seller_readiness_gap | Log to home timeline | execution | not_ready | Home Timeline |

---

## 5. Execution Readiness Analysis

### 5.1 Not Ready (not_ready) — 13 signals

Execution would be premature. All `isPrematureBooking=true` signals are here, plus `isNoAction=true` signals involving safety or insurance.

| Signal ID | Signal Label | Reason Not Ready |
|---|---|---|
| SIG-002 | HVAC Past Life | Repair vs replace analysis not run; coverage not checked |
| SIG-003 | Roof Aging | Insurance coverage for replacement not verified |
| SIG-004 | Water Heater EOL | Recall status unknown; warranty not checked |
| SIG-005 | Maintenance Overdue | Cost-of-delay context missing; DIY vs pro not decided |
| SIG-007 | Policy Expiring | No frontend alert exists; no renewal action surfaced |
| SIG-008 | Coverage Gap | No remediation path shown; user stranded with gap data |
| SIG-009 | High Deductible Ratio | No budget link or policy review CTA exists |
| SIG-014 | Recall Match OPEN | Safety-critical; no dashboard alert or remedy instructions |
| SIG-015 | High Failure Probability | isNoAction=true; safety-critical asset failure risk |
| SIG-016 | No Recent Inspection | User sent to booking without scope education or date context |
| SIG-018 | Unpermitted Work | No permit filing guidance or county records link |
| SIG-042 | Booking Disputed | No dispute resolution workflow exists |
| SIG-045 | Electrical Panel Risk | Safety-critical; brand risk and recall not surfaced |
| SIG-047 | Plumbing Age Risk | Pipe material and insurance not surfaced before booking |
| SIG-053 | Coverage Lapse | Worker fires incident; no frontend bridge to user |
| SIG-055 | Onboarding Incomplete | Routes to booking before basic data captured |

### 5.2 Needs Context (needs_context) — 23 signals

More information is required before the user can decide. Backend data exists but frontend does not surface the decision inputs.

| Signal ID | Signal Label | Missing Context |
|---|---|---|
| SIG-001 | Property Risk Score | Score-band routing logic not implemented |
| SIG-010 | Quote Above Market | No counter-offer tool or alternative provider search |
| SIG-011 | Refinance Break-Even | Market rate comparison not surfaced; no lender CTA |
| SIG-012 | Energy Inefficiency | Top 3 waste sources not shown; action list missing |
| SIG-017 | Inspection Defect | Per-defect severity and cost estimates missing |
| SIG-020 | Seller Prep Incomplete | No frontend screens exist yet |
| SIG-021 | Cost of Inaction | Per-item Act Now CTA missing |
| SIG-024 | Claim Denied | Appeal workflow not implemented |
| SIG-025 | Savings Behind Target | No unfunded expense integration |
| SIG-026 | High Climate Risk | Risk-type-specific action routing missing |
| SIG-027 | Habit Overdue | Consequence display and escalation path absent |
| SIG-029 | Gazette Weekly Digest | Per-recommendation CTA routing not built |
| SIG-031 | Sell/Hold/Rent Exit | Outcome-specific routing (sell/hold/rent) missing |
| SIG-033 | Capital Expense 12mo | Savings-gap integration absent |
| SIG-034 | Urgency Flag | Counter-script not generated; alternative quotes not shown |
| SIG-035 | Premium Above Market | Ranked action list and insurer comparison absent |
| SIG-037 | Visual Defect | Per-defect action routing not implemented |
| SIG-039 | True Cost Above Market | Line-item tool routing absent |
| SIG-043 | High Risk Renovation | Permit filing link missing |
| SIG-046 | Price Spike | Lock-in booking CTA missing |
| SIG-048 | Gazette Seasonal | Disconnected from seasonal checklist |
| SIG-050 | Home Score Below 70 | Domain improvement roadmap not surfaced |
| SIG-054 | Budget Shortfall | Per-category tool routing absent |

### 5.3 Ready for Execution (ready) — 10 signals

All context prerequisites met; user can proceed to execution-stage flow.

| Signal ID | Signal Label | Why Ready |
|---|---|---|
| SIG-006 | Seasonal Checklist Pending | Backend generates checklist; per-item Mark Complete exists |
| SIG-013 | Tax Overpayment Risk | Full appeal logic in backend; frontend just needs appeal initiation CTA |
| SIG-028 | Digital Twin Quality Low | Add Missing Data CTA exists; just needs field-level deep links |
| SIG-030 | Hidden Asset Found | Program data available; application link is the only gap |
| SIG-032 | Inventory Missing | Add Item CTA exists; guidance on priority missing but base action works |
| SIG-040 | Insurance Doc Not Uploaded | Upload Policy CTA exists; post-upload confirmation flow is the gap |
| SIG-041 | Incomplete Property Details | Navigation to property page works; field-level depth is missing |
| SIG-044 | Daily Pulse Micro-Task | Mark Complete works for DIY tasks; just missing pro task routing |
| SIG-049 | Move-In Checklist Incomplete | Complete Checklist CTA works; priority ranking is the gap |
| SIG-051 | Buyer Task Incomplete | View Task navigation works; deadline urgency display is the gap |

### 5.4 Tracking Only (tracking_only) — 7 signals

No action needed now; user should monitor or receive follow-up.

| Signal ID | Signal Label | Rationale |
|---|---|---|
| SIG-019 | Neighborhood Change Detected | Informational signal; log and monitor |
| SIG-022 | Booking Awaiting Confirmation | Booking is in flight; watch for confirmation |
| SIG-023 | Booking Completed No Review | Work done; post-completion confirmation is the next step |
| SIG-036 | Historical Risk Pattern | Historical data; prevention scheduling is follow-up |
| SIG-038 | Appreciation Below Average | Market signal; monitor and plan; not action-urgent |
| SIG-052 | Recall Match Dismissed | Dismissed state; follow-up reminder is the action |
| SIG-054 | Not applicable — moved to needs_context | — |

---

## 6. Guidance Engine Input Readiness

This audit is now suitable as input for Guidance Engine schema and resolver design. Here is why:

### Schema Completeness
All 55 signal records carry 19 fields including the 4 new hardened fields: `issueDomain`, `canonicalFirstStep`, `executionReadiness`, and `recommendedToolOrFlow`. No record is missing any field. The schema is consistent enough to be loaded directly into a signal resolver as a lookup table.

### Taxonomy Consistency
The `signalIntentFamily` taxonomy has been normalized from 15 families to 21 sub-families through three targeted splits:
- `home_value_risk` → `neighborhood_change_risk`, `climate_risk_to_value`, `seller_readiness_gap`, `valuation_uncertainty`
- `financial_exposure` → `deductible_exposure`, `uncovered_repair_exposure`, `tax_overpayment_exposure`, `maintenance_cost_burden`, `refinance_opportunity_exposure`
- `missing_documentation` → `inspection_followup_needed`, `asset_info_missing`, `claim_documentation_gap`, `permit_documentation_gap`

Each sub-family now maps to a distinct homeowner intent and canonical first step, eliminating the ambiguity that prevented resolver branching in v2.0.

### Canonical First Steps
All 55 signals have a `canonicalFirstStep` drawn from a controlled vocabulary of 11 values. No signal uses a vague or narrative first step. The controlled set is: `Assess urgency`, `Compare repair vs replace`, `Check coverage`, `Validate deductible impact`, `Review quote`, `Compare quotes`, `Verify permit status`, `Log to home timeline`, `Request recall remediation`, `Replace immediately`, `Estimate out-of-pocket cost`, `Check seasonal readiness`, `Schedule inspection`.

### Tool/Flow Mapping
Every signal has a `recommendedToolOrFlow` drawn from 16 known CtC destinations. The Guidance Engine resolver can use this field directly as the final routing target without additional lookup logic.

### Readiness Classification
The `executionReadiness` field provides the Guidance Engine with a decision gate. Before rendering a CTA, the engine should:
1. If `not_ready` — run prerequisite checks first (repair-vs-replace, coverage check, safety alert)
2. If `needs_context` — surface the missing context inputs before showing the execution CTA
3. If `ready` — render the CTA directly
4. If `tracking_only` — show status and follow-up reminder only

---

## 7. Remaining Edge Cases / Manual Review

The following records have `confidence=medium` or notes indicating uncertainty that should be manually reviewed before the Guidance Engine resolver is finalized.

| Signal ID | Signal Label | Uncertainty |
|---|---|---|
| SIG-012 | Energy Inefficiency | canonicalFirstStep "Assess urgency" is correct but the recommended tool (Energy Audit) should chain into Maintenance Checklist when HVAC is flagged |
| SIG-013 | Tax Overpayment | canonicalFirstStep "Verify permit status" was assigned to align with compliance domain but "Review appeal status" may be more precise for this financial signal — manual review recommended |
| SIG-021 | Cost of Inaction | Signal is both financial and maintenance; `maintenance_cost_burden` is correct but the resolver needs to chain through Do-Nothing Simulator before Maintenance Checklist |
| SIG-030 | Hidden Asset | `uncovered_repair_exposure` family is a loose fit for rebate/program eligibility; may benefit from a dedicated `financial_opportunity` family in a future schema version |
| SIG-031 | Sell/Hold/Rent | `valuation_uncertainty` family is correct but the signal fires only when an optimal exit is detected — `seller_readiness_gap` could also apply if SELL is the recommendation |
| SIG-036 | Historical Risk Pattern | Assigned `climate_risk_to_value` but historical incident patterns may include non-climate events (HVAC failure loops, water leak patterns); `asset_lifecycle` may be more accurate for some instances |
| SIG-039 | True Cost Above Market | Routes to Energy Audit as default but the correct tool depends on which line item is highest — utilities → Energy Audit, insurance → Insurance Auditor, property tax → Home Timeline. Resolver must be line-item aware. |
| SIG-043 | Home Renovation Risk | Assigned `permit_documentation_gap` but the signal also spans `asset_lifecycle` (renovation ROI) and `compliance`. Multi-domain signal. |
| SIG-049 | Move-In Checklist | `maintenance_cost_burden` family is a loose fit; signal is primarily an `onboarding` signal with cost exposure secondary |
| SIG-051 | Buyer Task Incomplete | `overdue_maintenance` family is technically incorrect; pre-closing tasks are onboarding/transactional, not maintenance. Should be re-evaluated if a dedicated `home_transaction` family is added |

*End of Signal & Action Audit v3.0 — Generated from signal-action-audit.json (55 signals, 21 families, schema version 3.0)*
