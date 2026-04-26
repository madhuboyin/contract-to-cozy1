# CtC Top Command Bar

## Overview

The CtC Top Command Bar is a premium, persistent navigation component that sits at the top of the ContractToCozy dashboard. It provides a unified command/context layer combining global search, property context, mode switching, alerts, tasks, and profile access.

## Design Philosophy

The command bar follows ContractToCozy's premium design direction:
- **Apple + Stripe + Linear quality**: Clean, polished, professional
- **Soft borders and subtle shadows**: Not heavy or overwhelming
- **Teal accents for active states**: Consistent with brand
- **Calm and trustworthy**: High-end SaaS feel
- **Responsive**: Adapts gracefully from desktop to mobile

## Architecture

### Component Structure

```
CtcTopCommandBar (main component)
├── CtcCommandSearch (search/command input)
├── CtcPropertySelector (property context)
├── CtcModeSwitch (mode navigation)
├── AlertsButton (notifications)
├── TasksButton (pending actions)
└── UserProfileButton (account menu)
```

### File Locations

- `apps/frontend/src/components/layout/CtcTopCommandBar.tsx` - Main component
- `apps/frontend/src/components/layout/CtcCommandSearch.tsx` - Search input
- `apps/frontend/src/components/layout/CtcPropertySelector.tsx` - Property selector
- `apps/frontend/src/components/layout/CtcModeSwitch.tsx` - Mode switch
- `apps/frontend/src/lib/navigation/ctcModeRoutes.ts` - Mode configuration

## Features

### 1. Command Search
- Large, prominent search input with pill styling
- Placeholder: "Ask your home anything…"
- Keyboard shortcut: ⌘K (Cmd+K)
- Prepared for future command palette integration
- Currently logs to console (safe placeholder)

### 2. Property Selector
- Shows current property name (e.g., "Main Home")
- Home icon for visual context
- Chevron indicates future dropdown capability
- Prepared for multi-property selection

### 3. Mode Switch (Segmented Control)
- Four modes: Overview, Protect, Save, Fix
- Active mode uses teal background
- Inactive modes are clean text buttons
- Automatically detects active mode from pathname
- Navigates to property-scoped routes

### 4. Alerts & Tasks
- Bell icon for alerts (red badge for urgent items)
- CheckSquare icon for tasks (teal badge for pending)
- Counts pulled from orchestration data
- Only shows badges when counts > 0
- Shows "9+" for counts over 9

### 5. User Profile
- Avatar with user's first initial
- Shows first name on desktop
- Chevron for future dropdown menu
- Teal avatar background for brand consistency

## Layout Behavior

### Desktop (≥1024px)
- Full command bar visible
- Height: 72px
- Sticky positioning at top
- Search input gets maximum horizontal space
- All elements visible and spaced comfortably
- Logo on far left, profile on far right

### Tablet (768px - 1023px)
- Search input can shrink
- Mode switch remains visible
- Icons and badges stay visible
- Text labels may be hidden on smaller elements

### Mobile (<768px)
- Compact header layout
- Logo and essential actions only in top row
- Property selector and mode switch in horizontal scroll row below
- Height: 64px (16px per row)
- Preserves existing mobile navigation patterns

## Integration

### In Dashboard Layout

The command bar is integrated into `apps/frontend/src/app/(dashboard)/layout.tsx`:

```tsx
<AppShell
  leftNav={<PersistentSidebarNav />}
  topBar={<CtcTopCommandBar />}
  banner={<PropertySetupBanner />}
>
  {children}
</AppShell>
```

### In AppShell

The AppShell component (`apps/frontend/src/components/layout/AppShell.tsx`) renders:

```tsx
<div className="flex min-h-screen">
  {leftNav}
  <div className="flex-1 md:pl-[246px]">
    {topBar}           {/* Command bar here */}
    {banner}
    <div className="flex">
      {children}
      <RightSidebar />
    </div>
  </div>
</div>
```

## Data Sources

### Property Data
- Uses `usePropertyContext()` for selected property ID
- Queries property details via React Query
- Falls back to "Main Home" if no property selected

### Alerts & Tasks Counts
- Queries orchestration summary for selected property
- Filters actions by risk level and status
- Urgent: CRITICAL, HIGH, or overdue actions
- Pending: PENDING or IN_PROGRESS actions

### User Data
- Uses `useAuth()` hook for user information
- Displays user's first name
- Shows first initial in avatar

## Mode Configuration

Modes are defined in `apps/frontend/src/lib/navigation/ctcModeRoutes.ts`:

```typescript
export const CTC_MODES = [
  {
    key: 'overview',
    label: 'Overview',
    matchPatterns: ['/dashboard', '/dashboard/properties/[id]'],
    getHref: (propertyId) => propertyId 
      ? `/dashboard/properties/${propertyId}` 
      : '/dashboard'
  },
  {
    key: 'protect',
    label: 'Protect',
    matchPatterns: ['/protect', '/dashboard/properties/[id]/protect'],
    getHref: (propertyId) => propertyId
      ? `/dashboard/properties/${propertyId}/protect`
      : '/dashboard/properties?navTarget=protect'
  },
  // ... Save and Fix modes
];
```

## Styling Guidelines

### Colors
- Background: `bg-white/95` with `backdrop-blur-sm`
- Borders: `border-slate-200`
- Text: `text-slate-700` (primary), `text-slate-400` (secondary)
- Active state: `bg-teal-600 text-white`
- Hover: `hover:bg-slate-50`

### Spacing
- Command bar height: `h-[72px]` (desktop), `h-16` (mobile)
- Internal padding: `px-6` (desktop), `px-4` (mobile)
- Element gaps: `gap-6` (desktop), `gap-3` (mobile)
- Button height: `h-9`

### Borders & Shadows
- Border: `border-b border-slate-200`
- Shadow: `shadow-[0_1px_3px_rgba(0,0,0,0.04)]`
- Focus ring: `focus:ring-2 focus:ring-teal-500/20`

### Rounded Corners
- Buttons: `rounded-lg`
- Search input: `rounded-full`
- Mode switch: `rounded-lg` (container), `rounded-md` (buttons)
- Avatar: `rounded-full`

## Future Enhancements

### Command Palette
- Wire up CtcCommandSearch to open command palette
- Implement quick actions and suggestions
- Add keyboard navigation
- Support fuzzy search

### Property Dropdown
- Add multi-property selection
- Show property list in dropdown
- Support property switching
- Add "Add property" action

### Alerts & Tasks Dropdowns
- Show alert/task previews on click
- Support quick actions
- Add filtering and sorting
- Link to full views

### User Profile Dropdown
- Add profile menu
- Include settings link
- Add sign out action
- Show account info

## Accessibility

- All interactive elements are keyboard accessible
- Focus states are clearly visible
- ARIA labels on icon-only buttons
- Semantic HTML structure
- Proper heading hierarchy

## Performance

- Uses React Query for data caching
- Stale time: 5 minutes (property), 3 minutes (orchestration)
- Conditional queries (only when property selected)
- Optimized re-renders with proper memoization

## Testing Checklist

- [ ] Desktop layout renders correctly
- [ ] Mobile layout renders correctly
- [ ] Tablet layout renders correctly
- [ ] Mode switching navigates correctly
- [ ] Active mode is detected from pathname
- [ ] Property name displays correctly
- [ ] Alert counts display when > 0
- [ ] Task counts display when > 0
- [ ] User name displays correctly
- [ ] User initial displays correctly
- [ ] Search input is clickable
- [ ] ⌘K keyboard shortcut works
- [ ] All buttons have hover states
- [ ] Focus states are visible
- [ ] No layout shift on load
- [ ] Sticky positioning works
- [ ] No double headers
- [ ] Left sidebar aligns correctly
- [ ] Right sidebar remains visible
- [ ] Mobile horizontal scroll works
- [ ] Safe area insets respected on mobile

## Known Limitations

1. Command palette not yet implemented (placeholder function)
2. Property dropdown not yet implemented (single property only)
3. Alert/task buttons don't open dropdowns yet
4. User profile button doesn't open menu yet
5. Mobile menu drawer still uses legacy navigation

## Migration Notes

- Replaces legacy mobile header when topBar prop is provided
- Preserves existing left sidebar navigation
- Does not affect right intelligence rail
- Does not change page content or cards
- Maintains all existing business logic
