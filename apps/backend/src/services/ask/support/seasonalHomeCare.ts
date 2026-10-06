// Ask support: the seasonal home-care read (inventory D-O4 candidate). PURE and data-independent: it reads only the property's required
// location columns (zip code), an optional saved climate region, the date, and the LOCAL seasonal template catalog. It reads no recorded
// home data, makes no external call, and decides nothing about the home; it lists the general tasks that apply to a climate region in a
// season, restricted to templates that need no recorded asset. Not registered as an operation yet.
import climateData from '../../../data/zipToClimateRegion.json';
import seasonalTemplates from '../../../data/seasonalTaskTemplates.json';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { getSeasonStartDate, resolveCurrentSeasonWindow, resolveUpcomingSeasonWindow, type Season } from '../../seasonal/seasonWindow';

/** The two stored starter messages. The launch's message, not a routing guess, selects this or next season (see the handler). */
export const SEASONAL_HOME_CARE_THIS_SEASON_MESSAGE = 'What home care should I do this season?';
export const SEASONAL_HOME_CARE_NEXT_SEASON_MESSAGE = 'What should I do to get ready for next season?';

export type SeasonalClimateRegion = 'VERY_COLD' | 'COLD' | 'MODERATE' | 'WARM' | 'TROPICAL';
export type SeasonalHomeCareFocus = 'THIS_SEASON' | 'NEXT_SEASON';
/** Where the region came from: the property's saved setting, the local zip-prefix table, or the national default for an unmapped zip. */
export type ClimateRegionSource = 'SAVED' | 'ZIP_PREFIX' | 'NATIONAL_DEFAULT';

interface SeasonalTemplate {
  taskKey: string; season: Season; title: string; description: string; whyItMatters: string; priority: string;
  climateRegions: string[]; requiredAssetType: string | null; requiredAssetCheck: string | null; isDiyPossible: boolean;
  typicalCostMin?: number | null; typicalCostMax?: number | null; estimatedHours?: number | null; timingOffsetDays?: number | null; serviceCategory?: string | null;
}

const ZIP_PREFIX_REGION = (climateData as { zipPrefixMapping: Record<string, SeasonalClimateRegion> }).zipPrefixMapping;
const REGION_WORDS: Record<SeasonalClimateRegion, string> = { VERY_COLD: 'a very cold climate', COLD: 'a cold climate', MODERATE: 'a moderate climate', WARM: 'a warm climate', TROPICAL: 'a tropical climate' };
const SEASON_WORDS: Record<Season, string> = { SPRING: 'spring', SUMMER: 'summer', FALL: 'fall', WINTER: 'winter' };
const PRIORITY_ORDER: Record<string, number> = { CRITICAL: 0, RECOMMENDED: 1, OPTIONAL: 2 };
const MAX_ITEMS = 8;

/** Mirrors ClimateZoneService.detectClimateRegion (zip prefix, else MODERATE) so the answer agrees with the seasonal checklist, and says which. */
export function deriveSeasonalClimateRegion(zipCode: string | null | undefined, saved?: SeasonalClimateRegion | null): { region: SeasonalClimateRegion; source: ClimateRegionSource } {
  if (saved) return { region: saved, source: 'SAVED' };
  const prefix = String(zipCode ?? '').replace(/[\s-]/g, '').substring(0, 3);
  const mapped = ZIP_PREFIX_REGION[prefix];
  return mapped ? { region: mapped, source: 'ZIP_PREFIX' } : { region: 'MODERATE', source: 'NATIONAL_DEFAULT' };
}

/** The catalog's own template for a checklist item's task key, when it has one (the existing-checklist answer enriches items with it). */
export function seasonalTemplateByKey(taskKey: string): SeasonalTemplate | undefined {
  return (seasonalTemplates as unknown as SeasonalTemplate[]).find((template) => template.taskKey === taskKey);
}

/** Asset-free templates for a season and region, most important first. Asset-gated templates are excluded: they depend on recorded data. */
export function seasonalAssetFreeTasks(season: Season, region: SeasonalClimateRegion): SeasonalTemplate[] {
  return (seasonalTemplates as unknown as SeasonalTemplate[])
    .filter((template) => template.season === season && !template.requiredAssetType && !template.requiredAssetCheck && template.climateRegions.includes(region))
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3) || a.taskKey.localeCompare(b.taskKey));
}

/** What the handler knows about the home's own checklist for this season; the builder stays pure and, without it, offers no write. */
export interface SeasonalSetupContext {
  /** An owner of an existing home, with automatic checklists on: the only case the generator will run for. */
  canSetUp: boolean;
  checklist: { totalTasks: number; tasksAdded: number } | null;
}

export interface SeasonalHomeCareInput {
  zipCode: string | null | undefined;
  savedClimateRegion?: SeasonalClimateRegion | null;
  now: Date;
  focus: SeasonalHomeCareFocus;
  setup?: SeasonalSetupContext | null;
}

// Launch contexts. The plan's entity id is `<SEASON>:<year>`; a task's is `<FOCUS>:<taskKey>` so a walkthrough can return to the same plan.
export const SEASONAL_PLAN_ENTITY_TYPE = 'SEASONAL_PLAN';
export const SEASONAL_TASK_ENTITY_TYPE = 'SEASONAL_TASK';
const SEASONS: readonly Season[] = ['SPRING', 'SUMMER', 'FALL', 'WINTER'];

/** The pinned message of the "Set up my checklist" action; the season is read from it, never guessed from free text. */
export const seasonalSetupMessage = (season: Season): string => `Set up my ${SEASON_WORDS[season]} checklist.`;
export function seasonalFromSetupMessage(message: string): Season | null {
  const trimmed = message.trim();
  return SEASONS.find((season) => seasonalSetupMessage(season) === trimmed) ?? null;
}
export const seasonalPlanEntityId = (season: Season, year: number): string => `${season}:${year}`;
export function parseSeasonalPlanEntityId(value: string | null | undefined): { season: Season; year: number } | null {
  const [season, year] = String(value ?? '').split(':');
  const parsedYear = Number(year);
  return SEASONS.includes(season as Season) && Number.isInteger(parsedYear) ? { season: season as Season, year: parsedYear } : null;
}
export const seasonalTaskEntityId = (focus: SeasonalHomeCareFocus, taskKey: string): string => `${focus}:${taskKey}`;
export function parseSeasonalTaskEntityId(value: string | null | undefined): { focus: SeasonalHomeCareFocus; taskKey: string } | null {
  const separator = String(value ?? '').indexOf(':');
  if (separator < 0) return null;
  const focus = String(value).slice(0, separator);
  const taskKey = String(value).slice(separator + 1);
  return (focus === 'THIS_SEASON' || focus === 'NEXT_SEASON') && taskKey ? { focus, taskKey } : null;
}

/** The season this answer is about and the year the generator keys its checklist by (the year its START falls in). */
export function seasonalPlanWindow(now: Date, focus: SeasonalHomeCareFocus): { season: Season; year: number } {
  const window = focus === 'NEXT_SEASON' ? resolveUpcomingSeasonWindow(now) : resolveCurrentSeasonWindow(now);
  return { season: window.season, year: window.year };
}

const capitalize = (value: string) => `${value[0].toUpperCase()}${value.slice(1)}`;
const PRIORITY_LABELS: Record<string, string> = { CRITICAL: 'High priority', RECOMMENDED: 'Recommended', OPTIONAL: 'Optional' };
const money = (value: number) => `$${Math.round(value).toLocaleString('en-US')}`;

function timeLabel(hours: number): string {
  if (hours < 1) return `About ${Math.round(hours * 60)} minutes`;
  return `About ${hours % 1 === 0 ? hours : hours.toFixed(1)} ${hours === 1 ? 'hour' : 'hours'}`;
}

function timingLabel(offsetDays: number, season: Season): string {
  const weeks = Math.round(Math.abs(offsetDays) / 7);
  const span = Math.abs(offsetDays) >= 14 && Math.abs(offsetDays) % 7 === 0 ? `${weeks} weeks` : `${Math.abs(offsetDays)} days`;
  if (offsetDays < 0) return `Best done about ${span} before ${SEASON_WORDS[season]} starts`;
  if (offsetDays === 0) return `Best done when ${SEASON_WORDS[season]} starts`;
  return `Best done about ${span} into ${SEASON_WORDS[season]}`;
}

/**
 * The template's timing, said honestly for today. The offset is relative to the season's start, so once that moment has passed ("about 2 weeks
 * before winter starts" in the middle of winter) the label alone reads stale; it then keeps the template's fact and says now is the time.
 * `when` is absent for callers that have no date, which keeps the plain label.
 */
function timingFact(task: SeasonalTemplate, when?: { now: Date; year: number }): string {
  const label = timingLabel(task.timingOffsetDays ?? 0, task.season);
  if (!when) return label;
  const target = getSeasonStartDate(task.season, when.year);
  target.setDate(target.getDate() + (task.timingOffsetDays ?? 0));
  return when.now.getTime() > target.getTime() ? `${label}; if you have not yet, now is a good time` : label;
}

/** The facts the template itself records about a task, one per line, for the expandable "how to do it". Nothing is inferred about this home. */
export function seasonalTaskFacts(task: SeasonalTemplate, when?: { now: Date; year: number }): Array<{ label: string; value: string }> {
  const facts: Array<{ label: string; value: string }> = [{ label: 'What to do', value: task.description }];
  if (task.estimatedHours) facts.push({ label: 'Time it takes', value: timeLabel(task.estimatedHours) });
  const low = task.typicalCostMin ?? 0;
  const high = task.typicalCostMax ?? 0;
  if (high > 0) facts.push({ label: 'Typical cost', value: low > 0 && low !== high ? `${money(low)}\u2013${money(high)}` : money(high) });
  facts.push({ label: 'Who does it', value: task.isDiyPossible ? 'You can usually do this yourself' : 'Usually done by a professional' });
  if (task.timingOffsetDays != null) facts.push({ label: 'When', value: timingFact(task, when) });
  return facts;
}

const seasonalDetail = (task: SeasonalTemplate, when?: { now: Date; year: number }): string => seasonalTaskFacts(task, when).map((fact) => `${fact.label}: ${fact.value}`).join('\n');

const showChecklistAction = (season: Season, style: 'PRIMARY' | 'SECONDARY' = 'SECONDARY') => ({
  id: 'seasonal-show-checklist', label: `Show my ${SEASON_WORDS[season]} checklist`, interactionType: 'START_WORKFLOW' as const,
  message: `What seasonal maintenance tasks are on my ${SEASON_WORDS[season]} checklist?`, operationId: 'MAINTENANCE_STATUS', style,
});

const updateHomeDetailsAction = () => ({
  id: 'seasonal-update-home-details', label: 'Update home details', interactionType: 'START_WORKFLOW' as const,
  message: 'How complete is my home record?', operationId: 'PROPERTY_SUMMARY', style: 'SECONDARY' as const,
});

function regionNoteFor(region: SeasonalClimateRegion, source: ClimateRegionSource): string {
  return source === 'NATIONAL_DEFAULT'
    ? ` I could not map this zip code to a climate region, so this uses the national default (${REGION_WORDS[region]}); the seasonal settings page lets you change it.`
    : source === 'SAVED' ? ` This uses the climate region saved for this home (${REGION_WORDS[region]}).` : ` This is based on this home's zip code (${REGION_WORDS[region]}).`;
}

// How personal the answer is, said as context rather than a disclaimer: what it is based on, what it does not use, and what would change that.
// The plan lists only templates that need no recorded asset, so nothing recorded about the home is used here; the home's own checklist is where
// tasks for its recorded systems appear (the generator reads `requiredAssetType`).
const aboutBoundary = (): AskPresentationBlock => ({
  type: 'BOUNDARY', id: 'seasonal-home-care-boundary', title: 'About this recommendation',
  body: 'This is general guidance for your climate, not an assessment of this home, and it does not use anything recorded about your systems. Once your home record lists them, your own seasonal checklist can add tasks specific to those systems.',
  severity: 'INFO', suggestions: [],
});

const quotedTitles = (titles: readonly string[]): string => {
  const names = titles.map((title) => `\u201c${title}\u201d`);
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

// A title that reads like an internal key ("HVAC_FILTER_CHANGE") is record data, not language. The answer checker rejects authored text that
// contains one (askAnswerTrustValidator INTERNAL_TOKEN), so such a title is never quoted in the lead sentence; the tasks are still listed below it.
const INTERNAL_KEY_LIKE = /\b[A-Z]{3,}_[A-Z0-9_]{2,}\b/;

/**
 * The seasonal answers' lead sentence: the judgment (which tasks matter most, named, then how to pace the rest), shared by the general
 * winter-style plan and the home's own recorded checklist so neither says "the first N". Seasonal on purpose: the callers decide what is urgent
 * (catalog priority for the plan; priority and status for the recorded checklist) and pass the ordered urgent titles; this only words them.
 * `when` is a phrase like "this winter"; omit it when the answer spans seasons. If a leading title cannot be quoted safely the sentence still
 * makes the judgment (how many matter most, and that they are listed first) without naming them.
 */
export function seasonalLeadSentence(input: { urgentTitles: readonly string[]; laterCount: number; when?: string | null }): string {
  const { urgentTitles, laterCount } = input;
  const when = input.when ? ` ${input.when}` : '';
  if (urgentTitles.length === 0) {
    return `None of the ${laterCount === 1 ? 'one task' : `${laterCount} tasks`}${when} is urgent, so do ${laterCount === 1 ? 'it' : 'them'} when you have time.`;
  }
  const leading = urgentTitles.slice(0, 3);
  const single = urgentTitles.length === 1;
  const subject = single ? 'The one thing that matters most' : `The ${urgentTitles.length} things that matter most`;
  const pace = `Do ${single ? 'that' : 'those'} soon${laterCount ? `; the other ${laterCount} can wait until you have time` : ''}.`;
  if (leading.some((title) => INTERNAL_KEY_LIKE.test(title))) return `${subject}${when} ${single ? 'is' : 'are'} listed first. ${pace}`;
  const more = urgentTitles.length > leading.length ? `, plus ${urgentTitles.length - leading.length} more` : '';
  return `${subject}${when} ${single ? 'is' : 'are'} ${quotedTitles(leading)}${more}. ${pace}`;
}

export function buildSeasonalHomeCareResult(input: SeasonalHomeCareInput): AskOperationResult {
  const { season, year } = seasonalPlanWindow(input.now, input.focus);
  const { region, source } = deriveSeasonalClimateRegion(input.zipCode, input.savedClimateRegion);
  const tasks = seasonalAssetFreeTasks(season, region);
  const regionNote = regionNoteFor(region, source);
  const seasonWord = SEASON_WORDS[season];
  const title = `${input.focus === 'NEXT_SEASON' ? 'Getting ready for' : 'Home care for'} ${seasonWord}`;
  if (tasks.length === 0) {
    return {
      status: 'READY_WITH_LIMITATIONS', reasonCode: 'SEASONAL_HOME_CARE_NO_GENERAL_TASKS',
      blocks: [{ type: 'SUMMARY', id: 'seasonal-home-care-summary', title: `No general ${seasonWord} tasks for this climate`, body: `The seasonal catalog lists no general ${seasonWord} tasks for ${REGION_WORDS[region]}.${regionNote}`, tone: 'DEFAULT', actions: [] }, aboutBoundary()],
      suggestions: [],
    };
  }
  const shown = tasks.slice(0, MAX_ITEMS);
  const soon = shown.filter((task) => task.priority === 'CRITICAL');
  const later = shown.filter((task) => task.priority !== 'CRITICAL');
  // The judgment leads: what matters most, named (the producer's own priority tiers), then how to pace the rest. Climate and basis follow.
  const judgment = seasonalLeadSentence({
    urgentTitles: soon.map((task) => task.title), laterCount: later.length,
    when: input.focus === 'NEXT_SEASON' ? `before ${seasonWord}` : `this ${seasonWord}`,
  });
  const truncated = tasks.length > shown.length ? ` I am showing the top ${shown.length} of ${tasks.length}.` : '';
  const relation = input.focus === 'NEXT_SEASON' ? 'the next' : 'the current';
  let number = 0;
  const timingContext = { now: input.now, year };
  const toItem = (task: SeasonalTemplate, urgent: boolean) => {
    number += 1;
    return {
      id: task.taskKey, title: task.title, description: task.whyItMatters, condition: null, entityType: SEASONAL_TASK_ENTITY_TYPE,
      meta: [PRIORITY_LABELS[task.priority] ?? 'Optional', task.isDiyPossible ? 'DIY' : 'Usually a pro'],
      detail: seasonalDetail(task, timingContext), tone: urgent ? 'CAUTION' as const : 'DEFAULT' as const, status: null, href: null, countLabel: String(number),
    };
  };
  const sections = [
    soon.length ? { id: 'seasonal-soon', title: 'Do these soon', caption: 'Helps prevent costly issues and keeps your home safe and efficient.', count: soon.length, items: soon.map((task) => toItem(task, true)) } : null,
    later.length ? { id: 'seasonal-wait', title: 'Can wait', caption: 'Useful checks to keep your home in good shape.', count: later.length, items: later.map((task) => toItem(task, false)) } : null,
  ].filter((section): section is NonNullable<typeof section> => Boolean(section));

  const setup = input.setup ?? null;
  const checklist = setup?.checklist ?? null;
  const next = [
    ...(checklist
      ? [showChecklistAction(season, 'PRIMARY')]
      : setup?.canSetUp
        ? [{
          id: 'seasonal-add-tasks', label: 'Add these to my tasks', interactionType: 'START_WORKFLOW' as const, message: seasonalSetupMessage(season),
          operationId: 'SEASONAL_CHECKLIST_SETUP', entityType: SEASONAL_PLAN_ENTITY_TYPE, entityId: seasonalPlanEntityId(season, year), style: 'PRIMARY' as const,
        }]
        : []),
    {
      id: 'seasonal-walkthrough', label: 'Walk me through the first task', interactionType: 'START_WORKFLOW' as const,
      message: `Walk me through "${shown[0].title}".`, operationId: 'SEASONAL_HOME_CARE', entityType: SEASONAL_TASK_ENTITY_TYPE,
      entityId: seasonalTaskEntityId(input.focus, shown[0].taskKey), style: 'SECONDARY' as const,
    },
    updateHomeDetailsAction(),
  ];
  const nextBody = checklist
    ? `Your ${seasonWord} checklist is already set up with ${checklist.totalTasks} ${checklist.totalTasks === 1 ? 'task' : 'tasks'}, ${checklist.tasksAdded} in Maintenance.`
    : setup?.canSetUp
      ? `Adding tasks sets up your ${seasonWord} checklist for this home. You will review exactly what it adds before anything changes.`
      : 'Pick one. Nothing changes until you confirm it.';
  return {
    status: 'ANSWERED', reasonCode: 'SEASONAL_HOME_CARE_READY',
    blocks: [
      { type: 'SUMMARY', id: 'seasonal-home-care-summary', title, body: `${judgment}${truncated} ${capitalize(seasonWord)} is ${relation} season for your area.${regionNote}`, tone: 'DEFAULT', actions: [] },
      { type: 'GROUPED_LIST', id: 'seasonal-home-care-tasks', title: `${capitalize(seasonWord)} tasks`, actions: [], filters: [], sections },
      aboutBoundary(),
      { type: 'SUMMARY', id: 'seasonal-home-care-next', title: 'What would you like to do next?', body: nextBody, tone: 'DEFAULT', actions: next },
    ],
    suggestions: [],
  };
}

const GUIDE_ICONS: Record<string, 'HVAC' | 'PLUMBING' | 'ELECTRICAL' | 'ROOF' | 'OUTDOOR' | 'SAFETY' | 'APPLIANCE'> = {
  HVAC: 'HVAC', PLUMBING: 'PLUMBING', ELECTRICAL: 'ELECTRICAL', ROOFING: 'ROOF', LANDSCAPING: 'OUTDOOR', EXTERIOR: 'OUTDOOR', POOL: 'OUTDOOR',
  SAFETY: 'SAFETY', APPLIANCES: 'APPLIANCE',
};

const tildeTime = (hours: number) => (hours < 1 ? `~${Math.round(hours * 60)} minutes` : `~${hours % 1 === 0 ? hours : hours.toFixed(1)} ${hours === 1 ? 'hour' : 'hours'}`);

/**
 * One task's walkthrough as a single guide card, from the template's own recorded facts: what it is and why it matters, its key facts as
 * chips, what to do and when, why it is suggested now, and how general this advice is. Nothing is inferred about the home and no steps are
 * invented: a template records one description, so that is the "what to do". Null when the task is not among this season's general tasks.
 */
export function buildSeasonalTaskWalkthrough(input: SeasonalHomeCareInput & { taskKey: string }): AskOperationResult | null {
  const { season, year } = seasonalPlanWindow(input.now, input.focus);
  const { region } = deriveSeasonalClimateRegion(input.zipCode, input.savedClimateRegion);
  const shown = seasonalAssetFreeTasks(season, region).slice(0, MAX_ITEMS);
  const index = shown.findIndex((task) => task.taskKey === input.taskKey);
  if (index < 0) return null;
  const task = shown[index];
  const following = shown[index + 1];
  const seasonWord = SEASON_WORDS[season];
  const low = task.typicalCostMin ?? 0;
  const high = task.typicalCostMax ?? 0;
  const chips = [
    { label: PRIORITY_LABELS[task.priority] ?? 'Optional', kind: task.priority === 'CRITICAL' ? 'PRIORITY_HIGH' as const : 'PRIORITY' as const },
    ...(task.estimatedHours ? [{ label: tildeTime(task.estimatedHours), kind: 'TIME' as const }] : []),
    ...(high > 0 ? [{ label: low > 0 && low !== high ? `${money(low)}\u2013${money(high)}` : money(high), kind: 'COST' as const }] : []),
    { label: task.isDiyPossible ? 'DIY' : 'Usually a pro', kind: task.isDiyPossible ? 'DIY' as const : 'PRO' as const },
  ];
  const setup = input.setup ?? null;
  const planMessage = input.focus === 'NEXT_SEASON' ? SEASONAL_HOME_CARE_NEXT_SEASON_MESSAGE : SEASONAL_HOME_CARE_THIS_SEASON_MESSAGE;
  // No registered capability gives help with THIS task, and every action here continues the plan rather than the task, so the guide declares
  // no primary action: a plan-level step styled as the main one would imply the task itself has a next step.
  const actions = [
    ...(following ? [{
      id: 'seasonal-next-task', label: `Another ${seasonWord} task`, interactionType: 'START_WORKFLOW' as const, message: `Walk me through "${following.title}".`,
      operationId: 'SEASONAL_HOME_CARE', entityType: SEASONAL_TASK_ENTITY_TYPE, entityId: seasonalTaskEntityId(input.focus, following.taskKey), style: 'SECONDARY' as const,
    }] : []),
    ...(setup?.checklist
      ? [showChecklistAction(season)]
      : setup?.canSetUp
        ? [{
          id: 'seasonal-add-tasks', label: 'Add these to my tasks', interactionType: 'START_WORKFLOW' as const, message: seasonalSetupMessage(season),
          operationId: 'SEASONAL_CHECKLIST_SETUP', entityType: SEASONAL_PLAN_ENTITY_TYPE, entityId: seasonalPlanEntityId(season, year), style: 'SECONDARY' as const,
        }]
        : []),
    {
      id: 'seasonal-back-to-plan', label: `Back to the ${seasonWord} tasks`, interactionType: 'START_WORKFLOW' as const, message: planMessage,
      operationId: 'SEASONAL_HOME_CARE', style: 'SECONDARY' as const,
    },
    updateHomeDetailsAction(),
  ];
  const timing = task.timingOffsetDays != null ? timingFact(task, { now: input.now, year }) : null;
  return {
    status: 'ANSWERED', reasonCode: 'SEASONAL_TASK_WALKTHROUGH_READY',
    blocks: [{
      type: 'TASK_GUIDE', id: 'seasonal-task-guide', title: task.title, summary: task.whyItMatters,
      eyebrow: [`${capitalize(seasonWord)} prep`],
      icon: GUIDE_ICONS[task.serviceCategory ?? ''] ?? 'TASK', chips,
      main: { title: 'What to do', body: task.description, facts: [...(timing ? [{ label: 'When', value: timing }] : [])] },
      history: [],
      notes: [
        { id: 'why', title: 'Why this is on your list', body: `${capitalize(seasonWord)} is ${input.focus === 'NEXT_SEASON' ? 'the next' : 'the current'} season for your area, and this is one of the ${shown.length} general ${seasonWord} tasks for ${REGION_WORDS[region]}. ${PRIORITY_LABELS[task.priority] ?? 'Optional'} tasks like this one are listed ${task.priority === 'CRITICAL' ? 'first' : 'after the urgent ones'}.` },
        { id: 'personalized', title: 'How personalized is this?', body: 'This is general guidance for your climate. It does not use anything recorded about your home yet, so it cannot account for your specific systems. It becomes more specific as your home record fills in.', actionId: 'seasonal-update-home-details' },
      ],
      actions,
    }],
    suggestions: [],
  };
}
