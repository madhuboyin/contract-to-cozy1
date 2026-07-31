const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '../../../..');
const readRepository = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(repositoryRoot, relativePath));

test('Unified Home promotes meaningful unread change and suppresses passive monitoring cards', () => {
  const card = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/MeaningfulChangeHomeCard.tsx',
  );
  const propertyHome = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/page.tsx',
  );

  assert.match(card, /data\.unreadMaterialCount === 0\) return null/);
  assert.match(card, /Meaningful changes/);
  assert.match(card, /motion-reduce:animate-none/);
  assert.match(card, /focus-visible:ring-2/);
  assert.doesNotMatch(propertyHome, /HomeScoreReportCard|GazetteDashboardCard|NeighborhoodRadarDashboardCard/);
});

test('tool discovery has one Property Intelligence group without duplicate outcome entries', () => {
  const catalog = readRepository('apps/frontend/src/features/tools/ExploreToolsCatalog.tsx');
  const mobileCatalog = readRepository(
    'apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts',
  );

  assert.match(catalog, /PROPERTY_INTELLIGENCE_TOOL_IDS/);
  assert.match(catalog, /title: 'Property Intelligence'/);
  assert.match(catalog, /if \(PROPERTY_INTELLIGENCE_TOOL_IDS\.has\(tool\.id\)\) return false/);
  for (const toolId of [
    'home-briefing',
    'home-timeline',
    'property-brief',
    'home-risk-replay',
    'neighborhood-change-radar',
  ]) {
    assert.match(mobileCatalog, new RegExp(`key: '${toolId}'[\\s\\S]*?group: 'intelligence'`));
  }
});

test('source views share trust, coverage, missing-fact, and journey primitives', () => {
  const primitives = readRepository(
    'apps/frontend/src/components/property-intelligence/PropertyIntelligencePrimitives.tsx',
  );
  const pastHazard = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-risk-replay/HomeRiskReplayClient.tsx',
  );
  const aroundHome = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/neighborhood-change-radar/NeighborhoodChangeRadarClient.tsx',
  );
  const briefing = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-briefing/HomeBriefingClient.tsx',
  );
  const timeline = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/timeline/TimelineClient.tsx',
  );

  for (const component of [
    'TruthStateBadge',
    'DatePrecisionLabel',
    'WhyThisMatters',
    'MissingFactPrompt',
    'SourceCoverageSummary',
    'PropertyIntelligenceJourneyLinks',
  ]) {
    assert.match(primitives, new RegExp(`export function ${component}`));
  }
  assert.match(primitives, /cannot support an all-clear/);
  assert.match(primitives, /focus-visible:ring-2/);
  assert.match(primitives, /motion-reduce:transition-none/);
  for (const sourceView of [pastHazard, aroundHome]) {
    assert.match(sourceView, /MissingFactPrompt/);
    assert.match(sourceView, /SourceCoverageSummary/);
    assert.match(sourceView, /PropertyIntelligenceJourneyLinks/);
  }
  assert.match(briefing, /SourceCoverageSummary/);
  assert.match(briefing, /PropertyIntelligenceJourneyLinks/);
  assert.match(timeline, /TruthStateBadge/);
  assert.match(timeline, /DatePrecisionLabel/);
  assert.match(timeline, /PropertyIntelligenceJourneyLinks/);
});

test('retired homeowner UI is removed while legacy bookmarks remain redirects', () => {
  for (const retiredPath of [
    'apps/frontend/src/app/(dashboard)/dashboard/components/HomeScoreReportCard.tsx',
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/GazetteDashboardCard.tsx',
    'apps/frontend/src/components/ClimateRiskPredictor.tsx',
    'apps/frontend/src/components/features/homeRiskReplay/ReplayDetailSheet.tsx',
    'apps/frontend/src/app/gazette/share/[token]/GazetteShareViewClient.tsx',
    'apps/frontend/src/app/home-score/share/[token]/BuyerReportClient.tsx',
  ]) {
    assert.equal(exists(retiredPath), false, `${retiredPath} should be retired`);
  }

  const legacyScore = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/home-score/page.tsx',
  );
  const legacyGazette = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-gazette/page.tsx',
  );
  assert.match(legacyScore, /redirect\(/);
  assert.match(legacyScore, /property-brief/);
  assert.match(legacyGazette, /redirect\(/);
  assert.match(legacyGazette, /home-briefing/);
});
