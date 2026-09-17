import { reconcileResultView, EMPTY_RESULT_VIEW } from '../resultViewState';
import type { AskExecutionResponse, AskPresentationBlock } from '../types';

// B07 fix (docs/architecture/ASK_COZY_PHASE6_BUYER_ACCEPTANCE_VERIFICATION.md):
// reconcileResultView used to only recognize the 'maintenance-groups' block
// id -- any other GROUPED_LIST-shaped result (Buyer, or any future
// operation) always got an empty valid-ids set, silently clearing
// selectedTaskId on every hydration regardless of whether the item was
// still there. Generalized across every GROUPED_LIST block in the result.
function buyerBlock(itemIds: string[]): Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }> {
  return {
    type: 'GROUPED_LIST', id: 'buyer-deadlines-tasks', title: 'Buyer deadlines', filters: [], actions: [],
    sections: [{ id: 'deadlines', title: 'Deadlines', count: itemIds.length, items: itemIds.map((id) => ({ id, title: id, meta: [] })) }],
  };
}
function execution(block: AskPresentationBlock): AskExecutionResponse {
  return { blocks: [block] } as unknown as AskExecutionResponse;
}

test('a selected item on a non-maintenance GROUPED_LIST block survives reconciliation (Buyer selection survives hydration)', () => {
  const view = { ...EMPTY_RESULT_VIEW, selectedTaskId: 'buyer-task-1' };
  const reconciled = reconcileResultView(view, execution(buyerBlock(['buyer-task-1', 'buyer-task-2'])));
  expect(reconciled.selectedTaskId).toBe('buyer-task-1');
});

test('a task that left the result clears selection rather than substituting another (removed task clears selection)', () => {
  const view = { ...EMPTY_RESULT_VIEW, selectedTaskId: 'buyer-task-1' };
  const reconciled = reconcileResultView(view, execution(buyerBlock(['buyer-task-2', 'buyer-task-3'])));
  expect(reconciled.selectedTaskId).toBeNull();
});

test('expandedRows on a non-maintenance block are also reconciled against that block\'s own items', () => {
  const view = { ...EMPTY_RESULT_VIEW, expandedRows: ['buyer-task-1', 'buyer-task-gone'] };
  const reconciled = reconcileResultView(view, execution(buyerBlock(['buyer-task-1', 'buyer-task-2'])));
  expect(reconciled.expandedRows).toEqual(['buyer-task-1']);
});

test('a non-GROUPED_LIST block (e.g. SUMMARY) contributes no ids, clearing any stale selection', () => {
  const summaryBlock = { type: 'SUMMARY', id: 'summary', title: 'x', body: 'y', tone: 'DEFAULT', actions: [] } as unknown as AskPresentationBlock;
  const view = { ...EMPTY_RESULT_VIEW, selectedTaskId: 'buyer-task-1' };
  const reconciled = reconcileResultView(view, execution(summaryBlock));
  expect(reconciled.selectedTaskId).toBeNull();
});
