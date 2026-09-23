'use client';

import { type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import type { AskItemActionInteractionType, AskPresentationBlock } from '@/features/ask/types';
import { ResultViewContext } from '@/features/ask/useResultView';
import { api } from '@/lib/api/client';
import type { HomeBuyerTask } from '@/types';
import { cn } from '@/lib/utils';

type Block = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type Item = Block['sections'][number]['items'][number];
type ItemAction = NonNullable<Item['actions']>[number];
type OnAction = (entityType: string | null | undefined, entityId: string, message: string, operationId: string, interactionType: AskItemActionInteractionType) => void;

const OPEN_STATUSES = new Set(['PENDING', 'IN_PROGRESS', 'BLOCKED']);

// The actions the task's LIVE state allows, mirroring the Buyer Plan page and buyerTaskCompleteResult: Mark complete
// needs an open (pending, in progress or blocked) task that applies to this purchase. The server re-checks.
export function buyerTaskActionsForLiveState(actions: ItemAction[], task: Pick<HomeBuyerTask, 'status' | 'applicability'>): ItemAction[] {
  return actions.filter((action) => action.id === 'buyer-task-complete' && OPEN_STATUSES.has(task.status) && task.applicability !== 'NOT_APPLICABLE');
}

function errorStatus(error: unknown): number | null {
  return error && typeof error === 'object' && typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : null;
}

const label = (value: string | null | undefined) => value ? value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase()) : 'Not recorded';
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No due date';

// Buyer-closing capability-card slice (FRD v1.46). The task is re-read from GET /home-buyer-tasks/properties/:id/tasks/
// :taskId, the Buyer Plan's own task read. That route answers a missing task and a denied property with the same
// uncoded 404; the service's messages tell them apart ("Task not found…" is only reached after the access check).
function BuyerTaskDetail({ item, expectedPropertyId, disabled, onAction, onAccessLost, onClose, link }: {
  item: Item;
  expectedPropertyId?: string;
  disabled?: boolean;
  onAction?: OnAction;
  onAccessLost: () => void;
  onClose: () => void;
  link: (href: string, label: ReactNode) => ReactNode;
}) {
  const [task, setTask] = useState<HomeBuyerTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'NOT_FOUND' | 'REVALIDATION_FAILED' | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const callbacksRef = useRef({ onAccessLost });
  callbacksRef.current = { onAccessLost };

  useEffect(() => {
    if (!expectedPropertyId) {
      setLoading(false);
      setError('REVALIDATION_FAILED');
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    setTask(null);
    api.getHomeBuyerTask(expectedPropertyId, item.id)
      .then((response) => {
        if (!active) return;
        if (response?.success && response.data?.id === item.id) setTask(response.data);
        else setError('REVALIDATION_FAILED');
      })
      .catch((caught) => {
        if (!active) return;
        const status = errorStatus(caught);
        if (status === 404 && caught instanceof Error && /^Task not found/.test(caught.message)) { setError('NOT_FOUND'); return; }
        if (status === 401 || status === 403 || status === 404) { callbacksRef.current.onAccessLost(); return; }
        setError('REVALIDATION_FAILED');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [expectedPropertyId, item.id]);

  useEffect(() => {
    if (!loading) headingRef.current?.focus();
  }, [loading]);

  const actions = task && onAction ? buyerTaskActionsForLiveState(item.actions ?? [], task) : [];

  return (
    <aside className="border-t border-teal-100 bg-teal-50/40 p-4" aria-labelledby={`buyer-task-detail-${item.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">Buyer Plan task</p>
          <h4 ref={headingRef} tabIndex={-1} id={`buyer-task-detail-${item.id}`} className="mt-1 text-lg font-semibold text-slate-950 outline-none">{task?.title ?? item.title}</h4>
        </div>
        <button type="button" onClick={onClose} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-white" aria-label={`Close task detail for ${item.title}`}><X className="h-4 w-4" /></button>
      </div>
      {loading && <p className="mt-4 flex items-center gap-2 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading the current task…</p>}
      {error && <div className="mt-4 rounded-xl border border-amber-200 bg-white p-3" role="alert">
        <p className="text-sm font-semibold text-amber-900">{error === 'NOT_FOUND' ? 'Task no longer exists' : 'Could not verify the current task'}</p>
        <p className="mt-1 text-sm text-slate-700">{error === 'NOT_FOUND' ? 'This task was removed from the Buyer Plan after the Ask result was created.' : 'The current Buyer Plan task could not be loaded.'}</p>
        <p className="mt-2 text-xs text-slate-500">The conversation remains available. Refresh this Ask result to reconcile with the Buyer Plan.</p>
      </div>}
      {task && <>
        {task.description && <p className="mt-3 text-sm leading-6 text-slate-700">{task.description}</p>}
        {task.statusReason && <p className="mt-1 text-sm leading-6 text-slate-600">{task.statusReason}</p>}
        <dl className="mt-4 grid gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-xs text-slate-500">Status</dt><dd className="mt-0.5 font-medium text-slate-900">{label(task.status)}</dd></div>
          <div><dt className="text-xs text-slate-500">Priority</dt><dd className="mt-0.5 font-medium text-slate-900">{label(task.priority)}</dd></div>
          <div><dt className="text-xs text-slate-500">Due</dt><dd className="mt-0.5 font-medium text-slate-900">{date(task.dueAt)}</dd></div>
          <div><dt className="text-xs text-slate-500">Phase</dt><dd className="mt-0.5 font-medium text-slate-900">{label(task.phase)}</dd></div>
          <div><dt className="text-xs text-slate-500">Closing</dt><dd className="mt-0.5 font-medium text-slate-900">{task.blocking ? 'Blocks closing' : 'Does not block closing'}</dd></div>
          {task.estimatedCostCents != null && <div><dt className="text-xs text-slate-500">Estimated cost</dt><dd className="mt-0.5 font-medium text-slate-900">${(task.estimatedCostCents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}</dd></div>}
          {task.notes && <div className="sm:col-span-2 lg:col-span-3"><dt className="text-xs text-slate-500">Notes</dt><dd className="mt-0.5 font-medium text-slate-900">{task.notes}</dd></div>}
        </dl>
        {actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{actions.map((action) => <button key={action.id} type="button" disabled={disabled} data-buyer-task-action={action.id}
          className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
          onClick={() => onAction?.(item.entityType, item.id, action.message, action.operationId, action.interactionType)}>{action.label}</button>)}</div>}
        <p className="mt-3 text-xs text-slate-500">
          Reopening, assigning, marking not needed and the phase tools are on the Buyer Plan.{' '}
          {item.href && link(item.href, <>Open in the Buyer Plan<ExternalLink className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" /></>)}
        </p>
      </>}
    </aside>
  );
}

// Renders BUYER_DEADLINES's buyer-deadlines-list block (FRD v1.46). Blocking-task rows open inline; milestone rows
// stay links to the Buyer Plan. The lane chips re-ask, as on the generic renderer.
export function BuyerTaskResultList({ block, propertyId, disabled, onFilter, onAction, onAccessLost, link }: {
  block: Block;
  propertyId?: string;
  disabled?: boolean;
  onFilter?: (message: string) => void;
  onAction?: OnAction;
  onAccessLost: () => void;
  link: (href: string, label: ReactNode) => ReactNode;
}) {
  const controls = useContext(ResultViewContext);
  const [localDetailId, setLocalDetailId] = useState<string | null>(null);
  const detailId = controls ? controls.detailIdFor(block.id) : localDetailId;
  const detailItem = block.sections.flatMap((section) => section.items).find((item) => item.id === detailId && item.entityType === 'BUYER_TASK');
  const openDetail = (item: Item) => {
    if (controls) controls.openDetail(block.id, item.id);
    else setLocalDetailId(item.id);
  };
  const closeDetail = () => {
    const closingId = detailId;
    if (controls) controls.closeDetail();
    else setLocalDetailId(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-buyer-task-detail-trigger="${CSS.escape(closingId ?? '')}"]`)?.focus());
  };

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="border-b border-slate-100 p-4">
      <h3 className="font-semibold text-slate-950">{block.title}</h3>
      {block.description && <p className="mt-1 text-xs text-slate-500">{block.description}</p>}
      {onFilter && block.filters.length > 0 && <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter deadlines by phase">
        {block.filters.map((filter) => <button key={filter.id} type="button" disabled={disabled || filter.active} aria-pressed={filter.active}
          onClick={() => onFilter(filter.message)} className={cn('min-h-10 rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-60', filter.active ? 'bg-teal-700 text-white' : 'bg-white text-slate-700')}>{filter.label}</button>)}
      </div>}
    </div>
    {block.sections.map((section) => <div key={section.id} className="border-b border-slate-100 p-4">
      <h4 className="font-semibold">{section.title} · {section.count}</h4>
      <ul className="mt-3 space-y-3">
        {section.items.map((item) => <li key={item.id} className={cn('rounded-xl border p-3', detailId === item.id ? 'border-teal-600 bg-teal-50' : 'border-transparent bg-slate-50')}>
          {item.entityType === 'BUYER_TASK'
            ? <button type="button" data-buyer-task-detail-trigger={item.id} data-ask-detail-trigger={item.id} data-ask-detail-block={block.id} aria-expanded={detailId === item.id} aria-controls={`buyer-task-detail-${item.id}`} onClick={() => openDetail(item)} className="min-h-10 text-left font-medium text-slate-950 underline-offset-4 hover:text-teal-800 hover:underline">{item.title}</button>
            : <p className="font-medium text-slate-950">{item.href ? link(item.href, item.title) : item.title}</p>}
          {item.description && <p className="mt-1 text-sm text-slate-600">{item.description}</p>}
          {item.meta.length > 0 && <p className="mt-1 text-xs text-slate-600">{item.meta.join(' · ')}</p>}
        </li>)}
      </ul>
    </div>)}
    {detailId && detailItem && <BuyerTaskDetail key={detailId} item={detailItem} expectedPropertyId={propertyId} disabled={disabled} onAction={onAction} onAccessLost={onAccessLost} onClose={closeDetail} link={link} />}
    <div className="flex flex-wrap gap-3 p-4 text-sm font-semibold text-teal-800">{block.actions.map((action) => action.href ? <span key={action.id}>{link(action.href, <>{action.label}<ExternalLink className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" /></>)}</span> : null)}</div>
  </section>;
}
