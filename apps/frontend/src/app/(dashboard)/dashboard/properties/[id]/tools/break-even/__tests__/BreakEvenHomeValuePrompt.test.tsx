import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BreakEvenClient from '../BreakEvenClient';
import { getBreakEven } from '../breakEvenApi';
import { HomeValueRequiredError } from '@/features/tools/homeValueRequired';

// Owner ruling 2026-10-16: the 422 "no home value on record" is not shown as an error. The page asks inline; the value entered is sent as the
// per-request homeValueNow (analysis-only) and nothing is saved.

jest.mock('next/navigation', () => ({ useParams: () => ({ id: 'p1' }), useSearchParams: () => new URLSearchParams() }));
jest.mock('../breakEvenApi', () => ({ getBreakEven: jest.fn() }));
jest.mock('@/lib/analytics/events', () => ({ track: jest.fn() }));
jest.mock('../../../components/HomeToolsRail', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../components/route-templates/ToolWorkspaceTemplate', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
jest.mock('@/components/tools/HomeToolHeader', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/property-context/PropertyContextCapturePanel', () => ({ PropertyContextCapturePanel: () => null }));
jest.mock('../../insurance-trend/MultiLineChart', () => ({ __esModule: true, default: () => null }));

const getBreakEvenMock = getBreakEven as jest.Mock;

beforeEach(() => getBreakEvenMock.mockReset());

test('a missing home value shows the inline prompt, not an error, and the entered value is requested as an analysis-only override', async () => {
  const user = userEvent.setup();
  getBreakEvenMock.mockRejectedValueOnce(new HomeValueRequiredError());
  getBreakEvenMock.mockRejectedValue(new Error('stop after the second request'));
  render(<BreakEvenClient />);

  expect(await screen.findByText(/What value should Break-even plan with\?/)).toBeInTheDocument();
  expect(screen.queryByText(/PLANNING_HOME_VALUE_REQUIRED/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  expect(getBreakEvenMock.mock.calls[0][1].homeValueNow).toBeUndefined();

  await user.type(screen.getByLabelText('Home value (USD)'), '450000');
  await user.click(screen.getByRole('button', { name: 'Use for this analysis' }));

  await waitFor(() => expect(getBreakEvenMock).toHaveBeenCalledTimes(2));
  expect(getBreakEvenMock.mock.calls[1][1]).toMatchObject({ homeValueNow: 450000 });
});

test('an ordinary failure still shows the error with Retry and no prompt', async () => {
  getBreakEvenMock.mockRejectedValue(new Error('Server unavailable'));
  render(<BreakEvenClient />);
  expect(await screen.findByText('Server unavailable')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  expect(screen.queryByText(/What value should/)).not.toBeInTheDocument();
});
