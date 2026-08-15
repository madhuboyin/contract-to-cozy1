import { createHash } from 'node:crypto';
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
  const seasonalHref = `/dashboard/seasonal?propertyId=${encodeURIComponent(input.propertyId)}&from=ask`;
  if (!input.contextAvailable || !input.context) {
    return {
      status: 'READY_WITH_LIMITATIONS',
      reasonCode: 'SEASONAL_CHECKLIST_CONTEXT_UNAVAILABLE',
      blocks: [{
        type: 'SUMMARY', id: 'seasonal-context-unavailable', title: 'Seasonal tasks are temporarily unavailable',
        body: 'Ask could not load the selected home’s seasonal checklist, so it cannot determine the current task count. Open Seasonal Care to review the current list.',
        tone: 'CAUTION', actions: [{ id: 'open-seasonal', label: 'Open Seasonal Care', href: seasonalHref, style: 'PRIMARY' }],
      }],
      suggestions: ['Try this seasonal question again'],
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
  const viewLabel = intent.view === 'COMPLETED' ? 'completed' : intent.view === 'DISMISSED' ? 'dismissed' : intent.view === 'ALL' ? 'recorded' : 'pending';
  const title = matches.length
    ? intent.view === 'OPEN'
      ? `${matches.length} ${explicitLabel.toLowerCase()} task${matches.length === 1 ? ' needs' : 's need'} attention`
      : `${matches.length} ${explicitLabel.toLowerCase()} task${matches.length === 1 ? '' : 's'} ${viewLabel}`
    : `No ${intent.view === 'OPEN' ? 'pending ' : intent.view === 'ALL' ? '' : `${viewLabel} `}${explicitLabel.toLowerCase()} tasks were found`;
  const checklistLabel = checklists.length === 1
    ? `${titleCase(checklists[0].season)} ${checklists[0].year} checklist`
    : 'selected seasonal checklists';
  const linkedCount = matches.filter(({ item }) => item.maintenanceTask).length;
  const summaryBody = matches.length
    ? `These tasks come from the ${checklistLabel}.${linkedCount ? ` ${linkedCount} ${linkedCount === 1 ? 'is' : 'are'} also linked to the canonical Maintenance record and shown only once.` : ''}`
    : checklists.length
      ? `The ${checklistLabel} is recorded, but it contains no tasks matching this status.`
      : `No matching seasonal checklist is recorded for this home. Ask did not substitute an empty Maintenance search.`;
  const blocks: AskOperationResult['blocks'] = [{
    type: 'SUMMARY', id: 'seasonal-maintenance-summary', title, body: summaryBody,
    tone: matches.some(({ item }) => item.priority === 'CRITICAL') ? 'CAUTION' : 'DEFAULT',
    actions: [{ id: 'open-seasonal', label: checklists.length === 1 ? `Open ${titleCase(checklists[0].season)} checklist` : 'Open Seasonal Care', href: seasonalHref, style: 'PRIMARY' }],
  }];
  if (matches.length) {
    const sections = checklists.map((checklist) => {
      const records = matches.filter((match) => match.checklist.id === checklist.id);
      return {
        id: checklist.id,
        title: `${titleCase(checklist.season)} ${checklist.year}`,
        count: records.length,
        items: records.map(({ item }) => {
          const status = effectiveStatus(item);
          return {
            id: item.id,
            title: item.title,
            description: item.description ?? undefined,
            status,
            meta: [
              `${titleCase(item.priority)} priority`,
              item.recommendedDate ? `Recommended ${formatDate(item.recommendedDate, input.propertyTimezone)}` : null,
              status === 'SNOOZED' && item.snoozedUntil ? `Snoozed until ${formatDate(item.snoozedUntil, input.propertyTimezone)}` : null,
              item.maintenanceTask ? 'Linked to Maintenance' : 'Seasonal checklist',
            ].filter((value): value is string => Boolean(value)),
            href: `${seasonalHref}&checklistId=${encodeURIComponent(checklist.id)}&itemId=${encodeURIComponent(item.id)}`,
          };
        }),
      };
    }).filter((section) => section.count > 0);
    blocks.push({
      type: 'GROUPED_LIST', id: 'seasonal-maintenance-items', title: `${explicitLabel} checklist`,
      description: 'Checklist status is used first; a linked canonical Maintenance completion takes precedence when the two sources differ.',
      sections, actions: [],
    });
  }
  const contextVersion = createHash('sha256').update(JSON.stringify(checklists.map((checklist) => ({
    id: checklist.id, status: checklist.status, updatedAt: checklist.updatedAt,
    items: checklist.items.map((item) => ({ id: item.id, status: item.status, maintenanceStatus: item.maintenanceTask?.status, updatedAt: item.updatedAt })),
  })))).digest('hex');
  return {
    status: 'ANSWERED',
    contextVersion,
    blocks,
    suggestions: intent.view === 'OPEN'
      ? [`Show completed ${explicitLabel.toLowerCase()} tasks`, `Show dismissed ${explicitLabel.toLowerCase()} tasks`]
      : [`What ${explicitLabel.toLowerCase()} tasks are pending?`],
  };
}
