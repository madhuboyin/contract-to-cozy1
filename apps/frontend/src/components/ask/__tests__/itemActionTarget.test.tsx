import { fireEvent, render, screen } from '@testing-library/react';
import { GenericGroupedListBlock } from '../blocks/GroupedListBlock';
import type { AskPresentationBlock } from '@/features/ask/types';

type GroupedList = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;

// A row's action can act on something other than the row (a work row's request, a saved row's own list entry): the action's own target
// wins, and without one it targets the row, as it always did.
const block: GroupedList = {
  type: 'GROUPED_LIST', id: 'rows', title: 'Rows', filters: [], actions: [],
  sections: [{ id: 's', title: 'Rows', count: 1, items: [{
    id: 'q1', title: 'Roofing quotes', entityType: 'QUOTE_COMPARISON_WORKSPACE', meta: [], actions: [
      { id: 'open', label: 'Open', message: 'Open Roofing quotes', style: 'PRIMARY', interactionType: 'CONVERSATION_CONTINUE', operationId: 'QUOTE_COMPARISON_REVIEW' },
      { id: 'archive', label: 'Archive', message: 'Archive this saved result: Roofing quotes', style: 'QUIET', interactionType: 'MUTATE_RECORD', operationId: 'SAVED_ARCHIVE_COMMAND', entityType: 'SAVED_ARTIFACT', entityId: 'comparison:q1' },
    ],
  }] }],
};

test('an item action targets the row unless it names its own target', () => {
  const onItemAction = jest.fn();
  render(<GenericGroupedListBlock block={block} executionId="execution" propertyId="home" onItemAction={onItemAction} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  expect(onItemAction).toHaveBeenLastCalledWith('QUOTE_COMPARISON_WORKSPACE', 'q1', 'Open Roofing quotes', 'QUOTE_COMPARISON_REVIEW', 'CONVERSATION_CONTINUE');
  fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
  expect(onItemAction).toHaveBeenLastCalledWith('SAVED_ARTIFACT', 'comparison:q1', 'Archive this saved result: Roofing quotes', 'SAVED_ARCHIVE_COMMAND', 'MUTATE_RECORD');
});
