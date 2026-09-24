'use client';

import { type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import type { AskItemActionInteractionType, AskPresentationBlock } from '@/features/ask/types';
import { ResultViewContext } from '@/features/ask/useResultView';
import { api } from '@/lib/api/client';
import type { InspectionFinding } from '@/types';
import { cn } from '@/lib/utils';
import type { AskBatchDecision, AskDeckBatch } from '@/features/ask/types';
import { CardDeckView } from './patterns/CardDeckView';
import { DetailSheetFrame } from './patterns/PatternParts';

type Block = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
type Item = Block['sections'][number]['items'][number];
type ItemAction = NonNullable<Item['actions']>[number];
type OnAction = (entityType: string | null | undefined, entityId: string, message: string, operationId: string, interactionType: AskItemActionInteractionType) => void;

// The actions the finding's LIVE state allows, mirroring inspectionHub.service: accepting as work needs an OPEN finding
// not already accepted; a dismissed or resolved finding cannot be dismissed or resolved again. The server re-checks.
export function findingActionsForLiveState(actions: ItemAction[], finding: Pick<InspectionFinding, 'status' | 'workDisposition'>): ItemAction[] {
  const closed = finding.status === 'DISMISSED' || finding.status === 'RESOLVED';
  return actions.filter((action) => {
    switch (action.id) {
      case 'finding-accept': return finding.status === 'OPEN' && finding.workDisposition !== 'ACCEPTED';
      case 'finding-dismiss':
      case 'finding-resolve': return !closed;
      default: return false;
    }
  });
}

function errorStatus(error: unknown): number | null {
  return error && typeof error === 'object' && typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : null;
}
// A deleted report is the service's coded 404 (NOT_FOUND); propertyAuthMiddleware's access denial is an uncoded 404.
function errorCode(error: unknown): string | null {
  const payload = error && typeof error === 'object' ? (error as { payload?: unknown }).payload : null;
  const code = payload && typeof payload === 'object' ? (payload as { error?: { code?: unknown } }).error?.code : null;
  return typeof code === 'string' ? code : null;
}

const label = (value: string | null | undefined) => value ? value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase()) : 'Not recorded';
const cost = (low?: number, high?: number) => {
  if (!low && !high) return 'Not estimated';
  const fmt = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return low && high ? `${fmt(low)} – ${fmt(high)}` : fmt((low ?? high)!);
};

// Inspection-hub capability-card slice (FRD v1.43). There is no single-finding GET, so the finding is re-read through
// its report's canonical findings list (GET /inspection-hub/reports/:reportId/findings, which the report page uses).
function FindingDetail({ item, expectedPropertyId, disabled, onAction, onAccessLost, onClose, link }: {
  item: Item;
  expectedPropertyId?: string;
  disabled?: boolean;
  onAction?: OnAction;
  onAccessLost: () => void;
  onClose: () => void;
  link: (href: string, label: ReactNode) => ReactNode;
}) {
  const [finding, setFinding] = useState<InspectionFinding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'NOT_FOUND' | 'REVALIDATION_FAILED' | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const callbacksRef = useRef({ onAccessLost });
  callbacksRef.current = { onAccessLost };

  useEffect(() => {
    if (!expectedPropertyId || !item.parentId) {
      setLoading(false);
      setError('REVALIDATION_FAILED');
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    setFinding(null);
    api.listInspectionFindings(expectedPropertyId, item.parentId)
      .then((findings) => {
        if (!active) return;
        const live = Array.isArray(findings) ? findings.find((candidate) => candidate.id === item.id) : undefined;
        if (live) setFinding(live);
        else setError('NOT_FOUND');
      })
      .catch((caught) => {
        if (!active) return;
        const status = errorStatus(caught);
        if (status === 404 && errorCode(caught) === 'NOT_FOUND') { setError('NOT_FOUND'); return; }
        if (status === 401 || status === 403 || status === 404) { callbacksRef.current.onAccessLost(); return; }
        setError('REVALIDATION_FAILED');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [expectedPropertyId, item.id, item.parentId]);

  useEffect(() => {
    if (!loading) headingRef.current?.focus();
  }, [loading]);

  const actions = finding && onAction ? findingActionsForLiveState(item.actions ?? [], finding) : [];

  return (
    <aside className="border-t border-teal-100 bg-teal-50/40 p-4" aria-labelledby={`finding-detail-${item.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">Inspection finding</p>
          <h4 ref={headingRef} tabIndex={-1} id={`finding-detail-${item.id}`} className="mt-1 text-lg font-semibold text-slate-950 outline-none">{finding ? `${label(finding.homeSystem)}${finding.location ? ` · ${finding.location}` : ''}` : item.title}</h4>
        </div>
        <button type="button" onClick={onClose} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-white" aria-label={`Close finding detail for ${item.title}`}><X className="h-4 w-4" /></button>
      </div>
      {loading && <p className="mt-4 flex items-center gap-2 text-sm text-slate-600" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading the current finding…</p>}
      {error && <div className="mt-4 rounded-xl border border-amber-200 bg-white p-3" role="alert">
        <p className="text-sm font-semibold text-amber-900">{error === 'NOT_FOUND' ? 'Finding no longer exists' : 'Could not verify the current finding'}</p>
        <p className="mt-1 text-sm text-slate-700">{error === 'NOT_FOUND' ? 'This finding or its report was removed after the Ask result was created.' : 'The current inspection record could not be loaded.'}</p>
        <p className="mt-2 text-xs text-slate-500">The conversation remains available. Refresh this Ask result to reconcile with Inspection Hub.</p>
      </div>}
      {finding && <>
        <p className="mt-3 text-sm leading-6 text-slate-700">{finding.inspectorDescription}</p>
        {finding.inspectorRecommendation && <p className="mt-1 text-sm leading-6 text-slate-600">Inspector recommends: {finding.inspectorRecommendation}</p>}
        {finding.aiInterpretation && <p className="mt-1 text-sm leading-6 text-slate-600">{finding.aiInterpretation}</p>}
        <dl className="mt-4 grid gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-xs text-slate-500">Severity</dt><dd className="mt-0.5 font-medium text-slate-900">{label(finding.severity)}</dd></div>
          <div><dt className="text-xs text-slate-500">Condition</dt><dd className="mt-0.5 font-medium text-slate-900">{label(finding.conditionRating)}</dd></div>
          <div><dt className="text-xs text-slate-500">Status</dt><dd className="mt-0.5 font-medium text-slate-900">{label(finding.status)}</dd></div>
          <div><dt className="text-xs text-slate-500">Work</dt><dd className="mt-0.5 font-medium text-slate-900">{label(finding.workDisposition)}</dd></div>
          <div><dt className="text-xs text-slate-500">Estimated cost</dt><dd className="mt-0.5 font-medium text-slate-900">{cost(finding.estimatedCostCentsLow, finding.estimatedCostCentsHigh)}</dd></div>
          {finding.resolutionMethod && <div><dt className="text-xs text-slate-500">Resolved by</dt><dd className="mt-0.5 font-medium text-slate-900">{label(finding.resolutionMethod)}</dd></div>}
        </dl>
        {actions.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{actions.map((action) => <button key={action.id} type="button" disabled={disabled} data-finding-action={action.id}
          className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
          onClick={() => onAction?.(item.entityType, item.id, action.message, action.operationId, action.interactionType)}>{action.label}</button>)}</div>}
        <p className="mt-3 text-xs text-slate-500">
          Photos, edits to the finding, other work dispositions and repair negotiation are on the report page.{' '}
          {item.href && link(item.href, <>Open the report<ExternalLink className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" /></>)}
        </p>
      </>}
    </aside>
  );
}

// Renders INSPECTION_FINDINGS's inspection-findings block (FRD v1.43).
// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (IW-PRES-015, FRD v1.75): the server-declared card deck. Its cards carry each
// finding's allowed actions; Accept as work and Dismiss are collected and confirmed together. Details opens the same
// live-record detail in the drawer or bottom sheet, read-only there so every decision goes through the deck.
export type InspectionFindingDeck = { swipeRightActionId: string | null; swipeLeftActionId: string | null; batch: AskDeckBatch | null; onBatch?: (decisions: AskBatchDecision[]) => void };

export function InspectionFindingResultList({ block, propertyId, disabled, onAction, onAccessLost, link, deck = null, onChooseLayout }: {
  block: Block;
  propertyId?: string;
  disabled?: boolean;
  onAction?: OnAction;
  onAccessLost: () => void;
  link: (href: string, label: ReactNode) => ReactNode;
  deck?: InspectionFindingDeck | null;
  onChooseLayout?: (layout: 'LIST' | 'DECK') => void;
}) {
  const controls = useContext(ResultViewContext);
  const [localDetailId, setLocalDetailId] = useState<string | null>(null);
  const detailId = controls ? controls.detailIdFor(block.id) : localDetailId;
  const detailItem = block.sections.flatMap((section) => section.items).find((item) => item.id === detailId);
  const openDetail = (item: Item) => {
    if (controls) controls.openDetail(block.id, item.id);
    else setLocalDetailId(item.id);
  };
  const closeDetail = () => {
    const closingId = detailId;
    if (controls) controls.closeDetail();
    else setLocalDetailId(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-finding-detail-trigger="${CSS.escape(closingId ?? '')}"]`)?.focus());
  };

  const layoutSwitch = onChooseLayout && <div className="mt-3 inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1" role="group" aria-label={`View ${block.title}`}>
    {(['DECK', 'LIST'] as const).map((option) => <button key={option} type="button" aria-pressed={(deck ? 'DECK' : 'LIST') === option} onClick={() => onChooseLayout(option)}
      className={cn('min-h-8 rounded-lg px-2.5 text-xs font-semibold', (deck ? 'DECK' : 'LIST') === option ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-600 hover:bg-white')}>{option === 'DECK' ? 'One at a time' : 'List'}</button>)}
  </div>;
  const footer = <div className="flex flex-wrap gap-3 p-4 text-sm font-semibold text-teal-800">{block.actions.map((action) => action.href ? <span key={action.id}>{link(action.href, <>{action.label}<ExternalLink className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" /></>)}</span> : null)}</div>;

  if (deck && onAction) {
    return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white" data-display-pattern="deck">
      <div className="border-b border-slate-100 p-4">
        <h3 className="font-semibold text-slate-950">{block.title}</h3>
        {block.description && <p className="mt-1 text-xs text-slate-500">{block.description}</p>}
        {layoutSwitch}
      </div>
      <CardDeckView items={block.sections.flatMap((section) => section.items)} swipeRightActionId={deck.swipeRightActionId} swipeLeftActionId={deck.swipeLeftActionId}
        batch={deck.batch} onBatch={deck.onBatch} onItemAction={onAction} disabled={Boolean(disabled)} onOpenDetail={openDetail} />
      <DetailSheetFrame open={Boolean(detailId && detailItem)} onOpenChange={(open) => { if (!open) closeDetail(); }} title={detailItem ? `Finding detail: ${detailItem.title}` : 'Finding detail'}>
        {detailId && detailItem && <FindingDetail key={detailId} item={detailItem} expectedPropertyId={propertyId} disabled={disabled} onAccessLost={onAccessLost} onClose={closeDetail} link={link} />}
      </DetailSheetFrame>
      {footer}
    </section>;
  }

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="border-b border-slate-100 p-4">
      <h3 className="font-semibold text-slate-950">{block.title}</h3>
      {block.description && <p className="mt-1 text-xs text-slate-500">{block.description}</p>}
      {layoutSwitch}
    </div>
    {block.sections.map((section) => <div key={section.id} className="border-b border-slate-100 p-4">
      <h4 className="font-semibold">{section.title} · {section.count}</h4>
      <ul className="mt-3 space-y-3">
        {section.items.map((item) => <li key={item.id} className={cn('rounded-xl border p-3', detailId === item.id ? 'border-teal-600 bg-teal-50' : 'border-transparent bg-slate-50')}>
          <button type="button" data-finding-detail-trigger={item.id} data-ask-detail-trigger={item.id} data-ask-detail-block={block.id} aria-expanded={detailId === item.id} aria-controls={`finding-detail-${item.id}`} onClick={() => openDetail(item)} className="min-h-10 text-left font-medium text-slate-950 underline-offset-4 hover:text-teal-800 hover:underline">{item.title}</button>
          {item.description && <p className="mt-1 text-sm text-slate-600">{item.description}</p>}
          {item.meta.length > 0 && <p className="mt-1 text-xs text-slate-600">{item.meta.join(' · ')}</p>}
        </li>)}
      </ul>
    </div>)}
    {detailId && detailItem && <FindingDetail key={detailId} item={detailItem} expectedPropertyId={propertyId} disabled={disabled} onAction={onAction} onAccessLost={onAccessLost} onClose={closeDetail} link={link} />}
    {footer}
  </section>;
}
