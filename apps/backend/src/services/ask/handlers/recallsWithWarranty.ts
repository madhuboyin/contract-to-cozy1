// FR-PLAN-5 (live prompt #61): "show appliances that have open recalls and no active warranty". Two recorded facts about the same inventory items are combined:
// an OPEN recall match (RecallMatch.status) and the item's warranty coverage (Warranty.inventoryItemId, plus whole-home plan applicability marked COVERED).
// Pure: the loader and the status function are passed in, so every rule is tested without a database.
import type { AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import type { AskOperationResult } from '../askOperationRegistry';
import { inventoryCorrectionItemActions } from './inventory.handler';

export type RecallWarrantyPolarity = 'WITHOUT_ACTIVE_WARRANTY' | 'WITH_ACTIVE_WARRANTY';
export interface RecallWarrantyAsk { polarity: RecallWarrantyPolarity; appliancesOnly: boolean }

const RECALL = /\brecall(?:s|ed)?\b/i;
const NEGATIVE_WARRANTY = /\b(?:no|without|lack(?:ing)?|missing|not\s+(?:under|covered)|(?:do(?:es)?n['’]?t|do(?:es)?\s+not)\s+have|expired)\b[^.?!]{0,30}\bwarrant/i;
const POSITIVE_WARRANTY = /\b(?:with|has|have|having|under|covered\s+by)\b[^.?!]{0,45}\b(?:active|current|valid)?\s*warrant/i;

/** Whether the message asks for items by BOTH an open recall and a warranty condition, and which way the warranty condition points. Null for anything else. */
export function parseRecallWarrantyAsk(message: string): RecallWarrantyAsk | null {
  if (!RECALL.test(message) || !/\bwarrant/i.test(message)) return null;
  const negative = NEGATIVE_WARRANTY.test(message);
  if (!negative && !POSITIVE_WARRANTY.test(message)) return null;
  return { polarity: negative ? 'WITHOUT_ACTIVE_WARRANTY' : 'WITH_ACTIVE_WARRANTY', appliancesOnly: /\bappliances?\b/i.test(message) };
}

export type LinkedWarrantyStatus = 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'STARTS_LATER' | 'NEEDS_REVIEW';
export interface RecallWarrantyItem { id: string; name: string; category: string }
export interface RecallWarrantyInput {
  ask: RecallWarrantyAsk;
  items: readonly RecallWarrantyItem[];
  /** Inventory item ids with an OPEN recall match. */
  openRecallItemIds: ReadonlySet<string>;
  /** Inventory item ids whose only recall match still needs the homeowner's confirmation; never counted as open. */
  unconfirmedRecallItemIds: ReadonlySet<string>;
  /** The status of every warranty that applies to the item (linked directly, or by a whole-home plan marked COVERED). */
  warrantyStatusesByItem: ReadonlyMap<string, readonly LinkedWarrantyStatus[]>;
  /** Inventory item ids with no model number recorded: they cannot be matched against recalls, so "no match" says nothing about them. */
  missingModelItemIds?: ReadonlySet<string>;
  /** Whether the person may edit inventory; the "add model number" row action is offered only then. */
  canEdit?: boolean;
}

export interface RecallWarrantyClassification {
  matches: RecallWarrantyItem[];
  /** Open recall, and a warranty whose dates need review: neither covered nor uncovered, so never merged into either list (owner decision v1.7). */
  needsReview: RecallWarrantyItem[];
  openRecallCount: number;
  unconfirmedOnly: RecallWarrantyItem[];
}

const ACTIVE: ReadonlySet<LinkedWarrantyStatus> = new Set(['ACTIVE', 'EXPIRING']);

export function classifyRecallsWithWarranty(input: RecallWarrantyInput): RecallWarrantyClassification {
  const inScope = input.items.filter((item) => !input.ask.appliancesOnly || item.category === 'APPLIANCE');
  const open = inScope.filter((item) => input.openRecallItemIds.has(item.id));
  const matches: RecallWarrantyItem[] = [];
  const needsReview: RecallWarrantyItem[] = [];
  for (const item of open) {
    const statuses = input.warrantyStatusesByItem.get(item.id) ?? [];
    const covered = statuses.some((status) => ACTIVE.has(status));
    if (covered) { if (input.ask.polarity === 'WITH_ACTIVE_WARRANTY') matches.push(item); continue; }
    if (statuses.includes('NEEDS_REVIEW')) { needsReview.push(item); continue; }
    if (input.ask.polarity === 'WITHOUT_ACTIVE_WARRANTY') matches.push(item);
  }
  const unconfirmedOnly = inScope.filter((item) => input.unconfirmedRecallItemIds.has(item.id) && !input.openRecallItemIds.has(item.id));
  return { matches, needsReview, openRecallCount: open.length, unconfirmedOnly };
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function recallsWithWarrantyResult(input: RecallWarrantyInput, boundary: AskPresentationBlock): AskOperationResult {
  const { ask } = input;
  const found = classifyRecallsWithWarranty(input);
  const subject = ask.appliancesOnly ? 'appliances' : 'items';
  const condition = ask.polarity === 'WITHOUT_ACTIVE_WARRANTY' ? 'no active warranty' : 'an active warranty';
  const headline = found.matches.length > 0
    ? `${plural(found.matches.length, `${ask.appliancesOnly ? 'appliance has' : 'item has'}`, `${subject} have`)} an open recall and ${condition}.`
    : `No ${subject} have an open recall and ${condition}.`;
  const notes = [
    found.openRecallCount === 0 ? `None of your ${subject} has an open recall recorded.` : `${plural(found.openRecallCount, `${ask.appliancesOnly ? 'appliance has' : 'item has'}`, `${subject} have`)} an open recall.`,
    found.needsReview.length > 0 ? `${plural(found.needsReview.length, 'open-recall item has a warranty whose dates need review and is', 'open-recall items have warranties whose dates need review and are')} listed separately, not counted either way.` : null,
    found.unconfirmedOnly.length > 0 ? `${plural(found.unconfirmedOnly.length, 'more has a possible recall that still needs your confirmation and is', 'more have possible recalls that still need your confirmation and are')} not counted as open.` : null,
  ].filter((note): note is string => Boolean(note));
  const inScope = input.items.filter((item) => !ask.appliancesOnly || item.category === 'APPLIANCE');
  const missingModel = inScope.filter((item) => input.missingModelItemIds?.has(item.id));
  // Nothing open AND some items unmatchable: "no recall" would read as a clean result, so the answer leads with what could not be checked.
  const incomplete = found.openRecallCount === 0 && missingModel.length > 0;
  const addModelAction = inventoryCorrectionItemActions(Boolean(input.canEdit))?.slice(0, 1).map((action) => ({ ...action, label: 'Add model number' })) ?? [];
  const row = (item: RecallWarrantyItem, description: string) => ({ id: item.id, title: item.name, entityType: 'INVENTORY_ITEM' as const, href: null, description, meta: [], actions: [] });
  const sections = [
    { id: 'recall-warranty-matches', title: ask.polarity === 'WITHOUT_ACTIVE_WARRANTY' ? 'Open recall, no active warranty' : 'Open recall, active warranty', count: found.matches.length,
      items: found.matches.slice(0, 20).map((item) => row(item, ask.polarity === 'WITHOUT_ACTIVE_WARRANTY' ? 'Open recall recorded; no active warranty is linked to this item.' : 'Open recall recorded; an active warranty is linked to this item.')) },
    ...(incomplete ? [{ id: 'recall-warranty-missing-model', title: 'No model number recorded', count: missingModel.length,
      items: missingModel.slice(0, 20).map((item) => ({ ...row(item, 'Cannot be matched against recalls until a model number is recorded.'), actions: addModelAction })) }] : []),
    ...(found.needsReview.length > 0 ? [{ id: 'recall-warranty-needs-review', title: 'Open recall, warranty dates need review', count: found.needsReview.length,
      items: found.needsReview.slice(0, 20).map((item) => row(item, 'Open recall recorded; the linked warranty’s dates need review, so coverage is not assumed either way.')) }] : []),
  ];
  if (incomplete) {
    const limitation = 'Zero recorded matches does not confirm that no recall exists.';
    const bullets = [
      { label: 'Open recall matches recorded', body: '0' },
      { label: `${ask.appliancesOnly ? 'Appliances' : 'Items'} checked`, body: String(inScope.length) },
      { label: 'Missing model numbers', body: `${missingModel.length} of ${inScope.length}` },
      { label: 'Warranty condition', body: 'Not evaluated (no open recall to apply it to)' },
    ];
    return {
      status: 'READY_WITH_LIMITATIONS', reasonCode: 'RECALL_WARRANTY_CHECK_INCOMPLETE',
      blocks: [{
        type: 'SUMMARY', id: 'warranty-summary', title: 'Recall check incomplete', headline: 'Recall check incomplete', supportLine: limitation, bullets,
        body: `${bullets.map((b) => `${b.label}: ${b.body}.`).join(' ')} ${limitation}`, tone: 'CAUTION', actions: [],
      }, { type: 'GROUPED_LIST', filters: [], id: 'warranty-results', title: 'Recorded items', sections, actions: [] }, boundary],
      suggestions: [],
    };
  }
  return {
    status: 'ANSWERED', reasonCode: 'RECALL_WARRANTY_COMBINED',
    blocks: [{
      type: 'SUMMARY', id: 'warranty-summary', title: headline, headline, supportLine: notes.join(' '),
      body: `${headline} ${notes.join(' ')} This reports recorded recalls and warranties; it does not say whether a recall repair or a repair claim would be covered.`.trim(),
      tone: found.matches.length > 0 ? 'CAUTION' : 'DEFAULT', actions: [],
    }, { type: 'GROUPED_LIST', filters: [], id: 'warranty-results', title: 'Recorded items', sections, actions: [] }, boundary],
    suggestions: [],
  };
}
