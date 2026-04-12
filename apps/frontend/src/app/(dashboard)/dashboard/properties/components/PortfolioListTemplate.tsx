'use client';

import { ReactNode } from 'react';

interface PortfolioMetric {
  label: string;
  value: string;
}

interface PortfolioListTemplateProps {
  title: string;
  subtitle: string;
  action?: ReactNode;
  contextLabel?: string | null;
  metrics: PortfolioMetric[];
  children: ReactNode;
}

export default function PortfolioListTemplate({
  title,
  subtitle,
  action,
  contextLabel,
  metrics,
  children,
}: PortfolioListTemplateProps) {
  return (
    <section className="space-y-4">
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.11em] text-slate-500">
              Portfolio
            </p>
            <h1 className="mb-0 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
              {title}
            </h1>
            <p className="mt-1 mb-0 text-sm text-slate-600">{subtitle}</p>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-[linear-gradient(145deg,#f8fafc,#eef2ff)] p-2">
          {metrics.slice(0, 3).map((metric) => (
            <div key={metric.label} className="rounded-xl border border-white/80 bg-white/80 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">{metric.label}</p>
              <p className="mt-1 text-base font-semibold text-slate-900 md:text-lg">{metric.value}</p>
            </div>
          ))}
        </div>

        {contextLabel ? (
          <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
            Select a property to continue to <span className="font-semibold">{contextLabel}</span>.
          </div>
        ) : null}
      </header>

      <div className="space-y-4">{children}</div>
    </section>
  );
}
