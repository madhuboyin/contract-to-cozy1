'use client';

import { ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { BellOff, BellRing, ChevronLeft, ChevronRight, ExternalLink, Loader2, Pencil, Wrench, X } from 'lucide-react';
import type { AskItemActionInteractionType, AskPresentationBlock } from '@/features/ask/types';
import { ResultViewContext } from '@/features/ask/useResultView';
import { api } from '@/lib/api/client';
import { MAINTENANCE_SERVICE_CATEGORY_FILTER_OPTIONS } from '@/lib/config/serviceCategoryMapping';
import { cn } from '@/lib/utils';
import { ActionLink } from './blocks/context';
import { DetailSheetFrame } from './patterns/PatternParts';
import { HorizontalTrack, ShelfCard } from './patterns/ShelvesView';
import { useCalmAnswer, useCalmChrome } from './blocks/calmContext';
import type { MaintenanceTaskFrequency, MaintenanceTaskPriority, MaintenanceTaskServiceCategory, PropertyMaintenanceTask } from '@/types';
import { CompactAskCard } from './CompactAskCard';

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

// Due dates are stored as UTC-midnight calendar dates; local formatting would show the previous day in US timezones.
function formatDate(value: Date | string | null): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  const calendarDate = date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0;
  return date.toLocaleDateString(undefined, calendarDate ? { timeZone: 'UTC' } : undefined);
}

function formatMoney(value: number | null): string {
  return value == null
    ? 'Not recorded'
    : new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function fieldLabel(value: string | null): string {
  return value ? value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase()) : 'Not recorded';
}

function taskSupportingFacts(item: Item): string[] {
  const timing = item.timingLabel ?? item.meta.find((fact) => /\b(due|overdue|today|tomorrow|day|week|month)\b/i.test(fact));
  const context = item.amountLabel ?? item.badgeLabel ?? item.meta.find((fact) => fact !== timing);
  return [timing, context].filter((fact): fact is string => Boolean(fact)).slice(0, 2);
}

function MaintenanceTaskDetail({ taskId, expectedPropertyId, fallbackItem, disabled, position, total, onPrevious, onNext, onAction, onCanonicalTask, onUnavailable, onAccessLost, onClose }: {
  taskId: string;
  expectedPropertyId?: string;
  fallbackItem: Item;
  disabled: boolean;
  position: number;
  total: number;
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
  onAction: (entityType: string | null | undefined, entityId: string, message: string, operationId: string, interactionType: AskItemActionInteractionType) => void;
  onCanonicalTask: (task: PropertyMaintenanceTask) => void;
  onUnavailable: (taskId: string) => void;
  onAccessLost: () => void;
  onClose: () => void;
}) {
  const [task, setTask] = useState<PropertyMaintenanceTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftDueDate, setDraftDueDate] = useState('');
  const [draftPriority, setDraftPriority] = useState<MaintenanceTaskPriority>('MEDIUM');
  const [draftFrequency, setDraftFrequency] = useState<MaintenanceTaskFrequency | 'NONE'>('NONE');
  const [draftServiceCategory, setDraftServiceCategory] = useState<MaintenanceTaskServiceCategory | ''>('');
  const [guidanceTopic, setGuidanceTopic] = useState<'WHY' | 'WHEN' | 'COST' | null>(null);
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
        setDraftDueDate(response.data.nextDueDate?.slice(0, 10) ?? '');
        setDraftPriority(response.data.priority);
        setDraftFrequency(response.data.isRecurring && response.data.frequency ? response.data.frequency : 'NONE');
        setDraftServiceCategory(response.data.serviceCategory ?? '');
        setEditing(false);
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
  const canEdit = actions.some((action) => action.operationId === 'MAINTENANCE_TASK_UPDATE' && action.interactionType === 'MUTATE_RECORD');
  const snoozeActive = Boolean(task?.snoozedUntil && new Date(task.snoozedUntil).getTime() > Date.now());
  const originalFrequency = task?.isRecurring && task.frequency ? task.frequency : 'NONE';
  const dueDateChanged = Boolean(task) && draftDueDate !== (task?.nextDueDate?.slice(0, 10) ?? '');
  const priorityChanged = Boolean(task) && draftPriority !== task?.priority;
  const frequencyChanged = Boolean(task) && draftFrequency !== originalFrequency;
  const serviceCategoryChanged = Boolean(task) && draftServiceCategory !== (task?.serviceCategory ?? '');
  const hasDraftChanges = dueDateChanged || priorityChanged || frequencyChanged || serviceCategoryChanged;
  const reviewDraftChanges = () => {
    if (!task || !hasDraftChanges) return;
    const changes = [
      ...(priorityChanged ? [`change priority to ${draftPriority.toLowerCase()} priority`] : []),
      ...(frequencyChanged ? [draftFrequency === 'NONE' ? 'make it a one-time task' : `set recurrence to ${draftFrequency.toLowerCase().replace(/_/g, ' ')}`] : []),
      ...(serviceCategoryChanged && draftServiceCategory ? [`set service category to ${draftServiceCategory.toLowerCase().replace(/_/g, ' ')}`] : []),
    ];
    const message = dueDateChanged
      ? `Reschedule this maintenance task to ${draftDueDate}${changes.length ? ` and ${changes.join(' and ')}` : ''}.`
      : `Update this maintenance task: ${changes.join(' and ')}.`;
    onAction(fallbackItem.entityType, fallbackItem.id, message, 'MAINTENANCE_TASK_UPDATE', 'MUTATE_RECORD');
  };
  return (
    <aside className="flex min-h-0 flex-1 flex-col bg-stone-50" aria-labelledby={`maintenance-detail-${taskId}`}>
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-stone-200 bg-stone-50/95 px-5 py-4 backdrop-blur sm:px-6">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">Task detail</p>
          <h4 ref={headingRef} tabIndex={-1} id={`maintenance-detail-${taskId}`} className="mt-1 text-xl font-semibold text-slate-950 outline-none sm:text-2xl">{task?.title ?? fallbackItem.title}</h4>
          <p className="mt-1 text-xs text-slate-500">Task {position} of {total} in this view</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" disabled={disabled || !onPrevious} onClick={() => onPrevious?.()} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-white disabled:opacity-30" aria-label="Previous maintenance task"><ChevronLeft className="h-5 w-5" /></button>
          <button type="button" disabled={disabled || !onNext} onClick={() => onNext?.()} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-white disabled:opacity-30" aria-label="Next maintenance task"><ChevronRight className="h-5 w-5" /></button>
          <button type="button" onClick={onClose} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-white" aria-label={`Close task detail for ${fallbackItem.title}`}><X className="h-5 w-5" /></button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
      {loading && <p className="flex items-center gap-2 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading the current maintenance record…</p>}
      {error && <div className="rounded-xl border border-amber-200 bg-white p-3" role="alert"><p className="text-sm font-semibold text-amber-900">{error === 'TASK_NOT_FOUND' ? 'Task no longer exists' : 'Could not verify the current task'}</p><p className="mt-1 text-sm text-slate-700">{error === 'TASK_NOT_FOUND' ? 'This task was removed after the Ask result was created.' : 'The current canonical record could not be loaded. Actions for this task are unavailable until the result is refreshed.'}</p><p className="mt-2 text-xs text-slate-500">The conversation remains available. Refresh this Ask result to reconcile with Maintenance.</p></div>}
      {task && <>
        {task.description && <p className="mt-3 text-sm leading-6 text-slate-700">{task.description}</p>}
        <div className="mt-6 flex items-center justify-between gap-3">
          <h5 className="text-lg font-semibold text-slate-950">Details</h5>
          {canEdit && !editing && <button type="button" disabled={disabled} onClick={() => setEditing(true)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:border-teal-300 disabled:opacity-50"><Pencil className="h-4 w-4" />Edit details</button>}
        </div>
        {canEdit && editing && <section aria-labelledby={`maintenance-edit-${taskId}`} className="mt-3 rounded-2xl border border-teal-200 bg-teal-50/60 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div><h6 id={`maintenance-edit-${taskId}`} className="font-semibold text-slate-950">Edit task details</h6><p className="mt-1 text-sm text-slate-600">Review and confirm these changes in Ask before anything is saved.</p></div>
            <button type="button" onClick={() => { setEditing(false); setDraftDueDate(task.nextDueDate?.slice(0, 10) ?? ''); setDraftPriority(task.priority); setDraftFrequency(originalFrequency); setDraftServiceCategory(task.serviceCategory ?? ''); }} className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-white" aria-label="Cancel editing task details"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-800">Next due date<input type="date" value={draftDueDate} onChange={(event) => setDraftDueDate(event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-950" /></label>
            <label className="text-sm font-medium text-slate-800">Priority<select value={draftPriority} onChange={(event) => setDraftPriority(event.target.value as MaintenanceTaskPriority)} className="mt-1 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-950"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label>
            <label className="text-sm font-medium text-slate-800">Recurrence<select value={draftFrequency} onChange={(event) => setDraftFrequency(event.target.value as MaintenanceTaskFrequency | 'NONE')} className="mt-1 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-950"><option value="NONE">One-time</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="SEMI_ANNUALLY">Semi-annually</option><option value="ANNUALLY">Annually</option></select></label>
            <label className="text-sm font-medium text-slate-800">Service category<select value={draftServiceCategory} onChange={(event) => setDraftServiceCategory(event.target.value as MaintenanceTaskServiceCategory | '')} className="mt-1 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-950"><option value="" disabled>Choose category</option>{MAINTENANCE_SERVICE_CATEGORY_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => { setEditing(false); setDraftDueDate(task.nextDueDate?.slice(0, 10) ?? ''); setDraftPriority(task.priority); setDraftFrequency(originalFrequency); setDraftServiceCategory(task.serviceCategory ?? ''); }} className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
            <button type="button" disabled={disabled || !hasDraftChanges || (dueDateChanged && !draftDueDate) || (serviceCategoryChanged && !draftServiceCategory)} onClick={reviewDraftChanges} className="min-h-10 rounded-xl bg-teal-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Review changes</button>
          </div>
        </section>}
        <dl className="mt-3 grid gap-x-5 gap-y-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-xs text-slate-500">Status</dt><dd className="mt-0.5 font-medium text-slate-900">{fieldLabel(task.status)}</dd></div>
          <div><dt className="text-xs text-slate-500">Priority</dt><dd className="mt-0.5 font-medium text-slate-900">{fieldLabel(task.priority)}</dd></div>
          <div><dt className="text-xs text-slate-500">Due</dt><dd className="mt-0.5 font-medium text-slate-900">{formatDate(task.nextDueDate)}</dd></div>
          <div><dt className="text-xs text-slate-500">Completed</dt><dd className="mt-0.5 font-medium text-slate-900">{formatDate(task.completedAt ?? task.lastCompletedDate)}</dd></div>
          <div><dt className="text-xs text-slate-500">Recurrence</dt><dd className="mt-0.5 font-medium text-slate-900">{task.isRecurring ? fieldLabel(task.frequency) : 'Does not repeat'}</dd></div>
          <div><dt className="text-xs text-slate-500">Category</dt><dd className="mt-0.5 font-medium text-slate-900">{fieldLabel(task.serviceCategory)}</dd></div>
          <div><dt className="text-xs text-slate-500">Home system</dt><dd className="mt-0.5 font-medium text-slate-900">{fieldLabel(task.assetType)}</dd></div>
          <div><dt className="text-xs text-slate-500">Estimated cost</dt><dd className="mt-0.5 font-medium text-slate-900">{formatMoney(task.estimatedCost)}</dd></div>
          <div><dt className="text-xs text-slate-500">Actual cost</dt><dd className="mt-0.5 font-medium text-slate-900">{formatMoney(task.actualCost)}</dd></div>
          <div><dt className="text-xs text-slate-500">Source</dt><dd className="mt-0.5 font-medium text-slate-900">{fieldLabel(task.source)}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-slate-500">Current canonical record · updated {formatDate(task.updatedAt)}</p>
        <section className="mt-6" aria-labelledby={`maintenance-guidance-${taskId}`}>
          <h5 id={`maintenance-guidance-${taskId}`} className="text-lg font-semibold text-slate-950">About this task</h5>
          <p className="mt-1 text-sm text-slate-600">Quick answers from this task’s saved record. These do not start a new chat turn.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {([
              ['WHY', 'Why is this on my list?'],
              ['WHEN', 'When should I act?'],
              ['COST', 'What cost is recorded?'],
            ] as const).map(([topic, label]) => <button key={topic} type="button" aria-expanded={guidanceTopic === topic} onClick={() => setGuidanceTopic((current) => current === topic ? null : topic)} className={cn('min-h-11 rounded-xl border px-3 py-2 text-left text-sm font-semibold', guidanceTopic === topic ? 'border-teal-300 bg-teal-50 text-teal-900' : 'border-slate-200 bg-white text-slate-800 hover:border-teal-300')}>{label}</button>)}
          </div>
          {guidanceTopic && <div className="mt-2 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700" role="status">
            {guidanceTopic === 'WHY' && (task.description || `This task was added from ${fieldLabel(task.source)}. No additional rationale is recorded.`)}
            {guidanceTopic === 'WHEN' && `${task.nextDueDate ? `It is due ${formatDate(task.nextDueDate)}` : 'No due date is recorded'}${task.isRecurring && task.frequency ? ` and repeats ${fieldLabel(task.frequency).toLowerCase()}` : ''}.${snoozeActive ? ` Reminders are snoozed until ${formatDate(task.snoozedUntil)}; the due date is unchanged.` : ''}`}
            {guidanceTopic === 'COST' && (task.estimatedCost == null && task.actualCost == null ? 'No estimated or actual cost is recorded for this task.' : `Estimated cost: ${formatMoney(task.estimatedCost)}. Actual cost: ${formatMoney(task.actualCost)}.`)}
          </div>}
        </section>
      </>}
      </div>
      {task && (actions.length > 0 || canEdit) && <footer className="sticky bottom-0 flex flex-wrap gap-2 border-t border-stone-200 bg-stone-50/95 px-5 py-3 backdrop-blur sm:px-6">
        {canEdit && <button type="button" disabled={disabled} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50" onClick={() => onAction(fallbackItem.entityType, fallbackItem.id, snoozeActive ? 'Resume reminders for this maintenance task.' : 'Snooze reminders for this maintenance task for one week.', 'MAINTENANCE_TASK_UPDATE', 'MUTATE_RECORD')}>{snoozeActive ? <BellRing className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}{snoozeActive ? 'Resume reminders' : 'Snooze 1 week'}</button>}
        {actions.map((action) => <button key={action.id} type="button" disabled={disabled} className={cn('min-h-11 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50', action.style === 'PRIMARY' ? 'bg-teal-800 text-white' : action.id === 'remove' ? 'border border-red-200 bg-white text-red-700' : 'border border-slate-200 bg-white text-slate-800')} onClick={() => onAction(fallbackItem.entityType, fallbackItem.id, action.message, action.operationId, action.interactionType)}>{action.label}</button>)}
      </footer>}
    </aside>
  );
}

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (IW-PRES-014, FRD v1.74): a shelf shows at most this many cards; the rest
// of the section (and its server pages) are one tap away in the list view.
export const MAINTENANCE_SHELF_CARD_LIMIT = 12;

// IW-CONV-002 (FRD v1.112): one primary action per turn. A calm answer keeps "View all in Maintenance" and "Create a task"; the
// generic "Open Maintenance" and "Maintenance Setup" links are dropped when the first two are present, and a repeated link is drawn once.
function calmMaintenanceActions<T extends { id: string; href?: string | null }>(actions: T[]): T[] {
  const hasViewAll = actions.some((action) => action.id === 'view-all-maintenance');
  const seen = new Set<string>();
  return actions.filter((action) => {
    if (hasViewAll && (action.id === 'open-maintenance' || action.id === 'open-maintenance-setup')) return false;
    if (action.href) { if (seen.has(action.href)) return false; seen.add(action.href); }
    return true;
  });
}

// ACUI-003: the answer's one dominant next step is the first workflow action it declares (for example "Create a task"); page links such
// as "View all in Maintenance" stay quiet text. With no workflow action there is no primary, and the links are all there is.
export function calmPrimaryMaintenanceActionId(actions: Array<{ id: string; interactionType?: string | null }>): string | null {
  return actions.find((action) => action.interactionType === 'START_WORKFLOW')?.id ?? null;
}

export function MaintenanceResultList({ block, propertyId, disabled, onFilter, onPage, onAction, onAccessLost, link, layout = 'LIST', onChooseLayout }: {
  block: Block;
  propertyId?: string;
  disabled: boolean;
  onFilter: (message: string) => void;
  onPage: (sectionId: string, direction: 'NEXT' | 'PREVIOUS') => void;
  onAction: (entityType: string | null | undefined, entityId: string, message: string, operationId: string, interactionType: AskItemActionInteractionType) => void;
  onAccessLost: () => void;
  link: (href: string, label: ReactNode) => ReactNode;
  // IW-PRES-014 / IW-PRES-022: the server-declared shelves layout, and the homeowner's switch between it and the list.
  layout?: 'LIST' | 'SHELVES';
  onChooseLayout?: (layout: 'LIST' | 'SHELVES') => void;
}) {
  const controls = useContext(ResultViewContext);
  // IW-CALM-002/009/010 (FRD v1.111): inside a calm answer this list drops its own frame, title, paging note and dividers.
  const calm = useCalmAnswer();
  const calmChrome = useCalmChrome();
  const calmPrimaryActionId = calm ? calmPrimaryMaintenanceActionId(block.actions) : null;
  const footerActions = calm ? calmMaintenanceActions(block.actions) : block.actions;
  const sectionFrame = calm ? 'py-1' : 'border-b border-slate-100 p-4';
  const [localDetailTaskId, setLocalDetailTaskId] = useState<string | null>(null);
  const [unavailableTaskIds, setUnavailableTaskIds] = useState<Set<string>>(() => new Set());
  const [canonicalStatuses, setCanonicalStatuses] = useState<Record<string, string>>({});
  useEffect(() => {
    setUnavailableTaskIds(new Set());
    setCanonicalStatuses({});
  }, [block]);
  const select = (id: string) => controls?.change((view) => ({ ...view, selectedTaskId: view.selectedTaskId === id ? null : id }));
  const detailTaskId = controls ? controls.detailIdFor(block.id) : localDetailTaskId;
  const detailItems = block.sections.flatMap((section) => section.items);
  const detailIndex = detailItems.findIndex((item) => item.id === detailTaskId);
  const detailItem = detailIndex >= 0 ? detailItems[detailIndex] : undefined;
  const detailSectionIndex = block.sections.findIndex((section) => section.items.some((item) => item.id === detailTaskId));
  const detailSection = detailSectionIndex >= 0 ? block.sections[detailSectionIndex] : undefined;
  const detailSectionItemIndex = detailSection?.items.findIndex((item) => item.id === detailTaskId) ?? -1;
  const openDetail = useCallback((item: Item) => {
    if (controls) controls.openDetail(block.id, item.id);
    else setLocalDetailTaskId(item.id);
  }, [block.id, controls]);
  const closeDetail = (restoreFocus = true) => {
    const closingId = detailTaskId;
    if (controls) controls.closeDetail();
    else setLocalDetailTaskId(null);
    if (restoreFocus) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-maintenance-detail-trigger="${CSS.escape(closingId ?? '')}"]`)?.focus());
  };
  useEffect(() => {
    const intent = controls?.view.detailPageIntent;
    if (!intent || intent.blockId !== block.id) return;
    const section = block.sections.find((candidate) => candidate.id === intent.sectionId);
    if (!section || (section.offset ?? 0) === intent.fromOffset || section.items.length === 0) return;
    const target = intent.direction === 'NEXT' ? section.items[0] : section.items[section.items.length - 1];
    controls.change((view) => ({ ...view, detailPageIntent: null }));
    openDetail(target);
  }, [block.id, block.sections, controls, openDetail]);
  const requestDetailPage = (sectionId: string, direction: 'NEXT' | 'PREVIOUS', fromOffset: number) => {
    controls?.change((view) => ({ ...view, detailPageIntent: { blockId: block.id, sectionId, direction, fromOffset } }));
    onPage(sectionId, direction);
  };
  const previousLoadedSection = detailSectionIndex > 0 ? [...block.sections.slice(0, detailSectionIndex)].reverse().find((section) => section.items.length > 0) : undefined;
  const nextLoadedSection = detailSectionIndex >= 0 ? block.sections.slice(detailSectionIndex + 1).find((section) => section.items.length > 0) : undefined;
  const previousDetail = detailSection && detailSectionItemIndex > 0
    ? () => openDetail(detailSection.items[detailSectionItemIndex - 1])
    : controls && detailSection && (detailSection.offset ?? 0) > 0
      ? () => requestDetailPage(detailSection.id, 'PREVIOUS', detailSection.offset ?? 0)
      : previousLoadedSection
        ? () => openDetail(previousLoadedSection.items[previousLoadedSection.items.length - 1])
        : null;
  const nextDetail = detailSection && detailSectionItemIndex >= 0 && detailSectionItemIndex < detailSection.items.length - 1
    ? () => openDetail(detailSection.items[detailSectionItemIndex + 1])
    : controls && detailSection && (detailSection.offset ?? 0) + detailSection.items.length < detailSection.count
      ? () => requestDetailPage(detailSection.id, 'NEXT', detailSection.offset ?? 0)
      : nextLoadedSection
        ? () => openDetail(nextLoadedSection.items[0])
        : null;

  // A drawer CTA starts a new Ask turn (explanation, date capture, review);
  // the workspace must not stay open over it, and focus belongs to that turn,
  // not the row that opened the workspace.
  const workspaceAction: typeof onAction = (...args) => { onAction(...args); closeDetail(false); };
  const taskDetail = (taskId: string, item: Item) => <MaintenanceTaskDetail key={taskId} taskId={taskId} expectedPropertyId={propertyId} fallbackItem={item} disabled={disabled}
    position={detailIndex + 1} total={detailItems.length}
    onPrevious={previousDetail}
    onNext={nextDetail}
    onAction={workspaceAction} onCanonicalTask={(task) => setCanonicalStatuses((current) => ({ ...current, [task.id]: task.status }))} onUnavailable={(unavailableId) => setUnavailableTaskIds((current) => new Set(current).add(unavailableId))} onAccessLost={onAccessLost} onClose={() => closeDetail()} />;

  return <section className={calm ? 'space-y-3' : 'overflow-hidden rounded-2xl border border-slate-200 bg-white'} data-display-pattern={calm ? 'priority-stack' : layout === 'SHELVES' ? 'shelves' : undefined}>
    <div className={calm ? 'flex flex-wrap items-center justify-between gap-2' : 'border-b border-slate-100 p-4'}>
      <h3 className={calm ? 'sr-only' : 'font-semibold text-slate-950'}>{block.title}</h3>
      {!calm && block.description && <p className="mt-1 text-xs text-slate-500">{block.description}</p>}
      {onChooseLayout && !calm && <div className="mt-3 inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1" role="group" aria-label={`View ${block.title}`}>
        {(['SHELVES', 'LIST'] as const).map((option) => <button key={option} type="button" aria-pressed={layout === option} onClick={() => onChooseLayout(option)}
          className={cn('min-h-8 rounded-lg px-2.5 text-xs font-semibold', layout === option ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-600 hover:bg-white')}>{option === 'SHELVES' ? 'Shelves' : 'List'}</button>)}
      </div>}
      <div className={cn(!calm && 'mt-3', calm ? 'flex flex-wrap gap-0.5' : 'flex flex-wrap gap-2')} role="group" aria-label="Maintenance filters">
        {block.filters.map((filter) => <button key={filter.id} type="button" disabled={disabled || filter.active} aria-pressed={filter.active}
          onClick={() => onFilter(filter.message)} className={cn(calm ? 'min-h-8 rounded-md px-2.5 py-1 text-sm disabled:opacity-100' : 'min-h-10 rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-60', calm ? (filter.active ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900') : (filter.active ? 'bg-teal-700 text-white' : 'bg-white text-slate-700'))}>{filter.label}</button>)}
      </div>
    </div>
    {calm && block.sections.map((section) => {
      const offset = section.offset ?? 0;
      const visible = Math.max(6, controls?.view.visibleCounts[section.id] ?? 6);
      const shown = section.items.slice(0, controls ? visible : section.items.length);
      return <section key={section.id} className="py-1" aria-labelledby={`maintenance-section-${section.id}`}>
        <div className="mb-2 flex items-baseline gap-2">
          <h4 id={`maintenance-section-${section.id}`} className="text-sm font-semibold text-slate-900">{section.title}</h4>
          <span className="text-xs text-slate-500">{section.count} {section.count === 1 ? 'task' : 'tasks'}</span>
        </div>
        {section.items.length === 0 ? <p className="py-2 text-sm text-slate-500">No matching tasks.</p> : <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((item) => {
            const selected = controls?.view.selectedTaskId === item.id;
            const facts = taskSupportingFacts(item);
            return <li key={item.id} data-ask-task-id={item.id} className="min-w-0">
              <CompactAskCard
                title={item.title}
                iconCategory="MAINTENANCE"
                fallbackIcon={Wrench}
                tone={item.tone === 'CRITICAL' ? 'CRITICAL' : item.tone === 'CAUTION' ? 'CAUTION' : item.tone === 'POSITIVE' ? 'POSITIVE' : 'DEFAULT'}
                selected={selected}
                badge={item.badgeLabel ? <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-700">{item.badgeLabel}</span> : undefined}
                meta={facts.length > 0 ? facts.join(' · ') : undefined}
                action={<button type="button" data-maintenance-detail-trigger={item.id} data-ask-detail-trigger={item.id} data-ask-detail-block={block.id}
                  disabled={disabled} aria-expanded={detailTaskId === item.id} aria-controls={`maintenance-detail-${item.id}`} onClick={() => openDetail(item)}
                  className="inline-flex min-h-10 items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-teal-800 hover:border-teal-300 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-50"
                  aria-label={`Review task: ${item.title}`}>Review</button>}
              />
            </li>;
          })}
        </ul>}
        {controls && visible < section.items.length && <button type="button" disabled={disabled} className="mt-2 min-h-10 text-sm font-semibold text-teal-800 disabled:opacity-50"
          onClick={() => controls.change((view) => ({ ...view, visibleCounts: { ...view.visibleCounts, [section.id]: Math.min(section.items.length, visible + 6) } }))}>
          Show {Math.min(6, section.items.length - visible)} more {section.title.toLowerCase()} tasks
        </button>}
        {(offset > 0 || offset + section.items.length < section.count) && <nav className="mt-2 flex flex-wrap items-center justify-between gap-2" aria-label={`${section.title} pages`}>
          <p className="text-xs text-slate-500">Showing {section.items.length ? offset + 1 : 0}–{offset + section.items.length} of {section.count}</p>
          <div className="flex gap-2">
            {offset > 0 && <button type="button" disabled={disabled} className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 disabled:opacity-50" onClick={() => onPage(section.id, 'PREVIOUS')}>Previous<span className="sr-only"> page of {section.title}</span></button>}
            {offset + section.items.length < section.count && <button type="button" disabled={disabled} className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 disabled:opacity-50" onClick={() => onPage(section.id, 'NEXT')}>Next<span className="sr-only"> page of {section.title}</span></button>}
          </div>
        </nav>}
      </section>;
    })}
    {!calm && layout === 'SHELVES' && block.sections.map((section) => {
      const offset = section.offset ?? 0;
      const shown = section.items.slice(0, MAINTENANCE_SHELF_CARD_LIMIT);
      const partial = shown.length < section.count;
      if (section.items.length === 0) {
        return <div key={section.id} className={sectionFrame}><h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">{section.title}</h4><p className="mt-2 text-sm text-slate-500">No matching tasks.</p></div>;
      }
      return <div key={section.id} className={sectionFrame} data-maintenance-shelf={section.id}>
        <HorizontalTrack label={section.title} countLabel={partial ? `Showing ${offset ? `${offset + 1}–${offset + shown.length}` : shown.length} of ${section.count}` : `${section.count} task${section.count === 1 ? '' : 's'}`}>
          {shown.map((item) => <ShelfCard key={item.id} item={item} disabled={disabled} selected={controls?.view.selectedTaskId === item.id}
            triggerProps={{ 'data-ask-task-id': item.id, 'data-maintenance-detail-trigger': item.id, 'data-ask-detail-trigger': item.id, 'data-ask-detail-block': block.id }}
            onOpen={() => openDetail(item)} />)}
          {partial && onChooseLayout && <div role="listitem" className="flex w-32 shrink-0 snap-start">
            <button type="button" onClick={() => onChooseLayout('LIST')} className="w-full rounded-xl border border-dashed border-slate-300 p-3 text-center text-xs font-semibold text-teal-700 hover:border-teal-400">See all {section.count} in the list</button>
          </div>}
        </HorizontalTrack>
      </div>;
    })}
    {!calm && layout === 'LIST' && block.sections.map((section) => {
      const offset = section.offset ?? 0;
      const visible = controls?.view.visibleCounts[section.id] ?? 5;
      return <div key={section.id} className={sectionFrame}>
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
          <p className="text-xs text-slate-500">{calmChrome ? 'Showing' : 'Server results'} {section.items.length ? offset + 1 : 0}–{offset + section.items.length} of {section.count}</p>
          <div className="flex gap-2">
            {offset > 0 && <button type="button" disabled={disabled} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50" onClick={() => onPage(section.id, 'PREVIOUS')}>Previous page<span className="sr-only"> of {section.title}</span></button>}
            {offset + section.items.length < section.count && <button type="button" disabled={disabled} className={cn('min-h-10 rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50', calm ? 'border border-slate-200 bg-white text-slate-800' : 'bg-teal-700 text-white')} onClick={() => onPage(section.id, 'NEXT')}>Next page<span className="sr-only"> of {section.title}</span></button>}
          </div>
        </nav>}
      </div>;
    })}
    <DetailSheetFrame variant="WORKSPACE" open={Boolean(detailTaskId && detailItem)} onOpenChange={(open) => { if (!open) closeDetail(); }} title={detailItem ? `Task detail: ${detailItem.title}` : 'Task detail'}>
      {detailTaskId && detailItem && taskDetail(detailTaskId, detailItem)}
    </DetailSheetFrame>
    {footerActions.some((action) => action.href || action.interactionType === 'START_WORKFLOW') && <div data-ask-action-footer="" className={cn('flex flex-wrap gap-2 text-sm font-semibold text-teal-800', !calm && 'px-4 py-3')}>{footerActions.map((action) => action.href ? <span key={action.id}>{link(action.href, <>{action.label}<ExternalLink className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" /></>)}</span> : action.interactionType === 'START_WORKFLOW' ? <ActionLink key={action.id} action={calm ? { ...action, style: action.id === calmPrimaryActionId ? 'PRIMARY' : 'SECONDARY' } : action} /> : null)}</div>}
  </section>;
}
