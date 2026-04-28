import type { StatusBoardItemDTO, StatusBoardCondition } from "../statusBoardApi";

/**
 * Filter state interface
 */
export interface FilterState {
  search?: string;
  condition?: StatusBoardCondition;
  category?: string;
  pinnedOnly?: boolean;
  includeHidden?: boolean;
}

/**
 * Applies filters to a list of status board items.
 * 
 * Filter order: search → condition → category → pinnedOnly → includeHidden
 * 
 * The original items array is not mutated.
 * 
 * @param items - Array of status board items
 * @param filters - Filter state object
 * @returns Filtered array of items
 * 
 * @example
 * const filtered = applyFilters(items, {
 *   condition: "ACTION_NEEDED",
 *   pinnedOnly: true
 * });
 */
export function applyFilters(
  items: StatusBoardItemDTO[],
  filters: FilterState
): StatusBoardItemDTO[] {
  let filtered = [...items]; // Create a copy to avoid mutation

  // Filter 1: Search
  if (filters.search && filters.search.trim() !== "") {
    const searchLower = filters.search.toLowerCase().trim();
    filtered = filtered.filter((item) =>
      item.displayName.toLowerCase().includes(searchLower)
    );
  }

  // Filter 2: Condition
  if (filters.condition) {
    filtered = filtered.filter((item) => item.condition === filters.condition);
  }

  // Filter 3: Category
  if (filters.category) {
    filtered = filtered.filter((item) => item.category === filters.category);
  }

  // Filter 4: Pinned only
  if (filters.pinnedOnly) {
    filtered = filtered.filter((item) => item.isPinned);
  }

  // Filter 5: Include hidden
  if (!filters.includeHidden) {
    filtered = filtered.filter((item) => !item.isHidden);
  }

  return filtered;
}
