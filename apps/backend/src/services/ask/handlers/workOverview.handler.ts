// Work as a conversation (Sole Homeowner Interface FRD v1.1 §1.2). A deterministic read of the canonical Work index
// (`getAskWorkPage`): what needs the homeowner, what is under way, waiting, scheduled, finished or set aside, in one answer that says
// how many, what is being shown and in what order. The homeowner narrows or widens it in words ("only show claims", "now show more
// work"); each declared chip is such a sentence, so the constraints live in the view state and a refinement changes only the dimension
// it names. Opening an item continues the owning operation in this same conversation (the row's own operation, record and version).
import { randomUUID } from 'node:crypto';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { containsFilterContinuation } from '../askFollowUpContext';
import { collectionDescriptor } from '../support/collectionDescriptor';
import { loadAskViewState } from './maintenance.handler';
import { prisma } from '../../../lib/prisma';
import type { AskViewState } from '../support/executionState';
import { getAskWorkPage, AskWorkRestrictedError } from '../askWork.service';
import { ASK_WORK_LIFECYCLE_VIEWS, type AskWorkLifecycleView, type AskWorkType } from '../governance/askWorkProviderRegistry';
import { ASK_WORK_MAX_LIMIT, type AskWorkPage, type AskWorkRow } from '../askWork.contract';
import { humanDate } from '../askFormatting';
import { WORK_REQUEST_ACTION_IDS, WORK_REQUEST_ENTITY_TYPE, workRequestMessage } from '../support/workSavedCommands';

export const WORK_OVERVIEW_PAGE_SIZE = 10;

const VIEW_PHRASES: Record<AskWorkLifecycleView, { label: string; chip: string; message: string; test: RegExp }> = {
  NEEDS_YOU: { label: 'Needs you', chip: 'Needs you', message: 'Only show work that needs me', test: /\b(?:needs? (?:me|my|you)|waiting on me|for me to (?:do|decide|answer)|needs? (?:my )?attention|awaiting me)\b/i },
  ACTIVE: { label: 'Active', chip: 'Active', message: 'Only show active work', test: /\b(?:active|under ?way|in progress|in flight|ongoing)\b/i },
  WAITING: { label: 'Waiting', chip: 'Waiting', message: 'Only show work that is waiting', test: /\b(?:waiting|on hold|blocked|waiting on (?:someone|others?))\b/i },
  SCHEDULED: { label: 'Scheduled', chip: 'Scheduled', message: 'Only show scheduled work', test: /\b(?:scheduled|upcoming|coming up|ahead)\b/i },
  COMPLETED: { label: 'Completed', chip: 'Completed', message: 'Only show completed work', test: /\b(?:completed|finished|done|closed)\b/i },
  ARCHIVED: { label: 'Archived', chip: 'Archived', message: 'Only show archived work', test: /\b(?:archived|set aside|lapsed)\b/i },
};

// One short noun per kind of work, used both in the chip sentence and to read it back.
const KIND_PHRASES: Record<AskWorkType, string> = {
  PENDING_EXECUTION: 'pending request', HOME_WORK_ITEM: 'home task', DECISION_THREAD: 'decision', INCIDENT: 'incident', CLAIM: 'claim', PROJECT: 'project',
  GUIDANCE_JOURNEY: 'guided plan', DIY_PROJECT: 'DIY', RENOVATION_CASE: 'renovation', REPAIR: 'repair', MONITOR: 'monitor', QUEUED_JOB: 'report',
  RETRYABLE_EXECUTION: 'retry', UNKNOWN_OUTCOME_EXECUTION: 'unconfirmed request', SCHEDULED_FOLLOW_UP: 'follow-up',
};
const KIND_LABELS: Record<AskWorkType, string> = {
  PENDING_EXECUTION: 'Pending requests', HOME_WORK_ITEM: 'Home tasks', DECISION_THREAD: 'Decisions', INCIDENT: 'Incidents', CLAIM: 'Claims', PROJECT: 'Projects',
  GUIDANCE_JOURNEY: 'Guided plans', DIY_PROJECT: 'DIY guides', RENOVATION_CASE: 'Renovations', REPAIR: 'Repairs', MONITOR: 'Monitors', QUEUED_JOB: 'Reports',
  RETRYABLE_EXECUTION: 'Requests to retry', UNKNOWN_OUTCOME_EXECUTION: 'Unconfirmed requests', SCHEDULED_FOLLOW_UP: 'Follow-ups',
};
const KIND_TYPES = Object.keys(KIND_PHRASES) as AskWorkType[];
const kindPattern = (type: AskWorkType) => new RegExp(`\\b${KIND_PHRASES[type].replace(/[-\s]/g, '[- ]')}s?\\b`, 'i');

const CLEAR_MESSAGE = 'Now show all work with no filters';
const CLEAR_PATTERN = /^\s*now show all work with no filters\b/i;
const MORE_MESSAGE = 'Now show more work';
const MORE_PATTERN = /\b(?:more|next|rest of the|remaining)\b.{0,12}\bwork\b|\bshow (?:me )?(?:more|the next|the rest)\b/i;

export interface WorkOverviewState { view: AskWorkLifecycleView; kind: AskWorkType | null; limit: number }

const isView = (value: string): value is AskWorkLifecycleView => (ASK_WORK_LIFECYCLE_VIEWS as readonly string[]).includes(value);
const isKind = (value: string | null | undefined): value is AskWorkType => Boolean(value) && (KIND_TYPES as string[]).includes(value as string);

/** The stored view state back as the constraints it carries (view in statusFilter, kind in domainScopePhrase, size in dateScopePhrase). */
export function workStateFromViewState(prior: AskViewState | null | undefined): WorkOverviewState | null {
  if (!prior || !isView(prior.statusFilter)) return null;
  const limit = Number(prior.dateScopePhrase);
  return { view: prior.statusFilter, kind: isKind(prior.domainScopePhrase) ? prior.domainScopePhrase : null, limit: Number.isInteger(limit) && limit >= WORK_OVERVIEW_PAGE_SIZE ? Math.min(limit, ASK_WORK_MAX_LIMIT) : WORK_OVERVIEW_PAGE_SIZE };
}

function viewFromWords(message: string): AskWorkLifecycleView | null {
  // Most specific first: "waiting" and "scheduled" are also words inside the longer needs/active phrasings.
  for (const view of ['NEEDS_YOU', 'COMPLETED', 'ARCHIVED', 'SCHEDULED', 'WAITING', 'ACTIVE'] as const) if (VIEW_PHRASES[view].test.test(message)) return view;
  return null;
}
function kindFromWords(message: string): AskWorkType | null {
  return [...KIND_TYPES].sort((a, b) => KIND_PHRASES[b].length - KIND_PHRASES[a].length).find((type) => kindPattern(type).test(message)) ?? null;
}

/**
 * What this message asks for. A declared chip, or a typed "only/now show" sentence, continues the prior result and changes only the
 * dimension it names; any other question is read on its own words with nothing remembered, so an ordinary question is never mistaken
 * for a refinement.
 */
export function resolveWorkState(message: string, prior: AskViewState | null | undefined): { state: WorkOverviewState; refinement: boolean } {
  const base = workStateFromViewState(prior);
  if (base && containsFilterContinuation(message)) {
    if (CLEAR_PATTERN.test(message)) return { state: { view: 'NEEDS_YOU', kind: null, limit: WORK_OVERVIEW_PAGE_SIZE }, refinement: true };
    if (MORE_PATTERN.test(message)) return { state: { ...base, limit: Math.min(base.limit + WORK_OVERVIEW_PAGE_SIZE, ASK_WORK_MAX_LIMIT) }, refinement: true };
    const view = viewFromWords(message);
    const kind = kindFromWords(message);
    if (view || kind) return { state: { view: view ?? base.view, kind: kind ?? base.kind, limit: WORK_OVERVIEW_PAGE_SIZE }, refinement: true };
  }
  return { state: { view: viewFromWords(message) ?? 'NEEDS_YOU', kind: kindFromWords(message), limit: WORK_OVERVIEW_PAGE_SIZE }, refinement: false };
}

export function buildWorkViewState(prior: AskViewState | null | undefined, state: WorkOverviewState): AskViewState {
  return { resultId: prior?.resultId ?? randomUUID(), domainScopePhrase: state.kind, dateScopePhrase: String(state.limit), statusFilter: state.view, selectedTaskId: null, revision: (prior?.revision ?? 0) + 1 };
}

const countPhrase = (view: AskWorkLifecycleView, count: number): string => {
  switch (view) {
    case 'NEEDS_YOU': return count === 0 ? 'Nothing needs you right now.' : `${count} ${count === 1 ? 'thing needs' : 'things need'} you.`;
    case 'ACTIVE': return count === 0 ? 'Nothing is under way.' : `${count} ${count === 1 ? 'item is' : 'items are'} under way.`;
    case 'WAITING': return count === 0 ? 'Nothing is waiting on someone else.' : `${count} ${count === 1 ? 'item is' : 'items are'} waiting on someone or something else.`;
    case 'SCHEDULED': return count === 0 ? 'Nothing is scheduled.' : `${count} ${count === 1 ? 'item is' : 'items are'} scheduled.`;
    case 'COMPLETED': return count === 0 ? 'No finished work yet.' : `${count} ${count === 1 ? 'item is' : 'items are'} finished.`;
    case 'ARCHIVED': return count === 0 ? 'Nothing is archived.' : `${count} ${count === 1 ? 'item was' : 'items were'} set aside.`;
  }
};

/** The declared chips: every lifecycle view with its count, the kinds of work present, a way to see more, and a way back. */
export function workOverviewChips(page: AskWorkPage, state: WorkOverviewState) {
  const views = ASK_WORK_LIFECYCLE_VIEWS.map((view) => {
    const count = page.viewCounts[view];
    return { id: `view-${view.toLowerCase()}`, label: count == null ? VIEW_PHRASES[view].chip : `${VIEW_PHRASES[view].chip} · ${count}`, message: VIEW_PHRASES[view].message, active: state.view === view && !state.kind };
  });
  const kinds = page.filterOptions.workTypes.filter((option): option is typeof option & { value: AskWorkType } => isKind(option.value)).slice(0, 6)
    .map((option) => ({ id: `kind-${option.value.toLowerCase()}`, label: KIND_LABELS[option.value], message: `Only show ${KIND_PHRASES[option.value]} work`, active: state.kind === option.value }));
  return [
    ...views,
    ...kinds,
    ...(page.nextCursor && state.limit < ASK_WORK_MAX_LIMIT ? [{ id: 'show-more', label: 'Show more', message: MORE_MESSAGE, active: false }] : []),
    ...(state.kind ? [{ id: 'clear-all', label: 'Clear filters', message: CLEAR_MESSAGE, active: false }] : []),
  ];
}

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** Try again for a request that did not finish, Dismiss for one that is waiting. Both act on the request, not on the row, and confirm first. */
function requestActions(row: AskWorkRow) {
  const executionId = row.resume.executionId;
  if (!executionId) return [];
  const target = { entityType: WORK_REQUEST_ENTITY_TYPE, entityId: executionId, operationId: 'WORK_REQUEST_COMMAND', interactionType: 'MUTATE_RECORD' as const };
  return [
    ...(row.nextAction?.retryExecutionId ? [{ ...target, entityId: row.nextAction.retryExecutionId, id: WORK_REQUEST_ACTION_IDS.RETRY, label: 'Try again', message: workRequestMessage('RETRY', row.title), style: 'PRIMARY' as const }] : []),
    ...(row.providerId === 'PENDING_EXECUTIONS' && row.status.canonical !== 'RUNNING' ? [{ ...target, id: WORK_REQUEST_ACTION_IDS.DISMISS, label: 'Dismiss', message: workRequestMessage('DISMISS', row.title), style: 'QUIET' as const }] : []),
  ];
}

function workRow(row: AskWorkRow) {
  const launch = row.resume.launch;
  const due = row.dueAt ? humanDate(new Date(row.dueAt)) : null;
  // Only work with a registered operation can be continued here. A pending request is continued from the conversation's own unfinished list.
  const canContinue = row.resume.kind === 'WORKSPACE' && Boolean(launch.operationId && launch.entityType && launch.entityId);
  const note = canContinue ? null
    : row.resume.executionId ? 'Continue it from the unfinished list in this conversation.'
      : row.resume.unavailableReason ?? 'Nothing to continue in Ask; its current state is shown here.';
  return {
    id: canContinue ? launch.entityId as string : row.workKey,
    title: row.title,
    description: row.summary ? truncate(row.summary, 240) : null,
    status: row.status.label,
    entityType: canContinue ? launch.entityType as string : null,
    href: null,
    meta: [KIND_LABELS[row.workType] ?? row.workType, due ? `Due ${due}` : null, row.nextAction ? `Next: ${row.nextAction.label}` : null, note].filter((value): value is string => Boolean(value)).slice(0, 6),
    actions: [
      ...(canContinue ? [{
        id: 'work-continue', label: row.nextAction?.label ?? 'Open', message: `Continue: ${row.title}`.slice(0, 300),
        interactionType: 'CONVERSATION_CONTINUE' as const, operationId: launch.operationId as string, style: 'PRIMARY' as const,
      }] : []),
      ...requestActions(row),
    ],
  };
}

const BOUNDARY: AskPresentationBlock = {
  type: 'BOUNDARY', id: 'work-overview-boundary', title: 'Each item stays with its own record',
  body: 'This lists work from each area of your home record. Opening an item continues it where it is kept; nothing is copied or changed here.',
  severity: 'INFO', suggestions: [],
};

/**
 * The answer for one page of work. Pure: the handler reads the page, this decides what is said. It states the count, what is being shown
 * and in what order, never calls a partial page complete or empty, and keeps every chip so a constraint can always be widened or cleared.
 */
export function workOverviewFromPage(input: { page: AskWorkPage; state: WorkOverviewState; viewState: AskViewState }): AskOperationResult {
  const { page, state, viewState } = input;
  const rows = page.rows.slice(0, state.limit);
  const chips = workOverviewChips(page, state);
  const kindLabel = state.kind ? KIND_LABELS[state.kind] : 'All kinds of work';
  const gaps = page.providers.filter((provider) => provider.state !== 'AVAILABLE' && provider.state !== 'NOT_APPLICABLE');
  const partial = page.partial && gaps.length > 0;
  const total = page.totalScope === 'COMPLETE' ? page.total : null;
  const shownLine = `Showing ${VIEW_PHRASES[state.view].label.toLowerCase()} · ${kindLabel.toLowerCase()} · most recently updated first.`;
  const others = ASK_WORK_LIFECYCLE_VIEWS.filter((view) => view !== state.view && (page.viewCounts[view] ?? 0) > 0)
    .map((view) => ({ label: `${page.viewCounts[view]} ${VIEW_PHRASES[view].label.toLowerCase()}`, tone: view === 'NEEDS_YOU' ? 'CAUTION' as const : 'DEFAULT' as const })).slice(0, 3);

  const headline = total != null ? countPhrase(state.view, total)
    : rows.length > 0 ? `${rows.length} shown so far; some kinds of work could not be read, so this may not be everything.`
      : 'Some kinds of work could not be read, so this is not a confirmed empty list.';
  const summary: AskPresentationBlock = {
    type: 'SUMMARY', id: 'work-overview-summary', title: headline.replace(/\.$/, ''), body: [headline, shownLine].join(' '), headline, supportLine: shownLine,
    tone: partial ? 'CAUTION' : state.view === 'NEEDS_YOU' && (total ?? 0) > 0 ? 'CAUTION' : 'DEFAULT',
    ...(others.length ? { chips: others } : {}), actions: [],
  };
  const list: AskPresentationBlock = {
    type: 'GROUPED_LIST', id: 'work-overview-results', title: `${VIEW_PHRASES[state.view].label}`, filters: chips,
    sections: [{ id: 'work', title: `${VIEW_PHRASES[state.view].label} work`, count: total ?? rows.length, items: rows.map(workRow) }],
    collection: collectionDescriptor({ sourceTotal: total, fetchedCount: rows.length, sections: [{ items: rows }], nextPageAvailable: Boolean(page.nextCursor) && state.limit < ASK_WORK_MAX_LIMIT }),
    actions: [],
  };
  const blocks: AskPresentationBlock[] = [summary, list];
  if (partial) {
    blocks.push({
      type: 'BOUNDARY', id: 'work-overview-partial', title: 'Some work could not be shown',
      body: `${gaps.map((gap) => `${gap.label}: ${gap.reason ?? 'not available right now'}`).join('; ')}. Nothing here is treated as zero or complete for those.`,
      severity: 'CAUTION', suggestions: [],
    });
  }
  blocks.push(BOUNDARY);
  return { status: partial ? 'READY_WITH_LIMITATIONS' : 'ANSWERED', reasonCode: partial ? 'WORK_PARTIAL' : undefined, parameters: { viewState }, blocks, suggestions: [] };
}

/** The prior view only when the source execution really was a Work overview (another domain's view state is never continued). */
async function loadWorkViewState(sourceExecutionId: string | null | undefined, userId: string): Promise<AskViewState | null> {
  if (!sourceExecutionId) return null;
  const source = await prisma.askExecution.findFirst({ where: { id: sourceExecutionId, userId }, select: { operationId: true } });
  return source?.operationId === 'WORK_OVERVIEW' ? loadAskViewState(sourceExecutionId, userId) : null;
}

registerCapabilityHandler('work.overview', async (envelope) => {
  const prior = await loadWorkViewState(envelope.launchContext?.sourceExecutionId, envelope.userId);
  const { state } = resolveWorkState(envelope.message, prior);
  try {
    const page = await getAskWorkPage(envelope.userId, envelope.propertyId!, { view: state.view, workType: state.kind, limit: state.limit });
    return workOverviewFromPage({ page, state, viewState: buildWorkViewState(prior, state) });
  } catch (caught) {
    if (!(caught instanceof AskWorkRestrictedError)) throw caught;
    return {
      status: 'READY_WITH_LIMITATIONS', reasonCode: 'WORK_RESTRICTED',
      blocks: [{ type: 'EMPTY_STATE', id: 'work-overview-restricted', title: 'Work is not available for your household role', body: 'Nothing was read, so this is not an empty list.', actions: [] }, BOUNDARY],
      suggestions: [],
    };
  }
});
