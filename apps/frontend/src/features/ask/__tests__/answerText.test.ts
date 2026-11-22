import { answerPlainText } from '../answerText';
import type { AskPresentationBlock } from '../types';

// BICC-UX-003: copied text restates what the answer shows and nothing else.
describe('answerPlainText', () => {
  it('copies a summary, list items and table rows without actions, links or identifiers', () => {
    const blocks = [
      { type: 'SUMMARY', id: 'private-id', title: 'Roof', body: 'Installed in 2012.', tone: 'DEFAULT', actions: [{ id: 'open', label: 'Open', href: '/dashboard/properties/p/roof', style: 'PRIMARY' }] },
      { type: 'GROUPED_LIST', id: 'g', title: 'Open tasks', description: '', sections: [{ title: 'Soon', count: 1, items: [{ title: 'Clean gutters', description: 'Before fall', meta: ['Due Oct 1'], status: 'DUE' }] }] },
      { type: 'TABLE', id: 't', title: 'Costs', description: '', columns: [{ key: 'item', label: 'Item' }, { key: 'cost', label: 'Cost' }], rows: [{ id: 'r1', values: { item: 'Shingles', cost: '$4,000' } }] },
    ] as unknown as AskPresentationBlock[];
    const text = answerPlainText(blocks);
    expect(text).toBe('Roof\nInstalled in 2012.\nOpen tasks\nSoon\n- Clean gutters — Before fall — Due Oct 1\nCosts\n- Shingles — $4,000');
    expect(text).not.toMatch(/private-id|dashboard|Open$/);
  });

  it('returns an empty string when there is nothing to copy', () => {
    expect(answerPlainText([])).toBe('');
    expect(answerPlainText([{ type: 'BOUNDARY', id: 'b', title: 'No', body: 'No.', severity: 'INFO', suggestions: [] }] as unknown as AskPresentationBlock[])).toBe('');
  });
});
