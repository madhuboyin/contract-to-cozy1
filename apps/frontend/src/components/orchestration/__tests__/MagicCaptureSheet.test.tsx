import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MagicCaptureSheet } from '../MagicCaptureSheet';

jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: any) => <div>{children}</div>,
  SheetContent: ({ children }: any) => <div>{children}</div>,
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <div>{children}</div>,
  SheetDescription: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, ...rest }: any) => <button {...rest}>{children}</button>,
}));

jest.mock('@/components/mobile/CameraCapture', () => ({
  CameraCapture: ({ onCapture }: any) => (
    <button
      onClick={() => onCapture(new File(['scan'], 'scan.jpg', { type: 'image/jpeg' }))}
      type="button"
    >
      Mock Capture
    </button>
  ),
}));

jest.mock('@/lib/property/PropertyContext', () => ({
  usePropertyContext: () => ({ selectedPropertyId: 'property-123' }),
}));

jest.mock('@/components/ui/use-toast', () => ({
  toast: jest.fn(),
}));

jest.mock('@/lib/analytics/events', () => ({
  track: jest.fn(),
}));

describe('MagicCaptureSheet fallback behavior', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    (global.fetch as jest.Mock).mockReset();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders actionable timeout fallback state when AI analysis times out', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 504,
      headers: {
        get: (header: string) => (header.toLowerCase() === 'retry-after' ? '17' : null),
      },
      json: async () => ({
        success: false,
        error: {
          message: 'Document analysis timed out. Please try again.',
          code: 'AI_TIMEOUT',
        },
      }),
    });

    render(<MagicCaptureSheet isOpen onOpenChange={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mock Capture' }));

    await waitFor(() => {
      expect(screen.getByText('AI response timed out')).toBeInTheDocument();
    });

    expect(screen.getByText(/Try again in about 17 seconds\./i)).toBeInTheDocument();
    expect(screen.getByText('Manual fallback ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry Magic Scan/i })).toBeInTheDocument();
  });
});
