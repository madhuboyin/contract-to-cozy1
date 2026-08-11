import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AIChat } from '@/components/AIChat';
import { api } from '@/lib/api/client';

jest.mock('@/lib/property/PropertyContext', () => ({
  usePropertyContext: () => ({ selectedPropertyId: 'property-1' }),
}));

jest.mock('@/lib/api/client', () => ({
  api: { getAskSession: jest.fn().mockResolvedValue({ success: true, data: { executions: [] } }) },
}));

const mockGetAskSession = api.getAskSession as jest.Mock;

describe('Ask Cozy global workspace continuity', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = jest.fn();
  });

  beforeEach(() => {
    window.localStorage.clear();
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
    expect(screen.getByRole('link', { name: /full workspace/i })).toHaveAttribute('href', '/dashboard/ask');
  });

  it('preserves an unfinished draft when the panel closes and reopens', async () => {
    render(<AIChat />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Ask Cozy' }));
    const composer = await screen.findByPlaceholderText('Ask anything about your home…');
    fireEvent.change(composer, { target: { value: 'Show overdue roof work' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Ask Cozy' }));

    await waitFor(() => expect(screen.getByPlaceholderText('Ask anything about your home…')).toHaveValue('Show overdue roof work'));
  });
});
