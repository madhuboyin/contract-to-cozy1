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
