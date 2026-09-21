import { readResultView, reconcileResultView, EMPTY_RESULT_VIEW } from '../resultViewState';
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

test('restored detail is scoped to its source block even when another block has the same entity id', () => {
  const view = { ...EMPTY_RESULT_VIEW, detailTarget: { blockId: 'buyer-deadlines-tasks', entityId: 'shared-id' } };
  const wrongBlock = { ...buyerBlock(['shared-id']), id: 'other-block' };
  expect(reconcileResultView(view, execution(wrongBlock)).detailTarget).toBeNull();
  expect(reconcileResultView(view, execution(buyerBlock(['shared-id']))).detailTarget).toEqual(view.detailTarget);
});

test('a non-GROUPED_LIST block (e.g. SUMMARY) contributes no ids, clearing any stale selection', () => {
  const summaryBlock = { type: 'SUMMARY', id: 'summary', title: 'x', body: 'y', tone: 'DEFAULT', actions: [] } as unknown as AskPresentationBlock;
  const view = { ...EMPTY_RESULT_VIEW, selectedTaskId: 'buyer-task-1' };
  const reconciled = reconcileResultView(view, execution(summaryBlock));
  expect(reconciled.selectedTaskId).toBeNull();
});

test('presentation choice survives reconciliation only while its table remains in the result', () => {
  const table = { type: 'TABLE', id: 'cost-table', title: 'Costs', columns: [{ key: 'name', label: 'Name' }], rows: [], actions: [] } as AskPresentationBlock;
  const view = { ...EMPTY_RESULT_VIEW, presentationModes: { 'cost-table': 'CARDS' as const, stale: 'TABLE' as const } };
  expect(reconcileResultView(view, execution(table)).presentationModes).toEqual({ 'cost-table': 'CARDS' });
  expect(reconcileResultView(view, execution({ type: 'SUMMARY', id: 'summary', title: 'x', body: 'y', tone: 'DEFAULT', actions: [] })).presentationModes).toEqual({});
});

test('stored presentation modes are bounded to known values', () => {
  const storage = window.sessionStorage;
  storage.setItem('view', JSON.stringify({ presentationModes: { safe: 'TABLE', invalid: 'GRID' } }));
  expect(readResultView(storage, 'view').presentationModes).toEqual({ safe: 'TABLE' });
});

test('grouped-list choice is bounded and retained only for its source block', () => {
  const view = { ...EMPTY_RESULT_VIEW, groupedListModes: { 'buyer-deadlines-tasks': 'LIST' as const, stale: 'CARDS' as const } };
  expect(reconcileResultView(view, execution(buyerBlock(['buyer-task-1']))).groupedListModes).toEqual({ 'buyer-deadlines-tasks': 'LIST' });
  expect(reconcileResultView(view, execution({ type: 'SUMMARY', id: 'summary', title: 'x', body: 'y', tone: 'DEFAULT', actions: [] })).groupedListModes).toEqual({});
  window.sessionStorage.setItem('grouped-view', JSON.stringify({ groupedListModes: { safe: 'LIST', invalid: 'TABLE' } }));
  expect(readResultView(window.sessionStorage, 'grouped-view').groupedListModes).toEqual({ safe: 'LIST' });
});

test('comparison layout survives only while its exact comparison remains and rejects unknown modes', () => {
  const comparison = {
    type: 'COMPARISON', id: 'repair-options', title: 'Options',
    options: [
      { id: 'repair', label: 'Repair', attributes: [], actions: [] },
      { id: 'replace', label: 'Replace', attributes: [], actions: [] },
    ],
    actions: [],
  } as AskPresentationBlock;
  const view = { ...EMPTY_RESULT_VIEW, comparisonLayouts: { 'repair-options': 'GRID' as const, stale: 'STRIP' as const } };
  expect(reconcileResultView(view, execution(comparison)).comparisonLayouts).toEqual({ 'repair-options': 'GRID' });
  expect(reconcileResultView(view, execution({ type: 'SUMMARY', id: 'summary', title: 'x', body: 'y', tone: 'DEFAULT', actions: [] })).comparisonLayouts).toEqual({});

  window.sessionStorage.setItem('comparison-view', JSON.stringify({ comparisonLayouts: { safe: 'STRIP', invalid: 'CARDS' } }));
  expect(readResultView(window.sessionStorage, 'comparison-view').comparisonLayouts).toEqual({ safe: 'STRIP' });
});
