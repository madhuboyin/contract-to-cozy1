import { fireEvent, render, screen, within } from '@testing-library/react';
import { useMemo } from 'react';
import { BlockView } from '../blocks/registry';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 IW-PRES-018 (FRD v1.78): Appliance Oracle as lifespan bars. Labels are the
// Oracle's own risk levels (server-declared), facts sit under each bar, and appliances with no age carry an inline
// "Add purchase date" capture that opens the existing inventory correction.

type LifespanBlock = Extract<AskPresentationBlock, { type: 'LIFESPAN' }>;
const addDate = { id: 'correct-purchasedOn', label: 'Add purchase date', message: 'Correct the purchase date of this inventory item.', style: 'PRIMARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'INVENTORY_ITEM_CORRECT' };
const block: LifespanBlock = {
  type: 'LIFESPAN', id: 'appliance-oracle-items', title: 'Appliance lifespans', description: 'Each bar shows the appliance\'s age against its typical life.',
  basis: 'An estimate from each appliance\'s purchase date and a typical lifespan for its type, not an inspection.',
  items: [
    { id: 'item-fridge', label: 'Refrigerator', ageYears: 4, typicalLifeYears: { min: 11, max: 15 }, status: 'WITHIN_RANGE', statusLabel: 'Low · 3% failure risk', entityType: 'INVENTORY_ITEM', meta: ['About 9 years left, around Sep 2035', 'Replacement about $1,800'] },
    { id: 'item-dishwasher', label: 'Dishwasher', ageYears: 12, typicalLifeYears: { min: 8, max: 12 }, status: 'PAST_RANGE', statusLabel: 'Critical · 64% failure risk', entityType: 'INVENTORY_ITEM', meta: ['Past its expected life', 'Replacement about $800'] },
    { id: 'item-new', label: 'Microwave hood', ageYears: 0, typicalLifeYears: { min: 8, max: 10 }, status: 'WITHIN_RANGE', statusLabel: 'Low · 0% failure risk', entityType: 'INVENTORY_ITEM' },
  ],
  missingAge: [{ id: 'item-dryer', label: 'Dryer', entityType: 'INVENTORY_ITEM', actions: [addDate] }],
  missingAgeTitle: 'No purchase date yet for this appliance',
};

function Harness({ value, onItemAction }: { value: LifespanBlock; onItemAction: jest.Mock }) {
  const response = useMemo(() => ({ sessionId: 's', executionId: 'e', property: { id: 'home', label: 'Home' }, blocks: [value], updatedAt: '2026-09-24T12:00:00.000Z' } as AskExecutionResponse), [value]);
  const controls = useResultView(response);
  return <ResultViewContext.Provider value={controls}>
    <BlockView block={value} executionId="e" propertyId="home" onItemAction={onItemAction} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />
  </ResultViewContext.Provider>;
}

test('bars are ordered by share of typical life used, with the Oracle\'s label and the facts under each bar; a new appliance shows at 0 years', () => {
  const { container } = render(<Harness value={block} onItemAction={jest.fn()} />);
  const rows = Array.from(container.querySelectorAll('[data-ask-lifespan-item]'));
  expect(rows.map((row) => row.getAttribute('data-ask-lifespan-item'))).toEqual(['item-dishwasher', 'item-fridge', 'item-new']);
  expect(within(rows[0] as HTMLElement).getByText('Critical · 64% failure risk')).toBeInTheDocument();
  expect(within(rows[0] as HTMLElement).getByText('Past its expected life · Replacement about $800')).toBeInTheDocument();
  expect(within(rows[2] as HTMLElement).getByText('0 yrs old · usually lasts 8–10')).toBeInTheDocument();
  expect((rows[2] as HTMLElement).querySelector('[data-ask-lifespan-meta]')).toBeNull();
  expect(screen.getByText(/purchase date and a typical lifespan/)).toBeInTheDocument();
});

test('an appliance with no age is not drawn; its declared heading and "Add purchase date" open the inventory correction for that item', () => {
  const onItemAction = jest.fn();
  const { container } = render(<Harness value={block} onItemAction={onItemAction} />);
  expect(container.querySelector('[data-ask-lifespan-item="item-dryer"]')).toBeNull();
  expect(screen.getByText('No purchase date yet for this appliance')).toBeInTheDocument();
  const missing = container.querySelector('[data-ask-lifespan-missing="item-dryer"]') as HTMLElement;
  fireEvent.click(within(missing).getByRole('button', { name: /Add purchase date/ }));
  expect(onItemAction).toHaveBeenCalledWith('INVENTORY_ITEM', 'item-dryer', 'Correct the purchase date of this inventory item.', 'INVENTORY_ITEM_CORRECT', 'MUTATE_RECORD');
});

test('without a declared heading the missing-age list uses a neutral one, not "install year"', () => {
  render(<Harness value={{ ...block, missingAgeTitle: null, missingAge: [...block.missingAge, { id: 'item-washer', label: 'Washer', entityType: 'INVENTORY_ITEM', actions: [addDate] }] }} onItemAction={jest.fn()} />);
  expect(screen.getByText('No age recorded yet for these 2 items')).toBeInTheDocument();
  expect(screen.queryByText(/install year/i)).toBeNull();
});
