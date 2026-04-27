# FINDING 10: Dashboard Incident Routing Fix

## Issue
**Severity**: Medium

**The Bug**: The "Review incident" CTA on the dashboard falls back to the generic `/dashboard/actions` page when the incident ID is missing or invalid in the data payload.

**The Issue**: The button text still says "Review incident", breaking the pre-click promise. Users expect to see a specific incident but land on a generic actions page instead.

## Root Cause
The `resolveUrgentActionHref()` function had a single fallback path that didn't distinguish between different scenarios:
- Missing incident ID
- Missing property ID
- Both missing

This resulted in all edge cases routing to `/dashboard/actions`, which doesn't provide incident-specific context.

## Solution
Updated the `resolveUrgentActionHref()` function to handle incidents with proper fallbacks:

1. **If property ID and incident ID exist** → Route to specific incident page
   ```typescript
   `/dashboard/properties/${actionPropertyId}/incidents/${action.id}`
   ```

2. **If only property ID exists** → Route to incidents list for that property
   ```typescript
   `/dashboard/properties/${actionPropertyId}/incidents`
   ```

3. **If no property ID** → Route to resolution center with urgent filter
   ```typescript
   `/dashboard/resolution-center?filter=urgent`
   ```

## Implementation Details

### File Changed
- `apps/frontend/src/app/(dashboard)/dashboard/page.tsx`

### Code Changes
```typescript
function resolveUrgentActionHref(action: UrgentActionItem, propertyId?: string): string {
  const fallbackPropertyId = propertyId || undefined;
  const actionPropertyId =
    action.propertyId && action.propertyId !== 'N/A' ? action.propertyId : fallbackPropertyId;

  const propertyQuery = actionPropertyId ? `?propertyId=${encodeURIComponent(actionPropertyId)}` : '';

  // 🔑 FIXED: Better incident routing with proper fallbacks
  if (action.type === 'INCIDENT') {
    // If we have both property ID and incident ID, route to specific incident
    if (actionPropertyId && action.id) {
      return `/dashboard/properties/${actionPropertyId}/incidents/${action.id}`;
    }
    // If we have property ID but no incident ID, route to incidents list for that property
    if (actionPropertyId) {
      return `/dashboard/properties/${actionPropertyId}/incidents`;
    }
    // If no property ID, route to resolution center with urgent filter
    return `/dashboard/resolution-center?filter=urgent`;
  }
  
  // ... rest of function
}
```

## Benefits
1. **Preserves Context**: Each fallback maintains relevant context for the user
2. **Clear Navigation**: Users always land on a page that makes sense for their action
3. **Better UX**: No more broken promises - the destination matches the CTA intent
4. **Graceful Degradation**: Handles missing data elegantly without breaking the user flow

## Testing Scenarios
- ✅ Incident with both property ID and incident ID → Routes to specific incident
- ✅ Incident with property ID but no incident ID → Routes to property incidents list
- ✅ Incident with no property ID → Routes to resolution center with urgent filter
- ✅ No TypeScript errors
- ✅ Maintains backward compatibility

## Pattern Consistency
This fix follows the same pattern established in previous findings:
- FINDING 7: Coverage gaps routing to resolution-center with filter
- FINDING 9: Priority alerts routing to resolution-center with urgent filter

All navigation now uses the resolution-center infrastructure for filtered views, ensuring consistency across the application.
