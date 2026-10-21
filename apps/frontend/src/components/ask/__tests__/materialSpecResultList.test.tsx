import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AskPresentationBlock } from '@/features/ask/types';
import { getSpec } from '@/app/(dashboard)/dashboard/properties/[id]/materials/materialSpecApi';
import { MaterialSpecResultList } from '../MaterialSpecResultList';

jest.mock('@/app/(dashboard)/dashboard/properties/[id]/materials/materialSpecApi', () => ({ getSpec: jest.fn() }));
jest.mock('../blocks/context', () => ({
  ActionLink: ({ action }: { action: { label: string } }) => <button type="button">{action.label}</button>,
  AskContextLink: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Material Specs list (FRD v1.390): compact rows that really open an inline canonical detail, friendly lifecycle wording, Add in the header,
// Edit only when the server declared it.

type Block = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
const editAction = { id: 'edit-material', label: 'Edit material', message: 'Edit this material.', style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId: 'MATERIAL_SPEC_UPDATE' };
const addAction = { id: 'add-material-spec', label: 'Add a material', message: 'Record a material used in this home.', style: 'PRIMARY', interactionType: 'START_WORKFLOW', operationId: 'MATERIAL_SPEC_ADD' };
const block = (options: { edit?: boolean; add?: boolean; status?: string } = {}): Block => ({
  type: 'GROUPED_LIST', id: 'material-specs-items', title: 'Saved materials', description: 'By type. Select View details to see everything recorded.', filters: [],
  actions: options.add === false ? [] : [addAction],
  sections: [{ id: 'material-specs-paint', title: 'Paint', count: 1, items: [{
    id: 'spec-1', title: 'Master Bed Wall paint', entityType: 'MATERIAL_SPEC', description: 'bahn', status: options.status ?? 'PROPOSED',
    meta: ['Master', 'Colour 00200', 'Finish matte', 'Supplier home depot'], ...(options.edit === false ? {} : { actions: [editAction] }),
  }] }],
} as unknown as Block);
const spec = {
  id: 'spec-1', label: 'Master Bed Wall paint', category: 'PAINT', scopeLevel: 'ROOM', surface: 'WALLS', manufacturer: 'bahn', productLine: null, productName: null, sku: 'SKU-9', colorCode: '00200', colorHex: '#ccddee',
  finish: 'matte', dimensions: null, material: null, lotBatch: 'LOT-4', supplier: 'home depot', purchaseDate: '2026-05-01T00:00:00.000Z', quantityPurchased: '2 gal', notes: 'Second coat in 2027.', lifecycleStatus: 'PROPOSED',
  verificationConfidence: 'REPORTED', supplierDiscontinued: true, supplierCheckedAt: '2026-06-01T00:00:00.000Z', isActive: true, photos: [{ id: 'p1', photoUrl: 'https://example.test/p.jpg', caption: 'Swatch' }], room: { id: 'r1', name: 'Master' },
};
const mockedGetSpec = getSpec as jest.Mock;
const renderList = (b: Block, onAction = jest.fn()) => render(<MaterialSpecResultList block={b} propertyId="home" onAction={onAction} onAccessLost={jest.fn()} />);

beforeEach(() => { mockedGetSpec.mockReset(); mockedGetSpec.mockResolvedValue(spec); });

test('a row is a real, explicit control with a friendly status, scannable match details, and Add in the header', () => {
  renderList(block());
  const row = screen.getByRole('button', { name: 'Master Bed Wall paint' });
  expect(row).toHaveTextContent('View details');
  expect(row).toHaveTextContent('Planned');
  expect(row).not.toHaveTextContent('PROPOSED');
  expect(screen.getByText('Master · bahn')).toBeVisible();
  expect(screen.getByText('Colour 00200 · Finish matte · Supplier home depot')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Add a material' })).toBeVisible();
  expect(row).toHaveAttribute('aria-expanded', 'false');
});

test('View details opens the continuous canonical detail with identity, product, purchase, notes, photos and the Manage region', async () => {
  renderList(block());
  fireEvent.click(screen.getByRole('button', { name: 'Master Bed Wall paint' }));
  expect(await screen.findByText('Material detail')).toBeVisible();
  expect(mockedGetSpec).toHaveBeenCalledWith('home', 'spec-1');
  expect(screen.getByText('Not yet confirmed as installed.')).toBeVisible();
  expect(screen.getByText('SKU-9')).toBeVisible();
  expect(screen.getByText('LOT-4')).toBeVisible();
  expect(screen.getByText('2 gal')).toBeVisible();
  expect(screen.getByText('Second coat in 2027.')).toBeVisible();
  expect(screen.getByText(/supplier has marked this product discontinued/)).toBeVisible();
  expect(screen.getByRole('img', { name: 'Swatch' })).toBeVisible();
  expect(screen.getByText('Manage material')).toBeVisible();
  expect(screen.getByRole('button', { name: /Edit material/ })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Master Bed Wall paint' })).toHaveAttribute('aria-expanded', 'true');
});

test('Edit material dispatches the exact declared action with the record identity', async () => {
  const onAction = jest.fn();
  renderList(block(), onAction);
  fireEvent.click(screen.getByRole('button', { name: 'Master Bed Wall paint' }));
  fireEvent.click(await screen.findByRole('button', { name: /Edit material/ }));
  expect(onAction).toHaveBeenCalledWith('MATERIAL_SPEC', 'spec-1', 'Edit this material.', 'MATERIAL_SPEC_UPDATE', 'MUTATE_RECORD');
});

test('a viewer reads the full detail but sees no Edit and no Add; the row says view only', async () => {
  renderList(block({ edit: false, add: false }));
  expect(screen.queryByRole('button', { name: 'Add a material' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Master Bed Wall paint' })).toHaveTextContent('View only');
  fireEvent.click(screen.getByRole('button', { name: 'Master Bed Wall paint' }));
  expect(await screen.findByText('Second coat in 2027.')).toBeVisible();
  expect(screen.queryByRole('button', { name: /Edit material/ })).not.toBeInTheDocument();
  expect(screen.getByText(/Your current access does not allow changes to this material/)).toBeVisible();
});

test('each lifecycle value reads in homeowner words, with an explanation in the detail', async () => {
  for (const [status, label, note] of [['APPROVED', 'Approved', 'Approved for use'], ['INSTALLED', 'Installed', 'Recorded as installed'], ['AS_BUILT', 'Verified installed', 'only change by recording a substitution'], ['SUBSTITUTED', 'Replaced', 'Replaced by another material']]) {
    mockedGetSpec.mockResolvedValue({ ...spec, lifecycleStatus: status });
    const view = renderList(block({ status }));
    expect(screen.getByRole('button', { name: 'Master Bed Wall paint' })).toHaveTextContent(label);
    fireEvent.click(screen.getByRole('button', { name: 'Master Bed Wall paint' }));
    expect(await screen.findByText(new RegExp(note))).toBeVisible();
    view.unmount();
  }
});

test('a material removed after the answer says so instead of showing a stale card', async () => {
  mockedGetSpec.mockRejectedValue({ status: 404, payload: { error: { code: 'SPEC_NOT_FOUND' } } });
  renderList(block());
  fireEvent.click(screen.getByRole('button', { name: 'Master Bed Wall paint' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Material no longer exists'));
});

test('losing access to the home closes the detail through the access-lost path', async () => {
  const onAccessLost = jest.fn();
  mockedGetSpec.mockRejectedValue({ status: 403 });
  render(<MaterialSpecResultList block={block()} propertyId="home" onAction={jest.fn()} onAccessLost={onAccessLost} />);
  fireEvent.click(screen.getByRole('button', { name: 'Master Bed Wall paint' }));
  await waitFor(() => expect(onAccessLost).toHaveBeenCalled());
});
