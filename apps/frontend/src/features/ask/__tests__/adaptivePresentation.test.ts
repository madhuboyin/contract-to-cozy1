import { resolveAdaptiveGroupedListPresentation } from '../adaptivePresentation';
import type { AskPresentationBlock } from '../types';

type GroupedListBlock = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;

function groupedList(count: number, description: string | null = null): GroupedListBlock {
  return {
    type: 'GROUPED_LIST', id: 'records', title: 'Records', filters: [], actions: [],
    sections: [{ id: 'records', title: 'Recorded', count, items: Array.from({ length: count }, (_, index) => ({
      id: `record-${index}`, title: `Record ${index}`, description, meta: ['Current'],
    })) }],
  };
}

test('five or more low-attribute records use a compact scan-friendly list', () => {
  expect(resolveAdaptiveGroupedListPresentation(groupedList(5))).toBe('COMPACT_LIST');
  expect(resolveAdaptiveGroupedListPresentation(groupedList(4))).toBe('CARDS');
});

test('richer records retain card density even when the result is large', () => {
  expect(resolveAdaptiveGroupedListPresentation(groupedList(6, 'Important detail'))).toBe('CARDS');
});
