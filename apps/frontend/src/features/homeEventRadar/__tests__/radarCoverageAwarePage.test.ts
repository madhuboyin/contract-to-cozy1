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
    expect(pageSource).toContain('RADAR_COVERAGE_LABELS[source.status]');
    expect(pageSource).toContain('overview.lastSuccessfulCheckAt');
    expect(pageSource).toContain('isRadarFamilyFilterAvailable');
  });

  it('keeps errors distinct from successful empty monitoring', () => {
    expect(pageSource).toContain('Monitoring status unavailable');
    expect(pageSource).toContain('Unable to load events');
    expect(pageSource).toContain('Event results must not be treated as an all-clear');
  });
});
