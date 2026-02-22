type SeasonalTaskLike = {
  status?: string | null;
};

function normalizeStatus(status?: string | null): string {
  return String(status ?? '').trim().toLowerCase();
}

function isCompletedStatus(status?: string | null): boolean {
  return normalizeStatus(status) === 'completed';
}

function shouldIncludeInProgress(status?: string | null): boolean {
  return normalizeStatus(status) !== 'dismissed';
}

export type SeasonalProgressSummary = {
  displayedTasks: SeasonalTaskLike[];
  completedCount: number;
  totalCount: number;
  progress: number;
  noTasks: boolean;
  capped: boolean;
};

export function calculateSeasonalProgress(
  tasks: SeasonalTaskLike[] | null | undefined,
  fallback?: { completedCount?: number; totalCount?: number }
): SeasonalProgressSummary {
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const displayedTasks = safeTasks.filter((task) => shouldIncludeInProgress(task?.status));

  let totalCount = displayedTasks.length;
  let completedCount = displayedTasks.filter((task) => isCompletedStatus(task?.status)).length;

  if (totalCount === 0) {
    totalCount = Math.max(0, Math.round(Number(fallback?.totalCount ?? 0)));
    completedCount = Math.max(0, Math.round(Number(fallback?.completedCount ?? 0)));
  }

  let capped = false;
  if (totalCount > 0 && completedCount > totalCount) {
    completedCount = totalCount;
    capped = true;
  }

  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  return {
    displayedTasks,
    completedCount,
    totalCount,
    progress,
    noTasks: totalCount === 0,
    capped,
  };
}

