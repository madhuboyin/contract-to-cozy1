import { followUpItems, followUpSuggestions } from '../followUps';
import type { SuggestedNextAction } from '../types';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.11 IW-CALM-004/006 (FRD v1.111).
const key = (value: string) => value.toLowerCase();
const latest = (suggestions: string[], retryResponse = false) => ({ suggestions, correctionCapabilities: { retryResponse, intent: false, entity: false, homeRecord: false } });

describe('followUpSuggestions', () => {
  it('returns at most four, dropping blanks, repeats and questions already asked', () => {
    const shown = followUpSuggestions(latest(['A?', ' ', 'a?', 'B?', 'C?', 'D?', 'E?', 'F?']), new Set(['b?']), key);
    expect(shown).toEqual(['A?', 'C?', 'D?', 'E?']);
  });

  it('does not repeat a retry the answer already offers, but keeps it when none is offered', () => {
    expect(followUpSuggestions(latest(['Try again', 'Ask this question again', 'Retry this request', 'Only show overdue'], true), new Set(), key)).toEqual(['Only show overdue']);
    expect(followUpSuggestions(latest(['Try again', 'Only show overdue'], false), new Set(), key)).toEqual(['Try again', 'Only show overdue']);
  });

  it('has nothing to show without an answer', () => {
    expect(followUpSuggestions(undefined, new Set(), key)).toEqual([]);
  });
});

describe('followUpItems', () => {
  const NOW = Date.parse('2026-10-04T12:00:00.000Z');
  const typed = (id: string, label: string, expiresAt = '2026-10-04T13:00:00.000Z'): SuggestedNextAction => ({
    id, outcomeKey: 'ADD_BRAND', label, message: `${label} please`, operationId: 'INVENTORY_ITEM_CORRECT', interactionType: 'MUTATE_RECORD',
    entityContext: { propertyId: 'p1', entityType: 'INVENTORY_ITEM', entityId: 'i1', contextVersion: null },
    eligibility: { state: 'ELIGIBLE', reasonCodes: [], missingFactKeys: [] },
    provenance: { source: 'MISSING_DETAIL', sourceOperationId: null, sourceExecutionId: 'e1', reasonCodes: [] },
    createdAt: '2026-10-04T11:00:00.000Z', expiresAt, priority: { tier: 'RECORD_ACTION', score: 500 },
  });
  const withTyped = (suggestedNextActions: SuggestedNextAction[], suggestions: string[] = []) => ({ ...latest(suggestions), suggestedNextActions });

  it('falls back to historical strings only when the answer has no typed actions', () => {
    expect(followUpItems(latest(['Only show overdue']), new Set(), key, NOW)).toEqual([{ kind: 'TEXT', key: 'text:only show overdue', label: 'Only show overdue', text: 'Only show overdue' }]);
    expect(followUpItems({ ...latest(['Only show overdue']), suggestedNextActions: [] }, new Set(), key, NOW)).toHaveLength(1);
  });

  it('prefers typed actions over strings, in the server order, labelled by label', () => {
    const items = followUpItems(withTyped([typed('v1.aaaaaaaaaaaaaaaa', 'Add the brand'), typed('v1.bbbbbbbbbbbbbbbb', 'Set the purchase date')], ['A string']), new Set(), key, NOW);
    expect(items.map((item) => [item.kind, item.label])).toEqual([['ACTION', 'Add the brand'], ['ACTION', 'Set the purchase date']]);
  });

  it('hides an expired action, drops duplicate ids, never filters typed actions by asked text, and caps at four', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((c) => typed(`v1.${c.repeat(16)}`, `Label ${c}`));
    expect(followUpItems(withTyped([typed('v1.xxxxxxxxxxxxxxxx', 'Old', '2026-10-04T11:59:59.000Z'), ...many, many[0]]), new Set(['label a']), key, NOW).map((item) => item.label)).toEqual(['Label a', 'Label b', 'Label c', 'Label d']);
  });

  it('shows nothing when every typed action has expired, rather than reviving the strings', () => {
    expect(followUpItems(withTyped([typed('v1.aaaaaaaaaaaaaaaa', 'Old', '2026-10-04T11:00:00.000Z')], ['A string']), new Set(), key, NOW)).toEqual([]);
  });
});
