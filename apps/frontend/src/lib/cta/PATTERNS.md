# CTA Design Patterns

This document outlines proven patterns for implementing CTAs that deliver on their promises.

## Core Principles

### 1. Promise-Destination Alignment
Every CTA must deliver exactly what it visually promises.

❌ **Anti-pattern:**
```typescript
// Card shows "3 maintenance items"
<div>3 maintenance items</div>
// But navigates to generic page
<Link href="/dashboard/health-score">View Details</Link>
```

✅ **Correct pattern:**
```typescript
// Card shows "3 maintenance items"
<div>3 maintenance items</div>
// Navigates to filtered view showing those 3 items
const href = cta('maintenance-items', 'HealthCard')
  .promises('Review maintenance items')
  .withCount(3, 'maintenance items')
  .navigatesTo('/dashboard/resolution-center')
  .withParam('filter', 'maintenance')
  .withParam('expectedCount', 3)
  .requires('filter-maintenance')
  .requires('expected-count-validation')
  .buildHref();
```

### 2. Metric Consistency
Displayed metrics must match destination page metrics exactly.

❌ **Anti-pattern:**
```typescript
// Card calculates savings one way
const cardSavings = calculateSavingsMethod1(data);

// Page calculates savings differently
const pageSavings = calculateSavingsMethod2(data);
```

✅ **Correct pattern:**
```typescript
// Shared calculation function
const savings = calculateSavings(data);

// Card uses shared function
<div>{formatCurrency(savings.monthly)}</div>

// Page uses same function and validates
const href = cta('view-savings', 'SavingsCard')
  .withAmount(savings.monthly, 'monthly savings')
  .withParam('expectedMonthly', savings.monthly)
  .requires('expected-amount-validation')
  .buildHref();
```

### 3. Context Preservation
Important context should be preserved across navigation.

✅ **Pattern:**
```typescript
const href = cta('contextual-action', 'MyCard')
  .promises('Take action')
  .withContext('source', 'dashboard-card')
  .withContext('propertyId', propertyId)
  .withContext('timestamp', Date.now())
  .navigatesTo('/action-page')
  .withParams({
    source: 'dashboard-card',
    propertyId,
    timestamp: Date.now(),
  })
  .buildHref();
```

## Common Patterns

### Pattern 1: Count-Based CTAs

**Use Case:** Card shows a count, user expects to see those exact items.

**Implementation:**
```typescript
const itemCount = items.length;

const href = cta('review-items', 'ItemCard')
  .promises(`Review ${itemCount} items`)
  .withCount(itemCount, 'items')
  .withPriority('critical')
  .navigatesTo('/dashboard/items')
  .withParams({
    filter: 'active',
    expectedCount: itemCount,
    source: 'card',
  })
  .requires('filter-active')
  .requires('expected-count-validation')
  .buildHref();
```

**Destination Page Requirements:**
- Must display exactly `expectedCount` items
- Must show validation if count doesn't match
- Must support the specified filter

**Example Validation:**
```typescript
// On destination page
const expectedCount = parseInt(searchParams.get('expectedCount') || '0');
const actualCount = items.length;

if (expectedCount > 0 && actualCount !== expectedCount) {
  showWarning(`Expected ${expectedCount} items but found ${actualCount}`);
}
```

### Pattern 2: Amount-Based CTAs

**Use Case:** Card shows monetary amounts, user expects to see breakdown.

**Implementation:**
```typescript
const monthlyAmount = 240;
const annualAmount = 2880;

const href = cta('view-savings', 'SavingsCard')
  .promises('View savings breakdown')
  .withAmount(monthlyAmount, 'monthly savings', 'USD')
  .withAmount(annualAmount, 'annual savings', 'USD')
  .withPriority('critical')
  .navigatesTo('/tools/savings')
  .withParams({
    expectedMonthly: monthlyAmount,
    expectedAnnual: annualAmount,
    highlight: 'breakdown',
  })
  .requires('expected-amount-validation')
  .requires('highlight-breakdown')
  .buildHref();
```

**Destination Page Requirements:**
- Must display the exact amounts prominently
- Must show breakdown that adds up to the amounts
- Must validate amounts match expectations

**Example Validation:**
```typescript
// On destination page
const expectedMonthly = parseFloat(searchParams.get('expectedMonthly') || '0');
const calculatedMonthly = calculateMonthlySavings();

if (Math.abs(expectedMonthly - calculatedMonthly) > 0.01) {
  showError(`Expected $${expectedMonthly} but calculated $${calculatedMonthly}`);
}
```

### Pattern 3: Filter-Based CTAs

**Use Case:** Card promises to show filtered subset of data.

**Implementation:**
```typescript
const urgentCount = urgentItems.length;

const href = cta('review-urgent', 'AlertCard')
  .promises('Review urgent alerts')
  .withCount(urgentCount, 'urgent alerts')
  .navigatesTo('/dashboard/alerts')
  .withParams({
    filter: 'urgent',
    sort: 'priority-desc',
    expectedCount: urgentCount,
  })
  .requires('filter-urgent')
  .requires('sort-priority')
  .requires('expected-count-validation')
  .buildHref();
```

**Destination Page Requirements:**
- Must support the specified filter
- Must apply filter automatically
- Must show only filtered items
- Must validate count matches

### Pattern 4: Focus-Based CTAs

**Use Case:** Card promises to focus on specific section of a page.

**Implementation:**
```typescript
const exposureAmount = 12450;

const href = cta('review-exposure', 'RiskCard')
  .promises('Review risk exposure')
  .withAmount(exposureAmount, 'exposure amount', 'USD')
  .navigatesTo('/dashboard/risk-assessment')
  .withParams({
    focus: 'exposure',
    amount: exposureAmount,
    highlight: 'true',
  })
  .requires('focus-exposure')
  .requires('amount-validation')
  .buildHref();
```

**Destination Page Requirements:**
- Must scroll to or highlight the focused section
- Must display the amount prominently in that section
- Must validate the amount matches

**Example Implementation:**
```typescript
// On destination page
useEffect(() => {
  const focus = searchParams.get('focus');
  const highlight = searchParams.get('highlight');
  
  if (focus === 'exposure' && highlight === 'true') {
    const exposureSection = document.getElementById('exposure-section');
    exposureSection?.scrollIntoView({ behavior: 'smooth' });
    exposureSection?.classList.add('highlighted');
  }
}, [searchParams]);
```

### Pattern 5: Trend-Based CTAs

**Use Case:** Card shows change over time, user expects to see trend chart.

**Implementation:**
```typescript
const weeklyChange = 2.3;
const hasChange = Math.abs(weeklyChange) > 0.1;

const href = cta('view-trends', 'ScoreCard')
  .promises('View score trends')
  .withScore(currentScore, 'current score')
  .withDelta(weeklyChange, 'weekly change')
  .navigatesTo('/dashboard/score-details')
  .withParam('view', hasChange ? 'trends' : 'overview')
  .withParam('highlight', hasChange ? 'weekly-change' : 'current')
  .requires('view-trends')
  .optionally('highlight-change')
  .buildHref();
```

**Destination Page Requirements:**
- Must show trend chart when `view=trends`
- Must highlight the specific change period
- Must display same delta value

### Pattern 6: Action-Based CTAs

**Use Case:** Card promises to open a specific action (add, upload, schedule).

**Implementation:**
```typescript
const href = cta('add-item', 'InventoryCard')
  .promises('Add new item')
  .withContext('category', 'appliance')
  .withContext('room', currentRoom)
  .navigatesTo('/dashboard/inventory')
  .withParams({
    action: 'add',
    category: 'appliance',
    room: currentRoom,
    source: 'card',
  })
  .requires('action-add-item')
  .buildHref();
```

**Destination Page Requirements:**
- Must open add modal/form automatically
- Must pre-fill with provided context
- Must support the specified action

**Example Implementation:**
```typescript
// On destination page
useEffect(() => {
  const action = searchParams.get('action');
  const category = searchParams.get('category');
  
  if (action === 'add') {
    openAddModal({ 
      defaultCategory: category,
      source: 'card' 
    });
  }
}, [searchParams]);
```

## Advanced Patterns

### Pattern 7: Multi-Metric CTAs

**Use Case:** Card shows multiple related metrics.

```typescript
const contract = cta('complex-view', 'DashboardCard')
  .promises('View detailed analysis')
  .withCount(itemCount, 'items')
  .withAmount(totalCost, 'total cost', 'USD')
  .withScore(riskScore, 'risk score')
  .withDelta(weeklyChange, 'weekly change')
  .navigatesTo('/dashboard/analysis')
  .withParams({
    expectedItems: itemCount,
    expectedCost: totalCost,
    expectedScore: riskScore,
    expectedDelta: weeklyChange,
    view: 'detailed',
  })
  .requires('multi-metric-validation')
  .requires('detailed-view')
  .buildHref();
```

### Pattern 8: Conditional Destinations

**Use Case:** Different destinations based on data state.

```typescript
function buildConditionalCTA(data: Data) {
  const hasIssues = data.issues.length > 0;
  const hasOpportunities = data.opportunities.length > 0;
  
  if (hasIssues) {
    return cta('review-issues', 'ConditionalCard')
      .promises('Review issues')
      .withCount(data.issues.length, 'issues')
      .navigatesTo('/dashboard/issues')
      .withParam('filter', 'active')
      .requires('filter-active')
      .buildHref();
  } else if (hasOpportunities) {
    return cta('explore-opportunities', 'ConditionalCard')
      .promises('Explore opportunities')
      .withCount(data.opportunities.length, 'opportunities')
      .navigatesTo('/dashboard/opportunities')
      .requires('opportunity-list')
      .buildHref();
  } else {
    return cta('view-overview', 'ConditionalCard')
      .promises('View overview')
      .navigatesTo('/dashboard/overview')
      .buildHref();
  }
}
```

### Pattern 9: Contextual Navigation

**Use Case:** Navigation depends on user context and permissions.

```typescript
function buildContextualCTA(user: User, property: Property) {
  const baseBuilder = cta('contextual-action', 'ContextCard')
    .promises('Take action')
    .withContext('userId', user.id)
    .withContext('propertyId', property.id);
    
  if (user.hasPermission('admin')) {
    return baseBuilder
      .navigatesTo('/admin/property-management')
      .withParam('propertyId', property.id)
      .requires('admin-interface')
      .buildHref();
  } else if (user.hasPermission('edit')) {
    return baseBuilder
      .navigatesTo('/dashboard/property-edit')
      .withParam('propertyId', property.id)
      .requires('edit-interface')
      .buildHref();
  } else {
    return baseBuilder
      .navigatesTo('/dashboard/property-view')
      .withParam('propertyId', property.id)
      .requires('view-interface')
      .buildHref();
  }
}
```

## Anti-Patterns to Avoid

### ❌ Anti-Pattern 1: Generic Destinations

```typescript
// DON'T: Generic destination for specific promise
<div>3 urgent alerts</div>
<Link href="/dashboard">View Dashboard</Link>
```

### ❌ Anti-Pattern 2: Hardcoded Routes

```typescript
// DON'T: Hardcoded routes that can't adapt
<Link href="/dashboard/maintenance">View Maintenance</Link>
```

### ❌ Anti-Pattern 3: Inconsistent Data Sources

```typescript
// DON'T: Different data sources for display and navigation
const displayCount = getDisplayCount(); // One API
const navigationData = getNavigationData(); // Different API
```

### ❌ Anti-Pattern 4: Missing Validation

```typescript
// DON'T: No validation of promises
<div>{count} items</div>
<Link href={`/items?count=${count}`}>View Items</Link>
// Destination doesn't validate count matches
```

### ❌ Anti-Pattern 5: Lost Context

```typescript
// DON'T: Lose important context during navigation
<Link href="/generic-page">Take Action</Link>
// No way to know where user came from or what they were doing
```

## Testing Patterns

### Unit Test Pattern

```typescript
describe('CTA Contract', () => {
  it('validates count-based CTA', () => {
    const contract = cta('test-cta', 'TestComponent')
      .promises('Review items')
      .withCount(3, 'items')
      .navigatesTo('/dashboard/items')
      .withParam('expectedCount', 3)
      .requires('expected-count-validation')
      .build();

    const result = validateCTAContract(contract);
    expect(result.valid).toBe(true);
  });
});
```

### E2E Test Pattern

```typescript
test('CTA delivers promise', async ({ page }) => {
  // 1. Verify card shows promise
  const count = await page.locator('[data-testid="item-count"]').textContent();
  
  // 2. Click CTA
  await page.click('[data-testid="cta-button"]');
  
  // 3. Verify destination fulfills promise
  const items = page.locator('[data-testid="item"]');
  await expect(items).toHaveCount(parseInt(count));
});
```

## Performance Patterns

### Lazy Loading Pattern

```typescript
const href = cta('lazy-load', 'LazyCard')
  .promises('Load more data')
  .withContext('currentPage', currentPage)
  .withContext('pageSize', pageSize)
  .navigatesTo('/dashboard/data')
  .withParams({
    page: currentPage + 1,
    size: pageSize,
    preload: 'true',
  })
  .requires('pagination')
  .buildHref();
```

### Prefetch Pattern

```typescript
// Prefetch destination data when CTA is visible
useEffect(() => {
  const contract = buildCTAContract();
  if (isVisible && contract.destination.route) {
    prefetchRoute(contract.destination.route, contract.destination.params);
  }
}, [isVisible]);
```

## Accessibility Patterns

### Screen Reader Pattern

```typescript
const contract = cta('accessible-cta', 'AccessibleCard')
  .promises('Review 3 maintenance items')
  .withCount(3, 'maintenance items')
  .navigatesTo('/dashboard/maintenance')
  .build();

// Accessible implementation
<Link 
  href={href}
  aria-label={`${contract.promise.action}. Will navigate to maintenance page showing ${contract.promise.metrics?.[0]?.value} items.`}
>
  {contract.promise.action}
</Link>
```

### Keyboard Navigation Pattern

```typescript
<Link
  href={href}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      router.push(href);
    }
  }}
>
  {actionText}
</Link>
```

## Migration Patterns

### Gradual Migration Pattern

```typescript
// Phase 1: Add contracts alongside existing code
const legacyHref = `/dashboard/items?filter=${filter}`;
const contractHref = cta('migrate-cta', 'MigratingComponent')
  .promises('View items')
  .navigatesTo('/dashboard/items')
  .withParam('filter', filter)
  .buildHref();

// Use contract href in development, legacy in production
const href = process.env.NODE_ENV === 'development' ? contractHref : legacyHref;
```

### Validation Migration Pattern

```typescript
// Add validation to existing CTAs without changing behavior
useEffect(() => {
  if (process.env.NODE_ENV === 'development') {
    const contract = cta('existing-cta', 'ExistingComponent')
      .promises(existingPromise)
      .navigatesTo(existingRoute)
      .build();
    
    validateCTAContract(contract);
  }
}, []);
```

## Best Practices Summary

1. **Always use the builder** - Don't construct hrefs manually
2. **Match displayed metrics** - Pass them as parameters
3. **Require destination features** - Validate pages support promises
4. **Preserve context** - Include source, user state, etc.
5. **Validate in development** - Use runtime validation
6. **Test the journey** - E2E test from card to destination
7. **Handle errors gracefully** - Show warnings for mismatches
8. **Document page contracts** - Keep them up to date
9. **Use appropriate priority** - Critical for exact matches
10. **Monitor in production** - Track validation failures