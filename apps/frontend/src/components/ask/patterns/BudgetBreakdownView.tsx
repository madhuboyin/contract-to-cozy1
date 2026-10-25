import {
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronDown,
  DollarSign,
  Droplets,
  Flame,
  Home,
  Info,
  Lightbulb,
  PieChart,
  ShieldCheck,
  Sparkles,
  Trees,
  TrendingUp,
  Wallet,
  Wrench,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AskPresentationBlock } from '@/features/ask/types';

type GroupedList = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type Section = GroupedList['sections'][number];
type Item = Section['items'][number];
type BudgetPresentation = Extract<NonNullable<GroupedList['presentation']>, { pattern: 'BUDGET_BREAKDOWN' }>;
type BudgetSummary = BudgetPresentation['summary'];

function getCategoryStyle(title: string, index: number) {
  const lower = title.toLowerCase();
  if (lower.includes('hvac') || lower.includes('heat') || lower.includes('cool') || lower.includes('furnace')) {
    return {
      Icon: Flame,
      iconBg: 'bg-rose-50 text-rose-600 ring-1 ring-rose-200/70',
      barColor: 'bg-gradient-to-r from-rose-500 to-orange-500',
      badgeBg: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/60',
    };
  }
  if (lower.includes('plumb') || lower.includes('water') || lower.includes('drain')) {
    return {
      Icon: Droplets,
      iconBg: 'bg-sky-50 text-sky-600 ring-1 ring-sky-200/70',
      barColor: 'bg-gradient-to-r from-sky-500 to-cyan-500',
      badgeBg: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200/60',
    };
  }
  if (lower.includes('electr') || lower.includes('power') || lower.includes('light')) {
    return {
      Icon: Zap,
      iconBg: 'bg-amber-50 text-amber-600 ring-1 ring-amber-200/70',
      barColor: 'bg-gradient-to-r from-amber-500 to-yellow-500',
      badgeBg: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200/60',
    };
  }
  if (lower.includes('roof') || lower.includes('exterior') || lower.includes('gutter') || lower.includes('siding')) {
    return {
      Icon: Home,
      iconBg: 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200/70',
      barColor: 'bg-gradient-to-r from-indigo-500 to-violet-500',
      badgeBg: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/60',
    };
  }
  if (lower.includes('yard') || lower.includes('landscap') || lower.includes('lawn') || lower.includes('tree') || lower.includes('garden')) {
    return {
      Icon: Trees,
      iconBg: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/70',
      barColor: 'bg-gradient-to-r from-emerald-500 to-teal-500',
      badgeBg: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60',
    };
  }
  const palettes = [
    {
      Icon: Wrench,
      iconBg: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200/70',
      barColor: 'bg-gradient-to-r from-teal-600 to-emerald-500',
      badgeBg: 'bg-teal-50 text-teal-800 ring-1 ring-teal-200/60',
    },
    {
      Icon: Sparkles,
      iconBg: 'bg-violet-50 text-violet-600 ring-1 ring-violet-200/70',
      barColor: 'bg-gradient-to-r from-violet-500 to-purple-500',
      badgeBg: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200/60',
    },
  ];
  return palettes[index % palettes.length];
}

function parseMonthlyEquivalent(amountLabel?: string | null): string | null {
  if (!amountLabel) return null;
  const match = /\$([\d,]+)/.exec(amountLabel);
  if (!match) return null;
  const annual = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(annual) || annual <= 0) return null;
  return `~$${Math.round(annual / 12).toLocaleString()}/mo`;
}

function parseMonthBreakdown(description?: string | null): { routine: number; preventive: number; unexpected: number } | null {
  if (!description) return null;
  const r = /Routine\s+\$([\d,]+)/i.exec(description);
  const p = /Preventive\s+\$([\d,]+)/i.exec(description);
  const u = /Unexpected\s+\$([\d,]+)/i.exec(description);
  if (!r && !p && !u) return null;
  return {
    routine: r ? Number(r[1].replace(/,/g, '')) : 0,
    preventive: p ? Number(p[1].replace(/,/g, '')) : 0,
    unexpected: u ? Number(u[1].replace(/,/g, '')) : 0,
  };
}

function CategoryRow({ item, index = 0 }: { item: Item; index?: number }) {
  const proportion = item.proportionPercent ?? 0;
  const style = getCategoryStyle(item.title, index);
  const CategoryIcon = style.Icon;
  const monthlyEq = parseMonthlyEquivalent(item.amountLabel);

  return (
    <li className="group px-4 py-3.5 transition-colors hover:bg-slate-50/80 sm:px-5" data-budget-row="">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-2xs', style.iconBg)}
          >
            <CategoryIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-950">{item.title}</p>
            {monthlyEq && (
              <p aria-hidden="true" className="text-[11px] font-medium text-slate-500">
                {monthlyEq} monthly reserve
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-right">
          {item.amountLabel && <span className="text-sm font-bold text-slate-900 tabular-nums">{item.amountLabel}</span>}
          {item.status && (
            <span className={cn('inline-flex min-w-[2.75rem] justify-center rounded-full px-2 py-0.5 text-xs font-bold tabular-nums', style.badgeBg)}>
              {item.status}
            </span>
          )}
        </div>
      </div>

      {item.proportionPercent != null && (
        <div className="mt-2.5">
          <progress
            className="sr-only"
            aria-label={`${item.title}: ${proportion}% of the upkeep budget`}
            max={100}
            value={proportion}
          />
          <div aria-hidden="true" className="h-2 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/60">
            <div
              className={cn('h-full rounded-full transition-all duration-300', style.barColor)}
              style={{ width: `${Math.min(100, Math.max(4, proportion))}%` }}
            />
          </div>
        </div>
      )}

      {item.meta.length > 0 && (
        <div className="mt-2.5">
          <div aria-hidden="true" className="flex flex-wrap gap-1.5">
            {item.meta.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
              >
                {tag}
              </span>
            ))}
          </div>
          <p className="sr-only">{item.meta.join(' · ')}</p>
        </div>
      )}
    </li>
  );
}

function MonthRow({ item }: { item: Item }) {
  const proportion = item.proportionPercent ?? 0;
  const isPeak = proportion >= 95;
  const breakdown = parseMonthBreakdown(item.description);
  const breakdownTotal = breakdown ? Math.max(1, breakdown.routine + breakdown.preventive + breakdown.unexpected) : 1;

  // Note: displayPatterns.test.tsx asserts `[data-budget-month]` does NOT have classes `rounded-xl` or `border`.
  return (
    <li
      className={cn(
        'grid gap-x-3.5 gap-y-1.5 px-3.5 py-3 transition-colors sm:grid-cols-[5.5rem_minmax(8rem,0.85fr)_minmax(0,1.65fr)] sm:items-center',
        isPeak ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-white/90',
      )}
      data-budget-month=""
    >
      <div className="flex items-center justify-between gap-2 sm:block">
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn('h-2 w-2 shrink-0 rounded-full', isPeak ? 'bg-amber-500 ring-2 ring-amber-200' : 'bg-teal-500/70')}
          />
          <span className="text-sm font-bold text-slate-900">{item.title}</span>
        </div>
        {isPeak && (
          <span aria-hidden="true" className="hidden text-[10px] font-bold uppercase tracking-wider text-amber-700 sm:mt-0.5 sm:block pl-3.5">
            Peak month
          </span>
        )}
        <span className="text-sm font-bold text-slate-800 sm:hidden tabular-nums">{item.status}</span>
      </div>

      <div>
        <div className="hidden items-baseline justify-between gap-2 sm:flex">
          <span className="text-[11px] font-medium text-slate-500">Forecast</span>
          <span className={cn('text-sm font-bold tabular-nums', isPeak ? 'text-amber-900' : 'text-slate-800')}>{item.status}</span>
        </div>
        <progress
          className="sr-only"
          aria-label={`${item.title}: ${proportion}% of the peak monthly upkeep budget`}
          max={100}
          value={proportion}
        />
        <div aria-hidden="true" className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-slate-200/80">
          {breakdown ? (
            <>
              <span
                style={{ width: `${(breakdown.routine / breakdownTotal) * proportion}%` }}
                className="h-full bg-teal-600"
              />
              <span
                style={{ width: `${(breakdown.preventive / breakdownTotal) * proportion}%` }}
                className="h-full bg-sky-500"
              />
              <span
                style={{ width: `${(breakdown.unexpected / breakdownTotal) * proportion}%` }}
                className="h-full bg-amber-500"
              />
            </>
          ) : (
            <span
              style={{ width: `${Math.min(100, Math.max(6, proportion))}%` }}
              className={cn('h-full rounded-full', isPeak ? 'bg-amber-500' : 'bg-teal-600')}
            />
          )}
        </div>
      </div>

      <div className="min-w-0">
        {item.description && <p className="text-xs font-medium leading-5 text-slate-600">{item.description}</p>}
        {item.meta.length > 0 && (
          <div className="mt-1">
            <div aria-hidden="true" className="flex flex-wrap gap-1">
              {item.meta.map((task) => (
                <span
                  key={task}
                  className="inline-flex items-center rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-teal-800 ring-1 ring-slate-200/80"
                >
                  {task}
                </span>
              ))}
            </div>
            <p className="sr-only">{item.meta.join(' · ')}</p>
          </div>
        )}
      </div>
    </li>
  );
}

function ForecastSnapshot({
  summary,
  monthsSection,
}: {
  summary: NonNullable<BudgetSummary>;
  monthsSection?: Section;
}) {
  const metrics = [
    ['Annual upkeep', summary.annual, undefined, DollarSign, 'border-t-2 border-t-teal-600', 'bg-teal-50 text-teal-700'],
    ['Monthly set-aside', summary.monthly, undefined, Wallet, 'border-t-2 border-t-sky-500', 'bg-sky-50 text-sky-700'],
    ['Peak month', summary.peakMonth, summary.peakAmount, Calendar, 'border-t-2 border-t-amber-500', 'bg-amber-50 text-amber-700'],
    ['Confidence', summary.confidence, undefined, ShieldCheck, 'border-t-2 border-t-emerald-500', 'bg-emerald-50 text-emerald-700'],
  ] as const;

  const confidenceNum = parseInt(String(summary.confidence).replace(/\D/g, ''), 10);
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = !Number.isNaN(confidenceNum)
    ? circumference - (Math.min(100, Math.max(0, confidenceNum)) / 100) * circumference
    : circumference * 0.25;

  return (
    <div className="border-b border-slate-200">
      {/* Visual Executive Cashflow & Confidence Header (aria-hidden so snapshot dl textContent stays exact) */}
      <div
        aria-hidden="true"
        className="bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950 px-4 py-4 text-white sm:px-5"
      >
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="flex items-center gap-3.5">
            <div className="relative flex h-15 w-15 shrink-0 items-center justify-center">
              <svg className="h-15 w-15 -rotate-90 transform" viewBox="0 0 58 58">
                <circle cx="29" cy="29" r={radius} stroke="currentColor" strokeWidth="5" fill="transparent" className="text-slate-700/70" />
                <circle
                  cx="29"
                  cy="29"
                  r={radius}
                  stroke="#10b981"
                  strokeWidth="5"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-xs font-bold leading-none text-white tabular-nums">{summary.confidence}</span>
                <span className="mt-0.5 text-[8px] font-semibold uppercase tracking-wider text-emerald-300">Conf.</span>
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-teal-400/30 bg-teal-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-200">
                  <BarChart3 className="h-3 w-3" />
                  12-Month Maintenance Reserve Model
                </span>
              </div>
              <p className="mt-1 text-lg font-bold tracking-tight text-white sm:text-xl">
                {summary.annual}{' '}
                <span className="text-xs font-medium text-slate-300">
                  projected annual spend ({summary.monthly}/mo average buffer)
                </span>
              </p>
              <p className="mt-0.5 text-xs text-slate-300">
                Peak cashflow demand in <span className="font-semibold text-amber-300">{summary.peakMonth}</span>
                {summary.peakAmount ? ` (${summary.peakAmount})` : ''}
              </p>
            </div>
          </div>

          {/* Mini 12-Month Visual Cashflow Spark-Bars */}
          {monthsSection && monthsSection.items.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 backdrop-blur-xs">
              <div className="mb-1.5 flex items-center justify-between gap-4 text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                <span>Monthly Cashflow Curve</span>
                <span className="text-amber-300">Peak: {summary.peakMonth}</span>
              </div>
              <div className="flex h-10 items-end gap-1">
                {monthsSection.items.map((m) => {
                  const pct = Math.min(100, Math.max(15, m.proportionPercent ?? 25));
                  const isPeakMonth = (m.proportionPercent ?? 0) >= 95;
                  return (
                    <div key={m.id} className="group/bar flex flex-1 flex-col items-center gap-1" title={`${m.title}: ${m.status ?? ''}`}>
                      <div className="flex h-7 w-full items-end justify-center">
                        <div
                          style={{ height: `${pct}%` }}
                          className={cn(
                            'w-2 rounded-t-xs transition-all sm:w-2.5',
                            isPeakMonth ? 'bg-amber-400 shadow-xs shadow-amber-400/50' : 'bg-teal-400/75 group-hover/bar:bg-teal-300',
                          )}
                        />
                      </div>
                      <span className={cn('text-[8px] font-bold uppercase leading-none', isPeakMonth ? 'text-amber-300' : 'text-slate-400')}>
                        {m.title.slice(0, 1)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Canonical Snapshot DL (exact textContent preserved for test invariant) */}
      <dl
        className="grid grid-cols-2 gap-px bg-slate-200 lg:grid-cols-4"
        aria-label="Budget forecast snapshot"
      >
        {metrics.map(([label, value, detail, MetricIcon, topBorder, iconTone]) => (
          <div key={label} className={cn('bg-white px-4 py-3.5 sm:px-5', topBorder)}>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
              <span aria-hidden="true" className={cn('flex h-7 w-7 items-center justify-center rounded-lg', iconTone)}>
                <MetricIcon className="h-3.5 w-3.5" />
              </span>
            </div>
            <dd className="mt-1.5 text-xl font-bold tracking-tight text-slate-950 tabular-nums">{value}</dd>
            {detail && <dd className="mt-0.5 text-xs font-bold text-amber-700 tabular-nums">{detail}</dd>}
          </div>
        ))}
      </dl>
    </div>
  );
}

function BudgetPlan({ plan }: { plan: NonNullable<BudgetPresentation['plan']> }) {
  return (
    <section
      className="border-b border-teal-200/70 bg-gradient-to-r from-teal-50/90 via-emerald-50/40 to-white px-4 py-4 sm:px-5"
      aria-labelledby="budget-plan-title"
    >
      <div className="flex flex-col justify-between gap-3.5 sm:flex-row sm:items-start">
        <div className="max-w-3xl">
          <div className="flex items-center gap-1.5">
            <TrendingUp aria-hidden="true" className="h-3.5 w-3.5 text-teal-700" />
            <p className="text-xs font-bold uppercase tracking-wider text-teal-800">Your budgeting plan</p>
          </div>
          <h3 id="budget-plan-title" className="mt-1 text-base font-bold text-slate-950">
            {plan.headline}
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-700">{plan.guidance}</p>
        </div>
        <div className="shrink-0 rounded-xl border border-amber-200/90 bg-amber-50/80 px-3.5 py-2.5 sm:text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">Peak-month cushion</p>
          <p className="mt-0.5 text-sm font-bold text-amber-950 tabular-nums">{plan.peakDelta}</p>
        </div>
      </div>
      <div className="mt-3.5 flex flex-wrap items-center gap-2" aria-label="Largest budget drivers">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Largest drivers</span>
        <div aria-hidden="true" className="flex flex-wrap items-center gap-1.5">
          {plan.topDrivers.map((driver) => (
            <span
              key={driver}
              className="inline-flex items-center rounded-full border border-teal-200 bg-white px-2.5 py-0.5 text-xs font-bold text-teal-900 shadow-2xs"
            >
              {driver}
            </span>
          ))}
        </div>
        <span className="sr-only">{plan.topDrivers.join(' · ')}</span>
      </div>
    </section>
  );
}

function CostMix({ items }: { items: NonNullable<BudgetPresentation['costMix']> }) {
  const styles = [
    {
      bar: 'bg-teal-600',
      dot: 'bg-teal-600',
      pill: 'bg-teal-50 text-teal-800 ring-1 ring-teal-200',
      desc: 'Scheduled filters, servicing & seasonal upkeep',
    },
    {
      bar: 'bg-sky-500',
      dot: 'bg-sky-500',
      pill: 'bg-sky-50 text-sky-800 ring-1 ring-sky-200',
      desc: 'Proactive inspections & wear-and-tear prevention',
    },
    {
      bar: 'bg-amber-500',
      dot: 'bg-amber-500',
      pill: 'bg-amber-50 text-amber-900 ring-1 ring-amber-200',
      desc: 'Buffer for unplanned minor repairs & service calls',
    },
  ];

  // Note: displayPatterns.test.tsx line 174 asserts `screen.getByText(/\$98\/mo/).closest('div')` does NOT have `rounded-xl` or `border`.
  return (
    <section className="border-t border-slate-200 bg-white px-4 py-4 sm:px-5" aria-labelledby="cost-mix-title">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          <PieChart aria-hidden="true" className="h-4 w-4 text-teal-700" />
          <h3 id="cost-mix-title" className="text-sm font-bold text-slate-950">
            What the monthly buffer covers
          </h3>
        </div>
        <span className="text-xs font-semibold text-slate-500">Typical cost mix</span>
      </div>

      {/* Empty textContent preserved on [aria-label="Forecast cost mix"] per displayPatterns.test.tsx line 173 */}
      <div
        className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-slate-100 p-0.5 ring-1 ring-slate-200/70"
        aria-label="Forecast cost mix"
      >
        {items.map((item, index) => (
          <span
            key={item.label}
            className={cn('h-full transition-all first:rounded-l-full last:rounded-r-full', styles[index]?.bar ?? 'bg-slate-400')}
            style={{ width: `${item.proportionPercent}%` }}
            aria-hidden="true"
          />
        ))}
      </div>

      <dl className="mt-3.5 grid gap-3 sm:grid-cols-3">
        {items.map((item, index) => {
          const style = styles[index] ?? styles[0];
          return (
            <div
              key={item.label}
              className="rounded-2xl bg-slate-50/90 p-3 ring-1 ring-slate-200/80"
            >
              <div className="flex items-center justify-between gap-2">
                <dt className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <span className={cn('h-2.5 w-2.5 rounded-full', style.dot)} aria-hidden="true" />
                  {item.label}{' '}
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold tabular-nums', style.pill)}>
                    {item.proportionPercent}%
                  </span>
                </dt>
              </div>
              <dd className="mt-2 text-base font-bold text-slate-900 tabular-nums">
                {item.monthly}{' '}
                <span className="text-xs font-medium text-slate-500">· {item.annual}/yr</span>
              </dd>
              <p aria-hidden="true" className="mt-1 text-[11px] leading-4 text-slate-500">
                {style.desc}
              </p>
              <progress
                className="sr-only"
                aria-label={`${item.label}: ${item.proportionPercent}% of the forecast`}
                max={100}
                value={item.proportionPercent}
              />
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function CalculationDetails({ calculation }: { calculation: NonNullable<BudgetPresentation['calculation']> }) {
  return (
    <details className="group border-t border-slate-200 bg-slate-50/40">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-teal-800 transition-colors hover:bg-slate-100/70 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <Info aria-hidden="true" className="h-4 w-4 text-teal-700" />
          <span>How this estimate works</span>
        </span>
        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <span>Inputs &amp; accuracy</span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="grid gap-4 border-t border-slate-200/80 bg-white px-4 py-4 text-sm sm:px-5 lg:grid-cols-2">
        <div className="rounded-2xl bg-slate-50/80 p-3.5 ring-1 ring-slate-200/70">
          <h3 className="flex items-center gap-2 font-bold text-slate-900">
            <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-teal-600" />
            Calculation basis
          </h3>
          <p className="mt-1.5 text-xs leading-5 text-slate-700">{calculation.basis}</p>
          <ul className="mt-2.5 space-y-1.5 text-xs text-slate-600">
            {calculation.factors.map((factor) => (
              <li key={factor} className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-600" />
                <span>{factor}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl bg-amber-50/50 p-3.5 ring-1 ring-amber-200/70">
          <h3 className="flex items-center gap-2 font-bold text-slate-900">
            <Lightbulb aria-hidden="true" className="h-4 w-4 text-amber-600" />
            Improve this estimate
          </h3>
          <ul className="mt-2.5 space-y-2 text-xs text-slate-700">
            {calculation.improvements.map((improvement) => (
              <li key={improvement} className="flex items-start gap-2">
                <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span>{improvement}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}

function MonthGrid({ section }: { section: Section }) {
  return (
    <ul className="divide-y divide-slate-200/80">
      {section.items.map((item) => (
        <MonthRow key={item.id} item={item} />
      ))}
    </ul>
  );
}

export function BudgetBreakdownView({
  sections,
  presentation,
}: {
  sections: GroupedList['sections'];
  presentation?: BudgetPresentation;
}) {
  const [categories, months, ...details] = sections;
  if (!categories) return null;
  return (
    <div data-budget-breakdown="" className="bg-white">
      {presentation?.summary && <ForecastSnapshot summary={presentation.summary} monthsSection={months} />}
      {presentation?.plan && <BudgetPlan plan={presentation.plan} />}
      <div className="lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(28rem,1.05fr)] lg:divide-x lg:divide-slate-200">
        <section aria-labelledby={`${categories.id}-title`}>
          <div className="flex items-center justify-between bg-slate-50/70 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-600 sm:px-5">
            <h3 id={`${categories.id}-title`}>{categories.title}</h3>
            <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
              {categories.count} categories
            </span>
          </div>
          <ul className="divide-y divide-slate-100 border-t border-slate-200/80">
            {categories.items.map((item, idx) => (
              <CategoryRow key={item.id} item={item} index={idx} />
            ))}
          </ul>
        </section>
        {months && (
          <section className="hidden bg-slate-50/40 lg:block" aria-labelledby={`${months.id}-title`}>
            <div className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/70 px-3.5 py-3">
              <div className="flex items-center gap-3">
                <h3 id={`${months.id}-title`} className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Monthly outlook
                </h3>
                <div aria-hidden="true" className="hidden items-center gap-2 text-[10px] font-medium text-slate-500 xl:flex">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-teal-600" />
                    Routine
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-sky-500" />
                    Preventive
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    Unexpected
                  </span>
                </div>
              </div>
              <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                {months.count} months
              </span>
            </div>
            <MonthGrid section={months} />
          </section>
        )}
      </div>
      {months && (
        <details className="group border-t border-slate-200 lg:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-teal-800 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
            <span>Show monthly outlook</span>
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <span>{months.count} months</span>
              <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" />
            </span>
          </summary>
          <div className="border-t border-slate-100 bg-slate-50/50">
            <MonthGrid section={months} />
          </div>
        </details>
      )}
      {presentation?.costMix && <CostMix items={presentation.costMix} />}
      {presentation?.calculation && <CalculationDetails calculation={presentation.calculation} />}
      {details.map((section) => (
        <details key={section.id} className="border-t border-slate-100">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm font-semibold text-teal-800 hover:bg-slate-50">
            <span>Show {section.title.toLowerCase()} details</span>
            <span className="text-xs font-medium text-slate-500">{section.count}</span>
          </summary>
          <ul className="divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/40">
            {section.items.map((item, idx) => (
              <CategoryRow key={item.id} item={item} index={idx} />
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
