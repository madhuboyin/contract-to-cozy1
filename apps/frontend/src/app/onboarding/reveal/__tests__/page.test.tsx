import React from 'react';
import { render } from '@testing-library/react';
import RevealOnboardingPage from '../page';

const redirectMock = jest.fn();

jest.mock('next/navigation', () => ({
  redirect: (href: string) => redirectMock(href),
}));

describe('Onboarding reveal retirement', () => {
  beforeEach(() => redirectMock.mockClear());

  it('rejoins the evidence-bounded confirmation flow without rendering speculative wins', () => {
    const { container } = render(<RevealOnboardingPage />);
    expect(redirectMock).toHaveBeenCalledWith('/onboarding/confirm');
    expect(container).toBeEmptyDOMElement();
  });
});
