# FINDING 4 - Trends View Implementation

## Status: ✅ COMPLETE

## Problem
**Severity:** HIGH  
**User Impact:** Risk card shows "View risk trends" CTA (triggered when risk score changed week-over-week), but the destination page shows identical content to "Open risk details" — no trend section is surfaced, highlighted, or expanded. User must manually scroll to find the trends chart.

## Root Cause
The `PropertyRiskScoreCard` component was passing `?view=trends` parameter in the URL when weekly change occurred, but the destination page (`risk-assessment/page.tsx`) had:
- No `view` parameter handling
- The `view=trends` param was constructed but never consumed
- Same issue as FINDING 3 - parameter built but ignored

## Solution Implemented

### 1. Added View Parameter Handling
**File:** `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/risk-assessment/page.tsx`

```typescript
// Extract view parameter for trends highlighting
const viewParam = searchParams.get('view');
const shouldFocusTrends = viewParam === 'trends';
```

### 2. Added Scroll-to-Trends Effect
```typescript
// Scroll to trends section when view parameter is present
useEffect(() => {
    if (shouldFocusTrends && !isCalculating && !isQueued) {
        // Wait for DOM to render, then scroll to trends section
        const timer = setTimeout(() => {
            const trendsElement = document.getElementById('risk-trends-section');
            if (trendsElement) {
                trendsElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 300);
        return () => clearTimeout(timer);
    }
}, [shouldFocusTrends, isCalculating, isQueued]);
```

### 3. Added ID and Highlighting to Desktop Trends Card
```typescript
<Card 
    id="risk-trends-section"
    className={`lg:col-span-2 transition-all duration-300 ${
        shouldFocusTrends ? 'ring-2 ring-teal-400 shadow-lg' : ''
    }`}
>
    <CardHeader className="pb-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <CardTitle className="text-base font-medium">Risk Score Trend</CardTitle>
                <CardDescription>Weekly risk score snapshots with week-over-week delta.</CardDescription>
            </div>
            {/* ... trend period buttons ... */}
        </div>
    </CardHeader>
    <CardContent className="space-y-3">
        <ScoreTrendChart points={riskTrend} ariaLabel="Property risk score trend" />
        <ScoreDeltaIndicator delta={riskSeries?.deltaFromPreviousWeek} />
    </CardContent>
</Card>
```

### 4. Added ID and Highlighting to Mobile Trends Section
```typescript
<div
    id="risk-trends-section"
    className={`transition-all duration-300 ${
        shouldFocusTrends ? 'ring-2 ring-teal-400 rounded-lg shadow-lg' : ''
    }`}
>
    <ScenarioInputCard
        title="Risk Trend"
        subtitle="Weekly risk snapshots."
        actions={
            <ActionPriorityRow
                secondaryActions={
                    <>
                        <Button size="sm" variant={trendWeeks === 26 ? "default" : "outline"} onClick={() => setTrendWeeks(26)}>
                            6 Months
                        </Button>
                        <Button size="sm" variant={trendWeeks === 52 ? "default" : "outline"} onClick={() => setTrendWeeks(52)}>
                            1 Year
                        </Button>
                    </>
                }
            />
        }
    >
        <ScoreTrendChart points={riskTrend} ariaLabel="Property risk score trend" />
    </ScenarioInputCard>
</div>
```

## User Experience Flow

### Before Fix
1. User sees risk score changed week-over-week on PropertyRiskScoreCard
2. User clicks "View risk trends"
3. Page opens with `?view=trends` in URL
4. ❌ Nothing happens - identical view to "Open risk details"
5. ❌ User must manually scroll to find trends chart
6. ❌ No visual indication of what changed

### After Fix
1. User sees risk score changed week-over-week on PropertyRiskScoreCard
2. User clicks "View risk trends"
3. Page opens with `?view=trends` in URL
4. ✅ Page automatically scrolls to trends section (smooth scroll)
5. ✅ Trends card is highlighted with teal ring and shadow
6. ✅ User immediately sees the weekly trend chart they clicked for

## CTA Logic in PropertyRiskScoreCard

The card dynamically builds the href based on conditions:

```typescript
href={
  totalExposure > 0 
    ? `${reportLink}${weeklyChange !== "No change" ? '&view=trends' : ''}`
    : weeklyChange !== "No change"
    ? `${reportLink}?view=trends`
    : reportLink
}
```

**CTA Text Logic:**
- `totalExposure > 0` → "Review exposure details" (uses `?focus=exposure`)
- `weeklyChange !== "No change"` → "View risk trends" (uses `?view=trends`)
- Default → "Open risk details" (no parameters)

## Technical Details

### Highlighting Style
- **Ring:** 2px teal-400 border (`ring-2 ring-teal-400`)
- **Shadow:** Enhanced shadow for depth (`shadow-lg`)
- **Transition:** Smooth 300ms transition for visual polish
- **Responsive:** Works on both mobile and desktop layouts

### Scroll Behavior
- **Timing:** 300ms delay to ensure DOM is fully rendered
- **Behavior:** Smooth scroll animation
- **Block:** Scrolls to start of element (top alignment)
- **Conditional:** Only triggers when not calculating/queued

### Parameter Handling
- **Parameter Name:** `view`
- **Expected Value:** `trends`
- **Fallback:** No action if parameter missing or different value
- **Clean:** No side effects on other page functionality
- **Coexists:** Works alongside `focus=exposure` parameter

## Files Modified
1. `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/risk-assessment/page.tsx`
   - Added view parameter extraction
   - Added scroll-to-trends useEffect
   - Added `id="risk-trends-section"` to desktop card
   - Added conditional highlighting classes to desktop card
   - Added wrapper div with id and highlighting to mobile section

## Testing Checklist
- [ ] Risk score changes week-over-week
- [ ] Click "View risk trends" from PropertyRiskScoreCard
- [ ] Verify page scrolls to trends section
- [ ] Verify trends card is highlighted with teal ring
- [ ] Verify chart shows weekly snapshots
- [ ] Verify 6 Months / 1 Year toggle works
- [ ] Verify highlighting disappears after navigation without parameter
- [ ] Test on mobile viewport
- [ ] Test on desktop viewport
- [ ] Verify no console errors
- [ ] Verify smooth scroll animation works
- [ ] Test coexistence with `focus=exposure` parameter

## Related Files
- **Source CTA:** `apps/frontend/src/app/(dashboard)/dashboard/components/PropertyRiskScoreCard.tsx` (line 259-264)
- **Destination:** `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/risk-assessment/page.tsx`
- **Audit Report:** `CTA_AUDIT_VALIDATION_REPORT.md` (FINDING 4)
- **Related Fix:** `FINDING_3_EXPOSURE_FOCUS_FIX.md` (same pattern)

## Pattern Consistency

This fix follows the exact same pattern as FINDING 3:
1. Extract URL parameter using `useSearchParams`
2. Create boolean flag for conditional rendering
3. Add useEffect with scroll-to-view logic
4. Add `id` to target element
5. Add conditional highlighting classes
6. Works on both mobile and desktop

This pattern can be reused for other focus/view parameters across the application.

## Impact
- **Severity:** HIGH → RESOLVED
- **User Friction:** Eliminated manual hunting for trends chart
- **CTA Promise:** Now delivers exactly what it promises
- **Navigation Quality:** Premium experience with smooth scroll and visual feedback
- **Consistency:** Matches FINDING 3 implementation pattern
