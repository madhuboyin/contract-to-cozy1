import { render, screen } from '@testing-library/react';
import { AskContextLink } from '../blocks/context';

describe('AskContextLink without a destination', () => {
  it('shows its text instead of crashing the page when the link has no href (an older saved answer, or a link the server removed)', () => {
    render(<AskContextLink href={null as unknown as string} className="x">Open task</AskContextLink>);
    expect(screen.getByText('Open task').tagName).toBe('SPAN');
    expect(screen.queryByRole('link')).toBeNull();
  });
  it('still renders a real link when there is a destination', () => {
    render(<AskContextLink href="/dashboard/maintenance">Open task</AskContextLink>);
    expect(screen.getByRole('link', { name: 'Open task' })).toBeTruthy();
  });
});
