import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { BlockView } from '../blocks/registry';
import type { AskPresentationBlock } from '@/features/ask/types';

type ListBlock = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;

// UI review 2026-11-21, slice 4: a generic list draws no empty heading, never shows the same heading twice, and states a count only where it adds information.
const list = (over: Partial<ListBlock>): ListBlock => ({
  type: 'GROUPED_LIST', id: 'cross-domain-grouped-list', title: '', filters: [], actions: [], listDensity: 'DENSE',
  sections: [{ id: 's1', title: '', count: 2, items: [{ id: 'a', title: 'Roof', meta: [] }, { id: 'b', title: 'Addition', meta: [] }] }],
  ...over,
});
const view = (block: ListBlock) => render(<BlockView {...({ block, executionId: 'e1', propertyId: 'home', itemActionsDisabled: false, onItemAction: jest.fn(), onFilterClick: jest.fn(), onAccessLost: jest.fn() } as unknown as ComponentProps<typeof BlockView>)} />);

describe('generic list chrome', () => {
  it('draws no header and no visible section heading for a list with no heading of its own', () => {
    const { container } = view(list({}));
    expect(container.querySelector('h3')).toBeNull();
    const heading = screen.getByRole('heading', { name: 'Matching records' });
    expect(heading.closest('div.sr-only')).not.toBeNull();
    expect(screen.getByText('Roof')).toBeInTheDocument();
    expect(screen.getByText('Addition')).toBeInTheDocument();
  });

  it('shows a heading once when the section only repeats it, and keeps the section heading for assistive technology', () => {
    const { container } = view(list({ title: 'Open claims', sections: [{ id: 's1', title: 'Open claims', count: 1, items: [{ id: 'a', title: 'Kitchen leak', meta: [] }] }] }));
    expect(container.querySelectorAll('h3')).toHaveLength(1);
    const sectionHeading = screen.getByRole('heading', { level: 4, name: 'Open claims' });
    expect(sectionHeading.closest('div.sr-only')).not.toBeNull();
  });

  it('still shows a section heading that says something the list heading does not', () => {
    view(list({ title: 'Claims', sections: [{ id: 's1', title: 'Open', count: 1, items: [{ id: 'a', title: 'Kitchen leak', meta: [] }] }, { id: 's2', title: 'Closed', count: 1, items: [{ id: 'b', title: 'Old leak', meta: [] }] }] }));
    expect(screen.getByRole('heading', { level: 4, name: 'Open' }).closest('div.sr-only')).toBeNull();
    expect(screen.getByRole('heading', { level: 4, name: 'Closed' }).closest('div.sr-only')).toBeNull();
  });
});
