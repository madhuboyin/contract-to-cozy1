import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InventoryResultList } from '../InventoryResultList';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import { readResultView, resultViewKey } from '@/features/ask/resultViewState';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';
import { api } from '@/lib/api/client';
import type { InventoryItem } from '@/types';
import { AskBlockActionContext } from '../blocks/context';

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
    id: 'item-0', propertyId: 'home', roomId: null, itemWarrantyId: null, insurancePolicyId: null,
    name: 'Water heater', category: 'PLUMBING' as InventoryItem['category'], condition: 'GOOD' as InventoryItem['condition'],
    brand: 'Rheem', model: 'XE50', serialNo: 'SN-1', installedOn: '2022-01-15T00:00:00.000Z', purchasedOn: '2022-01-10T00:00:00.000Z',
    lastServicedOn: null, purchaseCostCents: 85000, replacementCostCents: 120000, currency: 'USD', notes: 'Tank-style, in basement utility closet.',
    tags: [], sourceHash: null, coverageNotRequired: false, isVerified: true, documents: [], warranty: null,
    createdAt: '2022-01-15T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  } as InventoryItem;
}
beforeEach(() => { window.sessionStorage.clear(); jest.restoreAllMocks(); });

test('inventory collections render a compact responsive semantic table with one row per item', () => {
  render(<List response={execution()} />);
  const table = screen.getByRole('table', { name: 'Living Home Record inventory items' });
  expect(table).toBeInTheDocument();
  expect(screen.getAllByRole('row')).toHaveLength(4);
  expect(screen.getByRole('columnheader', { name: 'Details' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Condition' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Water heater' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'View details for Water heater' })).toBeInTheDocument();
  expect(screen.queryByText('View only')).not.toBeInTheDocument();
  expect(screen.queryByText('Editing available')).not.toBeInTheDocument();
});

test('clicking an inventory item title opens canonical detail inline without navigating', async () => {
  window.history.replaceState({}, '', '/dashboard/ask?propertyId=home&sessionId=session');
  jest.spyOn(api, 'getInventoryItem').mockResolvedValue({ success: true, data: { item: canonicalItem() } } as Awaited<ReturnType<typeof api.getInventoryItem>>);

  render(<List response={execution()} />);
  expect(screen.queryByRole('link', { name: 'Water heater' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Water heater' }));

  await waitFor(() => expect(screen.getByText('Tank-style, in basement utility closet.')).toBeInTheDocument());
  expect(screen.getByText('View only')).toBeInTheDocument();
  expect(screen.getByText('Basement · Rheem')).toBeInTheDocument();
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

test('a truncated inventory list without a declared continuation shows "Showing X of Y" and no Next control (2A)', () => {
  const response = execution();
  response.blocks = [{
    ...block,
    collection: { sourceTotal: 73, fetchedCount: 73, deliveredCount: 3, nextPageAvailable: false, deliveryTruncated: true },
    sections: [{ ...block.sections[0], count: 73 }],
  }];
  const { container } = render(<List response={response} />);
  // The section states its own window; the list offers no Next control because the producer declared no continuation.
  expect(container.textContent).toMatch(/Showing 1–3 of 73|Server results 1–3 of 73/);
  expect(screen.queryByRole('button', { name: /Next page of Living Home Record/ })).not.toBeInTheDocument();
});

test('a declared continuation still offers Next', () => {
  const onPage = jest.fn();
  const response = execution();
  response.blocks = [{
    ...block,
    collection: { sourceTotal: 73, fetchedCount: 3, deliveredCount: 3, nextPageAvailable: true, deliveryTruncated: false },
    sections: [{ ...block.sections[0], count: 73, offset: 0 }],
  }];
  render(<List response={response} onPage={onPage} />);
  fireEvent.click(screen.getByRole('button', { name: /Next page of Living Home Record/ }));
  expect(onPage).toHaveBeenCalledWith('items', 'NEXT');
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

test('an incomplete inventory row exposes Add missing details and dispatches the item-scoped completion flow', () => {
  const complete = { id: 'complete-missing-details', label: 'Add missing details', message: 'Complete the missing details for this inventory item.', style: 'PRIMARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'INVENTORY_ITEM_CORRECT' };
  const incomplete: typeof block = { ...block, sections: [{ ...block.sections[0], items: [
    { ...block.sections[0].items[0], description: 'Missing: Brand, Model', actions: [complete] },
    ...block.sections[0].items.slice(1),
  ] }] };
  const onAction = jest.fn();
  const response = { ...execution(), blocks: [incomplete] } as AskExecutionResponse;
  function Harness() {
    const controls = useResultView(response);
    return <ResultViewContext.Provider value={controls}><InventoryResultList block={incomplete} propertyId="home" onAction={onAction} onFilter={() => {}} onPage={() => {}} onAccessLost={() => {}} link={(_, label) => label} /></ResultViewContext.Provider>;
  }
  render(<Harness />);
  expect(screen.queryByText('Editing available')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add missing details' }));
  expect(onAction).toHaveBeenCalledWith('INVENTORY_ITEM', 'item-0', 'Complete the missing details for this inventory item.', 'INVENTORY_ITEM_CORRECT', 'MUTATE_RECORD');
});

test('an incomplete inventory row routes missing coverage to the governed item-scoped coverage review', () => {
  const reviewCoverage = { id: 'review-coverage-information', label: 'Review coverage information', message: 'Review the coverage information for this inventory item.', style: 'SECONDARY' as const, interactionType: 'CONVERSATION_CONTINUE' as const, operationId: 'COVERAGE_GAPS' };
  const incomplete: typeof block = { ...block, sections: [{ ...block.sections[0], items: [
    { ...block.sections[0].items[0], description: 'Missing: Coverage evidence', actions: [reviewCoverage] },
  ] }] };
  const onAction = jest.fn();
  render(<InventoryResultList block={incomplete} propertyId="home" onAction={onAction} onFilter={() => {}} onPage={() => {}} onAccessLost={() => {}} link={(_, label) => label} />);
  fireEvent.click(screen.getByRole('button', { name: 'Review coverage information' }));
  expect(onAction).toHaveBeenCalledWith('INVENTORY_ITEM', 'item-0', 'Review the coverage information for this inventory item.', 'COVERAGE_GAPS', 'CONVERSATION_CONTINUE');
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


test('the inventory list renders its declared START_WORKFLOW block action as a button and dispatches that exact action; href actions stay links', () => {
  const addAction = { id: 'add-inventory-item', label: 'Add an item', interactionType: 'START_WORKFLOW' as const, message: 'Add an item to my home inventory.', operationId: 'INVENTORY_ITEM_CREATE', style: 'PRIMARY' as const };
  const withAdd: typeof block = { ...block, actions: [addAction, ...block.actions] };
  const invoke = jest.fn();
  render(
    <AskBlockActionContext.Provider value={{ disabled: false, invoke }}>
      <ResultViewContext.Provider value={null}>
        <InventoryResultList block={withAdd} propertyId="home" onFilter={() => {}} onPage={() => {}} onAccessLost={() => {}} link={(href, content) => <a href={href}>{content}</a>} />
      </ResultViewContext.Provider>
    </AskBlockActionContext.Provider>,
  );
  fireEvent.click(screen.getByRole('button', { name: /Add an item/ }));
  expect(invoke).toHaveBeenCalledWith(addAction);
  expect(screen.getByRole('link', { name: /Open home inventory/ })).toBeInTheDocument();
});

// Actionable Result Enrichment FRD FR-ACT-4: a governed row action shows inline on the first five rows that carry it; the rest keep it in the inline detail.
const recordWarranty = { id: 'record-warranty-item', label: 'Record warranty', message: 'Record a warranty in my home record.', style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'CAPTURE_WARRANTY_CONFIRM' };
function blockWithEnrichedRows(count: number, withActionEvery = 1): typeof block {
  const template = block.sections[0].items[0];
  const items = Array.from({ length: count }, (_, index) => ({
    ...template, id: `enriched-${index}`, title: `Appliance ${index}`, entityType: 'INVENTORY_ITEM',
    ...(index % withActionEvery === 0 ? { actions: [recordWarranty] } : { actions: [] }),
  }));
  return { ...block, sections: [{ ...block.sections[0], count, items }] };
}

test('Record warranty shows inline on a row and dispatches the exact item identity with the declared operation', () => {
  const enriched = blockWithEnrichedRows(1);
  const onAction = jest.fn();
  render(<InventoryResultList block={enriched} propertyId="home" onAction={onAction} onFilter={() => {}} onPage={() => {}} onAccessLost={() => {}} link={(_, label) => label} />);
  fireEvent.click(screen.getByRole('button', { name: 'Record warranty' }));
  expect(onAction).toHaveBeenCalledWith('INVENTORY_ITEM', 'enriched-0', 'Record a warranty in my home record.', 'CAPTURE_WARRANTY_CONFIRM', 'MUTATE_RECORD');
});

test('only the first five rows carrying the action show it inline, counted over rows that carry it', () => {
  // Rows 0, 2, 4, ... carry the action; the rows between them do not and never use up a slot.
  const enriched = blockWithEnrichedRows(14, 2);
  render(<InventoryResultList block={enriched} propertyId="home" onAction={jest.fn()} onFilter={() => {}} onPage={() => {}} onAccessLost={() => {}} link={(_, label) => label} />);
  expect(screen.queryAllByRole('button', { name: 'Record warranty' })).toHaveLength(5);
});

test('a row without governed actions shows no Record warranty control', () => {
  const plain = blockWithEnrichedRows(3, 99);
  render(<InventoryResultList block={{ ...plain, sections: [{ ...plain.sections[0], items: plain.sections[0].items.map((entry, index) => (index === 0 ? { ...entry, actions: [recordWarranty] } : { ...entry, actions: [] })) }] }} propertyId="home" onAction={jest.fn()} onFilter={() => {}} onPage={() => {}} onAccessLost={() => {}} link={(_, label) => label} />);
  expect(screen.queryAllByRole('button', { name: 'Record warranty' })).toHaveLength(1);
});

test('Review replacement shows inline as a read launch for that exact appliance', () => {
  const review = { id: 'review-replacement-item', label: 'Review replacement', message: 'Should I repair or replace Water heater?', style: 'SECONDARY' as const, interactionType: 'CONVERSATION_CONTINUE' as const, operationId: 'REPLACEMENT_GUIDANCE' };
  const aging = { ...block, sections: [{ ...block.sections[0], items: [{ ...block.sections[0].items[0], entityType: 'INVENTORY_ITEM', actions: [review] }] }] } as typeof block;
  const onAction = jest.fn();
  render(<InventoryResultList block={aging} propertyId="home" onAction={onAction} onFilter={() => {}} onPage={() => {}} onAccessLost={() => {}} link={(_, label) => label} />);
  fireEvent.click(screen.getByRole('button', { name: 'Review replacement' }));
  expect(onAction).toHaveBeenCalledWith('INVENTORY_ITEM', 'item-0', 'Should I repair or replace Water heater?', 'REPLACEMENT_GUIDANCE', 'CONVERSATION_CONTINUE');
});

test('Add missing details shows inline on a row and launches INVENTORY_ITEM_CORRECT for that exact item', () => {
  const missing = { id: 'complete-missing-details-item', label: 'Add missing details', message: 'Complete the missing details for this inventory item.', style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'INVENTORY_ITEM_CORRECT' };
  const incomplete = { ...block, sections: [{ ...block.sections[0], items: [{ ...block.sections[0].items[0], entityType: 'INVENTORY_ITEM', actions: [missing] }] }] } as typeof block;
  const onAction = jest.fn();
  render(<InventoryResultList block={incomplete} propertyId="home" onAction={onAction} onFilter={() => {}} onPage={() => {}} onAccessLost={() => {}} link={(_, label) => label} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add missing details' }));
  expect(onAction).toHaveBeenCalledWith('INVENTORY_ITEM', 'item-0', 'Complete the missing details for this inventory item.', 'INVENTORY_ITEM_CORRECT', 'MUTATE_RECORD');
});

test('Update coverage status shows inline and launches COVERAGE_COMMAND for that exact item', () => {
  const update = { id: 'update-coverage-status-item', label: 'Update coverage status', message: 'Update the coverage status for this inventory item.', style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'COVERAGE_COMMAND' };
  const explicit = { ...block, sections: [{ ...block.sections[0], items: [{ ...block.sections[0].items[0], entityType: 'INVENTORY_ITEM', actions: [update] }] }] } as typeof block;
  const onAction = jest.fn();
  render(<InventoryResultList block={explicit} propertyId="home" onAction={onAction} onFilter={() => {}} onPage={() => {}} onAccessLost={() => {}} link={(_, label) => label} />);
  fireEvent.click(screen.getByRole('button', { name: 'Update coverage status' }));
  expect(onAction).toHaveBeenCalledWith('INVENTORY_ITEM', 'item-0', 'Update the coverage status for this inventory item.', 'COVERAGE_COMMAND', 'MUTATE_RECORD');
});

// Row density: editability moves to detail, the row keeps one contextual action, and details remain keyboard-accessible through a quiet control.
test('a compact row omits editability copy and keeps its action with an accessible detail control', () => {
  const enriched = blockWithEnrichedRows(1);
  render(<InventoryResultList block={enriched} propertyId="home" onAction={jest.fn()} onFilter={() => {}} onPage={() => {}} onAccessLost={() => {}} link={(_, label) => label} />);
  expect(screen.queryByText('Editing available')).not.toBeInTheDocument();
  expect(screen.queryByText('View only')).not.toBeInTheDocument();
  const cell = screen.getByRole('button', { name: 'Record warranty' }).closest('td');
  expect(cell).toContainElement(screen.getByRole('button', { name: 'View details for Appliance 0' }));
  expect(screen.queryByText('View details')).not.toBeInTheDocument();
});

test('a warranty result labels the status directly and removes repeated shared scope and missing metadata', () => {
  const warrantyBlock: typeof block = {
    ...block,
    sections: [{ ...block.sections[0], title: 'Kitchen', count: 2, items: [
      { ...block.sections[0].items[0], title: 'Oven range', meta: ['Kitchen', 'Not recorded'], status: 'NO_LINK_RECORDED', actions: [recordWarranty] },
      { ...block.sections[0].items[1], title: 'Refrigerator', meta: ['Kitchen', 'Not recorded'], status: 'NO_LINK_RECORDED', actions: [recordWarranty] },
    ] }],
  };
  render(<InventoryResultList block={warrantyBlock} propertyId="home" onAction={jest.fn()} onFilter={() => {}} onPage={() => {}} onAccessLost={() => {}} link={(_, label) => label} />);
  expect(screen.getByRole('columnheader', { name: 'Warranty' })).toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'Details' })).not.toBeInTheDocument();
  expect(screen.getAllByText('Not recorded')).toHaveLength(2);
  expect(screen.getByText('Kitchen · 2')).toBeInTheDocument();
  expect(screen.queryByText('Kitchen')).not.toBeInTheDocument();
});
