# CTA Contract Migration Example

## Real-World Migration: MorningHomePulseCard

This document shows a practical example of migrating `MorningHomePulseCard.tsx` from manual href construction to CTA contracts.

## Current State (Manual Approach)

### Problem Code

```typescript
// apps/frontend/src/app/(dashboard)/dashboard/components/MorningHomePulseCard.tsx

// Manual href construction - NO VALIDATION
const tool = resolveActionTool(payload.microAction.title, propertyId);

<Link
  href={tool.href}
  onClick={() => track('morning_brief_cta_clicked', {
    propertyId,
    actionType: payload.microAction.title,
    tool: tool.toolKey,
  })}
  className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
>
  Open {tool.label} →
</Link>

// Helper function with manual string interpolation
function resolveActionTool(title: string | undefined, propertyId: string): ActionToolTarget {
  const key = (title ?? '').toUpperCase();
  const base = `/dashboard/properties/${propertyId}/tools`;
  
  if (/INSURANCE|COVERAGE/.test(key))
    return { href: `${base}/coverage-intelligence`, label: 'Coverage Intelligence', toolKey: 'coverage-intelligence' };
  
  if (/REBATE|UTILITY|ASSET|GRANT|EXEMPTION|CREDIT/.test(key))
    return { href: `${base}/hidden-asset-finder`, label: 'Asset Finder', toolKey: 'hidden-asset-finder' };
  
  if (/REFINANC/.test(key))
    return { href: `${base}/mortgage-refinance-radar`, label: 'Refinance Radar', toolKey: 'mortgage-refinance-radar' };
  
  if (/SAVINGS|EFFICIENCY|COST/.test(key))
    return { href: `/dashboard/properties/${propertyId}/financial-efficiency?focus=breakdown`, label: 'Financial Efficiency', toolKey: 'financial-efficiency' };
  
  return { href: `${base}/maintenance`, label: 'Maintenance', toolKey: 'maintenance' };
}
```

### Problems

1. ❌ No validation that destination pages exist
2. ❌ No validation that `focus=breakdown` parameter is supported
3. ❌ No type safety for parameters
4. ❌ Manual string interpolation is error-prone
5. ❌ No build-time checks
6. ❌ Regex-based routing is fragile
7. ❌ No guarantee destination fulfills promise

## Migrated State (CTA Contract Approach)

### Step 1: Update Page Contracts

First, ensure destination pages have contracts defined:

```typescript
// apps/frontend/src/lib/cta/contracts.ts

export const PAGE_CONTRACTS: Record<string, PageContract> = {
  // ... existing contracts ...
  
  '/dashboard/properties/:id/tools/coverage-intelligence': {
    route: '/dashboard/properties/:id/tools/coverage-intelligence',
    features: [
      'gap-analysis',
      'recommendation-engine',
      'policy-comparison',
    ],
    params: ['source', 'context'],
    metrics: ['count', 'amount'],
    description: 'Coverage intelligence tool with gap analysis',
  },
  
  '/dashboard/properties/:id/tools/hidden-asset-finder': {
    route: '/dashboard/properties/:id/tools/hidden-asset-finder',
    features: [
      'rebate-search',
      'grant-matching',
      'credit-discovery',
    ],
    params: ['source', 'category'],
    metrics: ['amount'],
    description: 'Hidden asset finder for rebates and credits',
  },
  
  '/dashboard/properties/:id/tools/mortgage-refinance-radar': {
    route: '/dashboard/properties/:id/tools/mortgage-refinance-radar',
    features: [
      'rate-comparison',
      'savings-calculator',
      'lender-matching',
    ],
    params: ['source'],
    metrics: ['amount', 'percentage'],
    description: 'Mortgage refinance radar with rate comparison',
  },
  
  // Financial efficiency already exists, just verify it has focus-breakdown feature
  '/dashboard/properties/:id/financial-efficiency': {
    route: '/dashboard/properties/:id/financial-efficiency',
    features: [
      'focus-breakdown', // ✅ Already exists
      'view-trends',
      'cost-breakdown',
      'expected-cost-validation',
    ],
    params: ['focus', 'expectedCost', 'view', 'source'],
    metrics: ['amount', 'delta'],
    description: 'Financial efficiency with cost breakdown',
  },
  
  '/dashboard/properties/:id/tools/maintenance': {
    route: '/dashboard/properties/:id/tools/maintenance',
    features: [
      'task-scheduling',
      'provider-search',
      'cost-estimation',
    ],
    params: ['source', 'category'],
    metrics: ['count'],
    description: 'Maintenance tool with scheduling',
  },
};
```

### Step 2: Create CTA Contract Builder Helper

```typescript
// apps/frontend/src/app/(dashboard)/dashboard/components/MorningHomePulseCard.tsx

import { cta, CTAContract } from '@/lib/cta';

type MicroActionType = 
  | 'INSURANCE_REVIEW'
  | 'COVERAGE_CHECK'
  | 'REBATE_SEARCH'
  | 'ASSET_DISCOVERY'
  | 'REFINANCE_CHECK'
  | 'SAVINGS_REVIEW'
  | 'EFFICIENCY_CHECK'
  | 'COST_ANALYSIS'
  | 'MAINTENANCE_SCHEDULE'
  | 'GENERAL';

function classifyMicroAction(title: string | undefined): MicroActionType {
  const key = (title ?? '').toUpperCase();
  
  if (/INSURANCE|COVERAGE/.test(key)) return 'COVERAGE_CHECK';
  if (/REBATE|UTILITY|ASSET|GRANT|EXEMPTION|CREDIT/.test(key)) return 'ASSET_DISCOVERY';
  if (/REFINANC/.test(key)) return 'REFINANCE_CHECK';
  if (/SAVINGS|EFFICIENCY|COST/.test(key)) return 'EFFICIENCY_CHECK';
  if (/MAINTENANCE/.test(key)) return 'MAINTENANCE_SCHEDULE';
  
  return 'GENERAL';
}

function createMicroActionContract(
  actionType: MicroActionType,
  propertyId: string,
  actionTitle: string,
  actionDetail: string
): CTAContract {
  const baseId = `morning-pulse-${actionType.toLowerCase()}`;
  const source = 'MorningHomePulseCard';
  
  switch (actionType) {
    case 'COVERAGE_CHECK':
      return cta(baseId, source)
        .promises('Review coverage gaps and recommendations')
        .withContext('action', actionTitle)
        .withContext('detail', actionDetail)
        .navigatesTo(`/dashboard/properties/${propertyId}/tools/coverage-intelligence`)
        .withParams({
          source: 'morning-pulse',
          context: 'micro-action',
        })
        .requires('gap-analysis')
        .requires('recommendation-engine')
        .buildAndValidate();
    
    case 'ASSET_DISCOVERY':
      return cta(baseId, source)
        .promises('Discover hidden rebates and credits')
        .withContext('action', actionTitle)
        .withContext('detail', actionDetail)
        .navigatesTo(`/dashboard/properties/${propertyId}/tools/hidden-asset-finder`)
        .withParams({
          source: 'morning-pulse',
          category: 'all',
        })
        .requires('rebate-search')
        .requires('grant-matching')
        .buildAndValidate();
    
    case 'REFINANCE_CHECK':
      return cta(baseId, source)
        .promises('Check refinance opportunities')
        .withContext('action', actionTitle)
        .withContext('detail', actionDetail)
        .navigatesTo(`/dashboard/properties/${propertyId}/tools/mortgage-refinance-radar`)
        .withParams({
          source: 'morning-pulse',
        })
        .requires('rate-comparison')
        .requires('savings-calculator')
        .buildAndValidate();
    
    case 'EFFICIENCY_CHECK':
      return cta(baseId, source)
        .promises('Review financial efficiency breakdown')
        .withContext('action', actionTitle)
        .withContext('detail', actionDetail)
        .navigatesTo(`/dashboard/properties/${propertyId}/financial-efficiency`)
        .withParams({
          focus: 'breakdown',
          source: 'morning-pulse',
        })
        .requires('focus-breakdown')
        .requires('cost-breakdown')
        .buildAndValidate();
    
    case 'MAINTENANCE_SCHEDULE':
      return cta(baseId, source)
        .promises('Schedule maintenance tasks')
        .withContext('action', actionTitle)
        .withContext('detail', actionDetail)
        .navigatesTo(`/dashboard/properties/${propertyId}/tools/maintenance`)
        .withParams({
          source: 'morning-pulse',
          category: 'all',
        })
        .requires('task-scheduling')
        .buildAndValidate();
    
    default:
      // Fallback to maintenance tool
      return cta(`${baseId}-fallback`, source)
        .promises('Review maintenance options')
        .withContext('action', actionTitle)
        .withContext('detail', actionDetail)
        .navigatesTo(`/dashboard/properties/${propertyId}/tools/maintenance`)
        .withParams({
          source: 'morning-pulse',
        })
        .buildAndValidate();
  }
}
```

### Step 3: Update Component to Use Contracts

```typescript
// In the component render

export default function MorningHomePulseCard({ propertyId }: MorningHomePulseCardProps) {
  // ... existing state and logic ...
  
  // Create CTA contract for micro action
  const microActionType = classifyMicroAction(payload.microAction.title);
  const microActionContract = useMemo(
    () => createMicroActionContract(
      microActionType,
      propertyId,
      payload.microAction.title,
      payload.microAction.detail
    ),
    [microActionType, propertyId, payload.microAction.title, payload.microAction.detail]
  );
  
  // Build href from validated contract
  const microActionHref = useMemo(() => {
    const params = new URLSearchParams(microActionContract.destination.params);
    return `${microActionContract.destination.route}?${params}`;
  }, [microActionContract]);
  
  // Get label from contract context
  const toolLabel = (() => {
    switch (microActionType) {
      case 'COVERAGE_CHECK': return 'Coverage Intelligence';
      case 'ASSET_DISCOVERY': return 'Asset Finder';
      case 'REFINANCE_CHECK': return 'Refinance Radar';
      case 'EFFICIENCY_CHECK': return 'Financial Efficiency';
      case 'MAINTENANCE_SCHEDULE': return 'Maintenance';
      default: return 'Maintenance';
    }
  })();
  
  return (
    <section className="...">
      {/* ... existing content ... */}
      
      <div className="mt-2 border-t border-gray-100 pt-2">
        <Link
          href={microActionHref}
          onClick={() => track('morning_brief_cta_clicked', {
            propertyId,
            ctaId: microActionContract.id,
            actionType: microActionType,
          })}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          Open {toolLabel} →
        </Link>
      </div>
      
      {/* Add runtime validation in development */}
      {process.env.NODE_ENV === 'development' && (
        <CTAValidator contract={microActionContract} />
      )}
    </section>
  );
}
```

### Step 4: Add Runtime Validator Component

```typescript
// apps/frontend/src/lib/cta/runtime-validator.tsx

'use client';

import { useEffect } from 'react';
import { CTAContract, validateCTAContract } from './contracts';

export function CTAValidator({ contract }: { contract: CTAContract }) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const result = validateCTAContract(contract);
      
      if (!result.valid) {
        console.error(
          `[CTA Validation] ❌ Errors in ${contract.id} from ${contract.source}:`,
          result.errors
        );
      }
      
      if (result.warnings.length > 0) {
        console.warn(
          `[CTA Validation] ⚠️ Warnings in ${contract.id} from ${contract.source}:`,
          result.warnings
        );
      }
      
      if (result.valid && result.warnings.length === 0) {
        console.log(
          `[CTA Validation] ✅ ${contract.id} validated successfully`
        );
      }
    }
  }, [contract]);
  
  return null; // This component only logs, doesn't render
}
```

## Benefits of Migration

### Before Migration

```typescript
// ❌ Manual, fragile, no validation
const tool = resolveActionTool(payload.microAction.title, propertyId);
<Link href={tool.href}>Open {tool.label} →</Link>
```

**Issues**:
- No validation
- Regex-based routing
- Manual string interpolation
- No type safety
- No build-time checks

### After Migration

```typescript
// ✅ Validated, type-safe, maintainable
const contract = createMicroActionContract(actionType, propertyId, title, detail);
const href = buildHrefFromContract(contract);
<Link href={href}>Open {toolLabel} →</Link>
<CTAValidator contract={contract} />
```

**Benefits**:
- ✅ Build-time validation
- ✅ Runtime validation in development
- ✅ Type-safe parameters
- ✅ Self-documenting code
- ✅ Consistent pattern
- ✅ Easy to maintain

## Development Experience

### Console Output (Development Mode)

```
[CTA Validation] ✅ morning-pulse-coverage_check validated successfully
[CTA Validation] ✅ morning-pulse-efficiency_check validated successfully
```

### If Validation Fails

```
[CTA Validation] ❌ Errors in morning-pulse-coverage_check from MorningHomePulseCard:
[
  {
    severity: 'error',
    code: 'MISSING_FEATURE',
    message: 'Page /dashboard/properties/:id/tools/coverage-intelligence does not support required feature: gap-analysis',
    ctaId: 'morning-pulse-coverage_check',
    source: 'MorningHomePulseCard'
  }
]
```

This immediately tells you:
1. Which CTA has the problem
2. Which component created it
3. What feature is missing
4. Which page needs updating

## Testing

### Unit Test

```typescript
// __tests__/MorningHomePulseCard.test.tsx

import { render } from '@testing-library/react';
import MorningHomePulseCard from './MorningHomePulseCard';

test('creates valid CTA contracts', () => {
  const { container } = render(
    <MorningHomePulseCard propertyId="test-123" />
  );
  
  // In development, validation errors would appear in console
  // In production, contracts are still created but not validated
  
  const link = container.querySelector('a[href*="financial-efficiency"]');
  expect(link?.href).toContain('focus=breakdown');
  expect(link?.href).toContain('source=morning-pulse');
});
```

### E2E Test

```typescript
// e2e/morning-pulse-cta.spec.ts

test('morning pulse CTA delivers promise', async ({ page }) => {
  await page.goto('/dashboard');
  
  // Click micro action CTA
  await page.click('[data-testid="morning-pulse-cta"]');
  
  // Verify navigation
  await expect(page).toHaveURL(/financial-efficiency.*focus=breakdown/);
  
  // Verify destination shows breakdown
  await expect(page.locator('[data-testid="cost-breakdown"]')).toBeVisible();
});
```

## Rollout Strategy

### Phase 1: Add Contracts Alongside Manual Code

```typescript
// Keep existing code working
const tool = resolveActionTool(payload.microAction.title, propertyId);

// Add contract in parallel
const contract = createMicroActionContract(actionType, propertyId, title, detail);

// Use existing href for now
<Link href={tool.href}>Open {tool.label} →</Link>

// But validate contract in development
{process.env.NODE_ENV === 'development' && (
  <CTAValidator contract={contract} />
)}
```

### Phase 2: Fix Validation Errors

Fix any validation errors that appear in development console. Update page contracts or adjust CTA requirements as needed.

### Phase 3: Switch to Contract Hrefs

```typescript
// Remove manual code
// const tool = resolveActionTool(payload.microAction.title, propertyId);

// Use contract href
const contract = createMicroActionContract(actionType, propertyId, title, detail);
const href = buildHrefFromContract(contract);

<Link href={href}>Open {toolLabel} →</Link>
<CTAValidator contract={contract} />
```

### Phase 4: Remove Old Code

Remove `resolveActionTool` function and related manual code entirely.

## Conclusion

This migration example shows:

1. **How to identify** manual href construction
2. **How to create** page contracts for destinations
3. **How to build** CTA contracts with validation
4. **How to integrate** contracts into components
5. **How to test** the migration
6. **How to roll out** changes safely

The pattern is repeatable for all components bypassing the CTA contract system. The investment in migration pays off through:

- Fewer bugs
- Better developer experience
- Improved maintainability
- Increased user trust

**The CTA contract system works. This is how we use it.**
