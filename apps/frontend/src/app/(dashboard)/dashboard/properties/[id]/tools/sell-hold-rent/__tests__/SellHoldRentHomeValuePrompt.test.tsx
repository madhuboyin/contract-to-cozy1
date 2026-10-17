import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SellHoldRentClient from '../SellHoldRentClient';
import { getSellHoldRent, getSellHoldRentOverrides, getFinancingProfile } from '../sellHoldRentApi';
import { HomeValueRequiredError } from '@/features/tools/homeValueRequired';

// Owner ruling 2026-10-16: the 422 "no home value on record" is not shown as an error. The page asks inline; the value entered is sent as the
// per-request homeValueNow (analysis-only). It is not written to the saved overrides and never to the home record.

jest.mock('next/navigation', () => ({ useParams: () => ({ id: 'p1' }), useSearchParams: () => new URLSearchParams() }));
jest.mock('../sellHoldRentApi', () => ({
  getSellHoldRent: jest.fn(), getSellHoldRentOverrides: jest.fn(), saveSellHoldRentOverrides: jest.fn(), getFinancingProfile: jest.fn(), saveFinancingProfile: jest.fn(),
}));
jest.mock('@/lib/analytics/events', () => ({ track: jest.fn() }));
jest.mock('../../../components/HomeToolsRail', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../components/route-templates/ToolWorkspaceTemplate', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
jest.mock('@/components/tools/HomeToolHeader', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/system/PriorityActionHero', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/property-context/PropertyContextCapturePanel', () => ({ PropertyContextCapturePanel: () => null }));
jest.mock('../../insurance-trend/MultiLineChart', () => ({ __esModule: true, default: () => null }));
jest.mock('../ComparisonBars', () => ({ __esModule: true, default: () => null }));

const getMock = getSellHoldRent as jest.Mock;
const { saveSellHoldRentOverrides } = jest.requireMock('../sellHoldRentApi');

beforeEach(() => {
  getMock.mockReset();
  (getSellHoldRentOverrides as jest.Mock).mockResolvedValue({});
  (getFinancingProfile as jest.Mock).mockResolvedValue(null);
  saveSellHoldRentOverrides.mockReset();
});

test('a missing home value shows the inline prompt, not an error, and the entered value is requested as an analysis-only override', async () => {
  const user = userEvent.setup();
  getMock.mockRejectedValueOnce(new HomeValueRequiredError());
  getMock.mockRejectedValue(new Error('stop after the second request'));
  render(<SellHoldRentClient />);

  expect(await screen.findByText(/What value should Sell, hold or rent plan with\?/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  expect(getMock.mock.calls[0][1].homeValueNow).toBeUndefined();

  await user.type(screen.getByLabelText('Home value (USD)'), '450000');
  await user.click(screen.getByRole('button', { name: 'Use for this analysis' }));

  await waitFor(() => expect(getMock.mock.calls.some((call) => call[1].homeValueNow === 450000)).toBe(true));
  expect(saveSellHoldRentOverrides).not.toHaveBeenCalled();
});

test('an ordinary failure still shows the error with Retry and no prompt', async () => {
  getMock.mockRejectedValue(new Error('Server unavailable'));
  render(<SellHoldRentClient />);
  expect(await screen.findByText('Server unavailable')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  expect(screen.queryByText(/What value should/)).not.toBeInTheDocument();
});

test('saving from the prompt stores the canonical HOME_VALUE_NOW scenario override, not an analysis-only value, and reloads', async () => {
  const user = userEvent.setup();
  getMock.mockRejectedValueOnce(new HomeValueRequiredError());
  getMock.mockRejectedValue(new Error('stop after the reload'));
  saveSellHoldRentOverrides.mockResolvedValue({ ok: true });
  render(<SellHoldRentClient />);

  expect(await screen.findByText(/Saved for Sell\/Hold\/Rent scenarios only\. It does not update your home record/)).toBeInTheDocument();
  await user.type(screen.getByLabelText('Home value (USD)'), '$450,000');
  await user.click(screen.getByRole('button', { name: 'Save as my Sell/Hold/Rent value' }));

  await waitFor(() => expect(saveSellHoldRentOverrides).toHaveBeenCalledWith('p1', { HOME_VALUE_NOW: 450000 }));
  await waitFor(() => expect(getMock.mock.calls.length).toBeGreaterThanOrEqual(2));
  expect(getMock.mock.calls.every((call) => call[1].homeValueNow === undefined)).toBe(true);
});

const dto = (extra: Record<string, unknown> = {}) => ({
  ownershipCostContext: { contractVersion: 'v1', lens: 'OPERATING_EXPENSE', snapshotId: 's1', definitionVersion: 'd', methodVersion: 'm', categoryDefinitionVersion: 'c', forecastId: 'f1', forecastMethodVersion: 'm', calculationFingerprint: 'fp' },
  input: { propertyId: 'p1', years: 5, addressLabel: '1 Main St', state: 'NJ', zipCode: '08000', overrides: {} },
  current: { homeValueNow: 610000, homeValueSource: 'SCENARIO_OVERRIDE', homeValueDisclosure: 'Using the home value you saved for Sell/Hold/Rent: $610,000. This applies to this analysis only; your home record is unchanged.', appreciationRate: 0.035, monthlyRentNow: 4800, sellingCostRate: 0.06 },
  scenarios: {
    sell: { projectedSalePrice: 700000, sellingCosts: 42000, netProceeds: 600000, notes: [] },
    hold: { totalOwnershipCosts: 60000, appreciationGain: 90000, net: 30000, notes: [] },
    rent: { totalRentalIncome: 280000, rentalOverheads: { vacancyLoss: 16800, managementFees: 22400 }, totalOwnershipCosts: 60000, appreciationGain: 90000, net: 40000, notes: [] },
  },
  projection: [{ year: 2027, homeValue: 631000, ownershipCosts: 12000, holdNetDelta: 1, rentNetDelta: 2 }],
  recommendation: { winner: 'HOLD', rationale: ['x'], confidence: 'MEDIUM' },
  drivers: [],
  meta: { generatedAt: new Date().toISOString(), dataSources: [], notes: [], confidence: 'MEDIUM' },
  ...extra,
});

test('a result that used a saved scenario value says where the value came from', async () => {
  getMock.mockResolvedValue(dto());
  render(<SellHoldRentClient />);
  expect(await screen.findByText(/Using the home value you saved for Sell\/Hold\/Rent: \$610,000/)).toBeInTheDocument();
  expect(screen.getByText(/your home record is unchanged/)).toBeInTheDocument();
});

test('saved inputs that were ignored are listed with their reason instead of disappearing', async () => {
  getMock.mockResolvedValue(dto({ meta: { generatedAt: new Date().toISOString(), dataSources: [], notes: [], confidence: 'MEDIUM', ignoredSavedOverrides: [
    { key: 'VACANCY_RATE', reason: 'OUT_OF_RANGE', detail: 'Vacancy rate must be between 0 to 0.25 (a decimal: 0.035 is 3.5%).' },
    { key: 'homeValueNow', reason: 'UNSUPPORTED_KEY', detail: '"homeValueNow" is not a SELL_HOLD_RENT override key.' },
  ] } }));
  render(<SellHoldRentClient />);
  expect(await screen.findByText('Some saved inputs were not used')).toBeInTheDocument();
  expect(screen.getByText(/Vacancy rate must be between/)).toBeInTheDocument();
  expect(screen.getByText(/"homeValueNow" is not a SELL_HOLD_RENT override key\./)).toBeInTheDocument();
});

test('clearing a field that has a saved value and saving sends null for that key, so blank really means the default', async () => {
  const user = userEvent.setup();
  getMock.mockResolvedValue(dto());
  (getSellHoldRentOverrides as jest.Mock).mockResolvedValue({ HOME_VALUE_NOW: 610000, VACANCY_RATE: 0.1 });
  saveSellHoldRentOverrides.mockResolvedValue({ ok: true });
  render(<SellHoldRentClient />);
  const homeValue = await screen.findByPlaceholderText('e.g. 600000');
  await waitFor(() => expect(homeValue).toHaveValue('610000'));
  await user.clear(homeValue);
  await user.click(screen.getByRole('button', { name: 'Save overrides' }));
  await waitFor(() => expect(saveSellHoldRentOverrides).toHaveBeenCalled());
  expect(saveSellHoldRentOverrides).toHaveBeenCalledWith('p1', { HOME_VALUE_NOW: null, VACANCY_RATE: 0.1 });
});
