import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { getInventoryItemIcon, resolveIcon } from '@/lib/icons';
import { cn } from '@/lib/utils';

export type CompactAskCardTone = 'DEFAULT' | 'CAUTION' | 'CRITICAL' | 'POSITIVE';

const TONE_EDGE: Record<CompactAskCardTone, string> = {
  DEFAULT: 'before:bg-slate-300',
  CAUTION: 'before:bg-amber-400',
  CRITICAL: 'before:bg-rose-500',
  POSITIVE: 'before:bg-emerald-500',
};

const TONE_ICON: Record<CompactAskCardTone, string> = {
  DEFAULT: 'bg-slate-100 text-slate-600',
  CAUTION: 'bg-amber-50 text-amber-600',
  CRITICAL: 'bg-red-50 text-red-600',
  POSITIVE: 'bg-emerald-50 text-emerald-600',
};

export function CompactAskCard({
  title,
  iconCategory,
  fallbackIcon,
  tone = 'DEFAULT',
  badge,
  summary,
  meta,
  action,
  secondary,
  selected = false,
  className,
  dataAttributes,
}: {
  title: string;
  iconCategory?: string | null;
  fallbackIcon: LucideIcon;
  tone?: CompactAskCardTone;
  badge?: ReactNode;
  summary?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  secondary?: ReactNode;
  selected?: boolean;
  className?: string;
  dataAttributes?: Record<`data-${string}`, string>;
}) {
  const Icon = resolveIcon(getInventoryItemIcon({ name: title, category: iconCategory }), fallbackIcon);
  return (
    <article
      {...dataAttributes}
      className={cn(
        'relative flex min-h-44 min-w-0 flex-col overflow-hidden rounded-2xl border bg-white p-4 pl-5 shadow-sm transition-all duration-200 before:absolute before:inset-y-0 before:left-0 before:w-1 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md',
        TONE_EDGE[tone],
        selected ? 'border-teal-600 ring-1 ring-teal-600/20' : 'border-slate-200',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={cn('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', TONE_ICON[tone])} aria-hidden="true">
          <Icon className="h-5 w-5" />
        </span>
        {badge}
      </div>
      <h4 className="mt-3 line-clamp-2 min-h-10 text-base font-semibold leading-5 text-slate-950">{title}</h4>
      {summary && <div className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600">{summary}</div>}
      {meta && <div className="mt-2 line-clamp-1 text-xs text-slate-500">{meta}</div>}
      {(action || secondary) && (
        <div className="mt-auto flex min-h-11 items-end justify-between gap-2 pt-3">
          <div className="min-w-0">{action}</div>
          {secondary && <div className="shrink-0">{secondary}</div>}
        </div>
      )}
    </article>
  );
}
