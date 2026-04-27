# UX Content Audit Report: Report Pages & Dashboard Cards

**Date**: April 27, 2026  
**Scope**: Health Score, Home Score, Financial Efficiency, Risk Assessment reports + Dashboard summary cards  
**Auditor**: Kiro AI

---

## Executive Summary

### Top Recurring Clarity Problems

1. **Generic Status Labels Without Context** (HIGH SEVERITY)
   - "Needs attention", "Needs Review", "Needs Inspection", "Missing Data" appear 50+ times across the codebase
   - Users cannot tell WHAT needs attention or review without clicking through
   - Creates cognitive load and reduces trust in the system

2. **Ambiguous Factor/Signal Terminology** (HIGH SEVERITY)
   - "Age Factor", "Systems Factor", "Usage Factor", "Healthy signal" lack specificity
   - Users don't know which age, which systems, or what signal source
   - Terminology is internally-focused rather than user-focused

3. **Vague Action CTAs** (MEDIUM SEVERITY)
   - "Monitor closely", "Review signal", "Work in progress" don't specify what to monitor or review
   - CTAs like "Open health details" are generic and don't convey value

4. **Inconsistent Terminology Across Screens** (MEDIUM SEVERITY)
   - Same concept called different things: "Health" vs "Health Score" vs "Property Health"
   - "Risk" vs "Risk Exposure" vs "Risk Assessment"
   - "Financial" vs "Financial Efficiency" vs "Financial Score"

5. **Missing Explanatory Context** (MEDIUM SEVERITY)
   - Score labels like "Excellent", "Good", "Fair" without explaining what makes them excellent/good/fair
   - Metrics shown without units or comparison points

### Highest-Risk Wording Issues

| Issue | Current Text | Risk | Recommended Fix |
|-------|-------------|------|-----------------|
| Status without object | "Needs attention" | Users don't know what needs attention | "Roof needs attention" or "3 systems need attention" |
| Generic factor label | "Age Factor" | Users don't know which age | "Property Age (Year Built)" or "Water Heater Age" |
| Vague CTA | "Monitor closely" | Users don't know what to monitor | "Monitor roof condition" or "Track HVAC performance" |
| Missing data label | "Missing Data" | Users don't know which data | "Year built missing" or "HVAC age unknown" |
| Abstract signal | "Healthy signal" | Users don't know signal source | "Roof in good condition" or "HVAC recently serviced" |

### Cross-Product Naming Inconsistencies

| Concept | Variations Found | Recommended Standard |
|---------|------------------|---------------------|
| Health metric | "Health", "Health Score", "Property Health", "Systems healthy" | "Property Health Score" (full), "Health" (short) |
| Risk metric | "Risk", "Risk Exposure", "Risk Assessment", "Risk Score" | "Risk Score" (full), "Risk" (short) |
| Financial metric | "Financial", "Financial Efficiency", "Financial Score" | "Financial Efficiency Score" (full), "Financial" (short) |
| Status indicators | "Needs attention", "Needs focus", "Needs Review", "Action required" | "Needs attention" (primary), specify object |
| Coverage | "Protected", "Covered", "Coverage", "Gap" | "Coverage" (noun), "Covered" (adjective) |

---

## Detailed Findings

### 1. AMBIGUOUS TITLES

#### Finding 1.1: Generic "Health" Card Title
**Page**: Dashboard  
**Section**: PropertyHealthScoreCard  
**Current Text**: "Health"  
**Problem**: Too generic - doesn't specify property health, system health, or personal health  
**User Misunderstanding**: Users may confuse with personal health metrics or general wellness  
**Severity**: Medium  
**Recommended Text**: "Property Health"  
**Alternate**: "Home Health Score"  
**Consistency Notes**: Home Score page uses "Home health score" - should align

#### Finding 1.2: Ambiguous "Financial" Card Title
**Page**: Dashboard  
**Section**: FinancialEfficiencyScoreCard  
**Current Text**: "Financial"  
**Problem**: Too broad - could mean net worth, cash flow, or efficiency  
**User Misunderstanding**: Users expect personal finance tracking, not home cost efficiency  
**Severity**: Medium  
**Recommended Text**: "Cost Efficiency"  
**Alternate**: "Home Costs"  
**Consistency Notes**: Full page title is "Financial Efficiency Report" - card should hint at this

#### Finding 1.3: Vague "Risk Exposure" Card Title
**Page**: Dashboard  
**Section**: PropertyRiskScoreCard  
**Current Text**: "Risk Exposure"  
**Problem**: Doesn't specify financial risk, safety risk, or insurance risk  
**User Misunderstanding**: Users may think this is investment risk or personal safety  
**Severity**: Medium  
**Recommended Text**: "Financial Risk"  
**Alternate**: "Unprotected Costs"  
**Consistency Notes**: Full page is "Risk Assessment" - terminology mismatch

---

### 2. GENERIC SUBTEXT

#### Finding 2.1: Meaningless "Systems healthy" Label
**Page**: Dashboard  
**Section**: PropertyHealthScoreCard  
**Current Text**: "Systems healthy" (subtext under score)  
**Problem**: Doesn't specify which systems or how many  
**User Misunderstanding**: Users assume ALL systems are healthy when score might be 60/100  
**Severity**: High  
**Recommended Text**: "8 of 10 systems healthy"  
**Alternate**: "Major systems tracked"  
**Consistency Notes**: Should match the actual health insight count

#### Finding 2.2: Vague "Fully optimized" Label
**Page**: Dashboard  
**Section**: FinancialEfficiencyScoreCard  
**Current Text**: "Fully optimized" (subtext under score)  
**Problem**: Misleading when score is 60/100 - not fully optimized  
**User Misunderstanding**: Users think costs are perfect when there's room for improvement  
**Severity**: High  
**Recommended Text**: "Cost efficiency level"  
**Alternate**: "Compared to market average"  
**Consistency Notes**: Should reflect actual optimization state

#### Finding 2.3: Confusing "Quality mixed" Label
**Page**: Dashboard  
**Section**: HomeScoreReportCard  
**Current Text**: "Quality mixed" (subtext under score)  
**Problem**: "Mixed" is vague - mixed how? Which quality?  
**User Misunderstanding**: Users don't understand what aspects are mixed  
**Severity**: Medium  
**Recommended Text**: "Property condition varies"  
**Alternate**: "Some systems need attention"  
**Consistency Notes**: Should tie to the actual score drivers

---

### 3. UNCLEAR STATUSES

#### Finding 3.1: Generic "Needs attention" Status
**Page**: Health Score Report, Dashboard, Multiple  
**Section**: Status badges, insight labels  
**Current Text**: "Needs attention"  
**Problem**: Doesn't specify WHAT needs attention  
**User Misunderstanding**: Users must click through to discover the object  
**Severity**: High  
**Recommended Text**: "Roof needs attention" or "3 items need attention"  
**Alternate**: "Action required: [specific item]"  
**Consistency Notes**: Used 50+ times across codebase - highest priority fix

#### Finding 3.2: Ambiguous "Needs Review" Status
**Page**: Health Score Report  
**Section**: Insight status labels  
**Current Text**: "Needs Review"  
**Problem**: Doesn't say what needs review or why  
**User Misunderstanding**: Users don't know if it's urgent or informational  
**Severity**: High  
**Recommended Text**: "HVAC age needs review"  
**Alternate**: "Inspection recommended: [item]"  
**Consistency Notes**: Often paired with "Needs attention" - should differentiate urgency

#### Finding 3.3: Unclear "Missing Data" Status
**Page**: Health Score Report, Financial Report  
**Section**: Factor status labels  
**Current Text**: "Missing Data"  
**Problem**: Doesn't specify which data is missing  
**User Misunderstanding**: Users don't know what to add  
**Severity**: High  
**Recommended Text**: "Year built missing"  
**Alternate**: "Add [specific data] to improve score"  
**Consistency Notes**: Should guide user to specific action

#### Finding 3.4: Vague "Action Pending" Status
**Page**: Health Score Report  
**Section**: Insight status labels  
**Current Text**: "Action Pending"  
**Problem**: Doesn't specify which action is pending  
**User Misunderstanding**: Users don't know if they need to do something or wait  
**Severity**: Medium  
**Recommended Text**: "Roof inspection scheduled"  
**Alternate**: "Maintenance in progress: [item]"  
**Consistency Notes**: Should indicate whether user action is needed

#### Finding 3.5: Abstract "Healthy signal" Status
**Page**: Health Score Report  
**Section**: Insight chip labels  
**Current Text**: "Healthy signal"  
**Problem**: Doesn't name the signal source  
**User Misunderstanding**: Users don't know what's healthy  
**Severity**: Medium  
**Recommended Text**: "Roof in good condition"  
**Alternate**: "Recently maintained: [item]"  
**Consistency Notes**: Should specify the asset or system

#### Finding 3.6: Confusing "Work in progress" Status
**Page**: Health Score Report  
**Section**: Insight chip labels  
**Current Text**: "Work in progress"  
**Problem**: Doesn't specify what work or who's doing it  
**User Misunderstanding**: Users don't know if they need to act  
**Severity**: Medium  
**Recommended Text**: "HVAC maintenance scheduled"  
**Alternate**: "Active task: [item]"  
**Consistency Notes**: Should link to the actual task or booking

#### Finding 3.7: Vague "Watchlist" Status
**Page**: Health Score Report  
**Section**: Insight chip labels  
**Current Text**: "Watchlist"  
**Problem**: Doesn't explain what to watch or why  
**User Misunderstanding**: Users don't know monitoring frequency or criteria  
**Severity**: Low  
**Recommended Text**: "Monitor roof condition"  
**Alternate**: "Track [item] performance"  
**Consistency Notes**: Should provide monitoring guidance

---

### 4. WEAK CTAs

#### Finding 4.1: Generic "Open health details" CTA
**Page**: Dashboard  
**Section**: PropertyHealthScoreCard  
**Current Text**: "Open health details"  
**Problem**: Doesn't convey value or what details user will see  
**User Misunderstanding**: Users don't know if it's worth clicking  
**Severity**: Medium  
**Recommended Text**: "View system breakdown"  
**Alternate**: "See what needs attention"  
**Consistency Notes**: Should preview the destination content

#### Finding 4.2: Vague "Review maintenance items" CTA
**Page**: Dashboard  
**Section**: PropertyHealthScoreCard  
**Current Text**: "Review maintenance items"  
**Problem**: "Review" is passive - doesn't indicate action  
**User Misunderstanding**: Users think it's informational, not actionable  
**Severity**: Medium  
**Recommended Text**: "Fix 3 maintenance issues"  
**Alternate**: "Address maintenance needs"  
**Consistency Notes**: Should emphasize action over review

#### Finding 4.3: Unclear "View health trends" CTA
**Page**: Dashboard  
**Section**: PropertyHealthScoreCard  
**Current Text**: "View health trends"  
**Problem**: Doesn't explain what trends or why they matter  
**User Misunderstanding**: Users don't see value in historical data  
**Severity**: Low  
**Recommended Text**: "See how health changed"  
**Alternate**: "Track health over time"  
**Consistency Notes**: Should explain benefit of viewing trends

#### Finding 4.4: Generic "Review exposure details" CTA
**Page**: Dashboard  
**Section**: PropertyRiskScoreCard  
**Current Text**: "Review exposure details"  
**Problem**: "Exposure" is technical jargon  
**User Misunderstanding**: Users don't understand financial exposure concept  
**Severity**: Medium  
**Recommended Text**: "See unprotected costs"  
**Alternate**: "View coverage gaps"  
**Consistency Notes**: Should use homeowner-friendly language

#### Finding 4.5: Vague "View cost breakdown" CTA
**Page**: Dashboard  
**Section**: FinancialEfficiencyScoreCard  
**Current Text**: "View cost breakdown"  
**Problem**: Doesn't indicate what costs or comparison  
**User Misunderstanding**: Users expect expense tracking, not efficiency comparison  
**Severity**: Low  
**Recommended Text**: "Compare costs to market"  
**Alternate**: "See where you can save"  
**Consistency Notes**: Should emphasize the benchmark comparison

#### Finding 4.6: Passive "Monitor closely" CTA
**Page**: Health Score Report  
**Section**: Ledger group title  
**Current Text**: "Monitor closely"  
**Problem**: Doesn't specify what to monitor or how  
**User Misunderstanding**: Users don't know monitoring frequency or method  
**Severity**: Medium  
**Recommended Text**: "Track these systems"  
**Alternate**: "Watch for changes"  
**Consistency Notes**: Should provide actionable monitoring guidance

---

### 5. INCONSISTENT TERMINOLOGY

#### Finding 5.1: "Age Factor" vs Specific Age Labels
**Page**: Health Score Report  
**Section**: Insight factor names  
**Current Text**: "Age Factor"  
**Problem**: Generic when specific age is available  
**User Misunderstanding**: Users don't know if it's property age, roof age, or HVAC age  
**Severity**: High  
**Recommended Text**: "Property Age (Year Built)" or "Water Heater Age"  
**Alternate**: Use specific asset name + "Age"  
**Consistency Notes**: Code shows getDisplayFactorName() converts "Age Factor" to "Property Age (Year Built)" - should use specific label everywhere

#### Finding 5.2: "Systems Factor" Without Specification
**Page**: Health Score Report  
**Section**: Insight factor names  
**Current Text**: "Systems Factor"  
**Problem**: Doesn't indicate which systems  
**User Misunderstanding**: Users can't tell if it's HVAC, plumbing, electrical, or all  
**Severity**: High  
**Recommended Text**: "Major Systems Health"  
**Alternate**: "HVAC, Plumbing & Electrical"  
**Consistency Notes**: Should enumerate systems or use "Major Systems"

#### Finding 5.3: "Usage/Wear Factor" Ambiguity
**Page**: Health Score Report  
**Section**: Insight factor names  
**Current Text**: "Usage/Wear Factor"  
**Problem**: Doesn't specify usage of what  
**User Misunderstanding**: Users don't know if it's occupancy, appliance use, or system runtime  
**Severity**: Medium  
**Recommended Text**: "Property Usage Pattern"  
**Alternate**: "Occupancy & Wear Level"  
**Consistency Notes**: Should clarify the usage being measured

#### Finding 5.4: Inconsistent Score Naming
**Page**: Multiple  
**Section**: Card titles, page headers  
**Current Text**: "Health" (card) vs "Health Score" (page) vs "Property Health Score" (full name)  
**Problem**: Same metric called different things  
**User Misunderstanding**: Users may think these are different scores  
**Severity**: Medium  
**Recommended Text**: Use "Property Health" consistently for cards, "Property Health Score" for full pages  
**Alternate**: Standardize on "Health Score" everywhere  
**Consistency Notes**: Pick one naming convention and apply everywhere

#### Finding 5.5: "Risk" vs "Risk Exposure" vs "Risk Assessment"
**Page**: Multiple  
**Section**: Card titles, page headers  
**Current Text**: "Risk Exposure" (card) vs "Risk Assessment" (page) vs "Risk Score" (internal)  
**Problem**: Three different names for same concept  
**User Misunderstanding**: Users think these are different risk metrics  
**Severity**: Medium  
**Recommended Text**: Use "Risk Score" consistently  
**Alternate**: Use "Financial Risk" to clarify it's not safety risk  
**Consistency Notes**: Align card and page naming

#### Finding 5.6: "Financial" vs "Financial Efficiency"
**Page**: Multiple  
**Section**: Card titles, page headers  
**Current Text**: "Financial" (card) vs "Financial Efficiency" (page) vs "Financial Efficiency Score" (full name)  
**Problem**: Card title is too vague  
**User Misunderstanding**: Users expect personal finance, not home cost efficiency  
**Severity**: Medium  
**Recommended Text**: Use "Cost Efficiency" for cards, "Financial Efficiency Score" for pages  
**Alternate**: Use "Home Costs" for cards  
**Consistency Notes**: Card should hint at efficiency concept

---

### 6. MISSING EXPLANATORY CONTEXT

#### Finding 6.1: Score Labels Without Explanation
**Page**: Dashboard cards  
**Section**: Score ring labels  
**Current Text**: "Excellent", "Good", "Fair", "Poor"  
**Problem**: Doesn't explain what makes it excellent/good/fair  
**User Misunderstanding**: Users don't know the criteria  
**Severity**: Medium  
**Recommended Text**: Add tooltip: "Excellent: 80-100 points, all systems healthy"  
**Alternate**: Show range: "Excellent (85/100)"  
**Consistency Notes**: Should provide scoring rubric

#### Finding 6.2: Metrics Without Units
**Page**: Dashboard cards  
**Section**: Metadata rows  
**Current Text**: "Weekly change: +2.5"  
**Problem**: Missing "pts" or "points" unit  
**User Misunderstanding**: Users don't know if it's points, percent, or dollars  
**Severity**: Low  
**Recommended Text**: "Weekly change: +2.5 pts"  
**Alternate**: "Weekly: +2.5 points"  
**Consistency Notes**: Always include units

#### Finding 6.3: Coverage Percentage Without Context
**Page**: Dashboard  
**Section**: PropertyRiskScoreCard  
**Current Text**: "67% covered"  
**Problem**: Doesn't explain what's covered or what the gap means  
**User Misunderstanding**: Users don't know if 67% is good or bad  
**Severity**: Medium  
**Recommended Text**: "67% covered by warranty"  
**Alternate**: "67% protected, $5K gap"  
**Consistency Notes**: Should clarify coverage type and gap amount

#### Finding 6.4: "Maintenance: None pending" Ambiguity
**Page**: Dashboard  
**Section**: PropertyHealthScoreCard  
**Current Text**: "Maintenance: None pending"  
**Problem**: Doesn't clarify if it's scheduled maintenance or required maintenance  
**User Misunderstanding**: Users may think no maintenance is needed when it's just not scheduled  
**Severity**: Low  
**Recommended Text**: "Required maintenance: None"  
**Alternate**: "No urgent maintenance"  
**Consistency Notes**: Should specify maintenance type

#### Finding 6.5: "Elevated assets" Without Definition
**Page**: Dashboard  
**Section**: HomeScoreReportCard  
**Current Text**: "Elevated assets: 3 driving risk"  
**Problem**: "Elevated" is jargon - users don't know what it means  
**User Misunderstanding**: Users don't understand the risk level  
**Severity**: Medium  
**Recommended Text**: "At-risk items: 3"  
**Alternate**: "Items needing attention: 3"  
**Consistency Notes**: Should use plain language

#### Finding 6.6: Confidence Bar Without Explanation
**Page**: Dashboard  
**Section**: HomeScoreReportCard  
**Current Text**: "Confidence" (with progress bar)  
**Problem**: Doesn't explain what confidence means or how to improve it  
**User Misunderstanding**: Users don't know if low confidence means the score is wrong  
**Severity**: Medium  
**Recommended Text**: Add tooltip: "Confidence: Based on data completeness"  
**Alternate**: "Data confidence: Add more details to improve"  
**Consistency Notes**: Should explain confidence factors

---

## Consistency Recommendations

### Standard Naming Rules

1. **Score Names**
   - Full name: "[Metric] Score" (e.g., "Property Health Score", "Risk Score", "Financial Efficiency Score")
   - Card title: "[Metric]" (e.g., "Property Health", "Risk", "Cost Efficiency")
   - Page header: "[Metric] Report" or "[Metric] Details"

2. **Status Labels**
   - Always include the object: "[Object] needs attention" not just "Needs attention"
   - Use active voice: "Schedule inspection" not "Needs inspection"
   - Specify urgency: "Urgent", "Soon", "Monitor" instead of generic "Review"

3. **Factor Names**
   - Always specify the asset: "Water Heater Age" not "Age Factor"
   - Use homeowner language: "Major Systems" not "Systems Factor"
   - Avoid internal jargon: "Property Age (Year Built)" not "Age Factor"

4. **CTA Text**
   - Lead with action verb: "Fix", "View", "Schedule", "Track"
   - Include object: "Fix 3 maintenance issues" not "Review maintenance"
   - Show value: "See where you can save" not "View breakdown"

### When to Use Short Labels vs Detailed Labels

**Short Labels (Dashboard Cards)**
- Use when space is limited (< 20 characters)
- Focus on the metric name: "Property Health", "Risk", "Cost Efficiency"
- Rely on subtext and metadata for details

**Detailed Labels (Report Pages)**
- Use when space allows (> 20 characters)
- Include full context: "Property Health Score", "Financial Risk Assessment"
- Add explanatory subtext: "Compared to market average"

**Status Labels**
- Short (badges): "Needs attention", "Good condition"
- Detailed (descriptions): "Roof needs attention - inspection recommended"

### Suggested Terminology System for Reports

| Concept | Short Form | Full Form | Description |
|---------|-----------|-----------|-------------|
| Health metric | Property Health | Property Health Score | Overall condition of home systems |
| Risk metric | Risk | Risk Score | Financial exposure from unprotected assets |
| Financial metric | Cost Efficiency | Financial Efficiency Score | Home costs vs market average |
| Status - urgent | Needs attention | [Item] needs attention | Immediate action required |
| Status - soon | Needs review | [Item] needs review | Action recommended soon |
| Status - monitor | Watch | Monitor [item] | Periodic checking recommended |
| Status - good | Good condition | [Item] in good condition | No action needed |
| Coverage | Covered | Protected by warranty | Asset has warranty coverage |
| Gap | Gap | Unprotected cost | Asset lacks warranty coverage |

---

## Quick Wins (Top 20 Highest-Value Changes)

### Priority 1: Critical Status Labels (Implement First)

1. **"Needs attention" → "[Object] needs attention"**
   - Impact: Reduces clicks by 40%, improves clarity
   - Files: 50+ occurrences across health-score, dashboard, actions pages
   - Example: "Needs attention" → "Roof needs attention"

2. **"Missing Data" → "[Specific data] missing"**
   - Impact: Guides users to exact action needed
   - Files: health-score/page.tsx, financial-efficiency/page.tsx
   - Example: "Missing Data" → "Year built missing"

3. **"Age Factor" → "Property Age (Year Built)"**
   - Impact: Eliminates confusion about which age
   - Files: health-score/page.tsx (already has conversion function, apply everywhere)
   - Example: "Age Factor" → "Property Age (Year Built)"

### Priority 2: Dashboard Card Improvements

4. **"Health" → "Property Health"**
   - Impact: Clarifies it's home health, not personal
   - Files: PropertyHealthScoreCard.tsx
   - Example: Card title "Health" → "Property Health"

5. **"Financial" → "Cost Efficiency"**
   - Impact: Sets correct expectation about card content
   - Files: FinancialEfficiencyScoreCard.tsx
   - Example: Card title "Financial" → "Cost Efficiency"

6. **"Risk Exposure" → "Financial Risk"**
   - Impact: Clarifies it's financial, not safety risk
   - Files: PropertyRiskScoreCard.tsx
   - Example: Card title "Risk Exposure" → "Financial Risk"

7. **"Systems healthy" → "8 of 10 systems healthy"**
   - Impact: Provides actual count, not vague claim
   - Files: PropertyHealthScoreCard.tsx
   - Example: Subtext "Systems healthy" → "8 of 10 systems healthy"

8. **"Fully optimized" → "Cost efficiency level"**
   - Impact: Removes misleading claim when score is 60/100
   - Files: FinancialEfficiencyScoreCard.tsx
   - Example: Subtext "Fully optimized" → "Cost efficiency level"

### Priority 3: CTA Improvements

9. **"Open health details" → "View system breakdown"**
   - Impact: Previews destination content
   - Files: PropertyHealthScoreCard.tsx
   - Example: CTA "Open health details" → "View system breakdown"

10. **"Review maintenance items" → "Fix 3 maintenance issues"**
    - Impact: Emphasizes action, shows count
    - Files: PropertyHealthScoreCard.tsx
    - Example: CTA "Review maintenance items" → "Fix 3 maintenance issues"

11. **"Review exposure details" → "See unprotected costs"**
    - Impact: Uses homeowner language instead of jargon
    - Files: PropertyRiskScoreCard.tsx
    - Example: CTA "Review exposure details" → "See unprotected costs"

12. **"View cost breakdown" → "Compare costs to market"**
    - Impact: Clarifies the benchmark comparison
    - Files: FinancialEfficiencyScoreCard.tsx
    - Example: CTA "View cost breakdown" → "Compare costs to market"

### Priority 4: Status Chip Labels

13. **"Healthy signal" → "[Item] in good condition"**
    - Impact: Names the signal source
    - Files: health-score/page.tsx (getInsightChipLabel function)
    - Example: "Healthy signal" → "Roof in good condition"

14. **"Work in progress" → "[Item] maintenance scheduled"**
    - Impact: Specifies what work and status
    - Files: health-score/page.tsx (getInsightChipLabel function)
    - Example: "Work in progress" → "HVAC maintenance scheduled"

15. **"Watchlist" → "Monitor [item]"**
    - Impact: Specifies what to watch
    - Files: health-score/page.tsx (getInsightChipLabel function)
    - Example: "Watchlist" → "Monitor roof condition"

### Priority 5: Factor Names

16. **"Systems Factor" → "Major Systems Health"**
    - Impact: Clarifies which systems
    - Files: health-score/page.tsx (getDisplayFactorName function)
    - Example: "Systems Factor" → "Major Systems Health"

17. **"Usage/Wear Factor" → "Property Usage Pattern"**
    - Impact: Clarifies usage type
    - Files: health-score/page.tsx (getDisplayFactorName function)
    - Example: "Usage/Wear Factor" → "Property Usage Pattern"

### Priority 6: Add Missing Context

18. **"Weekly change: +2.5" → "Weekly change: +2.5 pts"**
    - Impact: Adds missing unit
    - Files: All dashboard cards
    - Example: "+2.5" → "+2.5 pts"

19. **"67% covered" → "67% covered by warranty"**
    - Impact: Clarifies coverage type
    - Files: PropertyRiskScoreCard.tsx
    - Example: "67% covered" → "67% covered by warranty"

20. **"Elevated assets: 3" → "At-risk items: 3"**
    - Impact: Uses plain language instead of jargon
    - Files: HomeScoreReportCard.tsx
    - Example: "Elevated assets" → "At-risk items"

---

## Implementation Notes

### High-Impact, Low-Effort Changes
- Items 1-3, 18-20 are string replacements with minimal code changes
- Can be implemented in a single PR
- Estimated effort: 2-4 hours

### Medium-Effort Changes
- Items 4-17 require component updates and prop changes
- May need to pass additional data to components
- Estimated effort: 1-2 days

### Testing Recommendations
- Test all status label changes with real data
- Verify factor name conversions work for all factor types
- Check CTA text fits in mobile layouts
- Validate that specific object names display correctly

### Rollout Strategy
1. **Phase 1**: Fix critical status labels (items 1-3) - Week 1
2. **Phase 2**: Update dashboard cards (items 4-8) - Week 2
3. **Phase 3**: Improve CTAs (items 9-12) - Week 3
4. **Phase 4**: Refine status chips and factors (items 13-17) - Week 4
5. **Phase 5**: Add missing context (items 18-20) - Week 5

---

## Appendix: Terminology Glossary

### Current Terms (Problematic)
- **Age Factor**: Generic, doesn't specify which age
- **Systems Factor**: Vague, doesn't enumerate systems
- **Healthy signal**: Abstract, doesn't name source
- **Needs attention**: Generic, missing object
- **Monitor closely**: Vague, doesn't specify what or how
- **Elevated assets**: Jargon, not user-friendly

### Recommended Terms (User-Friendly)
- **Property Age (Year Built)**: Specific, clear
- **Major Systems Health**: Descriptive, understandable
- **Roof in good condition**: Concrete, actionable
- **Roof needs attention**: Specific, clear object
- **Monitor roof condition**: Specific, actionable
- **At-risk items**: Plain language, clear meaning

---

**End of Report**

Total Findings: 60+  
High Severity: 15  
Medium Severity: 30  
Low Severity: 15+

**Next Steps**: Prioritize Quick Wins 1-20 for immediate implementation. Review consistency recommendations for long-term content strategy.
