import { fireEvent, render, screen, within } from '@testing-library/react';
import { StatusAccordionView } from '../patterns/StatusAccordionView';
import { CollectionStatusNote } from '../patterns/CollectionStatusNote';
import type { AskGroupedListItem } from '@/features/ask/types';

// Presentation Quality 5: deterministic accessibility attributes for the Status Board accordion and the collection note. Practical
// assistive-technology and browser review remain a manual step (see the implementation plan).

const item = (id: string, extra: Partial<AskGroupedListItem> = {}): AskGroupedListItem => ({ id, title: `Appliance ${id}`, meta: ['Kitchen'], entityType: 'THING', description: 'Past expected life', ...extra });
const sections = [
  { id: 'status-board-action-needed', title: 'Needs action', count: 1, items: [item('a')] },
  { id: 'status-board-monitor', title: 'Monitor', count: 8, initialVisibleCount: 3, items: Array.from({ length: 8 }, (_, i) => item(`m${i}`)) },
  { id: 'status-board-good', title: 'In good shape', count: 0, items: [] },
  { id: 'status-board-needs-info', title: 'Missing information', count: 1, items: [item('u', { needsInfo: true, timingLabel: 'Install date needed' })] },
];
const collection = { sourceTotal: 140, fetchedCount: 10, deliveredCount: 10, nextPageAvailable: false, deliveryTruncated: false };

test('tabs form a labelled tablist whose selected tab controls an existing labelled panel', () => {
  const { container } = render(<StatusAccordionView sections={sections as never} collection={collection} onItemAction={jest.fn()} disabled={false} />);
  const tablist = screen.getByRole('tablist', { name: 'Home status condition' });
  const tabs = within(tablist).getAllByRole('tab');
  expect(tabs).toHaveLength(4);
  expect(tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true')).toHaveLength(1);
  for (const tab of tabs) {
    const controls = tab.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    expect(container.querySelector(`#${controls}`)).toBeInTheDocument();
  }
  expect(screen.getByRole('tabpanel')).toHaveAccessibleName(/items$/);
});

test('urgency and unknown are distinguishable without colour: every tab carries a text label and a count', () => {
  render(<StatusAccordionView sections={sections as never} collection={collection} onItemAction={jest.fn()} disabled={false} />);
  expect(screen.getByRole('tab', { name: 'Needs action (1)' })).toBeVisible();
  expect(screen.getByRole('tab', { name: 'Missing info (1)' })).toBeVisible();
  fireEvent.click(screen.getByRole('tab', { name: 'Missing info (1)' }));
  expect(screen.getByRole('button', { name: /Install date needed/ })).toBeVisible();
});

test('an accordion row exposes expanded state and the element it controls; Show more is a real button that keeps focus', () => {
  const { container } = render(<StatusAccordionView sections={sections as never} collection={collection} onItemAction={jest.fn()} disabled={false} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Monitor (8)' }));
  const row = screen.getAllByRole('button', { name: /Appliance m0/ })[0];
  expect(row).toHaveAttribute('aria-expanded', 'true');
  expect(container.querySelector(`#${row.getAttribute('aria-controls')}`)).toBeInTheDocument();
  fireEvent.click(row);
  expect(row).toHaveAttribute('aria-expanded', 'false');

  const more = screen.getByRole('button', { name: 'Show 5 more' });
  more.focus();
  fireEvent.click(more);
  expect(container.querySelectorAll('[data-status-accordion-item]')).toHaveLength(8);
  expect(screen.getByRole('button', { name: 'Show fewer' })).toBe(document.activeElement);
});

test('a descriptor that delivers fewer rows than its source is stated in text; one that delivers everything adds nothing', () => {
  const { container, rerender } = render(<CollectionStatusNote collection={{ ...collection, deliveredCount: 10, sourceTotal: 140 }} />);
  expect(container.querySelector('[data-collection-note]')).toHaveTextContent('Showing 10 of 140.');
  rerender(<CollectionStatusNote collection={{ ...collection, deliveredCount: 10, sourceTotal: 10 }} />);
  expect(container.querySelector('[data-collection-note]')).toBeNull();
  rerender(<CollectionStatusNote collection={undefined} />);
  expect(container.querySelector('[data-collection-note]')).toBeNull();
});

test('the tab strip is two columns on narrow screens when four conditions are present (no page-height stack of tabs)', () => {
  render(<StatusAccordionView sections={sections as never} onItemAction={jest.fn()} disabled={false} />);
  expect(screen.getByRole('tablist').className).toMatch(/grid-cols-2/);
});
