import { fireEvent, render, screen } from '@testing-library/react';
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

  it('supports the rendered acceptance traversal without changing the production destination', () => {
    const onStart = jest.fn();
    render(<WelcomeModal userFirstName="Jordan" onStart={onStart} />);

    fireEvent.click(screen.getByRole('button', { name: 'Choose my home journey' }));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('link', { name: 'Choose my home journey' })).not.toBeInTheDocument();
  });
});
