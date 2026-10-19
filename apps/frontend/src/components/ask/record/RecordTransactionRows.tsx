import type { AskRecordBuyerTaskRow, AskRecordFinancingScenarioRow, AskRecordSellerItemRow } from '@/features/ask/types';
import { AskCompactRow } from '../presentation/AskLayoutPrimitives';

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const when = (iso: string | null) => (iso ? dateFormat.format(new Date(iso)) : null);

// These rows carry no action: Ask has no per-record read for them reachable from a link, so the index opens the Ask answer.
export function RecordFinancingScenarioRow({ scenario }: { scenario: AskRecordFinancingScenarioRow }) {
  const facts = [scenario.projectCostLabel, scenario.statusLabel, scenario.selectedOptionLabel ? `Chosen: ${scenario.selectedOptionLabel}` : 'No option chosen', scenario.entryPointLabel, `Created ${when(scenario.createdAt)}`].filter(Boolean);
  return (
    <AskCompactRow className="border-b border-slate-200 last:border-b-0" data-record-row={scenario.id}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-950">{scenario.title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{facts.join(' · ')}</p>
      </div>
    </AskCompactRow>
  );
}

export function RecordBuyerTaskRow({ task }: { task: AskRecordBuyerTaskRow }) {
  const facts = [task.phaseLabel, task.statusLabel, task.required ? 'Required' : null, when(task.dueAt) ? `Due ${when(task.dueAt)}` : null, when(task.completedAt) ? `Completed ${when(task.completedAt)}` : null].filter(Boolean);
  return (
    <AskCompactRow className="border-b border-slate-200 last:border-b-0" data-record-row={task.id}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-950">{task.title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{facts.join(' · ')}</p>
        {task.description && <p className="mt-1 text-xs text-slate-600">{task.description}</p>}
        {task.blocking && <p className="mt-1 text-xs font-semibold text-amber-800">Blocking the plan</p>}
      </div>
    </AskCompactRow>
  );
}

export function RecordSellerItemRow({ item }: { item: AskRecordSellerItemRow }) {
  const facts = [item.categoryLabel, item.requirementLabel, item.statusLabel, when(item.dueAt) ? `Due ${when(item.dueAt)}` : null, item.costRangeLabel ? `Estimated ${item.costRangeLabel}` : null].filter(Boolean);
  return (
    <AskCompactRow className="border-b border-slate-200 last:border-b-0" data-record-row={item.id}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-950">{item.title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{facts.join(' · ')}</p>
        {item.detail && <p className="mt-1 text-xs text-slate-600">{item.detail}</p>}
      </div>
    </AskCompactRow>
  );
}
