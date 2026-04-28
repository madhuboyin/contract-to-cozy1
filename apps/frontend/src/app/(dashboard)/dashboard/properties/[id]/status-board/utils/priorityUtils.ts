import type { StatusBoardItemDTO, StatusBoardRecommendation } from "../statusBoardApi";

/**
 * Priority weights for recommendations
 * Higher number = higher priority
 */
const RECOMMENDATION_PRIORITY: Record<StatusBoardRecommendation, number> = {
  REPLACE_SOON: 3,
  REPAIR: 2,
  OK: 1,
};

/**
 * Computes the highest priority action item from a list of items.
 * 
 * Priority order:
 * 1. ACTION_NEEDED condition (excludes items needing install dates)
 * 2. Recommendation severity (REPLACE_SOON > REPAIR > OK)
 * 3. Pinned status (pinned items first)
 * 4. Age in descending order (older items first)
 * 
 * @param items - Array of status board items
 * @returns The highest priority item, or null if none exist
 * 
 * @example
 * const priorityItem = computePriorityAction(items);
 * if (priorityItem) {
 *   console.log(`Priority: ${priorityItem.displayName}`);
 * }
 */
export function computePriorityAction(items: StatusBoardItemDTO[]): StatusBoardItemDTO | null {
  // Step 1: Filter urgent items (ACTION_NEEDED, excluding items needing install dates)
  const urgentItems = items.filter(
    (item) => item.condition === "ACTION_NEEDED" && !item.needsInstallDateForPrediction
  );

  // Step 2: Return null if no urgent items
  if (urgentItems.length === 0) {
    return null;
  }

  // Step 3: Sort by priority
  const sortedItems = urgentItems.sort((a, b) => {
    // Priority 1: Recommendation severity
    const recommendationDelta =
      RECOMMENDATION_PRIORITY[b.recommendation] - RECOMMENDATION_PRIORITY[a.recommendation];
    if (recommendationDelta !== 0) {
      return recommendationDelta;
    }

    // Priority 2: Pinned status (pinned items first)
    if (a.isPinned !== b.isPinned) {
      return b.isPinned ? 1 : -1;
    }

    // Priority 3: Age (older items first)
    return (b.ageYears ?? 0) - (a.ageYears ?? 0);
  });

  // Step 4: Return highest priority item
  return sortedItems[0];
}

/**
 * Counts the number of items that need install dates for accurate predictions
 * 
 * @param items - Array of status board items
 * @returns Count of items needing install dates
 */
export function countItemsNeedingInstallDate(items: StatusBoardItemDTO[]): number {
  return items.filter((item) => item.needsInstallDateForPrediction).length;
}
