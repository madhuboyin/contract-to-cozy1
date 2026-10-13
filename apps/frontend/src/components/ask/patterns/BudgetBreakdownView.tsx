import type { AskPresentationBlock } from '@/features/ask/types';

type GroupedList = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;

function BudgetRow({ item }: { item: GroupedList['sections'][number]['items'][number] }) {
  const proportion = item.proportionPercent ?? 0;
  return (
    <li className="px-4 py-2.5" data-budget-row="">
      <div className="flex items-baseline justify-between gap-4">
        <p className="min-w-0 truncate text-sm font-semibold text-slate-950">{item.title}</p>
        <div className="flex shrink-0 items-baseline gap-2 text-right">
          {item.amountLabel && <span className="text-sm font-medium text-slate-700">{item.amountLabel}</span>}
          {item.status && <span className="w-9 text-xs font-semibold text-slate-500">{item.status}</span>}
        </div>
      </div>
      {item.proportionPercent != null && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`${item.title}: ${proportion}% of the upkeep budget`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={proportion}>
          <div className="h-full rounded-full bg-teal-600" style={{ width: `${proportion}%` }} />
        </div>
      )}
      {item.meta.length > 0 && <p className="mt-1.5 truncate text-xs text-slate-500" title={item.meta.join(' · ')}>{item.meta.join(' · ')}</p>}
      {!item.amountLabel && item.description && <p className="mt-1 text-xs text-slate-600">{item.description}</p>}
    </li>
  );
}

export function BudgetBreakdownView({ sections }: { sections: GroupedList['sections'] }) {
  const [primary, ...details] = sections;
  if (!primary) return null;
  return (
    <div data-budget-breakdown="">
      <div className="flex items-center justify-between px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span>{primary.title}</span>
        <span>{primary.count} categories</span>
      </div>
      <ul className="divide-y divide-slate-100 border-t border-slate-100">
        {primary.items.map((item) => <BudgetRow key={item.id} item={item} />)}
      </ul>
      {details.map((section) => (
        <details key={section.id} className="border-t border-slate-100">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm font-semibold text-teal-800 hover:bg-slate-50">
            <span>Show {section.title.toLowerCase()} details</span>
            <span className="text-xs font-medium text-slate-500">{section.count} months</span>
          </summary>
          <ul className="divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/40">
            {section.items.map((item) => <BudgetRow key={item.id} item={item} />)}
          </ul>
        </details>
      ))}
    </div>
  );
}
