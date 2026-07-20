const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Unified Home derives completeness and version from canonical Property Context', () => {
  const home = read('backend/src/services/homeActions.service.ts');
  const aggregation = read('backend/src/services/aggregationContext/context.ts');
  const frontendTypes = read('frontend/src/types/index.ts');

  assert.match(home, /getAggregationPropertyContext\(propertyId, userId, 'UNIFIED_HOME'\)/);
  assert.match(home, /getContextCompleteness\(propertyContextSnapshot\)/);
  assert.match(home, /contextVersion: contextCompleteness\.contextVersion/);
  assert.doesNotMatch(home, /recordSignals\s*=/);
  assert.match(aggregation, /UNIFIED_HOME: \['CORE', 'LOCATION', 'STRUCTURE', 'SYSTEMS', 'INVENTORY'/);
  assert.match(frontendTypes, /propertyContext:\s*\{\s*contextVersion: string;/);
});

test('Unified Home materializes and conditionally promotes governed personalization', () => {
  const home = read('backend/src/services/homeActions.service.ts');
  const promotion = read('backend/src/services/homeActionSourcePromotion.service.ts');

  assert.match(home, /materializeRecommendationsForProperty\(propertyId, 'HOME_READ', userId\)/);
  assert.match(home, /includePersonalization: Boolean\(personalization && !personalization\.paused\)/);
  assert.match(promotion, /adaptHomeActionSource\('PERSONALIZATION'/);
  assert.match(promotion, /contextVersionFromEvaluation/);
  assert.match(promotion, /governancePolicyVersion !== reviewed\.governance\.policyVersion/);
});
