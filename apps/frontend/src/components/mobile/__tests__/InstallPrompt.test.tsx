/**
 * C4 (F9): the iOS "Add to Home Screen" card must only appear in genuine
 * Safari on iOS AND only once the visitor is signed in.
 */

import { render, screen, act } from '@testing-library/react';
import { InstallPrompt } from '@/components/mobile/InstallPrompt';
import * as pwa from '@/lib/pwa';
import * as auth from '@/lib/auth/AuthContext';

jest.mock('@/lib/pwa', () => ({
  isPWA: jest.fn(() => false),
  isIOSSafari: jest.fn(() => true),
}));
jest.mock('@/lib/auth/AuthContext', () => ({
  useAuth: jest.fn(() => ({ isAuthenticated: true })),
}));

const mockIsPWA = pwa.isPWA as jest.Mock;
const mockIsIOSSafari = pwa.isIOSSafari as jest.Mock;
const mockUseAuth = auth.useAuth as jest.Mock;

describe('InstallPrompt — iOS card gating', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    mockIsPWA.mockReturnValue(false);
    mockIsIOSSafari.mockReturnValue(true);
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
  });
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  const advanceOneMinute = () => act(() => { jest.advanceTimersByTime(60_000); });

  it('shows the "Add to Home Screen" card in iOS Safari once signed in', () => {
    render(<InstallPrompt />);
    advanceOneMinute();
    expect(screen.getByText(/Add to Home Screen/i)).toBeInTheDocument();
  });

  it('stays hidden for a signed-out visitor', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false });
    render(<InstallPrompt />);
    advanceOneMinute();
    expect(screen.queryByText(/Install ContractToCozy/i)).not.toBeInTheDocument();
  });

  it('stays hidden outside Safari (other iOS browser / in-app web view)', () => {
    mockIsIOSSafari.mockReturnValue(false);
    render(<InstallPrompt />);
    advanceOneMinute();
    expect(screen.queryByText(/Install ContractToCozy/i)).not.toBeInTheDocument();
  });
});
