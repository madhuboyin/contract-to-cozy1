import fs from 'node:fs';
import path from 'node:path';

const surfacePath = path.resolve(
  process.cwd(),
  'src/components/home/UnifiedHomeSurface.tsx',
);
const surfaceSource = fs.readFileSync(surfacePath, 'utf8');

describe('Unified Home Radar product-framework placement', () => {
  it('does not render Radar as an unconditional standalone home card', () => {
    expect(surfaceSource).not.toContain('HomeEventRadarSummaryCard');
  });

  it('does not render a parallel refinance portfolio card', () => {
    expect(surfaceSource).not.toContain('RefinanceRadarPortfolioCard');
  });

  it('keeps actionable monitoring in ranked attention and passive discovery in Home Tools', () => {
    expect(surfaceSource).toContain('CriticalWeatherActionCard');
    expect(surfaceSource).toContain('EnvironmentActionCard');
    expect(surfaceSource).toContain('<UnifiedHomeToolsSection');
  });
});
