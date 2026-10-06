// Ask support: the seasonal home-care read (inventory D-O4 candidate). PURE and data-independent: it reads only the property's required
// location columns (zip code), an optional saved climate region, the date, and the LOCAL seasonal template catalog. It reads no recorded
// home data, makes no external call, and decides nothing about the home; it lists the general tasks that apply to a climate region in a
// season, restricted to templates that need no recorded asset. Not registered as an operation yet.
import climateData from '../../../data/zipToClimateRegion.json';
import seasonalTemplates from '../../../data/seasonalTaskTemplates.json';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { resolveCurrentSeasonWindow, resolveUpcomingSeasonWindow, type Season } from '../../seasonal/seasonWindow';

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
  typicalCostMin?: number | null; typicalCostMax?: number | null; estimatedHours?: number | null; timingOffsetDays?: number | null;
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

/** The facts the template itself records about a task, one per line, for the expandable "how to do it". Nothing is inferred about this home. */
export function seasonalTaskFacts(task: SeasonalTemplate): Array<{ label: string; value: string }> {
  const facts: Array<{ label: string; value: string }> = [{ label: 'What to do', value: task.description }];
  if (task.estimatedHours) facts.push({ label: 'Time it takes', value: timeLabel(task.estimatedHours) });
  const low = task.typicalCostMin ?? 0;
  const high = task.typicalCostMax ?? 0;
  if (high > 0) facts.push({ label: 'Typical cost', value: low > 0 && low !== high ? `${money(low)}\u2013${money(high)}` : money(high) });
  facts.push({ label: 'Who does it', value: task.isDiyPossible ? 'You can usually do this yourself' : 'Usually done by a professional' });
  if (task.timingOffsetDays != null) facts.push({ label: 'When', value: timingLabel(task.timingOffsetDays, task.season) });
  return facts;
}

const seasonalDetail = (task: SeasonalTemplate): string => seasonalTaskFacts(task).map((fact) => `${fact.label}: ${fact.value}`).join('\n');

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

const aboutBoundary = (): AskPresentationBlock => ({
  type: 'BOUNDARY', id: 'seasonal-home-care-boundary', title: 'About this recommendation',
  body: 'These are general seasonal tasks for the climate region, not an assessment of this home. They do not use anything recorded about your systems, so they become more specific as your home record fills in.',
  severity: 'INFO', suggestions: [],
});

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
  const countSentence = `Here ${shown.length === 1 ? 'is 1 thing' : `are ${shown.length} things`} to focus on${tasks.length > shown.length ? ` (the top ${shown.length} of ${tasks.length})` : ''}.`;
  const orderSentence = soon.length && later.length
    ? ` I recommend doing the first ${soon.length} soon, and the other ${later.length} when you have time.`
    : soon.length ? ` I recommend doing ${soon.length === 1 ? 'it' : 'all of them'} soon.` : ' None of these is urgent, so do them when you have time.';
  let number = 0;
  const toItem = (task: SeasonalTemplate, urgent: boolean) => {
    number += 1;
    return {
      id: task.taskKey, title: task.title, description: task.whyItMatters, condition: null, entityType: SEASONAL_TASK_ENTITY_TYPE,
      meta: [PRIORITY_LABELS[task.priority] ?? 'Optional', task.isDiyPossible ? 'DIY' : 'Usually a pro'],
      detail: seasonalDetail(task), tone: urgent ? 'CAUTION' as const : 'DEFAULT' as const, status: null, href: null, countLabel: String(number),
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
      { type: 'SUMMARY', id: 'seasonal-home-care-summary', title, body: `${capitalize(seasonWord)} is ${input.focus === 'NEXT_SEASON' ? 'the next' : 'the current'} season for your area.${regionNote} ${countSentence}${orderSentence}`, tone: 'DEFAULT', actions: [] },
      { type: 'GROUPED_LIST', id: 'seasonal-home-care-tasks', title: `${capitalize(seasonWord)} tasks`, actions: [], filters: [], sections },
      aboutBoundary(),
      { type: 'SUMMARY', id: 'seasonal-home-care-next', title: 'What would you like to do next?', body: nextBody, tone: 'DEFAULT', actions: next },
    ],
    suggestions: [],
  };
}

/** One task's walkthrough, from the template's own recorded facts. Null when the task is not among this season's general tasks. */
export function buildSeasonalTaskWalkthrough(input: SeasonalHomeCareInput & { taskKey: string }): AskOperationResult | null {
  const { season } = seasonalPlanWindow(input.now, input.focus);
  const { region } = deriveSeasonalClimateRegion(input.zipCode, input.savedClimateRegion);
  const shown = seasonalAssetFreeTasks(season, region).slice(0, MAX_ITEMS);
  const index = shown.findIndex((task) => task.taskKey === input.taskKey);
  if (index < 0) return null;
  const task = shown[index];
  const following = shown[index + 1];
  const facts = seasonalTaskFacts(task);
  const actions = [
    ...(following ? [{
      id: 'seasonal-next-task', label: 'Next task', interactionType: 'START_WORKFLOW' as const, message: `Walk me through "${following.title}".`,
      operationId: 'SEASONAL_HOME_CARE', entityType: SEASONAL_TASK_ENTITY_TYPE, entityId: seasonalTaskEntityId(input.focus, following.taskKey), style: 'PRIMARY' as const,
    }] : []),
    {
      id: 'seasonal-back-to-plan', label: `Back to the ${SEASON_WORDS[season]} tasks`, interactionType: 'START_WORKFLOW' as const,
      message: input.focus === 'NEXT_SEASON' ? SEASONAL_HOME_CARE_NEXT_SEASON_MESSAGE : SEASONAL_HOME_CARE_THIS_SEASON_MESSAGE,
      operationId: 'SEASONAL_HOME_CARE', style: 'SECONDARY' as const,
    },
  ];
  return {
    status: 'ANSWERED', reasonCode: 'SEASONAL_TASK_WALKTHROUGH_READY',
    blocks: [
      { type: 'SUMMARY', id: 'seasonal-task-summary', title: task.title, body: `${task.whyItMatters} Task ${index + 1} of ${shown.length} for ${SEASON_WORDS[season]}.`, tone: task.priority === 'CRITICAL' ? 'CAUTION' : 'DEFAULT', actions },
      {
        type: 'GROUPED_LIST', id: 'seasonal-task-details', title: 'About this task', actions: [], filters: [],
        sections: [{ id: 'seasonal-task-facts', title: PRIORITY_LABELS[task.priority] ?? 'Optional', count: facts.length, items: facts.map((fact, factIndex) => ({ id: `seasonal-fact-${factIndex}`, title: fact.label, description: fact.value, condition: null, meta: [], status: null, href: null })) }],
      },
      aboutBoundary(),
    ],
    suggestions: [],
  };
}
