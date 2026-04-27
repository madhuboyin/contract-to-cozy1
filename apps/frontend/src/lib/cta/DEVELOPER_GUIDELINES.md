# CTA Developer Guidelines

This document provides comprehensive guidelines for developers working with the CTA Contract System.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Workflow](#development-workflow)
3. [Code Review Guidelines](#code-review-guidelines)
4. [Testing Requirements](#testing-requirements)
5. [Performance Guidelines](#performance-guidelines)
6. [Accessibility Requirements](#accessibility-requirements)
7. [Error Handling](#error-handling)
8. [Debugging Guide](#debugging-guide)
9. [Common Mistakes](#common-mistakes)
10. [Team Standards](#team-standards)

## Getting Started

### Prerequisites

- Familiarity with TypeScript and React
- Understanding of Next.js routing
- Basic knowledge of URL parameters and query strings
- Understanding of user experience principles

### Setup

1. **Read the documentation:**
   - [README.md](./README.md) - Complete usage guide
   - [PATTERNS.md](./PATTERNS.md) - Design patterns
   - [INTEGRATION.md](./INTEGRATION.md) - CI/CD setup

2. **Install development tools:**
   ```bash
   # Add to VS Code extensions
   code --install-extension bradlc.vscode-tailwindcss
   code --install-extension ms-playwright.playwright
   ```

3. **Enable validation:**
   ```json
   // package.json
   {
     "scripts": {
       "validate-ctas": "tsx src/lib/cta/build-validator.ts",
       "dev:validate": "npm run validate-ctas && npm run dev"
     }
   }
   ```

## Development Workflow

### 1. Planning Phase

Before implementing a CTA:

1. **Identify the promise:** What does the UI element visually promise?
2. **Define the destination:** Where should it navigate?
3. **List required features:** What must the destination support?
4. **Determine metrics:** What counts/amounts/scores are shown?
5. **Plan validation:** How will you verify the promise is kept?

**Example Planning:**
```
Promise: "Review 3 maintenance items"
Destination: /dashboard/resolution-center
Required Features: filter-maintenance, expected-count-validation
Metrics: count=3, type="maintenance items"
Validation: Destination shows exactly 3 maintenance items
```

### 2. Implementation Phase

#### Step 1: Create the Contract

```typescript
import { cta, CTAValidator } from '@/lib/cta';

const contract = cta('maintenance-review', 'PropertyHealthCard')
  .promises('Review maintenance items')
  .withCount(maintenanceCount, 'maintenance items')
  .withPriority('critical')
  .navigatesTo('/dashboard/resolution-center')
  .withParams({
    propertyId,
    filter: 'maintenance',
    expectedCount: maintenanceCount,
    source: 'health-card',
  })
  .requires('filter-maintenance')
  .requires('expected-count-validation')
  .buildAndValidate();
```

#### Step 2: Add Runtime Validation

```typescript
return (
  <div>
    <CTAValidator contract={contract} />
    <Link href={contract.destination.route + '?' + new URLSearchParams(contract.destination.params)}>
      Review Maintenance
    </Link>
  </div>
);
```

#### Step 3: Update Page Contract (if needed)

```typescript
// In contracts.ts
'/dashboard/resolution-center': {
  route: '/dashboard/resolution-center',
  features: [
    'filter-maintenance',
    'expected-count-validation', // Add if missing
  ],
  params: ['propertyId', 'filter', 'expectedCount'],
  metrics: ['count'],
}
```

#### Step 4: Implement Destination Support

```typescript
// On destination page
export default function ResolutionCenter({ searchParams }: { searchParams: Record<string, string> }) {
  const filter = searchParams.filter;
  const expectedCount = parseInt(searchParams.expectedCount || '0');
  
  const { data: items } = useQuery({
    queryKey: ['resolution-items', filter],
    queryFn: () => getResolutionItems({ filter }),
  });

  // Validate expected count
  useEffect(() => {
    if (expectedCount > 0 && items && items.length !== expectedCount) {
      console.warn(`Expected ${expectedCount} items but found ${items.length}`);
      // Show user-friendly warning
    }
  }, [items, expectedCount]);

  return (
    <div>
      {expectedCount > 0 && (
        <div data-testid="item-count-display">
          Showing {items?.length || 0} of {expectedCount} expected items
        </div>
      )}
      {/* Rest of component */}
    </div>
  );
}
```

### 3. Testing Phase

#### Unit Tests

```typescript
// __tests__/MyComponent.test.tsx
import { render } from '@testing-library/react';
import { MyComponent } from './MyComponent';

test('creates valid CTA contract', () => {
  const { container } = render(<MyComponent propertyId="123" maintenanceCount={3} />);
  
  // Check console for validation errors (in development)
  // Verify href is constructed correctly
  const link = container.querySelector('a');
  expect(link?.href).toContain('filter=maintenance');
  expect(link?.href).toContain('expectedCount=3');
});
```

#### E2E Tests

```typescript
// e2e/cta-flow.spec.ts
test('maintenance CTA delivers promise', async ({ page }) => {
  await page.goto('/dashboard/properties/123');
  
  // Verify card shows count
  const count = await page.locator('[data-testid="maintenance-count"]').textContent();
  expect(count).toContain('3');
  
  // Click CTA
  await page.click('[data-testid="maintenance-cta"]');
  
  // Verify destination
  await expect(page).toHaveURL(/resolution-center.*filter=maintenance/);
  
  // Verify count matches
  const items = page.locator('[data-testid="maintenance-item"]');
  await expect(items).toHaveCount(3);
});
```

### 4. Review Phase

Before submitting PR:

1. **Run validation:** `npm run validate-ctas`
2. **Check console:** No validation errors in development
3. **Test manually:** Click through the CTA flow
4. **Run E2E tests:** Verify end-to-end behavior
5. **Update documentation:** Add new patterns if needed

## Code Review Guidelines

### For Authors

#### Pre-Review Checklist

- [ ] CTA contract is created using the builder
- [ ] Runtime validation is added (`<CTAValidator>`)
- [ ] Page contract is updated if needed
- [ ] Destination page supports required features
- [ ] E2E test covers the CTA flow
- [ ] No validation errors in console
- [ ] Build validation passes

#### PR Description Template

```markdown
## CTA Changes

### New CTAs
- **Component:** PropertyHealthCard
- **Promise:** "Review 3 maintenance items"
- **Destination:** /dashboard/resolution-center
- **Features Required:** filter-maintenance, expected-count-validation

### Page Contract Updates
- Added `expected-count-validation` to resolution-center

### Testing
- [ ] Unit tests pass
- [ ] E2E test added for CTA flow
- [ ] Manual testing completed
- [ ] Validation passes

### Screenshots
[Include screenshots of card and destination page]
```

### For Reviewers

#### Review Checklist

- [ ] **Promise Clarity:** Is the CTA promise clear and specific?
- [ ] **Destination Alignment:** Does destination support the promise?
- [ ] **Metric Consistency:** Are displayed metrics passed as parameters?
- [ ] **Feature Requirements:** Are required features realistic and documented?
- [ ] **Error Handling:** How are validation failures handled?
- [ ] **Performance:** Any performance implications?
- [ ] **Accessibility:** Is the CTA accessible?
- [ ] **Testing:** Are tests comprehensive?

#### Common Review Comments

**Promise Issues:**
```
The CTA promises "Review urgent alerts" but navigates to a generic page. 
Consider adding filter parameters or changing the promise text.
```

**Missing Validation:**
```
The card shows "$240 savings" but doesn't pass this as a parameter. 
Add .withAmount(240, 'savings') and expectedAmount parameter.
```

**Feature Requirements:**
```
The CTA requires 'advanced-filtering' but this feature doesn't exist. 
Either implement the feature or use 'basic-filtering'.
```

**Testing Gaps:**
```
Missing E2E test for the CTA flow. Please add a test that verifies 
the complete journey from card to destination.
```

## Testing Requirements

### Unit Testing

#### Required Tests

1. **Contract Creation:**
   ```typescript
   test('creates valid contract', () => {
     const contract = createMyContract();
     expect(validateCTAContract(contract).valid).toBe(true);
   });
   ```

2. **Href Generation:**
   ```typescript
   test('generates correct href', () => {
     const href = createMyHref();
     expect(href).toContain('expectedCount=3');
     expect(href).toContain('filter=maintenance');
   });
   ```

3. **Conditional Logic:**
   ```typescript
   test('handles empty state', () => {
     const href = createMyHref({ count: 0 });
     expect(href).not.toContain('filter=maintenance');
   });
   ```

#### Test Utilities

```typescript
// test-utils/cta-helpers.ts
export function createMockContract(overrides = {}) {
  return cta('test-cta', 'TestComponent')
    .promises('Test action')
    .navigatesTo('/test-route')
    .build();
}

export function validateTestContract(contract: CTAContract) {
  const result = validateCTAContract(contract);
  if (!result.valid) {
    throw new Error(`Contract validation failed: ${result.errors.map(e => e.message).join(', ')}`);
  }
  return result;
}
```

### E2E Testing

#### Required E2E Tests

1. **Happy Path:**
   ```typescript
   test('CTA delivers promise', async ({ page }) => {
     // Navigate to page with CTA
     // Verify promise is displayed
     // Click CTA
     // Verify destination fulfills promise
   });
   ```

2. **Error Scenarios:**
   ```typescript
   test('handles count mismatch', async ({ page }) => {
     // Mock API to return different count
     // Click CTA
     // Verify warning is shown
   });
   ```

3. **Performance:**
   ```typescript
   test('navigation is fast', async ({ page }) => {
     const start = Date.now();
     await page.click('[data-testid="cta"]');
     await page.waitForLoadState('networkidle');
     const duration = Date.now() - start;
     expect(duration).toBeLessThan(2000);
   });
   ```

#### E2E Test Patterns

```typescript
// Page Object Model
class CTATestPage {
  constructor(private page: Page) {}

  async getPromisedCount(selector: string): Promise<number> {
    const text = await this.page.locator(selector).textContent();
    return parseInt(text?.match(/\d+/)?.[0] || '0');
  }

  async clickCTA(testId: string) {
    await this.page.click(`[data-testid="${testId}"]`);
  }

  async validateDestination(expectedParams: Record<string, string>) {
    const url = new URL(this.page.url());
    for (const [key, value] of Object.entries(expectedParams)) {
      expect(url.searchParams.get(key)).toBe(value);
    }
  }

  async validateItemCount(selector: string, expectedCount: number) {
    const items = this.page.locator(selector);
    await expect(items).toHaveCount(expectedCount);
  }
}
```

### Integration Testing

#### API Integration

```typescript
test('CTA works with real API', async () => {
  // Use real API endpoints
  // Verify data consistency between card and destination
  // Test with various data states
});
```

#### Route Integration

```typescript
test('CTA works with Next.js routing', async () => {
  // Test with dynamic routes
  // Test with query parameters
  // Test with hash fragments
});
```

## Performance Guidelines

### Optimization Strategies

#### 1. Lazy Contract Creation

```typescript
// Don't create contracts on every render
const contract = useMemo(() => 
  cta('my-cta', 'MyComponent')
    .promises('Do something')
    .withCount(count, 'items')
    .navigatesTo('/destination')
    .build(),
  [count] // Only recreate when count changes
);
```

#### 2. Href Caching

```typescript
// Cache href generation
const href = useMemo(() => {
  const params = new URLSearchParams(contract.destination.params);
  return `${contract.destination.route}?${params}`;
}, [contract]);
```

#### 3. Conditional Validation

```typescript
// Only validate in development
const validatedContract = useMemo(() => {
  if (process.env.NODE_ENV === 'development') {
    return cta('my-cta', 'MyComponent')
      .promises('Do something')
      .buildAndValidate();
  }
  return cta('my-cta', 'MyComponent')
    .promises('Do something')
    .build();
}, [dependencies]);
```

#### 4. Prefetching

```typescript
// Prefetch destination when CTA is visible
useEffect(() => {
  if (isVisible && contract.destination.route) {
    router.prefetch(contract.destination.route);
  }
}, [isVisible, contract.destination.route]);
```

### Performance Monitoring

```typescript
// Monitor CTA performance
useEffect(() => {
  const startTime = performance.now();
  
  return () => {
    const duration = performance.now() - startTime;
    if (duration > 100) {
      console.warn(`Slow CTA contract creation: ${duration}ms`);
    }
  };
}, []);
```

## Accessibility Requirements

### ARIA Labels

```typescript
const contract = cta('accessible-cta', 'MyComponent')
  .promises('Review 3 maintenance items')
  .withCount(3, 'maintenance items')
  .build();

<Link
  href={href}
  aria-label={`${contract.promise.action}. This will take you to a page showing ${contract.promise.metrics?.[0]?.value} maintenance items.`}
>
  {contract.promise.action}
</Link>
```

### Keyboard Navigation

```typescript
<Link
  href={href}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      router.push(href);
    }
  }}
  tabIndex={0}
>
  {actionText}
</Link>
```

### Screen Reader Support

```typescript
// Announce navigation intent
<Link
  href={href}
  aria-describedby="cta-description"
>
  Review Items
</Link>
<div id="cta-description" className="sr-only">
  Clicking this link will navigate to the resolution center page 
  showing {count} maintenance items that require attention.
</div>
```

### Focus Management

```typescript
// Manage focus after navigation
useEffect(() => {
  const focusTarget = searchParams.get('focus');
  if (focusTarget) {
    const element = document.getElementById(focusTarget);
    element?.focus();
  }
}, [searchParams]);
```

## Error Handling

### Validation Errors

#### Development Errors

```typescript
// Handle validation errors gracefully
try {
  const contract = cta('my-cta', 'MyComponent')
    .promises('Do something')
    .buildAndValidate();
} catch (error) {
  console.error('CTA validation failed:', error);
  // Fallback to basic link
  return <Link href="/fallback-route">Do something</Link>;
}
```

#### Runtime Errors

```typescript
// Handle runtime validation failures
const [validationError, setValidationError] = useState<string | null>(null);

useEffect(() => {
  const expectedCount = parseInt(searchParams.get('expectedCount') || '0');
  const actualCount = items?.length || 0;
  
  if (expectedCount > 0 && actualCount !== expectedCount) {
    setValidationError(`Expected ${expectedCount} items but found ${actualCount}`);
  } else {
    setValidationError(null);
  }
}, [items, searchParams]);

if (validationError) {
  return (
    <div className="validation-warning">
      <AlertTriangle className="h-4 w-4" />
      {validationError}
    </div>
  );
}
```

### Network Errors

```typescript
// Handle API failures gracefully
const { data, error, isLoading } = useQuery({
  queryKey: ['items', filter],
  queryFn: () => getItems(filter),
  retry: 3,
  retryDelay: 1000,
});

if (error) {
  return (
    <div className="error-state">
      <p>Unable to load items. Please try again.</p>
      <button onClick={() => refetch()}>Retry</button>
    </div>
  );
}
```

### Fallback Strategies

```typescript
// Provide fallbacks for missing features
function createCTAWithFallback(data: Data) {
  try {
    return cta('primary-cta', 'MyComponent')
      .promises('Advanced action')
      .requires('advanced-feature')
      .buildAndValidate();
  } catch (error) {
    // Fallback to basic CTA
    return cta('fallback-cta', 'MyComponent')
      .promises('Basic action')
      .requires('basic-feature')
      .build();
  }
}
```

## Debugging Guide

### Common Issues

#### 1. Validation Failures

**Symptom:** Console errors about missing page contracts or features.

**Debug Steps:**
1. Check if page contract exists in `contracts.ts`
2. Verify feature names match exactly
3. Check if destination page actually supports the feature

**Solution:**
```typescript
// Add missing page contract
'/my/route': {
  route: '/my/route',
  features: ['required-feature'],
  params: ['param1', 'param2'],
  metrics: ['count'],
}
```

#### 2. Parameter Mismatches

**Symptom:** Destination page doesn't receive expected parameters.

**Debug Steps:**
1. Check URL in browser dev tools
2. Verify parameter names match between CTA and page
3. Check if parameters are being consumed correctly

**Solution:**
```typescript
// Debug parameter passing
console.log('CTA params:', contract.destination.params);
console.log('Page params:', searchParams);
```

#### 3. Count/Amount Mismatches

**Symptom:** Card shows different numbers than destination page.

**Debug Steps:**
1. Check if both use same data source
2. Verify timing of data fetches
3. Check for race conditions

**Solution:**
```typescript
// Use shared React Query cache
const queryKey = ['shared-data', propertyId];
const cardData = useQuery({ queryKey, queryFn: getData });
const pageData = useQuery({ queryKey, queryFn: getData });
```

### Debugging Tools

#### Console Logging

```typescript
// Enable detailed logging
if (process.env.NODE_ENV === 'development') {
  console.group('CTA Debug Info');
  console.log('Contract:', contract);
  console.log('Generated href:', href);
  console.log('Validation result:', validateCTAContract(contract));
  console.groupEnd();
}
```

#### Browser Dev Tools

1. **Network Tab:** Check API calls and responses
2. **Console:** Look for validation errors
3. **Elements:** Inspect generated hrefs
4. **Application:** Check localStorage/sessionStorage

#### React Dev Tools

1. **Components:** Inspect CTA component props
2. **Profiler:** Check performance impact
3. **Hooks:** Debug React Query cache

### Testing in Development

```typescript
// Add debug mode
const DEBUG_CTA = process.env.NODE_ENV === 'development' && 
                  localStorage.getItem('debug-cta') === 'true';

if (DEBUG_CTA) {
  // Show debug overlay
  return (
    <div className="relative">
      <div className="absolute top-0 right-0 bg-yellow-100 p-2 text-xs">
        <pre>{JSON.stringify(contract, null, 2)}</pre>
      </div>
      {children}
    </div>
  );
}
```

## Common Mistakes

### 1. Hardcoded Routes

❌ **Wrong:**
```typescript
<Link href="/dashboard/items?filter=urgent">View Urgent</Link>
```

✅ **Correct:**
```typescript
const href = cta('view-urgent', 'MyComponent')
  .promises('View urgent items')
  .navigatesTo('/dashboard/items')
  .withParam('filter', 'urgent')
  .buildHref();
```

### 2. Missing Validation

❌ **Wrong:**
```typescript
const contract = cta('my-cta', 'MyComponent')
  .promises('Do something')
  .build(); // No validation
```

✅ **Correct:**
```typescript
const contract = cta('my-cta', 'MyComponent')
  .promises('Do something')
  .buildAndValidate(); // With validation
```

### 3. Inconsistent Data

❌ **Wrong:**
```typescript
// Card uses one calculation
const cardCount = items.filter(i => i.urgent).length;

// Page uses different calculation
const pageCount = items.filter(i => i.priority === 'high').length;
```

✅ **Correct:**
```typescript
// Shared calculation
const urgentItems = items.filter(i => i.urgent);
const count = urgentItems.length;

// Both use same data
```

### 4. Generic Promises

❌ **Wrong:**
```typescript
.promises('View details') // Too generic
```

✅ **Correct:**
```typescript
.promises('Review 3 maintenance items') // Specific
```

### 5. Missing Features

❌ **Wrong:**
```typescript
.requires('non-existent-feature')
```

✅ **Correct:**
```typescript
.requires('filter-maintenance') // Feature that exists
```

### 6. Ignoring Warnings

❌ **Wrong:**
```typescript
// Ignoring console warnings about unknown parameters
```

✅ **Correct:**
```typescript
// Add parameter to page contract or remove from CTA
```

## Team Standards

### Naming Conventions

#### CTA IDs
- Use kebab-case: `health-score-maintenance`
- Include component context: `sidebar-urgent-alerts`
- Be descriptive: `coverage-gaps-review`

#### Feature Names
- Use kebab-case: `filter-maintenance`
- Be specific: `expected-count-validation`
- Group related features: `filter-*`, `sort-*`, `action-*`

#### Parameter Names
- Use camelCase: `expectedCount`
- Be descriptive: `propertyId`, `filterType`
- Include units: `expectedAmount`, `maxItems`

### Code Organization

#### File Structure
```
src/lib/cta/
├── index.ts              # Public API
├── contracts.ts          # Core contracts
├── builder.ts            # Builder API
├── runtime-validator.tsx # Runtime validation
├── build-validator.ts    # Build validation
├── __tests__/           # Tests
├── examples/            # Example implementations
└── docs/               # Documentation
```

#### Import Standards
```typescript
// Always import from index
import { cta, CTAValidator } from '@/lib/cta';

// Don't import internals directly
// import { CTABuilder } from '@/lib/cta/builder'; // ❌
```

### Documentation Standards

#### Component Documentation
```typescript
/**
 * Health Score Card with CTA validation
 * 
 * Displays property health score and provides CTA to review
 * maintenance items. Uses CTA contract system to ensure
 * destination page shows exactly the promised items.
 * 
 * @param propertyId - Property to display health score for
 * @param maintenanceCount - Number of maintenance items
 */
export function HealthScoreCard({ propertyId, maintenanceCount }: Props) {
  // Implementation
}
```

#### CTA Documentation
```typescript
// Document complex CTAs
const contract = cta('complex-cta', 'ComplexComponent')
  .promises('Review maintenance items')
  .withCount(maintenanceCount, 'maintenance items')
  // This CTA navigates to resolution center filtered to show
  // only maintenance items for this property. The destination
  // page validates that exactly `maintenanceCount` items are shown.
  .navigatesTo('/dashboard/resolution-center')
  .withParams({
    propertyId,
    filter: 'maintenance',
    expectedCount: maintenanceCount,
  })
  .requires('filter-maintenance')
  .requires('expected-count-validation')
  .buildAndValidate();
```

### Review Standards

#### Approval Requirements
- [ ] Code owner approval required for CTA changes
- [ ] QA approval required for new CTA patterns
- [ ] Design approval required for UX changes

#### Merge Requirements
- [ ] All tests pass
- [ ] CTA validation passes
- [ ] E2E tests included
- [ ] Documentation updated
- [ ] Performance impact assessed

### Monitoring Standards

#### Metrics to Track
- CTA validation failure rate
- Navigation success rate
- User completion rate
- Performance impact

#### Alerting
- Alert on validation failures in production
- Alert on high navigation abandonment
- Alert on performance degradation

### Training Requirements

#### New Team Members
1. Read all CTA documentation
2. Complete CTA tutorial
3. Implement practice CTA with review
4. Shadow experienced developer on CTA work

#### Ongoing Training
- Monthly CTA pattern review
- Quarterly performance analysis
- Annual accessibility audit

## Conclusion

Following these guidelines ensures:
- Consistent CTA implementation across the team
- High-quality user experiences
- Maintainable and testable code
- Accessible interfaces
- Performance optimization
- Effective collaboration

For questions or clarifications, reach out to the CTA system maintainers or create an issue in the project repository.