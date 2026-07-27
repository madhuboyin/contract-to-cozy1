import fs from 'node:fs';
import path from 'node:path';

const pagePath = path.resolve(
  process.cwd(),
  'src/app/(dashboard)/dashboard/home-event-radar/HomeEventRadarPageClient.tsx',
);
const pageSource = fs.readFileSync(pagePath, 'utf8');

describe('Home Event Radar coverage-aware page contract', () => {
  it('loads canonical overview and cursor-backed events', () => {
    expect(pageSource).toContain('api.getRadarOverview(propertyId)');
    expect(pageSource).toContain('api.getRadarEvents(propertyId');
    expect(pageSource).toContain('useInfiniteQuery');
    expect(pageSource).toContain('fetchNextPage');
    expect(pageSource).not.toContain('api.getRadarFeed(');
  });

  it('renders materialized monitoring and category coverage', () => {
    expect(pageSource).toContain('RADAR_MONITORING_PRESENTATION[overview.monitoringState]');
    expect(pageSource).toContain('What Radar watches');
    expect(pageSource).toContain('Watching now');
    expect(pageSource).toContain('overview.lastSuccessfulCheckAt');
    expect(pageSource).toContain('isRadarFamilyFilterAvailable');
  });

  it('keeps errors distinct from successful empty monitoring', () => {
    expect(pageSource).toContain('Monitoring status unavailable');
    expect(pageSource).toContain('Unable to load events');
    expect(pageSource).toContain('Event results must not be treated as an all-clear');
  });

  it('uses benefit-led, automatically refreshing initialization UX', () => {
    expect(pageSource).toContain('Know what could affect your home before it becomes a problem.');
    expect(pageSource).toContain('This page updates automatically.');
    expect(pageSource).toContain("query.state.data?.readiness?.state === 'MONITORING_NOT_INITIALIZED'");
    expect(pageSource).not.toContain('Check again');
    expect(pageSource).not.toContain('source-coverage evaluation');
  });
});
