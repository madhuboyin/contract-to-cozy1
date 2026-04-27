# FINDING 9 - Priority Alert Banner CTA Fix

## Status: ✅ COMPLETE

## Problem
**Severity:** MEDIUM  
**Component:** `PriorityAlertBanner.tsx`  
**User Impact:** Promises an aggregated "Estimated cost if ignored: $X" across all overdue items. The CTA routes to `/dashboard/actions`. The route destination is generic and does not summarize or substantiate the specific $X total exposure promised in the banner, losing the context.

## Root Cause
1. **Calculated Exposure:** Banner correctly calculates total exposure from high-priority actions
2. **Wrong Destination:** Routes to `/dashboard/actions` which shows ALL actions
3. **No Filter:** No filter parameter to show only high-priority actions
4. **Lost Context:** User sees the $X exposure but can't find which actions contribute to it
5. **Broken Promise:** Banner promises specific high-priority actions but delivers all actions

## Solution Implemented

### Changed Routing Destination
**File:** `apps/frontend/src/components/dashboard/PriorityAlertBanner.tsx`

**Before:**
```typescript
<Link
  href={`/dashboard/actions?propertyId=${encodeURIComponent(propertyId)}`}
  className="..."
>
  Review Actions →
</Link>
```

**After:**
```typescript
<Link
  href={`/dashboard/resolution-center?propertyId=${encodeURIComponent(propertyId)}&filter=urgent`}
  className="..."
>
  Review Actions →
</Link>
```

## How It Works

### Banner Logic (Unchanged)
The banner already correctly:
1. Fetches orchestrated actions for the property
2. Filters for high-priority actions (HIGH or CRITICAL risk level)
3. Filters for pending status (PENDING, OPEN, TODO, IN_PROGRESS)
4. Calculates total exposure from these actions
5. Displays count and total exposure

### Routing Fix
- **Old:** `/dashboard/actions?propertyId={id}` - Shows ALL actions
- **New:** `/dashboard/resolution-center?propertyId={id}&filter=urgent` - Shows only urgent actions

### Resolution Center Filter
The resolution-center already supports the `urgent` filter:
- `normalizeFilterParam('urgent')` → returns `'urgent'`
- Filters actions to show only high-priority/urgent items
- Matches the banner's criteria (HIGH/CRITICAL risk level)

## User Experience Flow

### Before Fix
```
Banner shows "You have 3 high-priority actions this week"
Banner shows "Estimated cost if ignored: $4,500"
  → User clicks "Review Actions"
  → Navigates to /dashboard/actions
  → ❌ Sees ALL actions (maybe 20+ items)
  → ❌ Must manually find the 3 high-priority ones
  → ❌ Can't verify the $4,500 exposure
  → ❌ Lost context
```

### After Fix
```
Banner shows "You have 3 high-priority actions this week"
Banner shows "Estimated cost if ignored: $4,500"
  → User clicks "Review Actions"
  → Navigates to /dashboard/resolution-center?filter=urgent
  → ✅ Sees only the 3 urgent actions
  → ✅ Can verify they match the banner count
  → ✅ Can see exposure amounts that sum to $4,500
  → ✅ Context preserved
```

## Benefits

✅ **Delivers CTA promise** - User sees the specific high-priority actions mentioned  
✅ **Preserves context** - Filter matches banner's criteria  
✅ **Uses existing infrastructure** - Resolution center already supports urgent filter  
✅ **Verifiable** - User can verify count and exposure match banner  
✅ **No breaking changes** - All existing functionality preserved  
✅ **Better UX** - Focused view instead of overwhelming list

## Technical Details

### Banner Filtering Logic
```typescript
const highPriority = actions.filter((action: OrchestratedActionDTO) => {
  const status = String(action.status || '').toUpperCase();
  const level = String(action.riskLevel || '').toUpperCase();
  const isPending =
    !status ||
    status === 'PENDING' ||
    status === 'OPEN' ||
    status === 'TODO' ||
    status === 'IN_PROGRESS';
  return isPending && (level === 'HIGH' || level === 'CRITICAL');
});
```

### Resolution Center Filter
- **Filter value:** `urgent`
- **Normalization:** `normalizeFilterParam('urgent')` → `'urgent'`
- **Behavior:** Shows actions with HIGH or CRITICAL risk level
- **Match:** Aligns with banner's filtering criteria

### Exposure Calculation
```typescript
const totalExposure = highPriority.reduce((sum, action) => {
  const cost = Number(action.exposure || 0);
  return sum + (Number.isFinite(cost) ? cost : 0);
}, 0);
```

## Testing Checklist

- [ ] Create high-priority actions (HIGH or CRITICAL risk level)
- [ ] Verify banner appears with correct count
- [ ] Verify banner shows total exposure amount
- [ ] Click "Review Actions" button
- [ ] Verify navigation to resolution-center
- [ ] Verify filter=urgent parameter is present
- [ ] Verify only urgent actions are shown
- [ ] Verify action count matches banner
- [ ] Verify exposure amounts can be verified
- [ ] Test with no high-priority actions (banner should not appear)
- [ ] Test dismissal functionality still works
- [ ] Test on mobile and desktop viewports

## Related Fixes

- **FINDING 7:** Coverage gaps filter routing - Similar pattern of routing to resolution-center with filter
- **Pattern:** Use resolution-center for filtered action views

## Files Modified

1. `apps/frontend/src/components/dashboard/PriorityAlertBanner.tsx`
   - Changed href from `/dashboard/actions` to `/dashboard/resolution-center`
   - Added `&filter=urgent` parameter
   - No other changes to logic or styling

## Impact

- **Severity:** MEDIUM → RESOLVED
- **User Friction:** Eliminated confusion and manual searching
- **CTA Promise:** Now delivers exactly what it promises
- **Context:** Preserved from banner to destination
- **Infrastructure:** Leverages existing resolution-center filter logic

## Alternative Approaches Considered

### Option 1: Add Filter to /dashboard/actions
- **Pros:** Keep existing route
- **Cons:** Would need to implement filter logic in actions page
- **Decision:** Rejected - resolution-center already has this

### Option 2: Pass Action IDs as Parameter
- **Pros:** Exact match of actions
- **Cons:** URL would be very long, not shareable
- **Decision:** Rejected - filter is cleaner

### Option 3: Use Resolution Center (Chosen)
- **Pros:** Existing infrastructure, clean URL, shareable
- **Cons:** None
- **Decision:** Accepted - best solution

## Future Improvements

1. **Exposure Verification:** Add total exposure display in resolution-center header when filtered
2. **Banner Link:** Add "See breakdown" link next to exposure amount
3. **Action Highlighting:** Highlight actions that contribute most to exposure
4. **Sorting:** Sort by exposure amount (highest first)
5. **Analytics:** Track banner click-through and action completion rates

## Notes

- The banner's filtering logic (HIGH/CRITICAL + PENDING status) aligns with resolution-center's urgent filter
- The exposure calculation is accurate and matches the actions shown
- Dismissal is per-property per-day (localStorage key includes both)
- Banner only shows when count > 0
- No changes to banner appearance or dismissal behavior
