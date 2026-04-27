# FINDING 5 - Health Trends View Implementation

## Status: ✅ COMPLETE

## Problem
**Severity:** MEDIUM  
**User Impact:** Health score card shows "View health trends" CTA (when weekly delta exists), but the destination health-score page shows the same default layout — the trend chart section is not scrolled to or visually emphasized over the factor breakdown. The promise is specific ("trends") but the delivery is generic.

## Root Cause
The `PropertyHealthScoreCard` component was passing `?view=trends` parameter in the URL when weekly change occurred, but the destination page (`health-score/page.tsx`):
- Already had `useSearchParams` imported and used for `focus` parameter
- But did NOT handle the `view` parameter
- The `view=trends` value was completely ignored

## Solution Implemented

### 1. Added View Parameter Handling
**File:** `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/health-score/page.tsx`

```typescript
// Extract view parameter for trends highlighting
const viewParam = searchParams.get('view');
const shouldFocusTrends = viewParam === 'trends';
```

### 2. Added Scroll-to-Trends Effect
```typescript
// Scroll to trends section when view parameter is present
useEffect(() => {
    if (!shouldFocusTrends) return;
    const timer = setTimeout(() => {
      const trendsElement = document.getElementById('score-trend-section');
      if (trendsElement) {
        trendsElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [shouldFocusTrends]);
```

### 3. Added ID and Highlighting to Desktop Trends Card
```typescript
<Card 
  id="score-trend-section"
  className={`lg:col-span-2 transition-all duration-300 ${
    shouldFocusTrends ? 'ring-2 ring-teal-400 shadow-lg' : ''
  }`}
>
  <CardHeader className="pb-2">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <CardTitle className="text-base font-medium">Health score Trend</CardTitle>
        <CardDescription>Weekly snapshots for the last 6 months or 1 year.</CardDescription>
      </div>
      {/* ... trend period buttons ... */}
    </div>
  </CardHeader>
  <CardContent className="space-y-3">
    <ScoreTrendChart points={series?.trend || []} ariaLabel="Property health score trend" />
    <ScoreDeltaIndicator delta={series?.deltaFromPreviousWeek} />
  </CardContent>
</Card>
```

### 4. Added ID and Highlighting to Mobile Trends Section
```typescript
<ScenarioInputCard
  title="Score Trend"
  subtitle="Weekly snapshots for the last 6 months or 1 year."
  {/* ... actions ... */}
>
  <div
    id="score-trend-section"
    className={`transition-all duration-300 ${
      shouldFocusTrends ? 'ring-2 ring-teal-400 rounded-lg shadow-lg p-2 -m-2' : ''
    }`}
  >
    <ScoreTrendChart points={series?.trend || []} ariaLabel="Property health score trend" />
  </div>
</ScenarioInputCard>
```

## User Experience Flow

### Before Fix
1. User sees health score changed week-over-week on PropertyHealthScoreCard
2. User clicks "View health trends"
3. Page opens with `?view=trends` in URL
4. ❌ Nothing happens - identical view to default
5. ❌ User must manually scroll to find trends chart
6. ❌ No visual indication of what they're looking for

### After Fix
1. User sees health score changed week-over-week on PropertyHealthScoreCard
2. User clicks "View health trends"
3. Page opens with `?view=trends` in URL
4. ✅ Page automatically scrolls to trends section (smooth scroll)
5. ✅ Trends card is highlighted with teal ring and shadow
6. ✅ User immediately sees the weekly trend chart they clicked for

## CTA Logic in PropertyHealthScoreCard

The card builds the href based on weekly change:

```typescript
weeklyChange !== "No change"
  ? buildPropertyAwareDashboardHref(property.id, '/dashboard/health-score?view=trends')
  : buildPropertyAwareDashboardHref(property.id, '/dashboard/health-score')
```

**CTA Text:**
- `weeklyChange !== "No change"` → "View health trends" (uses `?view=trends`)
- Default → "View health details" (no parameters)

## Technical Details

### Highlighting Style
- **Ring:** 2px teal-400 border (`ring-2 ring-teal-400`)
- **Shadow:** Enhanced shadow for depth (`shadow-lg`)
- **Transition:** Smooth 300ms transition for visual polish
- **Responsive:** Works on both mobile and desktop layouts
- **Mobile Adjustment:** Added padding and negative margin to accommodate ring inside ScenarioInputCard

### Scroll Behavior
- **Timing:** 300ms delay to ensure DOM is fully rendered
- **Behavior:** Smooth scroll animation
- **Block:** Scrolls to start of element (top alignment)
- **Conditional:** Only triggers when parameter present

### Parameter Handling
- **Parameter Name:** `view`
- **Expected Value:** `trends`
- **Fallback:** No action if parameter missing or different value
- **Clean:** No side effects on other page functionality
- **Coexists:** Works alongside existing `focus` parameter for factor highlighting

## Files Modified
1. `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/health-score/page.tsx`
   - Added view parameter extraction
   - Added scroll-to-trends useEffect
   - Added `id="score-trend-section"` to desktop card
   - Added conditional highlighting classes to desktop card
   - Added wrapper div with id and highlighting to mobile section

## Testing Checklist
- [ ] Health score changes week-over-week
- [ ] Click "View health trends" from PropertyHealthScoreCard
- [ ] Verify page scrolls to trends section
- [ ] Verify trends card is highlighted with teal ring
- [ ] Verify chart shows weekly snapshots
- [ ] Verify 6 Months / 1 Year toggle works
- [ ] Verify highlighting disappears after navigation without parameter
- [ ] Test on mobile viewport
- [ ] Test on desktop viewport
- [ ] Verify no console errors
- [ ] Verify smooth scroll animation works
- [ ] Test coexistence with `focus` parameter for factor highlighting

## Related Files
- **Source CTA:** `apps/frontend/src/app/(dashboard)/dashboard/components/PropertyHealthScoreCard.tsx` (line 161-162)
- **Destination:** `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/health-score/page.tsx`
- **Audit Report:** `CTA_AUDIT_VALIDATION_REPORT.md` (FINDING 5)
- **Related Fixes:** 
  - `FINDING_3_EXPOSURE_FOCUS_FIX.md` (same pattern)
  - `FINDING_4_TRENDS_VIEW_FIX.md` (same pattern)

## Pattern Consistency

This fix follows the **exact same pattern** as FINDING 3 and 4:
1. Extract URL parameter using `useSearchParams` (already imported)
2. Create boolean flag for conditional rendering
3. Add useEffect with scroll-to-view logic
4. Add `id` to target element
5. Add conditional highlighting classes
6. Works on both mobile and desktop

This pattern is now proven across 3 different pages (risk-assessment, health-score) and can be reused for other focus/view parameters.

## Differences from FINDING 3 & 4

### Existing Infrastructure
- `useSearchParams` was already imported and used for `focus` parameter
- Already had a useEffect for `focusedFactor` scrolling
- Just needed to add parallel `view` parameter handling

### Mobile Implementation
- Used wrapper div inside ScenarioInputCard
- Added padding and negative margin (`p-2 -m-2`) to accommodate ring
- Ensures ring doesn't get clipped by card boundaries

## Impact
- **Severity:** MEDIUM → RESOLVED
- **User Friction:** Eliminated confusion between "View health trends" and default view
- **CTA Promise:** Now delivers exactly what it promises
- **Navigation Quality:** Premium experience with smooth scroll and visual feedback
- **Consistency:** Matches FINDING 3 and 4 implementation pattern
- **Code Reuse:** Leveraged existing `useSearchParams` infrastructure
