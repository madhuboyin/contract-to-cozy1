/**
 * Status Board UI Modernization Components
 * 
 * This module exports all the new card-based layout components.
 * These components are used when the useCardLayout feature flag is enabled.
 */

export { HeroCard, type HeroCardProps } from "./HeroCard";
export { StatusCard, type StatusCardProps } from "./StatusCard";
export { KPIPills, type KPIPillsProps, type StatusBoardSummary } from "./KPIPills";
export { FilterChips, type FilterChipsProps, type ActiveFilter } from "./FilterChips";
export { CardGrid, type CardGridProps, type CardHandlers } from "./CardGrid";
export { CardLayoutErrorBoundary } from "./CardLayoutErrorBoundary";
