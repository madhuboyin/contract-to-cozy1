'use client';

import { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Home, Loader2, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CTC_TEMPLATE_SURFACES_V1 } from '@/lib/design-system/tokenGovernance';

export type RouteStateKind = 'loading' | 'empty' | 'error' | 'offline' | 'success';

interface RouteStateCardProps {
  state: RouteStateKind;
  title: string;
  description: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
}

const STATE_CONTAINER_CLASS: Record<RouteStateKind, string> = {
  loading: 'border-slate-200 bg-white',
  empty: 'border-brand-100 bg-brand-50/50',
  error: 'border-rose-200 bg-rose-50',
  offline: 'border-amber-200 bg-amber-50',
  success: 'border-emerald-200 bg-emerald-50',
};

const STATE_ICON_CLASS: Record<RouteStateKind, string> = {
  loading: 'text-brand-700',
  empty: 'text-brand-700',
  error: 'text-rose-600',
  offline: 'text-amber-700',
  success: 'text-emerald-700',
};

const STATE_ICON: Record<RouteStateKind, ReactNode> = {
  loading: <Loader2 className={cn('h-6 w-6 animate-spin', STATE_ICON_CLASS.loading)} />,
  empty: <Home className={cn('h-6 w-6', STATE_ICON_CLASS.empty)} />,
  error: <AlertTriangle className={cn('h-6 w-6', STATE_ICON_CLASS.error)} />,
  offline: <WifiOff className={cn('h-6 w-6', STATE_ICON_CLASS.offline)} />,
  success: <CheckCircle2 className={cn('h-6 w-6', STATE_ICON_CLASS.success)} />,
};

export default function RouteStateCard({
  state,
  title,
  description,
  action,
  secondaryAction,
  className,
}: RouteStateCardProps) {
  return (
    <section
      className={cn(
        CTC_TEMPLATE_SURFACES_V1.card,
        'p-6 text-center',
        STATE_CONTAINER_CLASS[state],
        className
      )}
    >
      <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm">
        {STATE_ICON[state]}
      </div>
      <h2 className="mt-4 text-2xl font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 mb-0 text-sm text-slate-600">{description}</p>
      {(action || secondaryAction) ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </section>
  );
}

