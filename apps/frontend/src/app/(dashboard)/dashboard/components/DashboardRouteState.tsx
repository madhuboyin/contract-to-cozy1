'use client';

import { ReactNode } from 'react';
import { AlertTriangle, Home, Loader2 } from 'lucide-react';
import { DashboardShell } from '@/components/DashboardShell';

interface DashboardRouteStateProps {
  state: 'loading' | 'error' | 'empty';
  title: string;
  description: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
}

export default function DashboardRouteState({
  state,
  title,
  description,
  action,
  secondaryAction,
}: DashboardRouteStateProps) {
  const icon =
    state === 'loading' ? (
      <Loader2 className="h-6 w-6 animate-spin text-brand-700" />
    ) : state === 'error' ? (
      <AlertTriangle className="h-6 w-6 text-rose-600" />
    ) : (
      <Home className="h-6 w-6 text-brand-700" />
    );

  const toneClasses =
    state === 'error'
      ? 'border-rose-200 bg-rose-50'
      : state === 'empty'
        ? 'border-brand-100 bg-brand-50/50'
        : 'border-slate-200 bg-white';

  return (
    <DashboardShell className="pt-8">
      <section className={`rounded-2xl border p-6 text-center shadow-sm ${toneClasses}`}>
        <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm">
          {icon}
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
    </DashboardShell>
  );
}
