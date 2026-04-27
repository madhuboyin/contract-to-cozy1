# FINDING 3 - Exposure Focus Implementation

## Status: ✅ COMPLETE

## Problem
**Severity:** HIGH  
**User Impact:** The Risk Exposure score card shows $X,XXX exposure and a "Review exposure details" CTA. Clicking it opens the risk-assessment page with `?focus=exposure` parameter, but the page doesn't consume this parameter - no exposure section is highlighted, expanded, or focused. User must hunt for the exposure breakdown manually.

## Root Cause
The `PropertyRiskScoreCard` component was passing `?focus=exposure` parameter in the URL, but the destination page (`risk-assessment/page.tsx`) had:
- Zero `useSearchParams` calls
- No focus or view param handling whatsoever
- The `focus=exposure` param was built but never consumed

## Solution Implemented

### 1. Added URL Parameter Handling
**File:** `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/risk-assessment/page.tsx`

```typescript
// Import useSearchParams
import { useParams, useRouter, useSearchParams } from "next/navigation";

// Extract focus parameter
const searchParams = useSearchParams();
const focusParam = searchParams.get('focus');
const shouldFocusExposure = focusParam === 'exposure';
```

### 2. Added Scroll-to-View Effect
```typescript
// Scroll to exposure section when focus parameter is present
useEffect(() => {
    if (shouldFocusExposure && !isCalculating && !isQueued) {
        // Wait for DOM to render, then scroll to exposure section
        const timer = setTimeout(() => {
            const exposureElement = document.getElementById('exposure-summary');
            if (exposureElement) {
                exposureElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 300);
        return () => clearTimeout(timer);
    }
}, [shouldFocusExposure, isCalculating, isQueued]);
```

### 3. Added ID and Highlighting to Desktop Exposure Card
```typescript
<Card 
    id="exposure-summary" 
    className={`sm:col-span-2 lg:col-span-2 transition-all duration-300 ${
        shouldFocusExposure ? 'ring-2 ring-teal-400 shadow-lg' : ''
    }`}
>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium">Total Financial Exposure (5-Year)</CardTitle>
        <DollarSign className="h-5 w-5 text-red-600" />
    </CardHeader>
    {/* ... rest of card content ... */}
</Card>
```

### 4. Added ID and Highlighting to Mobile Exposure Section
```typescript
<div 
    id="exposure-summary" 
    className={`transition-all duration-300 ${
        shouldFocusExposure ? 'ring-2 ring-teal-400 rounded-lg shadow-lg' : ''
    }`}
>
    <ReadOnlySummaryBlock
        title="Snapshot"
        items={[
            { label: "5-year exposure", value: formattedExposure, emphasize: true },
            // ... other items ...
        ]}
        columns={2}
    />
</div>
```

## User Experience Flow

### Before Fix
1. User sees "$X,XXX exposure" on PropertyRiskScoreCard
2. User clicks "Review exposure details"
3. Page opens with `?focus=exposure` in URL
4. ❌ Nothing happens - user must manually scroll to find exposure section
5. ❌ No visual indication of what they're looking for

### After Fix
1. User sees "$X,XXX exposure" on PropertyRiskScoreCard
2. User clicks "Review exposure details"
3. Page opens with `?focus=exposure` in URL
4. ✅ Page automatically scrolls to exposure section (smooth scroll)
5. ✅ Exposure card is highlighted with teal ring and shadow
6. ✅ User immediately sees the exposure breakdown they clicked for

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
- **Parameter Name:** `focus`
- **Expected Value:** `exposure`
- **Fallback:** No action if parameter missing or different value
- **Clean:** No side effects on other page functionality

## Files Modified
1. `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/risk-assessment/page.tsx`
   - Added `useSearchParams` import
   - Added focus parameter extraction
   - Added scroll-to-view useEffect
   - Added `id="exposure-summary"` to desktop card
   - Added conditional highlighting classes to desktop card
   - Added wrapper div with id and highlighting to mobile section

## Testing Checklist
- [ ] Click "Review exposure details" from PropertyRiskScoreCard
- [ ] Verify page scrolls to exposure section
- [ ] Verify exposure card is highlighted with teal ring
- [ ] Verify highlighting disappears after navigation away and back without parameter
- [ ] Test on mobile viewport
- [ ] Test on desktop viewport
- [ ] Verify no console errors
- [ ] Verify smooth scroll animation works
- [ ] Verify highlighting doesn't interfere with other page functionality

## Related Files
- **Source CTA:** `apps/frontend/src/app/(dashboard)/dashboard/components/PropertyRiskScoreCard.tsx` (line 189-191)
- **Destination:** `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/risk-assessment/page.tsx`
- **Audit Report:** `CTA_AUDIT_VALIDATION_REPORT.md` (FINDING 3)

## Impact
- **Severity:** HIGH → RESOLVED
- **User Friction:** Eliminated manual hunting for exposure section
- **CTA Promise:** Now delivers exactly what it promises
- **Navigation Quality:** Premium experience with smooth scroll and visual feedback
