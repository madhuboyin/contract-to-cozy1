// Item reserve allocation (composition FRD R-ATM-4): "how much of my reserve is set aside for the roof?". A STANDARD, read-only fact. It reads the reserve fund
// and its active line items directly (never `getOrCreateFund`, which creates a row), so it has no side effects. The reserve balance is one number the
// homeowner maintains; each item's share is the reserve fund's own split by cost, so the figure is labeled an estimate. The funding goal (a material
// decision) answers how much MORE to save; this answers only what is already set aside.
import { sourceRef } from '../composition/sourceAuthorization';
import { prisma } from '../../../lib/prisma';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { humanDate, money } from '../askFormatting';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { namedFundingTerms, selectFundingItems } from '../support/itemFundingWording';

const words = (value: unknown) => String(value).toLowerCase().replace(/_/g, ' ');
const dollars = (cents: number) => money(Math.round(cents / 100));
const list = (names: string[]) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`);

function notice(reasonCode: string, id: string, title: string, body: string, sources: ReturnType<typeof sourceRef>[] = []): AskOperationResult {
  return { status: 'READY_WITH_LIMITATIONS', reasonCode, parameters: { sources }, blocks: [{ type: 'SUMMARY', id, title, body, tone: 'CAUTION', actions: [] } as AskPresentationBlock], suggestions: [] };
}

export async function itemReserveAllocationResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
  const fund: any = await prisma.homeReserveFund.findUnique({ where: { propertyId } });
  if (!fund) {
    return notice('ITEM_RESERVE_NO_FUND', 'item-reserve-no-fund', 'No reserve fund is set up for your home yet',
      'A reserve fund tracks what you have set aside for big replacements. Once it exists, I can say how much is set aside for each item.');
  }
  const lines: any[] = await prisma.homeReserveFundLineItem.findMany({
    where: { fundId: fund.id, status: 'ACTIVE' },
    include: { timelineItem: { include: { inventoryItem: { select: { name: true } } } } },
    orderBy: { timelineItem: { windowStart: 'asc' } },
  });
  const named = namedFundingTerms(message);
  const candidates = lines.map((line) => ({ line, name: String(line.timelineItem?.inventoryItem?.name ?? words(line.timelineItem?.category ?? 'item')), category: String(line.timelineItem?.category ?? '') }));
  const matched = selectFundingItems(message, candidates);
  if (!matched.length) {
    const spoken = named[0] ?? null;
    return notice('ITEM_RESERVE_ITEM_NOT_FUNDED', 'item-reserve-no-item', spoken ? `There is no reserve line for your ${spoken}` : 'Tell me which item you mean',
      spoken ? `Your reserve fund tracks the items on your capital timeline. If the ${spoken} is not on it, nothing is set aside for it yet.` : 'Name the roof, HVAC, water heater or an appliance.', [sourceRef('HomeReserveFund', String(fund.id))]);
  }

  const rows = matched.map(({ line, name }) => {
    const target = Number(line.targetCostCents ?? 0);
    const allocated = Number(line.allocatedBalanceCents ?? 0);
    return { id: String(line.id), name, targetCents: target, allocatedCents: allocated, percent: target > 0 ? Math.min(100, Math.round((allocated / target) * 100)) : null };
  });
  const names = list(rows.map((row) => row.name));
  const allocated = rows.reduce((sum, row) => sum + row.allocatedCents, 0);
  const target = rows.reduce((sum, row) => sum + row.targetCents, 0);
  const balance = Number(fund.currentBalanceCents ?? 0);
  const never = !fund.lastRecalculatedAt;

  const sentences: string[] = [];
  sentences.push(allocated > 0
    ? `About ${dollars(allocated)} of your reserve balance is set aside for your ${names}${target > 0 ? `, ${Math.min(100, Math.round((allocated / target) * 100))}% of its ${dollars(target)} reserve target` : ''}.`
    : `Nothing in your reserve balance is set aside for your ${names} yet${target > 0 ? `; its reserve target is ${dollars(target)}` : ''}.`);
  sentences.push(`Your reserve balance is ${dollars(balance)} in all. It is one number you keep up to date, so each item's share is an estimate: the reserve fund splits it by each item's share of the reserve targets.`);
  if (never) sentences.push('The reserve targets have not been calculated yet, so these figures may be incomplete.');

  const blocks: AskPresentationBlock[] = [
    { type: 'SUMMARY', id: 'item-reserve-summary', title: allocated > 0 ? `${names}: about ${dollars(allocated)} set aside (estimate)` : `${names}: nothing set aside yet`, body: sentences.join(' '), tone: never || allocated === 0 ? 'CAUTION' : 'DEFAULT', actions: [] },
    {
      type: 'TABLE', id: 'item-reserve-items', title: rows.length > 1 ? 'Items included' : 'The item', description: 'Set aside is the item’s estimated share of your reserve balance; target is the reserve fund’s planning target for it.',
      columns: [{ key: 'item', label: 'Item' }, { key: 'setaside', label: 'Set aside (estimate)' }, { key: 'target', label: 'Reserve target' }, { key: 'funded', label: 'Of target' }],
      rows: rows.map((row) => ({ id: row.id, values: { item: row.name, setaside: dollars(row.allocatedCents), target: dollars(row.targetCents), funded: row.percent == null ? '—' : `${row.percent}%` } })), actions: [],
    },
    { type: 'EVIDENCE', id: 'item-reserve-evidence', title: 'Sources and freshness', items: [{ label: 'Reserve Fund', source: `Self-reported balance, ${String(fund.posture ?? 'MODERATE').toLowerCase()} planning style`, observedAt: fund.lastRecalculatedAt?.toISOString?.() ?? null }] },
    { type: 'BOUNDARY', id: 'item-reserve-boundary', title: 'An estimate from your own records', body: `The balance is self-reported, and the split by item is the reserve fund’s own. ${fund.lastRecalculatedAt ? `Targets last calculated ${humanDate(fund.lastRecalculatedAt)}.` : ''}`.trim(), severity: 'INFO' },
  ] as AskPresentationBlock[];
  return { status: never ? 'READY_WITH_LIMITATIONS' : 'ANSWERED', reasonCode: never ? 'ITEM_RESERVE_NOT_CALCULATED' : undefined, parameters: { sources: [sourceRef('HomeReserveFund', String(fund.id)), ...rows.map((row) => sourceRef('HomeReserveFundLineItem', row.id))] }, blocks, suggestions: [] };
}

registerCapabilityHandler('item-reserve-allocation.read', async (envelope) => itemReserveAllocationResult(envelope.userId, envelope.propertyId!, envelope.message));
