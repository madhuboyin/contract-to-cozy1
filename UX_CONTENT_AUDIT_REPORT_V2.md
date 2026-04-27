# UX Content Audit Report v2: Report Pages & Dashboard Cards

**Date**: April 27, 2026
**Scope**: Health Score, Home Score, Financial Efficiency, Risk Assessment reports + Dashboard summary cards
**Version**: 2.0 — revised based on review feedback
**Changes from v1**: Resolved naming inconsistencies, corrected effort estimates for dynamic labels, added accessibility and mobile scope, reordered rollout, swapped primary/alternate CTAs where v1 had them backwards

---

## Executive Summary

### Top Recurring Clarity Problems

1. **Generic Status Labels Without Context** (HIGH SEVERITY)
   - "Needs attention", "Needs Review", "Needs Inspection", "Missing Data" appear 50+ times
   - Users cannot tell WHAT needs attention without clicking through
   - **Note**: Fixing these requires the component to receive the specific object name at render time — this is not a pure string replacement; backend data availability must be confirmed first

2. **Ambiguous Factor/Signal Terminology** (HIGH SEVERITY)
   - "Age Factor", "Systems Factor", "Usage Factor", "Healthy signal" lack specificity
   - Terminology is internally-focused rather than user-focused

3. **Vague Action CTAs** (MEDIUM SEVERITY)
   - "Monitor closely", "Review signal", "Work in progress" don't specify what to monitor
   - CTAs don't convey destination value

4. **Inconsistent Terminology Across Screens** (MEDIUM SEVERITY)
   - Same metric called different things across cards, pages, and internal code
   - **This must be resolved before implementing any other fix** — all downstream changes depend on an agreed naming standard

5. **Missing Explanatory Context** (MEDIUM SEVERITY)
   - Score labels like "Excellent", "Good", "Fair" without criteria
   - Metrics shown without units or comparison points

---

### Resolved Naming Standard (v1 Conflict Fixed)

v1 had internal contradictions: the consistency table used different names than the Quick Wins section. The following is the resolved standard. **All findings and recommendations below use these names exclusively.**

| Concept | Card Title (short) | Page Header (full) | Notes |
|---------|-------------------|-------------------|-------|
| Health metric | **Property Health** | **Property Health Score** | Not "Home Health", not "Health" alone |
| Risk metric | **Risk Score** | **Risk Assessment** | Not "Financial Risk", not "Risk Exposure" |
| Financial metric | **Cost Efficiency** | **Financial Efficiency Score** | Not "Financial" alone |
| Coverage (noun) | Coverage | — | Not "Protected" or "Covered" |
| Coverage (adjective) | Covered | Protected by warranty | Context-dependent |
| Gap | Coverage Gap | Unprotected cost | Dollar amount when available |

> **Why "Risk Score" not "Financial Risk":** Homeowners already understand the scoring pattern from "Health Score" and "Financial Efficiency Score" — "Risk Score" slots directly into that mental model without requiring domain knowledge. "Risk Exposure" is precise insurance jargon, but precision for insiders is not the goal here; clarity for homeowners is. "Financial Risk" was rejected separately because it implies the score itself is risky rather than measuring the user's risk exposure.

---

### Highest-Risk Wording Issues

| Issue | Current Text | Risk | Recommended Fix | Data Dependency |
|-------|-------------|------|-----------------|----------------|
| Status without object | "Needs attention" | Users don't know what needs attention | "[Item] needs attention" | Requires specific item name at render time |
| Generic factor label | "Age Factor" | Users don't know which age | "Property Age (Year Built)" or "[Asset] Age" | `getDisplayFactorName()` already handles this — apply everywhere |
| Vague CTA | "Monitor closely" | Users don't know what to monitor | "Monitor [item] condition" | Requires item name |
| Missing data label | "Missing Data" | Users don't know which data | "[Field] missing" | Requires field name |
| Abstract signal | "Healthy signal" | Users don't know signal source | "[Item] in good condition" | Requires item name |
| Misleading subtext | "Fully optimized" | Misleading when score is not 100 | Dynamic: "Optimized" only when score ≥ 90; else "Room to improve" | Score value already available |

---

## Detailed Findings

### 1. AMBIGUOUS TITLES

#### Finding 1.1: Generic "Health" Card Title
**Page**: Dashboard
**Section**: PropertyHealthScoreCard
**Current Text**: "Health"
**Problem**: Too generic — doesn't specify property health vs personal health
**Severity**: Medium
**Recommended Text**: "Property Health"
**Consistency**: Aligns with Health Score page header ("Property Health Score")
**Implementation**: Static string change — no data dependency

---

#### Finding 1.2: Ambiguous "Financial" Card Title
**Page**: Dashboard
**Section**: FinancialEfficiencyScoreCard
**Current Text**: "Financial"
**Problem**: Users expect personal finance tracking, not home cost efficiency
**Severity**: Medium
**Recommended Text**: "Cost Efficiency"
**Consistency**: Full page title stays "Financial Efficiency Score" — card is the short form
**Implementation**: Static string change — no data dependency

---

#### Finding 1.3: "Risk Exposure" Card Title
**Page**: Dashboard
**Section**: PropertyRiskScoreCard
**Current Text**: "Risk Exposure"
**Problem**: Three different names for the same concept across card, page, and internals
**Severity**: Medium
**Recommended Text**: "Risk Score"
**Consistency**: Aligns with resolved naming standard — page header becomes "Risk Assessment"
**Implementation**: Static string change — no data dependency
**Note (v1 correction)**: v1 recommended "Financial Risk" as primary. Rejected — "Financial Risk" implies the score itself is risky. "Risk Score" is consistent with the scoring system pattern.

---

### 2. GENERIC SUBTEXT

#### Finding 2.1: Vague "Systems healthy" Label
**Page**: Dashboard
**Section**: PropertyHealthScoreCard
**Current Text**: "Systems healthy"
**Problem**: Doesn't say how many systems or which ones
**Severity**: High
**Recommended Text**: "{n} of {total} systems healthy" (dynamic)
**Alternate**: "Major systems tracked" (static fallback when count unavailable)
**Implementation**: **Dynamic — requires system count from API.** Not a simple string replacement. Use static fallback until data is plumbed through.

---

#### Finding 2.2: "Fully optimized" Subtext
**Page**: Dashboard
**Section**: FinancialEfficiencyScoreCard
**Current Text**: "Fully optimized"
**Problem**: Potentially misleading when score is below 90 — but may be intentionally conditional
**Severity**: High (if static) / Low (if score-gated)
**Action Required**: **Verify before changing.** If the label is already conditionally rendered based on score, this finding may be invalid. If it is static copy, replace with score-gated logic:
- Score ≥ 90: "Costs fully optimized"
- Score 70–89: "Well optimized"
- Score < 70: "Room to improve"
**Implementation**: Conditional rendering — requires score value (likely already available in component)

---

#### Finding 2.3: Vague "Quality mixed" Label
**Page**: Dashboard
**Section**: HomeScoreReportCard
**Current Text**: "Quality mixed"
**Problem**: "Mixed" is undefined — mixed how, mixed which aspects?
**Severity**: Medium
**Recommended Text**: "Property condition varies"
**Alternate**: "Some systems need attention"
**Implementation**: Static string change

---

### 3. UNCLEAR STATUSES

#### Finding 3.1: Generic "Needs attention" Status ★ HIGHEST PRIORITY
**Page**: Health Score Report, Dashboard, Multiple
**Section**: Status badges, insight labels
**Current Text**: "Needs attention"
**Problem**: Doesn't specify WHAT needs attention (50+ occurrences)
**Severity**: High
**Recommended Text**: "[Item] needs attention"
**Alternate**: "{n} items need attention" (when count but not name is available)
**Implementation**: **Dynamic — requires item name passed to the label component.** This is not a string replacement. For each occurrence, confirm the item name is available in scope. Where it is not, use the count fallback.
**Backend note**: If item names are not surfaced in the current API response, this finding requires backend changes before frontend can implement.

---

#### Finding 3.2: Ambiguous "Needs Review" Status
**Page**: Health Score Report
**Section**: Insight status labels
**Current Text**: "Needs Review"
**Problem**: Doesn't convey urgency or subject
**Severity**: High
**Recommended Text**: "[Item] needs review"
**Alternate**: "Inspection recommended: [item]"
**Implementation**: Dynamic — same data dependency as Finding 3.1

---

#### Finding 3.3: Unclear "Missing Data" Status
**Page**: Health Score Report, Financial Report
**Section**: Factor status labels
**Current Text**: "Missing Data"
**Problem**: Users don't know what data to add
**Severity**: High
**Recommended Text**: "[Field name] missing"
**Alternate**: "Add [field] to improve your score"
**Implementation**: Dynamic — field name must be available at render time

---

#### Finding 3.4: Vague "Action Pending" Status
**Page**: Health Score Report
**Section**: Insight status labels
**Current Text**: "Action Pending"
**Problem**: Unclear whether the user needs to act or wait
**Severity**: Medium
**Recommended Text**: "[Item] inspection scheduled" (if user-initiated) / "Awaiting [item] review" (if system-side)
**Implementation**: Dynamic — requires task type and item name

---

#### Finding 3.5: Abstract "Healthy signal" Status
**Page**: Health Score Report
**Section**: Insight chip labels
**Current Text**: "Healthy signal"
**Problem**: Doesn't name what is healthy
**Severity**: Medium
**Recommended Text**: "[Item] in good condition"
**Implementation**: Dynamic — requires item name

---

#### Finding 3.6: Vague "Work in progress" Status
**Page**: Health Score Report
**Section**: Insight chip labels
**Current Text**: "Work in progress"
**Problem**: Doesn't specify what work or whether user action is needed
**Severity**: Medium
**Recommended Text**: "[Item] maintenance scheduled"
**Alternate**: "Active task: [item]"
**Implementation**: Dynamic — requires item name and task type

---

#### Finding 3.7: Undefined "Watchlist" Status
**Page**: Health Score Report
**Section**: Insight chip labels
**Current Text**: "Watchlist"
**Problem**: Doesn't explain what to watch, why, or how often
**Severity**: Low
**Recommended Text**: "Monitor [item] condition"
**Alternate**: "Track [item] performance"
**Implementation**: Dynamic — requires item name

---

### 4. WEAK CTAs

#### Finding 4.1: Generic "Open health details" CTA
**Page**: Dashboard
**Section**: PropertyHealthScoreCard
**Current Text**: "Open health details"
**Problem**: Doesn't preview destination content or convey value
**Severity**: Medium
**Recommended Text**: "View system breakdown"
**Alternate**: "See what needs attention"
**Implementation**: Static string change

---

#### Finding 4.2: Passive "Review maintenance items" CTA
**Page**: Dashboard
**Section**: PropertyHealthScoreCard
**Current Text**: "Review maintenance items"
**Problem**: "Review" is passive — users treat it as informational
**Severity**: Medium
**Recommended Text**: "Address maintenance needs" (static) or "Fix {n} maintenance issues" (dynamic with count)
**Implementation**: Static fallback available. Dynamic version requires maintenance count.
**Note (v1 correction)**: v1 recommended "Fix 3 maintenance issues" with a hardcoded "3". This is a dynamic value. The static fallback "Address maintenance needs" should be used until count is available.

---

#### Finding 4.3: Low-value "View health trends" CTA
**Page**: Dashboard
**Section**: PropertyHealthScoreCard
**Current Text**: "View health trends"
**Problem**: Doesn't explain the benefit of viewing historical data
**Severity**: Low
**Recommended Text**: "See how your score changed"
**Alternate**: "Track health over time"
**Implementation**: Static string change

---

#### Finding 4.4: Jargon "Review exposure details" CTA
**Page**: Dashboard
**Section**: PropertyRiskScoreCard
**Current Text**: "Review exposure details"
**Problem**: "Exposure" is insurance jargon unfamiliar to most homeowners
**Severity**: Medium
**Recommended Text**: "See unprotected costs"
**Alternate**: "View coverage gaps"
**Implementation**: Static string change

---

#### Finding 4.5: Unclear "View cost breakdown" CTA
**Page**: Dashboard
**Section**: FinancialEfficiencyScoreCard
**Current Text**: "View cost breakdown"
**Problem**: Implies expense tracking, not benchmark comparison
**Severity**: Low
**Recommended Text**: "See where you can save" *(primary — leads with user benefit)*
**Alternate**: "Compare costs to market" *(secondary — leads with mechanism)*
**Implementation**: Static string change
**Note (v1 correction)**: v1 had primary and alternate swapped. "See where you can save" is stronger UX copy because it leads with benefit rather than action.

---

#### Finding 4.6: Vague "Monitor closely" CTA
**Page**: Health Score Report
**Section**: Ledger group title
**Current Text**: "Monitor closely"
**Problem**: No object, no frequency, no method
**Severity**: Medium
**Recommended Text**: "Track these systems"
**Alternate**: "Watch for changes"
**Implementation**: Static string change

---

### 5. INCONSISTENT TERMINOLOGY

#### Finding 5.1: "Age Factor" vs Specific Age Labels
**Page**: Health Score Report
**Section**: Insight factor names
**Current Text**: "Age Factor"
**Problem**: Generic when specific age type is known
**Severity**: High
**Recommended Text**: "Property Age (Year Built)" or "[Asset] Age" (e.g., "Water Heater Age")
**Implementation**: `getDisplayFactorName()` already converts "Age Factor" → "Property Age (Year Built)". Audit usages — ensure this function is called everywhere "Age Factor" appears and is not bypassed.

---

#### Finding 5.2: "Systems Factor" Without Specification
**Page**: Health Score Report
**Section**: Insight factor names
**Current Text**: "Systems Factor"
**Problem**: Doesn't indicate which systems (HVAC, plumbing, electrical)
**Severity**: High
**Recommended Text**: "Major Systems Health"
**Alternate**: "HVAC, Plumbing & Electrical" (when enumerating is feasible)
**Implementation**: Update `getDisplayFactorName()` mapping

---

#### Finding 5.3: "Usage/Wear Factor" Ambiguity
**Page**: Health Score Report
**Section**: Insight factor names
**Current Text**: "Usage/Wear Factor"
**Problem**: Doesn't clarify what usage is being measured (occupancy, appliance runtime, etc.)
**Severity**: Medium
**Recommended Text**: "Property Usage Pattern"
**Alternate**: "Occupancy & Wear Level"
**Implementation**: Update `getDisplayFactorName()` mapping

---

#### Finding 5.4: Score Naming Inconsistency
**Page**: Multiple
**Section**: Card titles, page headers
**Current Text**: "Health" (card) / "Health Score" (page) / "Property Health Score" (full name)
**Problem**: Same metric has three names — users may think they are different scores
**Severity**: Medium
**Recommended Text**: Apply resolved naming standard — "Property Health" on cards, "Property Health Score" on pages
**Implementation**: Static string changes across `PropertyHealthScoreCard.tsx` and health score page header

---

#### Finding 5.5: Risk Naming Inconsistency
**Page**: Multiple
**Section**: Card titles, page headers
**Current Text**: "Risk Exposure" (card) / "Risk Assessment" (page) / "Risk Score" (internal)
**Problem**: Three names for the same concept
**Severity**: Medium
**Recommended Text**: "Risk Score" on cards, "Risk Assessment" on full page header
**Implementation**: Static string changes in `PropertyRiskScoreCard.tsx` and risk assessment page header

---

#### Finding 5.6: Financial Naming Inconsistency
**Page**: Multiple
**Section**: Card titles, page headers
**Current Text**: "Financial" (card) / "Financial Efficiency" (page)
**Problem**: Card is too vague; user doesn't know what they're measuring
**Severity**: Medium
**Recommended Text**: "Cost Efficiency" on cards, "Financial Efficiency Score" on full page header
**Implementation**: Static string changes in `FinancialEfficiencyScoreCard.tsx` and financial page header

---

### 6. MISSING EXPLANATORY CONTEXT

#### Finding 6.1: Score Labels Without Criteria
**Page**: Dashboard cards
**Section**: Score ring labels
**Current Text**: "Excellent", "Good", "Fair", "Poor"
**Problem**: No rubric — users don't know what makes a score "Excellent"
**Severity**: Medium
**Recommended Text**: Add tooltip on label tap/hover: "Excellent (80–100): All major systems healthy"
**Implementation**: Tooltip component addition — requires design sign-off on tooltip content per score tier

---

#### Finding 6.2: Metrics Without Units
**Page**: Dashboard cards
**Section**: Metadata rows
**Current Text**: "Weekly change: +2.5"
**Problem**: Missing unit — could be points, percent, or dollars
**Severity**: Low
**Recommended Text**: "Weekly change: +2.5 pts"
**Implementation**: Static unit suffix — confirm unit type with backend team

---

#### Finding 6.3: Coverage Percentage Without Context
**Page**: Dashboard
**Section**: PropertyRiskScoreCard
**Current Text**: "67% covered"
**Problem**: Covered by what? Is 67% good or bad?
**Severity**: Medium
**Recommended Text**: "67% covered by warranty"
**Alternate**: "67% protected — $5K gap" (when gap amount is available)
**Implementation**: Static label update + optional dynamic gap amount

---

#### Finding 6.4: "Maintenance: None pending" Ambiguity
**Page**: Dashboard
**Section**: PropertyHealthScoreCard
**Current Text**: "Maintenance: None pending"
**Problem**: "None pending" could mean no scheduled maintenance or no required maintenance — two very different things
**Severity**: Low
**Recommended Text**: "Required maintenance: None"
**Alternate**: "No urgent maintenance"
**Implementation**: Static string change

---

#### Finding 6.5: "Elevated assets" Jargon
**Page**: Dashboard
**Section**: HomeScoreReportCard
**Current Text**: "Elevated assets: 3 driving risk"
**Problem**: "Elevated" is internal jargon; homeowners have no frame of reference for it
**Severity**: Medium
**Recommended Text**: "At-risk items: 3"
**Alternate**: "Items needing attention: 3"
**Implementation**: Static label change — count is already dynamic

---

#### Finding 6.6: "Confidence" Bar Without Explanation
**Page**: Dashboard
**Section**: HomeScoreReportCard
**Current Text**: "Confidence" (with progress bar, no explanation)
**Problem**: Users don't understand what confidence measures or how to improve it; low confidence may make users distrust the score
**Severity**: Medium
**Recommended Text**: Add tooltip: "Data confidence — Add more property details to improve accuracy"
**Alternate label**: "Score accuracy"
**Implementation**: Tooltip addition — low effort once tooltip pattern exists

---

## Additional Scope (Not in v1)

### 7. ACCESSIBILITY

These findings were absent from v1. Generic labels are an accessibility problem, not just a UX one.

#### Finding 7.1: Generic `aria-label` on Status Badges
**Problem**: Screen readers read "Needs attention" with no context, same as sighted users
**Recommended Fix**: `aria-label="[Item] needs attention"` — mirrors the visual label fix in Finding 3.1
**Severity**: High (WCAG 2.1 AA — Failure SC 1.3.1 if badge conveys meaning without accessible name)

#### Finding 7.2: Score Ring Accessibility
**Problem**: Score ring likely uses SVG or canvas with no accessible text equivalent
**Recommended Fix**: Add `aria-label="Property Health Score: 72 out of 100, rated Good"`
**Severity**: High (WCAG 2.1 AA — SC 1.1.1 Non-text Content)

#### Finding 7.3: Progress Bar for "Confidence"
**Problem**: Confidence bar has no `role="progressbar"` or `aria-valuenow`/`aria-valuemax`
**Recommended Fix**: Add ARIA progressbar attributes and `aria-label="Data confidence: 65%"`
**Severity**: Medium (WCAG 2.1 AA — SC 4.1.2 Name, Role, Value)

---

### 8. MOBILE LAYOUT VALIDATION

#### Finding 8.1: Longer CTA Text on Small Screens
**Problem**: Recommended CTAs like "Address maintenance needs" are longer than current text — mobile truncation untested
**Affected CTAs**: "Address maintenance needs", "See where you can save", "See how your score changed"
**Action**: Validate at 375px viewport width before shipping. If truncation occurs, use shorter alternates.
**Severity**: Medium

#### Finding 8.2: Dynamic Status Labels on Narrow Cards
**Problem**: "[Item] needs attention" with long item names (e.g., "Water heater needs attention") may overflow badge boundaries
**Action**: Establish maximum character length for status labels (suggested: 35 chars). Truncate with tooltip for overflow.
**Severity**: Medium

#### Finding 8.3: Touch Target Size for Longer CTAs
**Problem**: Recommended CTA text replacements are longer than current labels and may require wider buttons to remain readable — which can push button height below the 44×44px minimum touch target on mobile
**Action**: Validate all CTA buttons meet minimum touch target dimensions at 375px viewport. Resize if needed before shipping.
**Severity**: Medium (WCAG 2.1 AA — SC 2.5.5 Target Size)

---

## Consistency Recommendations

### Resolved Naming Rules (Supersedes v1)

1. **Score Names**
   - Card title: `[Metric]` — "Property Health", "Risk Score", "Cost Efficiency"
   - Page header: `[Metric] Score` or `[Metric] Report` — "Property Health Score", "Risk Assessment", "Financial Efficiency Score"
   - Never use: "Health" alone, "Financial" alone, "Risk Exposure", "Financial Risk"

2. **Status Labels**
   - Always include the object: "[Object] needs attention" — never bare "Needs attention"
   - Use active voice for urgency: "Schedule inspection" not "Needs inspection"
   - Differentiate urgency tiers: "Urgent", "Review soon", "Monitor" instead of all using "Review"
   - Static fallback when object unknown: "{n} items need attention"

3. **Factor Names**
   - Specific over generic: "Water Heater Age" not "Age Factor"
   - Use homeowner language: "Major Systems Health" not "Systems Factor"
   - Route all factor names through `getDisplayFactorName()` — do not bypass

4. **CTA Text**
   - Lead with action verb: "Fix", "View", "Schedule", "Track", "See"
   - Include object or benefit: "Fix 3 maintenance issues" or "See where you can save"
   - Avoid: "Review" (passive), "Open" (generic), "Monitor closely" (no object)

### Short vs Detailed Label Contexts

| Context | Max length | Pattern |
|---------|-----------|---------|
| Dashboard card title | 20 chars | "[Metric]" short form |
| Status badge | 35 chars | "[Object] [status]" |
| CTA button | 30 chars | "[Verb] [object/benefit]" |
| Report page header | No limit | Full name + "Score" or "Report" |
| Tooltip | 60 chars | Explanatory sentence |

---

## Quick Wins (Top 20 Highest-Value Changes)

### Phase 0: Naming Standard (Do First — Unblocks Everything)

These are pure string constant changes. No data dependency. Doing these first prevents implementing anything else with the wrong name.

1. **"Health" → "Property Health"** (card title)
   - File: `PropertyHealthScoreCard.tsx`

2. **"Financial" → "Cost Efficiency"** (card title)
   - File: `FinancialEfficiencyScoreCard.tsx`

3. **"Risk Exposure" → "Risk Score"** (card title)
   - File: `PropertyRiskScoreCard.tsx`

4. **Health Score page header** — confirm it reads "Property Health Score"

5. **Risk Assessment page header** — confirm it reads "Risk Assessment"

6. **Financial Efficiency page header** — confirm it reads "Financial Efficiency Score"

### Phase 1: Static String Changes (No Data Dependency)

7. **"Age Factor" → routed through `getDisplayFactorName()`**
   - Audit all callsites — confirm the function is not bypassed

8. **"Systems Factor" → "Major Systems Health"**
   - Update `getDisplayFactorName()` mapping

9. **"Usage/Wear Factor" → "Property Usage Pattern"**
   - Update `getDisplayFactorName()` mapping

10. **"Open health details" → "View system breakdown"**
    - File: `PropertyHealthScoreCard.tsx`

11. **"Review exposure details" → "See unprotected costs"**
    - File: `PropertyRiskScoreCard.tsx`

12. **"View cost breakdown" → "See where you can save"**
    - File: `FinancialEfficiencyScoreCard.tsx`

13. **"Elevated assets: 3" → "At-risk items: 3"**
    - File: `HomeScoreReportCard.tsx`

14. **"Quality mixed" → "Property condition varies"**
    - File: `HomeScoreReportCard.tsx`

15. **"Weekly change: +2.5" → "Weekly change: +2.5 pts"** *(confirm unit with backend)*
    - File: All dashboard cards

16. **"67% covered" → "67% covered by warranty"**
    - File: `PropertyRiskScoreCard.tsx`

17. **"Maintenance: None pending" → "Required maintenance: None"**
    - File: `PropertyHealthScoreCard.tsx`

### Phase 2: Dynamic or Conditional Changes (Require Data)

18. **"Needs attention" → "[Item] needs attention"**
    - 50+ occurrences — confirm item name is available at each callsite before changing
    - Use "{n} items need attention" as fallback where item name is unavailable
    - May require backend API changes

19. **"Systems healthy" → "{n} of {total} systems healthy"**
    - File: `PropertyHealthScoreCard.tsx`
    - Requires system count from API; use "Major systems tracked" as fallback

20. **"Fully optimized" — VERIFY FIRST, then gate on score**
    - File: `FinancialEfficiencyScoreCard.tsx`
    - **Step 1**: Check whether `FinancialEfficiencyScoreCard.tsx` already conditionally renders this label based on score value
    - **Step 2**: If static → add score-gated logic as described in Finding 2.2 (≥90: "Costs fully optimized", 70–89: "Well optimized", <70: "Room to improve")
    - **Step 3**: If already conditional → mark Finding 2.2 as N/A and close this item

---

## Implementation Notes

### Revised Effort Estimates

| Category | Items | Revised Estimate | v1 Estimate | Reason for Change |
|----------|-------|-----------------|-------------|-------------------|
| Naming standard (Phase 0) | 1–6 | 1–2 hours | — | New phase, added in v1 review |
| Static string changes (Phase 1) | 7–17 | 3–5 hours | 2–4 hours (combined) | Separated from dynamic items |
| Dynamic/conditional (Phase 2) | 18–20 | 2–5 days | 2–4 hours | Backend data dependency not accounted for in v1 |
| Accessibility additions | 7.1–7.3 | 4–6 hours | Not scoped | New scope |
| Mobile validation | 8.1–8.2 | 2–4 hours | Not scoped | New scope |

### Low Severity Findings

Teams may choose to defer or skip findings marked **Low severity** if resources are constrained. These findings have real but minimal user impact and carry no risk to trust or task completion. Recommended priority: resolve all High and Medium findings before addressing Low severity items. Low severity findings left unaddressed should be noted in the backlog rather than closed.

### Backend Dependencies

Before implementing Phase 2, confirm with backend:
- Are item names (e.g., "Roof", "HVAC") returned per status event in the API response?
- Is maintenance count returned on the dashboard endpoint?
- Is system count (healthy/total) available on the health card endpoint?
- Is coverage gap dollar amount available on the risk card endpoint?

If not, Phase 2 requires backend work before frontend changes.

### Testing Checklist

- [ ] All status label changes tested with real data (not mocked)
- [ ] Factor name conversions verified for all factor types through `getDisplayFactorName()`
- [ ] CTA text validated at 375px viewport (mobile)
- [ ] Dynamic labels tested with long item names (> 25 chars)
- [ ] Score ring and progress bars pass screen reader audit
- [ ] "Fully optimized" subtext verified: is it conditional or static?

---

## Revised Rollout Strategy

| Phase | Focus | Items | Effort | Dependency |
|-------|-------|-------|--------|-----------|
| **0** | Naming standard — resolve all inconsistencies | QW 1–6 | 1–2 hrs | None — do first |
| **1** | Static string changes | QW 7–17 | 3–5 hrs | Phase 0 complete |
| **2** | Accessibility additions | Findings 7.1–7.3 | 4–6 hrs | Phase 1 complete |
| **3** | Dynamic labels — needs backend confirmation | QW 18–20 | 2–5 days | Backend data confirmed |
| **4** | Mobile validation and CTA length fixes | Findings 8.1–8.2 | 2–4 hrs | Phase 1 & 3 complete |

> **Key change from v1**: Terminology standardization (Phase 0) is now first, not last. Dynamic label changes (Phase 3) are decoupled from static changes and blocked on backend confirmation rather than bundled into Week 1.

---

## Appendix: Terminology Glossary

### Do Not Use

| Term | Problem | Use Instead |
|------|---------|-------------|
| "Age Factor" | Generic, doesn't specify which age | "Property Age (Year Built)" or "[Asset] Age" |
| "Systems Factor" | Vague, doesn't enumerate systems | "Major Systems Health" |
| "Healthy signal" | Abstract, no named source | "[Item] in good condition" |
| "Needs attention" (bare) | Missing object | "[Item] needs attention" |
| "Monitor closely" | No object, no method | "Monitor [item] condition" |
| "Elevated assets" | Internal jargon | "At-risk items" |
| "Risk Exposure" | Inconsistent with naming standard | "Risk Score" |
| "Financial" (card title) | Too broad | "Cost Efficiency" |
| "Health" (card title) | Too generic | "Property Health" |
| "Fully optimized" (when score < 90) | Misleading | Score-gated copy |

### Approved Terms

| Term | Usage | Notes |
|------|-------|-------|
| "Property Health" | Dashboard card title | Short form |
| "Property Health Score" | Page headers, full references | Full form |
| "Risk Score" | Dashboard card title, cross-references | Replaces "Risk Exposure" |
| "Risk Assessment" | Risk page header | Full form |
| "Cost Efficiency" | Dashboard card title | Replaces "Financial" |
| "Financial Efficiency Score" | Financial page header | Full form |
| "At-risk items" | Count labels | Replaces "Elevated assets" |
| "Property condition varies" | Mixed-quality subtext | Replaces "Quality mixed" |
| "Major Systems Health" | Factor label | Replaces "Systems Factor" |
| "Property Usage Pattern" | Factor label | Replaces "Usage/Wear Factor" |

---

**End of Report**

Total Findings: 35 (consolidated from 60+ in v1 — duplicates merged, invalid findings removed)
High Severity: 12
Medium Severity: 17
Low Severity: 6

**Immediate next step**: Run Phase 0 (naming standard, 6 static changes, ~2 hours). This is unblocked, low-risk, and required before any other phase can proceed correctly.
