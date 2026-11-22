import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { BlockView } from '../blocks/registry';
import { canonicalRendererId } from '../blocks/GroupedListBlock';
import type { AskPresentationBlock } from '@/features/ask/types';

type ListBlock = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;

// UI review 2026-11-21, slice 2: a producer that declares what kind of record its list carries gets that kind's canonical renderer, whatever the block id is.
const claimList = (over: Partial<ListBlock> = {}): ListBlock => ({
  type: 'GROUPED_LIST', id: 'cross-domain-grouped-list', title: 'Claims', filters: [], actions: [],
  sections: [{ id: 'open-claims', title: 'Open claims', count: 1, items: [{ id: 'claim-1', title: 'Kitchen leak', meta: [], status: 'DRAFT', entityType: 'CLAIM' }] }],
  ...over,
});
const asProps = (block: ListBlock) => propsFor(block) as unknown as ComponentProps<typeof BlockView>;
const propsFor = (block: ListBlock) => ({ block, executionId: 'e1', propertyId: 'home', itemActionsDisabled: false, onItemAction: jest.fn(), onFilterClick: jest.fn(), onAccessLost: jest.fn() });

describe('list renderer follows the declared record kind', () => {
  it('chooses the renderer by the declared kind, for each kind that has a domain renderer, without changing the block', () => {
    const idFor = (recordKind: ListBlock['recordKind']) => canonicalRendererId(claimList({ recordKind }));
    expect(idFor('CLAIM')).toBe('incident-claim-list');
    expect(idFor('PERMIT')).toBe('permit-tracker-permits');
    expect(idFor('WARRANTY')).toBe('warranty-results');
    expect(idFor('INVENTORY_ITEM')).toBe('inventory-results');
    expect(idFor('HOME_EVENT')).toBe('inventory-history');
    const block = claimList({ recordKind: 'CLAIM' });
    canonicalRendererId(block);
    expect(block.id).toBe('cross-domain-grouped-list');
  });

  it('keeps the producer’s id for a list with no kind, an unmapped kind, a kind the shared list renders, or the canonical id already', () => {
    expect(canonicalRendererId(claimList())).toBe('cross-domain-grouped-list');
    expect(canonicalRendererId(claimList({ recordKind: 'MAINTENANCE_TASK' }))).toBe('cross-domain-grouped-list');
    expect(canonicalRendererId(claimList({ recordKind: 'PROJECT' }))).toBe('cross-domain-grouped-list');
    expect(canonicalRendererId(claimList({ id: 'incident-claim-list', recordKind: 'CLAIM' }))).toBe('incident-claim-list');
  });

  it('routes maintenance and document lists only when their rows carry the metadata those renderers require', () => {
    const rows = (over: Record<string, unknown>) => [{ id: 's', title: 'Group', count: 1, items: [{ id: 't1', title: 'Service furnace', meta: [], ...over }] }];
    const task = (over: Record<string, unknown> = {}) => claimList({ recordKind: 'MAINTENANCE_TASK', sections: rows({ entityType: 'MAINTENANCE_TASK', status: 'PENDING', ...over }) as ListBlock['sections'] });
    expect(canonicalRendererId(task())).toBe('maintenance-groups');
    expect(canonicalRendererId(task({ status: undefined }))).toBe('cross-domain-grouped-list');
    expect(canonicalRendererId(task({ entityType: undefined }))).toBe('cross-domain-grouped-list');
    const doc = (over: Record<string, unknown> = {}) => claimList({ recordKind: 'DOCUMENT', sections: rows({ entityType: 'DOCUMENT', ...over }) as ListBlock['sections'] });
    expect(canonicalRendererId(doc())).toBe('document-lookup-groups');
    expect(canonicalRendererId(doc({ entityType: undefined }))).toBe('cross-domain-grouped-list');
  });

  it('renders the claim list for a claim kind under a generated id, and the generic list without it', async () => {
    const declared = render(<BlockView {...asProps(claimList({ recordKind: 'CLAIM' }))} />);
    expect(await screen.findByText('Kitchen leak')).toBeInTheDocument();
    expect(declared.container.querySelector('[data-claim-detail-trigger]')).not.toBeNull();
    declared.unmount();
    const generic = render(<BlockView {...asProps(claimList())} />);
    expect(await screen.findByText('Kitchen leak')).toBeInTheDocument();
    expect(generic.container.querySelector('[data-claim-detail-trigger]')).toBeNull();
  });
});
