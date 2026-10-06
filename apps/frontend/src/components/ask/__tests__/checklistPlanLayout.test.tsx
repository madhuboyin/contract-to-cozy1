import { fireEvent, render, screen } from '@testing-library/react';
import { GroupedListBlock } from '../blocks/GroupedListBlock';
import type { AskPresentationBlock } from '@/features/ask/types';

// The hiring guide, home-basics guides, renovation readiness checklist and tax appeal readiness list render in the plan layout (FRD Appendix C.9).
type ListBlock = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;

const block = (id: string, tone: 'CAUTION' | 'DEFAULT', detail?: string): ListBlock => ({
  type: 'GROUPED_LIST', id, title: 'Checklist', actions: [], filters: [],
  sections: [{ id: `${id}-section`, title: 'Section', count: 1, items: [{ id: 'one', title: 'First item', description: 'Why it matters.', meta: ['Chip'], countLabel: '1', tone, ...(detail ? { detail } : {}) }] }],
} as unknown as ListBlock);

const renderBlock = (value: ListBlock) => render(
  <GroupedListBlock block={value} executionId="e" propertyId="home" onItemAction={jest.fn()} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />,
);

const sixItems = (id: string, initialVisibleCount?: number): ListBlock => ({
  type: 'GROUPED_LIST', id, title: 'Checklist', actions: [], filters: [],
  sections: [{
    id: `${id}-section`, title: 'Most important first', count: 6, ...(initialVisibleCount ? { initialVisibleCount } : {}),
    items: Array.from({ length: 6 }, (_, index) => ({ id: `item-${index + 1}`, title: `Item ${index + 1}`, description: 'Why it matters.', meta: [], countLabel: String(index + 1) })),
  }],
} as unknown as ListBlock);

describe('a plan section whose producer declares an initial visible count', () => {
  // The producer declares the boundary; the renderer only expands and collapses. Two different plan ids prove it is not tied to one block id.
  it.each(['home-basics-items', 'hiring-guide-items', 'renovation-readiness-items'])('%s shows only the declared items first and reveals the rest with an accessible control', (id) => {
    const { container } = renderBlock(sixItems(id, 3));
    expect(container.querySelectorAll('[data-seasonal-task]')).toHaveLength(3);
    expect(container.querySelector('[data-seasonal-task="item-4"]')).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Show 3 more' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', container.querySelector('ol')!.id);
    fireEvent.click(toggle);
    expect(container.querySelectorAll('[data-seasonal-task]')).toHaveLength(6);
    const less = screen.getByRole('button', { name: 'Show fewer' });
    expect(less).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(less);
    expect(container.querySelectorAll('[data-seasonal-task]')).toHaveLength(3);
  });

  it('collapses only the section that declares a count: a sibling section without the field shows every item', () => {
    const value = {
      type: 'GROUPED_LIST', id: 'renovation-readiness-items', title: 'Readiness checklist', actions: [], filters: [],
      sections: [
        { id: 'blocking', title: 'Blocking', count: 2, items: ['b1', 'b2'].map((id, index) => ({ id, title: id, description: null, meta: [], countLabel: String(index + 1), tone: 'CAUTION' })) },
        { id: 'other-open', title: 'Other open items', count: 8, initialVisibleCount: 5, items: Array.from({ length: 8 }, (_, index) => ({ id: `o${index + 1}`, title: `o${index + 1}`, description: null, meta: [], countLabel: String(index + 3), tone: 'DEFAULT' })) },
      ],
    } as unknown as ListBlock;
    const { container } = renderBlock(value);
    expect(container.querySelectorAll('[data-seasonal-section="blocking"] [data-seasonal-task]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-seasonal-section="other-open"] [data-seasonal-task]')).toHaveLength(5);
    expect(screen.getAllByRole('button', { name: /show (?:\d+ more|fewer)/i })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Show 3 more' })).toBeInTheDocument();
  });

  it('the control is a real button, so Enter and Space activate it through the browser default', () => {
    renderBlock(sixItems('home-basics-items', 3));
    const toggle = screen.getByRole('button', { name: 'Show 3 more' });
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle).toHaveAttribute('type', 'button');
  });

  it('without the field, or when it covers every item, all items show and there is no control', () => {
    for (const count of [undefined, 6, 9]) {
      const { container, unmount } = renderBlock(sixItems('home-basics-items', count));
      expect(container.querySelectorAll('[data-seasonal-task]')).toHaveLength(6);
      expect(screen.queryByRole('button', { name: /show (?:\d+ more|fewer)/i })).toBeNull();
      unmount();
    }
  });
});

describe('checklist answers use the plan layout', () => {
  it.each(['hiring-guide-items', 'home-basics-items', 'renovation-readiness-items', 'tax-readiness-gaps'])('%s renders numbered plan cards', (id) => {
    const { container } = renderBlock(block(id, 'DEFAULT'));
    expect(container.querySelector('[data-seasonal-plan]')).not.toBeNull();
    expect(container.querySelector('[data-seasonal-task="one"]')).toHaveTextContent('1');
    expect(container.querySelector('[data-seasonal-task="one"]')).toHaveTextContent('First item');
  });

  it('an urgent group reads as urgent and its facts open under the card', () => {
    const { container } = renderBlock(block('renovation-readiness-items', 'CAUTION', 'Next step: Upload the permit\nEvidence needed: The approved permit'));
    expect(container.querySelector('[data-seasonal-section]')?.className).toContain('border-rose-100');
    fireEvent.click(screen.getByRole('button', { name: /what to know/i }));
    const detail = container.querySelector('[data-seasonal-task-detail="one"]') as HTMLElement;
    expect(detail).toHaveTextContent('Next step');
    expect(detail).toHaveTextContent('The approved permit');
  });

  it('a list that is not a registered checklist keeps the generic cards', () => {
    const { container } = renderBlock(block('inventory-items', 'DEFAULT'));
    expect(container.querySelector('[data-seasonal-plan]')).toBeNull();
  });
});
