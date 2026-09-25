import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BlockView } from '../blocks/registry';
import { SellerPrepItemResultList, saleItemActionsForLiveState } from '../SellerPrepItemResultList';
import type { AskPresentationBlock } from '@/features/ask/types';
import { getSaleCase } from '@/app/(dashboard)/dashboard/properties/[id]/tools/sale-case/saleCaseApi';
import type { SaleCaseOverview, SaleReadinessItem } from '@/app/(dashboard)/dashboard/properties/[id]/tools/sale-case/types';

jest.mock('@/app/(dashboard)/dashboard/properties/[id]/tools/sale-case/saleCaseApi', () => ({ getSaleCase: jest.fn() }));
const mockedGet = getSaleCase as jest.MockedFunction<typeof getSaleCase>;

// FRD v1.44 seller-prep capability-card slice.
const ACTIONS = [
  ['sale-item-pursue', 'Pursue before listing', 'Pursue this seller-prep checklist item.'],
  ['sale-item-unpursue', 'Stop pursuing', 'Stop pursuing this seller-prep checklist item.'],
  ['sale-item-waive', 'Disclose and waive', 'Waive this seller-prep checklist item.'],
  ['sale-item-reopen', 'Reopen', 'Reopen this seller-prep checklist item.'],
].map(([id, label, message]) => ({ id, label, message, style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'SELLER_PREP_ITEM_DECISION' }));
const block = (actions = ACTIONS): Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }> => ({
  type: 'GROUPED_LIST', id: 'seller-prep-open-items', title: 'Open items', filters: [],
  actions: [],
  sections: [{ id: 'seller-prep-presentation', title: 'Presentation', count: 1, items: [{
    id: 'item-1', title: 'Paint the front door', meta: ['$200–$400 estimated'], description: null, status: 'OPEN',
    href: '/dashboard/properties/home/tools/sale-case?focusItemId=item-1', entityType: 'SALE_READINESS_ITEM', actions,
  }] }],
});
const item = (overrides: Partial<SaleReadinessItem> = {}): SaleReadinessItem => ({
  id: 'item-1', saleCaseId: 'case-1', sourceEntityType: 'PRESENTATION', sourceEntityId: 'src', category: 'PRESENTATION', requirementClass: 'OPTIONAL_IMPROVEMENT',
  status: 'OPEN', title: 'Paint the front door', detail: 'A fresh front door is a low-cost first impression.', dueAt: null, canonicalWorkItemId: null, resolvedAt: null,
  waivedAt: null, waivedReason: null, estimatedCostMinCents: 20000, estimatedCostMaxCents: 40000, estimatedValueAddMinCents: null, estimatedValueAddMaxCents: null,
  recommendedForBudget: false, ...overrides,
} as SaleReadinessItem);
const overview = (items: SaleReadinessItem[], saleCase: SaleCaseOverview['saleCase'] = { id: 'case-1' } as SaleCaseOverview['saleCase']): SaleCaseOverview =>
  ({ propertyId: 'home', saleIntentConfirmed: true, canCreate: false, saleCase, readinessItems: items, transitions: [] });
const link = (href: string, content: React.ReactNode) => <a href={href}>{content}</a>;
const shown = () => Array.from(document.querySelectorAll('[data-sale-item-action]')).map((node) => node.getAttribute('data-sale-item-action'));
async function open(live: SaleCaseOverview | Error, onAction = jest.fn(), actions = ACTIONS, onAccessLost = jest.fn()) {
  if (live instanceof Error) mockedGet.mockRejectedValueOnce(live); else mockedGet.mockResolvedValueOnce(live);
  render(<SellerPrepItemResultList block={block(actions)} propertyId="home" onAction={onAction} onAccessLost={onAccessLost} link={link} />);
  fireEvent.click(screen.getByRole('button', { name: 'Paint the front door' }));
  return { onAction, onAccessLost };
}

beforeEach(() => jest.clearAllMocks());

test('live-state rules mirror the sale-case page', () => {
  const ids = (state: Partial<SaleReadinessItem>) => saleItemActionsForLiveState(ACTIONS, { status: 'OPEN', category: 'PRESENTATION', requirementClass: 'OPTIONAL_IMPROVEMENT', ...state }).map((action) => action.id);
  expect(ids({})).toEqual(['sale-item-pursue']);
  expect(ids({ status: 'PURSUING' })).toEqual(['sale-item-unpursue']);
  expect(ids({ category: 'FINANCIAL_DECISION', requirementClass: 'PROFESSIONAL_DECISION' })).toEqual(['sale-item-waive']);
  // The page never offers a waive on a must-fix item.
  expect(ids({ category: 'SAFETY_STRUCTURAL', requirementClass: 'MATERIAL_BLOCKER' })).toEqual([]);
  expect(ids({ status: 'WAIVED', category: 'FINANCIAL_DECISION', requirementClass: 'PROFESSIONAL_DECISION' })).toEqual(['sale-item-reopen']);
  expect(ids({ status: 'RESOLVED' })).toEqual([]);
});

test('an item opens inline from the sale case, with its cost and a link to it on the checklist page', async () => {
  await open(overview([item({ id: 'other', title: 'Other' }), item()]));
  await waitFor(() => expect(screen.getByText('A fresh front door is a low-cost first impression.')).toBeInTheDocument());
  expect(mockedGet).toHaveBeenCalledWith('home');
  expect(screen.getByText('$200 – $400')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Open in the checklist/ })).toHaveAttribute('href', '/dashboard/properties/home/tools/sale-case?focusItemId=item-1');
});

test('actions follow the LIVE state (not the list\'s) and dispatch the exact item and canned message', async () => {
  const { onAction } = await open(overview([item({ status: 'PURSUING' })]));
  await waitFor(() => expect(shown()).toEqual(['sale-item-unpursue']));
  fireEvent.click(screen.getByRole('button', { name: 'Stop pursuing' }));
  expect(onAction).toHaveBeenCalledWith('SALE_READINESS_ITEM', 'item-1', 'Stop pursuing this seller-prep checklist item.', 'SELLER_PREP_ITEM_DECISION', 'MUTATE_RECORD');
});

test('a waived item shows its reason and offers only Reopen', async () => {
  await open(overview([item({ status: 'WAIVED', category: 'FINANCIAL_DECISION', requirementClass: 'PROFESSIONAL_DECISION', waivedReason: 'Disclosed to buyers' })]));
  await waitFor(() => expect(screen.getByText('Disclosed to buyers')).toBeInTheDocument());
  expect(shown()).toEqual(['sale-item-reopen']);
});

test('a viewer (no declared actions) gets read-only detail', async () => {
  await open(overview([item()]), jest.fn(), []);
  await waitFor(() => expect(screen.getByText('A fresh front door is a low-cost first impression.')).toBeInTheDocument());
  expect(shown()).toEqual([]);
});

test('an item missing from the checklist, or a sale case that is gone, is "no longer on the checklist"', async () => {
  const first = await open(overview([item({ id: 'someone-else' })]));
  await waitFor(() => expect(screen.getByText('Item no longer on the checklist')).toBeInTheDocument());
  expect(first.onAccessLost).not.toHaveBeenCalled();
});

test('a sale case that no longer exists is also "no longer on the checklist"', async () => {
  const { onAccessLost } = await open(overview([], null));
  await waitFor(() => expect(screen.getByText('Item no longer on the checklist')).toBeInTheDocument());
  expect(onAccessLost).not.toHaveBeenCalled();
});

test('a property access denial redacts instead', async () => {
  const { onAccessLost } = await open(Object.assign(new Error('denied'), { status: 404 }));
  await waitFor(() => expect(onAccessLost).toHaveBeenCalled());
});

test('the registry routes seller-prep-open-items here and wires item actions through', async () => {
  const onItemAction = jest.fn();
  mockedGet.mockResolvedValueOnce(overview([item()]));
  render(<BlockView block={block()} executionId="execution" propertyId="home" itemActionsDisabled={false} onItemAction={onItemAction} onFilterClick={() => {}} onCollectionPage={() => {}} onAccessLost={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Paint the front door' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Pursue before listing' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Pursue before listing' }));
  expect(onItemAction).toHaveBeenCalledWith('SALE_READINESS_ITEM', 'item-1', 'Pursue this seller-prep checklist item.', 'SELLER_PREP_ITEM_DECISION', 'MUTATE_RECORD');
});

// FRD v1.84 (IW-PRES-014): the same component as shelves; the live item and its decisions are unchanged.
test('as shelves, a card opens the live item in a sheet with its decision, and sending it closes the sheet', async () => {
  const onAction = jest.fn();
  mockedGet.mockResolvedValueOnce(overview([item()]));
  render(<SellerPrepItemResultList block={block()} propertyId="home" onAction={onAction} onAccessLost={jest.fn()} link={link} layout="SHELVES" onChooseLayout={jest.fn()} />);
  expect(screen.getByRole('list', { name: 'Presentation, 1 item' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Paint the front door/ }));
  const sheet = await screen.findByRole('dialog', { name: 'Item detail: Paint the front door' });
  await waitFor(() => expect(sheet).toHaveTextContent('A fresh front door is a low-cost first impression.'));
  expect(shown()).toEqual(['sale-item-pursue']);
  fireEvent.click(screen.getByRole('button', { name: 'Pursue before listing' }));
  expect(onAction).toHaveBeenCalledWith('SALE_READINESS_ITEM', 'item-1', 'Pursue this seller-prep checklist item.', 'SELLER_PREP_ITEM_DECISION', 'MUTATE_RECORD');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
