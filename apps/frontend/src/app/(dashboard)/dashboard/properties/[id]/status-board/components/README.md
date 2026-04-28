# Status Board UI Modernization Components

This directory contains the modern card-based layout components for the Status Board feature.

## Overview

The Status Board UI has been modernized from a table-based layout to a card-based interface following 2024-2026 UI trends. The new design reduces cognitive load, improves mobile experience, and maintains all existing functionality.

## Components

### CardLayout
**File**: `CardLayout.tsx`

Main wrapper component that orchestrates the card-based layout.

**Features**:
- Integrates HeroCard, KPIPills, FilterChips, and CardGrid
- Computes priority actions
- Manages filter state
- Handles empty states

**Usage**:
```tsx
<CardLayout
  items={items}
  summary={summary}
  conditionFilter={conditionFilter}
  categoryFilter={categoryFilter}
  handlers={cardHandlers}
  onConditionFilterChange={setConditionFilter}
  onPriorityAction={handlePriorityAction}
  onRemoveFilter={handleRemoveFilter}
/>
```

### HeroCard
**File**: `HeroCard.tsx`

Prominent card displaying priority actions or status messages.

**Features**:
- Three states: priority action, pending install dates, all stable
- Gradient backgrounds (rose-to-orange for urgent, emerald-to-teal for stable)
- Action button with proper touch targets (44x44px minimum)
- Age display circle for priority items

**Usage**:
```tsx
<HeroCard
  priorityItem={priorityItem}
  pendingInstallDateCount={pendingInstallDateCount}
  onAction={handlePriorityAction}
/>
```

### StatusCard
**File**: `StatusCard.tsx`

Individual card displaying a single maintenance item.

**Features**:
- Colored left border indicating condition status
- Category icon and item name
- Key metrics (age, warranty)
- Condition badge with icon
- Primary action button
- Pin indicator for pinned items
- Hover effects (elevation, translation within 200ms)
- Keyboard navigation support
- ARIA labels for accessibility

**Usage**:
```tsx
<StatusCard
  item={item}
  isExpanded={expandedId === item.id}
  onToggleExpand={() => setExpandedId(item.id)}
  onTogglePin={() => handleTogglePin(item)}
  onToggleHide={() => handleToggleHide(item)}
  onViewItem={() => handleViewItem(item)}
  onSaveOverride={(payload) => handleSaveOverride(item.id, payload)}
/>
```

### KPIPills
**File**: `KPIPills.tsx`

Compact summary pills displaying condition counts.

**Features**:
- Displays GOOD, MONITOR, ACTION_NEEDED, and total counts
- Colored dot indicators matching condition colors
- Clickable to filter by condition
- Visual state for active filters

**Usage**:
```tsx
<KPIPills
  summary={summary}
  activeFilter={conditionFilter}
  onFilterChange={setConditionFilter}
/>
```

### FilterChips
**File**: `FilterChips.tsx`

Active filter chips with remove buttons.

**Features**:
- Displays active filters as removable chips
- Color coding (condition colors for condition filters, neutral for category)
- X button to remove filters
- Hidden when no filters are active

**Usage**:
```tsx
<FilterChips
  activeFilters={activeFilters}
  onRemoveFilter={handleRemoveFilter}
/>
```

### CardGrid
**File**: `CardGrid.tsx`

Responsive grid layout for status cards.

**Features**:
- Responsive: 1 column (mobile), 2 columns (tablet), 3 columns (desktop)
- 16px gap spacing at all viewport sizes
- Uses item.id as React key for stability
- Smooth transitions on viewport changes (300ms)

**Usage**:
```tsx
<CardGrid
  items={filteredItems}
  handlers={cardHandlers}
/>
```

### CardLayoutErrorBoundary
**File**: `CardLayoutErrorBoundary.tsx`

Error boundary for graceful degradation.

**Features**:
- Catches rendering errors in card layout
- Logs errors to console
- Displays user-friendly error message
- Provides option to retry or fallback to table layout

**Usage**:
```tsx
<CardLayoutErrorBoundary onError={() => setUseCardLayout(false)}>
  <CardLayout {...props} />
</CardLayoutErrorBoundary>
```

## Utilities

### priorityUtils.ts
- `computePriorityAction()` - Computes highest priority item
- `countItemsNeedingInstallDate()` - Counts items needing install dates

### filterUtils.ts
- `applyFilters()` - Applies filter chain to items array

### urlStateUtils.ts
- `extractFiltersFromSearchParams()` - Extracts filters from URL
- `buildSearchParamsFromFilters()` - Builds URL params from filters
- `updateURLWithFilters()` - Updates URL with new filters

### performanceUtils.ts
- `debounce()` - Debounces function calls
- `throttle()` - Throttles function calls
- `shouldVirtualize()` - Determines if virtualization is needed

## Design Principles

### Visual Simplification
- Flat colors without gradients for condition indicators (except HeroCard)
- No glassmorphism effects on cards
- Single primary action per card
- Consistent spacing using design tokens (4px, 8px, 16px, 24px)

### Accessibility
- WCAG 2.1 AA compliant
- Keyboard navigation support
- ARIA labels on all interactive elements
- Focus indicators (2px outline)
- Semantic HTML (article, button, nav)
- Color is not the only indicator (icons + text labels)

### Performance
- Memoization for expensive computations
- Debouncing for search input (300ms)
- Lazy loading for card details
- Virtualization consideration for large lists (> 100 items)

### Mobile Optimization
- Touch targets meet 44x44px minimum
- Adequate spacing between interactive elements
- No horizontal scrolling
- Immediate visual feedback on tap (< 100ms)

## Feature Flag

The card layout is controlled by a feature flag in `featureFlags.ts`:

```typescript
export const STATUS_BOARD_FEATURE_FLAGS = {
  useCardLayout: false, // Set to true to enable card layout
} as const;
```

When `useCardLayout: false`, the legacy table layout is displayed.
When `useCardLayout: true`, the modern card layout is displayed.

## Error Handling

The card layout includes an error boundary that automatically falls back to the table layout if rendering errors occur. This ensures users can always access their data even if the new UI encounters issues.

## Testing

All components are TypeScript-strict and compile without errors. The implementation includes:

- Type safety with TypeScript interfaces
- Proper prop validation
- Error boundary for graceful degradation
- Accessibility compliance
- Performance optimizations

## Migration Path

1. **Phase 1**: Feature flag disabled (default) - table layout
2. **Phase 2**: Feature flag enabled for testing - card layout with fallback
3. **Phase 3**: Feature flag enabled for all users - card layout
4. **Phase 4**: Remove feature flag and table layout code

## Support

For questions or issues:
- See `ROLLOUT.md` for rollout strategy
- Check `.kiro/specs/status-board-ui-modernization/` for detailed specifications
- Review design document for technical details
