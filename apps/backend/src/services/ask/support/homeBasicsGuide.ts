// Ask support: the authored home-basics read (exact-four starter source, inventory D-O4, owner approved October 5, 2026). PURE and entirely
// data-independent: authored, evergreen general guidance with no input but the focus. It reads no recorded home data, makes no external call
// and assesses nothing about the home. The CONTENT below is a DRAFT for product and safety review; it is deliberately conservative and
// defers to the homeowner's own manufacturer instructions, local codes and utilities. Not registered as a message route.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { SEASONAL_HOME_CARE_THIS_SEASON_MESSAGE } from './seasonalHomeCare';

export type HomeBasicsFocus = 'SAFETY_BASICS' | 'MONTHLY_ROUTINE';

/** The two stored starter messages; the launch's message selects the focus (see the handler). */
export const HOME_BASICS_SAFETY_MESSAGE = 'What home safety basics should I know?';
export const HOME_BASICS_MONTHLY_MESSAGE = 'What should I check around my home each month?';

interface BasicsItem { id: string; title: string; description: string }
interface BasicsGuide { title: string; intro: string; sectionTitle: string; /** How many items show before "Show more"; the items after it are the lesser ones. Omitted: all show. */ initialVisibleCount?: number; items: readonly BasicsItem[] }

const GUIDES: Readonly<Record<HomeBasicsFocus, BasicsGuide>> = {
  SAFETY_BASICS: {
    title: 'Home safety basics',
    intro: 'Three things matter most if something goes wrong: working smoke and carbon monoxide alarms, knowing where your water shuts off, and knowing your electrical panel. The rest are worth doing next.',
    sectionTitle: 'Most important first',
    initialVisibleCount: 3,
    items: [
      { id: 'alarms', title: 'Smoke and carbon monoxide alarms', description: 'They are what wakes you in a fire. Have working alarms on every level and near sleeping areas, test them regularly, and replace them by the manufacturer\'s date.' },
      { id: 'water-shutoff', title: 'Find your main water shutoff', description: 'A burst pipe can do thousands in damage in minutes. Know where the shutoff is and that it turns, so you can stop the water quickly.' },
      { id: 'electrical-panel', title: 'Know your electrical panel', description: 'In an electrical emergency you need to cut power fast. Find the panel and check that the breakers are labeled so you can switch off one circuit.' },
      { id: 'gas-shutoff', title: 'Know whether you have gas, and where it shuts off', description: 'If your home has gas service, find the shutoff (usually at the meter). Not sure whether you have gas? Look for a gas meter outside, a gas line to a range, water heater or furnace, or a gas bill from a utility; your utility or landlord can tell you.' },
      { id: 'extinguisher', title: 'Keep a fire extinguisher where you can reach it', description: 'Keep one near the kitchen, check that its gauge is in the green, and know how to use it.' },
      { id: 'emergency-contacts', title: 'Keep emergency numbers handy', description: 'Keep your utilities, a trusted plumber and electrician, and your insurer\'s claims line somewhere everyone in the household can find them.' },
    ],
  },
  MONTHLY_ROUTINE: {
    title: 'A simple monthly home routine',
    intro: 'A short walk-through each month catches small problems before they become expensive ones.',
    sectionTitle: 'Once a month',
    items: [
      { id: 'walkthrough', title: 'Walk through every room', description: 'Look for new stains, cracks, damp spots, musty smells or anything that looks or sounds different from last month.' },
      { id: 'leaks', title: 'Check under sinks and around fixtures', description: 'Look and feel for moisture under sinks and around toilets, the water heater and appliance hookups.' },
      { id: 'alarm-test', title: 'Test smoke and carbon monoxide alarms', description: 'Press the test button and note any chirping that signals a low battery.' },
      { id: 'filters', title: 'Check air filters', description: 'Look at your heating and cooling filter and replace it when it is dirty, following the manufacturer\'s guidance.' },
      { id: 'outside', title: 'Look around the outside', description: 'Check that water drains away from the house, that downspouts are clear, and for loose or damaged siding, railings or steps.' },
    ],
  },
};

export function homeBasicsFocus(message: string): HomeBasicsFocus {
  return /\bmonth(?:ly)?\b|\beach month\b|\bevery month\b/i.test(message) ? 'MONTHLY_ROUTINE' : 'SAFETY_BASICS';
}

/** The gas-leak instruction as its own emergency statement (FRD C.11.6/C.11.9), not a line inside a list item. Its title and text carry the severity. */
const gasEmergencyBoundary = (): AskPresentationBlock => ({
  type: 'BOUNDARY', id: 'home-basics-gas-emergency', title: 'If you smell gas',
  body: 'Leave the home right away. Do not turn lights or appliances on or off, and do not use a phone inside. Call your gas utility or the emergency number from outside.',
  severity: 'EMERGENCY', suggestions: [],
});

const nextSteps = (focus: HomeBasicsFocus): AskPresentationBlock => ({
  type: 'SUMMARY', id: 'home-basics-next', title: 'What would you like to do next?', body: 'Both are general guides. Nothing here changes your home record.', tone: 'DEFAULT',
  actions: [
    focus === 'SAFETY_BASICS'
      ? { id: 'home-basics-monthly-routine', label: 'A simple monthly routine', interactionType: 'START_WORKFLOW' as const, message: HOME_BASICS_MONTHLY_MESSAGE, operationId: 'HOME_BASICS_GUIDE', outcomeKey: 'REVIEW_MONTHLY_ROUTINE', style: 'SECONDARY' as const }
      : { id: 'home-basics-safety-basics', label: 'Home safety basics', interactionType: 'START_WORKFLOW' as const, message: HOME_BASICS_SAFETY_MESSAGE, operationId: 'HOME_BASICS_GUIDE', outcomeKey: 'REVIEW_SAFETY_BASICS', style: 'SECONDARY' as const },
    { id: 'home-basics-seasonal-plan', label: 'Home care for this season', interactionType: 'START_WORKFLOW' as const, message: SEASONAL_HOME_CARE_THIS_SEASON_MESSAGE, operationId: 'SEASONAL_HOME_CARE', outcomeKey: 'REVIEW_THIS_SEASON', style: 'SECONDARY' as const },
  ],
});

export function buildHomeBasicsResult(focus: HomeBasicsFocus): AskOperationResult {
  const guide = GUIDES[focus];
  const boundary: AskPresentationBlock = {
    type: 'BOUNDARY', id: 'home-basics-boundary', title: 'General guidance',
    body: 'This is general guidance, not an assessment of your home, and it does not use anything recorded about it. Follow your manufacturers\' instructions, local codes and your utilities\' advice, and call a licensed professional or emergency services when in doubt.',
    severity: 'INFO', suggestions: [],
  };
  return {
    status: 'ANSWERED', reasonCode: 'HOME_BASICS_READY',
    blocks: [{
      type: 'SUMMARY', id: 'home-basics-summary', title: guide.title, body: guide.intro, tone: 'DEFAULT', actions: [],
    }, {
      type: 'GROUPED_LIST', id: 'home-basics-items', title: guide.title, actions: [], filters: [],
      sections: [{
        id: `home-basics-${focus.toLowerCase()}`, title: guide.sectionTitle, count: guide.items.length,
        ...(guide.initialVisibleCount ? { initialVisibleCount: guide.initialVisibleCount } : {}),
        items: guide.items.map((item, index) => ({ id: item.id, title: item.title, description: item.description, condition: null, meta: [], status: null, href: null, countLabel: String(index + 1) })),
      }],
    },
    ...(focus === 'SAFETY_BASICS' ? [gasEmergencyBoundary()] : []),
    nextSteps(focus), boundary],
    suggestions: [],
  };
}
