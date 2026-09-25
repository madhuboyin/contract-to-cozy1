/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ItemCard from '../ItemCard';
import { MobileInventoryItemCard } from '@/app/(dashboard)/dashboard/components/inventory/MobileInventorySections';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/dashboard/properties/p1/inventory',
  useSearchParams: () => new URLSearchParams(),
}));

const item = (extra: Record<string, unknown> = {}) => ({
  id: 'i1', propertyId: 'p1', name: 'Water heater', displayName: 'Water heater', category: 'PLUMBING', provenanceLabel: 'Based on property details · Needs confirmation',
  replacementCostCents: 150000, coverageState: 'MISSING', coverageActionable: true, ...extra,
}) as any;

const cards: Array<[string, (onClick: jest.Mock) => React.ReactElement]> = [
  ['desktop', (onClick) => <ItemCard item={item()} onClick={onClick} onGetCoverage={jest.fn()} onAttachDocument={jest.fn()} />],
  ['mobile', (onClick) => <MobileInventoryItemCard item={item()} onClick={onClick} onGetCoverage={jest.fn()} onAttachDocument={jest.fn()} />],
];

describe.each(cards)('%s inventory card accessibility', (_name, make) => {
  it('is not a button itself, so it does not nest interactive controls inside a button', () => {
    const { container } = render(make(jest.fn()));
    const card = container.querySelector('#item-i1') as HTMLElement;
    expect(card.getAttribute('role')).toBeNull();
    expect(card.getAttribute('tabindex')).toBeNull();
    expect(container.querySelectorAll('[role="button"]')).toHaveLength(0);
  });

  it('the title is the button that opens the item, reachable by keyboard', async () => {
    const onClick = jest.fn();
    render(make(onClick));
    const title = screen.getByRole('button', { name: 'Water heater' });
    title.focus();
    expect(title).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'i1' }));
    await userEvent.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('clicking the title opens the item once, not twice (the click does not also reach the card)', async () => {
    const onClick = jest.fn();
    render(make(onClick));
    await userEvent.click(screen.getByRole('button', { name: 'Water heater' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('a click on the card away from its buttons still opens the item for mouse and touch', () => {
    const onClick = jest.fn();
    const { container } = render(make(onClick));
    fireEvent.click(container.querySelector('#item-i1') as HTMLElement);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('a click on another control inside the card does not also open the item', async () => {
    const onClick = jest.fn();
    const { container } = render(make(onClick));
    const others = within(container).getAllByRole('button').filter((button) => !button.hasAttribute('data-inventory-card-open'));
    expect(others.length).toBeGreaterThan(0);
    for (const button of others) await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
