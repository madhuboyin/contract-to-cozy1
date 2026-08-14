import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AIChat } from '@/components/AIChat';
import { api } from '@/lib/api/client';

jest.mock('@/lib/property/PropertyContext', () => ({
  usePropertyContext: () => ({ selectedPropertyId: 'property-1' }),
}));

jest.mock('@/lib/api/client', () => ({
  api: {
    getAskSession: jest.fn().mockResolvedValue({ success: true, data: { executions: [] } }),
    getAskPendingWork: jest.fn().mockResolvedValue({ success: true, data: { items: [] } }),
    getConciergeHome: jest.fn().mockResolvedValue({ success: false }),
  },
}));

const mockGetAskSession = api.getAskSession as jest.Mock;

describe('Ask Cozy global workspace continuity', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = jest.fn();
  });

  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, '', '/dashboard/properties/property-1');
    mockGetAskSession.mockClear();
  });

  it('opens with a suggested question and exposes full-workspace expansion', async () => {
    render(<AIChat />);

    act(() => {
      window.dispatchEvent(new CustomEvent('cozy-chat-open', {
        detail: { question: 'Which home items lack coverage?' },
      }));
    });

    const composer = await screen.findByPlaceholderText('Ask anything about your home…');
    expect(composer).toHaveValue('Which home items lack coverage?');
    const href = screen.getByRole('link', { name: /full workspace/i }).getAttribute('href') ?? '';
    const fullWorkspace = new URL(href, 'https://contracttocozy.local');
    expect(fullWorkspace.pathname).toBe('/dashboard/ask');
    expect(fullWorkspace.searchParams.get('propertyId')).toBe('property-1');
    expect(fullWorkspace.searchParams.get('backTo')).toBe('/dashboard/properties/property-1');
  });

  it('preserves an unfinished draft when the panel closes and reopens', async () => {
    render(<AIChat />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Ask Cozy' }));
    const composer = await screen.findByPlaceholderText('Ask anything about your home…');
    fireEvent.change(composer, { target: { value: 'Show overdue roof work' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    const confirmClose = screen.getByRole('alertdialog').querySelector<HTMLButtonElement>('button');
    expect(confirmClose).not.toBeNull();
    fireEvent.click(confirmClose!);
    fireEvent.click(screen.getByRole('button', { name: 'Open Ask Cozy' }));

    await waitFor(() => expect(screen.getByPlaceholderText('Ask anything about your home…')).toHaveValue('Show overdue roof work'));
  });
});
