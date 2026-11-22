import { render, screen } from '@testing-library/react';
import { BlockView } from '../blocks/registry';
import { withCanonicalListId } from '../blocks/GroupedListBlock';
import type { AskPresentationBlock } from '@/features/ask/types';

type ListBlock = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;

// UI review 2026-11-21, slice 2: a producer that declares what kind of record its list carries gets that kind's canonical renderer, whatever the block id is.
const claimList = (over: Partial<ListBlock> = {}): ListBlock => ({
  type: 'GROUPED_LIST', id: 'cross-domain-grouped-list', title: 'Claims', filters: [], actions: [],
  sections: [{ id: 'open-claims', title: 'Open claims', count: 1, items: [{ id: 'claim-1', title: 'Kitchen leak', meta: [], status: 'DRAFT', entityType: 'CLAIM' }] }],
  ...over,
});
const propsFor = (block: ListBlock) => ({ block, executionId: 'e1', propertyId: 'home', itemActionsDisabled: false, onItemAction: jest.fn(), onFilterClick: jest.fn(), onAccessLost: jest.fn() });

describe('list renderer follows the declared record kind', () => {
  it('maps a generated id to the canonical id for each kind that has a domain renderer', () => {
    const idFor = (recordKind: ListBlock['recordKind']) => withCanonicalListId(propsFor(claimList({ recordKind }))).block.id;
    expect(idFor('CLAIM')).toBe('incident-claim-list');
    expect(idFor('PERMIT')).toBe('permit-tracker-permits');
    expect(idFor('WARRANTY')).toBe('warranty-results');
    expect(idFor('INVENTORY_ITEM')).toBe('inventory-results');
    expect(idFor('HOME_EVENT')).toBe('inventory-history');
  });

  it('leaves a list unchanged when it declares no kind, an unmapped kind, or already has the canonical id', () => {
    expect(withCanonicalListId(propsFor(claimList())).block.id).toBe('cross-domain-grouped-list');
    expect(withCanonicalListId(propsFor(claimList({ recordKind: 'MAINTENANCE_TASK' }))).block.id).toBe('cross-domain-grouped-list');
    expect(withCanonicalListId(propsFor(claimList({ id: 'incident-claim-list', recordKind: 'CLAIM' }))).block.id).toBe('incident-claim-list');
  });

  it('renders the claim list for a claim kind under a generated id, and the generic list without it', async () => {
    const declared = render(<BlockView {...(propsFor(claimList({ recordKind: 'CLAIM' })) as never)} />);
    expect(await screen.findByText('Kitchen leak')).toBeInTheDocument();
    expect(declared.container.querySelector('[data-claim-detail-trigger]')).not.toBeNull();
    declared.unmount();
    const generic = render(<BlockView {...(propsFor(claimList()) as never)} />);
    expect(await screen.findByText('Kitchen leak')).toBeInTheDocument();
    expect(generic.container.querySelector('[data-claim-detail-trigger]')).toBeNull();
  });
});
