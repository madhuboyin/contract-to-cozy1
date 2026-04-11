import { cn } from '@/lib/utils';

export type BadgeStatus =
  | 'excellent'
  | 'good'
  | 'watch'
  | 'action'
  | 'critical'
  | 'due-soon'
  | 'suppressed';

const BADGE_CONFIG: Record<BadgeStatus, { label: string; className: string }> = {
  excellent: {
    label: 'Excellent',
    className:
      'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-700/60 dark:bg-teal-950/40 dark:text-teal-300',
  },
  good: {
    label: 'Stable',
    className:
      'border-green-200 bg-green-50 text-green-700 dark:border-green-700/60 dark:bg-green-950/40 dark:text-green-300',
  },
  watch: {
    label: 'Watch',
    className:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300',
  },
  action: {
    label: 'Action',
    className:
      'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-700/60 dark:bg-orange-950/40 dark:text-orange-300',
  },
  critical: {
    label: 'At Risk',
    className:
      'border-red-200 bg-red-50 text-red-700 dark:border-red-700/60 dark:bg-red-950/40 dark:text-red-300',
  },
  'due-soon': {
    label: 'Due Soon',
    className:
      'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-700/60 dark:bg-blue-950/40 dark:text-blue-300',
  },
  suppressed: {
    label: 'Suppressed',
    className:
      'border-gray-200 bg-gray-100 text-gray-600 dark:border-gray-700/60 dark:bg-gray-900/70 dark:text-gray-300',
  },
};

interface StatusBadgeProps {
  status: BadgeStatus;
  customLabel?: string;
  className?: string;
}

export function StatusBadge({ status, customLabel, className }: StatusBadgeProps) {
  const config = BADGE_CONFIG[status];
  const label = customLabel ?? config.label;

  return (
    <span
      aria-label={label}
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        config.className,
        className,
      )}
    >
      {label}
    </span>
  );
}
