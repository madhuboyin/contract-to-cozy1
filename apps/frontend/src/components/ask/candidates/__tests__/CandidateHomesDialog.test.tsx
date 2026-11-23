import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CandidateHomesDialog } from '../CandidateHomesDialog';
import { api } from '@/lib/api/client';

jest.mock('@/lib/api/client', () => ({ api: { listAskCandidates: jest.fn(), createAskCandidate: jest.fn(), updateAskCandidate: jest.fn(), deleteAskCandidate: jest.fn() } }));
const mocked = api as unknown as Record<'listAskCandidates' | 'createAskCandidate' | 'updateAskCandidate' | 'deleteAskCandidate', jest.Mock>;

const maple = { id: 'a', label: 'Maple St', city: 'Austin', state: 'TX', listPriceCents: 40000000, bedrooms: 3 };
const oak = { id: 'b', label: 'Oak Ave', listPriceCents: null };
const open = (props: Partial<React.ComponentProps<typeof CandidateHomesDialog>> = {}) => render(<CandidateHomesDialog open onOpenChange={jest.fn()} {...props} />);
const field = (label: RegExp | string) => screen.getByLabelText(label);

beforeEach(() => {
  Object.values(mocked).forEach((fn) => fn.mockReset());
  mocked.listAskCandidates.mockResolvedValue({ success: true, data: { candidates: [maple, oak] } });
});

// BICC-4.1: the buyer's own list of homes, inside Ask. Nothing is saved before Save; a blank is "not entered".
describe('CandidateHomesDialog', () => {
  it('lists the homes with a one-line summary and offers change, remove, add and compare', async () => {
    open({ onCompare: jest.fn() });
    expect(await screen.findByText('Maple St · Austin, TX · $400,000')).toBeInTheDocument();
    expect(screen.getByText('Oak Ave · Price not entered')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change Maple St' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Oak Ave' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compare my homes' })).toBeInTheDocument();
  });

  it('with no homes it explains and offers only Add; with one home it does not offer a comparison', async () => {
    mocked.listAskCandidates.mockResolvedValue({ success: true, data: { candidates: [] } });
    const { unmount } = open({ onCompare: jest.fn() });
    expect(await screen.findByText(/You have not added a home yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Compare my homes' })).toBeNull();
    unmount();
    mocked.listAskCandidates.mockResolvedValue({ success: true, data: { candidates: [maple] } });
    open({ onCompare: jest.fn() });
    await screen.findByText(/Maple St/);
    expect(screen.queryByRole('button', { name: 'Compare my homes' })).toBeNull();
  });

  it('Compare closes the dialog and asks Cozy to compare', async () => {
    const onCompare = jest.fn(); const onOpenChange = jest.fn();
    open({ onCompare, onOpenChange });
    fireEvent.click(await screen.findByRole('button', { name: 'Compare my homes' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCompare).toHaveBeenCalledTimes(1);
  });

  it('adds a home: the typed dollars are saved as cents, a blank is sent as null, and the list reloads with a confirmation', async () => {
    mocked.createAskCandidate.mockResolvedValue({ success: true, data: { id: 'c', label: 'Pine' } });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Add a home' }));
    fireEvent.change(field(/Name for this home/), { target: { value: 'Pine Rd' } });
    fireEvent.change(field(/Price \(\$\)/), { target: { value: '$425,000' } });
    fireEvent.change(field(/HOA per month/), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mocked.createAskCandidate).toHaveBeenCalledTimes(1));
    const payload = mocked.createAskCandidate.mock.calls[0][0];
    expect(payload.label).toBe('Pine Rd');
    expect(payload.listPriceCents).toBe(42500000);
    expect(payload.hoaMonthlyCents).toBe(0);
    expect(payload.bedrooms).toBeNull();
    expect(await screen.findByText('Added the home.')).toBeInTheDocument();
    expect(mocked.listAskCandidates).toHaveBeenCalledTimes(2);
  });

  it('does not save and names the problem when the form is not valid', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Add a home' }));
    fireEvent.change(field(/Price \(\$\)/), { target: { value: 'cheap' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Check the highlighted fields.');
    expect(screen.getByText('Name for this home is required.')).toBeInTheDocument();
    expect(screen.getByText('Price ($) must be a number.')).toBeInTheDocument();
    expect(field(/Price \(\$\)/)).toHaveAttribute('aria-invalid', 'true');
    expect(mocked.createAskCandidate).not.toHaveBeenCalled();
  });

  it('changes a home and sends only the fields that changed; nothing changed is said plainly and sends nothing', async () => {
    mocked.updateAskCandidate.mockResolvedValue({ success: true, data: maple });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Change Maple St' }));
    expect(field(/Price \(\$\)/)).toHaveValue('400000');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Nothing changed.')).toBeInTheDocument();
    expect(mocked.updateAskCandidate).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Change Maple St' }));
    fireEvent.change(field(/Price \(\$\)/), { target: { value: '390000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mocked.updateAskCandidate).toHaveBeenCalledWith('a', { listPriceCents: 39000000 }));
    expect(await screen.findByText('Saved your changes.')).toBeInTheDocument();
  });

  it('removes a home only after an explicit second step, and Keep it removes nothing', async () => {
    mocked.deleteAskCandidate.mockResolvedValue({ success: true, data: { deleted: true } });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Oak Ave' }));
    expect(screen.getByText(/This cannot be undone/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(mocked.deleteAskCandidate).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Oak Ave' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove it' }));
    await waitFor(() => expect(mocked.deleteAskCandidate).toHaveBeenCalledWith('b'));
    expect(await screen.findByText('Removed Oak Ave.')).toBeInTheDocument();
  });

  it('shows a server refusal and stays on the form so nothing typed is lost', async () => {
    mocked.createAskCandidate.mockResolvedValue({ success: false, message: 'You can keep up to 25 homes at a time. Archive or delete one first.' });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Add a home' }));
    fireEvent.change(field(/Name for this home/), { target: { value: 'One too many' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('up to 25 homes');
    expect(field(/Name for this home/)).toHaveValue('One too many');
  });

  it('says so when the list cannot be loaded, and still lets the person add a home', async () => {
    mocked.listAskCandidates.mockRejectedValue(new Error('offline'));
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent('offline');
    expect(screen.getByRole('button', { name: 'Add a home' })).toBeInTheDocument();
  });

  it('is a labelled dialog whose fields each have a label, and nothing loads while it is closed', async () => {
    const { rerender } = render(<CandidateHomesDialog open={false} onOpenChange={jest.fn()} />);
    expect(mocked.listAskCandidates).not.toHaveBeenCalled();
    rerender(<CandidateHomesDialog open onOpenChange={jest.fn()} />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: /Homes I’m considering/ })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Add a home' }));
    for (const input of screen.getAllByRole('textbox')) expect(input).toHaveAccessibleName();
  });
});
