// Saved as a conversation (Sole Homeowner Interface FRD v1.1 §1.2). A deterministic read of the canonical Saved index
// (`getAskSavedPage`): the reports, comparisons, decisions, briefings and checklists kept for this home, newest first, with how many,
// how fresh and whether each is the current version. The homeowner narrows it in words ("only show out of date results", "only show
// quote comparisons", "show archived"); each declared chip is such a sentence, so the constraints live in the view state. Opening a
// result continues the owning operation in this same conversation, at the exact record and version.
import { randomUUID } from 'node:crypto';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { containsFilterContinuation } from '../askFollowUpContext';
import { collectionDescriptor } from '../support/collectionDescriptor';
import { loadAskViewState } from './maintenance.handler';
import { prisma } from '../../../lib/prisma';
import type { AskViewState } from '../support/executionState';
import { getAskSavedPage } from '../askSaved.service';
import { AskWorkRestrictedError } from '../askWork.service';
import { ASK_ARTIFACT_TYPE_REGISTRY, type AskArtifactFreshness, type AskArtifactTypeId } from '../governance/askArtifactTypeRegistry';
import { ASK_SAVED_MAX_LIMIT, type AskSavedArtifact, type AskSavedPage } from '../askSaved.contract';
import { humanDate } from '../askFormatting';

export const SAVED_RESULTS_PAGE_SIZE = 10;

const FRESHNESS_PHRASES: Record<AskArtifactFreshness, { label: string; chip: string; message: string; test: RegExp }> = {
  CURRENT: { label: 'Current', chip: 'Current', message: 'Only show current saved results', test: /\b(?:current|up to date|still good)\b/i },
  STALE: { label: 'Out of date', chip: 'Out of date', message: 'Only show out of date saved results', test: /\b(?:out ?of ?date|stale|outdated|needs? (?:a )?refresh)\b/i },
  EXPIRED: { label: 'Expired', chip: 'Expired', message: 'Only show expired saved results', test: /\bexpired\b/i },
  SUPERSEDED: { label: 'Replaced', chip: 'Replaced by a newer version', message: 'Only show replaced saved results', test: /\b(?:replaced|superseded|older versions?)\b/i },
};
const FRESHNESS_ORDER: readonly AskArtifactFreshness[] = ['STALE', 'EXPIRED', 'SUPERSEDED', 'CURRENT'];

const CLEAR_MESSAGE = 'Now show all saved results with no filters';
const CLEAR_PATTERN = /^\s*now show all saved results with no filters\b/i;
const MORE_MESSAGE = 'Now show more saved results';
const MORE_PATTERN = /\b(?:more|next|rest of the|remaining)\b.{0,12}\bsaved\b|\bshow (?:me )?(?:more|the next|the rest)\b/i;
const ARCHIVED_MESSAGE = 'Only show archived saved results';
const ACTIVE_MESSAGE = 'Only show saved results that are not archived';
const ARCHIVED_PATTERN = /\barchived\b/i;
const NOT_ARCHIVED_PATTERN = /\b(?:not archived|unarchived|that are not archived|saved results that are not archived)\b/i;

export interface SavedResultsState { archived: boolean; type: AskArtifactTypeId | null; freshness: AskArtifactFreshness | null; limit: number }

const isFreshness = (value: string | null | undefined): value is AskArtifactFreshness => Boolean(value) && (FRESHNESS_ORDER as readonly string[]).includes(value as string);
const connectedTypes = () => ASK_ARTIFACT_TYPE_REGISTRY.filter((entry) => entry.reader.state === 'CONNECTED');
const isType = (value: string | null | undefined): value is AskArtifactTypeId => Boolean(value) && connectedTypes().some((entry) => entry.id === value);
const typeChipMessage = (label: string) => `Only show ${label.toLowerCase()}`;

function typeFromWords(message: string): AskArtifactTypeId | null {
  const lower = message.toLowerCase();
  // Longest label first, and a plural or singular of it: "quote comparison" and "quote comparisons" are the same kind.
  return [...connectedTypes()].sort((a, b) => b.label.length - a.label.length)
    .find((entry) => { const label = entry.label.toLowerCase(); return lower.includes(label) || lower.includes(label.replace(/s$/, '')); })?.id ?? null;
}
function freshnessFromWords(message: string): AskArtifactFreshness | null {
  for (const key of FRESHNESS_ORDER) if (FRESHNESS_PHRASES[key].test.test(message)) return key;
  return null;
}

/** The stored view state back as the constraints it carries (archive + freshness in statusFilter, type in domainScopePhrase, size in dateScopePhrase). */
export function savedStateFromViewState(prior: AskViewState | null | undefined): SavedResultsState | null {
  if (!prior || !/^(ACTIVE|ARCHIVED)(:(CURRENT|STALE|EXPIRED|SUPERSEDED))?$/.test(prior.statusFilter)) return null;
  const [archive, freshness] = prior.statusFilter.split(':');
  const limit = Number(prior.dateScopePhrase);
  return {
    archived: archive === 'ARCHIVED', freshness: isFreshness(freshness) ? freshness : null, type: isType(prior.domainScopePhrase) ? prior.domainScopePhrase : null,
    limit: Number.isInteger(limit) && limit >= SAVED_RESULTS_PAGE_SIZE ? Math.min(limit, ASK_SAVED_MAX_LIMIT) : SAVED_RESULTS_PAGE_SIZE,
  };
}

/**
 * What this message asks for. A declared chip, or a typed "only/now show" sentence, continues the prior result and changes only the
 * dimension it names; any other question is read on its own words with nothing remembered.
 */
export function resolveSavedState(message: string, prior: AskViewState | null | undefined): { state: SavedResultsState; refinement: boolean } {
  const base = savedStateFromViewState(prior);
  const fresh: SavedResultsState = { archived: ARCHIVED_PATTERN.test(message) && !NOT_ARCHIVED_PATTERN.test(message), type: typeFromWords(message), freshness: freshnessFromWords(message), limit: SAVED_RESULTS_PAGE_SIZE };
  if (base && containsFilterContinuation(message)) {
    if (CLEAR_PATTERN.test(message)) return { state: { archived: false, type: null, freshness: null, limit: SAVED_RESULTS_PAGE_SIZE }, refinement: true };
    if (MORE_PATTERN.test(message)) return { state: { ...base, limit: Math.min(base.limit + SAVED_RESULTS_PAGE_SIZE, ASK_SAVED_MAX_LIMIT) }, refinement: true };
    const type = typeFromWords(message);
    const freshness = freshnessFromWords(message);
    const archiveWords = NOT_ARCHIVED_PATTERN.test(message) ? false : ARCHIVED_PATTERN.test(message) ? true : null;
    if (type || freshness || archiveWords !== null) {
      return { state: { archived: archiveWords ?? base.archived, type: type ?? base.type, freshness: freshness ?? base.freshness, limit: SAVED_RESULTS_PAGE_SIZE }, refinement: true };
    }
  }
  return { state: fresh, refinement: false };
}

export function buildSavedViewState(prior: AskViewState | null | undefined, state: SavedResultsState): AskViewState {
  return {
    resultId: prior?.resultId ?? randomUUID(), domainScopePhrase: state.type, dateScopePhrase: String(state.limit),
    statusFilter: `${state.archived ? 'ARCHIVED' : 'ACTIVE'}${state.freshness ? `:${state.freshness}` : ''}`, selectedTaskId: null, revision: (prior?.revision ?? 0) + 1,
  };
}

/** The declared chips: freshness, the kinds of result this home has, the archive, a way to see more, and a way back. */
export function savedResultsChips(page: AskSavedPage, state: SavedResultsState) {
  const types = page.filterOptions.types.filter((option) => isType(option.value)).slice(0, 6)
    .map((option) => ({ id: `type-${option.value.toLowerCase()}`, label: option.label, message: typeChipMessage(option.label), active: state.type === option.value }));
  const freshness = page.filterOptions.freshness.filter((option) => isFreshness(option.value))
    .map((option) => ({ id: `fresh-${option.value.toLowerCase()}`, label: FRESHNESS_PHRASES[option.value as AskArtifactFreshness].chip, message: FRESHNESS_PHRASES[option.value as AskArtifactFreshness].message, active: state.freshness === option.value }));
  return [
    ...freshness,
    ...types,
    { id: state.archived ? 'show-active' : 'show-archived', label: state.archived ? 'Not archived' : `Archived${page.counts.archived ? ` · ${page.counts.archived}` : ''}`, message: state.archived ? ACTIVE_MESSAGE : ARCHIVED_MESSAGE, active: false },
    ...(page.nextCursor && state.limit < ASK_SAVED_MAX_LIMIT ? [{ id: 'show-more', label: 'Show more', message: MORE_MESSAGE, active: false }] : []),
    ...(state.type || state.freshness ? [{ id: 'clear-all', label: 'Clear filters', message: CLEAR_MESSAGE, active: false }] : []),
  ].slice(0, 16);
}

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function savedRow(artifact: AskSavedArtifact) {
  const reopen = artifact.reopen;
  const asOf = humanDate(new Date(artifact.sourceAsOf));
  const meta = [
    FRESHNESS_PHRASES[artifact.freshness.state]?.label ?? artifact.freshness.state, artifact.version.label, asOf ? `Facts as of ${asOf}` : null,
    artifact.freshness.reason, artifact.visibility.sensitivity === 'SENSITIVE' ? 'Sensitive' : null,
    reopen ? null : artifact.reopenUnavailableReason ?? 'Ask cannot reopen this; its state is shown here.',
  ].filter((value): value is string => Boolean(value)).slice(0, 6);
  return {
    id: reopen ? reopen.entityId : artifact.artifactKey,
    title: artifact.title,
    description: artifact.summary ? truncate(artifact.summary, 240) : null,
    status: artifact.freshness.state === 'CURRENT' ? null : FRESHNESS_PHRASES[artifact.freshness.state]?.label ?? null,
    entityType: reopen ? reopen.entityType : null,
    href: null,
    meta,
    actions: reopen ? [{
      id: 'saved-open', label: artifact.freshness.state === 'CURRENT' ? 'Open' : 'Open and review', message: `Open ${artifact.title}`.slice(0, 300),
      interactionType: 'CONVERSATION_CONTINUE' as const, operationId: reopen.operationId, style: 'PRIMARY' as const,
    }] : [],
  };
}

const BOUNDARY: AskPresentationBlock = {
  type: 'BOUNDARY', id: 'saved-results-boundary', title: 'Saved only finds and reopens',
  body: 'Each result stays where it is kept; this lists it and reopens it at its current version. Nothing is copied. Pinning a result in a conversation is separate and saves nothing.',
  severity: 'INFO', suggestions: [],
};

/**
 * The answer for one page of Saved. Pure: the handler reads the page, this decides what is said. It states the count and what is being
 * shown, never calls a partial page complete or empty, and keeps every chip so a constraint can always be widened or cleared.
 */
export function savedResultsFromPage(input: { page: AskSavedPage; state: SavedResultsState; viewState: AskViewState }): AskOperationResult {
  const { page, state, viewState } = input;
  const rows = page.rows.slice(0, state.limit);
  const chips = savedResultsChips(page, state);
  const gaps = page.types.filter((type) => type.state !== 'AVAILABLE' && type.state !== 'NOT_APPLICABLE' && type.state !== 'RESTRICTED');
  const partial = page.partial && gaps.length > 0;
  const total = page.totalScope === 'COMPLETE' ? page.total : null;
  const typeLabel = state.type ? ASK_ARTIFACT_TYPE_REGISTRY.find((entry) => entry.id === state.type)?.label : null;
  const scope = [state.archived ? 'archived' : 'saved', typeLabel?.toLowerCase(), state.freshness ? FRESHNESS_PHRASES[state.freshness].label.toLowerCase() : null].filter(Boolean).join(' · ');
  const shownLine = `Showing ${scope} · newest first.`;
  const stale = rows.filter((row) => row.freshness.state !== 'CURRENT').length;

  const noun = (count: number) => (count === 1 ? 'result' : 'results');
  const headline = total != null
    ? total === 0 ? (state.archived ? 'Nothing is archived.' : state.type || state.freshness ? 'No saved results match.' : 'Nothing is saved for this home yet.') : `${total} ${state.archived ? 'archived' : 'saved'} ${noun(total)}${stale ? `, ${stale} no longer current` : ''}.`
    : rows.length > 0 ? `${rows.length} shown so far; some kinds could not be read, so this may not be everything.` : 'Some kinds could not be read, so this is not a confirmed empty list.';
  const summary: AskPresentationBlock = {
    type: 'SUMMARY', id: 'saved-results-summary', title: headline.replace(/\.$/, ''), body: [headline, shownLine].join(' '), headline, supportLine: shownLine,
    tone: partial || stale > 0 ? 'CAUTION' : 'DEFAULT',
    ...(page.counts.archived && !state.archived ? { chips: [{ label: `${page.counts.archived} archived`, tone: 'DEFAULT' as const }] } : {}), actions: [],
  };
  const list: AskPresentationBlock = {
    type: 'GROUPED_LIST', id: 'saved-results-list', title: state.archived ? 'Archived' : 'Saved', filters: chips,
    sections: [{ id: 'saved', title: state.archived ? 'Archived results' : 'Saved results', count: total ?? rows.length, items: rows.map(savedRow) }],
    collection: collectionDescriptor({ sourceTotal: total, fetchedCount: rows.length, sections: [{ items: rows }], nextPageAvailable: Boolean(page.nextCursor) && state.limit < ASK_SAVED_MAX_LIMIT }),
    actions: [],
  };
  const blocks: AskPresentationBlock[] = [summary, list];
  if (partial) {
    blocks.push({
      type: 'BOUNDARY', id: 'saved-results-partial', title: 'Some saved results could not be shown',
      body: `${gaps.map((gap) => `${gap.label}: ${gap.reason ?? 'not available right now'}`).join('; ')}. Nothing here is treated as zero or complete for those.`,
      severity: 'CAUTION', suggestions: [],
    });
  }
  blocks.push(BOUNDARY);
  return { status: partial ? 'READY_WITH_LIMITATIONS' : 'ANSWERED', reasonCode: partial ? 'SAVED_PARTIAL' : undefined, parameters: { viewState }, blocks, suggestions: [] };
}

/** The prior view only when the source execution really was a Saved lookup (another domain's view state is never continued). */
async function loadSavedViewState(sourceExecutionId: string | null | undefined, userId: string): Promise<AskViewState | null> {
  if (!sourceExecutionId) return null;
  const source = await prisma.askExecution.findFirst({ where: { id: sourceExecutionId, userId }, select: { operationId: true } });
  return source?.operationId === 'SAVED_RESULTS' ? loadAskViewState(sourceExecutionId, userId) : null;
}

registerCapabilityHandler('saved.results', async (envelope) => {
  const prior = await loadSavedViewState(envelope.launchContext?.sourceExecutionId, envelope.userId);
  const { state } = resolveSavedState(envelope.message, prior);
  try {
    const page = await getAskSavedPage(envelope.userId, envelope.propertyId!, { archived: state.archived, artifactType: state.type, freshness: state.freshness, limit: state.limit });
    return savedResultsFromPage({ page, state, viewState: buildSavedViewState(prior, state) });
  } catch (caught) {
    if (!(caught instanceof AskWorkRestrictedError)) throw caught;
    return {
      status: 'READY_WITH_LIMITATIONS', reasonCode: 'SAVED_RESTRICTED',
      blocks: [{ type: 'EMPTY_STATE', id: 'saved-results-restricted', title: 'Saved results are not available for your household role', body: 'Nothing was read, so this is not an empty list.', actions: [] }, BOUNDARY],
      suggestions: [],
    };
  }
});
