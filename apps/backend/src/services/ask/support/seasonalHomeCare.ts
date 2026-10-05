// Ask support: the seasonal home-care read (inventory D-O4 candidate). PURE and data-independent: it reads only the property's required
// location columns (zip code), an optional saved climate region, the date, and the LOCAL seasonal template catalog. It reads no recorded
// home data, makes no external call, and decides nothing about the home; it lists the general tasks that apply to a climate region in a
// season, restricted to templates that need no recorded asset. Not registered as an operation yet.
import climateData from '../../../data/zipToClimateRegion.json';
import seasonalTemplates from '../../../data/seasonalTaskTemplates.json';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { getNextSeason, resolveCurrentSeasonWindow, type Season } from '../../seasonal/seasonWindow';

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
}

const ZIP_PREFIX_REGION = (climateData as { zipPrefixMapping: Record<string, SeasonalClimateRegion> }).zipPrefixMapping;
const REGION_WORDS: Record<SeasonalClimateRegion, string> = { VERY_COLD: 'a very cold climate', COLD: 'a cold climate', MODERATE: 'a moderate climate', WARM: 'a warm climate', TROPICAL: 'a tropical climate' };
const SEASON_WORDS: Record<Season, string> = { SPRING: 'spring', SUMMER: 'summer', FALL: 'fall', WINTER: 'winter' };
const PRIORITY_ORDER: Record<string, number> = { CRITICAL: 0, RECOMMENDED: 1, OPTIONAL: 2 };
const MAX_ITEMS = 8;
const SEASONAL_PAGE = '/dashboard/seasonal';

/** Mirrors ClimateZoneService.detectClimateRegion (zip prefix, else MODERATE) so the answer agrees with the seasonal checklist, and says which. */
export function deriveSeasonalClimateRegion(zipCode: string | null | undefined, saved?: SeasonalClimateRegion | null): { region: SeasonalClimateRegion; source: ClimateRegionSource } {
  if (saved) return { region: saved, source: 'SAVED' };
  const prefix = String(zipCode ?? '').replace(/[\s-]/g, '').substring(0, 3);
  const mapped = ZIP_PREFIX_REGION[prefix];
  return mapped ? { region: mapped, source: 'ZIP_PREFIX' } : { region: 'MODERATE', source: 'NATIONAL_DEFAULT' };
}

/** Asset-free templates for a season and region, most important first. Asset-gated templates are excluded: they depend on recorded data. */
export function seasonalAssetFreeTasks(season: Season, region: SeasonalClimateRegion): SeasonalTemplate[] {
  return (seasonalTemplates as unknown as SeasonalTemplate[])
    .filter((template) => template.season === season && !template.requiredAssetType && !template.requiredAssetCheck && template.climateRegions.includes(region))
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3) || a.taskKey.localeCompare(b.taskKey));
}

export function buildSeasonalHomeCareResult(input: { zipCode: string | null | undefined; savedClimateRegion?: SeasonalClimateRegion | null; now: Date; focus: SeasonalHomeCareFocus }): AskOperationResult {
  const current = resolveCurrentSeasonWindow(input.now).season;
  const season = input.focus === 'NEXT_SEASON' ? getNextSeason(current) : current;
  const { region, source } = deriveSeasonalClimateRegion(input.zipCode, input.savedClimateRegion);
  const tasks = seasonalAssetFreeTasks(season, region);
  const openPage = { id: 'open-seasonal-checklist', label: 'Open seasonal checklist', href: SEASONAL_PAGE, style: 'PRIMARY' as const };
  const regionNote = source === 'NATIONAL_DEFAULT'
    ? ` I could not map this zip code to a climate region, so this uses the national default (${REGION_WORDS[region]}); the seasonal settings page lets you change it.`
    : source === 'SAVED' ? ` This uses the climate region saved for this home (${REGION_WORDS[region]}).` : ` This is based on this home's zip code (${REGION_WORDS[region]}).`;
  const boundary: AskPresentationBlock = {
    type: 'BOUNDARY', id: 'seasonal-home-care-boundary', title: 'General guidance',
    body: 'These are general seasonal tasks for the climate region, not an assessment of this home. They do not use anything recorded about your systems.',
    severity: 'INFO', suggestions: [],
  };
  const title = `${input.focus === 'NEXT_SEASON' ? 'Getting ready for' : 'Home care for'} ${SEASON_WORDS[season]}`;
  if (tasks.length === 0) {
    return {
      status: 'READY_WITH_LIMITATIONS', reasonCode: 'SEASONAL_HOME_CARE_NO_GENERAL_TASKS',
      blocks: [{ type: 'SUMMARY', id: 'seasonal-home-care-summary', title: `No general ${SEASON_WORDS[season]} tasks for this climate`, body: `The seasonal catalog lists no general ${SEASON_WORDS[season]} tasks for ${REGION_WORDS[region]}.${regionNote}`, tone: 'DEFAULT', actions: [openPage] }, boundary],
      suggestions: [],
    };
  }
  const shown = tasks.slice(0, MAX_ITEMS);
  return {
    status: 'ANSWERED', reasonCode: 'SEASONAL_HOME_CARE_READY',
    blocks: [{
      type: 'SUMMARY', id: 'seasonal-home-care-summary', title,
      body: `${tasks.length} general ${SEASON_WORDS[season]} ${tasks.length === 1 ? 'task applies' : 'tasks apply'} to ${REGION_WORDS[region]}.${regionNote}`,
      tone: 'DEFAULT', actions: [openPage],
    }, {
      type: 'GROUPED_LIST', id: 'seasonal-home-care-tasks', title: `${SEASON_WORDS[season][0].toUpperCase()}${SEASON_WORDS[season].slice(1)} tasks`, actions: [], filters: [],
      sections: [{
        id: `seasonal-${season.toLowerCase()}`, title: tasks.length > shown.length ? `Top ${shown.length} of ${tasks.length}` : `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`, count: tasks.length,
        items: shown.map((task) => ({
          id: task.taskKey, title: task.title, description: task.whyItMatters, condition: null,
          meta: [task.priority === 'CRITICAL' ? 'High priority' : task.priority === 'RECOMMENDED' ? 'Recommended' : 'Optional', task.isDiyPossible ? 'Can be a DIY task' : 'Usually a professional task'],
          status: null, href: null,
        })),
      }],
    }, boundary],
    suggestions: [],
  };
}
