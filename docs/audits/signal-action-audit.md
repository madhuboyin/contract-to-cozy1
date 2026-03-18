# Signal & Action Audit (Normalized) — v2.0

**Generated:** 2026-03-17
**Source of truth:** `signal-action-audit.json`
**Scope:** Full codebase (backend + frontend + workers + schema)
**Purpose:** Guidance Engine design input

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Signal Taxonomy (Normalized Families)](#2-signal-taxonomy-normalized-families)
3. [High-Risk Findings](#3-high-risk-findings)
   - 3.1 Premature Booking (execution before diagnosis)
   - 3.2 Missing Actions
   - 3.3 Generic CTAs
4. [Top Broken Flows](#4-top-broken-flows)
5. [Signal → Ideal Step Mapping](#5-signal--ideal-step-mapping)
6. [Backend vs Frontend Gaps](#6-backend-vs-frontend-gaps)
7. [Gaps Blocking Guidance Engine](#7-gaps-blocking-guidance-engine)

---

## 1. Executive Summary

### Key Metrics

| Metric | Count |
|--------|-------|
| Total normalized signals | 55 |
| Total signal families | 15 |
| Signals with no action (`isNoAction=true`) | 11 |
| Generic CTA count (`isGenericCta=true`) | 23 |
| Premature booking count (`isPrematureBooking=true`) | 8 |
| Backend exists / frontend weak gap | 52 |
| Backend action missing | 2 |
| High confidence signals | 30 |
| Medium confidence signals | 25 |

### Signal Family Distribution

| Family | Count | Primary Source |
|--------|-------|----------------|
| RISK | 14 | Risk Assessment, Appliance Oracle, Climate, Digital Twin |
| FINANCIAL | 16 | Savings, Refinance, Energy, Budget, TCO, Cost Volatility |
| MAINTENANCE | 7 | Tasks, Seasonal, Habits, Daily Pulse, Predictions |
| INSURANCE | 7 | Coverage, Policy, OCR, Claims, Lapse Detection |
| BOOKING | 3 | Booking lifecycle (PENDING → DISPUTED → COMPLETED) |
| INSPECTION | 3 | Inspection Report, Visual Inspector, Defects |
| RECALL | 2 | Recall Match, Dismissed Recall |
| GAZETTE | 2 | Weekly AI Digest, Seasonal Section |
| NEIGHBORHOOD | 1 | Home Event Radar |
| SELLER_PREP | 1 | Pre-Listing Plan |
| **TOTAL** | **55** | |

### Decision Stage Distribution

| Stage | Count | Description |
|-------|-------|-------------|
| awareness | 14 | User learns about issue — no action path yet |
| diagnosis | 11 | User investigating severity |
| decision | 16 | User choosing action path |
| execution | 10 | User taking action |
| validation | 2 | User verifying before acting |
| tracking | 2 | User monitoring outcome |

The highest concentration is in **decision** (16 signals) — meaning the system correctly identifies problems but fails to guide users through the choice of what to do next.

---

## 2. Signal Taxonomy (Normalized Families)

Each `signalIntentFamily` below is the canonical normalized label used in the JSON and should be used as the Guidance Engine intent classifier.

### `lifecycle_end_or_past_life`
**Definition:** A system or appliance has reached or exceeded its expected service life, or its age ratio (age / lifespan) exceeds 0.85.
**Signal count:** 5 (SIG-002 HVAC, SIG-003 Roof, SIG-004 Water Heater, SIG-045 Electrical Panel, SIG-047 Plumbing)
**Key pattern failure:** All 5 route directly to provider booking ("Schedule Replacement" / "Schedule Inspection") without first running Repair vs Replace Analysis or checking warranty/insurance coverage. This is premature booking at scale.
**Ideal path:** lifecycle detected → repair-vs-replace analysis → coverage check → if replacement confirmed → provider search with cost estimate

---

### `overdue_maintenance`
**Definition:** A maintenance task, habit, or predictive alert has passed its due date or probability of failure has exceeded threshold.
**Signal count:** 6 (SIG-005, SIG-015, SIG-027, SIG-044, SIG-047, SIG-051)
**Key pattern failure:** CTAs are either "Schedule Now" (premature booking) or generic "Mark Complete" with no DIY vs. professional routing. Do-Nothing Simulator exists but is not surfaced inline with overdue tasks.
**Ideal path:** overdue detected → show cost-of-delay estimate → DIY vs professional decision → if professional: provider search with task context; if DIY: knowledge hub article

---

### `coverage_gap`
**Definition:** Property lacks adequate insurance, warranty, or coverage for a system or appliance. Includes NO_COVERAGE, EXPIRED_WARRANTY, EXPIRED_INSURANCE, WARRANTY_ONLY.
**Signal count:** 4 (SIG-008 NO_COVERAGE/WARRANTY_ONLY, SIG-009 High Deductible, SIG-053 Coverage Lapse, SIG-024 Claim Denied)
**Key pattern failure:** Three of four coverage gap signals have `isNoAction=true`. The backend detects all gap types but the frontend leaves users stranded with no remediation path.
**Ideal path:** gap detected → show gap type + dollar exposure → link to relevant remediation (get insurance quote, adjust deductible, file claim appeal)

---

### `policy_expiring`
**Definition:** A home insurance policy is within 60 days of expiry.
**Signal count:** 1 (SIG-007)
**Key pattern failure:** `isNoAction=true`. Backend detects expiry but no frontend alert, no renewal reminder, no link to rate-shopping tool.
**Ideal path:** expiry detected → show days to expiry → surface risk premium optimizer → post-renewal: prompt to upload new policy document

---

### `recall_detected`
**Definition:** An appliance or system in the property's inventory has been matched to an active government recall.
**Signal count:** 2 (SIG-014 OPEN recall, SIG-052 DISMISSED without resolution)
**Key pattern failure:** SIG-014 has `isNoAction=true`. No dashboard alert banner exists despite the safety severity. Backend has full confirm/dismiss/resolve API but it's not surfaced.
**Ideal path:** recall ingested → worker matches to inventory → prominent safety alert in dashboard → step-by-step remedy instructions → confirm or dismiss with reason → track resolution

---

### `price_above_market`
**Definition:** A contractor quote has been flagged as above the market price range for the service category and location.
**Signal count:** 1 (SIG-010)
**Key pattern failure:** Analysis is informational only. No counter-offer tool, no alternative provider search, no negotiation script.
**Ideal path:** price flag → show market range vs quoted price → surface counter-offer script → link to find alternative providers → structured 3-quote workflow

---

### `high_out_of_pocket_exposure`
**Definition:** The user's insurance deductible exceeds 40% of their emergency cash buffer, creating financial risk if a claim occurs.
**Signal count:** 1 (SIG-009)
**Key pattern failure:** `isNoAction=true`. Backend calculates the ratio and generates a recommendation but the frontend does not surface an action.
**Ideal path:** high ratio detected → show deductible vs buffer comparison → link to budget forecaster to model increasing buffer → option to explore lower-deductible policy

---

### `inspection_due`
**Definition:** No property inspection has been recorded in the past 12 months, or a specific system inspection is flagged.
**Signal count:** 2 (SIG-016, SIG-017)
**Key pattern failure:** SIG-016 routes directly to inspection booking (premature) without showing time-since-last-inspection or scope education. SIG-017 has per-defect findings but no per-defect action routing.
**Ideal path:** inspection due → show last inspection date + scope → education on what inspection covers → then provider search; for defects: classify severity → estimate cost → book specialist

---

### `missing_documentation`
**Definition:** Required documents, data fields, or records are absent, blocking downstream analysis or compliance.
**Signal count:** 3 (SIG-018 permit gap, SIG-028 digital twin quality, SIG-040 insurance OCR)
**Key pattern failure:** All three have generic CTAs or no action. Missing fields are identified but not deep-linked to specific entry points.
**Ideal path:** gap identified → show specific missing items with impact explanation → deep-link each item to the relevant form or upload UI

---

### `home_value_risk`
**Definition:** A signal that may negatively impact the property's market value, appreciation trajectory, or equity position.
**Signal count:** 7 (SIG-001, SIG-019, SIG-020, SIG-031, SIG-038, SIG-050, SIG-055)
**Key pattern failure:** Most are informational (awareness stage) with generic "View Report" CTAs. Neighborhood events, appreciation data, and home score low scores don't link to specific value-improvement actions.
**Ideal path:** value risk detected → show impact magnitude → route to most relevant improvement tool (seller prep, home improvements, sell/hold/rent analysis)

---

### `seasonal_readiness_due`
**Definition:** A seasonal checklist or preparation task for the current or upcoming season is pending.
**Signal count:** 3 (SIG-006, SIG-029, SIG-048)
**Key pattern failure:** Items use "Mark Complete" for all tasks regardless of whether they require a professional. Gazette seasonal sections are disconnected from the actual seasonal checklist.
**Ideal path:** seasonal task due → classify as DIY or professional needed → DIY: link to guide; professional: 'Find Provider' with category pre-filled → track completion; gazette: link section to checklist

---

### `energy_inefficiency`
**Definition:** Energy usage or costs are estimated to be above optimal levels for the property profile.
**Signal count:** 1 (SIG-012)
**Key pattern failure:** Generic "View Details" CTA. No prioritized action list, no link to weatherization checklist or HVAC service.
**Ideal path:** inefficiency detected → show top 3 waste sources with annual savings potential → link to seasonal weatherization checklist → if HVAC flagged: surface HVAC lifecycle signal

---

### `financial_exposure`
**Definition:** A financial tool has detected above-market costs, shortfalls, opportunity costs, or projected expense gaps.
**Signal count:** 9 (SIG-011, SIG-013, SIG-021, SIG-025, SIG-033, SIG-035, SIG-039, SIG-046, SIG-049, SIG-054)
**Key pattern failure:** Most are informational (diagnosis stage) with "View Analysis" CTAs. Analysis results don't route to specific action tools. Cost-of-inaction is modeled but not surfaced inline.
**Ideal path:** financial signal → quantify exposure → route to the specific cost-reduction or savings tool → provide step-by-step action plan

---

### `contractor_quality_risk`
**Definition:** A booking or contractor interaction has quality, urgency manipulation, or dispute risk indicators.
**Signal count:** 3 (SIG-022, SIG-023, SIG-034, SIG-042)
**Key pattern failure:** Post-booking states (CONFIRMED, COMPLETED, DISPUTED) have no status-specific CTAs. Urgency flag is detected but no counter-script provided.
**Ideal path:** quality risk detected → show specific flags → provide counter-script or alternative provider routing; post-booking: status-specific CTAs per booking lifecycle stage

---

### `permit_compliance_gap`
**Definition:** A modification or renovation requires a permit that has not been filed, or unpermitted work is suspected.
**Signal count:** 1 (SIG-018)
**Key pattern failure:** `isNoAction=true`. Backend has `permitRequired` flag in homeModificationAdvisor. No frontend action for permit compliance guidance.
**Ideal path:** permit required detected → show permit filing process → link to county permit records → if unpermitted existing work: surface retroactive permit guidance + home value risk

---

## 3. High-Risk Findings

### 3.1 Premature Booking (execution before diagnosis)

These signals skip critical intermediate steps (repair-vs-replace, coverage check, safety education) and route users directly to provider booking. This represents the highest UX risk and potential financial harm.

| Signal ID | Signal Label | Current CTA | Missing Intermediate Step |
|-----------|-------------|-------------|--------------------------|
| SIG-002 | HVAC System — At or Past Expected Lifespan | "Schedule Replacement" → providers | Repair vs Replace analysis; warranty coverage check |
| SIG-003 | Roof System — Aging or Past Expected Lifespan | "Schedule Inspection" → providers | Insurance coverage check for roof replacement |
| SIG-004 | Water Heater — Near or At End of Life | "Schedule Maintenance" → providers | Recall check; home warranty coverage check |
| SIG-005 | Maintenance Task Overdue | "Overdue - Schedule Now" → providers | Cost-of-delay estimate; DIY vs professional decision |
| SIG-016 | Property Inspection — No Recent Inspection | "Schedule Inspection" → providers | Time-since-last-inspection display; scope education |
| SIG-045 | Electrical Panel — Age Risk or Recall Flag | "Schedule Inspection" → providers | Brand-specific risk warning (Federal Pacific/Zinsco); recall cross-check |
| SIG-047 | Plumbing System — Age Risk (15+ Year Pipes) | "Schedule Inspection" → providers | Pipe material education; water damage history check; insurance check |
| SIG-055 | Property Onboarding Incomplete | "Schedule Inspection" / "Schedule Comprehensive Assessment" → providers | Basic property data capture before booking |

**Pattern summary:** 7 of 8 premature bookings are in the `lifecycle_end_or_past_life` or `overdue_maintenance` families. The root cause is a pattern of routing lifecycle alerts directly to provider search without a diagnosis or decision stage.

---

### 3.2 Missing Actions

Signals where `isNoAction=true` — the system detects a problem but presents no path forward.

| Signal ID | Signal Label | Family | Stage Left Stranded At |
|-----------|-------------|--------|------------------------|
| SIG-007 | Insurance Policy Expiring Within 60 Days | `policy_expiring` | awareness |
| SIG-008 | Coverage Gap Detected — NO_COVERAGE or WARRANTY_ONLY | `coverage_gap` | awareness |
| SIG-009 | Deductible-to-Cash-Buffer Ratio > 40% | `high_out_of_pocket_exposure` | awareness |
| SIG-014 | Appliance Recall Match — OPEN Status | `recall_detected` | awareness |
| SIG-018 | Unpermitted Work Suspected | `permit_compliance_gap` | awareness |
| SIG-020 | Seller Prep Plan — Pre-Listing Item Incomplete | `home_value_risk` | awareness |
| SIG-023 | Booking Completed — No Review / Work Confirmation | `contractor_quality_risk` | tracking |
| SIG-042 | Booking Disputed — Unresolved | `contractor_quality_risk` | tracking |
| SIG-052 | Recall Match — DISMISSED Without Resolution | `recall_detected` | tracking |
| SIG-053 | Coverage Lapse Incident — Worker-Detected | `coverage_gap` | awareness |
| SIG-015 | Predictive Maintenance — High Failure Probability | `overdue_maintenance` | awareness |
| SIG-019 | Neighborhood Change Detected (informational only) | `home_value_risk` | awareness |

**Most critical `isNoAction` signals:**
1. **SIG-014** (Appliance Recall — OPEN): Safety issue. Requires immediate dashboard alert with remedy instructions.
2. **SIG-007** (Policy Expiring): Financial risk. Backend detects it; frontend is silent.
3. **SIG-008** (Coverage Gap): Financial risk. Backend produces gap types; frontend shows nothing actionable.
4. **SIG-053** (Coverage Lapse): Worker fires incident; no UI alert linked to incident type.

---

### 3.3 Generic CTAs

Signals where `isGenericCta=true` — the action label is not specific enough to guide the user to a meaningful next step.

| Signal ID | Signal Label | Generic CTA | Why It's Weak |
|-----------|-------------|-------------|---------------|
| SIG-001 | Property Risk Score | "View Full Report (arrow icon only)" | Icon-only, no score-band routing |
| SIG-012 | Energy Audit — Inefficiency Detected | "View Details" | No prioritized action list |
| SIG-013 | Property Tax — Overpayment Risk | "View Analysis" | Appeal letter generation not surfaced |
| SIG-019 | Neighborhood Change Detected | "View Event Details" | No value-impact classification |
| SIG-022 | Booking Confirmed — Awaiting Confirmation | "View Details" | No follow-up CTA if delayed |
| SIG-025 | Home Savings Goal Behind Target | "View Savings Plan" | No specific unfunded cost linked |
| SIG-026 | Climate Risk — High Flood/Wildfire | "View Climate Risk" | No risk-type-specific action routing |
| SIG-028 | Digital Twin — Data Quality Low | "Add Missing Data" | No field-level deep links |
| SIG-029 | Home Gazette — Weekly Digest | "View Details" | No per-recommendation CTA |
| SIG-030 | Hidden Asset Found | "View Program Details" | No application portal link |
| SIG-031 | Sell/Hold/Rent — Optimal Exit Detected | "View Analysis" | No outcome-specific action routing |
| SIG-033 | Capital Timeline — Major Expense < 12mo | "View Timeline" | No savings-gap calculation link |
| SIG-036 | Home Risk Replay — Pattern Identified | "View Risk History" | No pattern-to-prevention routing |
| SIG-037 | Visual Inspection — AI Defect Detected | "View Findings" | No per-defect booking CTA |
| SIG-038 | Appreciation Below National Average | "View Appreciation Data" | No link to improvement ROI |
| SIG-039 | True Cost — Monthly Cost Above Market | "View Analysis" | No line-item action routing |
| SIG-041 | Risk Assessment — Incomplete Property Details | "CRITICAL: Complete property details..." | Generic nav to property page, no field-level deep links |
| SIG-043 | Home Renovation — High Risk Modification | "View Risk Analysis" | permitRequired not surfaced as action |
| SIG-046 | Cost Volatility — Price Spike Detected | "View Analysis" | No proactive booking CTA |
| SIG-048 | Gazette — Seasonal Section Published | "View Details" | Disconnected from seasonal checklist |
| SIG-050 | Home Score Below 70 | "View Full Report" | No domain-level improvement roadmap |
| SIG-054 | Budget Forecaster — Monthly Shortfall | "View Budget" | No category-to-tool routing |

---

## 4. Top Broken Flows

The following flows represent the most damaging signal → action mismatches, ranked by user impact severity.

### Flow 1: `lifecycle_end_or_past_life` → Direct Booking (skips repair-vs-replace decision)

**Signals affected:** SIG-002, SIG-003, SIG-004, SIG-045, SIG-047

**Current flow:**
```
Age ratio > 0.85 detected → "Schedule Replacement" / "Schedule Inspection" → providers page
```

**Problem:** User pays for a full replacement without knowing:
- Whether the item is under home warranty or insurance (could be covered)
- Whether repair is viable (repair-vs-replace analysis exists in backend but is never surfaced)
- Whether an active recall means the manufacturer covers the fix
- What the actual replacement cost range should be (exists in backend, not shown pre-booking)

**Ideal flow:**
```
Age ratio > 0.85 detected
  → Show: age, expected life, replacement cost estimate
  → Check: home warranty active? → If yes: "File Warranty Claim" CTA
  → Check: recall match active? → If yes: "Recall Alert" CTA
  → Run: Repair vs Replace Analysis → Show recommendation
  → If replacement confirmed: Provider search with category + cost context pre-filled
```

---

### Flow 2: `coverage_gap` → No Action (user left stranded)

**Signals affected:** SIG-008, SIG-009, SIG-053

**Current flow:**
```
Gap type detected (NO_COVERAGE, EXPIRED_INSURANCE, high deductible ratio) → displayed in coverage page → no CTA
```

**Problem:** The system correctly identifies the gap but provides zero remediation path. Three different gap types are all handled with no action. This is arguably the most dangerous flow gap — users face financial exposure without any guidance.

**Ideal flow per gap type:**
- `NO_COVERAGE` → "Get Insurance Quote" → insurer comparison
- `EXPIRED_INSURANCE` → "Upload Renewed Policy" + "Find Insurer"
- `WARRANTY_ONLY` → "Add Home Insurance" with recommended coverage amounts
- `HIGH_DEDUCTIBLE` → "Review Policy" + "Build Emergency Fund" (link to savings planner)

---

### Flow 3: `recall_detected` → No Dashboard Alert (safety issue)

**Signals affected:** SIG-014, SIG-052

**Current flow:**
```
Worker matches appliance to recall → recallMatch record created (status=OPEN) → no frontend alert
```

**Problem:** An OPEN recall match represents a safety hazard. The backend has full confirm/dismiss/resolve APIs, but there is no prominent safety alert in the dashboard or inventory pages. Users may never discover the recall.

**Ideal flow:**
```
Recall match created (status=OPEN)
  → Immediate dashboard banner: "Safety Alert: [Appliance] has an active recall"
  → Recall detail page: severity, remedy type, manufacturer instructions
  → CTA: "Confirm Affected" or "Dismiss — Does Not Apply"
  → If confirmed: Track remedy status (self-service / manufacturer service / replacement)
  → 30-day follow-up if unresolved
```

---

### Flow 4: `policy_expiring` → Silent (financial risk)

**Signal affected:** SIG-007

**Current flow:**
```
expiryDate within 60 days detected → no frontend notification, no CTA
```

**Problem:** Worker `coverageLapseIncidents.job.ts` creates an incident record, but the frontend has no linked alert. Users discover policy expiry when they need to file a claim — too late.

**Ideal flow:**
```
Expiry within 60 days detected
  → Notification: "Your home insurance expires in X days"
  → CTA: "Shop Market Rates" → Risk Premium Optimizer
  → After renewal: "Upload New Policy" → Insurance OCR → Automatic coverage gap re-analysis
```

---

### Flow 5: `price_above_market` → Informational Only (no negotiation tool)

**Signal affected:** SIG-010, SIG-034

**Current flow:**
```
Quote price above market range → "View Analysis" → negotiation shield page → analysis displayed → no next step
```

**Problem:** The user knows the quote is inflated but has no structured tool to act on that knowledge. The negotiation shield service exists, urgency manipulation is detected, but no counter-offer script or alternative provider path is provided.

**Ideal flow:**
```
Price flag + urgency flag detected
  → Show: quoted price vs market range ($X - $Y for this service)
  → Show: specific red flags found (e.g., "Vague scope: 'extensive work required'")
  → CTA: "Get Counter-Script" → generates specific questions to ask contractor
  → CTA: "Find Competing Providers" → provider search filtered by category + location
  → CTA: "Request Itemized Quote" → generates email template requesting line-item breakdown
```

---

### Flow 6: `overdue_maintenance` → "Schedule Now" (skips DIY decision and cost-of-delay context)

**Signal affected:** SIG-005, SIG-015, SIG-027, SIG-044

**Current flow:**
```
Task overdue → "Overdue - Schedule Now" or "Mark Complete" → providers page
```

**Problem:** All tasks are treated as requiring professional service. Many tasks (filter changes, gutter cleaning, caulking) are DIY-capable. Cost of delay is never shown, removing urgency context. Do-Nothing Simulator exists but is isolated.

**Ideal flow:**
```
Task overdue
  → Show: cost-of-delay at 30/60/90 days (from Do-Nothing Simulator)
  → Show: DIY difficulty rating + estimated time
  → Decision branch:
    → DIY: Link to knowledge hub article + parts supplier
    → Professional needed: Provider search with task context + budget estimate
```

---

## 5. Signal → Ideal Step Mapping

| Signal ID | Signal Label | Current Action | Ideal Next Step | Key Missing Steps |
|-----------|-------------|----------------|-----------------|-------------------|
| SIG-001 | Property Risk Score <60 | View Full Report (icon) | Score-band-specific guidance | Score routing logic; differentiated CTA per band |
| SIG-002 | HVAC Past Life | Schedule Replacement | Repair vs Replace Analysis | Coverage check; recall cross-reference |
| SIG-003 | Roof Aging | Schedule Inspection | Repair vs Replace + Insurance Coverage Check | Insurance check pre-booking |
| SIG-004 | Water Heater EOL | Schedule Maintenance | Recall check → Warranty check → Replace/Repair | Recall + warranty integration |
| SIG-005 | Maintenance Task Overdue | Overdue - Schedule Now | Cost-of-delay → DIY vs Pro decision | Do-Nothing Simulator integration inline |
| SIG-006 | Seasonal Checklist Pending | Mark complete | Per-item: DIY guide OR Find Provider | Professional task routing |
| SIG-007 | Insurance Policy Expiring | NONE | Days-to-expiry banner → Shop Market Rates | Frontend alert + rate shopping CTA |
| SIG-008 | Coverage Gap Detected | NONE | Gap-type-specific remediation path | All gap type actions missing |
| SIG-009 | High Deductible Ratio | NONE | Budget forecaster → lower-deductible policy option | Frontend action for deductible gap |
| SIG-010 | Quote Price Above Market | View Analysis | Counter-offer script + competing providers | Negotiation script; alternative quote flow |
| SIG-011 | Refinance Break-Even Not Reached | View Analysis | Rate comparison → pre-qualification link | Current market rate surfacing; lender CTA |
| SIG-012 | Energy Inefficiency | View Details | Top 3 waste sources → weatherization checklist | Prioritized action list; HVAC integration |
| SIG-013 | Tax Overpayment Risk | View Analysis | Appeal letter template + filing deadline | Appeal initiation CTA |
| SIG-014 | Recall Match — OPEN | NONE | Safety alert banner → remedy instructions | Dashboard alert; confirm/dismiss flow |
| SIG-015 | High Failure Probability | Not Scheduled | Failure probability + cost estimate → schedule | Prediction data surfaced with CTA |
| SIG-016 | No Recent Inspection | Schedule Inspection | Last inspection date + scope education → inspect | Time-since-last-inspection display |
| SIG-017 | Inspection Defect Unresolved | View Defect Details | Per-defect: severity → cost estimate → book specialist | Per-defect action routing |
| SIG-018 | Permit Compliance Gap | NONE | Permit requirement flagged → county records link | Permit filing guidance |
| SIG-019 | Neighborhood Change | View Event Details | Impact classification → value update prompt | Event impact analysis; sell/hold/rent link |
| SIG-020 | Seller Prep Incomplete | NONE | ROI-ranked pre-listing to-do with provider links | Frontend screens missing entirely |
| SIG-021 | Cost of Inaction | View Projection | Per-item "Act Now" CTA linking to maintenance/repair | Per-item action routing from simulation |
| SIG-022 | Booking Awaiting Confirmation | View Details | Status timeline + 24h follow-up prompt | Confirmation delay escalation |
| SIG-023 | Booking Completed, No Review | NONE | Confirm completion + rate provider + upload photo | Post-work confirmation flow |
| SIG-024 | Claim Denied | View Claim | Appeal checklist + settlement comparison | Appeal workflow; adjuster search |
| SIG-025 | Savings Behind Target | View Savings Plan | Gap + unfunded expense + auto-contribution CTA | Specific cost integration |
| SIG-026 | High Flood/Wildfire Risk | View Climate Risk | Risk-specific mitigation checklist | Climate-type-specific action routing |
| SIG-027 | Habit Overdue / Snoozed | Mark Complete | Consequence display + convert to formal task | Snooze fatigue escalation path |
| SIG-028 | Digital Twin Quality Low | Add Missing Data | Per-field gaps with impact + deep-link forms | Field-level routing |
| SIG-029 | Gazette Weekly Digest | View Details | Per-section action CTA to relevant tool | Per-recommendation routing |
| SIG-030 | Hidden Asset Found | View Program Details | Step-by-step application + deadline + status tracking | Application portal link |
| SIG-031 | Sell/Hold/Rent Optimal Exit | View Analysis | Outcome-specific routing (seller prep / rental setup / hold) | Outcome-specific next-step routing |
| SIG-032 | Inventory Missing | Add Item | Completeness score + high-impact gaps + OCR shortcut | Priority-ordered missing items |
| SIG-033 | Capital Expense < 12 Months | View Timeline | Savings gap + savings planner link + coverage check | Savings integration; insurance cross-check |
| SIG-034 | Urgency Flag in Quote | View Analysis | Red flags + counter-script + competing quotes | Counter-negotiation tools |
| SIG-035 | Premium Above Market | View Optimizer | Ranked risk-reduction actions + insurer comparison | Ranked action list; insurer CTA |
| SIG-036 | Historical Risk Pattern | View Risk History | Pattern → prevention recommendation → schedule | Pattern-to-action routing |
| SIG-037 | Visual Inspection Defect | View Findings | Per-defect: severity → cost → book specialist | Per-defect action flow |
| SIG-038 | Appreciation Below Average | View Appreciation Data | Improvement ROI analysis + sell/hold/rent prompt | Home improvement ROI link |
| SIG-039 | True Cost Above Market | View Analysis | Per-line-item cost-reduction tool routing | Line-item action routing |
| SIG-040 | Insurance Doc Not Uploaded | Upload Policy | OCR extraction → data confirmation → coverage gap trigger | Post-upload confirmation + gap trigger |
| SIG-041 | Incomplete Property Details | Complete property details (generic) | Step-by-step onboarding checklist with deep-links | Field-level onboarding guidance |
| SIG-042 | Booking Disputed | NONE | Dispute resolution checklist → claims link → support | Dispute resolution workflow |
| SIG-043 | High Risk Renovation Planned | View Risk Analysis | Permit requirements + ROI + licensed contractor CTA | Permit filing link |
| SIG-044 | Daily Pulse Micro-Task | Mark complete | DIY vs professional routing per task type | Professional task routing |
| SIG-045 | Electrical Panel Age/Recall | Schedule Inspection | Brand risk warning + recall check + licensed electrician | Brand-specific risk + recall integration |
| SIG-046 | Service Price Spike | View Analysis | Lock-in booking CTA + provider price comparison | Proactive booking CTA |
| SIG-047 | Plumbing Age Risk | Schedule Inspection | Pipe material education + damage history + insurance | Pre-booking education |
| SIG-048 | Gazette Seasonal Section | View Details | Link to seasonal checklist with completion status | Checklist integration |
| SIG-049 | Move-In Checklist Incomplete | Complete Checklist | Priority ranking + provider links for safety tasks | Task prioritization + provider links |
| SIG-050 | Home Score Below 70 | View Full Report | Lowest domain → 2-3 improvement actions roadmap | Score improvement roadmap |
| SIG-051 | Buyer Task Incomplete | View Task | Deadline urgency + consequence warning + professional link | Deadline urgency display |
| SIG-052 | Recall Dismissed No Resolution | NONE | Reason capture + 30-day reminder | Dismissal reason + follow-up |
| SIG-053 | Coverage Lapse Detected | NONE | Lapse duration + policy upload + insurer search | Worker-to-UI alert bridge |
| SIG-054 | Budget Monthly Shortfall | View Budget | Per-category cost-reduction tool routing | Category-to-tool routing |
| SIG-055 | Property Onboarding Incomplete | Schedule Inspection | Progress bar + missing fields + inline quick-add | Onboarding progress indicator |

---

## 6. Backend vs Frontend Gaps

These signals have confirmed backend logic (`backendActionExists=true`) but weak or absent frontend presentation (`frontendActionWeak=true`). These represent the highest ROI opportunities — no backend work required, only frontend Guidance Engine wiring.

| Signal ID | Signal Label | Backend Service | What Backend Has | What Frontend Needs |
|-----------|-------------|-----------------|------------------|---------------------|
| SIG-007 | Policy Expiring | `insuranceAuditor.service.ts` | Expiry date query, incident creation | Alert banner; rate-shop CTA |
| SIG-008 | Coverage Gap | `coverageGap.service.ts` | 5 gap types with severity | Per-gap-type remediation CTA |
| SIG-009 | High Deductible | `coverageAnalysis.service.ts` | Ratio calculation, recommendation | Budget link; policy review CTA |
| SIG-010 | Quote Overpriced | `servicePriceRadar.engine.ts`, `negotiationShieldContractorQuote.service.ts` | Market range data, line-item analysis | Counter-script; competing providers |
| SIG-012 | Energy Inefficiency | `energyAuditor.service.ts` | Full energy audit with per-item findings | Prioritized action list; HVAC integration |
| SIG-013 | Tax Overpayment | `taxAppeal.service.ts` | Full appeal analysis | Appeal letter CTA; deadline reminder |
| SIG-014 | Recall Match OPEN | `recalls.service.ts` | confirm/dismiss/resolve APIs, recall data | Safety alert banner; remedy flow |
| SIG-015 | High Failure Probability | `maintenancePrediction.service.ts` | Probability % per asset | Prediction-driven schedule CTA |
| SIG-018 | Permit Gap | `homeModificationAdvisor.service.ts` | `permitRequired` flag | Permit filing guidance CTA |
| SIG-019 | Neighborhood Change | `homeEventRadar.service.ts` | Event type + property impact matching | Impact classification; sell/hold/rent link |
| SIG-020 | Seller Prep Incomplete | `sellerPrep.service.ts`, `roiRules.engine.ts` | Full plan + ROI rules | Frontend screens (currently absent) |
| SIG-021 | Cost of Inaction | `doNothingSimulator.service.ts` | Per-item cost projections | Inline per-item "Act Now" CTA |
| SIG-024 | Claim Denied | `negotiationShieldInsuranceClaimSettlement.service.ts` | Settlement comparison, appeal data | Appeal workflow; adjuster search |
| SIG-026 | High Climate Risk | `climateRiskPredictor.service.ts` | Per-hazard risk scores (flood/wildfire/freeze) | Hazard-specific mitigation CTA |
| SIG-028 | Digital Twin Quality | `homeDigitalTwinQuality.service.ts` | Completeness score per field | Per-field deep-link entry forms |
| SIG-030 | Hidden Asset | `hiddenAssets.service.ts` | Program eligibility data | Application portal link; deadline |
| SIG-031 | Sell/Hold/Rent | `sellHoldRent.service.ts` | Outcome recommendation (SELL/HOLD/RENT) | Outcome-specific next-step routing |
| SIG-033 | Capital Expense Horizon | `homeCapitalTimeline.service.ts` | Per-item replacement cost projections | Savings gap integration |
| SIG-034 | Urgency Flag | `negotiationShieldContractorUrgency.service.ts` | Specific urgency manipulation red flags | Counter-script; alternative providers |
| SIG-035 | Premium Above Market | `riskPremiumOptimizer.service.ts` | Savings amount + action recommendations | Ranked action list; insurer comparison |
| SIG-036 | Risk Pattern | `homeRiskReplay.engine.ts` | Historical pattern analysis | Pattern-to-prevention routing |
| SIG-038 | Appreciation Below Average | `appreciationIndex.service.ts`, `valueIntelligence.service.ts` | Appreciation vs benchmark | Home improvement ROI link |
| SIG-039 | True Cost Above Market | `trueCostOwnership.service.ts` | Per-line-item cost analysis | Line-item → cost-reduction tool routing |
| SIG-040 | Insurance OCR Not Processed | `insuranceOcr.service.ts` | Full OCR extraction capability | Post-upload confirmation; auto gap trigger |
| SIG-043 | High Risk Renovation | `homeModificationAdvisor.service.ts` | Per-project risk analysis, permit flags | Permit filing link; ROI per project |
| SIG-046 | Service Price Spike | `costVolatility.service.ts` | Price trend data per category | Proactive booking CTA for volatile categories |
| SIG-050 | Home Score Low | `homeScoreReport.service.ts` | Three component scores (HEALTH/RISK/FINANCIAL) | Domain-level improvement roadmap |
| SIG-053 | Coverage Lapse | `coverageLapseIncidents.job.ts` | Incident record with lapse data | Worker-to-alert-banner bridge |
| SIG-054 | Budget Shortfall | `budgetForecaster.service.ts` | Per-category shortfall data | Category → tool routing |

**Total high-ROI frontend-only gaps: 29 signals**

---

## 7. Gaps Blocking Guidance Engine

The following systemic gaps must be resolved before a Guidance Engine can function correctly. These are not individual signal gaps — they are architectural patterns missing from the platform.

---

### Gap 1: No Repair-vs-Replace Gate in Lifecycle Signals

**Blocking:** SIG-002, SIG-003, SIG-004, SIG-045, SIG-047

The `replaceRepairAnalysis.service.ts` exists with full logic. The Guidance Engine must insert a mandatory repair-vs-replace step between lifecycle detection and provider booking. Without this gate, the engine will recommend booking in cases where the correct answer is filing a warranty claim or doing a minor repair.

**Required:** Frontend orchestration layer that checks if `replaceRepairAnalysis` has been run for the asset before showing a booking CTA.

---

### Gap 2: No Coverage-Check Intercept Before Booking

**Blocking:** SIG-002, SIG-003, SIG-004, SIG-045, SIG-053

When a major system failure or lifecycle signal fires, the Guidance Engine must check:
1. Is there an active home warranty? (`coverageGap.service.ts`)
2. Is the item covered by homeowner's insurance?
3. Is there an active recall for this appliance? (`recalls.service.ts`)

Only after these checks should the engine route to provider booking. No intercept logic exists today.

---

### Gap 3: No Worker-to-Frontend Alert Bridge

**Blocking:** SIG-014 (recall), SIG-007 (policy expiry), SIG-053 (coverage lapse)

Workers create incident and match records but there is no mechanism to:
- Push an alert to the frontend dashboard
- Map worker-generated incident types to frontend alert components
- Prioritize alerts by severity (recall > coverage lapse > policy expiry)

**Required:** An incidents/alerts API endpoint that the frontend polls or receives via push, mapped to alert severity levels with specific CTA templates per incident type.

---

### Gap 4: No Decision Stage Router

**Blocking:** Affects ~21 signals currently at `awareness` or `diagnosis` stage with generic CTAs

The Guidance Engine needs a central decision-stage router that takes (signalId, userContext, completedSteps) as input and returns the next recommended action. Currently, each page independently decides what CTA to show without awareness of what the user has already done in related flows.

**Required:** A server-side or frontend-side next-action resolver that maps signalId + user stage + completed prerequisites → specific action with context pre-filled.

---

### Gap 5: Seller Prep Has No Frontend Screens

**Blocking:** SIG-020

The `sellerPrep` backend is fully implemented (`sellerPrep.service.ts`, `roiRules.engine.ts`, `valueCalculator.engine.ts`, `SellerPrepPlan` model). However, no frontend screens exist in the dashboard routing. This is an entire feature area that cannot be surfaced by the Guidance Engine.

**Required:** Frontend pages for seller prep plan display, ROI-ranked improvement list, and provider booking integration.

---

### Gap 6: No Post-Booking Lifecycle Integration

**Blocking:** SIG-023, SIG-042

When a booking reaches COMPLETED or DISPUTED status, there is no workflow to:
- Close the originating maintenance task
- Trigger a document upload request for work completion
- Prompt a provider review
- Link a dispute to the claims system

The Guidance Engine needs booking status transitions to trigger downstream signal resolution. Currently, bookings are isolated from the task/claim/document graph.

---

### Gap 7: Signals Are Feature-Siloed (No Cross-Signal Context Sharing)

**Blocking:** SIG-029 (Gazette → Seasonal), SIG-011 (Refinance → Rate), SIG-031 (Sell/Hold/Rent → Seller Prep)

Signals in one feature area cannot reference or build on signals in another. For example:
- The Gazette seasonal section does not pre-check already-completed seasonal checklist items
- The Sell/Hold/Rent recommendation does not link to the Seller Prep plan
- The Capital Timeline does not cross-check with the Savings Planner

**Required:** A signal context store that allows the Guidance Engine to pass enriched context from upstream signals to downstream actions (e.g., "user's HVAC is 17 years old" context passed from risk assessment to capital timeline to savings plan to booking).

---

### Gap 8: No Intermediate Confirmation Step After OCR / AI Processing

**Blocking:** SIG-040 (Insurance OCR), SIG-037 (Visual Inspector)

When OCR or AI analysis completes, the system stores results but does not:
- Present extracted data for user confirmation
- Auto-trigger downstream analysis (coverage gap re-run after policy upload)
- Flag confidence level for AI-extracted fields

**Required:** Post-processing confirmation flow that presents AI/OCR results for validation before they are used in downstream calculations.

---

*End of Signal & Action Audit v2.0 — Generated from signal-action-audit.json (55 signals, 15 families)*
