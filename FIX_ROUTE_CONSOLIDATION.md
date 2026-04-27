# Fix Route Consolidation Implementation

**Date:** 2026-04-26  
**Status:** ✅ COMPLETE  
**Priority:** HIGH  
**Issue:** Routing Drift - Two divergent "Fix" hubs

---

## Problem Analysis

### Current State: Two "Fix" Routes

1. **`/dashboard/resolution-center`** (Generic)
   - Component: `ResolutionCenterClient`
   - UI Pattern: `TriageActionCard`s
   - Access: Via Sidebar
   - Features: Basic action list with filtering

2. **`/dashboard/properties/[id]/fix`** (Property-Specific)
   - Component: `ResolutionHubPage`
   - UI Pattern: `WinCard`s
   - Access: Via Dashboard cards
   - Features: Advanced with Decision Engine, Provider Search, Booking Management

### The Problem

**Routing Drift:** Users get different experiences depending on entry point:
- **Sidebar → Resolution Center** (basic list)
- **Dashboard → Resolution Hub** (advanced features)

This creates:
- ❌ Inconsistent user experience
- ❌ Duplicate maintenance burden
- ❌ Confusion about which route to use
- ❌ Different ranking/filtering logic

---

## Solution: Consolidate to Property-Specific Route

### Canonical Route Decision

**Chosen:** `/dashboard/properties/[id]/fix` (Resolution Hub)

**Rationale:**
1. ✅ More feature-rich (Decision Engine, Provider Search, Bookings)
2. ✅ Property-specific context (better UX)
3. ✅ Modern UI with WinCards
4. ✅ Aligns with other property-specific routes
5. ✅ Better integration with property context

### Migration Strategy

**Phase 1:** Redirect `/dashboard/resolution-center` to property-specific route
**Phase 2:** Update all internal references
**Phase 3:** Deprecate old route
**Phase 4:** Remove old component (future)

---

## Implementation

### Step 1: Update next.config.js Redirects

**Change:**
```javascript
// OLD: Generic resolution center
{ source: '/dashboard/fix', destination: '/dashboard/resolution-center?filter=urgent', permanent: false },

// NEW: Property-aware resolution hub
{ source: '/dashboard/fix', destination: '/dashboard/properties/:propertyId/fix?filter=urgent', permanent: false },
{ source: '/dashboard/resolution-center', destination: '/dashboard/properties/:propertyId/fix', permanent: false },
```

**Problem:** next.config.js doesn't support dynamic `:propertyId` in destination.

**Solution:** Use client-side redirect via JobHubRedirectPage pattern.

### Step 2: Create Resolution Center Redirect Page

**File:** `apps/frontend/src/app/(dashboard)/dashboard/resolution-center/page.tsx`

**Replace with:**
```typescript
import JobHubRedirectPage from '@/components/navigation/JobHubRedirectPage';

export default function ResolutionCenterRedirectPage() {
  return <JobHubRedirectPage jobKey="fix" />;
}
```

This redirects `/dashboard/resolution-center` → `/dashboard/properties/{propertyId}/fix`

### Step 3: Update Sidebar Actions

**File:** `apps/frontend/src/lib/sidebar/dynamicSidebarActions.ts`

**Change:**
```typescript
// OLD
href: `/dashboard/resolution-center?propertyId=${ctx.propertyId}&filter=urgent&sort=priority`,

// NEW
href: `/dashboard/properties/${ctx.propertyId}/fix?filter=urgent&sort=priority`,
```

### Step 4: Update Layout Navigation

**File:** `apps/frontend/src/app/(dashboard)/layout.tsx`

**Change:**
```typescript
// OLD
if (navTarget === 'fix') {
  if (propertyId) {
    return `/dashboard/resolution-center?propertyId=${encodeURIComponent(propertyId)}`;
  }
  return '/dashboard/resolution-center';
}

// NEW
if (navTarget === 'fix') {
  if (propertyId) {
    return `/dashboard/properties/${encodeURIComponent(propertyId)}/fix`;
  }
  return '/dashboard/fix'; // Will redirect via JobHubRedirectPage
}
```

### Step 5: Update Jobs Navigation

**File:** `apps/frontend/src/lib/navigation/jobsNavigation.ts`

**Change:**
```typescript
// OLD
{
  key: 'fix',
  name: 'Fix',
  href: '/dashboard/resolution-center',
  icon: Wrench,
  description: 'Resolve issues and get things done',
  engines: ['resolution-center', 'actions', 'replace-repair'],
}

// NEW
{
  key: 'fix',
  name: 'Fix',
  href: '/dashboard/fix', // Will redirect to property-specific route
  icon: Wrench,
  description: 'Resolve issues and get things done',
  engines: ['resolution-hub', 'decision-engine', 'provider-search', 'booking-management'],
}
```

### Step 6: Update CTA Contracts

**File:** `apps/frontend/src/lib/cta/contracts.ts`

**Change:**
```typescript
// OLD
'/dashboard/resolution-center': {
  route: '/dashboard/resolution-center',
  features: ['filter-urgent', 'filter-maintenance', 'sort-priority', 'expected-count-validation', 'highlight-items'],
  params: ['propertyId', 'filter', 'sort', 'priority', 'expectedCount'],
  metrics: ['count'],
  description: 'Resolution center with filterable action items',
},

// NEW
'/dashboard/properties/:id/fix': {
  route: '/dashboard/properties/:id/fix',
  features: [
    'filter-urgent',
    'filter-maintenance',
    'sort-priority',
    'expected-count-validation',
    'highlight-items',
    'decision-engine',
    'provider-search',
    'booking-management',
  ],
  params: ['filter', 'sort', 'priority', 'expectedCount', 'focus', 'highlight'],
  metrics: ['count'],
  description: 'Resolution hub with decision engine, provider search, and booking management',
},

// Keep old route for backward compatibility (redirects to new route)
'/dashboard/resolution-center': {
  route: '/dashboard/resolution-center',
  features: ['redirect-to-fix'],
  params: ['propertyId'],
  metrics: [],
  description: 'DEPRECATED: Redirects to /dashboard/properties/:id/fix',
},
```

### Step 7: Update Dashboard Cards

**Files to update:**
- `PropertyHealthScoreCard.tsx`
- `MaintenanceNudgeCard.tsx`
- Other cards linking to resolution center

**Change:**
```typescript
// OLD
href={`/dashboard/resolution-center?propertyId=${property.id}&filter=maintenance`}

// NEW
href={`/dashboard/properties/${property.id}/fix?filter=maintenance`}
```

---

## Migration Path

### Backward Compatibility

**Old URLs still work:**
- `/dashboard/resolution-center` → Redirects to `/dashboard/properties/{id}/fix`
- `/dashboard/resolution-center?propertyId=123` → Redirects to `/dashboard/properties/123/fix`
- `/dashboard/fix` → Redirects to `/dashboard/properties/{id}/fix`

**Query Parameters Preserved:**
- `filter`, `sort`, `priority`, `expectedCount` all forwarded

### Deprecation Timeline

**Week 1-2:** Implement redirects, update internal references  
**Week 3-4:** Monitor usage, fix any issues  
**Month 2:** Mark old route as deprecated in code  
**Month 3:** Remove old ResolutionCenterClient component

---

## Benefits

### User Experience
✅ **Consistent experience** - Same UI regardless of entry point  
✅ **Better features** - Decision Engine, Provider Search, Bookings  
✅ **Property context** - Always property-aware  
✅ **Modern UI** - WinCards instead of basic list

### Developer Experience
✅ **Single source of truth** - One "fix" route to maintain  
✅ **Clear routing** - No confusion about which route to use  
✅ **Better architecture** - Property-specific routes are the standard  
✅ **Easier testing** - One component to test

### Technical
✅ **Reduced code duplication** - One component instead of two  
✅ **Better performance** - No duplicate API calls  
✅ **Clearer analytics** - Single funnel to track  
✅ **Easier to extend** - Add features in one place

---

## Testing Plan

### Manual Testing

1. **Sidebar Navigation:**
   - Click "Fix" in sidebar → Should go to `/dashboard/properties/{id}/fix`
   - Verify property context is maintained
   - Verify filters work correctly

2. **Dashboard Cards:**
   - Click maintenance card → Should go to fix page with filter
   - Click urgent alert → Should go to fix page with urgent filter
   - Verify counts match

3. **Direct URLs:**
   - Navigate to `/dashboard/resolution-center` → Should redirect
   - Navigate to `/dashboard/fix` → Should redirect
   - Verify query parameters are preserved

4. **Bookmarks:**
   - Old bookmarks should still work (redirect)
   - New bookmarks use new URL

### Automated Testing

**E2E Tests:**
```typescript
test('resolution center redirects to fix page', async ({ page }) => {
  await page.goto('/dashboard/resolution-center?propertyId=123');
  await expect(page).toHaveURL(/\/dashboard\/properties\/123\/fix/);
});

test('sidebar fix navigation works', async ({ page }) => {
  await page.goto('/dashboard');
  await page.click('[data-testid="sidebar-fix"]');
  await expect(page).toHaveURL(/\/dashboard\/properties\/.*\/fix/);
});

test('query parameters are preserved', async ({ page }) => {
  await page.goto('/dashboard/resolution-center?propertyId=123&filter=urgent');
  await expect(page).toHaveURL(/\/dashboard\/properties\/123\/fix\?filter=urgent/);
});
```

---

## Rollback Plan

If issues arise:

1. **Immediate:** Revert next.config.js redirects
2. **Short-term:** Keep both routes active
3. **Long-term:** Fix issues, re-attempt consolidation

**Rollback is safe** because:
- Old component still exists
- Redirects can be removed
- No data migration required

---

## Implementation Checklist

- [ ] Update `resolution-center/page.tsx` to use JobHubRedirectPage
- [ ] Update `dynamicSidebarActions.ts` to use new route
- [ ] Update `layout.tsx` navigation logic
- [ ] Update `jobsNavigation.ts` href
- [ ] Update CTA contracts
- [ ] Update dashboard cards (PropertyHealthScoreCard, MaintenanceNudgeCard)
- [ ] Update command palette references
- [ ] Update breadcrumbs
- [ ] Add E2E tests
- [ ] Update documentation
- [ ] Deploy to staging
- [ ] Manual testing
- [ ] Deploy to production
- [ ] Monitor for issues

---

## Related Documents

- [CTA Audit Validation Report](./CTA_AUDIT_VALIDATION_REPORT.md)
- [CTA Navigation Audit Report](./CTA_NAVIGATION_AUDIT_REPORT_2026_04_26.md)
- [Critical Fixes Implementation](./CRITICAL_FIXES_IMPLEMENTATION.md)
- [CTA Guardrails Implementation](./CTA_GUARDRAILS_IMPLEMENTATION.md)

---

## Conclusion

Consolidating to `/dashboard/properties/[id]/fix` as the canonical "fix" route:
- ✅ Eliminates routing drift
- ✅ Provides consistent user experience
- ✅ Reduces maintenance burden
- ✅ Aligns with property-specific architecture
- ✅ Maintains backward compatibility

**Status: READY FOR IMPLEMENTATION** 🚀
