import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CandidateComparisonPicker } from '../CandidateComparisonPicker';
import { api } from '@/lib/api/client';

jest.mock('@/lib/api/client', () => ({ api: { getAskCandidateComparison: jest.fn(), saveAskCandidateComparison: jest.fn(), clearAskCandidateComparison: jest.fn() } }));
const mocked = api as unknown as Record<'getAskCandidateComparison' | 'saveAskCandidateComparison' | 'clearAskCandidateComparison', jest.Mock>;
const homes = [{ id: 'a', label: 'Maple St' }, { id: 'b', label: 'Oak Ave' }, { id: 'c', label: 'Pine Rd' }];
const dimensions = [{ key: 'listPriceCents', label: 'List price' }, { key: 'bedrooms', label: 'Bedrooms' }];
const show = (onStatus = jest.fn()) => { render(<CandidateComparisonPicker homes={homes} dimensions={dimensions} onStatus={onStatus} />); fireEvent.click(screen.getByText(/What to compare/)); return onStatus; };

beforeEach(() => { Object.values(mocked).forEach((fn) => fn.mockReset()); mocked.getAskCandidateComparison.mockResolvedValue({ success: true, data: { comparison: null } }); });

// BUY-002: a saved comparison of the buyer's own homes.
describe('CandidateComparisonPicker', () => {
  it('starts with every home chosen and no things chosen, and saves exactly what is checked', async () => {
    mocked.saveAskCandidateComparison.mockResolvedValue({ success: true, data: { comparison: { candidateIds: ['a', 'c'], dimensions: ['bedrooms'] } } });
    const onStatus = show();
    await waitFor(() => expect(screen.getByLabelText('Maple St')).toBeChecked());
    expect(screen.getByLabelText('Pine Rd')).toBeChecked();
    expect(screen.getByLabelText('Bedrooms')).not.toBeChecked();
    fireEvent.click(screen.getByLabelText('Oak Ave'));
    fireEvent.click(screen.getByLabelText('Bedrooms'));
    fireEvent.click(screen.getByRole('button', { name: 'Save comparison' }));
    await waitFor(() => expect(mocked.saveAskCandidateComparison).toHaveBeenCalledWith({ candidateIds: ['a', 'c'], dimensions: ['bedrooms'] }));
    await waitFor(() => expect(onStatus).toHaveBeenCalledWith(expect.stringMatching(/Comparison saved/)));
    expect(screen.getByRole('button', { name: 'Clear saved comparison' })).toBeInTheDocument();
  });

  it('restores a saved comparison, and cannot save fewer than two homes', async () => {
    mocked.getAskCandidateComparison.mockResolvedValue({ success: true, data: { comparison: { candidateIds: ['b', 'c'], dimensions: ['listPriceCents'] } } });
    show();
    await waitFor(() => expect(screen.getByLabelText('Oak Ave')).toBeChecked());
    expect(screen.getByLabelText('Maple St')).not.toBeChecked();
    expect(screen.getByLabelText('List price')).toBeChecked();
    fireEvent.click(screen.getByLabelText('Oak Ave'));
    expect(screen.getByRole('button', { name: 'Save comparison' })).toBeDisabled();
    expect(screen.getByText(/at least two homes/)).toBeInTheDocument();
  });

  it('clears the saved comparison and goes back to every home', async () => {
    mocked.getAskCandidateComparison.mockResolvedValue({ success: true, data: { comparison: { candidateIds: ['a', 'b'], dimensions: [] } } });
    mocked.clearAskCandidateComparison.mockResolvedValue({ success: true, data: { comparison: null } });
    const onStatus = show();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Clear saved comparison' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Clear saved comparison' }));
    await waitFor(() => expect(mocked.clearAskCandidateComparison).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByLabelText('Pine Rd')).toBeChecked());
    expect(onStatus).toHaveBeenCalledWith(expect.stringMatching(/cleared/));
    expect(screen.queryByRole('button', { name: 'Clear saved comparison' })).toBeNull();
  });

  it('shows a save failure in an alert and keeps the choice', async () => {
    mocked.saveAskCandidateComparison.mockResolvedValue({ success: false, message: 'One of those homes was not found.' });
    show();
    await waitFor(() => expect(screen.getByLabelText('Maple St')).toBeChecked());
    fireEvent.click(screen.getByRole('button', { name: 'Save comparison' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('One of those homes was not found.');
    expect(screen.getByLabelText('Maple St')).toBeChecked();
  });

  it('does not allow more than six homes', async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `h${i}`, label: `Home ${i}` }));
    render(<CandidateComparisonPicker homes={many} dimensions={[]} onStatus={jest.fn()} />);
    fireEvent.click(screen.getByText(/What to compare/));
    await waitFor(() => expect(screen.getByLabelText('Home 0')).toBeChecked());
    expect(screen.getByLabelText('Home 5')).toBeChecked();
    expect(screen.getByLabelText('Home 6')).not.toBeChecked();
    fireEvent.click(screen.getByLabelText('Home 6'));
    expect(screen.getByLabelText('Home 6')).not.toBeChecked();
  });
});
