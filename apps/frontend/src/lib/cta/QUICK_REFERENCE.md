# CTA Contract System - Quick Reference

## Basic Usage

```typescript
import { cta, CTAValidator } from '@/lib/cta';

// Create contract
const contract = cta('my-cta-id', 'MyComponent')
  .promises('What the CTA does')
  .navigatesTo('/destination/route')
  .buildAndValidate();

// Use in component
<CTAValidator contract={contract} />
<Link href={contract.destination.route}>Click Me</Link>
```

## Common Patterns

### With Count

```typescript
const href = cta('review-items', 'MyCard')
  .promises('Review items')
  .withCount(itemCount, 'items')
  .navigatesTo('/dashboard/items')
  .withParam('expectedCount', itemCount)
  .requires('expected-count-validation')
  .buildHref();
```

### With Amount

```typescript
const href = cta('view-savings', 'SavingsCard')
  .promises('View savings')
  .withAmount(240, 'monthly savings', 'USD')
  .navigatesTo('/tools/savings')
  .withParam('expectedMonthly', 240)
  .requires('expected-amount-validation')
  .buildHref();
```

### With Filter

```typescript
const href = cta('filter-urgent', 'AlertCard')
  .promises('Review urgent items')
  .navigatesTo('/dashboard/items')
  .withParam('filter', 'urgent')
  .requires('filter-urgent')
  .buildHref();
```

### With Multiple Params

```typescript
const href = cta('complex-cta', 'MyComponent')
  .promises('Do something')
  .navigatesTo('/dashboard/page')
  .withParams({
    propertyId: '123',
    filter: 'active',
    sort: 'priority',
    highlight: 'true',
  })
  .requires('filter-active')
  .requires('sort-priority')
  .buildHref();
```

## Builder Methods

| Method | Purpose | Example |
|--------|---------|---------|
| `.promises(action)` | Define action | `.promises('Review items')` |
| `.withCount(n, label)` | Add count | `.withCount(3, 'items')` |
| `.withAmount(n, label, unit)` | Add amount | `.withAmount(240, 'savings', 'USD')` |
| `.withScore(n, label)` | Add score | `.withScore(85, 'health score')` |
| `.withDelta(n, label)` | Add delta | `.withDelta(2.3, 'change')` |
| `.withContext(key, val)` | Add context | `.withContext('source', 'card')` |
| `.withPriority(p)` | Set priority | `.withPriority('critical')` |
| `.navigatesTo(route)` | Set route | `.navigatesTo('/dashboard/items')` |
| `.withParam(key, val)` | Add param | `.withParam('filter', 'urgent')` |
| `.withParams(obj)` | Add params | `.withParams({ filter: 'urgent' })` |
| `.requires(feature)` | Required | `.requires('filter-urgent')` |
| `.optionally(feature)` | Optional | `.optionally('highlight')` |
| `.build()` | Build | `.build()` |
| `.buildAndValidate()` | Build + validate | `.buildAndValidate()` |
| `.buildHref()` | Build href | `.buildHref()` |

## Priority Levels

| Priority | When to Use |
|----------|-------------|
| `critical` | Exact match required (counts, amounts, specific items) |
| `high` | Focused view required (filtered, highlighted) |
| `medium` | Relevant context required (category, source) |
| `low` | General navigation (no specific promise) |

## Validation Errors

| Error | Meaning | Fix |
|-------|---------|-----|
| `MISSING_PAGE_CONTRACT` | No page contract found | Add to `PAGE_CONTRACTS` |
| `MISSING_FEATURE` | Page doesn't support feature | Add feature or remove requirement |
| `UNKNOWN_PARAMETER` | Page may not support param | Add to page contract |
| `UNSUPPORTED_METRIC` | Page may not support metric | Add to page contract |

## Page Contracts

Add to `contracts.ts`:

```typescript
'/your/route': {
  route: '/your/route',
  features: ['feature-1', 'feature-2'],
  params: ['param1', 'param2'],
  metrics: ['count', 'amount'],
  description: 'What the page does',
}
```

## Runtime Validation

```typescript
import { CTAValidator } from '@/lib/cta/runtime-validator';

// In component
<CTAValidator contract={contract} />
```

## Build Validation

```bash
# Add to package.json
"validate-ctas": "tsx src/lib/cta/build-validator.ts"

# Run
npm run validate-ctas
```

## Common Features

| Feature | Description |
|---------|-------------|
| `filter-urgent` | Filter to urgent items |
| `filter-maintenance` | Filter to maintenance items |
| `filter-gaps` | Filter to coverage gaps |
| `filter-missing-age` | Filter to items missing age |
| `sort-priority` | Sort by priority |
| `highlight-items` | Highlight specific items |
| `expected-count-validation` | Validate item count |
| `expected-amount-validation` | Validate amount |
| `view-trends` | Show trend chart |
| `focus-exposure` | Focus on exposure |
| `focus-breakdown` | Focus on breakdown |
| `action-add-item` | Add item action |
| `action-upload` | Upload action |

## Tips

✅ **Do:**
- Use builder for all CTAs
- Match displayed metrics with params
- Require destination features
- Validate in development
- Add to CI/CD

❌ **Don't:**
- Hardcode hrefs
- Skip validation
- Ignore warnings
- Use generic destinations for specific promises
- Display metrics without passing them

## Help

- Full docs: `README.md`
- Integration: `INTEGRATION.md`
- Examples: `examples/`
- Tests: `__tests__/`
