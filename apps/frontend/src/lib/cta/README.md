# CTA Contract System

A comprehensive guardrails system to ensure every CTA (Call-to-Action) promise is fulfilled by its destination page.

## Overview

The CTA Contract System prevents navigation mismatches by:
- Defining explicit contracts for what CTAs promise and where they navigate
- Validating that destination pages support promised features
- Providing compile-time and runtime validation
- Offering a type-safe builder API for creating CTAs

## Core Concepts

### CTA Contract

A contract defines:
- **Promise**: What the CTA visually promises (action, metrics, context)
- **Destination**: Where it navigates (route, params, required features)
- **Validation**: Ensures destination supports the promise

### Page Contract

Each page declares:
- **Features**: What capabilities it supports (e.g., "filter-gaps", "highlight-items")
- **Params**: What URL parameters it accepts
- **Metrics**: What metric types it can display/validate

## Quick Start

### 1. Basic Usage

```typescript
import { cta } from '@/lib/cta/builder';

// Create a CTA contract
const contract = cta('health-score-maintenance', 'PropertyHealthScoreCard')
  .promises('Review maintenance items')
  .withCount(3, 'maintenance items')
  .withPriority('critical')
  .navigatesTo(`/dashboard/resolution-center`)
  .withParam('propertyId', propertyId)
  .withParam('filter', 'maintenance')
  .withParam('expectedCount', 3)
  .requires('filter-maintenance')
  .requires('expected-count-validation')
  .buildAndValidate();

// Use the contract to build href
const href = contract.destination.route + '?' + 
  new URLSearchParams(contract.destination.params).toString();
```

### 2. With Builder Helper

```typescript
import { cta } from '@/lib/cta/builder';

// Simpler href generation
const href = cta('coverage-gaps', 'SidebarActions')
  .promises('Review coverage gaps')
  .withCount(gapCount, 'gaps')
  .navigatesTo(`/dashboard/properties/${propertyId}/tools/coverage-analysis`)
  .withParam('filter', 'gaps')
  .withParam('highlight', 'true')
  .requires('filter-gaps')
  .requires('highlight-items')
  .buildHref();
```

### 3. With Runtime Validation

```typescript
import { cta } from '@/lib/cta/builder';
import { CTAValidator } from '@/lib/cta/runtime-validator';

function MyCard() {
  const contract = cta('savings-card', 'HomeSavingsCard')
    .promises('View savings breakdown')
    .withAmount(monthlyPotential, 'monthly savings', 'USD')
    .navigatesTo(`/dashboard/properties/${propertyId}/tools/home-savings`)
    .withParam('expectedMonthly', monthlyPotential)
    .withParam('expectedAnnual', annualPotential)
    .requires('expected-amount-validation')
    .build();

  return (
    <>
      <CTAValidator contract={contract} />
      <Link href={contract.destination.route + '?' + new URLSearchParams(contract.destination.params)}>
        View Savings
      </Link>
    </>
  );
}
```

## Builder API

### Creating a Contract

```typescript
cta(id: string, source: string)
```

- `id`: Unique identifier for this CTA (e.g., "health-score-maintenance")
- `source`: Component/file where CTA is defined (e.g., "PropertyHealthScoreCard")

### Promise Methods

```typescript
.promises(action: string)
```
Define what the CTA promises to do (required).

```typescript
.withMetric(metric: CTAMetric)
```
Add a custom metric to the promise.

```typescript
.withCount(value: number, label: string)
```
Add a count metric (e.g., "3 gaps").

```typescript
.withAmount(value: number, label: string, unit?: string)
```
Add an amount metric (e.g., "$240 monthly savings").

```typescript
.withScore(value: number, label: string)
```
Add a score metric (e.g., "85 health score").

```typescript
.withDelta(value: number, label: string)
```
Add a delta/change metric (e.g., "+2.3 pts").

```typescript
.withContext(key: string, value: any)
```
Add context data to preserve.

```typescript
.withPriority(priority: 'critical' | 'high' | 'medium' | 'low')
```
Set validation priority (default: 'medium').

### Destination Methods

```typescript
.navigatesTo(route: string)
```
Set destination route (required).

```typescript
.withParam(key: string, value: string | number | boolean)
```
Add a single URL parameter.

```typescript
.withParams(params: Record<string, string | number | boolean>)
```
Add multiple URL parameters.

```typescript
.requires(feature: string)
```
Add a required feature that destination must support.

```typescript
.optionally(feature: string)
```
Add an optional feature that enhances experience.

### Build Methods

```typescript
.build(): CTAContract
```
Build the contract (throws if required fields missing).

```typescript
.buildAndValidate(): CTAContract
```
Build and validate the contract (logs errors in development).

```typescript
.buildHref(): string
```
Build the complete href with query parameters.

## Page Contracts

Define what your pages support:

```typescript
// In contracts.ts
export const PAGE_CONTRACTS: Record<string, PageContract> = {
  '/dashboard/resolution-center': {
    route: '/dashboard/resolution-center',
    features: [
      'filter-urgent',
      'filter-maintenance',
      'sort-priority',
      'expected-count-validation',
      'highlight-items',
    ],
    params: ['propertyId', 'filter', 'sort', 'priority', 'expectedCount'],
    metrics: ['count'],
    description: 'Resolution center with filterable action items',
  },
  // ... more page contracts
};
```

## Validation

### Runtime Validation (Development)

Automatically validates contracts in development mode:

```typescript
import { CTAValidator } from '@/lib/cta/runtime-validator';

<CTAValidator contract={contract} />
```

Or use the hook:

```typescript
import { useCtaValidation } from '@/lib/cta/runtime-validator';

const validatedContract = useCtaValidation(contract);
```

### Build-Time Validation

Add to your build process:

```json
// package.json
{
  "scripts": {
    "validate-ctas": "node src/lib/cta/build-validator.ts",
    "build": "npm run validate-ctas && next build"
  }
}
```

### Validation Errors

**MISSING_PAGE_CONTRACT**: No page contract found for route
- Fix: Add page contract to `PAGE_CONTRACTS` in `contracts.ts`

**MISSING_FEATURE**: Page doesn't support required feature
- Fix: Add feature to page implementation or remove from CTA requirements

**UNKNOWN_PARAMETER**: Page may not support parameter
- Fix: Add parameter to page contract or verify it's handled

**UNSUPPORTED_METRIC**: Page may not support metric type
- Fix: Add metric type to page contract or verify it's displayed

## Examples

### Example 1: Health Score Card

```typescript
// PropertyHealthScoreCard.tsx
import { cta } from '@/lib/cta/builder';

const maintenanceCount = 3;
const propertyId = 'abc-123';

const href = cta('health-score-maintenance', 'PropertyHealthScoreCard')
  .promises('Review maintenance items')
  .withCount(maintenanceCount, 'maintenance items')
  .withPriority('critical')
  .navigatesTo(`/dashboard/resolution-center`)
  .withParams({
    propertyId,
    filter: 'maintenance',
    priority: 'high',
    expectedCount: maintenanceCount,
  })
  .requires('filter-maintenance')
  .requires('expected-count-validation')
  .buildHref();

// href = "/dashboard/resolution-center?propertyId=abc-123&filter=maintenance&priority=high&expectedCount=3"
```

### Example 2: Sidebar Action

```typescript
// dynamicSidebarActions.ts
import { cta } from '@/lib/cta/builder';

if (ctx.signals?.gapCount && ctx.signals.gapCount > 0) {
  const href = cta('review-coverage-gaps', 'DynamicSidebarActions')
    .promises('Review coverage gaps')
    .withCount(ctx.signals.gapCount, 'gaps')
    .withPriority('high')
    .navigatesTo(`${propPath}/tools/coverage-analysis`)
    .withParams({
      filter: 'gaps',
      highlight: 'true',
      expectedCount: ctx.signals.gapCount,
      source: 'sidebar',
    })
    .requires('filter-gaps')
    .requires('highlight-items')
    .requires('expected-count-validation')
    .buildHref();

  actions.push({
    id: 'review-coverage-gaps',
    title: 'Review coverage gaps',
    description: `${ctx.signals.gapCount} gap${ctx.signals.gapCount > 1 ? 's' : ''} identified`,
    icon: ShieldCheck,
    href,
    priority: 'high',
    badge: 'Action needed',
  });
}
```

### Example 3: Savings Card with Amount

```typescript
// HomeSavingsCheckToolCard.tsx
import { cta } from '@/lib/cta/builder';

const monthlyPotential = 240;
const annualPotential = 2880;

const contract = cta('home-savings-view', 'HomeSavingsCheckToolCard')
  .promises('View savings breakdown')
  .withAmount(monthlyPotential, 'monthly savings', 'USD')
  .withAmount(annualPotential, 'annual savings', 'USD')
  .withPriority('critical')
  .navigatesTo(`/dashboard/properties/${propertyId}/tools/home-savings`)
  .withParams({
    expectedMonthly: monthlyPotential,
    expectedAnnual: annualPotential,
    highlight: 'opportunities',
    action: 'view-breakdown',
  })
  .requires('expected-amount-validation')
  .requires('highlight-opportunities')
  .requires('category-breakdown')
  .buildAndValidate();

const href = contract.destination.route + '?' + 
  new URLSearchParams(contract.destination.params).toString();
```

### Example 4: Dynamic Destination

```typescript
// UpcomingRenewalsCard.tsx
import { cta } from '@/lib/cta/builder';

const insuranceCount = renewals.filter(r => r.type === 'insurance').length;
const warrantyCount = renewals.filter(r => r.type === 'warranty').length;

// Navigate to dominant type
const dominantType = insuranceCount > warrantyCount ? 'insurance' : 'warranties';
const route = `/dashboard/${dominantType}`;

const href = cta('view-renewals', 'UpcomingRenewalsCard')
  .promises(`View ${insuranceCount + warrantyCount} renewals`)
  .withCount(insuranceCount + warrantyCount, 'renewals')
  .withContext('insuranceCount', insuranceCount)
  .withContext('warrantyCount', warrantyCount)
  .navigatesTo(route)
  .withParam('propertyId', propertyId)
  .withParam('filter', 'upcoming')
  .requires('filter-upcoming')
  .buildHref();
```

## Best Practices

### 1. Always Use the Builder

❌ Don't:
```typescript
const href = `/dashboard/health-score?propertyId=${propertyId}`;
```

✅ Do:
```typescript
const href = cta('health-score-view', 'MyComponent')
  .promises('View health score')
  .navigatesTo(`/dashboard/properties/${propertyId}/health-score`)
  .buildHref();
```

### 2. Match Displayed Metrics

❌ Don't:
```typescript
// Shows "3 gaps" but doesn't pass count
<div>3 gaps</div>
<Link href="/tools/coverage-analysis">View</Link>
```

✅ Do:
```typescript
const gapCount = 3;
const href = cta('view-gaps', 'MyCard')
  .promises('Review coverage gaps')
  .withCount(gapCount, 'gaps')
  .navigatesTo('/tools/coverage-analysis')
  .withParam('expectedCount', gapCount)
  .requires('expected-count-validation')
  .buildHref();

<div>{gapCount} gaps</div>
<Link href={href}>View</Link>
```

### 3. Require Destination Features

❌ Don't:
```typescript
// Promises filtering but doesn't verify page supports it
.navigatesTo('/tools/coverage-analysis')
.withParam('filter', 'gaps')
```

✅ Do:
```typescript
.navigatesTo('/tools/coverage-analysis')
.withParam('filter', 'gaps')
.requires('filter-gaps')  // ← Validates page supports filtering
```

### 4. Use Appropriate Priority

- `critical`: User expects exact match (counts, amounts, specific items)
- `high`: User expects focused view (filtered, highlighted)
- `medium`: User expects relevant context (category, source)
- `low`: User expects general navigation (no specific promise)

### 5. Add Context for Complex Flows

```typescript
cta('do-nothing-simulator', 'DoNothingSimulatorCard')
  .promises('View simulation results')
  .withAmount(projectedCost, 'projected cost')
  .withContext('source', 'dashboard-card')
  .withContext('action', 'view-results')
  .withContext('horizon', '5-years')
  .withContext('status', 'completed')
  .navigatesTo(`/tools/do-nothing-simulator`)
  .withParams({
    propertyId,
    source: 'dashboard-card',
    action: 'view-results',
    horizon: '5-years',
    status: 'completed',
  })
  .buildHref();
```

## Testing

### Unit Tests

```typescript
import { cta } from '@/lib/cta/builder';
import { validateCTAContract } from '@/lib/cta/contracts';

describe('CTA Contracts', () => {
  it('validates health score maintenance CTA', () => {
    const contract = cta('health-score-maintenance', 'Test')
      .promises('Review maintenance')
      .withCount(3, 'items')
      .navigatesTo('/dashboard/resolution-center')
      .withParam('filter', 'maintenance')
      .requires('filter-maintenance')
      .build();

    const result = validateCTAContract(contract);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails validation for missing page contract', () => {
    const contract = cta('invalid-cta', 'Test')
      .promises('Do something')
      .navigatesTo('/non-existent-page')
      .build();

    const result = validateCTAContract(contract);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('MISSING_PAGE_CONTRACT');
  });
});
```

### E2E Tests

```typescript
import { test, expect } from '@playwright/test';

test('health score maintenance CTA shows correct count', async ({ page }) => {
  await page.goto('/dashboard');
  
  // Get count from card
  const cardCount = await page.locator('[data-testid="maintenance-count"]').textContent();
  
  // Click CTA
  await page.click('[data-testid="health-score-cta"]');
  
  // Verify destination shows same count
  await expect(page.locator('[data-testid="maintenance-list"]')).toHaveCount(parseInt(cardCount));
});
```

## Troubleshooting

### "No page contract found for route"

Add the page contract to `PAGE_CONTRACTS` in `contracts.ts`:

```typescript
'/your/route': {
  route: '/your/route',
  features: ['feature-1', 'feature-2'],
  params: ['param1', 'param2'],
  metrics: ['count', 'amount'],
  description: 'Your page description',
}
```

### "Page does not support required feature"

Either:
1. Add the feature to your page implementation
2. Remove the `.requires()` call if not actually needed
3. Change to `.optionally()` if feature is nice-to-have

### "Build validation fails but runtime works"

The build validator uses regex to find contracts. Make sure you're using the `cta()` builder pattern consistently.

## Migration Guide

### Migrating Existing CTAs

1. **Find all href constructions:**
   ```bash
   grep -r "href=" apps/frontend/src/app
   ```

2. **Replace with builder:**
   ```typescript
   // Before
   const href = `/dashboard/health-score?propertyId=${propertyId}`;
   
   // After
   const href = cta('health-score-view', 'MyComponent')
     .promises('View health score')
     .navigatesTo(`/dashboard/properties/${propertyId}/health-score`)
     .withParam('propertyId', propertyId)
     .buildHref();
   ```

3. **Add validation:**
   ```typescript
   import { CTAValidator } from '@/lib/cta/runtime-validator';
   
   <CTAValidator contract={contract} />
   ```

4. **Test in development:**
   - Check console for validation errors
   - Fix any missing page contracts or features
   - Verify destination pages support promised features

## Contributing

When adding new pages:
1. Add page contract to `PAGE_CONTRACTS`
2. Document supported features
3. List accepted parameters
4. Specify supported metric types

When adding new CTAs:
1. Use the `cta()` builder
2. Call `.buildAndValidate()` in development
3. Add `<CTAValidator>` component
4. Test that destination fulfills promise

## Resources

- [CTA Navigation Audit Findings](../../../../CTA_NAVIGATION_AUDIT_FINDINGS.md)
- [Implementation Summary](../../../../IMPLEMENTATION_SUMMARY.md)
- [Contributing Guidelines](../../../../CONTRIBUTING.md)
