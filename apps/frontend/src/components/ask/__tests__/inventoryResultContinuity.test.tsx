import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InventoryResultList } from '../InventoryResultList';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import { readResultView, resultViewKey } from '@/features/ask/resultViewState';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';
import { api } from '@/lib/api/client';
import type { InventoryItem } from '@/types';

const block: Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }> = {
  type: 'GROUPED_LIST', id: 'inventory-results', title: 'Inventory details', filters: [], actions: [
    { id: 'open-inventory', label: 'Open home inventory', href: '/dashboard/properties/home/inventory?tab=items', style: 'PRIMARY' },
  ],
  sections: [{ id: 'items', title: 'Living Home Record', count: 3, items: [
    { id: 'item-0', title: 'Water heater', entityType: 'INVENTORY_ITEM', meta: ['Basement', 'Rheem'], description: null, status: 'GOOD' },
    { id: 'item-1', title: 'Furnace', entityType: 'INVENTORY_ITEM', meta: ['Basement'], description: null, status: 'FAIR' },
    { id: 'item-2', title: 'Refrigerator', entityType: 'INVENTORY_ITEM', meta: ['Kitchen'], description: null, status: 'GOOD' },
  ] }],
};
function execution(revision = 1, executionId = 'execution'): AskExecutionResponse {
  return { executionId, sessionId: 'session', property: { id: 'home', label: 'Home' }, blocks: [block], updatedAt: `2026-09-18T00:00:0${revision}.000Z`,
    viewState: { resultId: 'result', revision, domainScopePhrase: 'inventory', dateScopePhrase: null, statusFilter: 'ALL', selectedTaskId: null },
  } as AskExecutionResponse;
}
function List({ response, onPage = () => {}, onAccessLost = () => {} }: { response: AskExecutionResponse; onPage?: (sectionId: string, direction: 'NEXT' | 'PREVIOUS') => void; onAccessLost?: () => void }) {
  const controls = useResultView(response);
  return <ResultViewContext.Provider value={controls}><InventoryResultList block={response.blocks[0] as typeof block} propertyId={response.property?.id} onFilter={() => {}} onPage={onPage} onAccessLost={onAccessLost} link={(_, label) => label} /></ResultViewContext.Provider>;
}
function canonicalItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'item-0', propertyId: 'home', roomId: null, warrantyId: null, insurancePolicyId: null,
    name: 'Water heater', category: 'PLUMBING' as InventoryItem['category'], condition: 'GOOD' as InventoryItem['condition'],
    brand: 'Rheem', model: 'XE50', serialNo: 'SN-1', installedOn: '2022-01-15T00:00:00.000Z', purchasedOn: '2022-01-10T00:00:00.000Z',
    lastServicedOn: null, purchaseCostCents: 85000, replacementCostCents: 120000, currency: 'USD', notes: 'Tank-style, in basement utility closet.',
    tags: [], sourceHash: null, coverageNotRequired: false, isVerified: true, documents: [], warranty: null,
    createdAt: '2022-01-15T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  } as InventoryItem;
}
beforeEach(() => { window.sessionStorage.clear(); jest.restoreAllMocks(); });

test('clicking an inventory item title opens canonical detail inline without navigating', async () => {
  window.history.replaceState({}, '', '/dashboard/ask?propertyId=home&sessionId=session');
  jest.spyOn(api, 'getInventoryItem').mockResolvedValueOnce({ success: true, data: { item: canonicalItem() } } as Awaited<ReturnType<typeof api.getInventoryItem>>);

  render(<List response={execution()} />);
  expect(screen.queryByRole('link', { name: 'Water heater' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Water heater' }));

  await waitFor(() => expect(screen.getByText('Tank-style, in basement utility closet.')).toBeInTheDocument());
  expect(screen.getByText('Rheem')).toBeInTheDocument();
  expect(screen.getByText('$850')).toBeInTheDocument();
  expect(window.location.pathname).toBe('/dashboard/ask');
  expect(window.location.search).toContain('sessionId=session');
  expect(readResultView(window.sessionStorage, resultViewKey('session', 'home', 'result')).detailTaskId).toBe('item-0');
});

test('selecting an item from the ambiguous-match disambiguation list also opens inline detail, not a navigation', async () => {
  const disambiguation: typeof block = {
    type: 'GROUPED_LIST', id: 'inventory-entity-selection', title: 'Which inventory item do you mean?', filters: [], actions: [],
    sections: [{ id: 'matches', title: 'Matching records', count: 2, items: [
      { id: 'item-0', title: 'Water heater', entityType: 'INVENTORY_ITEM', meta: ['Basement'], description: 'Rheem', status: 'GOOD', href: '/dashboard/properties/home/inventory?tab=items&openItemId=item-0' },
      { id: 'item-1', title: 'Tankless water heater', entityType: 'INVENTORY_ITEM', meta: ['Garage'], description: 'Rinnai', status: 'GOOD', href: '/dashboard/properties/home/inventory?tab=items&openItemId=item-1' },
    ] }],
  };
  jest.spyOn(api, 'getInventoryItem').mockResolvedValueOnce({ success: true, data: { item: canonicalItem() } } as Awaited<ReturnType<typeof api.getInventoryItem>>);

  const response = execution();
  response.blocks = [disambiguation];
  render(<List response={response} />);
  expect(screen.queryByRole('link', { name: 'Water heater' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Water heater' }));

  await waitFor(() => expect(screen.getByText('Tank-style, in basement utility closet.')).toBeInTheDocument());
  expect(readResultView(window.sessionStorage, resultViewKey('session', 'home', 'result')).detailTaskId).toBe('item-0');
});

test('deleted item detail is distinct from an access-loss failure', async () => {
  jest.spyOn(api, 'getInventoryItem').mockRejectedValueOnce({ status: 404, payload: { success: false, error: { message: 'Inventory item not found', code: 'ITEM_NOT_FOUND' } } });
  render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Water heater' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Item no longer exists'));
});

test('a 404 without ITEM_NOT_FOUND (property-level access denial) invokes whole-result redaction, not a not-found message', async () => {
  const onAccessLost = jest.fn();
  jest.spyOn(api, 'getInventoryItem').mockRejectedValueOnce({ status: 404, payload: { message: 'Property not found or access denied.' } });
  render(<List response={execution()} onAccessLost={onAccessLost} />);
  fireEvent.click(screen.getByRole('button', { name: 'Water heater' }));
  await waitFor(() => expect(onAccessLost).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('an unauthenticated 401 also invokes whole-result redaction', async () => {
  const onAccessLost = jest.fn();
  jest.spyOn(api, 'getInventoryItem').mockRejectedValueOnce({ status: 401 });
  render(<List response={execution()} onAccessLost={onAccessLost} />);
  fireEvent.click(screen.getByRole('button', { name: 'Water heater' }));
  await waitFor(() => expect(onAccessLost).toHaveBeenCalledTimes(1));
});

test('detail selection survives unmount and a new execution for the same result', async () => {
  jest.spyOn(api, 'getInventoryItem').mockResolvedValue({ success: true, data: { item: canonicalItem() } } as Awaited<ReturnType<typeof api.getInventoryItem>>);
  const first = render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Water heater' }));
  await waitFor(() => expect(screen.getByText('Rheem')).toBeInTheDocument());
  first.unmount();
  render(<List response={execution(2, 'refinement')} />);
  await waitFor(() => expect(screen.getByText('Rheem')).toBeInTheDocument());
});

test('an item leaving the result clears selection rather than selecting a substitute', () => {
  const { rerender } = render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Water heater' }));
  const next = execution(2);
  next.blocks = [{ ...block, sections: [{ ...block.sections[0], items: block.sections[0].items.filter((item) => item.id !== 'item-0') }] }];
  rerender(<List response={next} />);
  expect(readResultView(window.sessionStorage, resultViewKey('session', 'home', 'result')).detailTaskId).toBeNull();
});

test('server-paged inventory sections navigate inline and retain "Open home inventory" as a separate option', () => {
  const onPage = jest.fn();
  const response = execution();
  response.blocks = [{ ...block, sections: [{ ...block.sections[0], count: 40, offset: 10 }] }];
  render(<List response={response} onPage={onPage} />);
  fireEvent.click(screen.getByRole('button', { name: /Previous page of Living Home Record/ }));
  fireEvent.click(screen.getByRole('button', { name: /Next page of Living Home Record/ }));
  expect(onPage).toHaveBeenNthCalledWith(1, 'items', 'PREVIOUS');
  expect(onPage).toHaveBeenNthCalledWith(2, 'items', 'NEXT');
  expect(screen.getByText('Open home inventory')).toBeInTheDocument();
});

test('inline inventory detail exposes declared correction actions and dispatches the exact item identity; none render without declared actions', async () => {
  window.history.replaceState({}, '', '/dashboard/ask?propertyId=home&sessionId=session');
  jest.spyOn(api, 'getInventoryItem').mockResolvedValue({ success: true, data: { item: canonicalItem() } } as Awaited<ReturnType<typeof api.getInventoryItem>>);
  const withActions: typeof block = { ...block, sections: [{ ...block.sections[0], items: [
    { ...block.sections[0].items[0], actions: [{ id: 'correct-installedOn', label: 'Correct install date', message: 'Correct the install date of this inventory item.', style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId: 'INVENTORY_ITEM_CORRECT' }] },
    ...block.sections[0].items.slice(1),
  ] }] };
  const onAction = jest.fn();
  const response = { ...execution(), blocks: [withActions] } as AskExecutionResponse;
  function Harness() {
    const controls = useResultView(response);
    return <ResultViewContext.Provider value={controls}><InventoryResultList block={withActions} propertyId="home" onAction={onAction} onFilter={() => {}} onPage={() => {}} onAccessLost={() => {}} link={(_, label) => label} /></ResultViewContext.Provider>;
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Water heater' }));
  const button = await screen.findByRole('button', { name: /Correct install date/ });
  fireEvent.click(button);
  expect(onAction).toHaveBeenCalledWith('INVENTORY_ITEM', 'item-0', 'Correct the install date of this inventory item.', 'INVENTORY_ITEM_CORRECT', 'MUTATE_RECORD');

});

test('inventory detail renders no correction controls when the item declares no actions (viewer role)', async () => {
  window.history.replaceState({}, '', '/dashboard/ask?propertyId=home&sessionId=session');
  jest.spyOn(api, 'getInventoryItem').mockResolvedValue({ success: true, data: { item: canonicalItem() } } as Awaited<ReturnType<typeof api.getInventoryItem>>);
  render(<List response={execution()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Water heater' }));
  await waitFor(() => expect(screen.getByText('Rheem')).toBeInTheDocument());
  expect(screen.queryByRole('group', { name: /Corrections for/ })).not.toBeInTheDocument();
});

test('a long list of corrections is folded behind one disclosure and each button still dispatches its exact action', async () => {
  window.history.replaceState({}, '', '/dashboard/ask?propertyId=home&sessionId=session');
  jest.spyOn(api, 'getInventoryItem').mockResolvedValue({ success: true, data: { item: canonicalItem() } } as Awaited<ReturnType<typeof api.getInventoryItem>>);
  const labels = ['install date', 'purchase date', 'last serviced date', 'condition', 'brand', 'model', 'serial number', 'purchase cost', 'replacement cost', 'notes'];
  const actions = labels.map((label, index) => ({
    id: `correct-${index}`, label: `Correct ${label}`, message: `Correct the ${label} of this inventory item.`,
    style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'INVENTORY_ITEM_CORRECT',
  }));
  const withMany: typeof block = { ...block, sections: [{ ...block.sections[0], items: [{ ...block.sections[0].items[0], actions }, ...block.sections[0].items.slice(1)] }] };
  const onAction = jest.fn();
  const response = { ...execution(), blocks: [withMany] } as AskExecutionResponse;
  function Harness() {
    const controls = useResultView(response);
    return <ResultViewContext.Provider value={controls}><InventoryResultList block={withMany} propertyId="home" onAction={onAction} onFilter={() => {}} onPage={() => {}} onAccessLost={() => {}} link={(_, label) => label} /></ResultViewContext.Provider>;
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Water heater' }));
  const summary = await screen.findByText('Correct a detail');
  expect(summary.tagName).toBe('SUMMARY');
  expect(screen.getAllByRole('button', { name: /^Correct / })).toHaveLength(10);
  fireEvent.click(screen.getByRole('button', { name: /^Correct condition/ }));
  expect(onAction).toHaveBeenCalledWith('INVENTORY_ITEM', 'item-0', 'Correct the condition of this inventory item.', 'INVENTORY_ITEM_CORRECT', 'MUTATE_RECORD');
});

test('three or fewer corrections stay inline with no disclosure', async () => {
  window.history.replaceState({}, '', '/dashboard/ask?propertyId=home&sessionId=session');
  jest.spyOn(api, 'getInventoryItem').mockResolvedValue({ success: true, data: { item: canonicalItem() } } as Awaited<ReturnType<typeof api.getInventoryItem>>);
  const actions = ['condition', 'brand', 'notes'].map((label, index) => ({
    id: `c${index}`, label: `Correct ${label}`, message: `Correct the ${label} of this inventory item.`,
    style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'INVENTORY_ITEM_CORRECT',
  }));
  const few: typeof block = { ...block, sections: [{ ...block.sections[0], items: [{ ...block.sections[0].items[0], actions }, ...block.sections[0].items.slice(1)] }] };
  const response = { ...execution(), blocks: [few] } as AskExecutionResponse;
  function Harness() {
    const controls = useResultView(response);
    return <ResultViewContext.Provider value={controls}><InventoryResultList block={few} propertyId="home" onAction={() => {}} onFilter={() => {}} onPage={() => {}} onAccessLost={() => {}} link={(_, label) => label} /></ResultViewContext.Provider>;
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Water heater' }));
  await screen.findByRole('group', { name: /Corrections for/ });
  expect(screen.queryByText('Correct a detail')).not.toBeInTheDocument();
});
