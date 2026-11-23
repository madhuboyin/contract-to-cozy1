import { answerModeLabel } from '../answerModeLabel';

// BICC-ANS-001/005/006/007: the label words the server's mode; it never invents one.
describe('answerModeLabel', () => {
  it('words every declared mode that is a kind of answer', () => {
    expect(answerModeLabel('HOME_RECORD')?.text).toBe('From your home record');
    expect(answerModeLabel('USER_DOCUMENT')?.text).toBe('From your documents');
    expect(answerModeLabel('CALCULATION')?.text).toBe('Calculated');
    expect(answerModeLabel('ESTIMATE')?.text).toBe('Estimate');
    expect(answerModeLabel('RECOMMENDATION')?.text).toBe('Recommendation');
  });

  it('says plainly that general guidance is not from the home record (ANS-007)', () => {
    const label = answerModeLabel('GENERAL_GUIDANCE');
    expect(label?.text).toMatch(/not from your home record/i);
    expect(label?.description).toMatch(/not an inspection or a diagnosis/i);
  });

  it('shows nothing for an unavailable answer (it states its own reason), a missing mode, or an unknown one', () => {
    expect(answerModeLabel('UNAVAILABLE')).toBeNull();
    expect(answerModeLabel(null)).toBeNull();
    expect(answerModeLabel(undefined)).toBeNull();
    expect(answerModeLabel('SOMETHING_NEW' as never)).toBeNull();
  });

  it('an estimate is never worded as a quote or a certainty', () => {
    const label = answerModeLabel('ESTIMATE')!;
    expect(`${label.text} ${label.description}`).toMatch(/assumed|predicted|approximate/);
    expect(`${label.text} ${label.description}`).not.toMatch(/guarantee|exact|quote:/i);
  });
});

import { facetBadgeFor, facetClauseFor } from '../answerModeLabel';

// BICC-ANS-001/002: a composed answer labels each part once, on its first block, with that part's own mode.
describe('facet badges', () => {
  const facets = [
    { blockIdPrefix: 's1-', operationId: 'INVENTORY_LOOKUP', mode: 'HOME_RECORD' as const, clause: 'how old is my roof' },
    { blockIdPrefix: 's2-', operationId: 'ITEM_REPLACEMENT_COST', mode: 'ESTIMATE' as const, clause: 'what would a new one cost' },
    { blockIdPrefix: 's3-', operationId: 'X', mode: null, clause: 'unlabelled' },
  ];
  const blocks = [{ id: 'composite-answer-first' }, { id: 's1-summary' }, { id: 's1-list' }, { id: 's2-summary' }, { id: 's2-evidence' }, { id: 's3-summary' }];

  it('labels the first block of each part with that part’s own mode, and only that block', () => {
    const labelled = blocks.map((block) => facetBadgeFor(facets, blocks, block));
    expect(labelled).toEqual([null, 'HOME_RECORD', null, 'ESTIMATE', null, null]);
  });

  it('shows nothing for a part with no mode, for a single answer, or when there are no facets', () => {
    expect(facetBadgeFor(facets, blocks, { id: 's3-summary' })).toBeNull();
    expect(facetBadgeFor(undefined, blocks, blocks[1])).toBeNull();
    expect(facetBadgeFor([], blocks, blocks[1])).toBeNull();
  });

  it('does not mislabel when a facet’s first block was filtered out of the shown blocks', () => {
    const shown = [{ id: 's2-evidence' }];
    expect(facetBadgeFor(facets, shown, shown[0])).toBe('ESTIMATE');
  });

  it('names the clause a part answers', () => {
    expect(facetClauseFor(facets, { id: 's2-evidence' })).toBe('what would a new one cost');
    expect(facetClauseFor(facets, { id: 'composite-answer-first' })).toBeNull();
  });
});
