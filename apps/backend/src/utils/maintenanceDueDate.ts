const DEFAULT_LEAD_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Resolve the due date for a maintenance task created from a seasonal
 * checklist item. Seasonal items carry a recommendedDate anchored to the
 * season start, so tasks added mid-season would otherwise be born overdue.
 * Use the recommendation when it is still in the future; otherwise give the
 * user a short runway from today.
 */
export function resolveSeasonalTaskDueDate(
  recommendedDate: Date | null | undefined,
  now: Date = new Date()
): Date {
  if (recommendedDate && recommendedDate.getTime() > now.getTime()) {
    return recommendedDate;
  }
  return new Date(now.getTime() + DEFAULT_LEAD_DAYS * MS_PER_DAY);
}
