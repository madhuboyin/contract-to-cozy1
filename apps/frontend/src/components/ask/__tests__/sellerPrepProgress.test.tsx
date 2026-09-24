import { fireEvent, render, screen, within } from '@testing-library/react';
import { BlockView } from '../blocks/registry';
import type { AskPresentationBlock } from '@/features/ask/types';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 IW-PRES-020 (FRD v1.80): seller-prep's sale readiness ring. The percent and its
// basis are the sale case's own; the next steps carry the two decisions an open item allows and a link to the item.

const pursue = { id: 'sale-item-pursue', label: 'Pursue before listing', message: 'Pursue this seller-prep checklist item.', style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'SELLER_PREP_ITEM_DECISION' };
const waive = { id: 'sale-item-waive', label: 'Disclose and waive', message: 'Waive this seller-prep checklist item.', style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'SELLER_PREP_ITEM_DECISION' };
const block: Extract<AskPresentationBlock, { type: 'PROGRESS' }> = {
  type: 'PROGRESS', id: 'seller-prep-progress', title: 'Sale readiness', description: 'Counts the must-address items.',
  percent: 50, basis: '3 of 6 must-address items resolved or disclosed',
  metrics: [{ label: 'Open', value: '2', tone: 'CAUTION' }, { label: 'Pursuing', value: '1', tone: 'DEFAULT' }, { label: 'Waived', value: '1', tone: 'DEFAULT' }],
  nextSteps: [
    { id: 'blocker-open', title: 'Repair the cracked foundation wall', description: 'Safety & structural · Blocks a sale', amountLabel: '$5,000–$9,000 estimated', meta: [], status: 'OPEN', href: '/dashboard/properties/home/tools/sale-case?focusItemId=blocker-open', entityType: 'SALE_READINESS_ITEM', actions: [pursue, waive] },
    { id: 'verify-open', title: 'Confirm the deck permit', description: 'Permits & disclosure · Needs verifying', amountLabel: null, meta: [], status: 'OPEN', href: '/dashboard/properties/home/tools/sale-case?focusItemId=verify-open', entityType: 'SALE_READINESS_ITEM', actions: [pursue, waive] },
  ],
  actions: [],
};

test('the ring shows the declared percent and basis, the must-address tiles, and each next step with its facts, link and decisions', () => {
  const onItemAction = jest.fn();
  const { container } = render(<BlockView block={block} executionId="e" propertyId="home" onItemAction={onItemAction} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />);
  expect(screen.getByRole('img', { name: '50% ready. 3 of 6 must-address items resolved or disclosed' })).toBeInTheDocument();
  expect(Array.from(container.querySelectorAll('dl > div')).map((tile) => tile.textContent)).toEqual(['Open2', 'Pursuing1', 'Waived1']);
  const blocker = container.querySelector('[data-ask-progress-step="blocker-open"]') as HTMLElement;
  expect(within(blocker).getByText('Safety & structural · Blocks a sale · $5,000–$9,000 estimated')).toBeInTheDocument();
  expect(within(blocker).getByRole('link', { name: 'Open Repair the cracked foundation wall' })).toHaveAttribute('href', '/dashboard/properties/home/tools/sale-case?focusItemId=blocker-open');
  fireEvent.click(within(blocker).getByRole('button', { name: /Disclose and waive/ }));
  expect(onItemAction).toHaveBeenCalledWith('SALE_READINESS_ITEM', 'blocker-open', 'Waive this seller-prep checklist item.', 'SELLER_PREP_ITEM_DECISION', 'MUTATE_RECORD');
  expect(within(container.querySelector('[data-ask-progress-step="verify-open"]') as HTMLElement).queryByText(/estimated/)).toBeNull();
});
