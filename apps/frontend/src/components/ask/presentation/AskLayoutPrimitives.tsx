import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function AskReadingMeasure({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mx-auto w-full max-w-3xl', className)} {...props} />;
}

export function AskWorkspaceMeasure({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mx-auto w-full max-w-[1440px]', className)} {...props} />;
}

export function AskCompactRow({ className, ...props }: HTMLAttributes<HTMLLIElement>) {
  return <li className={cn('flex min-h-[4.5rem] flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4', className)} {...props} />;
}

export function AskDefinitionGrid({ className, ...props }: HTMLAttributes<HTMLDListElement>) {
  return <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3', className)} {...props} />;
}

export function AskCollection({ className, ...props }: HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn('divide-y divide-slate-200', className)} {...props} />;
}

export function AskAdaptiveGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3', className)} {...props} />;
}

export function AskFocusedPanel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 sm:p-6', className)} {...props} />;
}

export type AskCollectionStateKind = 'EMPTY' | 'UNAVAILABLE' | 'NOT_APPLICABLE';

const STATE_COPY: Record<AskCollectionStateKind, string> = {
  EMPTY: 'Nothing is recorded here yet.',
  UNAVAILABLE: 'This information is temporarily unavailable.',
  NOT_APPLICABLE: 'This section does not apply to this home.',
};

export function AskCollectionState({ kind, title, description, action, className }: {
  kind: AskCollectionStateKind;
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between', className)} data-ask-collection-state={kind.toLowerCase()} role={kind === 'UNAVAILABLE' ? 'status' : undefined}>
      <div className="min-w-0">
        {title && <p className="font-semibold text-slate-900">{title}</p>}
        <p className="text-slate-600">{description ?? STATE_COPY[kind]}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
