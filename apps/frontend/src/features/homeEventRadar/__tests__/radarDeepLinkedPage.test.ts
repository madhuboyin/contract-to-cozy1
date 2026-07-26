import fs from 'node:fs';
import path from 'node:path';

const pageSource = fs.readFileSync(path.resolve(
  process.cwd(),
  'src/app/(dashboard)/dashboard/home-event-radar/HomeEventRadarPageClient.tsx',
), 'utf8');
const unifiedHomeSource = fs.readFileSync(path.resolve(
  process.cwd(),
  'src/app/(dashboard)/dashboard/components/MobileDashboardHome.tsx',
), 'utf8');

describe('Home Event Radar URL-backed page state', () => {
  it('derives timing, family, and match selection from the canonical query contract', () => {
    expect(pageSource).toContain('parseRadarDeepLinkState(searchParams)');
    expect(pageSource).toContain("lifecycle: view === 'all' ? undefined : [view]");
    expect(pageSource).toContain("sourceFamily: filter === 'all' ? undefined : [filter]");
    expect(pageSource).toContain("queryKey: ['radar-event-detail', propertyId, urlState.matchId]");
  });

  it('writes card selection and sheet closure back to browser history', () => {
    expect(pageSource).toContain("updateUrlState({ matchId: item.propertyMatchId }, 'push')");
    expect(pageSource).toContain('updateUrlState({ matchId: null })');
    expect(pageSource).toContain('Linked event unavailable');
    expect(pageSource).toContain('Clear event selection');
  });

  it('links Unified Home to the highest-priority canonical match', () => {
    expect(unifiedHomeSource).toContain('api.getRadarEvents(propertyId');
    expect(unifiedHomeSource).toContain('buildHomeEventRadarHref({');
    expect(unifiedHomeSource).toContain('matchId: topRadarItem.propertyMatchId');
  });
});
