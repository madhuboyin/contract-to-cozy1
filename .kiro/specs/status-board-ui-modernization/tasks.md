# Implementation Plan: Status Board UI Modernization

## Overview

Transform the Status Board from a table-based layout to a modern card-based interface. Implementation follows a phased approach: extract new components while keeping the table as fallback, implement card grid layout with feature flag, then polish and rollout. All existing functionality is preserved including data fetching, filtering, and drawer integration.

## Tasks

- [x] 1. Set up feature flag and project structure
  - Add `useCardLayout` feature flag to configuration (default: false)
  - Create directory structure for new components under `status-board/components/`
  - Set up conditional rendering logic in StatusBoardClient to switch between layouts
  - _Requirements: 15.1, 15.2_

- [x] 2. Implement core data utilities and priority logic
  - [x] 2.1 Create computePriorityAction utility function
    - Implement priority action computation with exclusion of items needing install dates
    - Apply prioritization: recommendation severity > pinned status > age descending
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [ ]* 2.2 Write property test for computePriorityAction
    - **Property 1: Priority Action Computation and Display**
    - **Property 2: Priority Action Exclusion Rule**
    - **Validates: Requirements 1.1, 1.2, 1.3, 13.1**
  
  - [x] 2.3 Create applyFilters utility function
    - Implement filter chain: search → condition → category → pinnedOnly → includeHidden
    - Ensure immutability of original items array
    - _Requirements: 6.1, 6.2_
  
  - [ ]* 2.4 Write property test for applyFilters
    - **Property 14: Filter Application Order**
    - **Property 15: Filter Immutability**
    - **Validates: Requirements 6.1, 6.2**

- [x] 3. Build HeroCard component
  - [x] 3.1 Create HeroCard component with TypeScript interfaces
    - Implement HeroCardProps interface
    - Create component structure with gradient backgrounds
    - Handle three states: priority action, pending install dates, all stable
    - _Requirements: 1.1, 1.4, 1.5, 13.1, 13.2, 13.3_
  
  - [x] 3.2 Implement HeroCard visual styling
    - Apply gradient backgrounds (rose-to-orange for urgent, emerald-to-teal for stable)
    - Add action button with proper touch targets (44x44px minimum)
    - Include age display circle for priority items
    - _Requirements: 8.1, 13.4_
  
  - [x] 3.3 Wire HeroCard action handlers
    - Connect action button to navigation or workflow trigger
    - Handle priority item click to view details
    - Handle install date action to open relevant workflow
    - _Requirements: 13.5_
  
  - [ ]* 3.4 Write unit tests for HeroCard states
    - Test priority action display
    - Test pending install dates display
    - Test all stable display
    - _Requirements: 1.1, 1.4, 1.5_
  
  - [ ]* 3.5 Write property tests for HeroCard
    - **Property 3: Install Date Count Display**
    - **Property 33: Hero Card Gradient Styling**
    - **Property 34: Hero Card Action Navigation**
    - **Validates: Requirements 1.5, 13.4, 13.5**

- [x] 4. Build StatusCard component
  - [x] 4.1 Create StatusCard component structure
    - Implement StatusCardProps interface
    - Create card layout with left border condition indicator
    - Add header with category icon and item name
    - _Requirements: 2.1, 2.2, 2.4_
  
  - [x] 4.2 Implement StatusCard content sections
    - Add key metrics display (age, warranty status)
    - Add condition badge with icon and color coding
    - Add primary action button
    - Display pin icon for pinned items
    - _Requirements: 2.2, 2.5_
  
  - [x] 4.3 Add StatusCard interaction handlers
    - Implement expand/collapse on card click
    - Wire primary action button to navigation
    - Add pin toggle handler
    - Add hide toggle handler
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  
  - [x] 4.4 Apply StatusCard visual effects
    - Add hover effects (elevation, translation within 200ms)
    - Ensure consistent spacing using design tokens (4px, 8px, 16px, 24px)
    - Apply flat colors without gradients for condition indicators
    - _Requirements: 2.3, 9.1, 9.5_
  
  - [ ]* 4.5 Write unit tests for StatusCard
    - Test card rendering with various item states
    - Test interaction handlers
    - Test visual state changes
    - _Requirements: 2.1, 2.2, 7.1, 7.2_
  
  - [ ]* 4.6 Write property tests for StatusCard
    - **Property 5: Card Content Completeness**
    - **Property 6: Condition Color Mapping Consistency**
    - **Property 7: Pinned Item Visual Indicator**
    - **Property 18: Card Expansion Toggle**
    - **Validates: Requirements 2.2, 2.4, 2.5, 7.1**

- [x] 5. Checkpoint - Ensure core components render correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Build KPIPills component
  - [x] 6.1 Create KPIPills component
    - Implement component to display summary counts (GOOD, MONITOR, ACTION_NEEDED, total)
    - Add colored dot indicators matching condition colors
    - Make pills clickable to filter by condition
    - _Requirements: 4.1, 4.2, 4.3_
  
  - [x] 6.2 Implement KPIPills filter integration
    - Wire click handlers to update filter state
    - Update visual state to indicate active filters
    - _Requirements: 4.2, 4.5_
  
  - [ ]* 6.3 Write property tests for KPIPills
    - **Property 9: KPI Pill Filtering**
    - **Property 10: Total Count Accuracy**
    - **Property 11: Active Filter Visual State**
    - **Validates: Requirements 4.2, 4.4, 4.5**

- [x] 7. Build FilterChips component
  - [x] 7.1 Create FilterChips component
    - Implement component to display active filters as chips
    - Add remove button (X icon) to each chip
    - Apply color coding (condition colors for condition filters, neutral for category)
    - _Requirements: 5.1, 5.3_
  
  - [x] 7.2 Wire FilterChips removal handlers
    - Connect remove button to filter state updates
    - Update Card_Grid when filters change
    - Hide component when no filters are active
    - _Requirements: 5.2, 5.4_
  
  - [ ]* 7.3 Write property tests for FilterChips
    - **Property 12: Filter Chip Display**
    - **Property 13: Filter Chip Removal**
    - **Validates: Requirements 5.1, 5.2, 5.3**

- [x] 8. Implement responsive Card Grid layout
  - [x] 8.1 Create CardGrid component
    - Implement responsive grid: 1 column (mobile), 2 columns (tablet), 3 columns (desktop)
    - Maintain 16px gap spacing at all viewport sizes
    - Use item id as React key for each StatusCard
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 14.3_
  
  - [x] 8.2 Ensure grid reactivity and performance
    - Re-layout within 300ms on viewport changes without content jumping
    - Re-render grid when items array changes
    - Maintain item reference stability throughout lifecycle
    - _Requirements: 3.5, 14.4, 14.5_
  
  - [ ]* 8.3 Write property tests for CardGrid
    - **Property 4: Card Rendering Completeness**
    - **Property 8: Responsive Grid Spacing**
    - **Property 35: Item Reference Stability**
    - **Property 36: Grid Reactivity**
    - **Validates: Requirements 3.4, 14.1, 14.2, 14.3, 14.4, 14.5**

- [x] 9. Integrate URL state synchronization
  - [x] 9.1 Implement filter state to URL parameter conversion
    - Convert filter state to URL search parameters
    - Extract filter state from URL parameters on page load
    - _Requirements: 6.4, 12.1, 12.2_
  
  - [x] 9.2 Add expanded card state to URL
    - Set "expand" query parameter when card is expanded
    - Initialize expanded state from URL on page load
    - _Requirements: 12.4_
  
  - [x] 9.3 Handle invalid or missing URL parameters
    - Initialize with default filter state when parameters are invalid
    - Gracefully handle malformed URL parameters
    - _Requirements: 12.5_
  
  - [ ]* 9.4 Write property test for URL synchronization
    - **Property 16: URL State Synchronization Round-Trip**
    - **Property 17: Expanded Card URL Persistence**
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.4**

- [x] 10. Checkpoint - Ensure layout and state management work correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement accessibility features
  - [x] 11.1 Add keyboard navigation support
    - Enable tab navigation through StatusCards
    - Support Enter key to expand cards
    - _Requirements: 11.1_
  
  - [x] 11.2 Add ARIA labels and semantic HTML
    - Add aria-label or aria-labelledby to all interactive buttons
    - Use semantic HTML (button, nav, article) with proper heading hierarchy
    - _Requirements: 11.2, 11.5_
  
  - [x] 11.3 Implement focus indicators
    - Add visible 2px outline to all focusable elements
    - Ensure focus indicators are clearly visible
    - _Requirements: 11.3_
  
  - [x] 11.4 Ensure multi-modal information conveyance
    - Add icons and text labels alongside color coding
    - Verify information is not conveyed by color alone
    - _Requirements: 11.4_
  
  - [ ]* 11.5 Write accessibility compliance tests
    - Test keyboard navigation
    - Test ARIA labels
    - Test focus indicators
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [x] 12. Optimize mobile experience
  - [x] 12.1 Ensure touch target compliance
    - Verify all interactive elements meet 44x44px minimum
    - Apply appropriate padding to buttons on mobile viewport
    - _Requirements: 8.1, 8.2_
  
  - [x] 12.2 Optimize mobile spacing and layout
    - Maintain adequate spacing between interactive elements
    - Prevent horizontal scrolling on mobile viewport
    - Provide immediate visual feedback (within 100ms) on tap
    - _Requirements: 8.3, 8.4, 8.5_
  
  - [ ]* 12.3 Write mobile interaction tests
    - Test touch target sizes
    - Test tap feedback timing
    - Test mobile layout constraints
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 13. Implement performance optimizations
  - [x] 13.1 Add memoization for expensive computations
    - Use useMemo for computePriorityAction
    - Memoize filter application results
    - _Requirements: 10.1_
  
  - [x] 13.2 Add debouncing for search input
    - Debounce search filter application by 300ms
    - _Requirements: 10.2_
  
  - [x] 13.3 Implement lazy loading for card details
    - Load additional detail data only when card is expanded
    - _Requirements: 10.4_
  
  - [ ]* 13.4 Measure and validate performance metrics
    - Verify First Contentful Paint < 1.5s
    - Consider virtualization if item count > 100
    - _Requirements: 10.3, 10.5_

- [x] 14. Wire all components into StatusBoardClient
  - [x] 14.1 Integrate new components with feature flag
    - Add conditional rendering based on useCardLayout flag
    - Render HeroCard at top of layout
    - Render KPIPills below HeroCard
    - Render FilterChips below KPIPills
    - Render CardGrid with StatusCards
    - _Requirements: 15.1, 15.2_
  
  - [x] 14.2 Connect data fetching and state management
    - Wire React Query data to new components
    - Connect filter state to all filter controls
    - Maintain all existing API integration
    - _Requirements: 15.3_
  
  - [x] 14.3 Preserve existing functionality
    - Ensure drawer integration still works
    - Maintain guidance continuity context
    - Preserve all existing event handlers
    - _Requirements: 15.3_
  
  - [ ]* 14.4 Write integration tests for full layout
    - Test data flow from API to components
    - Test filter interactions update grid
    - Test drawer opens correctly
    - _Requirements: 15.3_

- [x] 15. Checkpoint - Ensure complete integration works end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Add error handling and graceful degradation
  - [x] 16.1 Implement error boundaries for card layout
    - Add error boundary around card layout components
    - Log errors when card rendering fails
    - _Requirements: 15.4_
  
  - [x] 16.2 Add fallback to table layout on error
    - Gracefully degrade to legacy table layout if card layout errors
    - Display user-friendly error message
    - _Requirements: 15.4_

- [x] 17. Polish visual design and micro-interactions
  - [x] 17.1 Refine hover and transition effects
    - Ensure smooth transitions (200-300ms)
    - Add subtle elevation changes on hover
    - _Requirements: 2.3_
  
  - [x] 17.2 Apply visual simplification constraints
    - Verify flat colors without gradients for condition indicators (except HeroCard)
    - Remove any glassmorphism effects (no backdrop-blur on cards)
    - Ensure single primary action per card
    - Limit visible information density to 6-9 items per viewport on desktop
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  
  - [x] 17.3 Verify consistent spacing throughout
    - Audit all spacing to use design tokens (4px, 8px, 16px, 24px)
    - _Requirements: 9.5_

- [x] 18. Final checkpoint and validation
  - [x] 18.1 Run full test suite
    - Execute all unit tests
    - Execute all property tests
    - Execute all integration tests
  
  - [x] 18.2 Validate against all requirements
    - Review each requirement for completion
    - Test all acceptance criteria
    - Verify all properties hold
  
  - [x] 18.3 Test feature flag toggle
    - Verify table layout still works when flag is false
    - Verify card layout works when flag is true
    - Test switching between layouts
    - _Requirements: 15.1, 15.2_

- [x] 19. Prepare for rollout
  - Document feature flag configuration for gradual rollout (10% → 50% → 100%)
  - Create rollback plan documentation
  - Ensure monitoring is in place for error rates
  - _Requirements: 15.5_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All code will be written in TypeScript following the design document examples
- Feature flag allows safe rollout and instant rollback if needed
- All existing functionality is preserved during migration
