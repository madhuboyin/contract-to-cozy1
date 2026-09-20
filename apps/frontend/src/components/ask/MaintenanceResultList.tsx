'use client';

import { ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import type { AskItemActionInteractionType, AskPresentationBlock } from '@/features/ask/types';
import { ResultViewContext } from '@/features/ask/useResultView';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import type { PropertyMaintenanceTask } from '@/types';

type Block = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type Item = Block['sections'][number]['items'][number];
type ItemAction = NonNullable<Item['actions']>[number];

function errorStatus(error: unknown): number | null {
  return error && typeof error === 'object' && typeof (error as { status?: unknown }).status === 'number'
    ? (error as { status: number }).status
    : null;
}

function actionsForCanonicalStatus(actions: ItemAction[], status: string | null | undefined): ItemAction[] {
  if (!status || ['PENDING', 'IN_PROGRESS', 'NEEDS_REVIEW'].includes(status)) return actions;
  return actions.filter((action) => action.interactionType !== 'MUTATE_RECORD');
}

function formatDate(value: Date | string | null): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleDateString();
}

function formatMoney(value: number | null): string {
  return value == null
    ? 'Not recorded'
    : new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function fieldLabel(value: string | null): string {
  return value ? value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase()) : 'Not recorded';
}

function MaintenanceTaskDetail({ taskId, expectedPropertyId, fallbackItem, disabled, onAction, onCanonicalTask, onUnavailable, onAccessLost, onClose }: {
  taskId: string;
  expectedPropertyId?: string;
  fallbackItem: Item;
  disabled: boolean;
  onAction: (entityType: string | null | undefined, entityId: string, message: string, operationId: string, interactionType: AskItemActionInteractionType) => void;
  onCanonicalTask: (task: PropertyMaintenanceTask) => void;
  onUnavailable: (taskId: string) => void;
  onAccessLost: () => void;
  onClose: () => void;
}) {
  const [task, setTask] = useState<PropertyMaintenanceTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const callbacksRef = useRef({ onCanonicalTask, onUnavailable, onAccessLost });
  callbacksRef.current = { onCanonicalTask, onUnavailable, onAccessLost };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setTask(null);
    api.getMaintenanceTask(taskId)
      .then((response) => {
        if (!active) return;
        if (!response.success || !response.data) throw new Error(response.message || 'This maintenance task is unavailable.');
        if (expectedPropertyId && response.data.propertyId !== expectedPropertyId) {
          throw new Error('This task no longer belongs to the home used for this conversation.');
        }
        setTask(response.data);
        callbacksRef.current.onCanonicalTask(response.data);
      })
      .catch((caught) => {
        if (!active) return;
        const status = errorStatus(caught);
        if (status === 401 || status === 403) {
          callbacksRef.current.onAccessLost();
          return;
        }
        callbacksRef.current.onUnavailable(taskId);
        setError(status === 404 ? 'TASK_NOT_FOUND' : 'REVALIDATION_FAILED');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [expectedPropertyId, taskId]);

  useEffect(() => {
    if (!loading) headingRef.current?.focus();
  }, [loading]);

  const actions = actionsForCanonicalStatus(fallbackItem.actions ?? [], task?.status);
  return (
    <aside className="border-t border-teal-100 bg-teal-50/40 p-4" aria-labelledby={`maintenance-detail-${taskId}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">Task detail</p>
          <h4 ref={headingRef} tabIndex={-1} id={`maintenance-detail-${taskId}`} className="mt-1 text-lg font-semibold text-slate-950 outline-none">{task?.title ?? fallbackItem.title}</h4>
        </div>
        <button type="button" onClick={onClose} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-white" aria-label={`Close task detail for ${fallbackItem.title}`}><X className="h-4 w-4" /></button>
      </div>
      {loading && <p className="mt-4 flex items-center gap-2 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading the current maintenance record…</p>}
      {error && <div className="mt-4 rounded-xl border border-amber-200 bg-white p-3" role="alert"><p className="text-sm font-semibold text-amber-900">{error === 'TASK_NOT_FOUND' ? 'Task no longer exists' : 'Could not verify the current task'}</p><p className="mt-1 text-sm text-slate-700">{error === 'TASK_NOT_FOUND' ? 'This task was removed after the Ask result was created.' : 'The current canonical record could not be loaded. Actions for this task are unavailable until the result is refreshed.'}</p><p className="mt-2 text-xs text-slate-500">The conversation remains available. Refresh this Ask result to reconcile with Maintenance.</p></div>}
      {task && <>
        {task.description && <p className="mt-3 text-sm leading-6 text-slate-700">{task.description}</p>}
        <dl className="mt-4 grid gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-xs text-slate-500">Status</dt><dd className="mt-0.5 font-medium text-slate-900">{fieldLabel(task.status)}</dd></div>
          <div><dt className="text-xs text-slate-500">Priority</dt><dd className="mt-0.5 font-medium text-slate-900">{fieldLabel(task.priority)}</dd></div>
          <div><dt className="text-xs text-slate-500">Due</dt><dd className="mt-0.5 font-medium text-slate-900">{formatDate(task.nextDueDate)}</dd></div>
          <div><dt className="text-xs text-slate-500">Completed</dt><dd className="mt-0.5 font-medium text-slate-900">{formatDate(task.completedAt ?? task.lastCompletedDate)}</dd></div>
          <div><dt className="text-xs text-slate-500">Recurrence</dt><dd className="mt-0.5 font-medium text-slate-900">{task.isRecurring ? fieldLabel(task.frequency) : 'Does not repeat'}</dd></div>
          <div><dt className="text-xs text-slate-500">Home system</dt><dd className="mt-0.5 font-medium text-slate-900">{fieldLabel(task.assetType ?? task.serviceCategory)}</dd></div>
          <div><dt className="text-xs text-slate-500">Estimated cost</dt><dd className="mt-0.5 font-medium text-slate-900">{formatMoney(task.estimatedCost)}</dd></div>
          <div><dt className="text-xs text-slate-500">Actual cost</dt><dd className="mt-0.5 font-medium text-slate-900">{formatMoney(task.actualCost)}</dd></div>
          <div><dt className="text-xs text-slate-500">Source</dt><dd className="mt-0.5 font-medium text-slate-900">{fieldLabel(task.source)}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-slate-500">Current canonical record · updated {formatDate(task.updatedAt)}</p>
        {actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{actions.map((action) => <button key={action.id} type="button" disabled={disabled} className={cn('min-h-10 rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50', action.style === 'PRIMARY' ? 'bg-teal-700 text-white' : 'border border-slate-200 bg-white text-slate-800')} onClick={() => onAction(fallbackItem.entityType, fallbackItem.id, action.message, action.operationId, action.interactionType)}>{action.label}</button>)}</div>}
      </>}
    </aside>
  );
}

export function MaintenanceResultList({ block, propertyId, disabled, onFilter, onPage, onAction, onAccessLost, link }: {
  block: Block;
  propertyId?: string;
  disabled: boolean;
  onFilter: (message: string) => void;
  onPage: (sectionId: string, direction: 'NEXT' | 'PREVIOUS') => void;
  onAction: (entityType: string | null | undefined, entityId: string, message: string, operationId: string, interactionType: AskItemActionInteractionType) => void;
  onAccessLost: () => void;
  link: (href: string, label: ReactNode) => ReactNode;
}) {
  const controls = useContext(ResultViewContext);
  const [localDetailTaskId, setLocalDetailTaskId] = useState<string | null>(null);
  const [unavailableTaskIds, setUnavailableTaskIds] = useState<Set<string>>(() => new Set());
  const [canonicalStatuses, setCanonicalStatuses] = useState<Record<string, string>>({});
  useEffect(() => {
    setUnavailableTaskIds(new Set());
    setCanonicalStatuses({});
  }, [block]);
  const select = (id: string) => controls?.change((view) => ({ ...view, selectedTaskId: view.selectedTaskId === id ? null : id }));
  const detailTaskId = controls ? controls.detailIdFor(block.id) : localDetailTaskId;
  const detailItem = block.sections.flatMap((section) => section.items).find((item) => item.id === detailTaskId);
  const openDetail = (item: Item) => {
    if (controls) controls.openDetail(block.id, item.id);
    else setLocalDetailTaskId(item.id);
  };
  const closeDetail = () => {
    const closingId = detailTaskId;
    if (controls) controls.closeDetail();
    else setLocalDetailTaskId(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-maintenance-detail-trigger="${CSS.escape(closingId ?? '')}"]`)?.focus());
  };

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="border-b border-slate-100 p-4">
      <h3 className="font-semibold text-slate-950">{block.title}</h3>
      {block.description && <p className="mt-1 text-xs text-slate-500">{block.description}</p>}
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Maintenance filters">
        {block.filters.map((filter) => <button key={filter.id} type="button" disabled={disabled || filter.active} aria-pressed={filter.active}
          onClick={() => onFilter(filter.message)} className={cn('min-h-10 rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-60', filter.active ? 'bg-teal-700 text-white' : 'bg-white text-slate-700')}>{filter.label}</button>)}
      </div>
    </div>
    {block.sections.map((section) => {
      const offset = section.offset ?? 0;
      const visible = controls?.view.visibleCounts[section.id] ?? 5;
      return <div key={section.id} className="border-b border-slate-100 p-4">
        <h4 className="font-semibold">{section.title} · {section.count}</h4>
        {section.items.length === 0 && <p className="mt-2 text-sm text-slate-500">No matching tasks.</p>}
        <ul className="mt-3 space-y-3">
          {section.items.slice(0, controls ? visible : section.items.length).map((item) => {
            const selected = controls?.view.selectedTaskId === item.id;
            const expanded = !controls || controls.view.expandedRows.includes(item.id);
            const actions = unavailableTaskIds.has(item.id)
              ? []
              : actionsForCanonicalStatus(item.actions ?? [], canonicalStatuses[item.id]);
            return <li key={item.id} data-ask-task-id={item.id} tabIndex={-1} className={cn('rounded-xl border p-3 outline-offset-2', selected ? 'border-teal-600 bg-teal-50' : 'border-transparent bg-slate-50')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" data-maintenance-detail-trigger={item.id} data-ask-detail-trigger={item.id} data-ask-detail-block={block.id} disabled={disabled} aria-expanded={detailTaskId === item.id} aria-controls={`maintenance-detail-${item.id}`} onClick={() => openDetail(item)} className="min-h-10 text-left font-medium text-slate-950 underline-offset-4 hover:text-teal-800 hover:underline disabled:opacity-60">{item.title}</button>
                {item.status && <span className="text-xs text-slate-600">{item.status.replace(/_/g, ' ')}</span>}
              </div>
              <p className="mt-1 text-xs text-slate-600">{item.meta.join(' · ')}</p>
              {controls && <div className="mt-2 flex gap-2">
                <button type="button" disabled={disabled} aria-pressed={selected} onClick={() => select(item.id)} className="min-h-10 rounded border px-2 text-xs">{selected ? 'Selected' : 'Select task'}<span className="sr-only"> {item.title}</span></button>
                <button type="button" disabled={disabled} aria-expanded={expanded} onClick={() => controls.change((view) => ({ ...view, expandedRows: expanded ? view.expandedRows.filter((id) => id !== item.id) : [...view.expandedRows, item.id] }))} className="min-h-10 rounded border px-2 text-xs">{expanded ? 'Hide details' : 'Show details'}<span className="sr-only"> {item.title}</span></button>
              </div>}
              {expanded && item.description && <p className="mt-2 text-sm text-slate-600">{item.description}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {actions.map((action) => <button key={action.id} type="button" disabled={disabled} className="min-h-10 rounded border bg-white px-2 text-xs disabled:opacity-50" onClick={() => {
                  controls?.change((view) => ({ ...view, selectedTaskId: item.id }));
                  onAction(item.entityType, item.id, action.message, action.operationId, action.interactionType);
                }}>{action.label}</button>)}
              </div>
            </li>;
          })}
        </ul>
        {controls && visible < section.items.length && <button type="button" disabled={disabled} className="mt-3 min-h-10 text-sm font-semibold text-teal-800" onClick={() => controls.change((view) => ({ ...view, visibleCounts: { ...view.visibleCounts, [section.id]: Math.min(section.items.length, visible + 5) } }))}>Show more {section.title.toLowerCase()} tasks ({offset + Math.min(visible, section.items.length)} of {section.count} reached)</button>}
        {(offset > 0 || offset + section.items.length < section.count) && <nav className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3" aria-label={`${section.title} pages`}>
          <p className="text-xs text-slate-500">Server results {section.items.length ? offset + 1 : 0}–{offset + section.items.length} of {section.count}</p>
          <div className="flex gap-2">
            {offset > 0 && <button type="button" disabled={disabled} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50" onClick={() => onPage(section.id, 'PREVIOUS')}>Previous page<span className="sr-only"> of {section.title}</span></button>}
            {offset + section.items.length < section.count && <button type="button" disabled={disabled} className="min-h-10 rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => onPage(section.id, 'NEXT')}>Next page<span className="sr-only"> of {section.title}</span></button>}
          </div>
        </nav>}
      </div>;
    })}
    {detailTaskId && detailItem && <MaintenanceTaskDetail key={detailTaskId} taskId={detailTaskId} expectedPropertyId={propertyId} fallbackItem={detailItem} disabled={disabled} onAction={onAction} onCanonicalTask={(task) => setCanonicalStatuses((current) => ({ ...current, [task.id]: task.status }))} onUnavailable={(taskId) => setUnavailableTaskIds((current) => new Set(current).add(taskId))} onAccessLost={onAccessLost} onClose={closeDetail} />}
    <div className="flex flex-wrap gap-3 p-4 text-sm font-semibold text-teal-800">{block.actions.map((action) => action.href && <span key={action.id}>{link(action.href, <>{action.label}<ExternalLink className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" /></>)}</span>)}</div>
  </section>;
}
