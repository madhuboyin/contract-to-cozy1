import fs from 'node:fs';
import path from 'node:path';

const pageSource = fs.readFileSync(path.resolve(
  process.cwd(),
  'src/app/(dashboard)/dashboard/home-event-radar/HomeEventRadarPageClient.tsx',
), 'utf8');

const unifiedHomeSurfaceSource = fs.readFileSync(path.resolve(
  process.cwd(),
  'src/components/home/UnifiedHomeSurface.tsx',
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

  // Home Operations Item #13: this suite previously flagged that
  // MobileDashboardHome.tsx (deleted, Slice 9) was the last place Home
  // deep-linked to the top canonical radar match, and that its replacement
  // UnifiedHomeSurface never carried the capability forward. Ported as
  // HomeEventRadarTopMatchCard — asserted here the same way the rest of
  // this suite asserts page-source behavior, since there's no broader
  // frontend component-test infra for UnifiedHomeSurface.tsx today.
  it('Home deep-links to the top canonical radar match via UnifiedHomeSurface', () => {
    expect(unifiedHomeSurfaceSource).toContain('function HomeEventRadarTopMatchCard');
    expect(unifiedHomeSurfaceSource).toContain('buildHomeEventRadarHref({');
    expect(unifiedHomeSurfaceSource).toContain('view: topItem.matchLifecycleStatus');
    expect(unifiedHomeSurfaceSource).toContain('matchId: topItem.propertyMatchId');
    expect(unifiedHomeSurfaceSource).toContain('<HomeEventRadarTopMatchCard propertyId={propertyId} />');
  });
});
