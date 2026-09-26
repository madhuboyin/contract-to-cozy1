import { followUpSuggestions } from '../followUps';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.11 IW-CALM-004/006 (FRD v1.111).
const key = (value: string) => value.toLowerCase();
const latest = (suggestions: string[], retryResponse = false) => ({ suggestions, correctionCapabilities: { retryResponse, intent: false, entity: false, homeRecord: false } });

describe('followUpSuggestions', () => {
  it('returns at most four, dropping blanks, repeats and questions already asked', () => {
    const shown = followUpSuggestions(latest(['A?', ' ', 'a?', 'B?', 'C?', 'D?', 'E?', 'F?']), new Set(['b?']), key);
    expect(shown).toEqual(['A?', 'C?', 'D?', 'E?']);
  });

  it('does not repeat a retry the answer already offers, but keeps it when none is offered', () => {
    expect(followUpSuggestions(latest(['Try again', 'Only show overdue'], true), new Set(), key)).toEqual(['Only show overdue']);
    expect(followUpSuggestions(latest(['Try again', 'Only show overdue'], false), new Set(), key)).toEqual(['Try again', 'Only show overdue']);
  });

  it('has nothing to show without an answer', () => {
    expect(followUpSuggestions(undefined, new Set(), key)).toEqual([]);
  });
});
