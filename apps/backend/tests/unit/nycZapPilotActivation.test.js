const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  readNycZapPilotConfig,
  NYC_ZAP_COUNTY_TO_BOROUGH,
} = require('../../src/propertyIntelligence/pilots/nycZapPilot.ts');

test('reviewed activation requires named review evidence', () => {
  assert.throws(
    () => readNycZapPilotConfig({
      NODE_ENV: 'production',
      NYC_ZAP_PILOT_ENABLED: 'true',
      NYC_ZAP_PILOT_COUNTIES: 'NEW YORK COUNTY',
    }),
    /requires NYC_ZAP_PILOT_REVIEWED_BY/,
  );
});

test('pilot geography is explicit, normalized, deduplicated, and allowlisted', () => {
  const config = readNycZapPilotConfig({
    NODE_ENV: 'production',
    NYC_ZAP_PILOT_ENABLED: 'true',
    NYC_ZAP_PILOT_REVIEWED_BY: 'source-reviewer',
    NYC_ZAP_PILOT_REVIEW_REFERENCE: 'PI-2026-07-30',
    NYC_ZAP_PILOT_COUNTIES: ' new york county,NEW YORK COUNTY ',
  });
  assert.deepEqual(config.counties, ['NEW YORK COUNTY']);
  assert.equal(
    NYC_ZAP_COUNTY_TO_BOROUGH[config.counties[0]],
    'Manhattan',
  );
  assert.throws(
    () => readNycZapPilotConfig({
      NYC_ZAP_PILOT_COUNTIES: 'NASSAU COUNTY',
    }),
    /Unsupported NYC ZAP pilot counties/,
  );
});

test('activation preserves kill switches and records an audited PILOT family gate', () => {
  const source = fs.readFileSync(path.resolve(
    __dirname,
    '../../src/propertyIntelligence/pilots/nycZapPilot.ts',
  ), 'utf8');
  assert.match(source, /NYC_ZAP_PILOT_REVIEW_BLOCKED/);
  assert.match(source, /IntelligenceSourceReviewStatus\.REJECTED/);
  assert.match(source, /PLANNING_PILOT_PAUSED/);
  assert.match(source, /stage: 'PILOT'/);
  assert.match(source, /PROPERTY_INTELLIGENCE_PILOT_ACTIVATE/);
  assert.match(source, /geographyType: 'COUNTY'/);
  assert.match(source, /does not establish distance/i);
});
