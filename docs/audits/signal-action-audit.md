# Signal & Action Audit — Contract to Cozy

> **Date:** 2026-03-17 | **Scope:** Full codebase (backend + frontend + workers + schema) | **Purpose:** Guidance Engine input design

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Signal Inventory](#2-signal-inventory)
3. [Duplicate Signals](#3-duplicate-signals)
4. [Generic CTA Overuse](#4-generic-cta-overuse)
5. [Missing Actions](#5-missing-actions)
6. [Premature Booking Findings](#6-premature-booking-findings)
7. [High-Impact Gaps](#7-high-impact-gaps)
8. [Candidate Inputs for Guidance Engine](#8-candidate-inputs-for-guidance-engine)

---

## 1. Executive Summary

### Coverage

| Area | Files Scanned | Signals Found |
|---|---|---|
| Frontend pages & components | 60+ | 47 |
| Frontend tool registry / config | 5 | 32 tools catalogued |
| Backend services & controllers | 40+ | 28 signal sources |
| Prisma schema models | 102KB schema | 35+ signal-bearing models |
| Worker jobs | 23 jobs | 17 signal generators |
| **TOTAL** | | **~107 distinct signals** |

### Signal Family Breakdown

| Family | Count | Primary Source |
|---|---|---|
| RISK | 14 | Risk Assessment, Incidents, Climate, Digital Twin |
| MAINTENANCE | 12 | Tasks, Seasonal, Predictions, Habits |
| FINANCIAL | 16 | Savings, Refinance, Energy, Cost, Hidden Assets |
| INSURANCE | 8 | Coverage, Policy, Premium Optimizer |
| INCIDENT | 9 | Incident system (freeze, coverage, recall, etc.) |
| SCORE | 7 | Health, Risk, Financial, Home Score |
| NEIGHBORHOOD | 6 | Neighborhood Events, Signals, Radar |
| CLAIMS | 5 | Claims system, Negotiation Shield |
| WARRANTY | 4 | Warranty, Recalls |
| GENERAL | 8 | Gazette, Timeline, Status Board, Onboarding |

### Key Findings

| Finding | Count | Severity |
|---|---|---|
| Generic CTAs ("Open Tool", "View Details", "Learn More") | 34 | High |
| Signals with NO action at all | 5 | High |
| Premature booking (diagnostic signal → direct book CTA) | 3 | Medium |
| Duplicate signals across surfaces | 8 groups | Medium |
| Signals with strong backend action but weak frontend expression | 11 | High |

---

## 2. Signal Inventory

### 2.1 RISK Family

---

**SIG-R01 — Property Risk Score**
- **Label:** "Risk Exposure Score" / "Low Risk / Elevated / High Risk"
- **Signal Type:** Score (0–100)
- **Source Kind:** Backend computation → frontend_card
- **Feature:** Risk Assessment
- **Screen:** Dashboard Main (PropertyRiskScoreCard), Risk Radar Page
- **Backend Files:**
  - `apps/backend/src/services/RiskAssessment.service.ts`
  - `apps/backend/src/config/risk-constants.ts`
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/components/PropertyRiskScoreCard.tsx`
  - `src/app/(dashboard)/dashboard/risk-radar/page.tsx`
- **Prisma Models:** `RiskAssessmentReport` (`riskScore`, `financialExposureTotal`)
- **Current Action Label:** Arrow link → "View Full Report"
- **Current Action Type:** navigation
- **Action Target:** `/dashboard/properties/{id}/risk-assessment`
- **User Stage:** awareness
- **isGenericCta:** true — arrow icon only, no label
- **isNoAction:** false
- **isPrematureBookingCandidate:** false
- **Notes:** Color coding: green (80+), amber (60–79), red (<60). Shows financial exposure in dollars below score. Action is implicit (ArrowRight icon). Guidance Engine opportunity: prescribe next step based on score band.

---

**SIG-R02 — Top Risk Drivers (Per Asset)**
- **Label:** Asset name + risk level badge + out-of-pocket exposure
- **Signal Type:** table_column
- **Source Kind:** backend_rule → frontend_table
- **Feature:** Risk Radar
- **Screen:** Risk Radar Page
- **Backend Files:**
  - `apps/backend/src/services/RiskAssessment.service.ts`
  - `apps/backend/src/config/risk-constants.ts` (15 asset types with life/cost configs)
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/risk-radar/page.tsx`
- **Prisma Models:** `RiskAssessmentReport`, `InventoryItem` (`expectedLifeYears`, `replacementCostEstimate`)
- **Current Action Label:** None
- **Current Action Type:** none
- **Action Target:** N/A
- **User Stage:** awareness → diagnosis
- **isGenericCta:** false
- **isNoAction:** true
- **isPrematureBookingCandidate:** false
- **Notes:** Table shows asset, risk level, exposure, replacement cost, probability, coverage factor. NO CTA per row. This is the highest-value missing action in the product — each row should have a context-specific next step (Replace/Repair, Book Inspection, View Coverage).

---

**SIG-R03 — Freeze Risk Incident**
- **Label:** "Freeze Risk Detected" / "Winterize Exposed Plumbing"
- **Signal Type:** alert
- **Source Kind:** backend_rule (weather API → scoring engine)
- **Feature:** Incident System
- **Screen:** Incidents List, Dashboard Notifications
- **Backend Files:**
  - `apps/workers/src/jobs/freezeRiskIncidents.job.ts`
  - `apps/backend/src/services/incidents/incident.orchestrator.ts`
  - `apps/backend/src/services/incidents/incident.scoring.ts`
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/components/incidents/IncidentCard.tsx`
- **Prisma Models:** `Incident` (`severity`, `severityScore`, `status`, `typeKey=FREEZE_RISK`)
- **Current Action Label:** "Create urgent winterization task" (HIGH) / "Add winterization task" (MEDIUM)
- **Current Action Type:** task_creation
- **Action Target:** MaintenanceTask creation
- **User Stage:** execution
- **isGenericCta:** false
- **isNoAction:** false
- **isPrematureBookingCandidate:** false
- **Notes:** Score: 85 (≤15°F), 75 (≤20°F), 60 (≤27°F). Backend action field is well-defined (`actions[].ctaLabel`). Frontend does not surface the action recommendation inline — user must navigate to incident detail.

---

**SIG-R04 — Climate Risk Assessment**
- **Label:** "Flooding Risk: High", "Wildfire Risk: Moderate", etc.
- **Signal Type:** score + alert
- **Source Kind:** ai_generated (Gemini) + rule_based
- **Feature:** Climate Risk Predictor
- **Screen:** Property Detail (tool)
- **Backend Files:**
  - `apps/backend/src/services/climateRiskPredictor.service.ts`
- **Frontend Files:** (embedded in property detail, no dedicated tool page found)
- **Prisma Models:** `ClimateRiskAssessment` (`overallRiskScore`, `insuranceImpact`, `propertyValueImpact`)
- **Current Action Label:** `recommendations[]`, `mitigationSteps[]`
- **Current Action Type:** text recommendation (no clickable CTA)
- **Action Target:** None (text only)
- **User Stage:** diagnosis
- **isGenericCta:** false
- **isNoAction:** true (text recommendations, no navigation)
- **isPrematureBookingCandidate:** false
- **Notes:** Risk categories: Flooding, Hurricanes, Wildfires, Extreme Heat, Tornadoes, Earthquakes, Winter Storms, Drought, Sea Level Rise. Guidance Engine should convert mitigation steps into actionable deep links.

---

**SIG-R05 — Do-Nothing Simulator Output**
- **Label:** "If you do nothing: Risk Δ +X%, Projected Cost $Y"
- **Signal Type:** card_metric
- **Source Kind:** backend_computation → frontend_card
- **Feature:** Do-Nothing Simulator
- **Screen:** Dashboard Tool Card, Tool Page
- **Backend Files:**
  - `apps/backend/src/services/doNothingSimulator.service.ts` (inferred)
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/components/DoNothingSimulatorToolCard.tsx`
  - `src/app/(dashboard)/dashboard/properties/[id]/tools/do-nothing/`
- **Prisma Models:** `DoNothingSimulation` (inferred)
- **Current Action Label:** "Run simulation" / "Re-run" / "View details"
- **Current Action Type:** tool_launch
- **Action Target:** `/dashboard/properties/{id}/tools/do-nothing`
- **User Stage:** decision
- **isGenericCta:** false
- **isNoAction:** false
- **isPrematureBookingCandidate:** false
- **Notes:** Output signals (risk delta, incident likelihood) have no linked next action. After seeing the simulation, user has no guided path to act. Guidance Engine should surface "Now act on this" CTA.

---

**SIG-R06 — Home Digital Twin — Component Replacement Suggestion**
- **Label:** "Replace {Component} — High Urgency"
- **Signal Type:** card_metric
- **Source Kind:** backend_rule (ageRatio vs failureRiskScore)
- **Feature:** Home Digital Twin
- **Screen:** Digital Twin Tool Page
- **Backend Files:**
  - `apps/backend/src/services/homeDigitalTwinRecommendations.service.ts`
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/properties/[id]/tools/home-digital-twin/`
- **Prisma Models:** `HomeTwinComponent` (`estimatedAgeYears`, `usefulLifeYears`, `conditionScore`, `failureRiskScore`, `replacementCostEstimate`)
- **Current Action Label:** "Replace {Component}" (pre-filled scenario payload in backend response)
- **Current Action Type:** scenario_launch (opens what-if scenario)
- **Action Target:** Scenario creation with pre-filled data
- **User Stage:** decision
- **isGenericCta:** false
- **isNoAction:** false
- **isPrematureBookingCandidate:** true
- **Notes:** MAX_SUGGESTIONS = 5, ranked by urgency + confidence + cost. Backend includes `suggestedInputPayload` — good foundation. Missing: Replace/Repair tool integration before booking.

---

**SIG-R07 — Risk Mitigation Plan Item**
- **Label:** "RECOMMENDED: Upgrade electrical panel", etc.
- **Signal Type:** status_indicator
- **Source Kind:** backend_rule
- **Feature:** Risk Assessment / Incidents
- **Screen:** Risk Assessment Detail
- **Backend Files:**
  - `apps/backend/src/services/incidents/incident.orchestrator.ts`
- **Prisma Models:** `RiskMitigationPlanItem` (`status`, `priority` CRITICAL/HIGH/MEDIUM/LOW)
- **Current Action Label:** None surfaced in UI
- **Current Action Type:** none
- **Action Target:** N/A
- **User Stage:** diagnosis
- **isGenericCta:** false
- **isNoAction:** true
- **isPrematureBookingCandidate:** false
- **Notes:** Well-structured backend model with mitigation plan status tracking. Not visible in any frontend component found. High Guidance Engine value.

---

### 2.2 MAINTENANCE Family

---

**SIG-M01 — Maintenance Task Overdue**
- **Label:** "Task Overdue — {Title}" (red date)
- **Signal Type:** badge
- **Source Kind:** date_based → frontend_badge
- **Feature:** Maintenance Management
- **Screen:** Maintenance Page, Action Center
- **Backend Files:**
  - `apps/backend/src/services/maintenancePrediction.service.ts`
  - `apps/backend/src/controllers/maintenance.controller.ts`
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/maintenance/page.tsx`
  - `src/app/(dashboard)/dashboard/actions/page.tsx`
- **Prisma Models:** `PropertyMaintenanceTask` (`status=OVERDUE`, `priority`, `riskLevel`, `dueDate`)
- **Current Action Label:** "Edit | Complete | Mark as Not Needed"
- **Current Action Type:** modal (inline update)
- **Action Target:** Modal or inline status update
- **User Stage:** execution
- **isGenericCta:** false
- **isNoAction:** false
- **isPrematureBookingCandidate:** false
- **Notes:** Color-coded red for overdue, orange for due soon. Completed tasks show read-only "View". Missing: context-specific "Book Service" CTA for tasks requiring professional help (not DIY).

---

**SIG-M02 — Seasonal Checklist Due**
- **Label:** "Spring Maintenance Checklist — {N} tasks pending"
- **Signal Type:** alert
- **Source Kind:** cron_job (daily 2 AM) → backend_rule
- **Feature:** Seasonal Maintenance
- **Screen:** Dashboard, Actions
- **Backend Files:**
  - `apps/workers/src/jobs/seasonalChecklistGeneration.job.ts`
  - `apps/workers/src/jobs/seasonalChecklistExpiration.job.ts`
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/actions/page.tsx`
- **Prisma Models:** `SeasonalChecklist` (`status`, `tasksCompleted`), `SeasonalChecklistItem`
- **Current Action Label:** "View Action Plan"
- **Current Action Type:** navigation
- **Action Target:** `/dashboard/maintenance?propertyId={id}`
- **User Stage:** execution
- **isGenericCta:** true
- **isNoAction:** false
- **isPrematureBookingCandidate:** false
- **Notes:** Checklist generation uses climate region + home profile. Notification sent at 9 AM daily. No professional booking CTA for complex tasks.

---

**SIG-M03 — Maintenance Prediction (Interval-based)**
- **Label:** "HVAC Filter Change due in 3 months"
- **Signal Type:** alert
- **Source Kind:** backend_rule (interval_months, lastServicedOn)
- **Feature:** Maintenance Forecast
- **Screen:** Maintenance Forecast Page
- **Backend Files:**
  - `apps/backend/src/services/maintenancePrediction.service.ts`
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/properties/[id]/maintenance/forecast/` (inferred)
- **Prisma Models:** `MaintenancePrediction` (`predictedDate`, `priority`, `confidenceScore`, `status`, `recommendedServiceCategory`)
- **Current Action Label:** "Schedule" / "Add to Tasks"
- **Current Action Type:** task_creation
- **Action Target:** Creates MaintenanceTask
- **User Stage:** planning
- **isGenericCta:** false
- **isNoAction:** false
- **isPrematureBookingCandidate:** false
- **Notes:** Confidence scores: 0.95 (OCR/AI-verified), 0.60 (manual), 0.85 (other verified), 0.50 (unverified). High-value signal — confidence should be surfaced in UI.

---

**SIG-M04 — Maintenance Nudge (Health Score < 70)**
- **Label:** "Property Attention Needed: Health Score {X}/100 — {N} PENDING"
- **Signal Type:** alert
- **Source Kind:** frontend_card (computed from health score + pending task count)
- **Feature:** Maintenance Nudge
- **Screen:** Dashboard Main
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/components/MaintenanceNudgeCard.tsx`
- **Prisma Models:** `HomeScoreReport` (health component), `PropertyMaintenanceTask`
- **Current Action Label:** "View Action Plan"
- **Current Action Type:** navigation
- **Action Target:** `/dashboard/maintenance?propertyId={id}&priority=true` (asset-driven) OR `/dashboard/maintenance?propertyId={id}`
- **User Stage:** diagnosis
- **isGenericCta:** false
- **isNoAction:** false
- **isPrematureBookingCandidate:** false
- **Notes:** Only renders when health < 70 AND pending actions > 0. Well-targeted. Could be upgraded to show specific category of failing tasks.

---

**SIG-M05 — Home Habit Coach — Habit Assignment**
- **Label:** "Weekly: Check smoke detectors" / "Monthly: Inspect HVAC filter"
- **Signal Type:** status_indicator
- **Source Kind:** cron_job (Saturdays 3:30 AM) → backend_rule
- **Feature:** Home Habit Coach
- **Screen:** Home Habit Coach Tool Page
- **Backend Files:**
  - `apps/workers/src/jobs/habitGeneration.job.ts`
  - `apps/backend/src/services/homeHabitCoach/habitGenerationEngine.ts`
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/properties/[id]/tools/home-habit-coach/`
- **Prisma Models:** `PropertyHabit` (`status` ACTIVE/PAUSED/SNOOZED/ABANDONED, `expiresAt`)
- **Current Action Label:** "Mark Complete" / "Snooze"
- **Current Action Type:** status_update
- **Action Target:** Inline update
- **User Stage:** execution
- **isGenericCta:** false
- **isNoAction:** false
- **isPrematureBookingCandidate:** false
- **Notes:** Habit deduplication logic prevents duplicate ACTIVE/SNOOZED habits. No escalation path when habit is repeatedly snoozed.

---

**SIG-M06 — Health Score Insight — Needs Attention**
- **Label:** "Roof: Needs Inspection", "HVAC: Needs Service", etc.
- **Signal Type:** alert
- **Source Kind:** backend_computation → frontend_card
- **Feature:** Health Score
- **Screen:** Health Score Detail Page, Health Insight List (Dashboard)
- **Backend Files:**
  - `apps/backend/src/services/homeScoreReport.service.ts`
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/properties/[id]/health-score/page.tsx`
  - `src/app/(dashboard)/dashboard/components/HealthInsightList.tsx`
- **Prisma Models:** `HomeScoreReport`, `HomeScoreReportSection` (`reasons[].actionHref`)
- **Current Action Label:** "Manage Appliance Warranties" / "Book Service" / "View Inspection"
- **Current Action Type:** navigation (context-specific per factor)
- **Action Target:** `/dashboard/warranties` | `/dashboard/providers` | `/dashboard/bookings`
- **User Stage:** diagnosis
- **isGenericCta:** false
- **isNoAction:** false
- **isPrematureBookingCandidate:** true (for HVAC/Roof/Water Heater → "Book Service")
- **Notes:** Backend includes `reasons[].actionHref` — well-structured. Sending diagnostic HVAC/Roof signals directly to booking without routing through Replace/Repair or Price Radar is a premature booking gap.

---

**SIG-M07 — Proactive Maintenance Recommended (N Items)**
- **Label:** "Proactive Maintenance Recommended: {N} Items"
- **Signal Type:** alert
- **Source Kind:** frontend_card (Health Insight aggregation)
- **Feature:** Health Insight List
- **Screen:** Dashboard Main
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/components/HealthInsightList.tsx`
- **Prisma Models:** `HomeScoreReport`, `PropertyMaintenanceTask`
- **Current Action Label:** Contextual per category
- **Current Action Type:** navigation
- **Action Target:** Varies
- **User Stage:** diagnosis
- **isGenericCta:** false
- **isNoAction:** false
- **isPrematureBookingCandidate:** true
- **Notes:** Lists critical insights with contextual buttons. HVAC/Roof/Water Heater → booking (premature). Should route through diagnostic tools first.

---

### 2.3 INSURANCE Family

---

**SIG-I01 — Coverage Lapse Incident**
- **Label:** "Coverage Lapse — Policy expires in {N} days"
- **Signal Type:** alert
- **Source Kind:** cron_job (daily 8 AM) → backend_rule
- **Feature:** Incident System / Insurance
- **Screen:** Incidents List, Notifications
- **Backend Files:**
  - `apps/workers/src/jobs/coverageLapseIncidents.job.ts`
  - `apps/backend/src/services/incidents/incident.orchestrator.ts`
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/components/incidents/IncidentCard.tsx`
- **Prisma Models:** `Incident` (`typeKey=COVERAGE_LAPSE`), `InsurancePolicy` (`expiryDate`)
- **Current Action Label:** "Create renewal task"
- **Current Action Type:** task_creation
- **Action Target:** MaintenanceTask creation (category: INSURANCE)
- **User Stage:** execution
- **isGenericCta:** false
- **isNoAction:** false
- **isPrematureBookingCandidate:** false
- **Notes:** Score: 75 (≤3 days), 60 (≤7 days), 40 (≤14 days). Backend action is well-defined. Frontend only shows "View Incident Details" — doesn't surface the specific "Create Renewal Task" CTA inline.

---

**SIG-I02 — Insurance Policy Status (Renewing Soon / Expired)**
- **Label:** "Policy renewing in {N} days" / "Policy Expired"
- **Signal Type:** badge
- **Source Kind:** date_based → frontend_badge
- **Feature:** Insurance Management
- **Screen:** Insurance Page
- **Backend Files:**
  - `apps/backend/src/controllers/insurance.controller.ts`
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/insurance/page.tsx`
- **Prisma Models:** `InsurancePolicy` (`expiryDate`, `status`)
- **Current Action Label:** "Edit | Delete | Add Document"
- **Current Action Type:** modal
- **Action Target:** Policy management modal
- **User Stage:** awareness
- **isGenericCta:** false
- **isNoAction:** false
- **isPrematureBookingCandidate:** false
- **Notes:** No "Compare Rates" or "Find Better Policy" CTA when policy is expiring. Guidance Engine opportunity: surface Coverage Intelligence or Risk Premium Optimizer when renewal approaches.

---

**SIG-I03 — Coverage Intelligence Verdict**
- **Label:** "ADEQUATE" / "HAS_GAPS" / "CRITICAL_GAPS"
- **Signal Type:** card_metric
- **Source Kind:** backend_computation → frontend_card
- **Feature:** Coverage Intelligence Tool
- **Screen:** Dashboard Tool Card, Tool Page
- **Backend Files:**
  - `apps/backend/src/services/coverageAnalysis.service.ts` (inferred)
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/components/CoverageIntelligenceToolCard.tsx`
  - `src/app/(dashboard)/dashboard/properties/[id]/tools/coverage-intelligence/`
- **Prisma Models:** `CoverageAnalysis` (`verdict`, `status`)
- **Current Action Label:** "Run analysis" / "Re-run" / "View details"
- **Current Action Type:** tool_launch
- **Action Target:** `/dashboard/properties/{id}/tools/coverage-intelligence`
- **User Stage:** diagnosis
- **isGenericCta:** false
- **isNoAction:** false
- **isPrematureBookingCandidate:** false
- **Notes:** Verdict of CRITICAL_GAPS should trigger a stronger action than "View details" — Guidance Engine should escalate to "Fix coverage gap" path.

---

**SIG-I04 — Risk Premium Optimizer**
- **Label:** "Potential savings: ${X}–${Y}/year"
- **Signal Type:** card_metric
- **Source Kind:** backend_computation → frontend_card
- **Feature:** Risk Premium Optimizer
- **Screen:** Dashboard Tool Card, Tool Page
- **Backend Files:**
  - `apps/backend/src/services/riskPremiumOptimization.service.ts` (inferred)
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/components/RiskPremiumOptimizerToolCard.tsx`
  - `src/app/(dashboard)/dashboard/properties/[id]/tools/risk-premium-optimizer/`
- **Prisma Models:** `RiskPremiumOptimizationAnalysis` (`status`, savings range)
- **Current Action Label:** "Run optimizer" / "Re-run" / "View details"
- **Current Action Type:** tool_launch
- **Action Target:** `/dashboard/properties/{id}/tools/risk-premium-optimizer`
- **User Stage:** decision
- **isGenericCta:** false
- **isNoAction:** false
- **isPrematureBookingCandidate:** false
- **Notes:** Shows savings range and top recommendation when available. After viewing recommendations, there's no path to act on them (contact insurer, negotiate, implement mitigation).

---

**SIG-I05 — Upcoming Renewals (Warranty + Insurance)**
- **Label:** "N renewals upcoming — Expired / Due in 30d / Active"
- **Signal Type:** card_metric
- **Source Kind:** date_based → frontend_card
- **Feature:** Upcoming Renewals
- **Screen:** Dashboard Main
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/components/UpcomingRenewalsCard.tsx`
- **Prisma Models:** `Warranty` (`expiryDate`), `InsurancePolicy` (`expiryDate`)
- **Current Action Label:** "View All N" / "Add Coverage"
- **Current Action Type:** navigation
- **Action Target:** `/dashboard/warranties` OR `/dashboard/insurance`
- **User Stage:** awareness
- **isGenericCta:** true
- **isNoAction:** false
- **isPrematureBookingCandidate:** false
- **Notes:** Three item preview. "View All" is generic — no inline "Renew Now" or "Compare Options" per item.

---

### 2.4 CLAIMS Family

---

**SIG-C01 — Claim Status (Draft → Submitted → Approved/Denied)**
- **Label:** Claim status badge + checklist completion %
- **Signal Type:** badge
- **Source Kind:** event_based → frontend_badge
- **Feature:** Claims Management
- **Screen:** Claims Page, Claim Detail
- **Backend Files:**
  - `apps/backend/src/services/claims/claims.service.ts`
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/properties/[id]/claims/page.tsx`
- **Prisma Models:** `Claim` (`status`, `checklistCompletionPct`, `nextFollowUpAt`, `estimatedLossAmount`)
- **Current Action Label:** "View | Edit | Submit | Download"
- **Current Action Type:** navigation
- **Action Target:** `/dashboard/properties/{id}/claims/{id}`
- **User Stage:** execution
- **isGenericCta:** false
- **isNoAction:** false
- **isPrematureBookingCandidate:** false
- **Notes:** Progress bar shows completion %. Backend tracks `overdueFollowUps`. Guidance Engine: surface follow-up reminders when nextFollowUpAt approaches.

---

**SIG-C02 — Negotiation Shield — Analysis Signal**
- **Label:** "Contractor asking too much", "Insurance settlement below fair value", etc.
- **Signal Type:** alert
- **Source Kind:** ai_generated (Gemini document parsing)
- **Feature:** Negotiation Shield
- **Screen:** Negotiation Shield Tool Page
- **Backend Files:**
  - `apps/backend/src/services/negotiationShield.service.ts`
  - `apps/backend/src/services/negotiationShieldBuyerInspection.service.ts`
  - `apps/backend/src/services/negotiationShieldContractorQuote.service.ts`
  - `apps/backend/src/services/negotiationShieldContractorUrgency.service.ts`
  - `apps/backend/src/services/negotiationShieldInsuranceClaimSettlement.service.ts`
  - `apps/backend/src/services/negotiationShieldInsurancePremiumIncreaseAnalysis.service.ts`
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/properties/[id]/tools/negotiation-shield/`
- **Prisma Models:** `NegotiationShieldCase`, `NegotiationShieldAnalysis`
- **Current Action Label:** Analysis text recommendations
- **Current Action Type:** none (text output only)
- **Action Target:** N/A
- **User Stage:** decision
- **isGenericCta:** false
- **isNoAction:** true (recommendations are text, no clickable next step)
- **isPrematureBookingCandidate:** false
- **Notes:** 5 scenario types covered. Rich AI analysis output has no actionable deep link. Guidance Engine should convert analysis output into counter-offer templates or claim reopening workflow.

---

### 2.5 WARRANTY Family

---

**SIG-W01 — Warranty Expiring**
- **Label:** "Warranty expires in {N} days" / "Warranty Expired"
- **Signal Type:** badge
- **Source Kind:** date_based → frontend_badge
- **Feature:** Warranties Management
- **Screen:** Warranties Page, Upcoming Renewals Card
- **Backend Files:**
  - `apps/backend/src/controllers/warranty.controller.ts`
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/warranties/page.tsx`
  - `src/app/(dashboard)/dashboard/components/UpcomingRenewalsCard.tsx`
- **Prisma Models:** `Warranty` (`expiryDate`)
- **Current Action Label:** "Renew / Edit / View"
- **Current Action Type:** modal
- **Action Target:** Warranty management modal
- **User Stage:** awareness
- **isGenericCta:** false
- **isNoAction:** false
- **isPrematureBookingCandidate:** false
- **Notes:** No signal that a warranty gap exists (item without any warranty coverage). Coverage Intelligence fills this gap but is not cross-linked.

---

**SIG-W02 — Recall Match — Product Recall Detected**
- **Label:** "Recall Detected: {Product}" — Severity: CRITICAL/HIGH/MEDIUM
- **Signal Type:** alert
- **Source Kind:** cron_job (daily 3 AM CPSC ingest + 3:10 AM match)
- **Feature:** Recall Safety Alerts
- **Screen:** Recalls Page, Property Detail
- **Backend Files:**
  - `apps/workers/src/jobs/recallIngest.job.ts`
  - `apps/workers/src/jobs/recallMatch.job.ts`
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/properties/[id]/recalls/page.tsx`
- **Prisma Models:** `RecallMatch` (`status`, `confidencePct`), `RecallRecord` (`severity`)
- **Current Action Label:** "Resolve Recall | View Details | Contact Manufacturer"
- **Current Action Type:** modal (confirmation workflow)
- **Action Target:** RecallMatch status update to CONFIRMED/DISMISSED
- **User Stage:** execution
- **isGenericCta:** false
- **isNoAction:** false
- **isPrematureBookingCandidate:** false
- **Notes:** Severity: CRITICAL (death/fatal), HIGH (fire/burn/electrocution), MEDIUM (shock/choking). "Contact Manufacturer" is an external link. No "Find Replacement" or "Book Installation" CTA post-resolution.

---

### 2.6 FINANCIAL Family

---

**SIG-F01 — Financial Efficiency Score**
- **Label:** "Financial Efficiency Score: {X}/100 — Excellent/Good/Fair/Poor"
- **Signal Type:** score
- **Source Kind:** backend_computation → frontend_card
- **Feature:** Financial Efficiency
- **Screen:** Dashboard Main (FinancialEfficiencyScoreCard), Financial Efficiency Page
- **Backend Files:**
  - `apps/backend/src/services/financialEfficiency.service.ts` (inferred)
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/components/FinancialEfficiencyScoreCard.tsx`
- **Prisma Models:** `PropertyScoreSnapshot` (financial component)
- **Current Action Label:** Arrow link → "View Report"
- **Current Action Type:** navigation
- **Action Target:** `/dashboard/properties/{id}/financial-efficiency`
- **User Stage:** awareness
- **isGenericCta:** true
- **isNoAction:** false
- **isPrematureBookingCandidate:** false
- **Notes:** Shows annual cost + potential savings range. Triggers celebration modal if score ≥ 60 on first load. Guidance Engine: below 50 should surface specific savings tools (Home Savings, Refinance Radar, Energy Audit).

---

**SIG-F02 — Home Savings Opportunity**
- **Label:** "{Category}: Save ${X}/month — HIGH confidence"
- **Signal Type:** card_metric
- **Source Kind:** backend_rule + provider_integration
- **Feature:** Home Savings Check
- **Screen:** Dashboard Tool Card, Home Savings Tool Page
- **Backend Files:**
  - `apps/backend/src/services/homeSavings.service.ts`
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/components/HomeSavingsCheckToolCard.tsx`
  - `src/app/(dashboard)/dashboard/properties/[id]/tools/home-savings/`
- **Prisma Models:** `HomeSavingsOpportunity` (`status`, `estimatedMonthlySavings`, `estimatedAnnualSavings`, `confidence`, `actionUrl`, `expiresAt`)
- **Current Action Label:** "Add bill" / "Compare" / "View details"
- **Current Action Type:** tool_launch (context-specific)
- **Action Target:** `/dashboard/properties/{id}/tools/home-savings`
- **User Stage:** diagnosis → decision
- **isGenericCta:** false
- **isNoAction:** false
- **isPrematureBookingCandidate:** false
- **Notes:** CTA adapts: "Add bill" (not set up), "Compare" (configured, no savings found), "View details" (savings found). `actionUrl` field in DB but not consistently surfaced per opportunity in the UI.

---

**SIG-F03 — Refinance Opportunity**
- **Label:** "Refinance Opportunity: Save ${X}/month, break even in {N} months"
- **Signal Type:** card_metric
- **Source Kind:** cron_job (Thursdays 5 PM — FRED/Freddie Mac data) → rate_gap_engine
- **Feature:** Mortgage Refinance Radar
- **Screen:** Dashboard Tool Card, Refinance Radar Tool Page
- **Backend Files:**
  - `apps/workers/src/jobs/ingestMortgageRates.job.ts`
  - `apps/backend/src/refinanceRadar/refinanceRadar.service.ts`
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/properties/[id]/tools/mortgage-refinance-radar/`
- **Prisma Models:** `RefinanceOpportunity`, `PropertyRefinanceRadarState` (`radarState`, `currentRate`, `marketRate`, `rateGap`, `monthlySavings`, `breakEvenMonths`, `confidenceLevel`)
- **Current Action Label:** "Open Tool" → tool page with rate analysis
- **Current Action Type:** tool_launch
- **Action Target:** `/dashboard/properties/{id}/tools/mortgage-refinance-radar`
- **User Stage:** decision
- **isGenericCta:** true
- **isNoAction:** false
- **isPrematureBookingCandidate:** false
- **Notes:** Tracks missed opportunities and rate trends. After seeing the opportunity, no "Contact a Lender" or "Get Rate Quote" CTA.

---

**SIG-F04 — Hidden Asset Match**
- **Label:** "Tax Deduction Available: {Program}" / "Rebate Detected: ${X}"
- **Signal Type:** alert
- **Source Kind:** cron_job (Sundays 3 AM) → rule_based pattern matching
- **Feature:** Hidden Asset Finder
- **Screen:** Hidden Asset Finder Tool Page
- **Backend Files:**
  - `apps/workers/src/jobs/hiddenAssetRefresh.job.ts`
  - `apps/backend/src/services/hiddenAssets.service.ts`
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/properties/[id]/tools/hidden-asset-finder/`
- **Prisma Models:** `PropertyHiddenAssetMatch` (`status` DETECTED/CONFIRMED/EXPIRED/INACTIVATED), `HiddenAssetProgram`
- **Current Action Label:** "Apply" / "Learn More" (inferred)
- **Current Action Type:** navigation (external or internal)
- **Action Target:** Program-specific URL
- **User Stage:** decision → execution
- **isGenericCta:** true
- **isNoAction:** false
- **isPrematureBookingCandidate:** false
- **Notes:** Status lifecycle: DETECTED → CONFIRMED → EXPIRED/INACTIVATED. No prominent notification when a new match is DETECTED.

---

**SIG-F05 — Energy Efficiency Score**
- **Label:** "Energy Score: {X}/100 — {Grade} | Potential savings: ${Y}/year"
- **Signal Type:** score
- **Source Kind:** ai_generated (Gemini) + rule_based
- **Feature:** Energy Auditor
- **Screen:** Property Detail (embedded)
- **Backend Files:**
  - `apps/backend/src/services/energyAuditor.service.ts`
- **Frontend Files:** (no dedicated page found — may be embedded in property detail)
- **Prisma Models:** `EnergyAudit` (inferred — `overallScore`, `grade`, `annualUsage`, `potentialSavings`)
- **Current Action Label:** Text recommendations by category (HVAC, Insulation, etc.)
- **Current Action Type:** none (text only)
- **Action Target:** N/A
- **User Stage:** diagnosis
- **isGenericCta:** false
- **isNoAction:** true
- **isPrematureBookingCandidate:** false
- **Notes:** Categories: HVAC, Water Heating, Lighting, Appliances, Insulation, Solar, Behavioral. `paybackMonths` computed per recommendation but no booking/upgrade CTA attached.

---

**SIG-F06 — Neighborhood Change Radar Signal**
- **Label:** "TRANSIT_UPSIDE_PRESENT", "FLOOD_RISK_PRESSURE", "COMMERCIAL_GROWTH_SIGNAL"
- **Signal Type:** alert
- **Source Kind:** cron_job (Sundays 5 AM) → impact_score_threshold (≥40)
- **Feature:** Neighborhood Change Radar
- **Screen:** Neighborhood Change Radar Tool Page
- **Backend Files:**
  - `apps/backend/src/neighborhoodIntelligence/neighborhoodSignalService.ts`
  - `apps/workers/src/jobs/refreshNeighborhoodEvents.job.ts`
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/properties/[id]/tools/neighborhood-change-radar/`
- **Prisma Models:** `NeighborhoodEvent`, `PropertyNeighborhoodEvent`, `NeighborhoodImpact`
- **Current Action Label:** None (descriptive signal cards)
- **Current Action Type:** none
- **Action Target:** N/A
- **User Stage:** awareness
- **isGenericCta:** false
- **isNoAction:** true
- **isPrematureBookingCandidate:** false
- **Notes:** 12 signal codes (7 NEGATIVE, 4 POSITIVE, 1 MIXED). Rich data — no action guidance. Guidance Engine should map signal codes to recommended actions (e.g., FLOOD_RISK_PRESSURE → Coverage Intelligence, TRANSIT_UPSIDE_PRESENT → Sell/Hold/Rent tool).

---

### 2.7 SCORE Family

---

**SIG-S01 — Health Score (Overall)**
- **Label:** "Health Score: {X}/100 — Excellent/Good/Fair/Poor"
- **Signal Type:** score
- **Source Kind:** backend_computation → frontend_card
- **Feature:** Property Intelligence Scores
- **Screen:** Dashboard Main (PropertyHealthScoreCard), Health Score Detail Page
- **Backend Files:**
  - `apps/backend/src/services/homeScoreReport.service.ts`
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/components/PropertyHealthScoreCard.tsx`
  - `src/app/(dashboard)/dashboard/properties/[id]/health-score/page.tsx`
- **Prisma Models:** `HomeScoreReport` (`homeScore`, `grade`, `ratingTier`, `confidenceLevel`)
- **Current Action Label:** Arrow link (no label)
- **Current Action Type:** navigation
- **Action Target:** `/dashboard/properties/{id}/health-score`
- **User Stage:** awareness
- **isGenericCta:** true
- **isNoAction:** false
- **isPrematureBookingCandidate:** false
- **Notes:** Grade: A (EXCELLENT), B (STRONG), C (STABLE), D (MODERATE_RISK), F (HIGH_RISK). Shows "N Maintenance Required" below score. Action is implicit. Below 70 triggers MaintenanceNudgeCard.

---

**SIG-S02 — Home Score Certification Expiry**
- **Label:** "Home Score Certification Expired" / "Available"
- **Signal Type:** badge
- **Source Kind:** date_based → backend_rule
- **Feature:** Home Score
- **Screen:** Health Score Page
- **Backend Files:**
  - `apps/backend/src/services/homeScoreReport.service.ts`
- **Prisma Models:** `HomeScoreCertification` (`status` AVAILABLE/EXPIRED/REVOKED)
- **Current Action Label:** "Renew Certification" (inferred)
- **Current Action Type:** navigation
- **Action Target:** Certification renewal flow
- **User Stage:** execution
- **isGenericCta:** false
- **isNoAction:** false
- **isPrematureBookingCandidate:** false
- **Notes:** Certification tied to home score validity window. Expiry should trigger a prominent notification.

---

**SIG-S03 — Property Score Snapshot (Weekly Delta)**
- **Label:** "Health Score up +3 this week" / "Risk Score down -5"
- **Signal Type:** score
- **Source Kind:** cron_job (weekly snapshots) → frontend_card
- **Feature:** Score Tracking
- **Screen:** Dashboard, Health Score Page
- **Prisma Models:** `PropertyScoreSnapshot` (`score`, `scoreBand`)
- **Current Action Label:** None (trend display only)
- **Current Action Type:** none
- **Action Target:** N/A
- **User Stage:** awareness
- **isGenericCta:** false
- **isNoAction:** true
- **isPrematureBookingCandidate:** false
- **Notes:** Week-over-week delta is displayed but no action is prescribed when score drops significantly (e.g., "Score dropped 10 pts this week — here's why").

---

### 2.8 INCIDENT Family

---

**SIG-IN01 — Incident (Generic — All Types)**
- **Label:** "{Type}: {Title} — Severity: {CRITICAL/HIGH/MEDIUM/LOW/INFO}"
- **Signal Type:** badge + alert
- **Source Kind:** backend_rule / cron_job / ai_generated
- **Feature:** Incident System
- **Screen:** Incidents List, Property Detail, Notifications
- **Backend Files:**
  - `apps/backend/src/services/incidents/incident.service.ts`
  - `apps/backend/src/services/incidents/incident.orchestrator.ts`
  - `apps/backend/src/services/incidents/incident.evaluator.ts`
  - `apps/backend/src/services/incidents/incident.scoring.ts`
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/components/incidents/IncidentCard.tsx`
  - `src/app/(dashboard)/dashboard/properties/[id]/incidents/`
- **Prisma Models:** `Incident` (`status`, `severity`, `severityScore`, `typeKey`, `sourceType`, `isSuppressed`, `snoozedUntil`)
- **Current Action Label:** "View Incident Details"
- **Current Action Type:** navigation
- **Action Target:** `/dashboard/properties/{id}/incidents/{id}`
- **User Stage:** diagnosis
- **isGenericCta:** true
- **isNoAction:** false
- **isPrematureBookingCandidate:** false
- **Notes:** 6 source types (WEATHER, COVERAGE, RECALL, HOMEOWNER_REPORT, PLATFORM_ALERT, RISK_MODEL). Backend `actions[].ctaLabel` field exists but frontend shows generic "View Incident Details" instead. This is the most significant backend→frontend action gap in the system.

---

**SIG-IN02 — Orchestration Action (Suppressed / Active)**
- **Label:** "High-priority action: {Task Title}"
- **Signal Type:** status_indicator
- **Source Kind:** backend_rule (suppression-aware orchestration)
- **Feature:** Action Center / Orchestration
- **Screen:** Actions Page
- **Backend Files:**
  - `apps/backend/src/services/orchestration.service.ts`
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/actions/page.tsx`
- **Prisma Models:** `OrchestrationActionEvent` (`type`, `status`, priority 1–10, `overdue`)
- **Current Action Label:** "View Details | Take Action"
- **Current Action Type:** navigation
- **Action Target:** `/dashboard/properties/{id}/[resource]`
- **User Stage:** diagnosis → execution
- **isGenericCta:** true
- **isNoAction:** false
- **isPrematureBookingCandidate:** false
- **Notes:** Suppression reasons: BOOKING_EXISTS, COVERED, NOT_ACTIONABLE, CHECKLIST_TRACKED, USER_MARKED_COMPLETE. Snooze support. CTA reason field (`COVERED/MISSING_DATA/ACTION_REQUIRED/NONE`) present in backend but not surfaced in frontend.

---

### 2.9 NEIGHBORHOOD Family

---

**SIG-N01 — Neighborhood Event**
- **Label:** "Permit Filed Near Your Home" / "Code Violation Nearby"
- **Signal Type:** alert
- **Source Kind:** cron_job (Sundays 5 AM) → impact scoring
- **Feature:** Neighborhood Change Radar
- **Screen:** Neighborhood Change Radar Tool Page
- **Backend Files:**
  - `apps/workers/src/jobs/refreshNeighborhoodEvents.job.ts`
  - `apps/backend/src/neighborhoodIntelligence/neighborhoodImpactEngine.ts`
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/properties/[id]/tools/neighborhood-change-radar/`
- **Prisma Models:** `NeighborhoodEvent` (`eventType` — 15 types), `PropertyNeighborhoodEvent`
- **Current Action Label:** None
- **Current Action Type:** none
- **Action Target:** N/A
- **User Stage:** awareness
- **isGenericCta:** false
- **isNoAction:** true
- **isPrematureBookingCandidate:** false
- **Notes:** 15 event types. Daily notification job for significant events. No actionable CTA — notification only.

---

**SIG-N02 — Home Event Radar Signal**
- **Label:** "Weather Alert", "Maintenance Overdue", etc. — contextual event types
- **Signal Type:** alert
- **Source Kind:** backend_rule + weather_api
- **Feature:** Home Event Radar
- **Screen:** Home Event Radar Tool Page
- **Backend Files:**
  - `apps/backend/src/services/homeEventRadarMatcher.service.ts`
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/properties/[id]/tools/home-event-radar/`
- **Prisma Models:** `HomeEvent` (`type` — 23 types, `importance` CRITICAL/HIGH/NORMAL/LOW, `sourceBadge`)
- **Current Action Label:** "View Details" (per event)
- **Current Action Type:** navigation
- **Action Target:** Event-specific resource
- **User Stage:** awareness
- **isGenericCta:** true
- **isNoAction:** false
- **isPrematureBookingCandidate:** false
- **Notes:** 23 HomeEventType values covering full property lifecycle. `sourceBadge` field (USER_REPORTED/DATA_VERIFIED/AI_DETECTED/THIRD_PARTY/ESTIMATE) adds credibility context. "View Details" is generic.

---

### 2.10 RENOVATION & COMPLIANCE Family

---

**SIG-RV01 — Home Renovation Risk Advisor — Permit / Tax / Contractor Risk**
- **Label:** "Permit Required", "Tax Impact: HIGH — +${X}/month", "Contractor Licensing Required"
- **Signal Type:** alert + score
- **Source Kind:** ai_generated (Gemini) + rule_based (jurisdiction)
- **Feature:** Home Renovation Risk Advisor
- **Screen:** Renovation Risk Advisor Tool Page
- **Backend Files:**
  - `apps/backend/src/homeRenovationAdvisor/engine/summary/summaryBuilder.service.ts`
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/properties/[id]/tools/home-renovation-risk-advisor/`
- **Prisma Models:** `HomeRenovationAdvisorSession`, `HomeRenovationPermitOutput`, `HomeRenovationComplianceChecklist`
- **Current Action Label:** "Check with local building department" / "Resolve permit status" / "Verify licensed contractor"
- **Current Action Type:** text recommendation
- **Action Target:** N/A (text only)
- **User Stage:** decision
- **isGenericCta:** false
- **isNoAction:** true (text recommendations, no navigation)
- **isPrematureBookingCandidate:** false
- **Notes:** Risk levels: CRITICAL (retroactive non-compliance + structural + no permit), HIGH, MODERATE, LOW. Tax threshold: >$300/month = HIGH, >$700/month = CRITICAL. Rich analysis with no clickable next step.

---

### 2.11 INVENTORY & DIGITAL TWIN Family

---

**SIG-DT01 — Inventory Item Condition (EOL / Poor)**
- **Label:** "HVAC Furnace — EOL / Poor Condition"
- **Signal Type:** badge
- **Source Kind:** frontend_badge (condition field)
- **Feature:** Inventory / Digital Twin
- **Screen:** Inventory Page, Digital Twin Tool
- **Backend Files:**
  - `apps/backend/src/services/RiskAssessment.service.ts`
- **Frontend Files:**
  - `src/app/(dashboard)/dashboard/properties/[id]/inventory/`
- **Prisma Models:** `InventoryItem` (`condition` — EXCELLENT/GOOD/FAIR/POOR/EOL/UNKNOWN)
- **Current Action Label:** "Edit | View | Replace" (inferred)
- **Current Action Type:** modal
- **Action Target:** Inventory management modal
- **User Stage:** diagnosis
- **isGenericCta:** false
- **isNoAction:** false
- **isPrematureBookingCandidate:** true
- **Notes:** EOL condition should route to Replace/Repair tool before booking. No intermediate decision tool linked.

---

**SIG-DT02 — Home Digital Twin — Daily Snapshot**
- **Label:** "Today: {N} pending issues"
- **Signal Type:** card_metric
- **Source Kind:** backend_computation
- **Feature:** Daily Snapshot
- **Screen:** Daily Snapshot Tool
- **Prisma Models:** `PropertyDailySnapshot` (`score`, `hasPendingIssues`)
- **Current Action Label:** "View pending issues"
- **Current Action Type:** navigation
- **Action Target:** Actions page
- **User Stage:** awareness
- **isGenericCta:** true
- **isNoAction:** false
- **isPrematureBookingCandidate:** false
- **Notes:** Simple daily roll-up. No prioritization of which pending issue is most urgent.

---

## 3. Duplicate Signals

| Group ID | Signals | Surfaces | Issue |
|---|---|---|---|
| DUP-01 | SIG-R01, SIG-S01, SIG-S03 | Dashboard cards + Health Score page | Risk Score and Health Score appear separately on dashboard AND on detail pages. Same data shown 3–4 times with different framing. |
| DUP-02 | SIG-I05, SIG-W01 | Upcoming Renewals card + Warranties page + Insurance page | Warranty/insurance expiry signals appear in 3 places (dashboard card, warranties page badge, insurance page badge) with no coordination. |
| DUP-03 | SIG-M04, SIG-M06, SIG-M07 | Dashboard Main | Three separate "maintenance attention needed" signals on the same dashboard screen (MaintenanceNudgeCard, HealthInsightList, ProactiveMaintenance card). Overlapping content, different visual treatment. |
| DUP-04 | SIG-IN01, SIG-IN02 | Incident Card + Action Center | Incidents appear on both the incident list and the Action Center with different CTAs ("View Incident Details" vs. "Take Action"). User sees same alert twice. |
| DUP-05 | SIG-M01, SIG-M02 | Maintenance page + Actions page | Overdue tasks appear in Maintenance page AND Action Center. No deduplication. |
| DUP-06 | SIG-F03, SIG-S01 | Refinance dashboard card + Financial score card | Both show financial opportunity signals without cross-linking. |
| DUP-07 | SIG-I01, SIG-I02 | Coverage Lapse Incident + Insurance Policy Badge | Same expiry event generates an Incident AND a badge status independently, creating two surfaces for the same problem. |
| DUP-08 | SIG-N01, SIG-N02 | Neighborhood Radar + Home Event Radar | Neighborhood events appear in both tools with different visual treatments and no clear distinction for the user. |

---

## 4. Generic CTA Overuse

The following CTAs are considered generic — they describe the navigation target, not the user benefit or recommended action.

| CTA Label | Count | Locations | Recommended Replacement |
|---|---|---|---|
| "Open Tool" | 32 | All tool catalog entries (mobileToolCatalog.ts) | Context-specific: "Run your first scan", "See your savings", "Check refinance window" |
| "View Details" | 8 | Incident Card, Home Event, Actions page | Context: "Fix this issue", "See what changed", "Review and act" |
| "View All N" | 3 | Upcoming Renewals, Maintenance list | "Review 3 expiring items", "See overdue tasks" |
| "Learn More" | 2 | Tool explainers | "How Coverage Intelligence works" |
| "Back to property" | All tool pages | Tool headers | Keep — navigation, not action |
| "View report" (arrow icon only) | 3 | Score cards | Add text label: "See what's affecting your score" |
| "View Action Plan" | 2 | Maintenance Nudge, Seasonal Checklist | "Fix {N} overdue tasks" / "Start spring checklist" |

---

## 5. Missing Actions

Signals with **no associated action** — user sees information but has no guided next step.

| Signal | Family | Surface | What's Missing |
|---|---|---|---|
| SIG-R02 — Top Risk Drivers Table | RISK | Risk Radar Page | Per-row CTA: "Replace/Repair", "View Coverage", "Book Inspection" |
| SIG-R04 — Climate Risk | RISK | Property Detail | Convert mitigation steps to deep links (Coverage Intelligence, Seasonal Checklist) |
| SIG-R07 — Risk Mitigation Plan Item | RISK | Risk Assessment | Not shown in any frontend component at all |
| SIG-C02 — Negotiation Shield Output | CLAIMS | Negotiation Shield Tool | "Generate counter-offer template", "Reopen claim" |
| SIG-F05 — Energy Audit Score | FINANCIAL | Property Detail | "Schedule insulation upgrade", "Request solar quote" (paybackMonths computed but unused) |
| SIG-F06 — Neighborhood Signals | FINANCIAL | Neighborhood Radar | Map signal codes to tools: FLOOD_RISK → Coverage Intelligence, TRANSIT_UPSIDE → Sell/Hold/Rent |
| SIG-N01 — Neighborhood Event | NEIGHBORHOOD | Neighborhood Radar | "See how this affects your value", "Update insurance" |
| SIG-RV01 — Renovation Risk | COMPLIANCE | Renovation Advisor | Convert "Check with building dept" to a checklist task or permit tool link |
| SIG-S03 — Score Weekly Delta | SCORE | Dashboard | "Score dropped — here's what changed" with specific action |
| SIG-IN02 — Orchestration CTA Reason | INCIDENT | Action Center | `cta.reason` field (COVERED/MISSING_DATA) not surfaced to user |

---

## 6. Premature Booking Findings

Signals that jump directly to booking/scheduling before intermediate diagnostic or decision tools have been offered.

| ID | Signal | Current CTA | Why Premature | Recommended Intermediate Tool |
|---|---|---|---|---|
| PB-01 | SIG-M06 — "HVAC Needs Service" (Health Insight) | "Book Service" → `/dashboard/providers` | User has not seen Replace/Repair analysis or Service Price Radar. May spend money on a unit that should be replaced. | → Replace/Repair Tool → Service Price Radar → Book |
| PB-02 | SIG-M07 — "Proactive Maintenance: Roof" | "Book Service" → `/dashboard/bookings` | Same as above. Roof signals should first check Home Risk Replay for historical damage, then Get Quote. | → Home Risk Replay → Service Price Radar → Book |
| PB-03 | SIG-DT01 — Inventory Item EOL | "Replace" → direct | No Replace/Repair decision tool consulted. No price benchmark from Service Price Radar. | → Replace/Repair → Service Price Radar → Book |

---

## 7. High-Impact Gaps

Gaps ranked by user value and implementation effort.

| Rank | Gap | Impact | Effort | Signals Affected |
|---|---|---|---|---|
| 1 | **Incident → specific action** not surfaced in frontend (backend `actions[].ctaLabel` exists) | Very High | Low | SIG-IN01, SIG-I01, SIG-R03 |
| 2 | **Top Risk Drivers table** has no per-row CTA | Very High | Medium | SIG-R02 |
| 3 | **Negotiation Shield output** is text-only — no clickable next step | High | Medium | SIG-C02 |
| 4 | **Neighborhood Signal codes** have no action mapping | High | Medium | SIG-F06, SIG-N01 |
| 5 | **Energy Audit** payback data computed but not used in any CTA | High | Low | SIG-F05 |
| 6 | **Climate Risk** mitigation steps not converted to deep links | High | Low | SIG-R04 |
| 7 | **Renovation Risk** text recommendations not converted to tasks | Medium | Low | SIG-RV01 |
| 8 | **Score drop** (weekly delta) has no "why + what to do" path | Medium | Medium | SIG-S03 |
| 9 | **Duplicate maintenance signals** on dashboard (3 separate cards) | Medium | Low | SIG-M04, M06, M07 |
| 10 | **Hidden Asset match** detected but no prominent push notification | Medium | Low | SIG-F04 |

---

## 8. Candidate Inputs for Guidance Engine

The following signals are the highest-quality inputs for a future Guidance Engine. They have structured backend data, clear user intent, and a defined action path.

### Tier 1 — Ready Now (backend action field exists, frontend just needs to use it)

| Signal | Backend Action Field | Guidance Engine Role |
|---|---|---|
| SIG-IN01 — All Incidents | `actions[].ctaLabel` + `actions[].type` | Surface incident-specific CTA inline without requiring navigation to detail page |
| SIG-IN02 — Orchestration Actions | `cta.label` + `cta.reason` | Show suppression reason to user ("Already covered by policy", "Booking exists") |
| SIG-I01 — Coverage Lapse | `actions[0].ctaLabel = "Create renewal task"` | Auto-create renewal task from incident with one click |
| SIG-R03 — Freeze Risk | `actions[0].ctaLabel = "Create winterization task"` | One-tap task creation from incident card |

### Tier 2 — Signal-to-Tool Routing (good signal, needs tool chain defined)

| Signal | Guidance Mapping |
|---|---|
| SIG-R02 — Risk Driver (HIGH severity asset) | → Replace/Repair Tool → Service Price Radar → Book |
| SIG-R01 — Risk Score < 60 | → Do-Nothing Simulator → Risk Mitigation Plan |
| SIG-S01 — Health Score < 70 | → Health Insight Details → specific maintenance task → book if needed |
| SIG-I03 — Coverage Verdict: CRITICAL_GAPS | → Risk Premium Optimizer → contact insurer |
| SIG-F01 — Financial Score < 50 | → Home Savings Tool → Energy Audit → Refinance Radar |
| SIG-F03 — Refinance Opportunity open | → Negotiation Shield (premium) → lender contact |
| SIG-W02 — Recall Match OPEN | → Recall resolution → replacement booking if needed |
| SIG-N01 — FLOOD_RISK_PRESSURE signal | → Coverage Intelligence → Seasonal Checklist (flood prep) |
| SIG-N01 — TRANSIT_UPSIDE_PRESENT | → Sell/Hold/Rent Tool |
| SIG-DT01 — Inventory EOL | → Replace/Repair → Service Price Radar → Book |

### Tier 3 — New Signal Extraction Needed (data exists, not yet a signal)

| Latent Signal | Source Model | Extraction Method |
|---|---|---|
| Insurance gap (no policy for a system) | `InventoryItem` + `InsurancePolicy` | Join — if item has no related active policy |
| Warranty gap (item with no warranty) | `InventoryItem` + `Warranty` | Join — if item age < expected life but no warranty |
| Score stagnation (no improvement in 4 weeks) | `PropertyScoreSnapshot` | Time series — score flat or declining for 4+ periods |
| Habit abandonment (ABANDONED status) | `PropertyHabit` | Status = ABANDONED → re-engage with "Try again" or alternative action |
| Missed refinance window (opportunity closed) | `RefinanceOpportunity.lastClosedAt` | Trigger retrospective "you missed it" + "watch for next" |
| Renovation without permit (inspection-detectable) | `HomeEvent` type=RENOVATION_STARTED | Cross-check with `HomeRenovationPermitOutput` |

### Worker Cadence Map (for Guidance Engine scheduling)

| Cadence | Jobs | Signal Families Generated |
|---|---|---|
| Daily 1–3 AM | seasonalExpiration, recallIngest, inventoryDraftCleanup | WARRANTY, MAINTENANCE |
| Daily 8–9 AM | coverageLapse, freezeRisk, seasonalNotification, neighborhoodNotification | INSURANCE, RISK, MAINTENANCE, NEIGHBORHOOD |
| Weekly Mon 6 AM | gazetteGeneration | ALL (digest) |
| Weekly Thu 5 PM | mortgageRateIngest | FINANCIAL/REFINANCE |
| Weekly Sat 3:30 AM | habitGeneration | MAINTENANCE |
| Weekly Sun 3–5 AM | hiddenAssetRefresh, neighborhoodRefresh, scoreSnapshots | FINANCIAL, NEIGHBORHOOD, SCORE |
| Continuous | domainEvents, reportExport | ALL (delivery) |

---

*Audit generated from: Prisma schema (35+ models), 60+ frontend files, 40+ backend services, 23 worker jobs.*
*This document is the source of truth for Guidance Engine signal design.*
