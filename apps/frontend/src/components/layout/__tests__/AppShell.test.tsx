import { render, screen } from '@testing-library/react';
import { AppShell } from '../AppShell';

test('full-window workspaces do not reserve space for a missing application sidebar', () => {
  render(<AppShell leftNav={null}><div>Ask workspace</div></AppShell>);

  const content = screen.getByTestId('app-shell-content');
  expect(content).not.toHaveClass('lg:pl-[64px]');
  expect(content).not.toHaveClass('lg:pl-[246px]');
  expect(screen.getByTestId('app-shell-main')).not.toHaveClass('lg:pt-[72px]');
  expect(screen.getByText('Ask workspace')).toBeInTheDocument();
});

test('a top command bar reserves its fixed desktop height', () => {
  render(<AppShell topBar={<header>Command bar</header>}><div>Dashboard</div></AppShell>);
  expect(screen.getByTestId('app-shell-main')).toHaveClass('lg:pt-[72px]');
});

test('a viewport-locked workspace cannot grow the outer document', () => {
  const { container } = render(<AppShell viewportLocked><div>Ask workspace</div></AppShell>);
  expect(container.firstChild).toHaveClass('h-[100dvh]', 'min-h-0', 'overflow-hidden');
  expect(container.firstChild).not.toHaveClass('min-h-screen');
  expect(screen.getByTestId('app-shell-content')).toHaveClass('min-h-0');
});

test('ordinary dashboard pages retain their expanded and collapsed sidebar offsets', () => {
  const { rerender } = render(<AppShell leftNav={<nav>Product navigation</nav>}><div>Dashboard</div></AppShell>);
  expect(screen.getByTestId('app-shell-content')).toHaveClass('lg:pl-[246px]');

  rerender(<AppShell leftNav={<nav>Product navigation</nav>} sidebarCollapsed><div>Dashboard</div></AppShell>);
  expect(screen.getByTestId('app-shell-content')).toHaveClass('lg:pl-[64px]');
});
