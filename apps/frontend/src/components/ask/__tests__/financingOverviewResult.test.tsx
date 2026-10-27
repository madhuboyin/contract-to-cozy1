import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FinancingNumbers, FinancingPlanner, FinancingScenarios } from '../FinancingOverviewResult';

const refreshEquityPosition = jest.fn();
const listFinancingScenarios = jest.fn();
const getFinancingScenario = jest.fn();
const archiveFinancingScenario = jest.fn();

jest.mock('@/lib/api/client', () => ({ api: {
  refreshEquityPosition: (...args: unknown[]) => refreshEquityPosition(...args),
  listFinancingScenarios: (...args: unknown[]) => listFinancingScenarios(...args),
  getFinancingScenario: (...args: unknown[]) => getFinancingScenario(...args),
  archiveFinancingScenario: (...args: unknown[]) => archiveFinancingScenario(...args),
} }));
jest.mock('@/components/features/financing/FinancingCalculatorSheet', () => ({
  __esModule: true,
  default: ({ initialCostCents, profileHref }: { initialCostCents?: number; profileHref?: string | null }) => <div data-testid="calculator">{initialCostCents}:{String(profileHref)}</div>,
}));
jest.mock('@/components/features/financing/OptionComparisonTable', () => ({ __esModule: true, default: () => <div>Option comparison</div> }));

const grouped = (id: string, items: any[], title = 'Title', description = 'Description') => ({
  type: 'GROUPED_LIST' as const, id, title, description, filters: [], actions: [],
  sections: [{ id: `${id}-section`, title, count: items.length, items }],
});
const item = (id: string, title: string, description: string | null, meta: string[] = []) => ({ id, title, description, meta, status: null, href: null });

beforeEach(() => {
  jest.clearAllMocks();
  listFinancingScenarios.mockResolvedValue([]);
});

test('renders a purpose-built financing dashboard and refreshes equity inline', async () => {
  refreshEquityPosition.mockResolvedValue({ estimatedValueCents: 75000000, mortgageBalanceCents: 30000000, equityCents: 45000000, equityPercent: 60, helocEligible: true, helocCapacityCents: 33750000, estimatedValueSource: 'USER_ENTERED' });
  render(<FinancingNumbers propertyId="home-1" block={grouped('financing-numbers', [
    item('mortgage-type', 'Loan type', '30-year fixed'), item('mortgage-balance', 'Mortgage balance', '$320,000'),
    item('home-value', 'Estimated home value', '$725,000'), item('home-equity', 'Home equity', '$405,000 (55.86%)'),
    item('heloc-capacity', 'Estimated HELOC capacity', 'Up to $296,250'),
  ])} />);
  expect(screen.getByText('Your financing at a glance')).toBeInTheDocument();
  expect(screen.getByText('30-year fixed')).toBeInTheDocument();
  expect(screen.queryByText('Auto')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh equity' }));
  await waitFor(() => expect(refreshEquityPosition).toHaveBeenCalledWith('home-1'));
  expect(await screen.findByText('$450,000 (60%)')).toBeInTheDocument();
});

test('opens the editable planner with a typed project cost instead of sending a canned prompt', () => {
  render(<FinancingPlanner propertyId="home-1" block={grouped('financing-planner', [item('financing-project-cost', 'Project cost', '$40,000', ['4000000 cents'])], 'Plan how to pay for a home project')} />);
  expect(screen.getByTestId('calculator')).toHaveTextContent('4000000:null');
  expect(screen.getByText('Scenario planner')).toBeInTheDocument();
});

test('shows a useful empty saved-scenario state and keeps scenario management inline', async () => {
  render(<FinancingScenarios propertyId="home-1" block={grouped('financing-scenarios', [], 'Saved scenarios', 'Open or archive a scenario.')} />);
  expect(await screen.findByText('No saved scenarios yet. Use the planner above to create one.')).toBeInTheDocument();
  expect(listFinancingScenarios).toHaveBeenCalledWith('home-1');
});
