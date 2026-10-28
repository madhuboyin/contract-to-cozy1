import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { getConflictedWarrantyGroups } from '../../coverageConflict.service';
import { evaluateCoverageRecord } from '../../coverage/contextPolicy';
import { humanDate } from '../askFormatting';
import { ensurePropertyAccess, HOME_DEADLINE_DEFAULT_LEAD_DAYS, readablePropertyValue } from '../askHandlerSupport';
import { warrantyContextVersion } from '../suggestedActions/domainVersions';
import { DEFAULT_CANDIDATE_SIGNALS, DEFAULT_CANDIDATE_TRAITS, type SuggestedNextActionCandidate } from '../suggestedActions/suggestedNextActionCandidate';
import { WARRANTY_ADD_MESSAGE, warrantyEditItemActions } from '../handlers/homeRecordWrites.handler';
import { MAX_RESULT_ITEMS, type AskViewState } from '../support/executionState';
import { randomUUID } from 'node:crypto';
import { collectionDescriptor } from '../support/collectionDescriptor';
import { loadAskViewState } from './maintenance.handler';
import { containsFilterContinuation } from '../askFollowUpContext';
import { isOrderingId, orderingChips, orderingFromWords, withOrdering, type OrderingOption } from '../support/collectionOrdering';

// Warranties capability slice, W-1 (FRD v1.124; ACUI Warranties certification). A deterministic record read: what the Home Record
// says about this home's warranties. It reads the same property-scoped rows the Warranties route does
// (GET /properties/:propertyId/warranties, propertyAuthMiddleware, so any household member including a viewer) and derives each
// warranty's status exactly as the Warranties page does: the governed `evaluateCoverageRecord` for a start date in the future or dates
// that need review, then calendar days to expiry with the page's own 60-day window. Ask never decides whether anything is covered,
// never files a claim and never reads a policy number or cost: it reports recorded fields and says so. Coverage text is shown as
// recorded. Corrections and evidence keep their existing owner-authorised controls; this handler only declares them.

/** The Warranties page's own "expiring" window (EXPIRING_SOON_DAYS). COVERAGE_GAPS uses a separate 90-day risk-review horizon. */
export const WARRANTY_EXPIRING_DAYS = 60;

export type WarrantyStatusKey = 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'STARTS_LATER' | 'NEEDS_REVIEW';
const STATUS_ORDER: readonly WarrantyStatusKey[] = ['EXPIRING', 'NEEDS_REVIEW', 'ACTIVE', 'STARTS_LATER', 'EXPIRED'];

export type WarrantyRecord = {
  id: string;
  propertyId: string | null;
  providerName: string;
  category: string;
  coverageDetails: string | null;
  startDate: Date;
  expiryDate: Date;
  updatedAt: Date;
  inventoryItem?: { name: string } | null;
  documents?: ReadonlyArray<unknown>;
};

const utcDay = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
/** Whole calendar days from `now` to `expiry` (negative once expired), the page's differenceInCalendarDays. */
export function warrantyDaysRemaining(expiry: Date, now: Date): number {
  return Math.round((utcDay(expiry) - utcDay(now)) / 86_400_000);
}

export function warrantyStatus(record: WarrantyRecord, propertyId: string, now: Date): { key: WarrantyStatusKey; daysRemaining: number | null } {
  const applicability = evaluateCoverageRecord(record, propertyId, now);
  if (applicability.lifecycle === 'FUTURE') return { key: 'STARTS_LATER', daysRemaining: null };
  if (applicability.status === 'UNKNOWN') return { key: 'NEEDS_REVIEW', daysRemaining: null };
  const daysRemaining = warrantyDaysRemaining(record.expiryDate, now);
  if (daysRemaining < 0) return { key: 'EXPIRED', daysRemaining };
  if (daysRemaining <= WARRANTY_EXPIRING_DAYS) return { key: 'EXPIRING', daysRemaining };
  return { key: 'ACTIVE', daysRemaining };
}

const CATEGORY_TERMS: ReadonlyArray<{ category: string; label: string; test: RegExp }> = [
  { category: 'HVAC', label: 'HVAC', test: /\b(?:hvac|heating|cooling|furnace|air[- ]conditioner|heat pump|boiler)\b/i },
  { category: 'ROOFING', label: 'roofing', test: /\broof(?:ing)?\b/i },
  { category: 'PLUMBING', label: 'plumbing', test: /\bplumbing\b/i },
  { category: 'ELECTRICAL', label: 'electrical', test: /\belectric(?:al)?\b/i },
  { category: 'STRUCTURAL', label: 'structural', test: /\b(?:structural|foundation)\b/i },
  { category: 'APPLIANCE', label: 'appliance', test: /\bappliances?\b/i },
  { category: 'HOME_WARRANTY_PLAN', label: 'home warranty plan', test: /\bhome warranty plan\b/i },
  { category: 'OTHER', label: 'other', test: /\bother warranties\b/i },
];
// A named item is matched against the linked inventory item, the provider and the recorded coverage text only, never guessed.
const ITEM_TERMS: ReadonlyArray<{ label: string; test: RegExp; terms: readonly string[] }> = [
  { label: 'water heater', test: /\bwater heater\b/i, terms: ['water heater'] },
  { label: 'refrigerator', test: /\b(?:refrigerator|fridge)\b/i, terms: ['refrigerator', 'fridge'] },
  { label: 'dishwasher', test: /\bdishwasher\b/i, terms: ['dishwasher'] },
  { label: 'washer', test: /\bwasher\b/i, terms: ['washer', 'washing machine'] },
  { label: 'dryer', test: /\bdryer\b/i, terms: ['dryer'] },
  { label: 'oven', test: /\b(?:oven|range|stove)\b/i, terms: ['oven', 'range', 'stove'] },
  { label: 'furnace', test: /\bfurnace\b/i, terms: ['furnace'] },
  { label: 'garage door', test: /\bgarage door\b/i, terms: ['garage door'] },
];

export type WarrantyFocus = { expiring: boolean; expired: boolean; category: string | null; categoryLabel: string | null; item: { label: string; terms: readonly string[] } | null };

/** What this question asks about, from its own words. Nothing is remembered between questions (refinements are W-2). */
export function warrantyFocus(message: string): WarrantyFocus {
  const category = CATEGORY_TERMS.find((entry) => entry.test.test(message)) ?? null;
  const item = ITEM_TERMS.find((entry) => entry.test.test(message)) ?? null;
  const expired = /\b(?:already )?(?:expired|lapsed|ran out|run out)\b/i.test(message);
  const expiring = !expired && /\b(?:expir(?:e|es|ing)|runs? out|running out|ends?|ending)\b/i.test(message);
  return { expiring, expired, category: category?.category ?? null, categoryLabel: category?.label ?? null, item: item ? { label: item.label, terms: item.terms } : null };
}

export function warrantyCalmCopy(counts: {
  total: number; shown: number; active: number; expiring: number; expired: number; needsReview: number; startsLater: number; scopeLabel?: string | null;
}): { headline: string; supportLine?: string; chips: Array<{ label: string; tone: 'DEFAULT' | 'CAUTION' | 'CRITICAL' }> } {
  const { total, shown, active, expiring, expired, needsReview, startsLater, scopeLabel } = counts;
  const noun = `${scopeLabel ? `${scopeLabel} ` : ''}${total === 1 ? 'warranty' : 'warranties'}`;
  const parts = [
    active > 0 ? `${active} active` : null,
    expiring > 0 ? `${expiring} expiring within ${WARRANTY_EXPIRING_DAYS} days` : null,
    expired > 0 ? `${expired} expired` : null,
    needsReview > 0 ? `${needsReview} with dates that need review` : null,
    startsLater > 0 ? `${startsLater} starting later` : null,
  ].filter((part): part is string => Boolean(part));
  const headline = `${total} ${noun}: ${parts.join(', ')}.`;
  const chips: Array<{ label: string; tone: 'DEFAULT' | 'CAUTION' | 'CRITICAL' }> = [
    { label: `${total} ${total === 1 ? 'warranty' : 'warranties'}`, tone: 'DEFAULT' },
    ...(active > 0 ? [{ label: `${active} active`, tone: 'DEFAULT' as const }] : []),
    ...(expiring > 0 ? [{ label: `${expiring} expire within ${WARRANTY_EXPIRING_DAYS} days`, tone: 'CAUTION' as const }] : []),
    ...(expired > 0 ? [{ label: `${expired} expired`, tone: 'DEFAULT' as const }] : []),
    ...(needsReview > 0 ? [{ label: `${needsReview} need date review`, tone: 'CAUTION' as const }] : []),
  ];
  return shown < total
    ? { headline, supportLine: `Showing the first ${shown}. Each row reflects the recorded warranty.`, chips }
    : { headline, chips };
}

// W-2 (FRD v1.125): filters as a governed refinement, the same continuity model as Maintenance, Buyer Deadlines and Inventory. A declared
// chip is a fresh authoritative query over every recorded warranty; it keeps the result identity, increments the revision and
// replaces only the dimension it names. Two independent dimensions: a status and a category.
export type WarrantyStatusFilter = 'ALL' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'NEEDS_REVIEW';
const STATUS_FILTERS: ReadonlySet<string> = new Set(['ALL', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'NEEDS_REVIEW']);
const CATEGORY_KEYS: ReadonlySet<string> = new Set(CATEGORY_TERMS.map((entry) => entry.category));
// Each declared chip message begins with a phrase askFollowUpContext's FILTER_CONTINUATION_PATTERN accepts (asserted in tests).
const CLEAR_MESSAGE = 'Now show all warranties with no filters';
const CLEAR_PATTERN = /^\s*now show all warranties with no filters\b/i;
const ALL_STATUS_PATTERN = /^\s*now show all warranties\b/i;
const ALL_CATEGORIES_PATTERN = /^\s*now show all warranty categories\b/i;

// Ordering in words (FRD v1.6). The usual order puts what needs attention first, then by the date that matters soonest; the others are global.
export const WARRANTY_DEFAULT_ORDERING = 'ATTENTION';
export const WARRANTY_ORDERINGS: readonly OrderingOption[] = [
  { id: 'ATTENTION', label: 'Needs attention first', message: 'Now show them with what needs attention first', statement: 'by what needs attention first', test: /\bneeds? attention first\b|\bmost urgent first\b|\busual order\b/i },
  { id: 'LATEST_EXPIRY', label: 'Latest expiry first', message: 'Now show them with the latest expiry first', statement: 'by latest expiry first', test: /\blatest expir|\blongest (?:coverage|remaining)\b|\bexpir\w* last\b/i },
  { id: 'NEWEST', label: 'Newest first', message: 'Now show them newest first', statement: 'by newest coverage first', test: /\bnewest\b|\bmost recent(?:ly)? (?:started|added)\b/i },
  { id: 'OLDEST', label: 'Oldest first', message: 'Now show them oldest first', statement: 'by oldest coverage first', test: /\boldest\b|\bearliest\b/i },
  { id: 'PROVIDER', label: 'By provider', message: 'Now show them by provider', statement: 'by provider, A to Z', test: /\bby (?:provider|company)\b|\balphabetical|\ba[- ]to[- ]z\b/i },
];
const priorWarrantyOrdering = (prior: AskViewState): string => (isOrderingId(WARRANTY_ORDERINGS, prior.roomScopePhrase) ? prior.roomScopePhrase : WARRANTY_DEFAULT_ORDERING);

export function resolveWarrantyRefinement(message: string, prior: AskViewState | null | undefined): { status: WarrantyStatusFilter; category: string | null; ordering: string } | null {
  if (!prior || !STATUS_FILTERS.has(prior.statusFilter)) return null;
  // Only a declared chip or a typed filter phrase refines a result; an ordinary question is answered on its own.
  if (!containsFilterContinuation(message)) return null;
  const priorCategory = prior.domainScopePhrase && CATEGORY_KEYS.has(prior.domainScopePhrase) ? prior.domainScopePhrase : null;
  if (CLEAR_PATTERN.test(message)) return { status: 'ALL', category: null, ordering: WARRANTY_DEFAULT_ORDERING };
  const status: WarrantyStatusFilter | null = /\bdates that need review\b/i.test(message) ? 'NEEDS_REVIEW'
    : /\bexpired\b/i.test(message) ? 'EXPIRED'
      : /\bexpir(?:e|es|ing)\b/i.test(message) ? 'EXPIRING'
        : /\bactive\b/i.test(message) ? 'ACTIVE'
          : ALL_STATUS_PATTERN.test(message) ? 'ALL' : null;
  const allCategories = ALL_CATEGORIES_PATTERN.test(message);
  const category = allCategories ? null : (CATEGORY_TERMS.find((entry) => entry.test.test(message))?.category ?? null);
  const ordering = orderingFromWords(WARRANTY_ORDERINGS, message);
  if (!status && !category && !allCategories && !ordering) return null;
  return { status: status ?? prior.statusFilter as WarrantyStatusFilter, category: allCategories ? null : category ?? priorCategory, ordering: ordering ?? priorWarrantyOrdering(prior) };
}

export function buildWarrantyViewState(prior: AskViewState | null | undefined, status: WarrantyStatusFilter, category: string | null, ordering: string = WARRANTY_DEFAULT_ORDERING): AskViewState {
  return {
    resultId: prior?.resultId ?? randomUUID(),
    // Warranties reuse the generic fields: the category key rides in domainScopePhrase, the status filter in statusFilter.
    // The chosen order rides in roomScopePhrase, the generic spare scope slot of the view state (null is the usual order).
    domainScopePhrase: category, dateScopePhrase: null, roomScopePhrase: ordering === WARRANTY_DEFAULT_ORDERING ? null : ordering, statusFilter: status, selectedTaskId: null, revision: (prior?.revision ?? 0) + 1,
  };
}

const CATEGORY_WORDS: Record<string, string> = Object.fromEntries(CATEGORY_TERMS.map((entry) => [entry.category, entry.label]));
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The declared chips: only categories this home actually has, "Dates need review" only when some warranty does, and a way back. */
export function warrantyFilterChips(status: WarrantyStatusFilter, category: string | null, present: { categories: readonly string[]; needsReview: boolean }, ordering: string = WARRANTY_DEFAULT_ORDERING) {
  const categories = [...new Set([...present.categories, ...(category ? [category] : [])])];
  const statusChips = [
    { id: 'status-all', label: 'All', message: 'Now show all warranties', active: status === 'ALL' },
    { id: 'status-active', label: 'Active', message: 'Only show active warranties', active: status === 'ACTIVE' },
    { id: 'status-expiring', label: `Expires within ${WARRANTY_EXPIRING_DAYS} days`, message: `Only show warranties expiring within ${WARRANTY_EXPIRING_DAYS} days`, active: status === 'EXPIRING' },
    { id: 'status-expired', label: 'Expired', message: 'Only show expired warranties', active: status === 'EXPIRED' },
    ...(present.needsReview || status === 'NEEDS_REVIEW' ? [{ id: 'status-review', label: 'Dates need review', message: 'Only show warranties with dates that need review', active: status === 'NEEDS_REVIEW' }] : []),
  ];
  const orderChips = orderingChips(WARRANTY_ORDERINGS, ordering);
  const clear = status !== 'ALL' || category || ordering !== WARRANTY_DEFAULT_ORDERING ? [{ id: 'clear-all', label: 'Clear filters', message: CLEAR_MESSAGE, active: false }] : [];
  // A result carries at most sixteen chips: the order and the status always show, and the kinds of coverage give way (the chosen one never does).
  const categoryRoom = Math.max(0, 16 - statusChips.length - orderChips.length - clear.length - 1);
  const categoryChips = categories.map((key) => ({ id: `category-${key.toLowerCase()}`, label: key === 'HVAC' ? 'HVAC' : capitalise(CATEGORY_WORDS[key] ?? key.toLowerCase()), message: `Only show ${CATEGORY_WORDS[key] ?? key.toLowerCase()} warranties`, active: category === key }));
  const shownCategories = [...categoryChips.filter((chip) => chip.active), ...categoryChips.filter((chip) => !chip.active)].slice(0, categoryRoom);
  return [
    ...statusChips,
    ...(categories.length > 1 || category ? [{ id: 'category-all', label: 'All categories', message: 'Now show all warranty categories', active: category === null }, ...categoryChips.filter((chip) => shownCategories.includes(chip))] : []),
    ...orderChips,
    ...clear,
  ];
}

/** The prior view only when the source execution really was a warranty lookup (another domain's view state must never be continued). */
async function loadWarrantyViewState(sourceExecutionId: string | null | undefined, userId: string): Promise<AskViewState | null> {
  if (!sourceExecutionId) return null;
  const source = await prisma.askExecution.findFirst({ where: { id: sourceExecutionId, userId }, select: { operationId: true } });
  return source?.operationId === 'WARRANTY_LOOKUP' ? loadAskViewState(sourceExecutionId, userId) : null;
}

const BOUNDARY: AskPresentationBlock = {
  type: 'BOUNDARY', id: 'warranty-boundary', title: 'Recorded information only',
  body: 'This reports the warranty information recorded in your Home Record. It does not determine whether a repair is covered or file a claim.',
  severity: 'INFO', suggestions: [],
};

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/**
 * The answer for a set of recorded warranties. Pure: the handler reads the rows and the requester's access, this decides what is
 * said. `ownedIds` are the warranties the requester's own homeowner profile added (the only ones the existing correction command
 * accepts); a viewer or a non-owner gets no correction actions and never sees a control that would fail.
 */
export function warrantiesFromRecords(input: {
  message: string; propertyId: string; records: readonly WarrantyRecord[]; canWrite: boolean; ownedIds: ReadonlySet<string>; conflictedIds?: ReadonlySet<string>; now?: Date;
  /** The source result's view state, when a declared filter chip continues it (W-2). */
  priorViewState?: AskViewState | null;
}): AskOperationResult {
  const { message, propertyId, records, canWrite, ownedIds, priorViewState } = input;
  const conflictedIds = input.conflictedIds ?? new Set<string>();
  const now = input.now ?? new Date();
  const addAction = { id: 'add-warranty', label: 'Add a warranty', interactionType: 'START_WORKFLOW' as const, message: WARRANTY_ADD_MESSAGE, operationId: 'CAPTURE_WARRANTY_CONFIRM', style: 'PRIMARY' as const };

  if (records.length === 0) {
    return {
      status: 'READY_WITH_LIMITATIONS', reasonCode: 'WARRANTY_NOT_RECORDED',
      blocks: [{
        type: 'SUMMARY', id: 'warranty-empty', title: 'No warranties are recorded for this home yet',
        body: 'An empty record does not mean nothing is covered; it only means no warranty has been added here. Add one to see its dates and coverage in this answer.',
        tone: 'CAUTION', actions: canWrite ? [addAction] : [],
      }, BOUNDARY],
      suggestions: [],
    };
  }

  // A declared chip continues the prior result and changes only the dimension it names; any other question is read on its own words.
  const refinement = resolveWarrantyRefinement(message, priorViewState);
  const focus: WarrantyFocus = refinement
    ? { expiring: false, expired: false, category: refinement.category, categoryLabel: refinement.category ? CATEGORY_WORDS[refinement.category] ?? null : null, item: null }
    : warrantyFocus(message);
  const statusFilter: WarrantyStatusFilter = refinement ? refinement.status : focus.expiring ? 'EXPIRING' : focus.expired ? 'EXPIRED' : 'ALL';
  const enriched = records.map((record) => ({ record, status: warrantyStatus(record, propertyId, now) }));
  let matched = enriched;
  if (focus.category) matched = matched.filter((entry) => entry.record.category === focus.category);
  if (focus.item) {
    const terms = focus.item.terms;
    matched = matched.filter((entry) => {
      const haystack = [entry.record.inventoryItem?.name, entry.record.providerName, entry.record.coverageDetails].filter(Boolean).join(' ').toLowerCase();
      return terms.some((term) => haystack.includes(term));
    });
  }
  if (statusFilter !== 'ALL') matched = matched.filter((entry) => entry.status.key === statusFilter);
  // The chips reflect every recorded warranty (never the filtered subset), so a filter can always be widened or cleared.
  const present = { categories: [...new Set(records.map((record) => record.category))], needsReview: enriched.some((entry) => entry.status.key === 'NEEDS_REVIEW') };
  const isCollection = !focus.item;
  // The order: a refinement keeps or changes it; a fresh question may name one ("show my warranties newest first"); otherwise the usual order.
  const ordering = refinement ? refinement.ordering : (orderingFromWords(WARRANTY_ORDERINGS, message) ?? WARRANTY_DEFAULT_ORDERING);
  const viewState = isCollection ? buildWarrantyViewState(priorViewState, statusFilter, focus.category, ordering) : null;
  const chips = viewState ? warrantyFilterChips(statusFilter, focus.category, present, ordering) : [];

  if (matched.length === 0 && refinement) {
    // A filter that matches nothing still continues the result and keeps every chip, so it can be widened or cleared.
    return {
      status: 'ANSWERED', reasonCode: 'WARRANTY_FILTER_NO_MATCH', parameters: { viewState },
      blocks: [{
        type: 'SUMMARY', id: 'warranty-summary', title: 'No recorded warranties match these filters', headline: 'No warranties match these filters.',
        supportLine: `This home has ${records.length} recorded ${records.length === 1 ? 'warranty' : 'warranties'}. Widen or clear a filter to see them.`,
        body: `This home has ${records.length} recorded ${records.length === 1 ? 'warranty' : 'warranties'}, but none match the selected filters.`, tone: 'DEFAULT', actions: [],
      }, {
        type: 'GROUPED_LIST', filters: chips, id: 'warranty-results', title: 'Recorded warranties',
        sections: [{ id: 'warranties', title: 'Recorded warranties', count: 0, items: [] }],
        actions: [...(canWrite ? [addAction] : [])],
      }, BOUNDARY],
      suggestions: [],
    };
  }

  if (matched.length === 0) {
    const scope = focus.item?.label ?? (focus.categoryLabel ? `${focus.categoryLabel} warranties` : focus.expiring ? `warranties expiring within ${WARRANTY_EXPIRING_DAYS} days` : focus.expired ? 'expired warranties' : 'a matching warranty');
    return {
      status: 'ANSWERED', reasonCode: 'WARRANTY_MATCH_NOT_FOUND',
      blocks: [{
        type: 'SUMMARY', id: 'warranty-no-match', title: focus.item ? `No warranty is recorded for your ${focus.item.label}` : `No recorded warranty matches ${scope}`,
        body: `This home has ${records.length} recorded ${records.length === 1 ? 'warranty' : 'warranties'}, but none match this request. That reflects the Home Record only: it does not mean anything is or is not covered.`,
        tone: 'DEFAULT', actions: [],
      }, BOUNDARY],
      suggestions: [],
    };
  }

  const byStatusThenDate = (left: (typeof matched)[number], right: (typeof matched)[number]) => {
    const order = STATUS_ORDER.indexOf(left.status.key) - STATUS_ORDER.indexOf(right.status.key);
    if (order !== 0) return order;
    // Expired rows read most recent first; everything else by the date that matters soonest.
    return left.status.key === 'EXPIRED' ? right.record.expiryDate.getTime() - left.record.expiryDate.getTime() : left.record.expiryDate.getTime() - right.record.expiryDate.getTime();
  };
  const byOrdering: Record<string, (left: (typeof matched)[number], right: (typeof matched)[number]) => number> = {
    LATEST_EXPIRY: (left, right) => right.record.expiryDate.getTime() - left.record.expiryDate.getTime(),
    NEWEST: (left, right) => right.record.startDate.getTime() - left.record.startDate.getTime(),
    OLDEST: (left, right) => left.record.startDate.getTime() - right.record.startDate.getTime(),
    PROVIDER: (left, right) => left.record.providerName.localeCompare(right.record.providerName),
  };
  // A stable tie-break (the usual order) keeps the same order for the same question.
  matched = [...matched].sort((left, right) => (byOrdering[ordering]?.(left, right) || byStatusThenDate(left, right)));
  const count = (key: WarrantyStatusKey) => matched.filter((entry) => entry.status.key === key).length;
  const shown = matched.slice(0, MAX_RESULT_ITEMS);
  const copy = warrantyCalmCopy({
    total: matched.length, shown: shown.length, active: count('ACTIVE'), expiring: count('EXPIRING'), expired: count('EXPIRED'), needsReview: count('NEEDS_REVIEW'), startsLater: count('STARTS_LATER'),
    scopeLabel: focus.item ? focus.item.label : focus.categoryLabel,
  });
  const expiryLine = (entry: (typeof matched)[number]) => {
    const date = humanDate(entry.record.expiryDate) ?? 'date unavailable';
    switch (entry.status.key) {
      case 'EXPIRED': return `Expired ${date}`;
      case 'EXPIRING': return entry.status.daysRemaining === 0 ? `Expires today (${date})` : `Expires ${date} · ${entry.status.daysRemaining} day${entry.status.daysRemaining === 1 ? '' : 's'}`;
      case 'STARTS_LATER': return `Starts ${humanDate(entry.record.startDate) ?? 'a later date'}`;
      case 'NEEDS_REVIEW': return 'Coverage dates need review';
      default: return `Expires ${date}`;
    }
  };
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'warranty-summary', title: `${matched.length} recorded ${matched.length === 1 ? 'warranty matches' : 'warranties match'} this request`,
    body: `${copy.headline} ${WARRANTY_EXPIRING_DAYS} days is the window used for expiring soon.`, tone: count('EXPIRING') || count('NEEDS_REVIEW') ? 'CAUTION' : 'DEFAULT',
    ...copy, ...(withOrdering(copy.supportLine, WARRANTY_ORDERINGS, ordering, WARRANTY_DEFAULT_ORDERING) ? { supportLine: withOrdering(copy.supportLine, WARRANTY_ORDERINGS, ordering, WARRANTY_DEFAULT_ORDERING) } : {}), actions: [],
  }, {
    type: 'GROUPED_LIST', filters: chips, id: 'warranty-results', title: 'Recorded warranties',
    sections: [{
      id: 'warranties', title: 'Recorded warranties', count: matched.length,
      items: shown.map((entry) => ({
        id: entry.record.id, title: entry.record.providerName, entityType: 'WARRANTY', href: null,
        // Recorded coverage text, unchanged and never interpreted.
        description: `${conflictedIds.has(entry.record.id) ? `Conflicts with another ${readablePropertyValue(entry.record.category)} warranty. ` : ''}${entry.record.coverageDetails?.trim() ? truncate(entry.record.coverageDetails.trim(), 240) : 'No coverage details recorded.'}`,
        status: entry.status.key,
        meta: [
          readablePropertyValue(entry.record.category), expiryLine(entry),
          ...(entry.record.inventoryItem?.name ? [`Linked to ${entry.record.inventoryItem.name}`] : []),
          `${entry.record.documents?.length ?? 0} document${(entry.record.documents?.length ?? 0) === 1 ? '' : 's'}`,
        ],
        actions: warrantyEditItemActions(canWrite, ownedIds.has(entry.record.id), conflictedIds.has(entry.record.id)),
      })),
    }],
    // Presentation Quality 3: the matched warranties are the whole collection for this request; the first MAX_RESULT_ITEMS are shown
    // and no continuation exists, so the list says "Showing X of Y" and offers no Next control.
    collection: collectionDescriptor({ sourceTotal: matched.length, fetchedCount: matched.length, sections: [{ items: shown }], nextPageAvailable: false }),
    actions: [
      ...(canWrite ? [addAction] : []),
    ],
  }, {
    type: 'EVIDENCE', id: 'warranty-evidence', title: 'Record freshness',
    items: shown.slice(0, 15).map((entry) => ({ label: entry.record.providerName, source: 'Home warranties · recorded', observedAt: entry.record.updatedAt.toISOString() })),
  }, BOUNDARY];
  return {
    status: count('NEEDS_REVIEW') ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: count('NEEDS_REVIEW') ? 'WARRANTY_DATES_NEED_REVIEW' : undefined,
    ...(viewState ? { parameters: { viewState } } : {}),
    blocks,
    suggestions: [],
  };
}

async function warrantiesResult(userId: string, propertyId: string, message: string, priorViewState?: AskViewState | null): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const canWrite = access.role !== HouseholdRole.VIEWER;
  // The same query the property-scoped Warranties route runs, plus the linked item and document count the answer shows.
  const rows = await prisma.warranty.findMany({
    where: { propertyId },
    orderBy: [{ expiryDate: 'asc' }, { id: 'asc' }],
    select: {
      id: true, propertyId: true, providerName: true, category: true, coverageDetails: true, startDate: true, expiryDate: true, updatedAt: true,
      inventoryItem: { select: { name: true } }, documents: { select: { id: true } },
    },
  });
  const ownedIds = canWrite
    ? new Set((await prisma.warranty.findMany({ where: { propertyId, homeownerProfile: { userId } }, select: { id: true } })).map((row) => row.id))
    : new Set<string>();
  // Only a writer can act on a conflict, so a viewer's answer costs no extra query.
  const conflictedIds = canWrite ? new Set((await getConflictedWarrantyGroups(propertyId, prisma)).flatMap((group) => group.warranties.map((row) => row.id))) : new Set<string>();
  return warrantiesFromRecords({ message, propertyId, records: rows, canWrite, ownedIds, conflictedIds, priorViewState });
}

// Presentation Quality 4: a warranty question asked about one recorded item (launched from its repair-or-replace answer with the
// item's exact identity) answers for that item only. It never infers coverage: no linked warranty is said plainly, and a missing or
// moved item is said too, instead of silently listing the whole home.
export function itemWarrantyFromRecords(input: {
  item: { id: string; name: string }; propertyId: string; records: readonly WarrantyRecord[]; canWrite: boolean; ownedIds: ReadonlySet<string>; now?: Date;
}): AskOperationResult {
  const { item, propertyId, records, canWrite, ownedIds } = input;
  const repairAction = {
    id: 'warranty-item-repair-replace', label: 'Repair or replace this?', interactionType: 'START_WORKFLOW' as const,
    message: `Should I repair or replace ${item.name}?`, operationId: 'REPLACEMENT_GUIDANCE', entityType: 'INVENTORY_ITEM', entityId: item.id, style: 'SECONDARY' as const,
  };
  if (records.length === 0) {
    return {
      status: 'READY_WITH_LIMITATIONS', reasonCode: 'WARRANTY_NOT_RECORDED_FOR_ITEM',
      blocks: [{
        type: 'SUMMARY', id: 'warranty-item-empty', title: `No warranty is recorded for ${item.name}`,
        body: 'An empty record does not mean it is not covered; it only means no warranty is linked to this item here, so Ask will not assume coverage either way.',
        tone: 'CAUTION', actions: [repairAction],
      }, BOUNDARY],
      suggestions: [],
    };
  }
  const base = warrantiesFromRecords({ message: 'Show my warranties', propertyId, records, canWrite, ownedIds, now: input.now });
  return {
    ...base,
    blocks: base.blocks.map((block, index) => (index === 0 && block.type === 'SUMMARY'
      ? { ...block, title: `${item.name}: ${block.title}`, actions: [...block.actions, repairAction].slice(0, 3) }
      : block)),
  };
}

async function itemWarrantyResult(userId: string, propertyId: string, itemId: string): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const item = await prisma.inventoryItem.findFirst({ where: { id: itemId, propertyId }, select: { id: true, name: true, warrantyId: true } });
  if (!item) {
    return {
      status: 'READY_WITH_LIMITATIONS', reasonCode: 'WARRANTY_ITEM_NOT_FOUND',
      blocks: [{
        type: 'SUMMARY', id: 'warranty-item-missing', title: 'That item is no longer in your home record',
        body: 'It may have been removed or moved. Nothing was assumed about its coverage.',
        tone: 'CAUTION', actions: [{ id: 'warranty-show-all', label: 'Show my warranties', interactionType: 'START_WORKFLOW', message: 'Show my warranties', operationId: 'WARRANTY_LOOKUP', style: 'SECONDARY' }],
      }, BOUNDARY],
      suggestions: [],
    };
  }
  const canWrite = access.role !== HouseholdRole.VIEWER;
  const records = await prisma.warranty.findMany({
    where: { propertyId, OR: [{ inventoryItemId: item.id }, ...(item.warrantyId ? [{ id: item.warrantyId }] : [])] },
    orderBy: [{ expiryDate: 'asc' }, { id: 'asc' }],
    select: {
      id: true, propertyId: true, providerName: true, category: true, coverageDetails: true, startDate: true, expiryDate: true, updatedAt: true,
      inventoryItem: { select: { name: true } }, documents: { select: { id: true } },
    },
  });
  const ownedIds = canWrite
    ? new Set((await prisma.warranty.findMany({ where: { propertyId, homeownerProfile: { userId }, id: { in: records.map((row) => row.id) } }, select: { id: true } })).map((row) => row.id))
    : new Set<string>();
  return itemWarrantyFromRecords({ item, propertyId, records, canWrite, ownedIds });
}

registerCapabilityHandler('warranty.lookup', async (envelope) => {
  const launch = envelope.launchContext;
  if (launch?.entityType === 'INVENTORY_ITEM' && launch.entityId) return itemWarrantyResult(envelope.userId, envelope.propertyId!, launch.entityId);
  return warrantiesResult(
    envelope.userId, envelope.propertyId!, envelope.message,
    await loadWarrantyViewState(envelope.launchContext?.sourceExecutionId, envelope.userId),
  );
});

/** The reminder task id the deadline monitor keys on, shared with `confirmHomeDeadlineMonitor` so "already set up" means the same thing. */
export const warrantyReminderActionKey = (warrantyId: string): string => `ask-deadline:WARRANTY:${warrantyId}`;

/**
 * Typed next-action candidate for "remind me before this warranty expires". Offered only while the expiry is still ahead, and not
 * when an active reminder already exists for this warranty at the date the monitor would set. The reminder deadline is driven by
 * the expiry date alone, so the corrected-receipt caller passes this only after an expiry-date change. The candidate carries the exact
 * warranty and its version; the monitor operation targets that warranty and never falls back to another.
 */
export async function warrantyExpiryReminderCandidates(
  warranty: { id: string; providerName: string; expiryDate: Date; updatedAt: Date },
  context: { propertyId: string; sourceOperationId: string | null; checkExistingReminder: boolean; now?: Date },
): Promise<SuggestedNextActionCandidate[]> {
  // The warranty is already saved when a receipt calls this, so a failed lookup must cost only the suggestion, never the receipt.
  try {
    const now = context.now ?? new Date();
    if (!(warranty.expiryDate instanceof Date) || warranty.expiryDate.getTime() <= now.getTime()) return [];
    if (context.checkExistingReminder) {
      const existing = await prisma.propertyMaintenanceTask.findUnique({
        where: { propertyId_actionKey: { propertyId: context.propertyId, actionKey: warrantyReminderActionKey(warranty.id) } },
        select: { status: true, nextDueDate: true },
      });
      const due = new Date(warranty.expiryDate.getTime() - HOME_DEADLINE_DEFAULT_LEAD_DAYS * 86_400_000).toISOString().slice(0, 10);
      if (existing && existing.status !== 'CANCELLED' && existing.status !== 'COMPLETED' && existing.nextDueDate?.toISOString().slice(0, 10) === due) return [];
    }
    const provider = warranty.providerName.length > 40 ? `${warranty.providerName.slice(0, 39)}…` : warranty.providerName;
    return [{
      source: 'OPERATION_RESULT' as const,
      sourceOperationId: context.sourceOperationId,
      label: `Remind me before the ${provider} warranty expires`,
      message: `Remind me before the ${warranty.providerName} warranty expires.`,
      operationId: 'HOME_DEADLINE_MONITOR',
      interactionType: 'MUTATE_RECORD' as const,
      outcomeKey: 'MONITOR_WARRANTY_EXPIRY',
      entityContext: { propertyId: context.propertyId, entityType: 'WARRANTY', entityId: warranty.id, contextVersion: warrantyContextVersion(warranty) },
      tier: 'RELATED' as const,
      requiredFacts: [],
      reasonCodes: ['WARRANTY_EXPIRY_AHEAD'],
      signals: { ...DEFAULT_CANDIDATE_SIGNALS, exactEntityMatch: true, currentResultOwnership: true },
      traits: { ...DEFAULT_CANDIDATE_TRAITS },
    }];
  } catch {
    return [];
  }
}
