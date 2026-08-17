import { render, screen } from '@testing-library/react';
import { WelcomeModal } from '../WelcomeModal';

describe('WelcomeModal journey entry', () => {
  it('welcomes owners and buyers into trigger-first onboarding', () => {
    render(<WelcomeModal userFirstName="Jordan" />);

    expect(screen.getByRole('dialog', { name: 'Welcome to Cozy, Jordan!' })).toBeInTheDocument();
    expect(screen.getByText('Tell us where you are in your home journey.')).toBeInTheDocument();
    expect(screen.getByText(/Whether you own, are buying, building, or exploring/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Choose my home journey' })).toHaveAttribute(
      'href',
      '/onboarding/address',
    );
  });
});
