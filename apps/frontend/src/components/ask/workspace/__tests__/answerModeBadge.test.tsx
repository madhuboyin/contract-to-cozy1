import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AnswerModeBadge } from '../AnswerModeBadge';

// BICC-ANS-001/007: the badge words the declared mode for sighted and assistive-technology users, and is absent when there is nothing to say.
describe('AnswerModeBadge', () => {
  it('shows the label and an assistive description for an estimate', () => {
    const { container } = render(<AnswerModeBadge mode="ESTIMATE" />);
    expect(screen.getByText('Estimate')).toBeInTheDocument();
    expect(container.querySelector('[data-ask-answer-mode="ESTIMATE"]')).not.toBeNull();
    expect(screen.getByText(/Answer type:/)).toHaveClass('sr-only');
    expect(container.textContent).toMatch(/planning estimate, not a quote/);
  });

  it('says plainly that general guidance is not from the home record', () => {
    render(<AnswerModeBadge mode="GENERAL_GUIDANCE" />);
    expect(screen.getByText(/not from your home record/i)).toBeInTheDocument();
  });

  it('renders nothing for an unavailable answer, no mode, or an unknown mode', () => {
    for (const mode of ['UNAVAILABLE', null, undefined, 'SOMETHING_NEW' as never]) {
      const { container, unmount } = render(<AnswerModeBadge mode={mode} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});
