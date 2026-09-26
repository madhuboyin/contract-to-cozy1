'use client';

import { MutableRefObject, useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Pin, PinOff, RefreshCw, Send, Sparkles, ThumbsDown, ThumbsUp, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import type { AskAction, AskCapabilityPrompt, AskExecutionResponse, AskItemActionInteractionType } from '@/features/ask/types';
import { resolveItemActionDispatch } from '@/features/ask/interactionDispatch';
import { ResultRevalidationBoundary } from '../ResultRevalidationBoundary';
import { hasResponseContext, ResponseContextSummary } from '../EvidenceContextPanel';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { isCalmAdopter, useCalmAnswers } from '@/features/ask/calmAnswers';
import { AskBlockActionContext } from '../blocks/context';
import { CalmAnswerContext, CalmChromeContext } from '../blocks/calmContext';
import { BlockView } from '../blocks/registry';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import { canFoldResult, resultHeadline } from '@/features/ask/conversationView';
import { AskPromptAttribution, FOCUSABLE_SELECTOR, draftStorageKey } from './support';
import { ClarificationCard, ConfirmationCard, InlineCaptureCard, PendingOutcomeCard, PropertySelectionCard } from './CaptureCards';

// IW-CALM-002 (FRD v1.111): every domain list draws its own bordered frame; inside a calm answer the outer frame goes and the
// list's own section dividers stay, so no answer is a card holding cards.
const FRAMELESS_LISTS = '[&>section.overflow-hidden]:rounded-none [&>section.overflow-hidden]:border-0 [&>section.overflow-hidden]:bg-transparent [&>section.overflow-hidden>div]:px-0 [&>section.overflow-hidden>div:first-child>h3:first-child]:sr-only [&_section.overflow-hidden_h4]:text-xs [&_section.overflow-hidden_h4]:font-semibold [&_section.overflow-hidden_h4]:uppercase [&_section.overflow-hidden_h4]:tracking-wide [&_section.overflow-hidden_h4]:text-slate-500';

export function ExecutionFeedback({ executionId, propertyId, capabilities, calm = false }: {
  executionId: string;
  propertyId?: string;
  // IW-CALM-003 (FRD v1.111): a calm answer shows only the two rating buttons until one is used; no divider or label.
  calm?: boolean;
  capabilities: AskExecutionResponse['correctionCapabilities'];
}) {
  const [rating, setRating] = useState<'UP' | 'DOWN' | null>(null);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);

  const submit = async (nextRating: 'UP' | 'DOWN', nextComment?: string) => {
    setSaving(true); setError(null);
    try {
      const response = await api.submitAskFeedback(executionId, { rating: nextRating, comment: nextComment?.trim() || undefined });
      if (!response.success) throw new Error(response.message || 'Could not save feedback.');
      setRating(nextRating); setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save feedback.');
    } finally { setSaving(false); }
  };
  const requestCorrection = async (kind: 'HOME_RECORD' | 'INTENT' | 'ENTITY') => {
    setCorrecting(true); setError(null);
    try {
      const response = await api.requestAskCorrection(executionId, kind);
      if (!response.success || !response.data) throw new Error(response.message || 'Could not open the correction workflow.');
      window.location.assign(response.data.href);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open the correction workflow.');
      setCorrecting(false);
    }
  };

  return (
    <div className={cn('text-xs text-slate-500', !calm && 'border-t border-slate-100 pt-3')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn(calm && !saved && 'sr-only')}>{saved ? 'Thanks—your feedback was saved.' : 'Was this helpful?'}</span>
        <button type="button" disabled={saving} aria-label="Helpful response" aria-pressed={rating === 'UP'} onClick={() => void submit('UP')} className={cn('rounded-lg p-2 hover:bg-slate-100', rating === 'UP' && 'bg-teal-50 text-teal-700')}><ThumbsUp className="h-4 w-4" /></button>
        {/* Persists a bare "not helpful" vote immediately, the same as the
            thumbs-up button, instead of only marking the button visually
            pressed and waiting for a separate "Send feedback" click on the
            comment box below -- previously the vote looked saved (aria-
            pressed, highlighted) but was silently lost if the user
            navigated away before sending a comment. */}
        <button type="button" disabled={saving} aria-label="Not helpful response" aria-pressed={rating === 'DOWN'} onClick={() => void submit('DOWN')} className={cn('rounded-lg p-2 hover:bg-slate-100', rating === 'DOWN' && 'bg-amber-50 text-amber-700')}><ThumbsDown className="h-4 w-4" /></button>
        {capabilities.intent && <button type="button" disabled={correcting} onClick={() => void requestCorrection('INTENT')} className="font-semibold text-teal-700 hover:text-teal-800 disabled:opacity-50">{correcting ? 'Opening…' : 'That’s not what I meant'}</button>}
        {capabilities.entity && <button type="button" disabled={correcting} onClick={() => void requestCorrection('ENTITY')} className="font-semibold text-teal-700 hover:text-teal-800 disabled:opacity-50">Wrong item</button>}
        {capabilities.homeRecord && propertyId && <button type="button" disabled={correcting} onClick={() => void requestCorrection('HOME_RECORD')} className="ml-auto font-semibold text-teal-700 hover:text-teal-800 disabled:opacity-50">{correcting ? 'Opening…' : 'Correct home information'}</button>}
      </div>
      {rating === 'DOWN' && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1000} placeholder="What should be improved? (optional)" aria-label="Ask feedback details" className="min-h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800" />
          <button type="button" disabled={saving || !comment.trim()} onClick={() => void submit('DOWN', comment)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 font-semibold text-slate-700 disabled:opacity-50">Add detail</button>
        </div>
      )}
      {error && <p className="mt-2 text-red-700" role="alert">{error}</p>}
    </div>
  );
}

export function ExecutionCard({
  execution, isSuperseded, justUpdatedExecutionId, updateExecution, loading, ask, selectedPropertyId, setInput, visibleSuggestions, activeSessionRef, refreshIssue, refreshResult, refreshPending, onAccessLost, contextOpen, onOpenContext, folded = false, pinned = false, onToggleFold, onTogglePin, onEditQuestion,
}: {
  execution: AskExecutionResponse;
  isSuperseded: boolean;
  justUpdatedExecutionId: string | null;
  updateExecution: (updated: AskExecutionResponse) => void;
  loading: boolean;
  ask: (question: string, attribution?: AskPromptAttribution, promptContext?: AskCapabilityPrompt['context']) => Promise<void>;
  selectedPropertyId: string;
  setInput: (value: string) => void;
  visibleSuggestions: string[];
  // ASK_COZY_INTERACTION_MODEL_UI_FRD FRESH-003/CTX-002: the same ref ask()
  // already compares against to discard a response that outlived a
  // property/session switch. The explicit Refresh button needs the
  // identical guard -- it was calling updateExecution unconditionally.
  activeSessionRef: MutableRefObject<string>;
  // ASK_COZY_INTERACTION_MODEL_UI_FRD FRESH-001/HAND-003: seeds this card's
  // refresh-error state when the parent's own return-trip revalidation
  // (on landing back from Maintenance) already failed before this card
  // ever mounted, so that failure isn't silently invisible.
  refreshIssue?: { message: string; accessLost: boolean } | null;
  refreshResult: (execution: AskExecutionResponse) => Promise<void>;
  refreshPending: boolean;
  // External review [P1]: lets a child card (ConfirmationCard) trigger the
  // same access-lost redaction refreshResult's own catch already performs,
  // for its OWN failed request -- not only a refresh round trip.
  onAccessLost: (execution: Pick<AskExecutionResponse, 'sessionId' | 'property' | 'executionId'>) => void;
  contextOpen: boolean;
  onOpenContext: (trigger: HTMLButtonElement) => void;
  // IW-PRES-021 (FRD v1.95): folding and pinning only change what is shown; they never re-run the request.
  folded?: boolean;
  pinned?: boolean;
  onToggleFold?: () => void;
  onTogglePin?: () => void;
  // FRD v1.96: puts this result's question back in the composer to change and send again.
  onEditQuestion?: (question: string) => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const isJustUpdated = execution.executionId === justUpdatedExecutionId;
  // ASK_COZY_INTERACTION_MODEL_UI_FRD FRESH-001/RES-004 (ACT-001 REFRESH):
  // an explicit, homeowner-initiated revalidation, distinct from the
  // implicit refresh MAINT-005 triggers automatically after a mutation.
  const [refreshing, setRefreshing] = useState(false);
  // Controlled error state: return revalidation normally finishes AFTER this card mounts.
  const refreshError = refreshIssue?.message ?? null;
  const refreshAccessLost = Boolean(refreshIssue?.accessLost);
  const controls = useResultView(execution, !isSuperseded && !refreshAccessLost);
  // FRD v1.111 §11.11: the calm anatomy applies only to a domain that has adopted it, and only when the setting is on.
  const calmChrome = useCalmAnswers();
  const calm = calmChrome && isCalmAdopter(execution);
  const [showOriginal, setShowOriginal] = useState(false);
  // IW-CALM-006 (FRD v1.111): in the calm shell follow-up chips dock above the composer (FollowUpRow), not under each answer.
  const shownSuggestions = calmChrome ? [] : visibleSuggestions;
  const refresh = async () => {
    if (refreshing || refreshAccessLost) return;
    setRefreshing(true);
    try { await refreshResult(execution); } finally { setRefreshing(false); }
  };
  // ACT-003: "Unsupported actions fail visibly and safely." No item action
  // declares an UNSUPPORTED interactionType today (see
  // interactionDispatch.ts) -- this exists so the day one does (DISMISS/
  // REMIND_LATER once their domain policy lands; NAVIGATE once item
  // actions carry an href), it surfaces here instead of silently no-oping.
  const [itemActionIssue, setItemActionIssue] = useState<string | null>(null);
  const dispatchItemAction = (entityType: string | null | undefined, entityId: string, message: string, operationId: string, interactionType: AskItemActionInteractionType, documentId?: string, actionId?: string) => {
    setItemActionIssue(null);
    const dispatch = resolveItemActionDispatch(interactionType);
    if (dispatch.kind === 'ASK_WITH_ENTITY_CONTEXT') {
      void ask(message, undefined, {
        entityType: entityType ?? undefined, entityId, sourceExecutionId: execution.executionId,
        // ACT-001/ACT-003: every declared item action forces its own
        // operationId, regardless of interactionType. The declaring
        // server code already knows exactly which operation applies --
        // forcing it doesn't skip reasoning for a CONVERSATION_CONTINUE
        // explanation (GROUNDED_GUIDANCE still generates a real answer),
        // it only skips the operation-*selection* step, which free-text
        // pattern matching could otherwise get wrong (e.g. a task titled
        // "Annual maintenance inspection" would make "Why is ... this
        // important?" accidentally match the generic maintenance
        // pattern and misroute away from grounded guidance).
        operationId,
        // Evidence upload design (approved 2026-09-22): undefined for every action except HomeEventResultList's
        // "Attach evidence" control, which already uploaded the file and resolved this id before calling here.
        documentId,
        // FRD v1.41: undefined except for RadarEventDetail's "Plan this action" (the recommended action's code).
        actionId,
      });
    } else if (dispatch.kind === 'ASK_FILTER_ONLY') {
      void ask(message, undefined, { sourceExecutionId: execution.executionId });
    } else if (dispatch.kind === 'REFRESH') {
      void refresh();
    } else {
      setItemActionIssue(dispatch.reason);
    }
  };
  const dispatchBlockAction = (action: AskAction) => {
    setItemActionIssue(null);
    if (action.interactionType !== 'START_WORKFLOW' || !action.message || !action.operationId) {
      setItemActionIssue('This action is not available inline yet. Use the traditional navigation option instead.');
      return;
    }
    void ask(action.message, undefined, {
      sourceExecutionId: execution.executionId,
      operationId: action.operationId,
      capabilityId: action.capabilityId,
    });
  };
  // ASK_COZY_INTERACTION_MODEL_UI_FRD ACCESS-003: once nothing else is
  // claiming focus for this turn (no pending property selection, capture,
  // clarification or confirmation), the result just settled. Without this,
  // a completed ConfirmationCard unmounts (its Confirm button removed from
  // the DOM) and focus silently reverts to <body> -- a keyboard/screen-
  // reader user loses their place entirely after completing a row action.
  const resultSettled = execution.status !== 'NEEDS_PROPERTY'
    && !execution.confirmation && !execution.clarification && execution.captureRequests.length === 0;
  useEffect(() => {
    if (!isJustUpdated || !resultSettled) return;
    // The calm shell moves focus to the answer's own heading, not to its first button, so no control shows a focus ring on arrival.
    const target = calmChrome ? headingRef.current : bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? headingRef.current;
    target?.focus({ preventScroll: true });
    // Re-runs only when this execution's own settled content actually
    // changes (a real status/result transition), not on every unrelated
    // re-render -- isJustUpdated/resultSettled are read fresh from the
    // enclosing closure each time this fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execution.status, execution.updatedAt]);

  // ASK_COZY_INTERACTION_MODEL_UI_FRD RES-001/RES-003/RES-004: a superseded
  // filter-refinement result must not disappear (RES-001: "refresh must not
  // silently overwrite its meaning") but must not duplicate a full list
  // either (MAINT-003). The question stays visible as ordinary conversation
  // history; the response collapses behind a disclosure instead of
  // rendering live, actionable content for data that is no longer current.
  if (refreshAccessLost) return <ResultRevalidationBoundary executionId={execution.executionId} issue={refreshIssue}>{null}</ResultRevalidationBoundary>;

  if (isSuperseded) {
    // IW-CONV-003/008 (FRD v1.112): in the calm shell an older version is a one-line stub that opens the same calm presentation,
    // in reduced emphasis and without a frame; it is never a second full copy of the previous look.
    return (
      <CalmChromeContext.Provider value={calmChrome}><CalmAnswerContext.Provider value={calm}>
        <article id={`ask-execution-${execution.executionId}`} className="scroll-mt-28 space-y-3 lg:scroll-mt-32">
          <div className="ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-md bg-slate-900 px-4 py-3 text-sm leading-6 text-white">{execution.question}</div>
          <details className={calmChrome ? undefined : 'rounded-2xl border border-slate-200 bg-slate-50/70 p-3'}>
            <summary className={calmChrome ? 'w-fit cursor-pointer list-none rounded-md px-1 text-xs text-slate-500 hover:text-slate-800 [&::-webkit-details-marker]:hidden' : 'cursor-pointer text-xs font-semibold text-slate-500'}>{calmChrome ? 'Earlier version of this answer · show' : 'Superseded by a refinement below · view original response'}</summary>
            <div className={cn('mt-3 space-y-3 opacity-75', calmChrome && FRAMELESS_LISTS)}>
              {execution.blocks.map((block) => <BlockView key={block.id} block={block} executionId={execution.executionId} propertyId={execution.property?.id} itemActionsDisabled onItemAction={() => undefined} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />)}
            </div>
          </details>
        </article>
      </CalmAnswerContext.Provider></CalmChromeContext.Provider>
    );
  }

  return (
    <ResultRevalidationBoundary executionId={execution.executionId} issue={refreshIssue}><ResultViewContext.Provider value={controls}><CalmChromeContext.Provider value={calmChrome}><CalmAnswerContext.Provider value={calm}><article id={`ask-execution-${execution.executionId}`} className="scroll-mt-28 space-y-3 lg:scroll-mt-32" onFocusCapture={() => { window.sessionStorage.setItem(`ctc:ask-return-execution:${execution.sessionId}`, execution.executionId); }} onClickCapture={(event) => {
      const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
      if (!link) return;
      const url = new URL(link.href, window.location.origin);
      if (url.origin !== window.location.origin || !url.pathname.startsWith('/dashboard/')) return;
      const scrollOffset = event.currentTarget.getBoundingClientRect().top;
      controls.change((view) => ({ ...view, scrollOffset, selectedTaskId: url.searchParams.get('taskId') ?? view.selectedTaskId }));
    }}>
      <div className="ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-md bg-slate-900 px-4 py-3 text-sm leading-6 text-white">{execution.question}</div>
      {onEditQuestion && <div className="flex justify-end"><button type="button" disabled={loading} onClick={() => onEditQuestion(execution.question)} aria-label="Change and resend this question" className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100">Change and resend</button></div>}
      <div className={calmChrome ? 'space-y-3' : 'space-y-3 rounded-3xl border border-slate-200 bg-white/60 p-3 shadow-sm sm:p-4'}>
        {calmChrome ? <div className="flex items-center justify-between gap-2">
          <h2 ref={headingRef} tabIndex={-1} className="flex items-center gap-2 text-xs font-semibold text-teal-800 focus:outline-none"><span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full bg-teal-700 text-[11px] font-bold text-white">C</span><span>Cozy<span className="sr-only"> response</span></span></h2>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" aria-label="Response options" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[13rem]">
              <DropdownMenuLabel className="text-xs font-normal text-slate-500">Updated {new Date(execution.updatedAt).toLocaleString()}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={refreshing || refreshPending || loading || refreshAccessLost} onSelect={() => void refresh()}><RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />{refreshing || refreshPending ? 'Refreshing…' : 'Refresh'}</DropdownMenuItem>
              {onTogglePin && <DropdownMenuItem onSelect={onTogglePin}>{pinned ? <PinOff className="mr-2 h-3.5 w-3.5" aria-hidden="true" /> : <Pin className="mr-2 h-3.5 w-3.5" aria-hidden="true" />}{pinned ? 'Unpin' : 'Pin'}</DropdownMenuItem>}
              {onToggleFold && canFoldResult(execution) && <DropdownMenuItem onSelect={onToggleFold}>{folded ? <ChevronDown className="mr-2 h-3.5 w-3.5" aria-hidden="true" /> : <ChevronUp className="mr-2 h-3.5 w-3.5" aria-hidden="true" />}{folded ? 'Show' : 'Collapse'}</DropdownMenuItem>}
              {execution.originalResponse && execution.updatedAt !== execution.createdAt && <DropdownMenuItem onSelect={() => setShowOriginal((current) => !current)}>{showOriginal ? 'Hide original response' : 'View original response'}</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div> : <div className="flex items-center justify-between gap-2">
          <h2 ref={headingRef} tabIndex={-1} className="flex items-center gap-2 text-xs font-semibold text-teal-800 focus:outline-none"><Sparkles className="h-3.5 w-3.5" />{execution.continuesExecutionId ? 'Updated view' : 'Cozy response'}{execution.property ? ` · ${execution.property.label}` : ''}</h2>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" disabled={refreshing || refreshPending || loading || refreshAccessLost} onClick={() => void refresh()} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50" aria-label="Refresh this result">
            <RefreshCw className={cn('h-3 w-3', refreshing && 'animate-spin')} />{refreshing || refreshPending ? 'Refreshing…' : 'Refresh'}
          </button>
            {onTogglePin && <button type="button" aria-pressed={pinned} onClick={onTogglePin} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">
              {pinned ? <PinOff className="h-3 w-3" aria-hidden="true" /> : <Pin className="h-3 w-3" aria-hidden="true" />}{pinned ? 'Unpin' : 'Pin'}<span className="sr-only"> this result</span>
            </button>}
            {onToggleFold && canFoldResult(execution) && <button type="button" aria-expanded={!folded} onClick={onToggleFold} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">
              {folded ? <ChevronDown className="h-3 w-3" aria-hidden="true" /> : <ChevronUp className="h-3 w-3" aria-hidden="true" />}{folded ? 'Show' : 'Fold'}<span className="sr-only"> this result</span>
            </button>}
          </div>
        </div>}

        {folded && canFoldResult(execution) && <p data-ask-folded-headline="" className="text-sm font-semibold text-slate-900">{resultHeadline(execution)}<span className="ml-2 text-xs font-normal text-slate-500">Updated {new Date(execution.updatedAt).toLocaleString()}</span></p>}
        <div hidden={folded && canFoldResult(execution)} className="space-y-3">
        {(!calmChrome || execution.updatedAt !== execution.createdAt) && <p className="text-xs text-slate-500" role="status" aria-live="polite">
          {calmChrome ? 'Refreshed' : 'Updated'} {new Date(execution.updatedAt).toLocaleString()}
          {!calmChrome && execution.viewState && ` · ${execution.blocks.flatMap((block) => block.type === 'GROUPED_LIST' && block.id === 'maintenance-groups' ? block.sections : []).reduce((count, section) => count + section.count, 0)} matching tasks`}
        </p>}
        {/* ASK_COZY_INTERACTION_MODEL_UI_FRD RES-001: `execution.blocks` is
            always current data; this discloses what Cozy originally
            answered whenever the two have actually diverged (this result
            was refreshed, completed, or edited at least once since it was
            first created), without cluttering the common one-shot case. */}
        {execution.originalResponse && execution.updatedAt !== execution.createdAt && (calmChrome ? showOriginal : true) && (
          <details open={calmChrome || undefined} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <summary className="cursor-pointer text-[11px] font-semibold text-slate-500">Originally answered {new Date(execution.originalResponse.observedAt).toLocaleString()} · view original response</summary>
            <div className="mt-3 space-y-3 opacity-75">
              <ResultViewContext.Provider value={null}>{execution.originalResponse.blocks.map((block) => <BlockView key={block.id} block={block} executionId={execution.executionId} propertyId={execution.property?.id} itemActionsDisabled onItemAction={() => undefined} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />)}</ResultViewContext.Provider>
            </div>
          </details>
        )}
        <div ref={bodyRef} className={cn('space-y-3', calmChrome && FRAMELESS_LISTS)}>
          <AskBlockActionContext.Provider value={{ disabled: loading || refreshing || refreshPending || Boolean(refreshError), invoke: dispatchBlockAction }}>
            {execution.blocks.map((block) => <BlockView key={block.id} block={block} executionId={execution.executionId} propertyId={execution.property?.id} itemActionsDisabled={loading || refreshing || refreshPending || Boolean(refreshError)} onItemAction={dispatchItemAction} onBatchItemAction={(batch) => void ask(batch.message, undefined, { sourceExecutionId: execution.executionId, operationId: batch.operationId, entityType: batch.entityType, batchDecisions: batch.decisions })} onFilterClick={(message) => void ask(message, undefined, { sourceExecutionId: execution.executionId })} onCollectionPage={(sectionId, direction) => void ask(`${direction === 'NEXT' ? 'Show next' : 'Show previous'} maintenance results`, undefined, { sourceExecutionId: execution.executionId, entityType: 'ASK_COLLECTION_SECTION', entityId: sectionId, actionId: `${direction}_PAGE` })} onAccessLost={() => onAccessLost(execution)} onOpenContext={onOpenContext} />)}
            {hasResponseContext(execution) && <ResponseContextSummary execution={execution} open={contextOpen} onOpen={onOpenContext} />}
          </AskBlockActionContext.Provider>
          {itemActionIssue && <p role="alert" className="text-xs font-semibold text-red-700">{itemActionIssue}</p>}
        </div>
        {execution.status === 'NEEDS_PROPERTY' && <PropertySelectionCard executionId={execution.executionId} onCompleted={updateExecution} autoFocus={isJustUpdated} />}
        {execution.correctionCapabilities.retryResponse && <div><button type="button" disabled={loading} onClick={() => void ask(execution.question)} className="min-h-11 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Try again with current records</button></div>}
        {execution.captureRequests.map((request, index) => <InlineCaptureCard key={request.requirementId} executionId={execution.executionId} request={request} onCompleted={updateExecution} autoFocus={index === 0 && isJustUpdated} />)}
        {execution.clarification && <ClarificationCard executionId={execution.executionId} clarification={execution.clarification} onCompleted={updateExecution} autoFocus={isJustUpdated} />}
        {execution.confirmation && execution.status === 'NEEDS_CONFIRMATION' && <ConfirmationCard executionId={execution.executionId} confirmation={execution.confirmation} onCompleted={updateExecution} autoFocus={isJustUpdated} onAccessLost={() => onAccessLost(execution)} />}
        {/* External review [P2]: status RUNNING with confirmation still
            populated means a claim was made but the domain write's outcome
            isn't known yet -- render the outcome-unknown state instead of
            ConfirmationCard's "Confirmation required," which would invite
            a resubmit of something that may already be running or done. */}
        {execution.confirmation && execution.status === 'RUNNING' && <PendingOutcomeCard executionId={execution.executionId} confirmationVersion={execution.confirmation.version} onCompleted={updateExecution} onAccessLost={() => onAccessLost(execution)} />}
        {execution.skillHandoff && (() => {
          const handoffPrompt = execution.skillHandoff.suggestedGoal.replace(/[-_]+/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase());
          const continuity = execution.skillHandoff.continuity;
          return <div className="rounded-2xl border border-teal-200 bg-teal-50/70 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Suggested next step</p><button type="button" disabled={loading} onClick={() => void ask(handoffPrompt, undefined, { propertyId: continuity.propertyId ?? undefined, entityType: continuity.sourceEntityType ?? undefined, entityId: continuity.sourceEntityId ?? undefined, actionId: continuity.sourceHomeActionId ?? undefined, decisionThreadId: continuity.decisionThreadId ?? undefined, workItemId: continuity.workItemId ?? undefined, journeyId: continuity.journeyId ?? undefined, contextVersion: continuity.contextVersion ?? undefined, returnTo: continuity.returnDestination ?? undefined })} className="mt-2 min-h-10 rounded-xl border border-teal-300 bg-white px-3 py-2 text-left text-sm font-semibold text-teal-900 hover:border-teal-500 disabled:opacity-50">{handoffPrompt}</button><p className="mt-2 text-xs text-teal-800">Ask will check access, availability, and current home context again before continuing.</p></div>;
        })()}
        {shownSuggestions.length > 0 && <div className="flex flex-wrap gap-2 pt-1">{shownSuggestions.map((suggestion) => <button key={suggestion} onClick={() => { setInput(suggestion); window.localStorage.setItem(draftStorageKey(selectedPropertyId, execution.sessionId), suggestion); }} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-teal-300 hover:text-teal-800">{suggestion}</button>)}</div>}
        <ExecutionFeedback executionId={execution.executionId} propertyId={execution.property?.id} capabilities={execution.correctionCapabilities} calm={calmChrome} />
        </div>
      </div>
    </article></CalmAnswerContext.Provider></CalmChromeContext.Provider></ResultViewContext.Provider></ResultRevalidationBoundary>
  );
}
