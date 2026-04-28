import type { StatusBoardCondition } from "../statusBoardApi";

/**
 * Filter state interface for URL synchronization
 */
export interface URLFilterState {
  search?: string;
  condition?: StatusBoardCondition | "all";
  category?: string;
  groupBy?: string;
  pinnedOnly?: boolean;
  includeHidden?: boolean;
  page?: number;
  expand?: string | null;
}

/**
 * Extracts filter state from URL search parameters.
 * 
 * Handles invalid or missing parameters gracefully by returning defaults.
 * 
 * @param searchParams - URLSearchParams object from Next.js
 * @returns Filter state object
 * 
 * @example
 * const filterState = extractFiltersFromSearchParams(searchParams);
 * // { condition: "ACTION_NEEDED", page: 1, ... }
 */
export function extractFiltersFromSearchParams(
  searchParams: URLSearchParams
): URLFilterState {
  return {
    search: searchParams.get("q") || undefined,
    condition: (searchParams.get("condition") as StatusBoardCondition | "all") || "all",
    category: searchParams.get("category") || "all",
    groupBy: searchParams.get("groupBy") || "none",
    pinnedOnly: searchParams.get("pinnedOnly") === "true",
    includeHidden: searchParams.get("includeHidden") === "true",
    page: parseInt(searchParams.get("page") || "1", 10),
    expand: searchParams.get("expand") || null,
  };
}

/**
 * Builds URL search parameters from filter state.
 * 
 * Only includes non-default values to keep URLs clean.
 * 
 * @param filterState - Filter state object
 * @returns URLSearchParams object
 * 
 * @example
 * const params = buildSearchParamsFromFilters({
 *   condition: "ACTION_NEEDED",
 *   page: 2
 * });
 * // URLSearchParams with "condition=ACTION_NEEDED&page=2"
 */
export function buildSearchParamsFromFilters(
  filterState: URLFilterState
): URLSearchParams {
  const params = new URLSearchParams();

  // Only add non-default values
  if (filterState.search) {
    params.set("q", filterState.search);
  }

  if (filterState.condition && filterState.condition !== "all") {
    params.set("condition", filterState.condition);
  }

  if (filterState.category && filterState.category !== "all") {
    params.set("category", filterState.category);
  }

  if (filterState.groupBy && filterState.groupBy !== "none") {
    params.set("groupBy", filterState.groupBy);
  }

  if (filterState.pinnedOnly) {
    params.set("pinnedOnly", "true");
  }

  if (filterState.includeHidden) {
    params.set("includeHidden", "true");
  }

  if (filterState.page && filterState.page > 1) {
    params.set("page", filterState.page.toString());
  }

  if (filterState.expand) {
    params.set("expand", filterState.expand);
  }

  return params;
}

/**
 * Updates URL with new filter state without page reload.
 * 
 * Uses Next.js router to update URL parameters.
 * 
 * @param filterState - New filter state
 * @param router - Next.js router instance
 * @param pathname - Current pathname
 * 
 * @example
 * updateURLWithFilters(
 *   { condition: "ACTION_NEEDED" },
 *   router,
 *   "/dashboard/properties/123/status-board"
 * );
 */
export function updateURLWithFilters(
  filterState: URLFilterState,
  router: { push: (url: string) => void },
  pathname: string
): void {
  const params = buildSearchParamsFromFilters(filterState);
  const queryString = params.toString();
  const newUrl = queryString ? `${pathname}?${queryString}` : pathname;
  
  router.push(newUrl);
}
