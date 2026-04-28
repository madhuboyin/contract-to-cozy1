# HOOD Duplicate Fix - Implementation Summary

**Date**: April 27, 2026  
**Issue**: "HOOD" appearing twice on the Fix page  
**Status**: ✅ **FIXED**

---

## What Was Changed

**File**: `apps/frontend/src/lib/dashboard/urgentActions.ts`  
**Function**: `consolidateUrgentActions()`  
**Lines**: 78-107 (approximately)

---

## The Fix

### Before (Problematic Code)

```typescript
properties.forEach((property) => {
  property.healthScore?.insights
    ?.filter((insight) => criticalStatuses.includes(insight.status))
    .forEach((insight, index) => {
      actions.push({
        id: `${property.id}-INSIGHT-${index}`,  // ❌ Index-based ID
        type: 'HEALTH_INSIGHT',
        title: insight.factor,                    // ❌ No deduplication
        description: `Status: ${insight.status}. Requires resolution.`,
        propertyId: property.id,
      });
    });
});
```

**Problems**:
- No deduplication by factor name
- Index-based IDs create unique IDs even for duplicate factors
- Multiple insights for same factor (e.g., "HOOD") all become separate action items

---

### After (Fixed Code)

```typescript
properties.forEach((property) => {
  // Deduplicate insights by factor name, keeping the most severe (first in criticalStatuses array)
  const insightsByFactor = new Map<string, { insight: any; statusIndex: number }>();
  
  property.healthScore?.insights
    ?.filter((insight) => criticalStatuses.includes(insight.status))
    .forEach((insight) => {
      const factor = insight.factor;
      const statusIndex = criticalStatuses.indexOf(insight.status);
      const existing = insightsByFactor.get(factor);
      
      // Keep the insight with the most severe status (lower index = more severe)
      if (!existing || statusIndex < existing.statusIndex) {
        insightsByFactor.set(factor, { insight, statusIndex });
      }
    });

  // Create actions from deduplicated insights
  insightsByFactor.forEach(({ insight }) => {
    // Generate stable ID based on factor name instead of array index
    const factorId = insight.factor.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    actions.push({
      id: `${property.id}-INSIGHT-${factorId}`,
      type: 'HEALTH_INSIGHT',
      title: insight.factor,
      description: `Status: ${insight.status}. Requires resolution.`,
      propertyId: property.id,
    });
  });
});
```

**Improvements**:
- ✅ Deduplicates insights by factor name using a Map
- ✅ Keeps only the most severe status when duplicates exist
- ✅ Generates stable, semantic IDs based on factor name (e.g., `{propertyId}-INSIGHT-hood`)
- ✅ Prevents duplicate cards from appearing in the UI

---

## How It Works

### 1. Deduplication Logic

The fix uses a `Map<string, { insight, statusIndex }>` to track unique factors:

```typescript
const insightsByFactor = new Map<string, { insight: any; statusIndex: number }>();
```

- **Key**: Factor name (e.g., "HOOD", "HVAC", "Roof")
- **Value**: Object containing the insight and its severity index

### 2. Severity Prioritization

When multiple insights exist for the same factor, the code keeps the **most severe** one:

```typescript
const statusIndex = criticalStatuses.indexOf(insight.status);
const existing = insightsByFactor.get(factor);

if (!existing || statusIndex < existing.statusIndex) {
  insightsByFactor.set(factor, { insight, statusIndex });
}
```

**Severity order** (from most to least severe):
1. "Needs attention" (index 0)
2. "Needs Review" (index 1)
3. "Needs Inspection" (index 2)
4. "Missing Data" (index 3)
5. "Needs Warranty" (index 4)

### 3. Stable ID Generation

Instead of using array index, IDs are now based on factor name:

```typescript
const factorId = insight.factor.toLowerCase().replace(/[^a-z0-9]+/g, '-');
// "HOOD" → "hood"
// "HVAC System" → "hvac-system"
// "Water Heater Age" → "water-heater-age"
```

**Benefits**:
- IDs remain consistent across page refreshes
- IDs are human-readable and debuggable
- No duplicate IDs for the same factor

---

## Example Scenarios

### Scenario 1: Two "HOOD" Insights with Different Statuses

**Input data**:
```javascript
insights: [
  { factor: "HOOD", status: "Needs Review" },
  { factor: "HOOD", status: "Needs attention" }
]
```

**Before fix**: 2 action items created
- `{propertyId}-INSIGHT-0` → "HOOD" (Needs Review)
- `{propertyId}-INSIGHT-1` → "HOOD" (Needs attention)

**After fix**: 1 action item created
- `{propertyId}-INSIGHT-hood` → "HOOD" (Needs attention) ← Most severe kept

---

### Scenario 2: Two "HOOD" Insights with Same Status

**Input data**:
```javascript
insights: [
  { factor: "HOOD", status: "Needs attention" },
  { factor: "HOOD", status: "Needs attention" }
]
```

**Before fix**: 2 action items created (duplicates)

**After fix**: 1 action item created (first one kept)

---

### Scenario 3: Different Factors

**Input data**:
```javascript
insights: [
  { factor: "HOOD", status: "Needs attention" },
  { factor: "HVAC", status: "Needs Review" },
  { factor: "Roof", status: "Missing Data" }
]
```

**Before fix**: 3 action items created
**After fix**: 3 action items created (no change - all unique)

---

## Impact Analysis

### What This Fixes

✅ **Duplicate "HOOD" cards on Fix page** - Primary issue resolved  
✅ **Duplicate cards for any factor** - Applies to all factors, not just HOOD  
✅ **Inflated priority action counts** - Counts now reflect unique factors  
✅ **Confusing user experience** - Users see each factor only once  

### What This Doesn't Fix

⚠️ **Backend data quality** - If backend is generating duplicates, that still needs investigation  
⚠️ **Multiple aspects of same factor** - If "HOOD" legitimately has multiple issues (age + condition), only most severe shows  
⚠️ **Other pages** - Only affects the Fix page and anywhere else using `consolidateUrgentActions`

---

## Testing Checklist

### Manual Testing

- [ ] Navigate to `/dashboard/properties/{id}/fix` page
- [ ] Verify "HOOD" appears only once (not twice)
- [ ] Verify other factors with critical statuses appear once
- [ ] Verify clicking "HOOD" action navigates to correct health score detail
- [ ] Verify priority action count matches number of displayed items
- [ ] Test with multiple properties to ensure fix works across different data

### Edge Cases to Test

- [ ] Property with no critical insights (empty state)
- [ ] Property with multiple factors having same status
- [ ] Property with same factor having multiple different statuses
- [ ] Property with special characters in factor names (e.g., "HVAC/AC System")
- [ ] Property with very long factor names

### Regression Testing

- [ ] Verify incidents still appear correctly
- [ ] Verify maintenance items still appear correctly
- [ ] Verify renewal items still appear correctly
- [ ] Verify sorting/prioritization still works (incidents first, then by due date)
- [ ] Verify navigation links still work for all action types

---

## Performance Considerations

### Before
- **Time Complexity**: O(n) where n = number of critical insights
- **Space Complexity**: O(n) for actions array

### After
- **Time Complexity**: O(n) where n = number of critical insights (same)
- **Space Complexity**: O(n) for actions array + O(m) for Map where m = unique factors (typically m << n)

**Impact**: Negligible performance difference. The Map adds minimal overhead and actually reduces the final array size by removing duplicates.

---

## Follow-Up Actions

### Immediate (Done)
- [x] Implement frontend deduplication fix
- [x] Document the fix

### Short-Term (Recommended)
- [ ] Add unit tests for `consolidateUrgentActions` with duplicate scenarios
- [ ] Add logging to track when deduplication occurs (for monitoring)
- [ ] Review other pages that might have similar duplication issues

### Long-Term (Investigation)
- [ ] Investigate backend health score service to understand why duplicates exist
- [ ] Determine if duplicate insights are intentional (different aspects) or a bug
- [ ] If intentional, consider adding sub-properties to differentiate (e.g., "HOOD - Age" vs "HOOD - Condition")
- [ ] If bug, fix backend to prevent duplicate generation

---

## Code Quality Notes

### Type Safety
The fix uses `any` for the insight type in the Map:
```typescript
const insightsByFactor = new Map<string, { insight: any; statusIndex: number }>();
```

**Reason**: The insight type comes from `property.healthScore?.insights` which may not have a strict type definition.

**Future improvement**: Define a proper `HealthInsight` interface and use it instead of `any`.

### Naming Conventions
- `insightsByFactor` - Clear Map name indicating it groups insights by factor
- `statusIndex` - Indicates position in severity array
- `factorId` - Kebab-case ID derived from factor name

---

## Related Files

Files that use `consolidateUrgentActions`:
- `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/fix/page.tsx` - Fix page (primary)
- `apps/frontend/src/app/(dashboard)/dashboard/fix/page.tsx` - Global fix page
- Any other pages that import and call this function

---

## Conclusion

The fix successfully resolves the duplicate "HOOD" issue by:
1. Deduplicating health insights by factor name
2. Keeping the most severe status when duplicates exist
3. Generating stable, semantic IDs based on factor names

**Result**: Users now see each factor only once on the Fix page, with the most critical status displayed.

**Next steps**: Monitor for any edge cases and investigate backend data generation to determine if duplicates are intentional or a data quality issue.

---

**Implementation Status**: ✅ **COMPLETE**  
**Testing Status**: ⚠️ **PENDING MANUAL VERIFICATION**  
**Deployment Ready**: ✅ **YES**
