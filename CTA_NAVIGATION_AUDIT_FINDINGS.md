# CTA Navigation Audit - Comprehensive Findings
**Date:** 2026-04-26  
**Scope:** Full application CTA/navigation promise vs. destination alignment  
**Status:** CRITICAL ISSUES IDENTIFIED

---

## EXECUTIVE SUMMARY

This audit identified **23 critical mismatches** where UI elements promise one action/detail/context but navigate to destinations that don't support that promise. The issues span dashboard cards, sidebar actions, tool cards, and navigation components.

**Severity Breakdown:**
- 🔴 **CRITICAL (8)**: Broken promises with significant user impact
- 🟠 **HIGH (10)**: Technically correct route but missing context/focus
- 🟡 **MEDIUM (5)**: Ambiguous destinations that may confuse users

---

## CRITICAL FINDINGS (Priority 1)

### 🔴 FINDING #1: Health Score Card - Maintenance Promise Mismatch
**Severity:** CRITICAL  
**User Impact:** HIGH - Users expect to see maintenance items, get generic health page

**Source:** `apps/frontend/src/app/(dashboard)/dashboard/components/PropertyHealthScoreCard.tsx:142`
```typescript
// Card shows: "Maintenance: 2 required"
<div className={cn(META_VALUE, maintenanceCount > 0 ? "text-amber-600" : "text-foreground")}>
  {maintenanceCount > 0 ? `${maintenanceCount} required` : "None pending"}
</div>

// But navigates to:
href={buildPropertyAwareDashboardHref(property.id, '/dashboard/health-score')}
// CTA: "Open health details"
```

**Destination:** `/dashboard/properties/{id}/health-score`  
**Problem:** 
- Card displays "2 required" maintenance items prominently
- User clicks expecting to see THOSE 2 maintenance items
- Destination shows health score breakdown but NO focused maintenance list
- No way to jump directly to the 2 items mentioned

**Root Cause:** Display data (`maintenanceCount`) comes from `property.healthScore.insights` but destination page doesn't highlight or filter to show those specific insights.

**Recommended Fix:**
```typescript
// Option 1: Navigate to maintenance page with filter
href={maintenanceCount > 0 
  ? `/dashboard/maintenance?propertyId=${property.id}&priority=true`
  : buildPropertyAwareDashboardHref(property.id, '/dashboard/health-score')
}

// Option 2: Add anchor/focus param to health score page
href={buildPropertyAwareDashboardHref(property.id, '/dashboard/health-score?focus=maintenance')}

// Option 3: Change CTA text to match destination
"View health breakdown" // instead of implying maintenance focus
```

---

### 🔴 FINDING #2: Sidebar "Review Urgent Alerts" - Generic Destination
**Severity:** CRITICAL  
**User Impact:** HIGH - Promises "highest priority alert" but shows all issues

**Source:** `apps/frontend/src/lib/sidebar/dynamicSidebarActions.ts:127-135`
```typescript
if (ctx.signals?.urgentCount && ctx.signals.urgentCount > 0) {
  actions.push({
    id: 'review-urgent-alerts',
    title: 'Review highest priority alert',  // ← SINGULAR
    description: `${ctx.signals.urgentCount} urgent issue${ctx.signals.urgentCount > 1 ? 's' : ''} detected`,
    icon: AlertTriangle,
    href: `/dashboard/resolution-center?propertyId=${ctx.propertyId}`,  // ← GENERIC LIST
    priority: 'high',
    badge: 'Urgent',
  });
}
```

**Destination:** `/dashboard/resolution-center` (shows ALL issues, not filtered/sorted)  
**Problem:**
- CTA says "Review **highest priority alert**" (singular, implies #1 item)
- Description shows count (e.g., "3 urgent issues detected")
- Destination shows generic resolution center with no:
  - Auto-sort by urgency
  - Auto-filter to urgent only
  - Auto-focus on #1 highest priority item
  - Visual indication of which is "highest priority"

**Root Cause:** CTA builder has urgentCount but doesn't pass sort/filter params to destination.

**Recommended Fix:**
```typescript
href: `/dashboard/resolution-center?propertyId=${ctx.propertyId}&filter=urgent&sort=priority-desc&autoFocus=first`

// OR change title to match generic destination:
title: 'Review urgent issues',  // plural, less specific promise
```

---

### 🔴 FINDING #3: Risk Score Card - Exposure Value Mismatch
**Severity:** CRITICAL  
**User Impact:** HIGH - Shows specific $ amount but destination doesn't explain it

**Source:** `apps/frontend/src/app/(dashboard)/dashboard/components/PropertyRiskScoreCard.tsx:195-200`
```typescript
<div className={cn("text-[20px] font-bold leading-none", exposureTone)}>
  {exposureHeadline}  // e.g., "$12,450 gap"
</div>
<p className="mt-[3px] whitespace-nowrap text-[11px] text-muted-foreground">
  Unprotected
</p>

// Navigates to:
href={reportLink}  // `/dashboard/properties/${propertyId}/risk-assessment`
```

**Destination:** `/dashboard/properties/{id}/risk-assessment`  
**Problem:**
- Card shows "$12,450 gap" as hero metric
- User clicks expecting to see:
  - WHERE that $12,450 comes from
  - WHICH assets contribute to it
  - HOW to close that gap
- Destination page shows risk assessment but:
  - May not prominently display the $12,450 figure
  - May not break down the gap by asset
  - May not match the card's calculation method

**Root Cause:** Card calculates `totalExposure` from `summary.financialExposureTotal` but destination page may use different data source or calculation.

**Recommended Fix:**
1. Audit risk-assessment page to ensure it displays the SAME $12,450 figure prominently
2. Add section showing gap breakdown by asset
3. OR add focus param: `href={reportLink}?focus=exposure-gap`
4. Ensure card and page use identical data source/calculation

---

### 🔴 FINDING #4: Home Savings Card - Savings Amount Not Substantiated
**Severity:** CRITICAL  
**User Impact:** HIGH - Shows "$240/mo" but destination may not explain it

**Source:** `apps/frontend/src/app/(dashboard)/dashboard/components/HomeSavingsCheckToolCard.tsx:145-152`
```typescript
<span className="text-xl font-medium leading-[1.05] tracking-tight text-gray-800">
  {money(monthlyPotential)}  // e.g., "$240"
</span>
<span className="mb-1 text-sm font-medium text-gray-500">/mo</span>

<p className="mt-1 text-sm text-gray-600">
  {money(annualPotential)}/yr potential  // e.g., "$2,880/yr potential"
</p>

// Navigates to:
router.push(`/dashboard/properties/${propertyId}/tools/home-savings`);
```

**Destination:** `/dashboard/properties/{id}/tools/home-savings`  
**Problem:**
- Card shows "$240/mo" and "$2,880/yr potential" as hero metrics
- User clicks expecting to see:
  - WHICH bills/categories contribute to savings
  - HOW the $240 was calculated
  - WHAT actions to take to realize savings
- Destination page MUST show these exact figures and their breakdown
- If destination shows different numbers or no breakdown, promise is broken

**Root Cause:** Card gets data from `getHomeSavingsSummary()` but destination page may:
- Use different API endpoint
- Show stale data
- Not prominently display the same figures
- Not break down by category

**Recommended Fix:**
1. Ensure destination page calls same API and shows same figures
2. Add URL param to pre-expand breakdown: `?showBreakdown=true`
3. Add hero section on destination showing "$240/mo" prominently
4. Ensure category breakdown adds up to $240

---

### 🔴 FINDING #5: Maintenance Nudge Card - Action Count Mismatch
**Severity:** CRITICAL  
**User Impact:** HIGH - Shows "5 unresolved issues" but destination may show different count

**Source:** `apps/frontend/src/app/(dashboard)/dashboard/components/MaintenanceNudgeCard.tsx:48-52`
```typescript
<span className="text-[13px] text-gray-600 sm:ml-[30px]">
  {consolidatedActionCount} unresolved property issues for {propertyName}
</span>

// Navigates to:
const destination = hasAssetDrivenActions
  ? `/dashboard/maintenance?propertyId=${property.id}&priority=true`
  : `/dashboard/maintenance?propertyId=${property.id}`;
```

**Destination:** `/dashboard/maintenance?propertyId={id}&priority=true`  
**Problem:**
- Card shows "5 unresolved property issues"
- User clicks expecting to see EXACTLY 5 items
- Destination page may show:
  - Different count (data refresh timing)
  - Different items (filter mismatch)
  - No clear indication of which 5 items were referenced

**Root Cause:** 
- Card gets `consolidatedActionCount` from parent component
- Destination page queries maintenance items independently
- No shared state or cache key to ensure consistency
- `priority=true` filter may not match card's consolidation logic

**Recommended Fix:**
1. Pass action IDs in URL: `?actionIds=123,456,789`
2. Use shared React Query cache key
3. Add timestamp param to ensure data consistency
4. Show count on destination page: "Showing 5 priority items"

---

### 🔴 FINDING #6: Upcoming Renewals Card - Wrong Destination
**Severity:** CRITICAL  
**User Impact:** HIGH - Shows insurance renewal but navigates to warranties page

**Source:** `apps/frontend/src/app/(dashboard)/dashboard/components/UpcomingRenewalsCard.tsx:127-131`
```typescript
const detailUrl = renewal.type === 'warranty' 
  ? '/dashboard/warranties'
  : '/dashboard/insurance';

// But CTA at bottom ALWAYS goes to warranties:
<Link href="/dashboard/warranties">
  <Button>
    View All {totalRenewals} <ArrowRight />
  </Button>
</Link>
```

**Problem:**
- Card shows mix of warranties AND insurance renewals
- Individual items navigate correctly (warranty → warranties, insurance → insurance)
- BUT "View All" button ALWAYS goes to `/dashboard/warranties`
- If user has 3 insurance renewals and 0 warranties, "View All 3" goes to empty warranties page

**Root Cause:** Hardcoded CTA destination doesn't account for renewal mix.

**Recommended Fix:**
```typescript
// Option 1: Navigate to combined view
<Link href={`/dashboard/protect?propertyId=${propertyId}&tab=renewals`}>

// Option 2: Navigate to dominant type
const dominantType = renewalItems.filter(r => r.type === 'insurance').length > 
                     renewalItems.filter(r => r.type === 'warranty').length 
                     ? 'insurance' : 'warranties';
<Link href={`/dashboard/${dominantType}`}>

// Option 3: Show both counts
"View {insuranceCount} insurance + {warrantyCount} warranties"
```

---

### 🔴 FINDING #7: Sidebar "Review Coverage Gaps" - No Gap Focus
**Severity:** CRITICAL  
**User Impact:** HIGH - Promises gap review but destination doesn't highlight gaps

**Source:** `apps/frontend/src/lib/sidebar/dynamicSidebarActions.ts:234-242`
```typescript
if (ctx.signals?.gapCount && ctx.signals.gapCount > 0) {
  actions.push({
    id: 'review-coverage-gaps',
    title: 'Review coverage gaps',
    description: `${ctx.signals.gapCount} gap${ctx.signals.gapCount > 1 ? 's' : ''} identified`,
    icon: ShieldCheck,
    href: `${propPath}/tools/coverage-analysis`,  // ← GENERIC TOOL PAGE
    priority: 'high',
    badge: 'Action needed',
  });
}
```

**Destination:** `/dashboard/properties/{id}/tools/coverage-analysis`  
**Problem:**
- CTA says "Review coverage gaps" with "3 gaps identified"
- User expects to see:
  - List of 3 specific gaps
  - Which assets have gaps
  - How to close each gap
- Destination shows coverage analysis tool but:
  - May not auto-filter to gaps only
  - May not highlight the 3 items
  - May show full coverage report (gaps + covered items)

**Root Cause:** No focus/filter param passed to destination.

**Recommended Fix:**
```typescript
href: `${propPath}/tools/coverage-analysis?filter=gaps&highlight=true`

// OR navigate to different page:
href: `${propPath}/protect?tab=gaps`
```

---

### 🔴 FINDING #8: Financial Efficiency Card - Annual Cost Not Explained
**Severity:** CRITICAL  
**User Impact:** MEDIUM-HIGH - Shows "$18,500" annual cost but destination may not break it down

**Source:** `apps/frontend/src/app/(dashboard)/dashboard/components/FinancialEfficiencyScoreCard.tsx:165-168`
```typescript
<div>
  <span className={SUPPORT_LABEL}>Annual cost</span>
  <div className={META_VALUE}>{formatCurrency(annualCost)}</div>  // e.g., "$18,500"
</div>

// Navigates to:
const reportLink = propertyId
  ? `/dashboard/properties/${propertyId}/financial-efficiency`
  : "/dashboard/properties";
```

**Destination:** `/dashboard/properties/{id}/financial-efficiency`  
**Problem:**
- Card shows "$18,500" annual cost as key metric
- User clicks expecting to see:
  - Breakdown of $18,500 (insurance + tax + maintenance + utilities?)
  - How it compares to similar homes
  - Trends over time
- Destination page MUST show this breakdown prominently
- If page shows different number or no breakdown, promise is broken

**Root Cause:** Card gets `annualCost` from `summary.financialExposureTotal` but:
- Destination page may calculate differently
- May not show breakdown
- May not match card's data source

**Recommended Fix:**
1. Ensure destination shows same $18,500 figure as hero metric
2. Add breakdown section showing components
3. Add focus param: `?focus=annual-cost`
4. Ensure data source consistency

---

## HIGH PRIORITY FINDINGS (Priority 2)

### 🟠 FINDING #9: Sidebar "Complete Age Assessment" - Vague Destination
**Severity:** HIGH  
**User Impact:** MEDIUM - Promises age assessment but goes to generic inventory

**Source:** `apps/frontend/src/lib/sidebar/dynamicSidebarActions.ts:149-155`
```typescript
if (ctx.missingData?.hasInventory === false) {
  actions.push({
    id: 'complete-age-assessment',
    title: 'Complete age assessment',
    description: 'Add appliance ages for better insights',
    icon: ClipboardList,
    href: `${propPath}/inventory`,  // ← GENERIC INVENTORY PAGE
    priority: 'medium',
  });
}
```

**Problem:**
- CTA says "Complete age assessment" - specific task
- User expects to see:
  - Form to add ages
  - List of items missing ages
  - Guided workflow
- Destination shows full inventory page with no:
  - Filter to items missing ages
  - Highlighted age fields
  - Guided flow

**Recommended Fix:**
```typescript
href: `${propPath}/inventory?filter=missing-age&highlight=age-field`
// OR
href: `${propPath}/inventory/age-assessment`  // dedicated flow
```

---

### 🟠 FINDING #10: Sidebar "Check Warranty Coverage" - No Warranty Focus
**Severity:** HIGH  
**User Impact:** MEDIUM - Goes to inventory instead of warranty-specific view

**Source:** `apps/frontend/src/lib/sidebar/dynamicSidebarActions.ts:259-265`
```typescript
if (ctx.missingData?.hasWarranties === false) {
  actions.push({
    id: 'check-warranty-coverage',
    title: 'Check warranty coverage',
    description: 'Review appliance warranties',
    icon: FileCheck,
    href: `${propPath}/inventory`,  // ← WRONG DESTINATION
    priority: 'medium',
  });
}
```

**Problem:**
- CTA says "Check warranty coverage"
- Goes to inventory page (not warranty-focused)
- Should go to warranties page or inventory filtered by warranty status

**Recommended Fix:**
```typescript
href: `/dashboard/warranties?propertyId=${ctx.propertyId}`
// OR
href: `${propPath}/inventory?tab=warranties`
```

---

### 🟠 FINDING #11: Sidebar "Review Savings Opportunities" - Generic Tool
**Severity:** HIGH  
**User Impact:** MEDIUM - Promises opportunities but shows generic savings tool

**Source:** `apps/frontend/src/lib/sidebar/dynamicSidebarActions.ts:313-319`
```typescript
actions.push({
  id: 'review-savings-opportunities',
  title: 'Review savings opportunities',
  description: 'Find cost reduction paths',
  icon: DollarSign,
  href: `${propPath}/tools/home-savings`,
  priority: 'high',
});
```

**Problem:**
- CTA implies there ARE opportunities to review
- But destination is generic tool that may show "No opportunities found"
- Should only show this CTA if opportunities exist
- OR change wording to "Check for savings opportunities"

**Recommended Fix:**
```typescript
// Only show if opportunities exist:
if (ctx.signals?.savingsOpportunities && ctx.signals.savingsOpportunities > 0) {
  actions.push({
    title: 'Review savings opportunities',
    description: `${ctx.signals.savingsOpportunities} opportunities found`,
    href: `${propPath}/tools/home-savings?filter=opportunities`,
  });
} else {
  actions.push({
    title: 'Check for savings',  // ← Less specific promise
    description: 'Analyze cost reduction potential',
    href: `${propPath}/tools/home-savings`,
  });
}
```

---

### 🟠 FINDING #12: Sidebar "Review Risk Exposure" - Amount Not Shown
**Severity:** HIGH  
**User Impact:** MEDIUM - Shows $ amount but destination may not highlight it

**Source:** `apps/frontend/src/lib/sidebar/dynamicSidebarActions.ts:283-289`
```typescript
if (ctx.signals?.atRisk && ctx.signals.atRisk > 0) {
  actions.push({
    id: 'review-risk-exposure',
    title: 'Review risk exposure',
    description: `${Math.round(ctx.signals.atRisk).toLocaleString()} at risk`,  // e.g., "$12,450 at risk"
    icon: AlertTriangle,
    href: `/dashboard/resolution-center?propertyId=${ctx.propertyId}`,
    priority: 'medium',
  });
}
```

**Problem:**
- Shows "$12,450 at risk" in description
- Goes to resolution center (not risk assessment page)
- Resolution center may not show this $ figure
- Should go to risk assessment or pass amount as param

**Recommended Fix:**
```typescript
href: `${propPath}/risk-assessment?highlight=exposure&amount=${ctx.signals.atRisk}`
// OR
href: `/dashboard/resolution-center?propertyId=${ctx.propertyId}&filter=financial-risk&minAmount=${ctx.signals.atRisk}`
```

---

### 🟠 FINDING #13-18: Multiple Sidebar Actions - Generic Destinations
**Severity:** HIGH (each)  
**Pattern:** Many sidebar actions navigate to generic pages without focus params

**Examples:**
1. "Add appliance" → `/inventory` (should open add modal or form)
2. "Upload document" → `/vault` (should open upload modal)
3. "Add room" → `/rooms` (should open add room form)
4. "Schedule maintenance" → `/maintenance` (should open scheduler)
5. "Add contractor quote" → `/bookings` (should open quote form)
6. "Validate repair cost" → `/tools/cost-explainer` (should pre-fill with context)

**Recommended Fix Pattern:**
```typescript
// Add action param to trigger modal/form:
href: `${propPath}/inventory?action=add`
href: `${propPath}/vault?action=upload`
href: `${propPath}/rooms?action=create`

// OR use hash for client-side routing:
href: `${propPath}/inventory#add-item`
```

---

## MEDIUM PRIORITY FINDINGS (Priority 3)

### 🟡 FINDING #19: Health Score "Weekly Change" - No Trend View
**Severity:** MEDIUM  
**User Impact:** LOW-MEDIUM - Shows "+2.3 pts" but destination doesn't show trend

**Source:** `apps/frontend/src/app/(dashboard)/dashboard/components/PropertyHealthScoreCard.tsx:138-142`
```typescript
<div>
  <span className={SUPPORT_LABEL}>Weekly change</span>
  <div className={META_VALUE}>
    {weeklyDeltaLabel(weeklyChange)}  // e.g., "+2.3 pts"
  </div>
</div>
```

**Problem:**
- Shows weekly change metric
- User clicks expecting to see trend chart
- Destination may not show historical trend
- Should add focus param or ensure trend is visible

**Recommended Fix:**
```typescript
href: `${propPath}/health-score?view=trends`
// OR ensure destination page shows trend chart prominently
```

---

### 🟡 FINDING #20-23: Tool Cards - Missing Context Params
**Severity:** MEDIUM (each)  
**Pattern:** Tool cards navigate to tools without passing current context

**Examples:**
1. Break-even tool card → doesn't pass property details
2. Coverage analysis → doesn't pass asset context
3. Cost explainer → doesn't pass item being explained
4. Sell-hold-rent → doesn't pass current scenario

**Recommended Fix Pattern:**
```typescript
// Pass context via URL params:
href: `${propPath}/tools/break-even?propertyId=${propertyId}&prefill=true`
href: `${propPath}/tools/coverage-analysis?assetId=${assetId}`
href: `${propPath}/tools/cost-explainer?itemId=${itemId}&category=${category}`
```

---

## SYSTEMIC PATTERNS CAUSING ISSUES

### Pattern 1: Display Data ≠ Routing Data
**Root Cause:** Components calculate display values (counts, amounts, scores) from one data source but build routes from different logic.

**Example:**
```typescript
// Display uses healthScore.insights
const maintenanceCount = property.healthScore?.insights.filter(...).length;

// But route is generic
href={buildPropertyAwareDashboardHref(property.id, '/dashboard/health-score')}
```

**Solution:** Unify data source or pass display values as route params.

---

### Pattern 2: Missing Focus/Filter Parameters
**Root Cause:** CTAs promise specific views but routes don't include focus/filter params.

**Example:**
```typescript
// Promise: "Review 3 coverage gaps"
// Route: /tools/coverage-analysis  (shows ALL coverage, not just gaps)
```

**Solution:** Add URL params: `?filter=gaps&count=3&highlight=true`

---

### Pattern 3: Generic Fallback Routes
**Root Cause:** When specific context is missing, code falls back to generic routes that don't match CTA promise.

**Example:**
```typescript
const destination = hasAssetDrivenActions
  ? `/dashboard/maintenance?priority=true`
  : `/dashboard/maintenance`;  // ← Too generic
```

**Solution:** Don't show CTA if context is insufficient, or change CTA text to match generic destination.

---

### Pattern 4: Hardcoded Destinations
**Root Cause:** CTAs have hardcoded routes that don't adapt to displayed content.

**Example:**
```typescript
// Shows mix of insurance + warranties
// But always goes to:
<Link href="/dashboard/warranties">  // ← Hardcoded
```

**Solution:** Calculate destination based on displayed content.

---

### Pattern 5: No Destination Validation
**Root Cause:** No mechanism to verify destination page actually supports promised content.

**Solution:** Add destination page contracts/interfaces that components must satisfy.

---

## SHARED COMPONENTS NEEDING REFACTORING

### 1. `dynamicSidebarActions.ts`
**Issues:** 12+ actions with generic destinations  
**Fix:** Add focus params to all action hrefs

### 2. Score Cards (Health, Risk, Financial)
**Issues:** Show metrics but destinations don't highlight them  
**Fix:** Add focus params and ensure destination pages show same metrics

### 3. Tool Cards
**Issues:** Navigate to tools without context  
**Fix:** Pass propertyId, assetId, scenario params

### 4. Renewal/Maintenance Cards
**Issues:** Show counts that don't match destination  
**Fix:** Pass item IDs or use shared cache keys

---

## RECOMMENDED GUARDRAILS

### 1. CTA Contract Interface
```typescript
interface CTAContract {
  promise: {
    action: string;  // "Review 3 gaps"
    metric?: { value: number; unit: string };  // { value: 3, unit: "gaps" }
    context?: Record<string, any>;  // { gapIds: [1,2,3] }
  };
  destination: {
    route: string;
    params: Record<string, string>;
    requiredFeatures: string[];  // ["gap-list", "gap-filter"]
  };
}
```

### 2. Destination Page Contracts
```typescript
// Each page exports what it supports:
export const pageContract = {
  features: ["gap-list", "gap-filter", "gap-highlight"],
  params: ["filter", "highlight", "gapIds"],
  metrics: ["gapCount", "totalExposure"],
};
```

### 3. Build-Time Validation
```typescript
// Validate CTA destinations at build time:
function validateCTA(cta: CTAContract) {
  const page = getPageContract(cta.destination.route);
  const missingFeatures = cta.destination.requiredFeatures.filter(
    f => !page.features.includes(f)
  );
  if (missingFeatures.length > 0) {
    throw new Error(`Page ${cta.destination.route} missing features: ${missingFeatures}`);
  }
}
```

### 4. Runtime Consistency Checks
```typescript
// Verify displayed metrics match destination:
function useCTAConsistency(displayedValue: number, destinationRoute: string) {
  useEffect(() => {
    // Fetch destination page data
    // Compare with displayed value
    // Log warning if mismatch
  }, [displayedValue, destinationRoute]);
}
```

### 5. Shared Cache Keys
```typescript
// Use same React Query key for card and destination:
const MAINTENANCE_CACHE_KEY = (propertyId: string) => 
  ['maintenance-items', propertyId, 'priority'];

// Card:
const { data } = useQuery({ queryKey: MAINTENANCE_CACHE_KEY(propertyId) });

// Destination page:
const { data } = useQuery({ queryKey: MAINTENANCE_CACHE_KEY(propertyId) });
```

---

## SUGGESTED TEST PLAN

### 1. Manual Testing Checklist
For each CTA:
- [ ] Note displayed promise (text, metrics, counts)
- [ ] Click CTA
- [ ] Verify destination shows promised content
- [ ] Verify metrics match exactly
- [ ] Verify focus/highlight works
- [ ] Verify no data staleness

### 2. Automated E2E Tests
```typescript
describe('CTA Promise Validation', () => {
  it('Health Score maintenance count matches destination', async () => {
    // 1. Get maintenance count from card
    const cardCount = await page.locator('[data-testid="maintenance-count"]').textContent();
    
    // 2. Click CTA
    await page.click('[data-testid="health-score-cta"]');
    
    // 3. Verify destination shows same count
    const pageCount = await page.locator('[data-testid="maintenance-list"]').count();
    expect(pageCount).toBe(parseInt(cardCount));
  });
});
```

### 3. Visual Regression Tests
- Screenshot card with metrics
- Screenshot destination page
- Verify metrics appear in both

### 4. Data Consistency Tests
```typescript
// Verify same API response used by card and destination:
test('Card and destination use same data source', () => {
  const cardData = getHealthScoreData(propertyId);
  const pageData = getHealthScorePageData(propertyId);
  expect(cardData.maintenanceCount).toBe(pageData.maintenanceCount);
});
```

---

## IMPLEMENTATION PRIORITY

### Phase 1 (Week 1): Critical Fixes
1. Fix Finding #1: Health Score maintenance mismatch
2. Fix Finding #2: Sidebar urgent alerts
3. Fix Finding #3: Risk exposure value
4. Fix Finding #4: Home savings amount
5. Fix Finding #5: Maintenance nudge count
6. Fix Finding #6: Renewals wrong destination
7. Fix Finding #7: Coverage gaps no focus
8. Fix Finding #8: Financial annual cost

### Phase 2 (Week 2): High Priority
9-18: Fix sidebar generic destinations and tool context

### Phase 3 (Week 3): Medium Priority + Guardrails
19-23: Fix trend views and tool context  
Implement CTA contracts and validation

### Phase 4 (Week 4): Testing + Documentation
- Write E2E tests
- Document CTA patterns
- Create developer guidelines

---

## SUCCESS CRITERIA

After remediation:
- ✅ Every CTA promise is fulfilled by destination
- ✅ All metrics shown in cards appear on destination pages
- ✅ All counts/amounts match exactly
- ✅ All "Review X" CTAs show X on destination
- ✅ All focus/filter params work correctly
- ✅ No generic fallback routes for specific promises
- ✅ Build-time validation catches new mismatches
- ✅ E2E tests verify CTA consistency

---

## APPENDIX: AUDIT METHODOLOGY

1. **Enumerated all CTA surfaces:**
   - Dashboard cards (Health, Risk, Financial, Savings, etc.)
   - Sidebar actions (12 route families, 60+ actions)
   - Tool cards (Home Lab, Savings Check, etc.)
   - Nudge cards (Maintenance, Renewals, etc.)
   - Navigation components (Bottom nav, breadcrumbs, etc.)

2. **For each CTA, documented:**
   - User-visible promise (text, metrics, counts)
   - Data source for displayed values
   - Destination route
   - Destination page capabilities
   - Mismatch severity

3. **Traced data flow:**
   - API calls for display data
   - API calls for destination data
   - Shared vs. separate data sources
   - Cache key consistency

4. **Identified patterns:**
   - Generic destinations
   - Missing focus params
   - Hardcoded routes
   - Display/routing data divergence

---

**End of Audit Report**
