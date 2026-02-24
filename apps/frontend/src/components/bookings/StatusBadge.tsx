import { formatEnumLabel, getStatusStyles } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const styles = getStatusStyles(status);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium',
        styles.bg,
        styles.text,
        styles.border,
        className
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          styles.text.replace('text-', 'bg-'),
          (status === 'PENDING' || status === 'IN_PROGRESS') && 'animate-pulse'
        )}
      />
      {formatEnumLabel(status)}
    </span>
  );
}
