# Root Cause Analysis: "HOOD" Appearing Twice on Fix Page

**Issue**: On the `/dashboard/properties/[id]/fix` page, "HOOD" appears twice in the Priority Actions section.

**Date**: April 27, 2026  
**Affected Page**: `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/fix/page.tsx`

---

## Root Cause Identified

The duplicate "HOOD" entries are being created in the **`consolidateUrgentActions`** function located at:
- **File**: `apps/frontend/src/lib/dashboard/urgentActions.ts`
- **Function**: `consolidateUrgentActions()`
- **Lines**: 80-91

### The Problem

The function iterates through `property.healthScore.insights` and creates a **separate UrgentActionItem for each insight** that matches critical statuses:

```typescript
properties.forEach((property) => {
  property.healthScore?.insights
    ?.filter((insight) => criticalStatuses.includes(insight.status))
    .forEach((insight, index) => {
      actions.push({
        id: `${property.id}-INSIGHT-${index}`,  // ⚠️ ID uses index, not insight content
        type: 'HEALTH_INSIGHT',
        title: insight.factor,                    // ⚠️ Title is the factor name (e.g., "HOOD")
        description: `Status: ${insight.status}. Requires resolution.`,
        propertyId: property.id,
      });
    });
});
```

### Why "HOOD" Appears Twice

There are **two separate health insights** in the property's health score data that both have:
- **Factor**: "HOOD" (or similar factor name)
- **Status**: One of the critical statuses (`'Needs attention'`, `'Needs Review'`, `'Needs Inspection'`, `'Missing Data'`, `'Needs Warranty'`)

This could happen because:

1. **Same factor, different statuses**: Two insights for "HOOD" with different status values (e.g., one "Needs attention", one "Needs Review")
2. **Same factor, different detail contexts**: Two insights for "HOOD" representing different aspects (e.g., age vs. condition)
3. **Duplicate data from backend**: The health score calculation is generating duplicate insights for the same factor

### The ID Generation Issue

The current ID generation uses an **index-based approach**:
```typescript
id: `${property.id}-INSIGHT-${index}`
```

This means:
- First HOOD insight: `{propertyId}-INSIGHT-0`
- Second HOOD insight: `{propertyId}-INSIGHT-1`

These are **unique IDs**, so React doesn't detect them as duplicates. Both render as separate cards.

---

## Evidence from Screenshot

Looking at the screenshot provided:
- Both "HOOD" cards show identical text:
  - Title: "HOOD"
  - Badge: "Repair vs Replace"
  - Description: "Educational estimate suggests planning a replacement soon while completing only essential repairs."
  - Button: "See Full Estimate"
  - Metadata: "Analyzed 12+ signals • Calculated 2 months ago • Updated today"

The identical content suggests these are **duplicate entries from the same underlying data**, not two different aspects of HOOD.

---

## Root Cause Categories

### Most Likely: Backend Data Duplication
The health score insights array contains duplicate entries for "HOOD" with the same or similar critical status.

**Where to investigate**:
- Health score calculation service (backend)
- Property health score snapshot generation
- Insight aggregation logic

### Possible: Frontend Deduplication Missing
The `consolidateUrgentActions` function doesn't deduplicate insights by factor name before creating action items.

**Current behavior**: Every insight becomes an action item, even if multiple insights share the same factor.

---

## Solutions

### Solution 1: Deduplicate by Factor Name (Frontend Fix - Quick)

Add deduplication logic in `consolidateUrgentActions`:

```typescript
properties.forEach((property) => {
  // Deduplicate insights by factor name, keeping the most severe
  const uniqueInsights = new Map<string, typeof property.healthScore.insights[0]>();
  
  property.healthScore?.insights
    ?.filter((insight) => criticalStatuses.includes(insight.status))
    .forEach((insight) => {
      const existing = uniqueInsights.get(insight.factor);
      if (!existing || criticalStatuses.indexOf(insight.status) < criticalStatuses.indexOf(existing.status)) {
        uniqueInsights.set(insight.factor, insight);
      }
    });

  // Now create actions from deduplicated insights
  Array.from(uniqueInsights.values()).forEach((insight, index) => {
    actions.push({
      id: `${property.id}-INSIGHT-${insight.factor}`, // Use factor name in ID
      type: 'HEALTH_INSIGHT',
      title: insight.factor,
      description: `Status: ${insight.status}. Requires resolution.`,
      propertyId: property.id,
    });
  });
});
```

**Pros**:
- Quick fix on frontend
- Handles duplicates regardless of backend source
- Keeps most severe status when multiple exist

**Cons**:
- Doesn't fix root cause if backend is generating duplicates
- May hide legitimate multiple insights for same factor

---

### Solution 2: Fix Backend Data Generation (Backend Fix - Proper)

Investigate and fix the health score insight generation to ensure:
1. Each factor appears only once in the insights array
2. If multiple aspects of a factor need tracking, use sub-properties or details array
3. Insight IDs are unique and based on factor + property combination

**Where to look**:
- Health score calculation service
- Insight aggregation logic
- Property snapshot generation

**Pros**:
- Fixes root cause
- Prevents duplicates across all pages
- Cleaner data model

**Cons**:
- Requires backend investigation
- May take longer to implement
- Need to understand why duplicates exist

---

### Solution 3: Hybrid Approach (Recommended)

1. **Immediate**: Apply frontend deduplication (Solution 1) to fix user-facing issue
2. **Follow-up**: Investigate backend to understand why duplicates exist
3. **Long-term**: Fix backend if duplicates are unintentional, or adjust frontend logic if they're intentional but need different display

---

## Recommended Action Plan

### Step 1: Verify the Data (Diagnostic)
Add logging to see the actual insights data:

```typescript
// In fix/page.tsx, after fetching data
console.log('Health insights for property:', {
  propertyId,
  insights: scoredProperties[0]?.healthScore?.insights,
  criticalInsights: scoredProperties[0]?.healthScore?.insights?.filter(
    i => criticalStatuses.includes(i.status)
  )
});
```

### Step 2: Apply Frontend Deduplication (Quick Fix)
Implement Solution 1 in `urgentActions.ts` to deduplicate by factor name.

### Step 3: Backend Investigation (Root Cause)
Check the health score service to understand:
- Why "HOOD" appears twice in insights
- Whether this is intentional (different aspects) or a bug
- If intentional, how to differentiate them in the UI

### Step 4: Update ID Generation
Change ID generation to use factor name instead of index:
```typescript
id: `${property.id}-INSIGHT-${insight.factor.toLowerCase().replace(/\s+/g, '-')}`
```

This makes IDs more stable and semantic.

---

## Testing Checklist

After implementing the fix:

- [ ] Verify "HOOD" appears only once on fix page
- [ ] Verify other factors with multiple insights are handled correctly
- [ ] Verify clicking the action navigates to correct health score detail
- [ ] Verify priority action count matches displayed items
- [ ] Test with properties that have no duplicates (regression test)
- [ ] Test with properties that have multiple critical factors

---

## Additional Notes

### Why This Wasn't Caught Earlier

1. **No uniqueness constraint**: The code doesn't enforce unique factor names in insights
2. **Index-based IDs**: Using array index creates unique IDs even for duplicate content
3. **No visual differentiation**: Both cards look identical, making it obvious to users but not to the system

### Related Issues to Check

1. Does "HOOD" appear twice on the health score detail page?
2. Do other factors have duplicates that aren't as obvious?
3. Is the dashboard "Priority Actions" count inflated by duplicates?

---

## Conclusion

**Root Cause**: The `consolidateUrgentActions` function creates a separate action item for each health insight without deduplicating by factor name. The property's health score data contains two insights for "HOOD" with critical statuses, resulting in two identical cards on the fix page.

**Immediate Fix**: Add deduplication logic in `consolidateUrgentActions` to keep only one insight per factor (preferring the most severe status).

**Long-term Fix**: Investigate backend health score generation to determine if duplicate insights are intentional or a data quality issue.

---

**Priority**: HIGH (user-facing duplicate content)  
**Complexity**: LOW (frontend fix) / MEDIUM (backend investigation)  
**Estimated Fix Time**: 30 minutes (frontend) / 2-4 hours (backend investigation)
