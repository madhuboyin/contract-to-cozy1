import { createDashboardLoadCoordinator } from '../dashboardLoadCoordinator';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('dashboard load coordinator', () => {
  it('starts only one automatic load for a stable user and property key', () => {
    const coordinator = createDashboardLoadCoordinator();

    const first = coordinator.begin('user-1:property-1');

    expect(first).not.toBeNull();
    expect(coordinator.begin('user-1:property-1')).toBeNull();
    expect(first && coordinator.isCurrent(first)).toBe(true);
  });

  it('invalidates a stale load when the selected property changes', () => {
    const coordinator = createDashboardLoadCoordinator();
    const first = coordinator.begin('user-1:property-1');
    const second = coordinator.begin('user-1:property-2');

    expect(first && coordinator.isCurrent(first)).toBe(false);
    expect(second && coordinator.isCurrent(second)).toBe(true);
  });

  it('allows an explicit retry while preventing the earlier response from committing', () => {
    const coordinator = createDashboardLoadCoordinator();
    const first = coordinator.begin('user-1:property-1');
    const retry = coordinator.begin('user-1:property-1', { force: true });

    expect(retry).not.toBeNull();
    expect(first && coordinator.isCurrent(first)).toBe(false);
    expect(retry && coordinator.isCurrent(retry)).toBe(true);
    expect(coordinator.begin('user-1:property-1')).toBeNull();
  });

  it('keeps the root dashboard wired to stable identity keys and forced retries', () => {
    const dashboardSource = readFileSync(resolve(__dirname, '../page.tsx'), 'utf8');

    expect(dashboardSource).toContain("const userId = user?.id ?? null;");
    expect(dashboardSource).toContain('}, [userId, selectedPropertyId]);');
    expect(dashboardSource).not.toContain('}, [user, selectedPropertyId]);');
    expect(dashboardSource).toContain('fetchDashboardData({ force: true })');
  });
});
