// Item replacement cost (composition FRD Phase 1): "how much does a new roof cost?". A STANDARD, read-only fact. It reads the latest stored Home Capital
// Timeline analysis (or the roof recorded on the home profile) and states the cost through the one shared cost function in support/itemCost.ts: in today's
// dollars, at the item's expected replacement window, and grown to a date the homeowner names. It never recomputes the timeline, so it has no side effects;
// a missing or stale timeline is said plainly. The funding goal (a material decision) uses the same function, so the two never disagree.
import { prisma } from '../../../lib/prisma';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { getFinancialContextDecisions } from '../../financialContext/context';
import { HomeCapitalTimelineService, capitalCategoryDefault } from '../../homeCapitalTimeline.service';
import { PROFILE_ROOF_MESSAGE_PATTERN, profileRoofTimelineItem } from '../support/profileRoof';
import { humanDate, money } from '../askFormatting';
import { ensurePropertyAccess, isCapitalTimelineAnalysisStale } from '../askHandlerSupport';
import { namedFundingTerms, selectFundingItems } from '../support/itemFundingWording';
import { parseTargetDate } from '../support/targetDate';
import { growthRateOf } from '../support/capitalTimelineCost';
import { itemCostBases } from '../support/itemCost';
import type { Quantity } from '../composition/quantities';

const homeCapitalTimelineService = new HomeCapitalTimelineService();

const words = (value: unknown) => String(value).toLowerCase().replace(/_/g, ' ');
const dollars = (cents: number) => money(Math.round(cents / 100));
const range = (r: { minCents: number; maxCents: number }) => (r.minCents === r.maxCents ? dollars(r.minCents) : `${dollars(r.minCents)}–${dollars(r.maxCents)}`);
const list = (names: string[]) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`);

function notice(reasonCode: string, id: string, title: string, body: string): AskOperationResult {
  return { status: 'READY_WITH_LIMITATIONS', reasonCode, blocks: [{ type: 'SUMMARY', id, title, body, tone: 'CAUTION', actions: [] } as AskPresentationBlock], suggestions: [] };
}

export async function itemReplacementCostResult(userId: string, propertyId: string, message: string, now: Date = new Date()): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
  const target = parseTargetDate(message, now);
  const [property, financialContext, analysis]: [any, any, any] = await Promise.all([
    prisma.property.findUnique({ where: { id: propertyId }, select: { roofReplacementYear: true } }),
    getFinancialContextDecisions(propertyId, userId, 'CAPITAL_TIMELINE'),
    homeCapitalTimelineService.getLatestTimeline(propertyId),
  ]);
  const stale = analysis != null && isCapitalTimelineAnalysisStale(analysis, financialContext.contextVersion);
  const growthRate = growthRateOf(analysis);
  const timelineItems: any[] = Array.isArray(analysis?.items) ? [...analysis.items] : [];
  const profileRoofYear = PROFILE_ROOF_MESSAGE_PATTERN.test(message) ? property?.roofReplacementYear ?? null : null;
  if (profileRoofYear && !timelineItems.some((item) => item.category === 'ROOF')) {
    timelineItems.push(profileRoofTimelineItem({ roofReplacementYear: profileRoofYear, now, growthRate, roofDefault: capitalCategoryDefault('ROOF') }));
  }
  const matched = selectFundingItems(message, timelineItems.map((item) => ({ ...item, name: item.inventoryItem?.name ?? words(item.category) })));
  if (!matched.length) {
    const spoken = namedFundingTerms(message)[0] ?? null;
    if (!analysis && !profileRoofYear) {
      return notice('ITEM_COST_TIMELINE_REQUIRED', 'item-cost-no-timeline', 'There is no capital timeline for your home yet',
        'The cost of a new item comes from your home’s capital timeline, which is built from the systems and appliances on record. Add the item with its age and condition, then ask again.');
    }
    return notice('ITEM_COST_ITEM_NOT_ON_TIMELINE', 'item-cost-no-item', spoken ? `I don’t see a ${spoken} in your capital timeline` : 'Tell me which item you mean',
      spoken ? `Your timeline covers the systems and appliances recorded for your home. If the ${spoken} is not recorded, add it with its age and condition and I’ll state what a new one costs.` : 'Name the roof, HVAC, water heater or an appliance.');
  }

  const rows = matched.map((item) => {
    const stored = { min: item.estimatedCostMinCents ?? item.estimatedCostMaxCents ?? 0, max: item.estimatedCostMaxCents ?? item.estimatedCostMinCents ?? 0 };
    const windowStart = new Date(item.windowStart);
    const windowEnd = new Date(item.windowEnd);
    const computed = itemCostBases({ storedMinCents: stored.min, storedMaxCents: stored.max, windowStart, windowEnd, growthRate, now, targetDate: target?.date ?? null });
    // A roof read from the home profile states today's cost as the timeline's roof default itself, exactly as the profile-roof answer does, so the two never differ.
    const roofDefault = capitalCategoryDefault('ROOF');
    const bases = item.fromProfile === true ? { ...computed, today: { minCents: roofDefault.costMinCents, maxCents: roofDefault.costMaxCents } } : computed;
    return { id: String(item.id), itemKey: String(item.category ?? 'ITEM'), name: String(item.inventoryItem?.name ?? words(item.category)), windowStart, windowEnd, bases, missing: stored.min === 0 && stored.max === 0, fromProfile: item.fromProfile === true };
  });
  const names = list(rows.map((row) => row.name));
  const missingCost = rows.some((row) => row.missing);
  const fromProfile = rows.some((row) => row.fromProfile);
  const sum = (pick: (row: (typeof rows)[number]) => { minCents: number; maxCents: number }) => ({ minCents: rows.reduce((a, r) => a + pick(r).minCents, 0), maxCents: rows.reduce((a, r) => a + pick(r).maxCents, 0) });
  const today = sum((r) => r.bases.today);
  const atWindow = sum((r) => r.bases.window);
  const atTarget = target ? sum((r) => r.bases.target ?? r.bases.window) : null;
  const earliest = rows.reduce((a, r) => (r.windowStart < a ? r.windowStart : a), rows[0].windowStart);

  const sentences: string[] = [];
  sentences.push(`${rows.length === 1 ? 'A new' : 'New'} ${names} ${rows.length === 1 ? 'costs' : 'cost'} about ${range(today)} in today’s dollars.`);
  if (atTarget) sentences.push(`Grown to ${target!.label}, that is about ${range(atTarget)}.`);
  sentences.push(`At the window your home record expects it (${humanDate(earliest)}), the estimate is about ${range(atWindow)}.`);
  if (missingCost) sentences.push('One item has no cost estimate yet, so its share is counted as $0.');
  if (stale) sentences.push('Your capital timeline is out of date, so these figures may have moved; open the capital plan to refresh it.');

  const blocks: AskPresentationBlock[] = [
    {
      type: 'SUMMARY', id: 'item-cost-summary',
      title: `${rows.length === 1 ? 'A new' : 'New'} ${names} is about ${dollars(Math.round((today.minCents + today.maxCents) / 2))} in today’s dollars`,
      body: sentences.join(' '), tone: missingCost || stale ? 'CAUTION' : 'DEFAULT', actions: [],
    },
    {
      type: 'TABLE', id: 'item-cost-items', title: rows.length > 1 ? 'Items included' : 'The item',
      description: 'Today’s dollars take the timeline’s stored estimate back to today with the timeline’s own cost growth; the window figure is the estimate as stored.',
      columns: [{ key: 'item', label: 'Item' }, { key: 'today', label: 'Today’s dollars' }, { key: 'window', label: 'Expected window' }, { key: 'atwindow', label: 'At the window' }, ...(target ? [{ key: 'atdate', label: `At ${target.label}` }] : [])],
      rows: rows.map((row) => ({ id: row.id, values: { item: row.name, today: range(row.bases.today), window: `${humanDate(row.windowStart)}–${humanDate(row.windowEnd)}`, atwindow: range(row.bases.window), ...(target ? { atdate: range(row.bases.target ?? row.bases.window) } : {}) } })),
      actions: [],
    },
    {
      type: 'EVIDENCE', id: 'item-cost-evidence', title: 'Sources and freshness',
      items: [
        ...(analysis ? [{ label: 'Home Capital Timeline', source: `${Array.isArray(analysis.items) ? analysis.items.length : 0} items, ${analysis.horizonYears ?? 10}-year horizon`, observedAt: analysis.computedAt?.toISOString?.() ?? null }] : []),
        ...(fromProfile ? [{ label: 'Home profile', source: 'Roof year on your home profile, with the capital timeline’s roof default for life and cost (no tracked roof item)', observedAt: null }] : []),
      ],
    },
    { type: 'BOUNDARY', id: 'item-cost-boundary', title: 'Planning figure—not a quote', body: 'Actual prices depend on materials, labor, permits and when you do the work.', severity: 'INFO' },
  ] as AskPresentationBlock[];
  // Typed declarations of what this answer states, so a composed answer can keep one basis per quantity (composition FRD §6.3).
  const quantities: Quantity[] = rows.filter((row) => !row.missing).flatMap((row) => [
    { key: 'item.replacementCost' as const, itemKey: row.itemKey, basis: 'TODAY' as const, minCents: row.bases.today.minCents, maxCents: row.bases.today.maxCents },
    { key: 'item.replacementCost' as const, itemKey: row.itemKey, basis: 'WINDOW' as const, minCents: row.bases.window.minCents, maxCents: row.bases.window.maxCents },
    ...(row.bases.target && target ? [{ key: 'item.replacementCost' as const, itemKey: row.itemKey, basis: 'TARGET' as const, minCents: row.bases.target.minCents, maxCents: row.bases.target.maxCents, targetLabel: target.label }] : []),
  ]);
  return {
    parameters: { quantities },
    status: missingCost || stale || fromProfile ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: missingCost ? 'ITEM_COST_MISSING' : stale ? 'ITEM_COST_TIMELINE_STALE' : fromProfile ? 'ITEM_COST_FROM_PROFILE' : undefined,
    blocks, suggestions: [],
  };
}

registerCapabilityHandler('item-replacement-cost.read', async (envelope) => itemReplacementCostResult(envelope.userId, envelope.propertyId!, envelope.message));
