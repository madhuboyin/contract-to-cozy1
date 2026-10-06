import { createHash } from 'node:crypto';
import { seasonalLeadSentence, seasonalTaskFacts, seasonalTemplateByKey } from './support/seasonalHomeCare';
import type { AskOperationResult } from './askOperationRegistry';
import type {
  SeasonalChecklistContext,
  SeasonalChecklistContextChecklist,
  SeasonalChecklistContextItem,
} from '../skills/context/seasonalChecklistContext.provider';

type SeasonalView = 'OPEN' | 'COMPLETED' | 'DISMISSED' | 'ALL';
type Season = SeasonalChecklistContextChecklist['season'];

export interface SeasonalMaintenanceIntent {
  requested: boolean;
  seasons: Season[];
  year: number | null;
  view: SeasonalView;
}

const SEASON_PATTERNS: ReadonlyArray<[RegExp, Season]> = [
  [/\bspring\b/i, 'SPRING'],
  [/\bsummer\b/i, 'SUMMER'],
  [/\b(?:fall|autumn)\b/i, 'FALL'],
  [/\bwinter\b/i, 'WINTER'],
];

export function parseSeasonalMaintenanceIntent(message: string): SeasonalMaintenanceIntent {
  const seasons = SEASON_PATTERNS.filter(([pattern]) => pattern.test(message)).map(([, season]) => season);
  const requested = seasons.length > 0 || /\bseasonal(?:ly)?\b/i.test(message);
  const yearText = message.match(/\b(20\d{2})\b/)?.[1];
  const view: SeasonalView = /\b(?:dismissed|not applicable|skipped)\b/i.test(message)
    ? 'DISMISSED'
    : /\b(?:completed|finished|done)\b/i.test(message)
      ? 'COMPLETED'
      : /\b(?:all|everything)\b/i.test(message) && !/\b(?:pending|open|remaining|due|upcoming)\b/i.test(message)
        ? 'ALL'
        : 'OPEN';
  return { requested, seasons: [...new Set(seasons)], year: yearText ? Number(yearText) : null, view };
}

function effectiveStatus(item: SeasonalChecklistContextItem): 'PENDING' | 'SNOOZED' | 'COMPLETED' | 'DISMISSED' {
  // Completion can arrive through either surface. A later recurring
  // Maintenance cycle must not reopen a season that was already completed,
  // so only canonical completion may strengthen (never weaken) item state.
  if (item.maintenanceTask?.status === 'COMPLETED') return 'COMPLETED';
  if (item.status === 'COMPLETED') return 'COMPLETED';
  if (item.status === 'DISMISSED') return 'DISMISSED';
  if (item.status === 'SNOOZED') return 'SNOOZED';
  return 'PENDING';
}

function titleCase(value: string): string {
  return value.toLowerCase().replace(/(^|\s)\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone }).format(value);
}

function checklistDistance(checklist: SeasonalChecklistContextChecklist, now: Date): number {
  if (checklist.seasonStartDate <= now && checklist.seasonEndDate >= now) return 0;
  if (checklist.seasonStartDate > now) return checklist.seasonStartDate.getTime() - now.getTime();
  return now.getTime() - checklist.seasonEndDate.getTime() + 10_000_000_000_000;
}

function relevantChecklists(
  context: SeasonalChecklistContext,
  intent: SeasonalMaintenanceIntent,
  now: Date,
): SeasonalChecklistContextChecklist[] {
  let candidates = context.checklists.filter((checklist) =>
    (!intent.seasons.length || intent.seasons.includes(checklist.season))
    && (!intent.year || checklist.year === intent.year));
  if (intent.view === 'OPEN') {
    candidates = candidates.filter((checklist) => checklist.status !== 'DISMISSED' && checklist.seasonEndDate >= now);
  }
  if (intent.view === 'DISMISSED') {
    candidates = candidates.filter((checklist) => checklist.status === 'DISMISSED' || checklist.items.some((item) => item.status === 'DISMISSED'));
  }
  candidates.sort((left, right) => checklistDistance(left, now) - checklistDistance(right, now) || right.year - left.year);
  if (intent.year) return candidates;
  if (intent.seasons.length) {
    const latestYear = Math.max(...candidates.map((checklist) => checklist.year));
    return Number.isFinite(latestYear) ? candidates.filter((checklist) => checklist.year === latestYear) : [];
  }
  // Match Home Actions: one active checklist takes precedence, otherwise the
  // nearest upcoming/recent checklist is the relevant seasonal workspace.
  return candidates.slice(0, 1);
}

function itemMatchesView(item: SeasonalChecklistContextItem, checklist: SeasonalChecklistContextChecklist, view: SeasonalView): boolean {
  const status = effectiveStatus(item);
  if (view === 'OPEN') return status === 'PENDING' || status === 'SNOOZED';
  if (view === 'COMPLETED') return status === 'COMPLETED';
  if (view === 'DISMISSED') return status === 'DISMISSED' || checklist.status === 'DISMISSED';
  return true;
}

// IW-PRES-014 (FRD v1.83): the shelf-card facts for one checklist task. An open critical task is a caution; the timing
// is the recommended date (or the snooze date). Seasonal tasks record no cost.
export function seasonalShelfFacts(input: {
  priority: 'CRITICAL' | 'RECOMMENDED' | 'OPTIONAL';
  status: 'PENDING' | 'SNOOZED' | 'COMPLETED' | 'DISMISSED';
  recommendedDate: Date | null;
  snoozedUntil: Date | null;
  formatDate: (value: Date) => string;
}): { tone: 'DEFAULT' | 'CAUTION'; timingLabel: string } {
  const timingLabel = input.status === 'SNOOZED' && input.snoozedUntil
    ? `Snoozed until ${input.formatDate(input.snoozedUntil)}`
    : input.recommendedDate ? `Recommended ${input.formatDate(input.recommendedDate)}` : 'No recommended date';
  return { tone: input.priority === 'CRITICAL' && input.status === 'PENDING' ? 'CAUTION' : 'DEFAULT', timingLabel };
}

const PRIORITY_SHELVES = [
  { id: 'priority-critical', priority: 'CRITICAL', title: 'Critical' },
  { id: 'priority-recommended', priority: 'RECOMMENDED', title: 'Recommended' },
  { id: 'priority-optional', priority: 'OPTIONAL', title: 'Optional' },
] as const;

const PRIORITY_LABELS = { CRITICAL: 'High priority', RECOMMENDED: 'Recommended', OPTIONAL: 'Optional' } as const;

// The same plan layout as the general seasonal answer (see support/seasonalHomeCare.ts and SeasonalPlanResultList): what to do soon,
// what can wait, then the other states, numbered across groups, each task opening to a short how-to. Nothing links to the desktop
// seasonal page: the views switch inside Ask and the task detail is the item's own facts.
export function buildSeasonalMaintenanceResult(input: {
  message: string;
  propertyId: string;
  propertyTimezone: string;
  context: SeasonalChecklistContext | null;
  contextAvailable: boolean;
  now?: Date;
}): AskOperationResult | null {
  const intent = parseSeasonalMaintenanceIntent(input.message);
  if (!intent.requested) return null;
  if (!input.contextAvailable || !input.context) {
    return {
      status: 'READY_WITH_LIMITATIONS',
      reasonCode: 'SEASONAL_CHECKLIST_CONTEXT_UNAVAILABLE',
      blocks: [{
        type: 'SUMMARY', id: 'seasonal-context-unavailable', title: 'Seasonal tasks are temporarily unavailable',
        body: 'Ask could not load the selected home’s seasonal checklist, so it cannot determine the current task count. Try again in a moment.',
        tone: 'CAUTION', actions: [{ id: 'seasonal-retry', label: 'Try again', interactionType: 'START_WORKFLOW', message: input.message, operationId: 'MAINTENANCE_STATUS', style: 'PRIMARY' }],
      }],
      suggestions: [],
    };
  }

  const now = input.now ?? new Date();
  const checklists = relevantChecklists(input.context, intent, now);
  const deduplicated = new Map<string, { checklist: SeasonalChecklistContextChecklist; item: SeasonalChecklistContextItem }>();
  for (const checklist of checklists) {
    for (const item of checklist.items) {
      if (!itemMatchesView(item, checklist, intent.view)) continue;
      const key = item.maintenanceTask?.id ?? `${checklist.id}:${item.id}`;
      if (!deduplicated.has(key)) deduplicated.set(key, { checklist, item });
    }
  }
  const matches = [...deduplicated.values()].sort((left, right) => {
    const priority = { CRITICAL: 0, RECOMMENDED: 1, OPTIONAL: 2 } as const;
    return priority[left.item.priority] - priority[right.item.priority]
      || (left.item.recommendedDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (right.item.recommendedDate?.getTime() ?? Number.MAX_SAFE_INTEGER)
      || left.item.title.localeCompare(right.item.title);
  });
  const explicitLabel = intent.seasons.length === 1
    ? titleCase(intent.seasons[0])
    : checklists.length === 1 ? titleCase(checklists[0].season) : 'Seasonal';
  const word = explicitLabel.toLowerCase();
  const viewLabel = intent.view === 'COMPLETED' ? 'completed' : intent.view === 'DISMISSED' ? 'dismissed' : intent.view === 'ALL' ? 'recorded' : 'pending';
  const title = matches.length
    ? intent.view === 'OPEN'
      ? `${matches.length} ${word} task${matches.length === 1 ? ' needs' : 's need'} attention`
      : `${matches.length} ${word} task${matches.length === 1 ? '' : 's'} ${viewLabel}`
    : `No ${intent.view === 'OPEN' ? 'pending ' : intent.view === 'ALL' ? '' : `${viewLabel} `}${word} tasks were found`;
  const checklistLabel = checklists.length === 1
    ? `${titleCase(checklists[0].season)} ${checklists[0].year} checklist`
    : 'selected seasonal checklists';
  const linkedCount = matches.filter(({ item }) => item.maintenanceTask).length;
  const isUrgent = ({ item }: { item: SeasonalChecklistContextItem }) => item.priority === 'CRITICAL' && effectiveStatus(item) === 'PENDING';
  const soonCount = matches.filter(isUrgent).length;
  const laterCount = matches.length - soonCount;
  // The urgent tasks are named (the same lead as the general plan), not referred to by position.
  const focusSentence = intent.view === 'OPEN' && matches.length
    ? ` ${seasonalLeadSentence({ urgentTitles: matches.filter(isUrgent).map(({ item }) => item.title), laterCount })}`
    : '';
  const summaryBody = matches.length
    ? `These tasks come from the ${checklistLabel}.${linkedCount ? ` ${linkedCount} ${linkedCount === 1 ? 'is' : 'are'} also linked to the canonical Maintenance record and shown only once.` : ''}${focusSentence}`
    : checklists.length
      ? `The ${checklistLabel} is recorded, but it contains no tasks matching this status.`
      : `No matching seasonal checklist is recorded for this home. Ask did not substitute an empty Maintenance search.`;
  const blocks: AskOperationResult['blocks'] = [{
    type: 'SUMMARY', id: 'seasonal-maintenance-summary', title, body: summaryBody,
    tone: matches.some(({ item }) => item.priority === 'CRITICAL') ? 'CAUTION' : 'DEFAULT', actions: [],
  }];
  if (matches.length) {
    let number = 0;
    const toItem = (checklist: SeasonalChecklistContextChecklist, item: SeasonalChecklistContextItem) => {
      number += 1;
      const status = effectiveStatus(item);
      const template = seasonalTemplateByKey(item.taskKey);
      const shelf = seasonalShelfFacts({
        priority: item.priority, status, recommendedDate: item.recommendedDate, snoozedUntil: item.snoozedUntil,
        formatDate: (value) => formatDate(value, input.propertyTimezone),
      });
      const statusFacts: Array<{ label: string; value: string }> = [
        { label: 'What to do', value: template?.description ?? item.description ?? item.title },
        { label: 'Timing', value: shelf.timingLabel },
        { label: 'Status', value: status === 'PENDING' ? 'Pending' : titleCase(status) },
        ...(item.maintenanceTask ? [{ label: 'In Maintenance', value: `Yes, ${titleCase(item.maintenanceTask.status.replace(/_/g, ' '))}` }] : []),
        ...(template ? seasonalTaskFacts(template).filter((fact) => fact.label !== 'What to do' && fact.label !== 'When') : []),
      ];
      return {
        id: item.id,
        title: item.title,
        description: template?.whyItMatters ?? item.description ?? null,
        condition: null,
        entityType: 'SEASONAL_ITEM',
        meta: [
          PRIORITY_LABELS[item.priority],
          status === 'SNOOZED' && item.snoozedUntil ? `Snoozed until ${formatDate(item.snoozedUntil, input.propertyTimezone)}` : status === 'COMPLETED' ? 'Completed' : status === 'DISMISSED' ? 'Dismissed' : item.recommendedDate ? `Recommended ${formatDate(item.recommendedDate, input.propertyTimezone)}` : null,
          item.maintenanceTask ? 'In Maintenance' : null,
        ].filter((value): value is string => Boolean(value)),
        detail: statusFacts.map((fact) => `${fact.label}: ${fact.value}`).join('\n'),
        tone: isUrgent({ item }) ? 'CAUTION' as const : 'DEFAULT' as const,
        status, href: null, countLabel: String(number),
      };
    };
    const group = (id: string, groupTitle: string, caption: string, records: typeof matches) => records.length
      ? [{ id, title: groupTitle, caption, count: records.length, items: records.map(({ checklist, item }) => toItem(checklist, item)) }]
      : [];
    const statusOf = (match: (typeof matches)[number]) => effectiveStatus(match.item);
    // One checklist: the plan's own groups. Several: one group per season and year, so tasks from different checklists are never merged.
    const sections = checklists.length === 1
      ? [
        ...group('seasonal-soon', 'Do these soon', 'Helps prevent costly issues and keeps your home safe and efficient.', matches.filter(isUrgent)),
        ...group('seasonal-wait', 'Can wait', 'Useful checks to keep your home in good shape.', matches.filter((match) => !isUrgent(match) && ['PENDING', 'SNOOZED'].includes(statusOf(match)))),
        ...group('seasonal-completed', 'Completed', 'Done and recorded.', matches.filter((match) => statusOf(match) === 'COMPLETED')),
        ...group('seasonal-dismissed', 'Dismissed', 'Set aside for this season.', matches.filter((match) => statusOf(match) === 'DISMISSED')),
      ]
      : checklists.flatMap((checklist) => group(checklist.id, `${titleCase(checklist.season)} ${checklist.year}`, 'From this seasonal checklist.', matches.filter((match) => match.checklist.id === checklist.id)));
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'seasonal-maintenance-items', title: `${explicitLabel} checklist`,
      description: 'Checklist status is used first; a linked canonical Maintenance completion takes precedence when the two sources differ.',
      sections, actions: [],
    });
  }
  const action = (id: string, label: string, message: string) => ({
    id, label, interactionType: 'START_WORKFLOW' as const, message, operationId: 'MAINTENANCE_STATUS', style: 'SECONDARY' as const,
  });
  const pending = action('seasonal-show-pending', `Show pending ${word} tasks`, `What ${word} tasks are pending?`);
  const completed = action('seasonal-show-completed', `Show completed ${word} tasks`, `Show completed ${word} tasks`);
  const dismissed = action('seasonal-show-dismissed', `Show dismissed ${word} tasks`, `Show dismissed ${word} tasks`);
  const maintenance = action('seasonal-show-maintenance', 'Show my maintenance tasks', 'What maintenance tasks are coming due?');
  // The first is the recommended step (rendered filled); the view the homeowner is already on is never offered.
  const nextActions = intent.view === 'OPEN' ? [{ ...completed, style: 'PRIMARY' as const }, dismissed, maintenance]
    : intent.view === 'COMPLETED' ? [{ ...pending, style: 'PRIMARY' as const }, dismissed, maintenance]
      : intent.view === 'DISMISSED' ? [{ ...pending, style: 'PRIMARY' as const }, completed, maintenance]
        : [{ ...pending, style: 'PRIMARY' as const }, completed, maintenance];
  blocks.push({
    type: 'SUMMARY', id: 'seasonal-maintenance-next', title: 'What would you like to do next?',
    body: 'Switch the view, or see everything due in Maintenance.', tone: 'DEFAULT', actions: nextActions,
  });
  const contextVersion = createHash('sha256').update(JSON.stringify(checklists.map((checklist) => ({
    id: checklist.id, status: checklist.status, updatedAt: checklist.updatedAt,
    items: checklist.items.map((item) => ({ id: item.id, status: item.status, maintenanceStatus: item.maintenanceTask?.status, updatedAt: item.updatedAt })),
  })))).digest('hex');
  return { status: 'ANSWERED', contextVersion, blocks, suggestions: [] };
}
