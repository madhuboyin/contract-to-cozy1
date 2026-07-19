import React from 'react';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AIChat } from '@/components/AIChat';

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

jest.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', firstName: 'Pilot', role: 'HOMEOWNER' },
  }),
}));

jest.mock('@/lib/property/PropertyContext', () => ({
  usePropertyContext: () => ({ selectedPropertyId: 'property-1' }),
}));

jest.mock('@/lib/api/client', () => ({
  api: {
    sendMessageToChat: jest.fn(),
  },
}));

describe('AIChat dashboard open event', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = jest.fn();
  });

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('mounts the listener and opens with a suggested question', () => {
    render(<AIChat />);

    act(() => {
      window.dispatchEvent(new CustomEvent('cozy-chat-open', {
        detail: { question: 'Which home items lack coverage?' },
      }));
    });

    expect(screen.getByText('AI Home Concierge')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ask about maintenance, closing...')).toHaveValue(
      'Which home items lack coverage?',
    );
  });

  it('opens a blank composer for Ask another question', () => {
    render(<AIChat />);

    act(() => {
      window.dispatchEvent(new CustomEvent('cozy-chat-open'));
    });

    expect(screen.getByText('AI Home Concierge')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ask about maintenance, closing...')).toHaveValue('');
  });
});
