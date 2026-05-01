# Requirements Document: Guidance Overview Page Improvements

## Introduction

The guidance-overview page is a critical user-facing feature that guides homeowners through resolving home issues step-by-step. Following a comprehensive code review of the existing implementation (1,875-line GuidanceOverviewClient.tsx component), this document specifies improvements to enhance code quality, user experience, performance, accessibility, and maintainability.

The page implements a multi-phase guided journey workflow:
- **Phase A - Context Gathering (Steps 1-3):** Scope category selection, target selection, and issue type selection
- **Phase B - Journey Execution (Step 4):** Journey overview with step-by-step navigation and inline tool integrations

This requirements document addresses 10 major improvement areas identified during the code review, prioritizing changes that will have the greatest impact on user experience, code maintainability, and system reliability.

## Glossary

- **Guidance_Overview_Page**: The user-facing page at `/dashboard/properties/[id]/tools/guidance-overview` that orchestrates the guided journey workflow
- **GuidanceOverviewClient**: The main React component (1,875 lines) that implements the guidance-overview page logic
- **Guided_Journey**: A multi-step workflow that helps homeowners resolve specific home issues
- **Phase_A**: The context-gathering phase consisting of scope category selection, target selection, and issue type selection
- **Phase_B**: The journey execution phase where users navigate through guided steps
- **Inline_Tool**: A tool component (NegotiationShield, PriceCheck, CoverageCheck, etc.) embedded directly within the journey step view
- **Scope_Category**: Either ITEM (for physical home assets) or SERVICE (for home services like warranty, insurance)
- **Journey_Step**: An individual action within a guided journey (e.g., "Check coverage", "Validate price")
- **Issue_Type**: A user-selected problem description that determines which journey steps are recommended
- **Inventory_Item**: A physical home asset tracked in the user's property inventory
- **Component_Extraction**: The process of breaking down a large component into smaller, focused sub-components
- **Error_Boundary**: A React component that catches JavaScript errors in child components and displays fallback UI
- **Loading_State**: Visual feedback shown to users while data is being fetched or processed
- **Analytics_Event**: A tracked user interaction used to understand behavior and identify drop-off points
- **State_Machine**: A pattern for managing complex state transitions with explicit states and allowed transitions
- **Type_Safety**: The use of TypeScript types to prevent runtime errors and improve code reliability
- **WCAG**: Web Content Accessibility Guidelines - standards for making web content accessible to people with disabilities
- **Keyboard_Navigation**: The ability to navigate and interact with UI elements using only keyboard input
- **ARIA_Label**: Accessible Rich Internet Applications label - provides accessible names for UI elements
- **Focus_Management**: Controlling which element receives keyboard focus as users navigate the interface
- **Performance_Optimization**: Techniques to reduce load time, improve responsiveness, and minimize resource usage
- **Test_Coverage**: The percentage of code paths exercised by automated tests
- **Integration_Test**: A test that verifies multiple components work correctly together
- **Unit_Test**: A test that verifies a single function or component works correctly in isolation
- **Property_Based_Test**: A test that verifies properties hold true across many randomly generated inputs
- **Memoization**: A performance optimization technique that caches computed values to avoid redundant calculations
- **Query_Optimization**: Techniques to reduce the number and cost of data fetching operations
- **Onboarding**: The process of introducing first-time users to a feature's workflow and capabilities
- **Contextual_Help**: In-context guidance (tooltips, help text) that explains features where users need them
- **Drop_Off_Point**: A location in the user flow where users frequently abandon the workflow
- **Trust_Signal**: Visual indicators (confidence scores, data freshness, source attribution) that build user confidence
- **Deep_Link**: A URL that navigates directly to a specific state within the application
- **URL_State_Management**: The practice of storing application state in URL query parameters for shareability and bookmarking

## Requirements

### Requirement 1: Component Extraction and Code Organization

**User Story:** As a developer, I want the GuidanceOverviewClient component broken into smaller, focused sub-components, so that I can understand, test, and maintain the codebase more easily.

#### Acceptance Criteria

1. THE Component_Extractor SHALL extract the scope category selector (Step 1) into a dedicated ScopeCategorySelector component
2. THE Component_Extractor SHALL extract the inventory picker (Step 2a) into a dedicated InventoryPicker component
3. THE Component_Extractor SHALL extract the service category picker (Step 2b) into a dedicated ServiceCategoryPicker component
4. THE Component_Extractor SHALL extract the issue type selector (Step 3) into a dedicated IssueTypeSelector component
5. THE Component_Extractor SHALL extract the journey view (Step 4) into a dedicated JourneyView component
6. THE Component_Extractor SHALL extract the journey step navigation sidebar into a dedicated JourneyStepSidebar component
7. THE Component_Extractor SHALL extract the journey step detail card into a dedicated JourneyStepDetail component
8. THE Component_Extractor SHALL extract URL state management logic into a custom useGuidanceNavigation hook
9. THE Component_Extractor SHALL extract issue type suggestion logic into a utility module guidanceIssueSuggestions.ts
10. WHEN all extractions are complete, THE GuidanceOverviewClient component SHALL contain fewer than 400 lines of orchestration logic
11. FOR ALL extracted components, THE Component_Extractor SHALL maintain existing functionality without behavioral changes
12. FOR ALL extracted components, THE Component_Extractor SHALL preserve existing prop interfaces and data flow patterns

### Requirement 2: Performance Optimization

**User Story:** As a user, I want the guidance-overview page to load quickly and respond smoothly, so that I can resolve my home issues without frustrating delays.

#### Acceptance Criteria

1. WHEN the guidance-overview page loads, THE Page_Loader SHALL fetch all required data in parallel using Promise.all or equivalent
2. THE Query_Optimizer SHALL implement query result caching with appropriate staleTime values (minimum 60 seconds for inventory data)
3. THE Query_Optimizer SHALL implement optimistic updates for mutations (skipStep, dismissJourney, startJourney)
4. THE Memoization_Manager SHALL wrap expensive computations (filteredAssetOptions, suggestedIssueTypes, activeJourneySteps) in React.useMemo with correct dependencies
5. THE Memoization_Manager SHALL wrap callback functions passed as props in React.useCallback with correct dependencies
6. THE Component_Optimizer SHALL implement React.lazy for inline tool components (NegotiationShieldInline, PriceCheckInline, CoverageCheckInline, RecallCheckInline)
7. THE Component_Optimizer SHALL implement code splitting at the route level to reduce initial bundle size
8. WHEN the user navigates between journey steps, THE Step_Navigator SHALL update the URL without triggering a full page reload
9. THE Performance_Monitor SHALL ensure the page achieves a Lighthouse performance score of at least 85 on mobile devices
10. THE Performance_Monitor SHALL ensure Time to Interactive (TTI) is less than 3.5 seconds on 3G networks

### Requirement 3: Error Handling and Loading States

**User Story:** As a user, I want clear feedback when things go wrong or when data is loading, so that I understand what's happening and what actions I can take.

#### Acceptance Criteria

1. THE Error_Boundary SHALL wrap the entire GuidanceOverviewClient component to catch and display JavaScript errors gracefully
2. THE Error_Boundary SHALL wrap each inline tool component (NegotiationShieldInline, PriceCheckInline, etc.) to isolate tool failures
3. WHEN a data fetch fails, THE Error_Handler SHALL display a user-friendly error message with a retry action
4. WHEN a mutation fails, THE Error_Handler SHALL display a toast notification with the error reason and a retry action
5. WHEN inventory data is loading, THE Loading_State_Manager SHALL display skeleton rows in the inventory picker
6. WHEN journey data is loading, THE Loading_State_Manager SHALL display a skeleton layout for the journey view
7. WHEN a mutation is pending, THE Loading_State_Manager SHALL disable the action button and show a loading spinner
8. THE Error_Handler SHALL log all errors to the analytics system with sufficient context for debugging
9. WHEN the user encounters an error, THE Error_Handler SHALL provide a "Report issue" link that pre-fills error context
10. THE Error_Handler SHALL implement exponential backoff for automatic retry attempts (1s, 2s, 4s delays)

### Requirement 4: Accessibility Improvements

**User Story:** As a user with disabilities, I want the guidance-overview page to be fully accessible via keyboard and screen reader, so that I can resolve home issues independently.

#### Acceptance Criteria

1. THE Keyboard_Navigator SHALL ensure all interactive elements (buttons, links, inputs) are reachable via Tab key navigation
2. THE Keyboard_Navigator SHALL implement logical tab order that follows the visual layout (top to bottom, left to right)
3. THE Keyboard_Navigator SHALL support Enter and Space keys for activating buttons and selecting options
4. THE Keyboard_Navigator SHALL support Escape key for closing the inventory drawer and dismissing modals
5. THE Focus_Manager SHALL move keyboard focus to the main heading when navigating between phases
6. THE Focus_Manager SHALL maintain focus visibility with clear focus indicators (2px outline, high contrast)
7. THE ARIA_Labeler SHALL add aria-label attributes to all icon-only buttons (e.g., "Back to property", "Next step")
8. THE ARIA_Labeler SHALL add aria-live regions for dynamic content updates (journey step completion, error messages)
9. THE ARIA_Labeler SHALL add aria-describedby attributes to form inputs that have help text or error messages
10. THE ARIA_Labeler SHALL add role="status" to loading indicators and progress updates
11. THE Semantic_HTML_Enforcer SHALL use semantic HTML elements (nav, main, aside, article) instead of generic divs
12. THE Color_Contrast_Validator SHALL ensure all text meets WCAG AA contrast ratios (4.5:1 for normal text, 3:1 for large text)

### Requirement 5: User Experience Enhancements

**User Story:** As a first-time user, I want clear guidance and contextual help throughout the workflow, so that I understand how to use the guidance-overview feature effectively.

#### Acceptance Criteria

1. WHEN a user visits the guidance-overview page for the first time, THE Onboarding_Manager SHALL display a welcome modal explaining the three-phase workflow
2. THE Onboarding_Manager SHALL provide a "Skip tour" option and a "Don't show again" checkbox in the welcome modal
3. THE Tooltip_Manager SHALL add tooltips to complex UI elements (confidence dots, trust signals, data freshness indicators)
4. THE Tooltip_Manager SHALL display tooltips on hover (desktop) and tap (mobile) with a 300ms delay
5. THE Help_Text_Provider SHALL add contextual help text below each phase heading explaining what the user should do
6. WHEN the user selects an issue type, THE Suggestion_Explainer SHALL show why that issue type was suggested (e.g., "Common for aging HVAC systems")
7. WHEN the user views a journey step, THE Step_Explainer SHALL display the estimated time to complete (e.g., "~5 minutes")
8. THE Progress_Indicator SHALL show a visual progress bar in Phase A indicating "Step X of 3 complete"
9. THE Progress_Indicator SHALL show a percentage completion indicator in Phase B (e.g., "Step 2 of 5 - 40% complete")
10. WHEN the user completes a journey step, THE Celebration_Manager SHALL display a brief success animation and encouraging message
11. THE Empty_State_Designer SHALL create informative empty states for scenarios with no data (e.g., "No inventory items found - Add items to get started")

### Requirement 6: Analytics and Monitoring

**User Story:** As a product manager, I want comprehensive analytics tracking throughout the guidance-overview workflow, so that I can identify drop-off points and optimize the user experience.

#### Acceptance Criteria

1. WHEN a user selects a scope category, THE Analytics_Tracker SHALL track a "scope_category_selected" event with the category value
2. WHEN a user selects an inventory item, THE Analytics_Tracker SHALL track an "inventory_item_selected" event with item category and name
3. WHEN a user selects a service category, THE Analytics_Tracker SHALL track a "service_category_selected" event with the service key
4. WHEN a user selects an issue type, THE Analytics_Tracker SHALL track an "issue_type_selected" event with the issue key and whether it was custom
5. WHEN a user starts a journey, THE Analytics_Tracker SHALL track a "journey_started" event with journey ID, scope category, and issue type
6. WHEN a user navigates to a journey step, THE Analytics_Tracker SHALL track a "journey_step_viewed" event with step key and step order
7. WHEN a user completes a journey step, THE Analytics_Tracker SHALL track a "journey_step_completed" event with step key and time spent
8. WHEN a user skips a journey step, THE Analytics_Tracker SHALL track a "journey_step_skipped" event with step key and reason
9. WHEN a user dismisses a journey, THE Analytics_Tracker SHALL track a "journey_dismissed" event with journey ID and reason
10. WHEN a user encounters an error, THE Analytics_Tracker SHALL track an "error_encountered" event with error type, message, and context
11. WHEN a user abandons the workflow, THE Analytics_Tracker SHALL track a "workflow_abandoned" event with the last completed phase
12. THE Analytics_Dashboard SHALL provide a funnel visualization showing conversion rates between phases

### Requirement 7: State Management Improvements

**User Story:** As a developer, I want predictable state management with clear state transitions, so that I can reason about the application behavior and debug issues more easily.

#### Acceptance Criteria

1. THE State_Machine_Designer SHALL define explicit states for the guidance workflow (SCOPE_SELECTION, TARGET_SELECTION, ISSUE_SELECTION, JOURNEY_ACTIVE, JOURNEY_COMPLETE)
2. THE State_Machine_Designer SHALL define allowed transitions between states (e.g., SCOPE_SELECTION → TARGET_SELECTION, but not SCOPE_SELECTION → JOURNEY_ACTIVE)
3. THE State_Machine_Implementer SHALL implement the state machine using a reducer pattern or state machine library (XState)
4. THE State_Machine_Implementer SHALL validate state transitions and throw errors for invalid transitions
5. THE URL_State_Manager SHALL synchronize the state machine state with URL query parameters for deep linking
6. THE URL_State_Manager SHALL parse URL parameters on initial load and initialize the state machine to the correct state
7. THE URL_State_Manager SHALL update URL parameters when state transitions occur without triggering full page reloads
8. THE State_Validator SHALL ensure required data is present before allowing state transitions (e.g., cannot transition to JOURNEY_ACTIVE without issueType)
9. THE State_Debugger SHALL log all state transitions to the console in development mode with before/after state snapshots
10. THE State_Persister SHALL save the current state to sessionStorage to preserve progress across page refreshes

### Requirement 8: Type Safety Enhancements

**User Story:** As a developer, I want strong TypeScript types throughout the guidance-overview codebase, so that I can catch errors at compile time and have better IDE autocomplete support.

#### Acceptance Criteria

1. THE Type_Definer SHALL create a GuidanceWorkflowState type union representing all possible workflow states
2. THE Type_Definer SHALL create a GuidanceNavigationParams interface defining all URL query parameters
3. THE Type_Definer SHALL create a JourneyStepProps interface for the renderStepCta function parameter
4. THE Type_Definer SHALL replace all "any" types with specific types or generic constraints
5. THE Type_Definer SHALL replace all type assertions (as Type) with type guards or proper type narrowing
6. THE Type_Definer SHALL add return type annotations to all functions longer than 10 lines
7. THE Type_Validator SHALL enable strict TypeScript compiler options (strictNullChecks, strictFunctionTypes, noImplicitAny)
8. THE Type_Validator SHALL ensure all optional chaining (?.) is justified and not masking type errors
9. THE Type_Validator SHALL ensure all non-null assertions (!) are justified with comments explaining why the value cannot be null
10. THE Type_Generator SHALL generate Zod schemas for all API response types and validate responses at runtime

### Requirement 9: Testing Coverage

**User Story:** As a developer, I want comprehensive test coverage for the guidance-overview feature, so that I can refactor with confidence and catch regressions before they reach production.

#### Acceptance Criteria

1. THE Test_Writer SHALL create unit tests for all utility functions (resolveAssetLabel, resolvePrimarySubtitle, resolveNextStepLabel, etc.)
2. THE Test_Writer SHALL create unit tests for the useGuidanceNavigation hook covering all navigation scenarios
3. THE Test_Writer SHALL create component tests for ScopeCategorySelector covering both ITEM and SERVICE selection
4. THE Test_Writer SHALL create component tests for InventoryPicker covering search, category filtering, and item selection
5. THE Test_Writer SHALL create component tests for IssueTypeSelector covering suggested issues, custom issues, and "show more" toggle
6. THE Test_Writer SHALL create component tests for JourneyView covering step navigation, inline tools, and skip/dismiss actions
7. THE Test_Writer SHALL create integration tests for the complete Phase A workflow (scope → target → issue selection)
8. THE Test_Writer SHALL create integration tests for the complete Phase B workflow (journey start → step navigation → completion)
9. THE Test_Writer SHALL create integration tests for error scenarios (network failures, invalid data, missing parameters)
10. THE Test_Writer SHALL create integration tests for deep linking scenarios (direct navigation to specific journey steps)
11. THE Test_Writer SHALL achieve at least 80% code coverage for the guidance-overview feature
12. THE Test_Writer SHALL create visual regression tests for key UI states using a tool like Chromatic or Percy

### Requirement 10: Documentation and Developer Experience

**User Story:** As a new developer joining the team, I want comprehensive documentation for the guidance-overview feature, so that I can understand the architecture and contribute effectively.

#### Acceptance Criteria

1. THE Documentation_Writer SHALL create an architecture document (GUIDANCE_OVERVIEW_ARCHITECTURE.md) explaining the multi-phase workflow
2. THE Documentation_Writer SHALL create a component hierarchy diagram showing the relationship between all components
3. THE Documentation_Writer SHALL create a state machine diagram showing all workflow states and transitions
4. THE Documentation_Writer SHALL create a data flow diagram showing how data moves from API to UI
5. THE Documentation_Writer SHALL add JSDoc comments to all exported functions explaining parameters, return values, and side effects
6. THE Documentation_Writer SHALL add JSDoc comments to all React components explaining props, behavior, and usage examples
7. THE Documentation_Writer SHALL create a troubleshooting guide (GUIDANCE_OVERVIEW_TROUBLESHOOTING.md) for common issues
8. THE Documentation_Writer SHALL create a testing guide (GUIDANCE_OVERVIEW_TESTING.md) explaining how to run and write tests
9. THE Documentation_Writer SHALL add inline comments explaining complex logic (e.g., the appliance name-based issue resolution)
10. THE Documentation_Writer SHALL create a changelog (GUIDANCE_OVERVIEW_CHANGELOG.md) documenting all improvements made
11. THE Documentation_Writer SHALL update the main README.md with a link to the guidance-overview documentation
12. THE Documentation_Writer SHALL create a Storybook story for each extracted component demonstrating all prop variations

---

## Requirements Summary

This requirements document specifies 10 major improvement areas for the guidance-overview page:

1. **Component Extraction and Code Organization** - Break down the 1,875-line component into focused sub-components
2. **Performance Optimization** - Improve load time, caching, and responsiveness
3. **Error Handling and Loading States** - Provide clear feedback for errors and loading
4. **Accessibility Improvements** - Ensure WCAG compliance and keyboard/screen reader support
5. **User Experience Enhancements** - Add onboarding, tooltips, and contextual help
6. **Analytics and Monitoring** - Track user behavior and identify drop-off points
7. **State Management Improvements** - Implement a state machine for predictable state transitions
8. **Type Safety Enhancements** - Strengthen TypeScript types to catch errors at compile time
9. **Testing Coverage** - Add comprehensive unit, component, and integration tests
10. **Documentation and Developer Experience** - Create architecture docs, diagrams, and guides

These improvements will enhance code quality, user experience, performance, accessibility, and maintainability while preserving all existing functionality.

## Next Steps

After this requirements document is approved, the next phase will be to create a detailed design document specifying the technical implementation approach for each requirement, including:

- Component architecture and interfaces
- State machine design and transitions
- Performance optimization strategies
- Testing strategies and coverage targets
- Documentation structure and content outline

The design phase will translate these requirements into actionable technical specifications that can be implemented incrementally without disrupting the existing functionality.
