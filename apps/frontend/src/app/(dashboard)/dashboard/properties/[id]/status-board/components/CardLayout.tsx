import { useMemo } from "react";
import { HeroCard } from "./HeroCard";
import { KPIPills, type StatusBoardSummary } from "./KPIPills";
import { FilterChips, type ActiveFilter } from "./FilterChips";
import { CardGrid, type CardHandlers } from "./CardGrid";
import type { StatusBoardItemDTO } from "../statusBoardApi";
import { computePriorityAction, countItemsNeedingInstallDate } from "../utils/priorityUtils";

/**
 * Props for CardLayout component
 */
export interface CardLayoutProps {
  /** Array of status board items */
  items: StatusBoardItemDTO[];
  /** Summary counts by condition */
  summary: StatusBoardSummary | null;
  /** Currently active condition filter */
  conditionFilter: string;
  /** Currently active category filter */
  categoryFilter: string;
  /** Card interaction handlers */
  handlers: CardHandlers;
  /** Callback when condition filter changes */
  onConditionFilterChange: (condition: string) => void;
  /** Callback when priority action is clicked */
  onPriorityAction: () => void;
  /** Callback when filter is removed */
  onRemoveFilter: (key: string) => void;
}

/**
 * Card-based layout component for Status Board.
 * 
 * This component replaces the table layout when the useCardLayout feature flag is enabled.
 * 
 * Layout structure:
 * 1. HeroCard - Priority action or status message
 * 2. KPIPills - Summary counts with filter buttons
 * 3. FilterChips - Active filters with remove buttons
 * 4. CardGrid - Responsive grid of status cards
 * 
 * @example
 * <CardLayout
 *   items={items}
 *   summary={summary}
 *   conditionFilter={conditionFilter}
 *   categoryFilter={categoryFilter}
 *   handlers={cardHandlers}
 *   onConditionFilterChange={setConditionFilter}
 *   onPriorityAction={handlePriorityAction}
 *   onRemoveFilter={handleRemoveFilter}
 * />
 */
export function CardLayout({
  items,
  summary,
  conditionFilter,
  categoryFilter,
  handlers,
  onConditionFilterChange,
  onPriorityAction,
  onRemoveFilter,
}: CardLayoutProps) {
  // Compute priority action (memoized for performance)
  const priorityItem = useMemo(() => computePriorityAction(items), [items]);
  
  // Count items needing install dates (memoized for performance)
  const pendingInstallDateCount = useMemo(() => countItemsNeedingInstallDate(items), [items]);

  // Build active filters array
  const activeFilters: ActiveFilter[] = useMemo(() => {
    const filters: ActiveFilter[] = [];

    if (conditionFilter && conditionFilter !== "all") {
      const labels: Record<string, string> = {
        ACTION_NEEDED: "Action Needed",
        MONITOR: "Monitor",
        GOOD: "Good",
      };
      filters.push({
        key: "condition",
        label: labels[conditionFilter] || conditionFilter,
        type: "condition",
        value: conditionFilter,
      });
    }

    if (categoryFilter && categoryFilter !== "all") {
      filters.push({
        key: "category",
        label: categoryFilter,
        type: "category",
        value: categoryFilter,
      });
    }

    return filters;
  }, [conditionFilter, categoryFilter]);

  return (
    <div className="space-y-6">
      {/* Hero Card - Priority Action */}
      <HeroCard
        priorityItem={priorityItem}
        pendingInstallDateCount={pendingInstallDateCount}
        onAction={onPriorityAction}
      />

      {/* KPI Pills - Summary Counts */}
      {summary && (
        <KPIPills
          summary={summary}
          activeFilter={conditionFilter}
          onFilterChange={onConditionFilterChange}
        />
      )}

      {/* Filter Chips - Active Filters */}
      <FilterChips activeFilters={activeFilters} onRemoveFilter={onRemoveFilter} />

      {/* Card Grid - Status Cards */}
      <CardGrid items={items} handlers={handlers} />

      {/* Empty State */}
      {items.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-12 text-center">
          <p className="text-lg font-medium text-gray-900">No items found</p>
          <p className="mt-2 text-sm text-gray-500">
            Try adjusting your filters or search criteria
          </p>
        </div>
      )}
    </div>
  );
}
