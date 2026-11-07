import { render, screen } from '@testing-library/react';
import { ConfirmationCard } from '../workspace/CaptureCards';
import type { AskConfirmation } from '@/features/ask/types';

// Owner report 2026-11-07: after "Continue to review" the review card appeared below the form without being
// brought into view. AskWorkspace scrolls to [data-ask-review-card]; the card moves focus to itself.
jest.mock('@/lib/api/client', () => ({ api: {} }));

const confirmation: AskConfirmation = {
  confirmationId: 'c1', version: 1, title: 'Save location details to your home record?', description: 'Review before saving.',
  fields: [{ label: 'Area', value: 'Kitchen' }], editableFields: [], confirmLabel: 'Save area details',
  consentText: 'I confirm these details', expiresAt: new Date(Date.now() + 600000).toISOString(),
};

const renderCard = (autoFocus: boolean) => render(
  <ConfirmationCard executionId="e1" confirmation={confirmation} onCompleted={jest.fn()} onAccessLost={jest.fn()} autoFocus={autoFocus} />,
);

describe('ConfirmationCard review card arrival', () => {
  it('exposes a scroll target and moves focus to the card when it just appeared', () => {
    const { container } = renderCard(true);
    const card = container.querySelector<HTMLElement>('[data-ask-review-card]');
    expect(card).not.toBeNull();
    expect(card).toHaveAttribute('aria-label', 'Review before saving');
    expect(card).toHaveAttribute('tabindex', '-1');
    expect(card).toHaveFocus();
    expect(screen.getByText('Save location details to your home record?')).toBeInTheDocument();
  });

  it('does not steal focus when the card is rendered without autoFocus', () => {
    const { container } = renderCard(false);
    expect(container.querySelector('[data-ask-review-card]')).not.toHaveFocus();
  });
});
