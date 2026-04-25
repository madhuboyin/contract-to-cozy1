# Dynamic Sidebar Intelligence Rail

## Overview

The Dynamic Sidebar Intelligence Rail is a centralized, page-aware system that generates contextual actions based on the current route, property context, signals, and user intent. It replaces static hardcoded actions with intelligent, adaptive recommendations.

## Architecture

### Core Components

1. **`dynamicSidebarActions.ts`** - Centralized action generation system
2. **`RightSidebar.tsx`** - UI component that renders dynamic actions
3. **Route-based action generators** - Specialized functions for each page family

### Key Features

- ✅ **Page-aware**: Actions adapt based on current route
- ✅ **Context-sensitive**: Considers property data, signals, and missing information
- ✅ **Priority-based**: High-priority actions are visually emphasized
- ✅ **Grouped**: Actions organized by relevance (recommended, contextual, missing info, etc.)
- ✅ **Limit 3-5 actions**: Prioritizes relevance over quantity
- ✅ **Premium UI**: Clean, compact, consistent with CtC design system

## Usage

### Basic Implementation

```typescript
import { getSidebarActions, getPageAwareSubtitle } from '@/lib/sidebar/dynamicSidebarActions';

const actions = getSidebarActions({
  route: '/dashboard/properties/123/tools/coverage-analysis',
  propertyId: '123',
  signals: {
    urgentCount: 2,
    atRisk: 5000,
    gapCount: 3,
    highConfidence: 5,
  },
  missingData: {
    hasInsurance: false,
    hasWarranties: true,
    hasInventory: true,
  },
  activeTool: 'coverage-analysis',
});

const subtitle = getPageAwareSubtitle(route, signals);
```

### Action Object Structure

```typescript
interface SidebarAction {
  id: string;                    // Unique identifier
  title: string;                 // Action title
  description: string;           // Supporting text
  icon: LucideIcon;             // Icon component
  href?: string;                // Navigation link
  onClickAction?: string;       // Special action handler
  priority?: 'high' | 'medium' | 'low';
  badge?: string;               // Optional badge text
  confidenceLabel?: string;     // Optional confidence indicator
  sourceLabel?: string;         // Optional source attribution
  group?: string;               // Action grouping
}
```

## Route Families

The system recognizes the following route families:

| Route Family | Example Paths | Actions Focus |
|-------------|---------------|---------------|
| **today** | `/dashboard`, `/today` | Urgent alerts, scans, maintenance |
| **my-home** | `/properties/[id]` | Home profile, rooms, inventory |
| **protect** | `/protect` | Coverage gaps, insurance, warranties |
| **save** | `/save` | Savings opportunities, cost analysis |
| **fix** | `/fix`, `/resolution-center` | Repairs, maintenance, contractors |
| **vault** | `/vault`, `/documents` | Document upload, warranties, receipts |
| **home-lab** | `/home-lab` | Experiments, simulators, tools |
| **inventory** | `/inventory` | Add items, scan rooms, coverage |
| **rooms** | `/rooms` | Add rooms, inventory, scanning |
| **guidance** | `/guidance` | Continue journey, coverage checks |
| **tools** | `/tools/*` | Tool-specific actions |

## Action Examples by Page

### Today Page
```typescript
[
  {
    id: 'review-urgent-alerts',
    title: 'Review highest priority alert',
    description: '2 urgent issues detected',
    icon: AlertTriangle,
    priority: 'high',
    badge: 'Urgent',
  },
  {
    id: 'run-full-scan',
    title: 'Run full scan',
    description: 'Refresh home signals',
    icon: BarChart3,
    onClickAction: 'refresh-signals',
  },
]
```

### Protect Page
```typescript
[
  {
    id: 'review-coverage-gaps',
    title: 'Review coverage gaps',
    description: '3 gaps identified',
    icon: ShieldCheck,
    priority: 'high',
    badge: 'Action needed',
  },
  {
    id: 'upload-insurance-policy',
    title: 'Upload insurance policy',
    description: 'Track coverage details',
    icon: Upload,
    priority: 'high',
  },
]
```

### Save Page
```typescript
[
  {
    id: 'review-savings-opportunities',
    title: 'Review savings opportunities',
    description: 'Find cost reduction paths',
    icon: DollarSign,
    priority: 'high',
  },
  {
    id: 'run-sell-hold-rent',
    title: 'Run sell vs hold vs rent simulator',
    description: 'Compare ownership scenarios',
    icon: Calculator,
  },
]
```

## Extending the System

### Adding a New Route Family

1. Add the route family to the `RouteFamily` type:
```typescript
type RouteFamily = 
  | 'today'
  | 'my-new-page'  // Add here
  | ...
```

2. Update `getRouteFamily()` function:
```typescript
function getRouteFamily(route: string): RouteFamily {
  if (route.includes('/my-new-page')) return 'my-new-page';
  // ...
}
```

3. Create action generator function:
```typescript
function getMyNewPageActions(ctx: SidebarContext): SidebarAction[] {
  const actions: SidebarAction[] = [];
  const propPath = getPropertyPath(ctx.propertyId);

  actions.push({
    id: 'my-action',
    title: 'My Action',
    description: 'Action description',
    icon: MyIcon,
    href: `${propPath}/my-path`,
    priority: 'high',
    group: 'recommended-next',
  });

  return actions;
}
```

4. Add case to `getSidebarActions()`:
```typescript
switch (routeFamily) {
  case 'my-new-page':
    actions = getMyNewPageActions(ctx);
    break;
  // ...
}
```

### Adding New Action Types

To add a new special action handler:

1. Add the action in the generator:
```typescript
{
  id: 'my-special-action',
  title: 'My Special Action',
  description: 'Does something special',
  icon: Zap,
  onClickAction: 'my-special-action',
  priority: 'high',
}
```

2. Handle it in `DynamicActionsBlock`:
```typescript
const handleActionClick = (action: SidebarAction) => {
  if (action.onClickAction === 'my-special-action') {
    // Handle the special action
    toast({ title: 'Action executed', description: 'Special action completed.' });
  }
  // ...
};
```

## Context Data

The `SidebarContext` interface provides all necessary data for action generation:

```typescript
interface SidebarContext {
  route: string;                    // Current pathname
  propertyId?: string;              // Selected property ID
  signals?: {                       // Property signals
    urgentCount?: number;
    atRisk?: number;
    gapCount?: number;
    highConfidence?: number;
  };
  missingData?: {                   // Missing data flags
    hasInsurance?: boolean;
    hasWarranties?: boolean;
    hasInventory?: boolean;
    hasDocuments?: boolean;
    hasFinanceSnapshot?: boolean;
    hasRooms?: boolean;
  };
  activeTool?: string;              // Current tool name
  currentAsset?: string;            // Current asset ID
  currentRoom?: string;             // Current room ID
  currentGuidanceStep?: string;     // Current guidance step
  property?: {                      // Property details
    address?: string;
    type?: string;
    yearBuilt?: number;
  };
}
```

## UI Behavior

### Priority Visualization

- **High priority**: Teal background on icon, optional teal background on first action
- **Medium priority**: Slate background on icon
- **Low priority**: Light slate background on icon

### Badges

Actions can display badges for emphasis:
- "Urgent" - Red/amber badge for time-sensitive actions
- "Action needed" - Amber badge for required actions
- "Recommended" - Teal badge for suggested actions

### Subtitle

The subtitle adapts based on the current page:
- "Suggested from this page"
- "Relevant to coverage gaps"
- "Based on missing home details"
- "Protection opportunities"
- etc.

## Best Practices

1. **Keep actions focused**: 3-5 actions maximum per page
2. **Prioritize relevance**: High-priority actions should be truly urgent
3. **Avoid duplication**: Don't repeat actions already in main content
4. **Use clear language**: Action titles should be concise and actionable
5. **Provide context**: Descriptions should explain the value
6. **Test all routes**: Ensure actions make sense for each page
7. **Handle missing data**: Gracefully handle undefined context values

## Testing

To test the dynamic sidebar:

1. Navigate to different pages (Today, Protect, Save, etc.)
2. Verify actions change based on the page
3. Check that high-priority actions are emphasized
4. Confirm badges appear when appropriate
5. Test action clicks (navigation and special handlers)
6. Verify subtitle changes per page

## Future Enhancements

Potential improvements:
- [ ] Add user preference-based action ordering
- [ ] Implement action dismissal/snoozing
- [ ] Add action completion tracking
- [ ] Support custom action templates
- [ ] Add A/B testing for action effectiveness
- [ ] Implement machine learning for action prioritization
- [ ] Add action analytics and tracking
