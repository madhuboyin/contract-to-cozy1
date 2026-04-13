'use client';

import { ReactNode } from 'react';
import PriorityActionHero, { PriorityActionHeroProps } from '@/components/system/PriorityActionHero';

interface PropertyHubTemplateProps {
  title: string;
  context: string;
  statusLabel?: string | null;
  meta?: string[];
  primaryAction: ReactNode;
  priorityAction?: PriorityActionHeroProps;
  supportingAction?: ReactNode;
  utilityAction?: ReactNode;
  tabs: ReactNode;
  secondaryNav?: ReactNode;
  children: ReactNode;
}

export default function PropertyHubTemplate({
  title,
  context,
  statusLabel,
  meta = [],
  primaryAction,
  priorityAction,
  supportingAction,
  utilityAction,
  tabs,
  secondaryNav,
  children,
}: PropertyHubTemplateProps) {
  return (
    <section className="space-y-4">
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.11em] text-slate-500">
              Property Hub
            </p>
            <h1 className="mb-0 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
              {title}
            </h1>
            <p className="mt-1 mb-0 text-sm text-slate-600">{context}</p>
          </div>
          {statusLabel ? (
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              {statusLabel}
            </span>
          ) : null}
        </div>

        {meta.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {meta.map((item) => (
              <span
                key={item}
                className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
              >
                {item}
              </span>
            ))}
          </div>
        ) : null}

        {priorityAction ? (
          <div className="mt-4 space-y-2">
            <PriorityActionHero
              title={priorityAction.title}
              description={priorityAction.description}
              primaryAction={priorityAction.primaryAction}
              supportingAction={priorityAction.supportingAction}
              impactLabel={priorityAction.impactLabel}
              confidenceLabel={priorityAction.confidenceLabel}
              eyebrow={priorityAction.eyebrow || 'Property Priority'}
            />
            {(supportingAction || utilityAction) ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {supportingAction ? <div>{supportingAction}</div> : <div />}
                {utilityAction ? <div>{utilityAction}</div> : <div />}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="sm:col-span-2">{primaryAction}</div>
            <div className="space-y-2">
              {supportingAction ? supportingAction : null}
              {utilityAction ? utilityAction : null}
            </div>
          </div>
        )}
      </header>

      {tabs}
      {secondaryNav ? secondaryNav : null}
      <div>{children}</div>
    </section>
  );
}
