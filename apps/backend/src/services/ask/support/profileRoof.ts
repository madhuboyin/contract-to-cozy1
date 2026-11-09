// Ask support: the roof lives on the home profile (the year it was last replaced, and its type), not as a tracked inventory item, so a home can have a roof on
// record and no roof item. The capital timeline and the repair-or-replace read work from tracked items only; this gives answers that name the roof a
// timeline-shaped item built from the profile and the timeline's own roof default (expected life and cost range), so the figures match the timeline's.
// Costs are stored the way the timeline stores them: already grown to the middle of the expected window.

import { grow, yearsBetween } from './itemFunding';

export interface RoofDefault { lifespanYears: number; costMinCents: number; costMaxCents: number }

export interface ProfileRoofTimelineItem {
  id: 'profile-roof';
  category: 'ROOF';
  windowStart: Date;
  windowEnd: Date;
  estimatedCostMinCents: number;
  estimatedCostMaxCents: number;
  confidence: 'LOW';
  inventoryItem: { name: string };
  fromProfile: true;
}

export function profileRoofTimelineItem(input: { roofReplacementYear: number; now: Date; growthRate: number; roofDefault: RoofDefault }): ProfileRoofTimelineItem {
  const { roofReplacementYear, now, growthRate, roofDefault } = input;
  const endYear = roofReplacementYear + roofDefault.lifespanYears;
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  // A roof past its planned life is due now: the window opens this month and runs a year.
  const windowStart = endYear > now.getFullYear() ? new Date(endYear, 0, 1) : thisMonth;
  const windowEnd = endYear > now.getFullYear() ? new Date(endYear, 11, 31) : new Date(now.getFullYear() + 1, now.getMonth(), 1);
  const mid = new Date((windowStart.getTime() + windowEnd.getTime()) / 2);
  const years = yearsBetween(now, mid);
  return {
    id: 'profile-roof', category: 'ROOF', windowStart, windowEnd,
    estimatedCostMinCents: grow(roofDefault.costMinCents, growthRate, years), estimatedCostMaxCents: grow(roofDefault.costMaxCents, growthRate, years),
    confidence: 'LOW', inventoryItem: { name: 'Roof' }, fromProfile: true,
  };
}

const roofMoney = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;

/** The roof as the home profile records it, in the words both the age question and the repair-or-replace question use. */
export function profileRoofSummary(input: { roofReplacementYear: number; roofType: string | null; now: Date; roofDefault: RoofDefault; repairNote: boolean }): { title: string; body: string; tone: 'DEFAULT' | 'CAUTION' } {
  const { roofReplacementYear: year, roofDefault } = input;
  const thisYear = input.now.getFullYear();
  const age = Math.max(0, thisYear - year);
  const endYear = year + roofDefault.lifespanYears;
  const left = endYear - thisYear;
  const type = input.roofType ? input.roofType.toLowerCase().replace(/_/g, ' ') : null;
  return {
    title: `Your roof is about ${age} year${age === 1 ? '' : 's'} old`,
    body: `Your home profile records the roof from ${year}${type ? ` (${type})` : ''}. A roof is planned to last about ${roofDefault.lifespanYears} years, so that points to around ${endYear}${left > 0 ? `, about ${left} year${left === 1 ? '' : 's'} from now` : ', which has already passed'}. A new roof typically costs about ${roofMoney(roofDefault.costMinCents)} to ${roofMoney(roofDefault.costMaxCents)} in today’s dollars; that is the planning default, not a quote, and the real price depends on size, pitch and material.${input.repairNote ? ' I can’t judge repair against replacement because that analysis works from a tracked item with its own condition and history.' : ''}`,
    tone: left <= 0 ? 'CAUTION' : 'DEFAULT',
  };
}

export const PROFILE_ROOF_MESSAGE_PATTERN = /\broof(?:ing)?\b/i;
