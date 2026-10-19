/** @jest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import FinancingPage from '../page';
import { api } from '@/lib/api/client';

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('propertyId=home-1'), useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/api/client', () => ({
  api: { getFinancingProfile: jest.fn(), getEquityPosition: jest.fn(), listFinancingScenarios: jest.fn(), refreshEquityPosition: jest.fn(), archiveFinancingScenario: jest.fn() },
}));
jest.mock('@/components/features/financing/EquityCard', () => ({ __esModule: true, default: () => <div data-testid="equity-card" /> }));
jest.mock('@/components/features/financing/ScenarioCard', () => ({ __esModule: true, default: () => <div /> }));
jest.mock('@/components/features/financing/FinancingCalculatorSheet', () => ({ __esModule: true, default: () => <div /> }));

const forbidden = () => Object.assign(new Error('Forbidden'), { status: 403, payload: { error: { code: 'PROPERTY_ROLE_REQUIRED' } } });

describe('Financing Center for a household member who is not an owner', () => {
  beforeEach(() => jest.resetAllMocks());

  it('says the mortgage and equity details are owner-only instead of showing an empty setup state', async () => {
    (api.getFinancingProfile as jest.Mock).mockRejectedValue(forbidden());
    (api.getEquityPosition as jest.Mock).mockRejectedValue(forbidden());
    (api.listFinancingScenarios as jest.Mock).mockResolvedValue([]);
    render(<FinancingPage />);
    expect(await screen.findByText(/visible to the home’s owner only/)).toBeInTheDocument();
    expect(screen.queryByTestId('equity-card')).toBeNull();
    expect(screen.queryByText('Update mortgage details')).toBeNull();
    expect(screen.getByText('Calculate Financing')).toBeInTheDocument();
  });

  it('still shows the equity card to an owner', async () => {
    (api.getFinancingProfile as jest.Mock).mockResolvedValue({ id: 'p' });
    (api.getEquityPosition as jest.Mock).mockResolvedValue({ id: 'e' });
    (api.listFinancingScenarios as jest.Mock).mockResolvedValue([]);
    render(<FinancingPage />);
    await waitFor(() => expect(screen.getByTestId('equity-card')).toBeInTheDocument());
    expect(screen.getByText('Update mortgage details')).toBeInTheDocument();
    expect(screen.queryByText(/visible to the home’s owner only/)).toBeNull();
  });
});
