import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ComposerCandidatesButton } from '../ComposerCandidatesButton';

describe('ComposerCandidatesButton', () => {
  it('is a labelled button that hands its own element to the workspace so focus can return to it', () => {
    const onOpen = jest.fn();
    render(<ComposerCandidatesButton onOpen={onOpen} />);
    const button = screen.getByRole('button', { name: 'Homes I’m considering' });
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledWith(button);
  });

  it('does nothing while a request is in flight', () => {
    const onOpen = jest.fn();
    render(<ComposerCandidatesButton disabled onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Homes I’m considering' }));
    expect(onOpen).not.toHaveBeenCalled();
  });
});
