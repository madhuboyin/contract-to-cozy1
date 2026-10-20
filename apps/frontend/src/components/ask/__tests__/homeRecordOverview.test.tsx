import { fireEvent, render, screen } from '@testing-library/react';
import type { AskPresentationBlock } from '@/features/ask/types';
import { GroupedListBlock } from '../blocks/GroupedListBlock';

type Block = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
const action = (id: string, label: string, operationId: string) => ({ id, label, operationId, message: `${label} message`, interactionType: 'CONVERSATION_CONTINUE' as const, style: 'SECONDARY' as const });
const block: Block = {
  type: 'GROUPED_LIST', id: 'property-record-index', title: 'Choose an area', description: 'Each choice asks a focused follow-up here in Ask Cozy.', filters: [], actions: [],
  sections: [{ id: 'record-sections', title: 'Home record areas', count: 7, items: [
    { id: 'profile', title: 'Property details', description: 'Structure, use, systems and safety.', entityType: 'PROPERTY_RECORD_SECTION', href: null, status: '2 NEED REVIEW', meta: ['66 known facts'], actions: [action('review', 'Review details', 'PROPERTY_SUMMARY')] },
    { id: 'rooms', title: 'Rooms', description: 'Rooms and floor placement.', entityType: 'PROPERTY_RECORD_SECTION', href: null, status: null, meta: ['4 rooms'], actions: [action('rooms', 'View rooms', 'PROPERTY_SUMMARY')] },
    { id: 'inventory', title: 'Systems and inventory', description: 'Appliances and equipment.', entityType: 'PROPERTY_RECORD_SECTION', href: null, status: null, meta: ['8 items', '8 verified'], actions: [action('inventory', 'View inventory', 'INVENTORY_LOOKUP')] },
    { id: 'documents', title: 'Documents', description: 'Reports and receipts.', entityType: 'PROPERTY_RECORD_SECTION', href: null, status: null, meta: ['0 documents'], actions: [action('documents', 'View documents', 'DOCUMENT_LOOKUP')] },
    { id: 'warranties', title: 'Warranties', description: 'Product coverage.', entityType: 'PROPERTY_RECORD_SECTION', href: null, status: null, meta: ['2 warranties'], actions: [action('warranties', 'View warranties', 'WARRANTY_LOOKUP')] },
    { id: 'timeline', title: 'Home timeline', description: 'Confirmed home history.', entityType: 'PROPERTY_RECORD_SECTION', href: null, status: null, meta: ['3 events'], actions: [action('timeline', 'View timeline', 'HOME_TIMELINE_EVENTS')] },
    { id: 'household', title: 'Household access', description: 'People with access.', entityType: 'PROPERTY_RECORD_SECTION', href: null, status: null, meta: ['2 members'], actions: [] },
  ] }],
};

const renderBlock = (onItemAction = jest.fn()) => render(<GroupedListBlock block={block} executionId="execution" propertyId="home" onItemAction={onItemAction} itemActionsDisabled={false} onFilterClick={jest.fn()} onCollectionPage={jest.fn()} onAccessLost={jest.fn()} />);

describe('Browse my home record presentation', () => {
  it('uses the dedicated compact index with no generic layout controls', () => {
    const { container } = renderBlock();
    expect(container.querySelector('[data-home-record-overview]')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Home record areas' })).toHaveClass('md:grid-cols-2');
    expect(screen.getAllByRole('listitem')).toHaveLength(7);
    expect(screen.queryByRole('button', { name: 'Auto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'List' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cards' })).not.toBeInTheDocument();
  });

  it('keeps attention, empty state and continuation action in one scannable row', () => {
    const onItemAction = jest.fn();
    const { container } = renderBlock(onItemAction);
    const attention = container.querySelector('[data-home-record-area="profile"]');
    const empty = container.querySelector('[data-home-record-area="documents"]');
    expect(attention).toHaveAttribute('data-record-attention');
    expect(attention).toHaveTextContent('2 NEED REVIEW');
    expect(empty).toHaveAttribute('data-record-empty');
    expect(empty).toHaveTextContent('0 documents');
    fireEvent.click(screen.getByRole('button', { name: 'View inventory: Systems and inventory' }));
    expect(onItemAction).toHaveBeenCalledWith('PROPERTY_RECORD_SECTION', 'inventory', 'View inventory message', 'INVENTORY_LOOKUP', 'CONVERSATION_CONTINUE');
  });
});
