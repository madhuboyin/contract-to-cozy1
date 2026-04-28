# Implementation Prompt: Add Coverage Gap Actions to Priority Actions System

## Objective

Fix the broken "View in Actions" flow from the Inventory Coverage Tab by adding coverage gap actions to the priority actions system. When users click "View in Actions" from "Items needing coverage (4)", they should see those 4 items as actionable priority actions on the Fix page with `filter=coverage`.

---

## Problem Statement

**Current Behavior (Broken)**:
1. User views Inventory page → Coverage Tab
2. Sees "Items needing coverage (4)" section showing Dishwasher, Refrigerator, Oven Range, Washer Dryer
3. Clicks "View in Actions →" button
4. Navigates to `/dashboard/properties/{id}/fix?filter=coverage`
5. Page shows "No coverage Actions" despite having 4 items

**Root Cause**:
- The `filter=coverage` only shows `RENEWAL_EXPIRED` and `RENEWAL_UPCOMING` action types (existing policies expiring)
- Coverage gaps (items without coverage) are NOT represented in the priority actions system at all
- The `consolidateUrgentActions` function doesn't create actions for inventory items lacking coverage

**Expected Behavior (After Fix)**:
1. User views Inventory page → Coverage Tab
2. Sees "Items needing coverage (4)" section
3. Clicks "View in Actions →" button
4. Navigates to `/dashboard/properties/{id}/fix?filter=coverage`
5. Page shows 4 coverage gap actions (one for each item)
6. User can click each action to navigate to that item's coverage setup

---

## Implementation Requirements

### 1. Add New Action Types

**File**: `apps/frontend/src/lib/dashboard/urgentActions.ts`

**Update the `UrgentActionItem` interface** (lines 4-17):

```typescript
export interface UrgentActionItem {
  id: string;
  type:
    | 'MAINTENANCE_OVERDUE'
    | 'MAINTENANCE_UNSCHEDULED'
    | 'RENEWAL_EXPIRED'
    | 'RENEWAL_UPCOMING'
    | 'HEALTH_INSIGHT'
    | 'INCIDENT'
    | 'COVERAGE_GAP'      // NEW: Item has no warranty AND no insurance
    | 'COVERAGE_PARTIAL'; // NEW: Item has only warranty OR insurance (not both)
  title: string;
  description: string;
  dueDate?: Date;
  daysUntilDue?: number;
  propertyId: string;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  entityType?: 'Warranty' | 'Insurance';
  itemId?: string; // NEW: For coverage gap actions, store the inventory item ID
}
```

---

### 2. Update `consolidateUrgentActions` Function

**File**: `apps/frontend/src/lib/dashboard/urgentActions.ts`

**Add inventory items parameter** (line 56):

```typescript
export function consolidateUrgentActions(
  properties: ScoredProperty[],
  checklistItems: ChecklistEntry[],
  warranties: Warranty[],
  insurancePolicies: InsurancePolicy[],
  incidents: IncidentDTO[],
  inventoryItems?: InventoryItem[], // NEW: Optional inventory items for coverage gap detection
): UrgentActionItem[] {
```

**Add coverage gap logic** (after the renewals section, around line 145):

```typescript
  // NEW: Coverage gap actions for inventory items without coverage
  if (inventoryItems) {
    inventoryItems.forEach((item) => {
      const hasWarranty = Boolean(item.warrantyId);
      const hasInsurance = Boolean(item.insurancePolicyId);
      const replacementValue = item.replacementCostCents ? item.replacementCostCents / 100 : 0;
      
      // Only create actions for items with significant value (> $100)
      if (replacementValue < 100) return;
      
      // Item has no coverage at all (highest priority)
      if (!hasWarranty && !hasInsurance) {
        actions.push({
          id: `COVERAGE-GAP-${item.id}`,
          type: 'COVERAGE_GAP',
          title: `${item.name} needs coverage`,
          description: `No warranty or insurance coverage. Replacement value: $${replacementValue.toFixed(0)}.`,
          propertyId: item.propertyId || 'N/A',
          severity: 'WARNING',
          itemId: item.id,
        });
      }
      // Item has partial coverage (only warranty OR insurance, not both)
      else if (!hasWarranty || !hasInsurance) {
        actions.push({
          id: `COVERAGE-PARTIAL-${item.id}`,
          type: 'COVERAGE_PARTIAL',
          title: `${item.name} has partial coverage`,
          description: `Missing ${!hasWarranty ? 'warranty' : 'insurance'} coverage. Replacement value: $${replacementValue.toFixed(0)}.`,
          propertyId: item.propertyId || 'N/A',
          severity: 'INFO',
          itemId: item.id,
        });
      }
    });
  }

  return actions.sort((a, b) => {
```

**Update the sorting logic** (around line 150) to prioritize coverage gaps:

```typescript
  return actions.sort((a, b) => {
    // Incidents always first
    if (a.type === 'INCIDENT' && b.type !== 'INCIDENT') return -1;
    if (b.type === 'INCIDENT' && a.type !== 'INCIDENT') return 1;
    
    // Coverage gaps second (high priority)
    if (a.type === 'COVERAGE_GAP' && b.type !== 'COVERAGE_GAP' && b.type !== 'INCIDENT') return -1;
    if (b.type === 'COVERAGE_GAP' && a.type !== 'COVERAGE_GAP' && a.type !== 'INCIDENT') return 1;
    
    // Then sort by due date
    if (a.daysUntilDue === undefined) return 1;
    if (b.daysUntilDue === undefined) return -1;
    return a.daysUntilDue - b.daysUntilDue;
  });
```

---

### 3. Update `resolveUrgentActionHref` Function

**File**: `apps/frontend/src/lib/dashboard/urgentActions.ts`

**Add coverage gap navigation** (around line 175, before the final return):

```typescript
  // NEW: Coverage gap actions navigate to inventory coverage tab
  if (action.type === 'COVERAGE_GAP' || action.type === 'COVERAGE_PARTIAL') {
    if (actionPropertyId && action.itemId) {
      // Navigate to inventory page, coverage tab, with item highlighted
      return `/dashboard/properties/${actionPropertyId}/inventory?tab=coverage&highlight=${action.itemId}`;
    }
    // Fallback to vault coverage tab if no property context
    return `/dashboard/vault?tab=coverage`;
  }
```

---

### 4. Update Fix Page to Pass Inventory Items

**File**: `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/fix/page.tsx`

**Add inventory items fetch** (around line 140, in the fetchData function):

```typescript
  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [
        bookingsRes,
        resolutionsRes,
        propertiesRes,
        checklistRes,
        warrantiesRes,
        policiesRes,
        incidentsRes,
        inventoryRes, // NEW: Fetch inventory items
      ] = await Promise.all([
        api.listBookings({ propertyId: propertyId || undefined }),
        propertyId
          ? api.getPropertyResolutions(propertyId)
          : Promise.resolve({ success: true, data: [] }),
        api.getProperties().catch(() => ({ success: false, data: { properties: [] } })),
        api.getHomeBuyerChecklist().catch(() => ({ success: false, data: null })),
        api.listWarranties(propertyId || undefined).catch(() => ({ success: false, data: { warranties: [] } })),
        api.listInsurancePolicies(propertyId || undefined).catch(() => ({ success: false, data: { policies: [] } })),
        propertyId
          ? listIncidents({ propertyId, limit: 10 }).catch(() => ({ items: [] }))
          : Promise.resolve({ items: [] }),
        propertyId // NEW: Fetch inventory items for coverage gap detection
          ? api.listInventoryItems(propertyId).catch(() => ({ success: false, data: { items: [] } }))
          : Promise.resolve({ success: true, data: { items: [] } }),
      ]);
```

**Extract inventory items** (around line 180):

```typescript
      const warranties = warrantiesRes.success ? warrantiesRes.data.warranties : [];
      const policies = policiesRes.success ? policiesRes.data.policies : [];
      const activeIncidents = (incidentsRes as { items?: any[] }).items ?? [];
      const inventoryItems = inventoryRes.success ? inventoryRes.data.items : []; // NEW
```

**Pass inventory items to consolidateUrgentActions** (around line 190):

```typescript
      setPriorityActions(
        consolidateUrgentActions(
          scoredProperties,
          getChecklistEntries(checklist),
          warranties,
          policies,
          activeIncidents,
          inventoryItems, // NEW: Pass inventory items
        ),
      );
```

---

### 5. Update Coverage Filter

**File**: `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/fix/page.tsx`

**Update the coverage filter logic** (around line 245):

```typescript
    if (filter === 'coverage') {
      return priorityActions.filter(
        (a) => 
          a.type === 'RENEWAL_EXPIRED' || 
          a.type === 'RENEWAL_UPCOMING' ||
          a.type === 'COVERAGE_GAP' ||      // NEW: Include coverage gaps
          a.type === 'COVERAGE_PARTIAL'     // NEW: Include partial coverage
      );
    }
```

---

### 6. Update Priority Action Tone Function

**File**: `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/fix/page.tsx`

**Add coverage gap handling** (around line 50, in the `priorityActionTone` function):

```typescript
function priorityActionTone(action: UrgentActionItem): {
  confidenceLabel: string;
  sourceLabel: string;
  rationale: string;
} {
  if (action.type === 'INCIDENT') {
    return {
      confidenceLabel: action.severity || 'WARNING',
      sourceLabel: 'Incident monitoring',
      rationale: 'Triggered by a live property signal that needs attention.',
    };
  }
  if (action.type === 'HEALTH_INSIGHT') {
    return {
      confidenceLabel: 'High confidence',
      sourceLabel: 'Health score engine',
      rationale: 'This action directly affects your property health score.',
    };
  }
  // NEW: Coverage gap handling
  if (action.type === 'COVERAGE_GAP') {
    return {
      confidenceLabel: 'High priority',
      sourceLabel: 'Coverage tracking',
      rationale: 'This item has no warranty or insurance protection.',
    };
  }
  if (action.type === 'COVERAGE_PARTIAL') {
    return {
      confidenceLabel: 'Recommended',
      sourceLabel: 'Coverage tracking',
      rationale: 'This item is only partially protected.',
    };
  }
  if (action.type === 'RENEWAL_EXPIRED' || action.type === 'RENEWAL_UPCOMING') {
    return {
      confidenceLabel: 'Time-sensitive',
      sourceLabel: 'Coverage tracking',
      rationale: 'Coverage timing can create avoidable exposure if missed.',
    };
  }
  return {
    confidenceLabel: 'Needs action',
    sourceLabel: 'Maintenance tracking',
    rationale: 'This item is overdue and should be resolved soon.',
  };
}
```

---

### 7. Add TypeScript Type Import

**File**: `apps/frontend/src/lib/dashboard/urgentActions.ts`

**Add InventoryItem import** (line 2):

```typescript
import { differenceInDays, isPast, parseISO } from 'date-fns';
import { HomeBuyerChecklist, InsurancePolicy, InventoryItem, ScoredProperty, Warranty } from '@/types'; // Add InventoryItem
import { IncidentDTO } from '@/types/incidents.types';
```

---

### 8. Update Inventory Coverage Tab Highlighting (Optional Enhancement)

**File**: `apps/frontend/src/app/(dashboard)/dashboard/components/inventory/CoverageTab.tsx`

**Add highlight support** (around line 180, in the item rendering):

```typescript
{gapItems.map((item) => {
  const Icon = resolveIcon(
    getInventoryItemIcon({
      name: item.name,
      type: (item as any).type ?? (item as any).itemType,
      category: item.category,
      subtype: (item as any).subtype,
      kind: (item as any).kind,
      label: (item as any).label ?? (item as any).displayName,
      applianceType: (item as any).applianceType,
      sourceHash: item.sourceHash,
    }),
    HelpCircle,
  );
  const replacementValue = centsToDollars(item.replacementCostCents);
  
  // NEW: Check if this item should be highlighted
  const isHighlighted = searchParams.get('highlight') === item.id;

  return (
    <div 
      key={item.id} 
      className={`flex flex-col gap-2 border-b border-gray-100 py-2 last:border-0 sm:flex-row sm:items-center sm:justify-between ${
        isHighlighted ? 'bg-yellow-50 border-yellow-200 rounded-lg px-3 -mx-3' : ''
      }`}
      data-item-id={item.id}
    >
```

**Add scroll-to-highlight effect** (add useEffect at component level):

```typescript
import { useSearchParams } from 'next/navigation';

export default function CoverageTab({ items, rooms, onOpenCoverage, onOpenActions }: CoverageTabProps) {
  const searchParams = useSearchParams();
  
  // NEW: Scroll to highlighted item
  useEffect(() => {
    const highlightId = searchParams.get('highlight');
    if (highlightId) {
      setTimeout(() => {
        const element = document.querySelector(`[data-item-id="${highlightId}"]`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    }
  }, [searchParams]);
```

---

## Testing Requirements

### Unit Tests

Create test file: `apps/frontend/src/lib/dashboard/urgentActions.test.ts`

```typescript
import { consolidateUrgentActions } from './urgentActions';
import { InventoryItem } from '@/types';

describe('consolidateUrgentActions - Coverage Gaps', () => {
  it('should create COVERAGE_GAP action for item with no coverage', () => {
    const inventoryItems: InventoryItem[] = [
      {
        id: 'item-1',
        name: 'Dishwasher',
        propertyId: 'prop-1',
        warrantyId: null,
        insurancePolicyId: null,
        replacementCostCents: 50000, // $500
      },
    ];

    const actions = consolidateUrgentActions([], [], [], [], [], inventoryItems);

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('COVERAGE_GAP');
    expect(actions[0].title).toBe('Dishwasher needs coverage');
    expect(actions[0].itemId).toBe('item-1');
  });

  it('should create COVERAGE_PARTIAL action for item with only warranty', () => {
    const inventoryItems: InventoryItem[] = [
      {
        id: 'item-2',
        name: 'Refrigerator',
        propertyId: 'prop-1',
        warrantyId: 'warranty-1',
        insurancePolicyId: null,
        replacementCostCents: 100000, // $1000
      },
    ];

    const actions = consolidateUrgentActions([], [], [], [], [], inventoryItems);

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('COVERAGE_PARTIAL');
    expect(actions[0].title).toBe('Refrigerator has partial coverage');
  });

  it('should not create action for fully covered item', () => {
    const inventoryItems: InventoryItem[] = [
      {
        id: 'item-3',
        name: 'Oven',
        propertyId: 'prop-1',
        warrantyId: 'warranty-1',
        insurancePolicyId: 'policy-1',
        replacementCostCents: 80000,
      },
    ];

    const actions = consolidateUrgentActions([], [], [], [], [], inventoryItems);

    expect(actions).toHaveLength(0);
  });

  it('should not create action for low-value items (<$100)', () => {
    const inventoryItems: InventoryItem[] = [
      {
        id: 'item-4',
        name: 'Cheap Item',
        propertyId: 'prop-1',
        warrantyId: null,
        insurancePolicyId: null,
        replacementCostCents: 5000, // $50
      },
    ];

    const actions = consolidateUrgentActions([], [], [], [], [], inventoryItems);

    expect(actions).toHaveLength(0);
  });

  it('should prioritize COVERAGE_GAP over COVERAGE_PARTIAL', () => {
    const inventoryItems: InventoryItem[] = [
      {
        id: 'item-5',
        name: 'Partial Item',
        propertyId: 'prop-1',
        warrantyId: 'warranty-1',
        insurancePolicyId: null,
        replacementCostCents: 50000,
      },
      {
        id: 'item-6',
        name: 'No Coverage Item',
        propertyId: 'prop-1',
        warrantyId: null,
        insurancePolicyId: null,
        replacementCostCents: 50000,
      },
    ];

    const actions = consolidateUrgentActions([], [], [], [], [], inventoryItems);

    expect(actions).toHaveLength(2);
    expect(actions[0].type).toBe('COVERAGE_GAP'); // Should be first
    expect(actions[1].type).toBe('COVERAGE_PARTIAL');
  });
});
```

### Manual Testing Checklist

#### Test Case 1: Coverage Gaps Appear on Fix Page
- [ ] Navigate to property with 4 items needing coverage
- [ ] Go to Inventory → Coverage Tab
- [ ] Verify "Items needing coverage (4)" section shows 4 items
- [ ] Click "View in Actions →" button
- [ ] Verify URL is `/dashboard/properties/{id}/fix?filter=coverage`
- [ ] Verify page shows 4 coverage gap actions (not "No coverage Actions")
- [ ] Verify each action shows correct item name and replacement value

#### Test Case 2: Coverage Gap Action Navigation
- [ ] On Fix page with coverage filter
- [ ] Click on a coverage gap action (e.g., "Dishwasher needs coverage")
- [ ] Verify navigation to `/dashboard/properties/{id}/inventory?tab=coverage&highlight={itemId}`
- [ ] Verify the correct item is highlighted in the coverage gaps section
- [ ] Verify page scrolls to the highlighted item

#### Test Case 3: Mixed Coverage Actions
- [ ] Create a property with:
  - 2 items with no coverage (COVERAGE_GAP)
  - 1 item with only warranty (COVERAGE_PARTIAL)
  - 1 expired warranty renewal (RENEWAL_EXPIRED)
- [ ] Navigate to Fix page with `filter=coverage`
- [ ] Verify all 4 actions appear
- [ ] Verify coverage gaps appear before partial coverage
- [ ] Verify renewal actions also appear

#### Test Case 4: Empty State
- [ ] Create a property with all items fully covered
- [ ] Navigate to Fix page with `filter=coverage`
- [ ] Verify "No coverage Actions" message appears (correct behavior)

#### Test Case 5: Low-Value Items Excluded
- [ ] Create a property with items < $100 replacement value
- [ ] Verify these items do NOT create coverage gap actions
- [ ] Verify only items ≥ $100 create actions

#### Test Case 6: Priority Action Count
- [ ] Navigate to Fix page without filter
- [ ] Verify "Priority actions" KPI count includes coverage gaps
- [ ] Apply `filter=coverage`
- [ ] Verify filtered count matches displayed actions

#### Test Case 7: Action Tone and Metadata
- [ ] View a coverage gap action card
- [ ] Verify it shows:
  - Confidence label: "High priority"
  - Source label: "Coverage tracking"
  - Rationale: "This item has no warranty or insurance protection."
- [ ] View a partial coverage action card
- [ ] Verify it shows:
  - Confidence label: "Recommended"
  - Rationale: "This item is only partially protected."

#### Test Case 8: Sorting and Prioritization
- [ ] Create a property with multiple action types:
  - 1 incident
  - 1 coverage gap
  - 1 health insight
  - 1 maintenance overdue
- [ ] Navigate to Fix page without filter
- [ ] Verify order: Incident → Coverage Gap → Others

---

## Edge Cases to Handle

### 1. Missing Replacement Cost
```typescript
const replacementValue = item.replacementCostCents ? item.replacementCostCents / 100 : 0;
```
If `replacementCostCents` is null/undefined, default to 0 and skip action creation.

### 2. Missing Property ID
```typescript
propertyId: item.propertyId || 'N/A',
```
Use 'N/A' as fallback if property ID is missing.

### 3. Missing Item ID in Action
```typescript
if (actionPropertyId && action.itemId) {
  return `/dashboard/properties/${actionPropertyId}/inventory?tab=coverage&highlight=${action.itemId}`;
}
```
Only add highlight parameter if itemId exists.

### 4. Inventory Items Not Loaded
```typescript
if (inventoryItems) {
  // Only process if inventory items are provided
}
```
Make inventory items optional - if not provided, no coverage gap actions are created.

### 5. API Fetch Failure
```typescript
propertyId
  ? api.listInventoryItems(propertyId).catch(() => ({ success: false, data: { items: [] } }))
  : Promise.resolve({ success: true, data: { items: [] } }),
```
Gracefully handle API failures by returning empty array.

---

## Performance Considerations

### 1. Filter Low-Value Items Early
```typescript
if (replacementValue < 100) return;
```
Skip processing items < $100 to reduce action count.

### 2. Limit Coverage Gap Actions
If a property has 100+ items without coverage, consider:
- Only showing top 10 highest-value items
- Adding pagination to coverage gap actions
- Grouping by room or category

**Suggested implementation**:
```typescript
// Sort by replacement value descending, take top 20
const significantGaps = inventoryItems
  .filter(item => {
    const hasWarranty = Boolean(item.warrantyId);
    const hasInsurance = Boolean(item.insurancePolicyId);
    const value = item.replacementCostCents ? item.replacementCostCents / 100 : 0;
    return value >= 100 && (!hasWarranty || !hasInsurance);
  })
  .sort((a, b) => (b.replacementCostCents || 0) - (a.replacementCostCents || 0))
  .slice(0, 20);

significantGaps.forEach(item => {
  // Create actions
});
```

### 3. Memoize Coverage Status Calculation
If performance becomes an issue, consider memoizing the coverage status calculation in the inventory components.

---

## API Requirements

### Verify API Method Exists

**Check if `api.listInventoryItems` exists**:
- File: `apps/frontend/src/lib/api/client.ts`
- Method: `listInventoryItems(propertyId: string)`
- Returns: `Promise<{ success: boolean; data: { items: InventoryItem[] } }>`

**If method doesn't exist**, add it:

```typescript
async listInventoryItems(propertyId: string) {
  const response = await fetch(`${this.baseUrl}/api/inventory?propertyId=${propertyId}`, {
    headers: this.getHeaders(),
  });
  return this.handleResponse(response);
}
```

---

## Rollout Strategy

### Phase 1: Core Implementation (Day 1)
1. Add new action types to `UrgentActionItem` interface
2. Update `consolidateUrgentActions` to create coverage gap actions
3. Update `resolveUrgentActionHref` for navigation
4. Add unit tests

### Phase 2: Integration (Day 2)
1. Update Fix page to fetch and pass inventory items
2. Update coverage filter to include new action types
3. Update `priorityActionTone` function
4. Manual testing of basic flow

### Phase 3: Enhancement (Day 3)
1. Add highlighting support in CoverageTab
2. Add scroll-to-item functionality
3. Performance optimization (limit to top 20 items)
4. Comprehensive testing

### Phase 4: Monitoring (Day 4+)
1. Monitor priority action counts
2. Gather user feedback
3. Adjust thresholds ($100 minimum, top 20 limit) based on data
4. Consider adding analytics events

---

## Success Criteria

✅ **User Flow Fixed**:
- Clicking "View in Actions" from Coverage Tab shows coverage gap actions
- Count matches: 4 items in inventory = 4 actions on Fix page

✅ **Navigation Works**:
- Clicking coverage gap action navigates to correct inventory item
- Item is highlighted and scrolled into view

✅ **Filtering Works**:
- `filter=coverage` includes coverage gaps, partial coverage, and renewals
- Empty state shows when no coverage actions exist

✅ **Performance Acceptable**:
- Page load time < 2 seconds with 100+ inventory items
- No UI lag when filtering actions

✅ **Tests Pass**:
- All unit tests pass
- All manual test cases pass
- No regressions in existing functionality

---

## Rollback Plan

If issues arise after deployment:

### Quick Rollback (< 5 minutes)
1. Revert the coverage filter change:
```typescript
if (filter === 'coverage') {
  return priorityActions.filter(
    (a) => a.type === 'RENEWAL_EXPIRED' || a.type === 'RENEWAL_UPCOMING'
    // Remove: || a.type === 'COVERAGE_GAP' || a.type === 'COVERAGE_PARTIAL'
  );
}
```

2. This will restore the "No coverage Actions" behavior but prevent errors

### Full Rollback (< 30 minutes)
1. Revert all changes to `urgentActions.ts`
2. Revert changes to Fix page
3. Deploy previous version

---

## Documentation Updates

After implementation, update:

1. **README.md** - Add coverage gap actions to priority actions documentation
2. **API Documentation** - Document new action types
3. **User Guide** - Explain how coverage gap actions work
4. **Developer Guide** - Document the coverage gap detection logic

---

## Questions to Resolve Before Implementation

1. **Threshold**: Is $100 the right minimum replacement value? Should it be configurable?
2. **Limit**: Should we limit to top 20 items, or show all coverage gaps?
3. **Grouping**: Should coverage gaps be grouped by room or category?
4. **Severity**: Should COVERAGE_GAP be 'CRITICAL' instead of 'WARNING'?
5. **Partial Coverage**: Should we create actions for partial coverage, or only full gaps?
6. **Navigation**: Should clicking a coverage gap action open a modal or navigate to inventory?

---

## Implementation Checklist

- [ ] Add new action types to `UrgentActionItem` interface
- [ ] Add `InventoryItem` import to `urgentActions.ts`
- [ ] Update `consolidateUrgentActions` function signature
- [ ] Add coverage gap detection logic
- [ ] Update sorting logic to prioritize coverage gaps
- [ ] Update `resolveUrgentActionHref` for coverage gap navigation
- [ ] Update Fix page to fetch inventory items
- [ ] Pass inventory items to `consolidateUrgentActions`
- [ ] Update coverage filter to include new action types
- [ ] Update `priorityActionTone` function
- [ ] Add highlighting support in CoverageTab (optional)
- [ ] Add scroll-to-item functionality (optional)
- [ ] Write unit tests
- [ ] Run manual test cases
- [ ] Update documentation
- [ ] Deploy to staging
- [ ] QA testing
- [ ] Deploy to production
- [ ] Monitor metrics

---

**Estimated Implementation Time**: 6-8 hours  
**Priority**: HIGH (broken user flow)  
**Complexity**: MEDIUM  
**Risk**: LOW (additive change, no breaking changes)

---

**Ready to implement? Start with Phase 1 (Core Implementation) and work through the checklist systematically.**
