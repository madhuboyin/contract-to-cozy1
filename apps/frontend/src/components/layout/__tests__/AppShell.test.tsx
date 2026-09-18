import { render, screen } from '@testing-library/react';
import { AppShell } from '../AppShell';

test('full-window workspaces do not reserve space for a missing application sidebar', () => {
  render(<AppShell leftNav={null}><div>Ask workspace</div></AppShell>);

  const content = screen.getByTestId('app-shell-content');
  expect(content).not.toHaveClass('lg:pl-[64px]');
  expect(content).not.toHaveClass('lg:pl-[246px]');
  expect(screen.getByText('Ask workspace')).toBeInTheDocument();
});

test('ordinary dashboard pages retain their expanded and collapsed sidebar offsets', () => {
  const { rerender } = render(<AppShell leftNav={<nav>Product navigation</nav>}><div>Dashboard</div></AppShell>);
  expect(screen.getByTestId('app-shell-content')).toHaveClass('lg:pl-[246px]');

  rerender(<AppShell leftNav={<nav>Product navigation</nav>} sidebarCollapsed><div>Dashboard</div></AppShell>);
  expect(screen.getByTestId('app-shell-content')).toHaveClass('lg:pl-[64px]');
});
