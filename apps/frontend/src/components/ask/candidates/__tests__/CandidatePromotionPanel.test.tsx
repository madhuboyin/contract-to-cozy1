import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CandidateHomesDialog } from '../CandidateHomesDialog';
import { api } from '@/lib/api/client';

jest.mock('@/lib/api/client', () => ({ api: { listAskCandidates: jest.fn(), deleteAskPromotedCandidateRecord: jest.fn(), reviewAskCandidatePromotion: jest.fn(), confirmAskCandidatePromotion: jest.fn() } }));
const m = api as unknown as Record<'listAskCandidates' | 'deleteAskPromotedCandidateRecord' | 'reviewAskCandidatePromotion' | 'confirmAskCandidatePromotion', jest.Mock>;

const maple = { id: 'a', label: 'Maple St', city: 'Austin', state: 'TX', listPriceCents: 40000000 };
const review = (extra = {}) => ({ success: true, data: { proposal: { candidateId: 'a', fields: [{ field: 'bedrooms', value: 3, source: 'LISTING', asOf: '2026-11-01T00:00:00Z' }, { field: 'city', value: 'Austin', source: 'USER_ENTERED', asOf: null }], missingRequired: [], notCarriedOver: ['List price (it is not a purchase price)'] }, token: 'tok', existingHome: null, blockedReason: null, canPromote: true, ...extra } });
const start = async () => {
  render(<CandidateHomesDialog open onOpenChange={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Under contract on Maple St' }));
};

beforeEach(() => { Object.values(m).forEach((fn) => fn.mockReset()); m.listAskCandidates.mockImplementation(async (o?: { status?: string }) => ({ success: true, data: { candidates: o?.status === 'PROMOTED' ? [] : [maple] } })); });

// BICC-4.3 / BUY-007: nothing is created until the explicit confirm button, and the confirmation carries the review's token.
describe('candidate promotion panel', () => {
  it('reviews first with each fact and its source, creates nothing until confirmed, then sends the token and closing date', async () => {
    m.reviewAskCandidatePromotion.mockResolvedValue(review());
    m.confirmAskCandidatePromotion.mockResolvedValue({ success: true, data: { propertyId: 'p', created: true, linkedExisting: false, candidateId: 'a' } });
    await start();
    expect(await screen.findByText('Bedrooms: 3')).toBeInTheDocument();
    expect(screen.getByText('from the listing, 2026-11-01')).toBeInTheDocument();
    expect(screen.getByText('List price (it is not a purchase price)')).toBeInTheDocument();
    expect(m.confirmAskCandidatePromotion).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Expected closing date/), { target: { value: '2027-01-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create it as under contract' }));
    await waitFor(() => expect(m.confirmAskCandidatePromotion).toHaveBeenCalledWith('a', { token: 'tok', linkToExistingHome: false, targetCloseDate: new Date('2027-01-15').toISOString() }));
    expect(await screen.findByText('Maple St is now in your homes as under contract.')).toBeInTheDocument();
  });

  it('an existing home at the address offers linking only, and sends no closing date', async () => {
    m.reviewAskCandidatePromotion.mockResolvedValue(review({ existingHome: { propertyId: 'p9', name: 'Mine', address: '12 Maple St', linkable: true } }));
    m.confirmAskCandidatePromotion.mockResolvedValue({ success: true, data: { propertyId: 'p9', created: false, linkedExisting: true, candidateId: 'a' } });
    await start();
    expect(await screen.findByText(/already have a home at 12 Maple St/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create it as under contract' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Link to my existing home' }));
    await waitFor(() => expect(m.confirmAskCandidatePromotion).toHaveBeenCalledWith('a', { token: 'tok', linkToExistingHome: true, targetCloseDate: null }));
  });

  it('an incomplete home names what is missing and offers no confirm button', async () => {
    m.reviewAskCandidatePromotion.mockResolvedValue(review({ canPromote: false, proposal: { candidateId: 'a', fields: [], missingRequired: ['street address'], notCarriedOver: [] } }));
    await start();
    expect(await screen.findByText('Add the street address before moving this home.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create it|Link to/ })).toBeNull();
  });

  it('a refusal keeps the panel open with the server message, and Not now returns to the list without creating anything', async () => {
    m.reviewAskCandidatePromotion.mockResolvedValue(review());
    m.confirmAskCandidatePromotion.mockResolvedValue({ success: false, message: 'This home changed after you reviewed it. Review it again.' });
    await start();
    fireEvent.click(await screen.findByRole('button', { name: 'Create it as under contract' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('changed after you reviewed');
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(await screen.findByRole('button', { name: 'Add a home' })).toBeInTheDocument();
  });

  it('an owned home at that address blocks the move with the reason and offers no confirm or link button', async () => {
    m.reviewAskCandidatePromotion.mockResolvedValue(review({ canPromote: false, blockedReason: 'You already own a home at this address that is not marked as under contract, so this candidate cannot be moved onto it.', existingHome: { propertyId: 'p9', name: null, address: '12 Maple St', linkable: false } }));
    await start();
    expect(await screen.findByText(/already own a home at this address/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create it|Link to/ })).toBeNull();
  });

  it('after a move the home stays visible under "Moved to your homes"', async () => {
    m.reviewAskCandidatePromotion.mockResolvedValue(review());
    m.confirmAskCandidatePromotion.mockResolvedValue({ success: true, data: { propertyId: 'p', created: true, linkedExisting: false, candidateId: 'a' } });
    await start();
    const button = await screen.findByRole('button', { name: 'Create it as under contract' });
    m.listAskCandidates.mockImplementation(async (o?: { status?: string }) => ({ success: true, data: { candidates: o?.status === 'PROMOTED' ? [{ ...maple, status: 'PROMOTED' }] : [] } }));
    fireEvent.click(button);
    expect(await screen.findByText('Moved to your homes')).toBeInTheDocument();
    expect(screen.getByText('Maple St · now in your homes as under contract')).toBeInTheDocument();
  });

  it('deleting the candidate record needs its own confirmation, says the home is not changed, and then refreshes', async () => {
    const promoted = { ...maple, status: 'PROMOTED' }; let deleted = false;
    m.listAskCandidates.mockImplementation(async (o?: { status?: string }) => ({ success: true, data: { candidates: o?.status === 'PROMOTED' ? (deleted ? [] : [promoted]) : [] } }));
    m.deleteAskPromotedCandidateRecord.mockImplementation(async () => { deleted = true; return { success: true, data: { deleted: true } }; });
    render(<CandidateHomesDialog open onOpenChange={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete candidate record for Maple St' }));
    expect(screen.getByText(/does not delete or change the home in your account/)).toBeInTheDocument();
    expect(m.deleteAskPromotedCandidateRecord).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete candidate record' }));
    await waitFor(() => expect(m.deleteAskPromotedCandidateRecord).toHaveBeenCalledWith('a'));
    expect(await screen.findByText('Deleted the candidate record for Maple St. The home itself was not changed.')).toBeInTheDocument();
    expect(screen.queryByText('Moved to your homes')).toBeNull();
  });

  it('Keep it leaves the record alone', async () => {
    m.listAskCandidates.mockImplementation(async (o?: { status?: string }) => ({ success: true, data: { candidates: o?.status === 'PROMOTED' ? [{ ...maple, status: 'PROMOTED' }] : [] } }));
    render(<CandidateHomesDialog open onOpenChange={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete candidate record for Maple St' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(await screen.findByText('Moved to your homes')).toBeInTheDocument();
    expect(m.deleteAskPromotedCandidateRecord).not.toHaveBeenCalled();
  });
});
