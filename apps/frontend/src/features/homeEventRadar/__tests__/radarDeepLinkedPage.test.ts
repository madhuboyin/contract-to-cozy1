import fs from 'node:fs';
import path from 'node:path';

const pageSource = fs.readFileSync(path.resolve(
  process.cwd(),
  'src/app/(dashboard)/dashboard/home-event-radar/HomeEventRadarPageClient.tsx',
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

  // Home Operations Slice 9: this suite previously also asserted that
  // MobileDashboardHome.tsx deep-linked Home to the top canonical radar
  // match. That component was dead code (never rendered — UnifiedHomeSurface
  // replaced it) and has been removed; UnifiedHomeSurface does not carry
  // this capability today. Flagged as a known gap in the Slice 0-8 launch
  // review rather than silently dropped or ported here.
});
