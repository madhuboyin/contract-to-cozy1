import type { PropertyMaintenanceTask } from '@/types';
import humanizeActionType from './humanize';

/** Keeps free-form task instructions intact while normalizing stored asset/risk identifiers. */
export function formatMaintenanceTaskTitle(value: string | null | undefined): string {
  const title = value?.trim();
  if (!title) return 'Maintenance task';

  const legacyRiskTitle = title.match(/^(?:LOW|MEDIUM|HIGH|CRITICAL)\s+Risk:\s*(.+)$/i);
  if (legacyRiskTitle?.[1]) return humanizeActionType(legacyRiskTitle[1]);

  const isStoredIdentifier = /^[A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(title);
  return isStoredIdentifier ? humanizeActionType(title) : title;
}

export function formatMaintenanceTaskDescription(
  task: Pick<PropertyMaintenanceTask, 'title' | 'description'>,
): string | null {
  const description = task.description?.trim();
  if (!description) return null;

  if (/^add home warranty$/i.test(description)) {
    return `Review coverage options for ${formatMaintenanceTaskTitle(task.title)}.`;
  }

  return description.replace(
    /\b[A-Z0-9]+(?:_[A-Z0-9]+)+\b/g,
    (identifier) => humanizeActionType(identifier),
  );
}
