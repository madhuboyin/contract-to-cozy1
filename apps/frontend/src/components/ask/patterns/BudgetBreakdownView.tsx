import type { AskPresentationBlock } from '@/features/ask/types';

type GroupedList = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type Section = GroupedList['sections'][number];
type Item = Section['items'][number];
type BudgetPresentation = Extract<NonNullable<GroupedList['presentation']>, { pattern: 'BUDGET_BREAKDOWN' }>;
type BudgetSummary = BudgetPresentation['summary'];

function CategoryRow({ item }: { item: Item }) {
  const proportion = item.proportionPercent ?? 0;
  return (
    <li className="px-4 py-3 sm:px-5" data-budget-row="">
      <div className="flex items-baseline justify-between gap-4">
        <p className="min-w-0 text-sm font-semibold text-slate-950">{item.title}</p>
        <div className="flex shrink-0 items-baseline gap-2 text-right">
          {item.amountLabel && <span className="text-sm font-semibold text-slate-800">{item.amountLabel}</span>}
          {item.status && <span className="w-9 text-xs font-semibold text-slate-500">{item.status}</span>}
        </div>
      </div>
      {item.proportionPercent != null && <progress className="mt-2 block h-2 w-full overflow-hidden rounded-full accent-teal-600" aria-label={`${item.title}: ${proportion}% of the upkeep budget`} max={100} value={proportion} />}
      {item.meta.length > 0 && <p className="mt-2 text-xs leading-5 text-slate-600">{item.meta.join(' · ')}</p>}
    </li>
  );
}

function MonthRow({ item }: { item: Item }) {
  const proportion = item.proportionPercent ?? 0;
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3" data-budget-month="">
      <div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-slate-900">{item.title}</span><span className="text-sm font-semibold text-slate-700">{item.status}</span></div>
      <progress className="mt-2 block h-1.5 w-full overflow-hidden rounded-full accent-teal-600" aria-label={`${item.title}: ${proportion}% of the peak monthly upkeep budget`} max={100} value={proportion} />
      {item.description && <p className="mt-2 text-xs leading-5 text-slate-600">{item.description}</p>}
      {item.meta.length > 0 && <p className="mt-1 text-xs leading-5 text-slate-500">{item.meta.join(' · ')}</p>}
    </li>
  );
}

function ForecastSnapshot({ summary }: { summary: NonNullable<BudgetSummary> }) {
  const metrics = [['Annual upkeep', summary.annual], ['Monthly set-aside', summary.monthly], ['Peak month', summary.peakMonth, summary.peakAmount], ['Confidence', summary.confidence]];
  return (
    <dl className="grid grid-cols-2 gap-px border-b border-slate-200 bg-slate-200 lg:grid-cols-4" aria-label="Budget forecast snapshot">
      {metrics.map(([label, value, detail]) => <div key={label} className="bg-slate-50 px-4 py-3 sm:px-5"><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-1 text-lg font-semibold tracking-tight text-slate-950">{value}</dd>{detail && <dd className="text-xs font-medium text-teal-700">{detail}</dd>}</div>)}
    </dl>
  );
}

function BudgetPlan({ plan }: { plan: NonNullable<BudgetPresentation['plan']> }) {
  return (
    <section className="border-b border-teal-100 bg-teal-50/70 px-4 py-4 sm:px-5" aria-labelledby="budget-plan-title">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Your budgeting plan</p>
          <h3 id="budget-plan-title" className="mt-1 text-base font-semibold text-slate-950">{plan.headline}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-700">{plan.guidance}</p>
        </div>
        <div className="shrink-0 rounded-xl border border-teal-200 bg-white px-3 py-2 sm:text-right">
          <p className="text-xs font-medium text-slate-500">Peak-month cushion</p>
          <p className="mt-0.5 text-sm font-semibold text-teal-800">{plan.peakDelta}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Largest budget drivers">
        <span className="text-xs font-medium text-slate-500">Largest drivers</span>
        {plan.topDrivers.map((driver) => <span key={driver} className="rounded-full border border-teal-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">{driver}</span>)}
      </div>
    </section>
  );
}

function CostMix({ items }: { items: NonNullable<BudgetPresentation['costMix']> }) {
  return (
    <section className="border-t border-slate-200 px-4 py-4 sm:px-5" aria-labelledby="cost-mix-title">
      <div className="flex items-baseline justify-between gap-3"><h3 id="cost-mix-title" className="text-sm font-semibold text-slate-950">What the monthly buffer covers</h3><span className="text-xs text-slate-500">Typical cost mix</span></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {items.map((item) => <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex items-baseline justify-between gap-2"><p className="text-sm font-semibold text-slate-900">{item.label}</p><span className="text-xs font-semibold text-slate-500">{item.proportionPercent}%</span></div><p className="mt-1 text-base font-semibold text-slate-950">{item.monthly}</p><p className="text-xs text-slate-500">{item.annual} a year</p><progress className="mt-2 block h-1.5 w-full overflow-hidden rounded-full accent-teal-600" aria-label={`${item.label}: ${item.proportionPercent}% of the forecast`} max={100} value={item.proportionPercent} /></div>)}
      </div>
    </section>
  );
}

function CalculationDetails({ calculation }: { calculation: NonNullable<BudgetPresentation['calculation']> }) {
  return (
    <details className="border-t border-slate-200">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-teal-800 hover:bg-slate-50 sm:px-5"><span>How this estimate works</span><span className="text-xs font-medium text-slate-500">Inputs & accuracy</span></summary>
      <div className="grid gap-5 border-t border-slate-100 bg-slate-50/70 px-4 py-4 text-sm sm:px-5 lg:grid-cols-2">
        <div><h3 className="font-semibold text-slate-900">Calculation basis</h3><p className="mt-1 leading-6 text-slate-700">{calculation.basis}</p><ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">{calculation.factors.map((factor) => <li key={factor}>{factor}</li>)}</ul></div>
        <div><h3 className="font-semibold text-slate-900">Improve this estimate</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">{calculation.improvements.map((improvement) => <li key={improvement}>{improvement}</li>)}</ul></div>
      </div>
    </details>
  );
}

function MonthGrid({ section }: { section: Section }) {
  return <ul className="grid gap-2 sm:grid-cols-2">{section.items.map((item) => <MonthRow key={item.id} item={item} />)}</ul>;
}

export function BudgetBreakdownView({ sections, presentation }: { sections: GroupedList['sections']; presentation?: BudgetPresentation }) {
  const [categories, months, ...details] = sections;
  if (!categories) return null;
  return (
    <div data-budget-breakdown="">
      {presentation?.summary && <ForecastSnapshot summary={presentation.summary} />}
      {presentation?.plan && <BudgetPlan plan={presentation.plan} />}
      <div className="lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(28rem,1.1fr)] lg:divide-x lg:divide-slate-200">
        <section aria-labelledby={`${categories.id}-title`}>
          <div className="flex items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-5"><h3 id={`${categories.id}-title`}>{categories.title}</h3><span>{categories.count} categories</span></div>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">{categories.items.map((item) => <CategoryRow key={item.id} item={item} />)}</ul>
        </section>
        {months && <section className="hidden bg-slate-50/70 p-4 lg:block" aria-labelledby={`${months.id}-title`}><div className="mb-3 flex items-center justify-between"><h3 id={`${months.id}-title`} className="text-xs font-semibold uppercase tracking-wide text-slate-500">Monthly outlook</h3><span className="text-xs text-slate-500">{months.count} months</span></div><MonthGrid section={months} /></section>}
      </div>
      {months && <details className="border-t border-slate-200 lg:hidden"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-teal-800 hover:bg-slate-50"><span>Show monthly outlook</span><span className="text-xs font-medium text-slate-500">{months.count} months</span></summary><div className="border-t border-slate-100 bg-slate-50/70 p-3"><MonthGrid section={months} /></div></details>}
      {presentation?.costMix && <CostMix items={presentation.costMix} />}
      {presentation?.calculation && <CalculationDetails calculation={presentation.calculation} />}
      {details.map((section) => <details key={section.id} className="border-t border-slate-100"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm font-semibold text-teal-800 hover:bg-slate-50"><span>Show {section.title.toLowerCase()} details</span><span className="text-xs font-medium text-slate-500">{section.count}</span></summary><ul className="divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/40">{section.items.map((item) => <CategoryRow key={item.id} item={item} />)}</ul></details>)}
    </div>
  );
}
