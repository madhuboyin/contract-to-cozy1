'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ProofRowItem {
  label: string;
  detail: string;
  icon?: ReactNode;
}

interface ProofRowProps {
  items: ProofRowItem[];
  maxItems?: number;
  className?: string;
  itemClassName?: string;
}

export default function ProofRow({
  items,
  maxItems = 3,
  className,
  itemClassName,
}: ProofRowProps) {
  const visibleItems = items.slice(0, maxItems);

  return (
    <div className={cn('grid gap-2.5 sm:grid-cols-3', className)}>
      {visibleItems.map((item) => (
        <article
          key={item.label}
          className={cn('rounded-xl border border-slate-200/80 bg-white/90 p-3 shadow-sm', itemClassName)}
        >
          <p className="mb-0 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            {item.label}
          </p>
          <p className="mt-1 mb-0 flex items-center gap-1.5 text-sm text-slate-700">
            {item.icon ? <span className="shrink-0 text-slate-500">{item.icon}</span> : null}
            <span>{item.detail}</span>
          </p>
        </article>
      ))}
    </div>
  );
}
