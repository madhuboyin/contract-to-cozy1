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
