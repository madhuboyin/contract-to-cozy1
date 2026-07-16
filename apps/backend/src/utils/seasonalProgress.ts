type ProgressItem = {
  status: string;
  priority?: string | null;
};

export type SeasonalChecklistProgress = {
  /** Items actually completed. */
  completedTasks: number;
  /** Items still in scope: everything not dismissed. */
  activeTotalTasks: number;
  /** Items the user marked not-applicable. */
  dismissedTasks: number;
  /** True when every in-scope item is completed (and at least one exists). */
  isFullyCompleted: boolean;
};

/**
 * Derive checklist progress from item statuses. Dismissed items reduce the
 * denominator — "not applicable to my home" is a scope change, not pending
 * work. This replaces the stored running counter for display purposes; that
 * counter drifts because several flows (task deletion, unlinking) mutate it
 * inconsistently.
 */
export function deriveChecklistProgress(items: ProgressItem[]): SeasonalChecklistProgress {
  const dismissedTasks = items.filter((item) => item.status === 'DISMISSED').length;
  const completedTasks = items.filter((item) => item.status === 'COMPLETED').length;
  const activeTotalTasks = items.length - dismissedTasks;

  return {
    completedTasks,
    activeTotalTasks,
    dismissedTasks,
    isFullyCompleted: activeTotalTasks > 0 && completedTasks === activeTotalTasks,
  };
}

/** Critical tasks protect against damage and safety issues; they cannot be
 *  waved away. Only lower-priority tasks are dismissible. */
export function isDismissibleSeasonalPriority(priority: string | null | undefined): boolean {
  return priority !== 'CRITICAL';
}
