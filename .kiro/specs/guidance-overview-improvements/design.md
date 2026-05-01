# Design Document: Guidance Overview Page Improvements

## Overview

This design document provides a practical implementation approach for the 10 improvement areas identified in the requirements document. The focus is on incremental, non-breaking changes that can be implemented independently.

---

## 1. Component Extraction and Code Organization

### Approach
Extract the 1,875-line GuidanceOverviewClient into focused sub-components using a phased approach.

### New File Structure
```
guidance-overview/
├── GuidanceOverviewClient.tsx (orchestrator, <400 lines)
├── components/
│   ├── ScopeCategorySelector.tsx
│   ├── InventoryPicker.tsx
│   ├── ServiceCategoryPicker.tsx
│   ├── IssueTypeSelector.tsx
│   ├── JourneyView.tsx
│   ├── JourneyStepSidebar.tsx
│   └── JourneyStepDetail.tsx
├── hooks/
│   └── useGuidanceNavigation.ts
└── utils/
    └── guidanceIssueSuggestions.ts
```

### Key Interfaces
```typescript
// useGuidanceNavigation hook
interface GuidanceNavigationHook {
  scopeCategory: GuidanceScopeCategory | null;
  selectedItemId: string | null;
  selectedIssueType: string | null;
  navigateToScope: (category: GuidanceScopeCategory) => void;
  navigateToAsset: (option: AssetScopeOption) => void;
  navigateToIssue: (issueType: string) => void;
  goBack: () => void;
}

// Component props
interface ScopeCategorySelectorProps {
  propertyId: string;
  onSelect: (category: GuidanceScopeCategory) => void;
}

interface InventoryPickerProps {
  propertyId: string;
  onSelect: (option: AssetScopeOption) => void;
  onBack: () => void;
}
```

### Migration Strategy
1. Extract utilities first (guidanceIssueSuggestions.ts)
2. Extract hook (useGuidanceNavigation)
3. Extract Phase A components (selectors)
4. Extract Phase B components (journey view)
5. Refactor main component to use extracted pieces

---

## 2. Performance Optimization

### Approach
Implement lazy loading, query optimization, and memoization without changing component behavior.

### Implementation Details

**Lazy Loading:**
```typescript
const NegotiationShieldInline = lazy(() => import('@/components/guidance/NegotiationShieldInline'));
const PriceCheckInline = lazy(() => import('@/components/guidance/PriceCheckInline'));
const CoverageCheckInline = lazy(() => import('@/components/guidance/CoverageCheckInline'));
const RecallCheckInline = lazy(() => import('@/components/guidance/RecallCheckInline'));
```

**Query Optimization:**
```typescript
// Parallel data fetching
const { data: guidance } = useGuidance(propertyId, { staleTime: 60_000 });
const { data: inventory } = useQuery({
  queryKey: ['inventory-items', propertyId],
  queryFn: () => listInventoryItems(propertyId, {}),
  staleTime: 60_000,
});

// Optimistic updates
const skipStepMutation = useMutation({
  mutationFn: skipGuidanceStep,
  onMutate: async (variables) => {
    await queryClient.cancelQueries(['guidance', 'journey', propertyId]);
    const previous = queryClient.getQueryData(['guidance', 'journey', propertyId]);
    queryClient.setQueryData(['guidance', 'journey', propertyId], (old) => ({
      ...old,
      steps: old.steps.map(s => s.id === variables.stepId ? { ...s, status: 'SKIPPED' } : s)
    }));
    return { previous };
  },
  onError: (err, variables, context) => {
    queryClient.setQueryData(['guidance', 'journey', propertyId], context.previous);
  },
});
```

**Memoization:**
```typescript
const filteredAssetOptions = useMemo(() => {
  // existing filter logic
}, [allAssetScopeOptions, assetSearch, selectedCategory]);

const navigateToAsset = useCallback((option: AssetScopeOption) => {
  // existing navigation logic
}, [router, baseHref]);
```

---

## 3. Error Handling and Loading States

### Approach
Add error boundaries and consistent loading/error states across all async operations.

### Error Boundary Structure
```typescript
// New file: components/GuidanceErrorBoundary.tsx
class GuidanceErrorBoundary extends React.Component<Props, State> {
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    track('error_encountered', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} onRetry={this.props.onRetry} />;
    }
    return this.props.children;
  }
}
```

### Loading States
```typescript
// Skeleton components
const InventoryPickerSkeleton = () => (
  <div className="space-y-2">
    {[...Array(4)].map((_, i) => (
      <div key={i} className="flex items-center gap-3 rounded-xl border px-4 py-3.5">
        <span className="h-9 w-9 animate-pulse rounded-lg bg-slate-100" />
        <div className="flex-1 space-y-1.5">
          <span className="block h-4 w-32 animate-pulse rounded bg-slate-100" />
          <span className="block h-3 w-20 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
    ))}
  </div>
);
```

---

## 4. Accessibility Improvements

### Approach
Add ARIA attributes, keyboard navigation, and semantic HTML incrementally.

### Implementation Checklist
```typescript
// Keyboard navigation
<button
  onClick={handleSelect}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelect();
    }
  }}
  aria-label="Select HVAC system"
  className="focus:outline-none focus:ring-2 focus:ring-sky-500"
>
  {/* content */}
</button>

// ARIA live regions
<div aria-live="polite" aria-atomic="true" role="status">
  {isLoading && <span>Loading inventory items...</span>}
  {error && <span>Error loading items. Please try again.</span>}
</div>

// Focus management
useEffect(() => {
  if (phase === 'B') {
    const heading = document.querySelector('h1');
    heading?.focus();
  }
}, [phase]);
```

---

## 5. User Experience Enhancements

### Approach
Add onboarding modal, tooltips, and contextual help using existing UI components.

### Onboarding Modal
```typescript
// New file: components/GuidanceOnboardingModal.tsx
const GuidanceOnboardingModal = ({ isOpen, onClose }: Props) => {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleClose = () => {
    if (dontShowAgain) {
      localStorage.setItem('guidance-onboarding-dismissed', 'true');
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Welcome to Guided Issue Resolution</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p>This tool helps you resolve home issues step-by-step:</p>
          <ol className="list-decimal pl-5 space-y-2">
            <li>Choose what needs attention (item or service)</li>
            <li>Describe the issue</li>
            <li>Follow personalized steps to resolution</li>
          </ol>
        </div>
        <DialogFooter>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={dontShowAgain} onChange={(e) => setDontShowAgain(e.target.checked)} />
            <span className="text-sm">Don't show again</span>
          </label>
          <Button onClick={handleClose}>Get Started</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

### Tooltips
```typescript
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

<TooltipProvider delayDuration={300}>
  <Tooltip>
    <TooltipTrigger>
      <div className="flex items-center gap-2">
        {[0, 1, 2, 3, 4].map((index) => (
          <span key={index} className={cn('h-2.5 w-2.5 rounded-full', index < confidenceDots ? 'bg-emerald-500' : 'bg-slate-200')} />
        ))}
      </div>
    </TooltipTrigger>
    <TooltipContent>
      <p>Confidence based on {dataPoints} local repairs</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

---

## 6. Analytics and Monitoring

### Approach
Add comprehensive event tracking using the existing `track()` function.

### Event Schema
```typescript
// New file: utils/guidanceAnalytics.ts
export const trackGuidanceEvent = {
  scopeCategorySelected: (category: GuidanceScopeCategory) => {
    track('scope_category_selected', { category });
  },
  
  inventoryItemSelected: (item: { id: string; category: string; name: string }) => {
    track('inventory_item_selected', {
      itemId: item.id,
      itemCategory: item.category,
      itemName: item.name,
    });
  },
  
  issueTypeSelected: (issueType: string, isCustom: boolean) => {
    track('issue_type_selected', { issueType, isCustom });
  },
  
  journeyStarted: (journey: { id: string; scopeCategory: string; issueType: string }) => {
    track('journey_started', {
      journeyId: journey.id,
      scopeCategory: journey.scopeCategory,
      issueType: journey.issueType,
    });
  },
  
  journeyStepViewed: (step: { key: string; order: number }, timeOnPreviousStep?: number) => {
    track('journey_step_viewed', {
      stepKey: step.key,
      stepOrder: step.order,
      timeOnPreviousStep,
    });
  },
};
```

---

## 7. State Management Improvements

### Approach
Implement a simple state machine using useReducer for predictable state transitions.

### State Machine Design
```typescript
// New file: hooks/useGuidanceStateMachine.ts
type GuidanceState = 
  | { phase: 'SCOPE_SELECTION' }
  | { phase: 'TARGET_SELECTION'; scopeCategory: GuidanceScopeCategory }
  | { phase: 'ISSUE_SELECTION'; scopeCategory: GuidanceScopeCategory; targetId: string }
  | { phase: 'JOURNEY_ACTIVE'; journeyId: string; currentStepKey: string }
  | { phase: 'JOURNEY_COMPLETE'; journeyId: string };

type GuidanceAction =
  | { type: 'SELECT_SCOPE'; scopeCategory: GuidanceScopeCategory }
  | { type: 'SELECT_TARGET'; targetId: string }
  | { type: 'SELECT_ISSUE'; issueType: string }
  | { type: 'START_JOURNEY'; journeyId: string }
  | { type: 'NAVIGATE_STEP'; stepKey: string }
  | { type: 'COMPLETE_JOURNEY' }
  | { type: 'GO_BACK' };

function guidanceReducer(state: GuidanceState, action: GuidanceAction): GuidanceState {
  switch (action.type) {
    case 'SELECT_SCOPE':
      if (state.phase !== 'SCOPE_SELECTION') {
        throw new Error(`Cannot select scope from phase ${state.phase}`);
      }
      return { phase: 'TARGET_SELECTION', scopeCategory: action.scopeCategory };
    
    case 'SELECT_TARGET':
      if (state.phase !== 'TARGET_SELECTION') {
        throw new Error(`Cannot select target from phase ${state.phase}`);
      }
      return { ...state, phase: 'ISSUE_SELECTION', targetId: action.targetId };
    
    // ... other transitions
    
    default:
      return state;
  }
}

export function useGuidanceStateMachine(initialState: GuidanceState) {
  const [state, dispatch] = useReducer(guidanceReducer, initialState);
  
  // Sync with URL
  useEffect(() => {
    // Update URL based on state
  }, [state]);
  
  return { state, dispatch };
}
```

---

## 8. Type Safety Enhancements

### Approach
Define comprehensive TypeScript types and enable strict compiler options.

### Core Type Definitions
```typescript
// New file: types/guidanceWorkflow.ts
export type GuidanceScopeCategory = 'ITEM' | 'SERVICE';

export interface GuidanceNavigationParams {
  scopeCategory?: GuidanceScopeCategory;
  itemId?: string;
  inventoryItemId?: string;
  homeAssetId?: string;
  assetName?: string;
  serviceKey?: string;
  issueType?: string;
  journeyId?: string;
  stepKey?: string;
  guidanceStepKey?: string;
}

export interface AssetScopeOption {
  key: string;
  assetName: string;
  systemType: string;
  category: string;
  actionCta: string | null;
  outOfPocketCost: number;
  inventoryItemId: string | null;
  homeAssetId: string | null;
}

export interface IssueTypeSuggestion {
  key: string;
  label: string;
  reason?: string; // Why this was suggested
}

export interface JourneyStepProps {
  step: GuidanceStepDTO;
  journey: GuidanceJourneyDTO;
  propertyId: string;
  isActive: boolean;
  onComplete: () => void;
}
```

### Zod Schemas for Runtime Validation
```typescript
import { z } from 'zod';

export const AssetScopeOptionSchema = z.object({
  key: z.string(),
  assetName: z.string(),
  systemType: z.string(),
  category: z.string(),
  actionCta: z.string().nullable(),
  outOfPocketCost: z.number(),
  inventoryItemId: z.string().nullable(),
  homeAssetId: z.string().nullable(),
});

export const GuidanceNavigationParamsSchema = z.object({
  scopeCategory: z.enum(['ITEM', 'SERVICE']).optional(),
  itemId: z.string().optional(),
  inventoryItemId: z.string().optional(),
  homeAssetId: z.string().optional(),
  assetName: z.string().optional(),
  serviceKey: z.string().optional(),
  issueType: z.string().optional(),
  journeyId: z.string().optional(),
  stepKey: z.string().optional(),
  guidanceStepKey: z.string().optional(),
});
```

---

## 9. Testing Coverage

### Approach
Add tests incrementally starting with utilities, then hooks, then components.

### Test File Structure
```
__tests__/
├── utils/
│   ├── guidanceIssueSuggestions.test.ts
│   └── guidanceHelpers.test.ts
├── hooks/
│   ├── useGuidanceNavigation.test.ts
│   └── useGuidanceStateMachine.test.ts
├── components/
│   ├── ScopeCategorySelector.test.tsx
│   ├── InventoryPicker.test.tsx
│   ├── IssueTypeSelector.test.tsx
│   └── JourneyView.test.tsx
└── integration/
    ├── phaseA-workflow.test.tsx
    ├── phaseB-workflow.test.tsx
    └── deepLinking.test.tsx
```

### Example Unit Test
```typescript
// __tests__/utils/guidanceHelpers.test.ts
import { resolveAssetLabel, resolvePrimarySubtitle } from '../guidanceHelpers';

describe('resolveAssetLabel', () => {
  it('should return inventory item name when present', () => {
    const action = {
      journey: {
        inventoryItem: { name: 'Water Heater' }
      }
    } as GuidanceActionModel;
    
    expect(resolveAssetLabel(action)).toBe('Water Heater');
  });
  
  it('should return formatted asset type when no item name', () => {
    const action = {
      journey: {
        homeAsset: { assetType: 'HVAC_SYSTEM' }
      }
    } as GuidanceActionModel;
    
    expect(resolveAssetLabel(action)).toBe('HVAC System system');
  });
});
```

### Example Component Test
```typescript
// __tests__/components/ScopeCategorySelector.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ScopeCategorySelector } from '../ScopeCategorySelector';

describe('ScopeCategorySelector', () => {
  it('should call onSelect with ITEM when item card is clicked', () => {
    const onSelect = jest.fn();
    render(<ScopeCategorySelector propertyId="123" onSelect={onSelect} />);
    
    const itemCard = screen.getByText('Get guidance for a home item');
    fireEvent.click(itemCard);
    
    expect(onSelect).toHaveBeenCalledWith('ITEM');
  });
  
  it('should call onSelect with SERVICE when service card is clicked', () => {
    const onSelect = jest.fn();
    render(<ScopeCategorySelector propertyId="123" onSelect={onSelect} />);
    
    const serviceCard = screen.getByText('Find a service');
    fireEvent.click(serviceCard);
    
    expect(onSelect).toHaveBeenCalledWith('SERVICE');
  });
});
```

---

## 10. Documentation and Developer Experience

### Approach
Create focused documentation files and add JSDoc comments to all exports.

### Documentation Structure
```
docs/
├── GUIDANCE_OVERVIEW_ARCHITECTURE.md
├── GUIDANCE_OVERVIEW_TROUBLESHOOTING.md
├── GUIDANCE_OVERVIEW_TESTING.md
└── GUIDANCE_OVERVIEW_CHANGELOG.md
```

### JSDoc Example
```typescript
/**
 * Custom hook for managing guidance workflow navigation and URL state.
 * 
 * This hook encapsulates all URL parameter parsing and navigation logic,
 * providing a clean interface for components to navigate between workflow phases.
 * 
 * @param propertyId - The ID of the property being managed
 * @returns Navigation state and functions
 * 
 * @example
 * ```tsx
 * const { scopeCategory, navigateToScope, navigateToAsset } = useGuidanceNavigation(propertyId);
 * 
 * // Navigate to item selection
 * navigateToScope('ITEM');
 * 
 * // Navigate to specific asset
 * navigateToAsset({ inventoryItemId: '123', assetName: 'Water Heater' });
 * ```
 */
export function useGuidanceNavigation(propertyId: string): GuidanceNavigationHook {
  // implementation
}
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
- Extract utilities (guidanceIssueSuggestions.ts)
- Create type definitions
- Add error boundaries
- Set up test infrastructure

### Phase 2: Component Extraction (Week 2-3)
- Extract useGuidanceNavigation hook
- Extract Phase A components (selectors)
- Add tests for extracted components
- Update main component to use extracted pieces

### Phase 3: Performance & UX (Week 4)
- Implement lazy loading
- Add query optimization
- Add onboarding modal
- Add tooltips and help text

### Phase 4: State Management & Analytics (Week 5)
- Implement state machine
- Add comprehensive analytics tracking
- Add accessibility improvements
- Add loading states

### Phase 5: Testing & Documentation (Week 6)
- Achieve 80% test coverage
- Write architecture documentation
- Create troubleshooting guide
- Add JSDoc comments

---

## Success Metrics

- **Code Quality**: Main component reduced from 1,875 to <400 lines
- **Performance**: Lighthouse score ≥85, TTI <3.5s on 3G
- **Test Coverage**: ≥80% code coverage
- **Accessibility**: WCAG AA compliance
- **Developer Experience**: All exports have JSDoc comments
- **Analytics**: All 12 key events tracked

---

## Risk Mitigation

1. **Breaking Changes**: All changes maintain existing prop interfaces and behavior
2. **Performance Regression**: Measure before/after with Lighthouse
3. **Test Failures**: Run full test suite before each merge
4. **Accessibility Regression**: Use axe-core in CI pipeline
5. **Type Errors**: Enable strict TypeScript incrementally per file

---

## Conclusion

This design provides a practical, incremental approach to improving the guidance-overview page. Each improvement can be implemented independently, tested thoroughly, and deployed without disrupting existing functionality. The phased approach allows for continuous delivery while maintaining system stability.
